import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { pinRecoveryConfiguration } from '../../../config/pinRecovery.js';
import { PinServiceError } from './pin.service.js';
import { safeLogger } from '../../../shared/safeLogger.js';

const hash = value => createHash('sha256').update(value).digest();
const invalid = () => new PinServiceError('PIN_RECOVERY_INVALID');
const STATE = /^[\w-]{43}$/;

// Navigation bridge only: it restores the original web session, never authorizes a PIN change.
// Tokens are held in volatile memory for at most ten minutes, never in a browser store or DB.
export class PinRecoveryNavigationService {
    constructor({ env = process.env, now = () => Date.now(), fetchImpl = fetch, resolveKey, logger = safeLogger } = {}) {
        Object.assign(this, { env, now, fetchImpl, resolveKey, logger });
        this.entries = new Map(); this.keys = new Map();
        this.timer = setInterval(() => this.purge(), 30_000); this.timer.unref?.();
    }
    dispose() { clearInterval(this.timer); this.entries.clear(); }
    purge() {
        for (const [key, entry] of this.entries) if (entry.expiresAt <= this.now()) this.entries.delete(key);
    }
    cookieName(state) {
        if (typeof state !== 'string' || !STATE.test(state)) throw invalid();
        return 'itecsa_pin_resume_' + hash(state).toString('hex').slice(0, 24);
    }
    cookieOptions() {
        return { httpOnly: true, secure: this.env.APP_ENV === 'production' || this.env.FRONTEND_ORIGIN?.startsWith('https:'),
            sameSite: 'strict', path: '/api/auth/pin/recovery' };
    }
    assertOrigin(req) {
        if (!this.env.FRONTEND_ORIGIN || req.get('Origin') !== this.env.FRONTEND_ORIGIN) throw invalid();
    }
    hold(actor, state, refreshToken, res) {
        this.purge();
        if (!actor?.sub || !actor?.sid || typeof refreshToken !== 'string' || !refreshToken || refreshToken.length > 20000 ||
            this.entries.size >= 1000) throw invalid();
        const name = this.cookieName(state), secret = randomBytes(32).toString('base64url');
        this.entries.set(name, { sub: actor.sub, sid: actor.sid, secretHash: hash(secret), refreshToken, expiresAt: this.now() + 600_000 });
        // Session cookie (no Expires/Max-Age); server-side TTL and atomic consumption are authoritative.
        res.cookie(name, secret, this.cookieOptions());
    }
    discard(actor, state, res) {
        const name = this.cookieName(state), entry = this.entries.get(name);
        if (entry && (entry.sub !== actor.sub || entry.sid !== actor.sid)) throw invalid();
        this.entries.delete(name);
        res.clearCookie(name, this.cookieOptions());
    }
    async resume(req, res) {
        this.assertOrigin(req);
        if (Object.keys(req.body ?? {}).some(key => key !== 'state')) throw invalid();
        this.purge();
        const name = this.cookieName(req.body?.state), entry = this.entries.get(name);
        const cookie = String(req.headers.cookie ?? '').split(';').map(part => part.trim())
            .find(part => part.startsWith(name + '='))?.slice(name.length + 1);
        if (!entry || !cookie || cookie.length > 100 || !timingSafeEqual(hash(cookie), entry.secretHash)) throw invalid();
        // Consume synchronously before contacting Keycloak: parallel resumptions cannot restore twice.
        this.entries.delete(name);
        res.clearCookie(name, this.cookieOptions());
        try {
            const config = pinRecoveryConfiguration(this.env);
            const response = await this.fetchImpl(config.tokenEndpoint, {
                method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ grant_type: 'refresh_token', client_id: this.env.KEYCLOAK_CLIENT_ID,
                    refresh_token: entry.refreshToken }),
            });
            if (!response.ok) throw invalid();
            const tokens = await response.json();
            if (typeof tokens.access_token !== 'string' || typeof tokens.refresh_token !== 'string') throw invalid();
            let key = this.resolveKey;
            if (!key) {
                if (!this.keys.has(config.jwksUri)) this.keys.set(config.jwksUri, createRemoteJWKSet(new URL(config.jwksUri), { timeoutDuration: 5000 }));
                key = this.keys.get(config.jwksUri);
            }
            const { payload } = await jwtVerify(tokens.access_token, key, { issuer: config.issuer, audience: config.audience,
                algorithms: ['RS256'], requiredClaims: ['sub', 'sid', 'azp', 'exp'], currentDate: new Date(this.now()) });
            if (payload.sub !== entry.sub || payload.sid !== entry.sid || payload.azp !== this.env.KEYCLOAK_CLIENT_ID || payload.typ !== 'Bearer') throw invalid();
            if (tokens.id_token !== undefined) {
                const { payload: identity } = await jwtVerify(tokens.id_token, key, { issuer: config.issuer,
                    audience: this.env.KEYCLOAK_CLIENT_ID, algorithms: ['RS256'], requiredClaims: ['sub', 'exp'], currentDate: new Date(this.now()) });
                if (identity.sub !== entry.sub || (identity.sid && identity.sid !== entry.sid)) throw invalid();
            }
            this.logger.info('pin_recovery.session_resumed', { actorId: entry.sub, outcome: 'success' });
            return { token: tokens.access_token, refreshToken: tokens.refresh_token,
                ...(tokens.id_token ? { idToken: tokens.id_token } : {}), subject: entry.sub, sid: entry.sid };
        } catch {
            this.logger.info('pin_recovery.session_resumed', { actorId: entry.sub, outcome: 'denied' });
            throw invalid();
        }
    }
}

export default new PinRecoveryNavigationService();

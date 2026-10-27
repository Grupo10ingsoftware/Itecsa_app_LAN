import { createHash, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { pinRecoveryConfiguration } from '../../../config/pinRecovery.js';
import { PinServiceError } from './pin.service.js';
import { safeLogger } from '../../../shared/safeLogger.js';

const TTL_MS = 5 * 60_000;
const random = () => randomBytes(32).toString('base64url');
const digest = value => createHash('sha256').update(value).digest('hex');
const invalid = () => new PinServiceError('PIN_RECOVERY_INVALID');

// One process owns an operation. Unknown operations fail closed on other replicas or after restart.
// No browser claims, tokens or durable DB schema are used as recovery authorization.
export class PinRecoveryService {
    constructor({ env = process.env, fetchImpl = fetch, now = () => Date.now(), logger = safeLogger,
        resolveKey, maxEntries = 1000 } = {}) {
        Object.assign(this, { env, fetchImpl, now, logger, resolveKey, maxEntries });
        this.operations = new Map();
        this.keys = new Map();
        this.timer = setInterval(() => this.purge(), 30_000);
        this.timer.unref?.();
    }
    dispose() { clearInterval(this.timer); this.operations.clear(); }
    audit(action, actor, outcome) {
        this.logger.info('pin_recovery', { action, actorId: actor?.sub, outcome });
    }
    purge() {
        for (const [key, operation] of this.operations) {
            if (operation.expiresAt <= this.now() && operation.status !== 'committing') {
                operation.status = 'expired';
                this.operations.delete(key);
                this.audit('expired', { sub: operation.sub }, 'denied');
            }
        }
    }
    session(actor) {
        if (typeof actor?.sub !== 'string' || !actor.sub || typeof actor?.sid !== 'string' || !actor.sid) throw invalid();
        return digest(actor.sid);
    }
    start(actor) {
        const session = this.session(actor);
        let config;
        try { config = pinRecoveryConfiguration(this.env); }
        catch { throw new PinServiceError('PIN_RECOVERY_UNAVAILABLE'); }
        this.purge();
        for (const [key, operation] of this.operations) {
            if (operation.sub === actor.sub) {
                if (operation.status === 'committing') throw invalid();
                operation.status = 'cancelled';
                this.operations.delete(key);
            }
        }
        if (this.operations.size >= this.maxEntries) throw new PinServiceError('PIN_RECOVERY_UNAVAILABLE');
        const state = random(), nonce = random(), verifier = random();
        const startedAt = this.now();
        const operation = { sub: actor.sub, session, nonce, verifier, startedAt,
            expiresAt: startedAt + TTL_MS, status: 'pending', config };
        this.operations.set(digest(state), operation);
        const url = new URL(config.authorizationEndpoint);
        url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri,
            response_type: 'code', response_mode: 'query', scope: 'openid', prompt: 'login', max_age: '0',
            state, nonce, code_challenge_method: 'S256',
            code_challenge: createHash('sha256').update(verifier).digest('base64url'),
            claims: JSON.stringify({ id_token: { auth_time: { essential: true } } }), ui_locales: 'es' }).toString();
        this.audit('started', actor, 'success');
        return { state, authorizationUrl: url.href, expiresInSeconds: TTL_MS / 1000 };
    }
    operation(actor, state) {
        const session = this.session(actor);
        this.purge();
        if (typeof state !== 'string' || !/^[\w-]{43}$/.test(state)) throw invalid();
        const operation = this.operations.get(digest(state));
        if (!operation || operation.sub !== actor.sub || operation.session !== session) throw invalid();
        return operation;
    }
    cancel(actor, state) {
        const operation = this.operation(actor, state);
        if (operation.status === 'committing') throw invalid();
        operation.status = 'cancelled';
        this.operations.delete(digest(state));
        this.audit('cancelled', actor, 'success');
    }
    async finish(actor, input, pins) {
        let operation, claimed = false;
        try {
            operation = this.operation(actor, input?.state);
            if (operation.status !== 'pending') throw invalid();
            // Claim synchronously, before any I/O. Concurrent requests cannot consume it twice.
            operation.status = 'verifying';
            claimed = true;
            const assertAuthorized = () => {
                if (!['verifying', 'committing'].includes(operation.status) || operation.expiresAt <= this.now()) throw invalid();
            };
            if (input.error || typeof input.code !== 'string' || !input.code || input.code.length > 4096) throw invalid();
            const { config } = operation;
            const response = await this.fetchImpl(config.tokenEndpoint, {
                method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ grant_type: 'authorization_code', client_id: config.clientId,
                    redirect_uri: config.redirectUri, code: input.code, code_verifier: operation.verifier }),
            });
            if (!response.ok) throw invalid();
            const tokens = await response.json();
            if (typeof tokens.id_token !== 'string') throw invalid();
            let key = this.resolveKey;
            if (!key) {
                if (!this.keys.has(config.jwksUri)) this.keys.set(config.jwksUri,
                    createRemoteJWKSet(new URL(config.jwksUri), { timeoutDuration: 5000 }));
                key = this.keys.get(config.jwksUri);
            }
            const { payload } = await jwtVerify(tokens.id_token, key, {
                algorithms: ['RS256'], issuer: config.issuer, audience: config.clientId,
                requiredClaims: ['sub', 'exp', 'iat', 'nonce', 'auth_time', 'azp'],
                currentDate: new Date(this.now()), clockTolerance: 5,
            });
            const nowSeconds = Math.floor(this.now() / 1000);
            if (payload.sub !== operation.sub || payload.azp !== config.clientId || payload.nonce !== operation.nonce ||
                !Number.isSafeInteger(payload.auth_time) || payload.auth_time < Math.floor(operation.startedAt / 1000) ||
                payload.auth_time > nowSeconds + 5 || nowSeconds - payload.auth_time > 180 ||
                !Number.isSafeInteger(payload.iat) || payload.iat < Math.floor(operation.startedAt / 1000) || payload.iat > nowSeconds + 5) throw invalid();
            assertAuthorized();
            // Guard again under the user's DB row lock, after expensive PIN hashing.
            const pinStatus = await pins.rotateAfterRecovery(operation.sub, () => {
                assertAuthorized();
                operation.status = 'committing';
            });
            operation.status = 'completed';
            this.audit('completed', actor, 'success');
            return { pinStatus };
        } catch {
            this.audit('verification', actor, 'denied');
            throw invalid();
        } finally {
            // A competing replay must not delete or cancel the first request's claimed operation.
            if (claimed) {
                operation.status = 'consumed';
                this.operations.delete(digest(input.state));
            }
        }
    }
}

export default new PinRecoveryService();

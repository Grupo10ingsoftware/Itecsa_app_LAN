import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { generateKeyPair, SignJWT } from 'jose';
import { PinRecoveryService } from './pinRecovery.service.js';
import { PinService } from './pin.service.js';
import { PinRecoveryNavigationService } from './pinRecoveryNavigation.service.js';
import { createPinRecoveryHandler } from '../controller/auth.controller.js';
import { MemoryThrottleService } from '../../security/service/securityThrottle.service.js';
import { createPinRecoveryRateLimit } from '../../../middlewares/rateLimit.js';
import { createSafeLogger } from '../../../shared/safeLogger.js';
import { createAuthRouter } from '../routes/auth.routes.js';
import express from 'express';
import { ROLES_CLAIM, ROLES, PERMISSIONS } from '../../../../../shared/keycloakAuthorization.js';

const { privateKey, publicKey } = await generateKeyPair('RS256');
const otherKey = await generateKeyPair('RS256');
const env = { KEYCLOAK_ISSUER: 'https://identity.example/realms/app', KEYCLOAK_JWKS_URI: 'https://identity.example/certs',
    KEYCLOAK_AUDIENCE: 'api', KEYCLOAK_CLIENT_ID: 'web', KEYCLOAK_ROLE_CLIENT_ID: 'roles',
    FRONTEND_ORIGIN: 'http://127.0.0.1:5173', KEYCLOAK_PIN_RECOVERY_CLIENT_ID: 'itecsa-pin-recovery',
    KEYCLOAK_PIN_RECOVERY_REDIRECT_URI: 'http://127.0.0.1:5173/auth/pin-recovery/callback' };
const actor = { sub: 'same-user', sid: 'original-session' };
const rejected = { code: 'PIN_RECOVERY_INVALID' };

function fixture(t, { claims = {}, key = privateKey, fetchFailure, beforeResponse, pins } = {}) {
    let time = Date.now(), updates = 0, flow;
    const logs = [], requests = [];
    const service = new PinRecoveryService({ env, now: () => time, resolveKey: publicKey,
        logger: createSafeLogger({ sink: { info: entry => logs.push(entry) } }),
        fetchImpl: async (url, options) => {
            requests.push({ url, options });
            if (beforeResponse) await beforeResponse();
            if (fetchFailure) return { ok: false };
            const seconds = Math.floor(time / 1000);
            const payload = { sub: actor.sub, iss: env.KEYCLOAK_ISSUER, aud: env.KEYCLOAK_PIN_RECOVERY_CLIENT_ID,
                azp: env.KEYCLOAK_PIN_RECOVERY_CLIENT_ID, iat: seconds, exp: seconds + 60,
                auth_time: seconds, nonce: flow.url.searchParams.get('nonce'), ...claims };
            for (const name of Object.keys(payload)) if (payload[name] === undefined) delete payload[name];
            const id_token = await new SignJWT(payload).setProtectedHeader({ alg: 'RS256' }).sign(key);
            return { ok: true, json: async () => ({ id_token, access_token: 'private-access-token' }) };
        },
    });
    t.after(() => service.dispose());
    const started = service.start(actor);
    flow = { ...started, url: new URL(started.authorizationUrl) };
    const pinService = pins ?? { rotateAfterRecovery: async (sub, authorize) => {
        assert.equal(sub, actor.sub); authorize(); updates++; return 'pending_acknowledgement';
    } };
    return { service, flow, requests, logs, advance: ms => { time += ms }, updates: () => updates,
        finish: (input = {}, identity = actor) => service.finish(identity, { state: flow.state, code: 'one-use-code', ...input }, pinService) };
}

test('forced login, nonce, max_age=0 and server-held PKCE S256', async t => {
    const f = fixture(t);
    for (const [name, value] of Object.entries({ prompt: 'login', max_age: '0', code_challenge_method: 'S256',
        response_type: 'code', response_mode: 'query', client_id: 'itecsa-pin-recovery' })) assert.equal(f.flow.url.searchParams.get(name), value);
    assert.deepEqual(JSON.parse(f.flow.url.searchParams.get('claims')), { id_token: { auth_time: { essential: true } } });
    assert.deepEqual(await f.finish(), { pinStatus: 'pending_acknowledgement' });
    const body = f.requests[0].options.body;
    assert.equal(body.get('grant_type'), 'authorization_code');
    assert.equal(body.get('client_secret'), null);
    assert.equal(body.get('password'), null);
    assert.equal(createHash('sha256').update(body.get('code_verifier')).digest('base64url'), f.flow.url.searchParams.get('code_challenge'));
    assert.equal(f.updates(), 1);
});

for (const [name, options] of Object.entries({
    'another account': { claims: { sub: 'other' } },
    'nonce manipulation': { claims: { nonce: 'forged' } },
    'missing nonce': { claims: { nonce: undefined } },
    'wrong audience': { claims: { aud: 'web' } },
    'wrong issuer': { claims: { iss: 'https://attacker.invalid' } },
    'wrong authorized party': { claims: { azp: 'web' } },
    'expired token': { claims: { exp: 1 } },
    'invalid signature': { key: otherKey.privateKey },
    'missing auth_time': { claims: { auth_time: undefined } },
    'SSO without new authentication': { claims: { auth_time: 1 } },
    'future authentication': { claims: { auth_time: 9999999999 } },
    'provider rejects code': { fetchFailure: true },
})) {
    test(`rejects ${name} and consumes failed operation`, async t => {
        const f = fixture(t, options);
        await assert.rejects(f.finish(), rejected);
        await assert.rejects(f.finish(), rejected);
        assert.equal(f.updates(), 0);
        assert.equal(f.requests.length, 1);
    });
}
test('wrong password stays in Keycloak: no callback and no PIN update', t => {
    const f = fixture(t);
    assert.equal(f.updates(), 0);
    assert.equal(f.requests.length, 0);
    f.advance(300001); f.service.purge();
    assert.equal(f.service.operations.size, 0);
});
test('state manipulation, changing session and changing actor fail before token exchange', async t => {
    const f = fixture(t);
    await assert.rejects(f.finish({ state: 'x'.repeat(43) }), rejected);
    await assert.rejects(f.finish({}, { ...actor, sub: 'other' }), rejected);
    await assert.rejects(f.finish({}, { ...actor, sid: 'other-session' }), rejected);
    assert.equal(f.requests.length, 0);
    assert.equal(f.updates(), 0);
});
test('cancellation, OIDC cancellation and expiration cannot rotate', async t => {
    const a = fixture(t); a.service.cancel(actor, a.flow.state);
    await assert.rejects(a.finish(), rejected);
    const b = fixture(t); await assert.rejects(b.finish({ error: 'access_denied', code: undefined }), rejected);
    const c = fixture(t); c.advance(300001); await assert.rejects(c.finish(), rejected);
    for (const f of [a, b, c]) { assert.equal(f.updates(), 0); assert.equal(f.requests.length, 0); }
});
test('replay and simultaneous callbacks only rotate once', async t => {
    const f = fixture(t);
    const results = await Promise.allSettled([f.finish(), f.finish()]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    await assert.rejects(f.finish(), rejected);
    assert.equal(f.updates(), 1);
    assert.equal(f.requests.length, 1);
});
test('cancellation or expiration during exchange prevents rotation', async t => {
    for (const cancel of [true, false]) {
        let release;
        const wait = new Promise(resolve => { release = resolve });
        const f = fixture(t, { beforeResponse: () => wait });
        const result = f.finish();
        if (cancel) f.service.cancel(actor, f.flow.state); else f.advance(300001);
        release();
        await assert.rejects(result, rejected);
        assert.equal(f.updates(), 0);
    }
});
test('new operation invalidates previous one and restart loses authorization', async t => {
    const f = fixture(t);
    f.service.start(actor);
    await assert.rejects(f.finish(), rejected);
    f.service.dispose();
    await assert.rejects(f.finish(), rejected);
});
test('audit excludes codes, state, PKCE and tokens', async t => {
    const f = fixture(t); await f.finish();
    const logs = JSON.stringify(f.logs);
    for (const secret of [f.flow.state, 'one-use-code', 'private-access-token', f.flow.url.searchParams.get('nonce'),
        f.requests[0].options.body.get('code_verifier')]) assert.ok(!logs.includes(secret));
    assert.ok(logs.includes('completed'));
});
test('controller refuses passwords, target accounts and unverified client claims', async () => {
    const handler = createPinRecoveryHandler({ action: 'finish', recovery: { finish: () => assert.fail() } });
    for (const body of [{ password: 'secret' }, { sub: 'other' }, { auth_time: Date.now() }, { id_token: 'forged' }]) {
        const res = { set() {}, status(value) { this.code = value; return this }, json() {} };
        await handler({ body, auth: { payload: actor } }, res);
        assert.equal(res.code, 400);
    }
});
test('rate limits bind authenticated account and IP', async () => {
    const rules = [];
    const middleware = createPinRecoveryRateLimit({ throttle: { consume: async rule => rules.push(rule) } });
    await middleware({ ip: '127.0.0.1', auth: { payload: actor }, body: { sub: 'other' } }, {}, () => {});
    assert.equal(rules[1].subject, actor.sub);
    assert.equal(rules[1].limit, 5);
});
test('recovered PIN requires acknowledgement, works afterward and rejects old PIN', async t => {
    let user = { id_usuario: 1, estado_usuario: 'Activo' };
    const tx = { usuario: { update: async ({ data }) => { user = { ...user, ...data }; } } };
    const pins = new PinService({ secret: Buffer.alloc(32, 1).toString('base64'),
        prisma: { $transaction: fn => fn(tx), usuario: tx.usuario } });
    pins.findUser = async () => user;
    pins.findUserForUpdate = async () => user;
    const old = await pins.buildCredential();
    user = { ...user, ...old.data, pin_accepted_at: new Date() };
    const f = fixture(t, { pins }); await f.finish();
    const pin = await pins.reveal(actor.sub);
    assert.notEqual(pin, old.pin);
    await assert.rejects(pins.validate(actor.sub, pin), { code: 'PIN_NOT_ACKNOWLEDGED' });
    await pins.acknowledge(actor.sub);
    assert.equal(user.pin_pending_ciphertext, null);
    assert.equal((await pins.validate(actor.sub, pin)).idUsuario, 1);
    await assert.rejects(pins.validate(actor.sub, old.pin), { code: 'PIN_INVALID' });
    assert.ok(!JSON.stringify(f.logs).includes(pin));
});

test('HTTP endpoints require original session and permission; removed password endpoint is absent', async t => {
    const f = fixture(t);
    const app = express(); app.use(express.json());
    const navigation = new PinRecoveryNavigationService({ env });
    t.after(() => navigation.dispose());
    app.use('/auth', createAuthRouter({ recovery: f.service,
        navigation,
        authenticate(req, res, next) {
            if (!req.headers.authorization) return res.status(401).end();
            req.identityProvider = 'keycloak';
            req.auth = { payload: { ...actor, [ROLES_CLAIM]: [ROLES.SOPORTE],
                permissions: req.headers.authorization === 'allowed' ? [PERMISSIONS.MANAGE_PIN] : [] } };
            next();
        }, pinRecoveryRateLimit: (_req, _res, next) => next(),
    }));
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
    const post = (path, authorization, body = {}) => fetch(`http://127.0.0.1:${server.address().port}/auth${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Origin: env.FRONTEND_ORIGIN,
            ...(authorization ? { authorization } : {}) }, body: JSON.stringify(body),
    });
    assert.equal((await post('/pin/recovery/start')).status, 401);
    assert.equal((await post('/pin/recovery/start', 'denied')).status, 403);
    const started = await post('/pin/recovery/start', 'allowed', { refreshToken: 'original-refresh-token' });
    assert.equal(started.status, 200);
    assert.equal(started.headers.get('cache-control'), 'no-store');
    const operation = await started.json();
    assert.equal((await post('/pin/recovery/cancel', 'allowed', { state: operation.state })).status, 204);
    assert.equal((await post('/pin/recovery/finish', 'allowed', { state: operation.state, code: 'code' })).status, 403);
    assert.equal((await post('/pin/recover', 'allowed', { username: 'u', password: 'secret' })).status, 404);
});

test('cancellation under PIN-generation delay is checked again at commit boundary', async t => {
    let entered, release;
    const started = new Promise(r => { entered = r });
    const pause = new Promise(r => { release = r });
    let writes = 0;
    const f = fixture(t, { pins: { rotateAfterRecovery: async (_sub, authorize) => {
        entered(); await pause; authorize(); writes++;
    } } });
    const result = f.finish(); await started;
    f.service.cancel(actor, f.flow.state); release();
    await assert.rejects(result, rejected);
    assert.equal(writes, 0);
});

for (const failure of ['hash', 'sql']) {
    test(`OPT08: ${failure} failure leaves prior credential and consumes recovery without success`, async t => {
        let user = { id_usuario: 1, estado_usuario: 'Activo', pin_hash: null, pin_salt: null };
        const original = { ...user }; let updates = 0;
        const pins = new PinService({ secret: Buffer.alloc(32, 4).toString('base64'), prisma: {
            $transaction: async fn => {
                const snapshot = { ...user };
                try { return await fn({ usuario: { update: async ({ data }) => {
                    updates++; user = { ...user, ...data }; throw Error('Synthetic SQL failure');
                } } }); } catch (error) { user = snapshot; throw error; }
            },
        } });
        pins.findUser = async () => user;
        pins.findUserForUpdate = async () => user;
        if (failure === 'hash') pins.buildCredential = async () => { throw Error('Synthetic hash failure'); };
        const f = fixture(t, { pins });
        await assert.rejects(f.finish(), rejected);
        assert.deepEqual(user, original); assert.equal(updates, failure === 'hash' ? 0 : 1);
        await assert.rejects(f.finish(), rejected);
        assert(!JSON.stringify(f.logs).includes('completed'));
    });
}

test('OPT08: finish waits for transaction commit; cancellation/replay cannot replace an in-progress commit', async t => {
    let enterCommit, releaseCommit;
    const entered = new Promise(r => { enterCommit = r });
    const commit = new Promise(r => { releaseCommit = r });
    let user = { id_usuario: 1, estado_usuario: 'Activo', pin_hash: null, pin_salt: null }, writes = 0;
    const pins = new PinService({ secret: Buffer.alloc(32, 5).toString('base64'), prisma: {
        $transaction: async fn => {
            let staged;
            const result = await fn({ usuario: { update: async ({ data }) => { staged = data; writes++; } } });
            enterCommit(); await commit; user = { ...user, ...staged }; return result;
        },
    } });
    pins.findUser = async () => user;
    pins.findUserForUpdate = async () => user;
    const f = fixture(t, { pins }); let settled = false;
    const result = f.finish().then(value => { settled = true; return value; });
    await entered;
    assert.equal(settled, false); assert.equal(user.pin_hash, null);
    assert.throws(() => f.service.cancel(actor, f.flow.state), rejected);
    await assert.rejects(f.finish(), rejected); assert.equal(writes, 1);
    releaseCommit(); assert.deepEqual(await result, { pinStatus: 'pending_acknowledgement' });
    assert(user.pin_hash.startsWith('scrypt$v2$N=32768,r=8,p=3$')); assert.equal(user.pin_accepted_at, null);
});

test('five complete recovery attempts fit the quota; the sixth start and finish remain blocked', async () => {
    const middleware = createPinRecoveryRateLimit({ throttle: new MemoryThrottleService() });
    async function attempt(action) {
        let allowed = false;
        const res = { set() {}, status(code) { this.code = code; return this; }, json(payload) { this.payload = payload; } };
        await middleware({ path: '/pin/recovery/' + action, ip: '127.0.0.1', auth: { payload: actor } }, res,
            () => { allowed = true; });
        return { allowed, res };
    }
    for (let count = 0; count < 5; count++) {
        assert.equal((await attempt('start')).allowed, true);
        assert.equal((await attempt('finish')).allowed, true);
    }
    for (const action of ['start', 'finish']) {
        const { allowed, res } = await attempt(action);
        assert.equal(allowed, false);
        assert.equal(res.code, 429);
        assert.ok(res.payload.retryAfterSeconds > 0);
    }
});

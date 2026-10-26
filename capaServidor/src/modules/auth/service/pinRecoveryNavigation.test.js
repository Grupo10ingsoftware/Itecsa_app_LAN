import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, SignJWT } from 'jose';
import { PinRecoveryNavigationService } from './pinRecoveryNavigation.service.js';

const { privateKey, publicKey } = await generateKeyPair('RS256');
const wrongKey = await generateKeyPair('RS256');
const actor = { sub: 'original-account', sid: 'original-session' }, state = 's'.repeat(43);
const env = { FRONTEND_ORIGIN: 'http://127.0.0.1:5173', KEYCLOAK_ISSUER: 'https://id.local/realms/itecsa',
    KEYCLOAK_JWKS_URI: 'https://id.local/certs', KEYCLOAK_CLIENT_ID: 'itecsa-web', KEYCLOAK_ROLE_CLIENT_ID: 'roles',
    KEYCLOAK_AUDIENCE: 'api', KEYCLOAK_PIN_RECOVERY_REDIRECT_URI: 'http://127.0.0.1:5173/auth/pin-recovery/callback' };
function fixture(t, claims = {}, key = privateKey) {
    let now = Date.now();
    const cookies = [], logs = [], requests = [];
    const service = new PinRecoveryNavigationService({ env, now: () => now, resolveKey: publicKey,
        logger: { info: (...args) => logs.push(args) }, fetchImpl: async (url, options) => {
            requests.push({ url, options });
            const token = await new SignJWT({ ...actor, iss: env.KEYCLOAK_ISSUER, aud: 'api', azp: 'itecsa-web',
                typ: 'Bearer', exp: Math.floor(now / 1000) + 60, ...claims }).setProtectedHeader({ alg: 'RS256' }).sign(key);
            return { ok: true, json: async () => ({ access_token: token, refresh_token: 'renewed-original-refresh' }) };
        } });
    t.after(() => service.dispose());
    const res = { cookie: (name, value, options) => cookies.push({ name, value, options }), clearCookie() {} };
    service.hold(actor, state, 'original-refresh', res);
    const req = { body: { state }, get: () => env.FRONTEND_ORIGIN,
        headers: { cookie: cookies[0].name + '=' + cookies[0].value } };
    return { service, req, res, cookies, logs, requests, advance: ms => { now += ms } };
}
test('restores only original web-client session through a single-use HttpOnly session cookie', async t => {
    const f = fixture(t), result = await f.service.resume(f.req, f.res);
    assert.equal(result.subject, actor.sub); assert.equal(result.sid, actor.sid);
    assert.equal(result.refreshToken, 'renewed-original-refresh');
    assert.equal(f.cookies[0].options.httpOnly, true); assert.equal(f.cookies[0].options.sameSite, 'strict');
    assert.equal(f.cookies[0].options.maxAge, undefined);
    assert.equal(f.requests[0].options.body.get('grant_type'), 'refresh_token');
    assert.equal(f.requests[0].options.body.get('client_id'), 'itecsa-web');
    assert.equal(f.requests[0].options.body.get('refresh_token'), 'original-refresh');
    await assert.rejects(f.service.resume(f.req, f.res), { code: 'PIN_RECOVERY_INVALID' });
    assert.equal(f.requests.length, 1);
    const logs = JSON.stringify(f.logs);
    for (const value of [result.token, result.refreshToken, 'original-refresh', f.cookies[0].value]) assert.ok(!logs.includes(value));
});
for (const [name, claims] of Object.entries({ account: { sub: 'another-account' }, session: { sid: 'another-session' },
    client: { azp: 'itecsa-pin-recovery' }, audience: { aud: 'other' }, issuer: { iss: 'https://other.local' }, expired: { exp: 1 } })) {
    test(`rejects changed ${name} without replacing original identity`, async t => {
        const f = fixture(t, claims);
        await assert.rejects(f.service.resume(f.req, f.res), { code: 'PIN_RECOVERY_INVALID' });
        assert.equal(f.service.entries.size, 0);
    });
}
test('rejects forged token signature', async t => {
    const f = fixture(t, {}, wrongKey.privateKey);
    await assert.rejects(f.service.resume(f.req, f.res), { code: 'PIN_RECOVERY_INVALID' });
});
test('origin, cookie and state are all necessary; invalid requests cannot consume session bridge', async t => {
    const f = fixture(t);
    for (const req of [{ ...f.req, get: () => 'https://attacker.local' }, { ...f.req, headers: {} },
        { ...f.req, body: { state: 'x'.repeat(43) } }, { ...f.req, body: { state, sub: actor.sub } }]) {
        await assert.rejects(f.service.resume(req, f.res), { code: 'PIN_RECOVERY_INVALID' });
    }
    assert.equal(f.requests.length, 0);
    assert.equal((await f.service.resume(f.req, f.res)).subject, actor.sub);
});
test('parallel requests consume only once and expired bridges cannot resume', async t => {
    const f = fixture(t);
    const results = await Promise.allSettled([f.service.resume(f.req, f.res), f.service.resume(f.req, f.res)]);
    assert.equal(results.filter(value => value.status === 'fulfilled').length, 1);
    const expired = fixture(t); expired.advance(600001);
    await assert.rejects(expired.service.resume(expired.req, expired.res), { code: 'PIN_RECOVERY_INVALID' });
    assert.equal(expired.requests.length, 0);
});
test('cancellation destroys bridge; production cookies require HTTPS', t => {
    const f = fixture(t);
    f.service.discard(actor, state, f.res);
    assert.equal(f.service.entries.size, 0);
    f.service.env = { ...env, APP_ENV: 'production' };
    assert.equal(f.service.cookieOptions().secure, true);
});

for (const valid of [true, false]) {
    test(`renewed original ID token is ${valid ? 'preserved for SDK/logout' : 'rejected when issued to recovery client'}`, async t => {
        const f = fixture(t), fetchOriginal = f.service.fetchImpl;
        f.service.fetchImpl = async (...args) => {
            const response = await fetchOriginal(...args), tokens = await response.json();
            tokens.id_token = await new SignJWT({ sub: actor.sub, sid: actor.sid, iss: env.KEYCLOAK_ISSUER,
                aud: valid ? 'itecsa-web' : 'itecsa-pin-recovery', exp: Math.floor(Date.now() / 1000) + 60 })
                .setProtectedHeader({ alg: 'RS256' }).sign(privateKey);
            return { ok: true, json: async () => tokens };
        };
        if (valid) assert.equal(typeof (await f.service.resume(f.req, f.res)).idToken, 'string');
        else await assert.rejects(f.service.resume(f.req, f.res), { code: 'PIN_RECOVERY_INVALID' });
    });
}

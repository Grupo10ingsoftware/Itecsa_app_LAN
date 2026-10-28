// Entirely synthetic: real crypto and signed JWTs, in-memory transaction double.
// No real account, credential, Keycloak request or database write.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { generateKeyPair, SignJWT } from 'jose';
import { PinService as Before } from '../test/fixtures/opt08/pin.before.service.js';
import { PinService as After } from '../src/modules/auth/service/pin.service.js';
import { PinRecoveryService } from '../src/modules/auth/service/pinRecovery.service.js';
import { PinRecoveryNavigationService } from '../src/modules/auth/service/pinRecoveryNavigation.service.js';

const issuer = 'https://synthetic.invalid/realms/test';
process.env.KEYCLOAK_ISSUER = issuer;
const actor = { sub: 'synthetic', sid: 'synthetic-session' };
const env = { KEYCLOAK_ISSUER: issuer, KEYCLOAK_JWKS_URI: issuer + '/certs', KEYCLOAK_AUDIENCE: 'api',
    KEYCLOAK_CLIENT_ID: 'web', KEYCLOAK_ROLE_CLIENT_ID: 'roles', FRONTEND_ORIGIN: 'http://127.0.0.1:5173',
    KEYCLOAK_PIN_RECOVERY_REDIRECT_URI: 'http://127.0.0.1:5173/auth/pin-recovery/callback' };
const { publicKey, privateKey } = await generateKeyPair('RS256');
const output = { reference: 'b71fd33', capturedAt: new Date().toISOString(), methodology: 'Five synthetic samples per operation; crypto is exercised by setup, but no separate warmup for each function. Actual AES/HKDF/scrypt and RS256 JWT verification; injected provider/transaction doubles, no network/SQL or true DB commit/rollback. No real E2E or reliable p95.', samples: {}, checks: {} };
const samples = new Map();
async function measure(name, fn, count = 5) {
    const values = samples.get(name) ?? [];
    for (let i = 0; i < count; i++) { const start = performance.now(); await fn(); values.push(+(performance.now() - start).toFixed(3)); }
    samples.set(name, values);
}
for (const [version, Service] of [['before', Before], ['after', After]]) {
    const pins = new Service({ secret: Buffer.alloc(32, 9).toString('base64') });
    let row, reads = [], writes = 0, locks = 0;
    const restore = async () => { const c = await pins.buildCredential(); row = { id_usuario: 1, estado_usuario: 'Activo',
        correo_usuario: 'synthetic@example.invalid', nombre_usuario: 'Synthetic', apellido_usuario: 'Only',
        rol_usuario: 'Soporte', rut_usuario: 'synthetic', ...c.data }; return c; };
    const update = async ({ data }) => { writes++; Object.assign(row, data); };
    const tx = { usuario: { update }, $queryRaw: async () => { locks++; return [{ ...row }]; } };
    pins.prisma = { usuario: { findFirst: async ({ select }) => {
        reads.push(select ? Object.keys(select).length : Object.keys(row).length);
        return select ? Object.fromEntries(Object.keys(select).map(k => [k, row[k]])) : { ...row };
    }, update }, $transaction: async fn => {
        const previous = { ...row };
        try { return await fn(tx); } catch (error) { row = previous; throw error; }
    } };
    await restore();
    await measure('reveal_' + version, async () => { const value = await pins.reveal(actor.sub); assert.match(value, /^\d{6}$/); });
    output.checks['revealColumns_' + version] = reads.at(-1);
    for (let i = 0; i < 5; i++) {
        await restore(); writes = 0;
        await measure('acknowledge_' + version, () => pins.acknowledge(actor.sub), 1);
        assert.equal(writes, 1); assert(row.pin_accepted_at); assert.equal(row.pin_pending_ciphertext, null);
        await pins.acknowledge(actor.sub); assert.equal(writes, 1);
    }
    output.checks['acknowledgeColumns_' + version] = reads.at(-1);
    await measure('buildCredential_' + version, () => pins.buildCredential());
    const recovery = new PinRecoveryService({ env, resolveKey: publicKey, logger: { info() {} }, fetchImpl: async (_url, options) => {
        const operation = [...recovery.operations.values()][0], seconds = Math.floor(Date.now() / 1000);
        assert.equal(options.body.get('grant_type'), 'authorization_code');
        const id_token = await new SignJWT({ sub: actor.sub, iss: issuer, aud: operation.config.clientId, azp: operation.config.clientId,
            iat: seconds, exp: seconds + 60, auth_time: seconds, nonce: operation.nonce }).setProtectedHeader({ alg: 'RS256' }).sign(privateKey);
        return { ok: true, json: async () => ({ id_token }) };
    } });
    const navigation = new PinRecoveryNavigationService({ env, resolveKey: publicKey, logger: { info() {} }, fetchImpl: async () => {
        const access_token = await new SignJWT({ ...actor, iss: issuer, aud: 'api', azp: 'web', typ: 'Bearer', exp: Math.floor(Date.now() / 1000) + 60 })
            .setProtectedHeader({ alg: 'RS256' }).sign(privateKey);
        return { ok: true, json: async () => ({ access_token, refresh_token: 'synthetic-refresh' }) };
    } });
    try {
        await measure('start_' + version, () => { const flow = recovery.start(actor); recovery.cancel(actor, flow.state); });
        for (let i = 0; i < 5; i++) {
            const flow = recovery.start(actor); let cookie;
            const response = { cookie(name, value) { cookie = name + '=' + value; }, clearCookie() {} };
            navigation.hold(actor, flow.state, 'synthetic-refresh', response);
            await measure('resume_' + version, async () => {
                const value = await navigation.resume({ get: () => env.FRONTEND_ORIGIN, body: { state: flow.state }, headers: { cookie } }, response);
                assert.equal(value.subject, actor.sub); assert.equal(value.sid, actor.sid);
            }, 1);
            locks = 0; writes = 0;
            await measure('finish_' + version, async () => {
                assert.deepEqual(await recovery.finish(actor, { state: flow.state, code: 'synthetic-code' }, pins), { pinStatus: 'pending_acknowledgement' });
            }, 1);
            assert.equal(writes, 1); assert.equal(locks, 1); assert.equal(row.pin_accepted_at, null);
            await assert.rejects(recovery.finish(actor, { state: flow.state, code: 'replay' }, pins));
            const cancel = recovery.start(actor);
            await measure('cancel_' + version, () => recovery.cancel(actor, cancel.state), 1);
            await assert.rejects(recovery.finish(actor, { state: cancel.state, code: 'late' }, pins));
        }
    } finally { recovery.dispose(); navigation.dispose(); }
    output.checks[version] = { receiptDurableInDouble: true, replayDenied: true, cancelDenied: true, rotationLock: true,
        note: 'Double proves control flow, not MySQL isolation. Existing concurrency/fault suites run separately.' };
}
for (const [name, values] of samples) {
    const sorted = [...values].sort((a, b) => a - b);
    output.samples[name] = { n: values.length, minMs: sorted[0], meanMs: values.reduce((a, b) => a + b) / values.length,
        medianMs: sorted[Math.floor(sorted.length / 2)], maxMs: sorted.at(-1), samples: values };
}
await writeFile('../docs/OPT-08_PIN_SINTETICO.json', JSON.stringify(output, null, 2) + '\n');
console.log('Synthetic PIN lifecycle verified; no real writes or secrets recorded.');

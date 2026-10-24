import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { createServer } from 'node:http';
import { test } from 'node:test';
import express from 'express';
import { createCheckJwt } from '../src/middlewares/checkJwt.js';
import { resolveIdentityConfiguration } from '../src/config/identity.js';
import { normalizeKeycloakClaims } from '../src/middlewares/keycloakClaims.js';
import { createRequireActiveIdentity } from '../src/middlewares/requireActiveIdentity.js';
import requireCapability from '../src/middlewares/requireCapability.js';
import { createVerifyAuthSessionHandler, createDebugResetPinHandler } from '../src/modules/auth/controller/auth.controller.js';
import * as policy from '../../shared/keycloakAuthorization.js';
import { authorizationForProvider } from '../../shared/identityAuthorization.js';
import { createSupportAudit } from '../src/middlewares/supportAudit.js';
import { updGeneralStepOperation } from '../src/modules/orders/service/orderProduction.service.js';
import { updPaymentStateOperation } from '../src/modules/orders/service/orderPayment.service.js';
import OrderHistoryController from '../src/modules/history/controller/orderHistory.controller.js';

const clientId = 'itecsa-web';
const roleClientId = 'itecsa-api-v1';
const issuer = 'http://identity.test/realms/phase02';
const audience = 'https://api.itecsa.local';
function claimsFor(role, overrides = {}) {
  return { iss: issuer, aud: [audience], sub: 'synthetic-subject', azp: clientId, typ: 'Bearer',
    resource_access: { [roleClientId]: { roles: [role] } },
    realm_access: { roles: ['default-roles-phase02', 'Soporte'] },
    permissions: policy.BUSINESS_PERMISSIONS,
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300, ...overrides };
}
const normalize = payload => normalizeKeycloakClaims(payload, clientId, roleClientId);

test('phase 02: scoped application roles require an explicit namespace, never infer legacy Soporte', () => {
  assert.equal(normalizeKeycloakClaims(claimsFor('Soporte'), clientId), null);
  assert.equal(normalize(claimsFor('Soporte', { resource_access: undefined })), null);
  assert.equal(normalize(claimsFor('Soporte', { resource_access: { another: { roles: ['Soporte'] } } })), null);
  for (const roles of [[], ['root'], ['Soporte', 'root'], ['Soporte', 'Gerencia'], ['Soporte', 'Soporte'], ['__proto__'], [null]]) {
    assert.equal(normalize(claimsFor('Soporte', { resource_access: { [roleClientId]: { roles } } })), null);
  }
});

test('phase 02: normalizer intersects token grants with the approved local matrix for all nine roles', () => {
  for (const role of policy.RECOGNIZED_ROLES) {
    const raw = claimsFor(role, { permissions: [...policy.BUSINESS_PERMISSIONS, 'realm-admin', 'delete:users'],
      [policy.ROLES_CLAIM]: ['Soporte'] });
    const normalized = normalize(raw);
    assert.deepEqual(normalized[policy.ROLES_CLAIM], [role]);
    assert.deepEqual(normalized.permissions, policy.ROLE_PERMISSIONS[role]);
    assert.equal(raw.permissions.includes('realm-admin'), true, 'do not mutate raw claims');
    assert.deepEqual(normalize(claimsFor(role, { permissions: [] })).permissions, []);
  }
  for (const patch of [{ typ: 'ID' }, { azp: 'other' }, { sub: '' }, { sub: null },
    { permissions: undefined }, { permissions: [''] }, { permissions: ['read:orders', 7] }]) {
    assert.equal(normalize(claimsFor('Desarrollador', patch)), null);
  }
});

test('phase 02: provider selection has no unknown-provider or permission fallback', () => {
  assert.equal(authorizationForProvider('keycloak'), policy);
  assert.equal(authorizationForProvider('auth0').RECOGNIZED_ROLES.length, 8);
  for (const invalid of ['other', '', null, 'KEYCLOAK']) assert.equal(authorizationForProvider(invalid), null);
  const valid = { AUTH_PROVIDER: 'keycloak', APP_ENV: 'test', KEYCLOAK_ALLOW_HTTP: 'true',
    KEYCLOAK_ISSUER: issuer, KEYCLOAK_AUDIENCE: audience, KEYCLOAK_CLIENT_ID: clientId,
    KEYCLOAK_ROLE_CLIENT_ID: roleClientId, KEYCLOAK_JWKS_URI: 'http://keys.test/certs' };
  assert.equal(resolveIdentityConfiguration(valid).provider, 'keycloak');
  for (const key of ['KEYCLOAK_ISSUER', 'KEYCLOAK_AUDIENCE', 'KEYCLOAK_CLIENT_ID', 'KEYCLOAK_ROLE_CLIENT_ID', 'KEYCLOAK_JWKS_URI']) {
    assert.throws(() => resolveIdentityConfiguration({ ...valid, [key]: '' }));
  }
  for (const patch of [{ AUTH_PROVIDER: 'typo' }, { KEYCLOAK_AUDIENCE: clientId },
    { KEYCLOAK_ROLE_CLIENT_ID: clientId }, { KEYCLOAK_ISSUER: 'ftp://identity.test/realm' },
    { KEYCLOAK_JWKS_URI: 'http://user:secret@keys.test/certs' }, { KEYCLOAK_ALLOW_HTTP: 'false' },
    { APP_ENV: 'production' }]) assert.throws(() => resolveIdentityConfiguration({ ...valid, ...patch }));
});

async function fixture(t) {
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...keys.publicKey.export({ format: 'jwk' }), kid: 'phase02-key', alg: 'RS256', use: 'sig' };
  let keysAvailable = true;
  const keyServer = createServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    if (!keysAvailable) { res.statusCode = 503; return res.end('{}'); }
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise(resolve => keyServer.listen(0, '127.0.0.1', resolve));
  t.after(() => { keyServer.closeAllConnections(); keyServer.close(); });
  const env = { AUTH_PROVIDER: 'keycloak', APP_ENV: 'test', KEYCLOAK_ALLOW_HTTP: 'true',
    KEYCLOAK_ISSUER: issuer, KEYCLOAK_AUDIENCE: audience, KEYCLOAK_CLIENT_ID: clientId,
    KEYCLOAK_ROLE_CLIENT_ID: roleClientId, KEYCLOAK_JWKS_URI: `http://127.0.0.1:${keyServer.address().port}/certs` };
  let localUser = { idUsuario: 17, idAuth0: 'synthetic-subject', rolUsuario: 'Desarrollador', estadoUsuario: 'Activo' };
  let databaseError = false;
  let auth0Calls = 0;
  const requireIdentity = createRequireActiveIdentity({ repository: {
    async findByAuth0Id() { if (databaseError) throw Error('database offline'); return localUser; },
  }, async resolveAuth0Role() { auth0Calls++; throw Error('Auth0 must remain inactive'); } });
  const authentication = createCheckJwt({ environment: env, requireIdentity, rateLimit: (_req, _res, next) => next() });
  const app = express();
  app.get('/verify', authentication, requireCapability('read:own-profile'), createVerifyAuthSessionHandler());
  app.get('/cap/:permission', authentication, (req, res, next) => requireCapability(req.params.permission)(req, res, next), (_req, res) => res.sendStatus(204));
  app.use((error, _req, res, _next) => res.status(error.status || 503).end());
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  function sign(payload, key = keys.privateKey, headerPatch = {}) {
    const encoded = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const input = `${encoded({ alg: 'RS256', typ: 'JWT', kid: 'phase02-key', ...headerPatch })}.${encoded(payload)}`;
    return `${input}.${createSign('RSA-SHA256').update(input).sign(key).toString('base64url')}`;
  }
  return { env, sign, get auth0Calls() { return auth0Calls; },
    user(value) { localUser = value; }, databaseOffline(value) { databaseError = value; }, keysOffline() { keysAvailable = false; },
    request(payload, path = '/verify', key, header) {
      return fetch(base + path, { headers: payload ? { authorization: `Bearer ${sign(payload, key, header)}` } : {} });
    } };
}

test('phase 02: real JWT validation rejects wrong signature, issuer, audience, client, type and expiry', async t => {
  const f = await fixture(t);
  assert.equal((await f.request(claimsFor('Desarrollador'))).status, 200);
  assert.equal((await f.request(null)).status, 401);
  assert.equal((await f.request(claimsFor('Desarrollador'), '/verify', generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey)).status, 401);
  for (const alg of ['none', 'HS256', 'ES256']) {
    assert.equal((await f.request(claimsFor('Desarrollador'), '/verify', undefined, { alg })).status, 401);
  }
  for (const [patch, status] of [
    [{ iss: 'https://auth0.example.invalid/' }, 401], [{ aud: ['other-api'] }, 401],
    [{ exp: Math.floor(Date.now() / 1000) - 60 }, 401], [{ exp: undefined }, 401],
    [{ nbf: Math.floor(Date.now() / 1000) + 60 }, 401], [{ azp: 'other-client' }, 403],
    [{ typ: 'ID' }, 403], [{ sub: '' }, 403], [{ resource_access: undefined }, 403],
    [{ permissions: undefined }, 403],
  ]) assert.equal((await f.request(claimsFor('Desarrollador', patch))).status, status, JSON.stringify(patch));
  assert.equal(f.auth0Calls, 0);
});

test('phase 02: 225 middleware decisions enforce the new matrix after JWT and local identity validation', async t => {
  const f = await fixture(t);
  for (const role of policy.RECOGNIZED_ROLES) {
    f.user({ idUsuario: 17, idAuth0: 'synthetic-subject', rolUsuario: role, estadoUsuario: 'Activo' });
    for (const permission of policy.BUSINESS_PERMISSIONS) {
      const response = await f.request(claimsFor(role), '/cap/' + encodeURIComponent(permission));
      assert.equal(response.status, policy.ROLE_PERMISSIONS[role].includes(permission) ? 204 : 403, `${role}: ${permission}`);
    }
    const response = await f.request(claimsFor(role));
    assert.equal(response.status, 200);
    const verified = await response.json();
    assert.equal(verified.rolUsuario, role);
    assert.deepEqual(verified.permissions, policy.ROLE_PERMISSIONS[role]);
    assert.equal(verified.authorizationPolicy, 'itecsa-keycloak-v1');
    assert.equal(verified.identityProvider, 'keycloak');
  }
  assert.equal(f.auth0Calls, 0);
});

test('phase 02: local identity denies inactive, mismatched, missing or differently bound subjects', async t => {
  const f = await fixture(t);
  for (const user of [null,
    { idAuth0: 'synthetic-subject', rolUsuario: 'Desarrollador', estadoUsuario: 'Desvinculado' },
    { idAuth0: 'synthetic-subject', rolUsuario: 'Soporte', estadoUsuario: 'Activo' },
    { idAuth0: 'another-subject', rolUsuario: 'Desarrollador', estadoUsuario: 'Activo' },
  ]) {
    f.user(user);
    assert.equal((await f.request(claimsFor('Desarrollador'))).status, 403);
  }
  f.databaseOffline(true);
  assert.equal((await f.request(claimsFor('Desarrollador'))).status, 503);
  assert.equal(f.auth0Calls, 0);
});

test('phase 02: invalid configuration and unavailable JWKS never fall back to Auth0', async t => {
  const f = await fixture(t);
  f.keysOffline();
  assert.equal((await f.request(claimsFor('Desarrollador'))).status, 401);
  f.env.AUTH_PROVIDER = 'typo';
  assert.equal((await f.request(claimsFor('Desarrollador'))).status, 503);
  f.env.AUTH_PROVIDER = 'keycloak';
  f.env.KEYCLOAK_ROLE_CLIENT_ID = '';
  assert.equal((await f.request(claimsFor('Desarrollador'))).status, 503);
  assert.equal(f.auth0Calls, 0);
});

test('phase 02: the renamed technical actor retains reinforced request auditing', async () => {
  for (const [provider, role, expected] of [['keycloak', 'Desarrollador', 1], ['keycloak', 'Soporte', 1],
    ['auth0', 'Soporte', 1], ['keycloak', 'Operario Ventas', 0]]) {
    const records = [];
    let finish;
    createSupportAudit({ repository: { async record(value) { records.push(value); } } })(
      { identityProvider: provider, currentUser: { idUsuario: 17, rolUsuario: role }, method: 'GET', path: '/verify' },
      { statusCode: 200, on(_event, callback) { finish = callback; } }, () => {});
    finish();
    assert.equal(records.length, expected);
    if (expected) assert.equal(records[0].actorUserId, 17);
  }
});

test('phase 02: production authorization uses the selected policy and preserves the PIN actor', async () => {
  for (const [role, allowed] of [['Desarrollador', true], ['Administrador Produccion', true], ['Soporte', false], ['Operario Produccion', false]]) {
    const writes = [];
    const repo = { async getTransitionState() { return { id_etapa_general: 1, id_estado_pedido: 2, id_estado_pago: 2, estado_pago: 'Confirmado' }; },
      async updateGeneralStep(...args) { writes.push(args); return { id_etapa_general: 2 }; } };
    const service = { repo, runInTransaction: work => work({ repo }) };
    const options = { identityProvider: 'keycloak', role, permissions: policy.BUSINESS_PERMISSIONS, actor: { idUsuario: 17 } };
    if (allowed) {
      assert.equal((await updGeneralStepOperation(service, 1, 2, options)).id_etapa_general, 2);
      assert.equal(writes[0][2].userId, 17);
      await assert.rejects(updGeneralStepOperation(service, 1, 2, { ...options, actor: undefined }), { statusCode: 403 });
    } else await assert.rejects(updGeneralStepOperation(service, 1, 2, options), { statusCode: 403 });
    assert.equal(writes.length, allowed ? 1 : 0);
  }
});

test('phase 02: resolved-payment authorization preserves the local actor and denies excessive Soporte grants', async () => {
  for (const [role, allowed] of [['Desarrollador', true], ['Administrador Cobranzas', true], ['Soporte', false], ['Operario Cobranzas', false]]) {
    const records = [];
    let writes = 0;
    const repo = { async getPaymentOrder() { return { id_estado_pago: 3, estado_pago: 'Rechazado', id_etapa_general: 0 }; },
      async lockPaymentOrder() { return true; }, async updatePaymentStatus() { writes++; return { id_estado_pago: 2 }; },
      async notifyProductionAdministrators() {} };
    const service = { repo, paymentRepo: { async get() { return { nombre_estado_pago: 'Confirmado' }; } },
      runInTransaction: work => work({ repo, paymentRecordService: { async createPaymentRecord(_order, value) { records.push(value); } } }) };
    const data = { identityProvider: 'keycloak', role, permissions: policy.BUSINESS_PERMISSIONS,
      actor: { idUsuario: 17 }, observacion: 'Synthetic authorized correction' };
    if (allowed) {
      assert.equal((await updPaymentStateOperation(service, 1, 2, data)).id_estado_pago, 2);
      assert.equal(records[0].id_usuario, 17);
    } else await assert.rejects(updPaymentStateOperation(service, 1, 2, data), { statusCode: 403 });
    assert.equal(writes, allowed ? 1 : 0);
  }
});

test('phase 02: history keeps payment details for Desarrollador and excludes new Soporte', async () => {
  for (const [role, expected] of [['Desarrollador', true], ['Soporte', false], ['Operario Ventas', false]]) {
    let options;
    const controller = new OrderHistoryController({ service: {
      async getOrderHistory(_id, _query, value) { options = value; return {}; },
    } });
    let status;
    await controller.getOrderHistory({ identityProvider: 'keycloak', params: { orderId: '1' }, query: {},
      auth: { payload: normalize(claimsFor(role)) } },
    { status(value) { status = value; return this; }, json() {} });
    assert.equal(status, 200);
    assert.equal(options.includePaymentDetails, expected);
  }
});

test('phase 02: legacy PIN debug exception cannot transfer to a Keycloak account by its role label', async () => {
  let calls = 0;
  const handler = createDebugResetPinHandler({ pins: { async debugReset() { calls++; } } });
  for (const role of ['Soporte', 'Desarrollador']) {
    let status;
    await handler({ identityProvider: 'keycloak', auth: { payload: normalize(claimsFor(role)) } },
      { set() {}, status(value) { status = value; return this; }, json() {} });
    assert.equal(status, 403);
  }
  assert.equal(calls, 0);
});

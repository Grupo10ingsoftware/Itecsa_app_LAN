import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, scryptSync } from 'node:crypto';
import { generarContrasena } from './generarContrasena.js';
import { KeycloakIdentityAdministrationService } from './keycloakIdentityAdministration.service.js';
import { KeycloakManagementService, KeycloakServiceError } from './keycloakManagement.service.js';
import { KeycloakIdentityRepository } from '../repo/keycloakIdentity.repo.js';
import { PinService } from '../../auth/service/pin.service.js';
import { ROLES, PERMISSIONS, ROLES_CLAIM } from '../../../../../shared/keycloakAuthorization.js';
import express from 'express';
import { createKeycloakIdentityPreparationRouter } from '../routes/keycloakIdentityPreparation.routes.js';

const input = { username: 'jo.perez', firstName: 'Jose', lastName: 'Perez',
  email: 'jose@example.com', rut: '12.345.678-5', role: ROLES.VENTAS };
const context = { provider: 'keycloak', subject: 'operator', role: ROLES.SOPORTE,
  permissions: [PERMISSIONS.MANAGE_USERS], pin: '123456' };
const operationId = '00000000-0000-4000-8000-000000000001';
const issuer = 'https://identity.example.test/realms/itecsa';

function fixture({ failure, pinLocked = false } = {}) {
  const events = [];
  let operation, external, password, passwordSetCount = 0;
  const salt = randomBytes(16);
  const actor = { id_usuario: 1, rol_usuario: ROLES.SOPORTE, estado_usuario: 'Activo',
    pin_hash: scryptSync(context.pin, salt, 32).toString('base64'), pin_salt: salt.toString('base64'),
    pin_accepted_at: new Date(), pin_locked_until: pinLocked ? new Date(Date.now() + 60000) : null };
  const pins = new PinService({ prisma: { $transaction: fn => fn({
    $queryRaw: async (_strings, ...values) => {
      assert.equal(values.at(-1), context.subject);
      events.push('pin');
      return [actor];
    },
    usuario: { update: async ({ data }) => Object.assign(actor, data) },
  }) } });
  const check = stage => { events.push(stage); if (stage === failure) throw new Error('simulated failure'); };
  const repository = {
    actor: async () => actor,
    claim: async ({ input: values, digest }) => {
      check('claim');
      operation ??= { id: operationId, issuer, username: values.username, input: values,
        payload_digest: digest, state: 'pending', revision: 0 };
      return { ...operation };
    },
    acquire: async () => { operation.state = 'running'; operation.revision++; return { ...operation }; },
    checkpoint: async (_operation, subject) => { operation.external_subject = subject; },
    complete: async () => { check('mysql'); operation.local_user_id = 2; return { ...operation }; },
    finish: async () => { check('finish'); operation.state = 'created'; return { ...operation }; },
    fail: async (_operation, code) => { operation.state = 'needs_reconciliation'; operation.last_error = code; },
    operation: async () => ({ ...operation }),
  };
  const management = {
    config: { issuer },
    findByUsername: async () => { check('find'); return external ? structuredClone(external) : null; },
    createDisabled: async values => {
      check('create');
      external = { ...values, id: 'new-user', enabled: false, attributes: { itecsa_provision_id: [values.operationId] } };
      return external.id;
    },
    getUser: async () => structuredClone(external),
    replaceRole: async () => { check('role'); },
    setTemporaryPassword: async (_subject, value) => { check('password'); password = value; passwordSetCount++; },
    hasTemporaryPassword: async () => { check('verify'); return Boolean(password); },
    setEnabled: async (_subject, enabled) => { check(enabled ? 'enable' : 'disable'); external.enabled = enabled; },
  };
  const service = new KeycloakIdentityAdministrationService({ management, repository, pins });
  return { service, events, management, repository, state: () => ({ operation, external, password, passwordSetCount }) };
}

test.before(() => { process.env.KEYCLOAK_ISSUER = issuer; });

test('password generator satisfies all character groups at default and minimum lengths', () => {
  for (let i = 0; i < 100; i++) {
    for (const length of [8, 16, 24]) {
      const value = generarContrasena(length);
      assert.equal(value.length, length);
      for (const pattern of [/[A-Z]/, /[a-z]/, /[0-9]/, /[!@#$%&*?]/]) assert.match(value, pattern);
    }
  }
  assert.equal(generarContrasena().length, 16);
  for (const value of [0, 7, 8.5, '16', null, NaN]) assert.throws(() => generarContrasena(value));
});

test('correct operator PIN creates user and returns initial password only once', async () => {
  const f = fixture();
  const created = await f.service.prepare(context, input);
  assert.equal(created.outcome, 'user_created');
  assert.equal(created.mustChangePassword, true);
  assert.equal(created.temporaryPassword, f.state().password);
  assert.equal(f.state().external.enabled, true);
  assert.ok(f.events.indexOf('pin') < f.events.indexOf('create'));
  assert.ok(f.events.indexOf('mysql') < f.events.indexOf('enable'));
  assert.ok(!JSON.stringify(f.state().operation).includes(created.temporaryPassword));
  const replay = await f.service.prepare(context, input);
  assert.equal(replay.outcome, 'user_created');
  assert.equal(replay.temporaryPassword, undefined);
  assert.equal(f.state().passwordSetCount, 1);
});

test('wrong PIN uses existing validation and prevents all creation', async () => {
  const f = fixture();
  await assert.rejects(f.service.prepare({ ...context, pin: '654321' }, input), { code: 'PIN_INVALID' });
  assert.deepEqual(f.events, ['pin']);
  assert.equal(f.state().operation, undefined);
});

test('locked PIN uses existing lockout and prevents all creation', async () => {
  const f = fixture({ pinLocked: true });
  await assert.rejects(f.service.prepare(context, input), { code: 'PIN_LOCKED', status: 423 });
  assert.deepEqual(f.events, ['pin']);
});

for (const failure of ['create', 'password', 'verify', 'mysql', 'enable', 'finish']) {
  test(`${failure} failure returns no password and preserves reconciliation state`, async () => {
    const f = fixture({ failure });
    const response = await f.service.prepare(context, input);
    assert.equal(response.outcome, 'needs_reconciliation');
    assert.equal(response.temporaryPassword, undefined);
    assert.notEqual(f.state().external?.enabled, true);
    assert.ok(!Object.hasOwn(f.state().operation.input, 'temporaryPassword'));
    if (failure === 'mysql') assert.equal(f.events.includes('enable'), false);
  });
}

test('reconciliation after storage failure never regenerates or reveals a credential', async () => {
  const f = fixture({ failure: 'mysql' });
  await f.service.prepare(context, input);
  f.repository.complete = async operation => ({ ...operation, local_user_id: 2 });
  const response = await f.service.reconcile(context, operationId);
  assert.equal(response.outcome, 'user_created');
  assert.equal(response.temporaryPassword, undefined);
  assert.equal(f.state().passwordSetCount, 1);
});

const env = { AUTH_PROVIDER: 'keycloak', APP_ENV: 'test', KEYCLOAK_ISSUER: issuer,
  KEYCLOAK_ROLE_CLIENT_ID: 'roles', KEYCLOAK_ADMIN_CLIENT_ID: 'admin', KEYCLOAK_ADMIN_CLIENT_SECRET: 'test-only' };

test('administrative API receives temporary:true without exposing tokens in results', async () => {
  const requests = [];
  const service = new KeycloakManagementService({ env, fetcher: async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith('/token')) return Response.json({ access_token: 'test-token', token_type: 'Bearer', expires_in: 60 });
    return new Response(null, { status: 204 });
  } });
  const result = await service.setTemporaryPassword('subject', 'ExamplePassword1!');
  assert.equal(result, undefined);
  assert.ok(requests[1].url.endsWith('/users/subject/reset-password'));
  assert.equal(requests[1].options.method, 'PUT');
  assert.deepEqual(JSON.parse(requests[1].options.body), { type: 'password', value: 'ExamplePassword1!', temporary: true });
});

test('administrative communication errors are sanitized', async () => {
  const service = new KeycloakManagementService({ env, fetcher: async () => { throw Error('secret transport details'); } });
  await assert.rejects(service.setTemporaryPassword('subject', 'ExamplePassword1!'), error =>
    error instanceof KeycloakServiceError && error.code === 'KEYCLOAK_NETWORK_ERROR' && !error.message.includes('secret'));
});

test('credential confirmation requires both password metadata and UPDATE_PASSWORD', async () => {
  let requiredActions = ['UPDATE_PASSWORD'];
  const service = new KeycloakManagementService({ env, fetcher: async url => {
    if (url.endsWith('/token')) return Response.json({ access_token: 'test-token', token_type: 'Bearer', expires_in: 60 });
    if (url.endsWith('/credentials')) return Response.json([{ type: 'password' }]);
    return Response.json({ id: 'subject', username: input.username, enabled: false, requiredActions });
  } });
  assert.equal(await service.hasTemporaryPassword('subject'), true);
  requiredActions = [];
  assert.equal(await service.hasTemporaryPassword('subject'), false);
});

test('HTTP creation disables caching and returns PIN failures without creating a user', async t => {
  const f = fixture();
  const app = express();
  app.locals.errorLogger = { error() {} };
  app.use(express.json());
  app.use(createKeycloakIdentityPreparationRouter({ service: f.service, authenticate: (req, _res, next) => {
    req.identityProvider = 'keycloak';
    req.auth = { payload: { sub: context.subject, [ROLES_CLAIM]: [context.role], permissions: context.permissions } };
    next();
  } }));
  const server = await new Promise(resolve => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)); });
  t.after(() => { server.closeAllConnections(); server.close(); });
  const create = pin => fetch(`http://127.0.0.1:${server.address().port}/identities/prepare`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin, identity: input }),
  });
  const rejected = await create('654321');
  assert.equal(rejected.status, 403);
  assert.equal((await rejected.json()).code, 'PIN_INVALID');
  assert.equal(f.state().external, undefined);
  const accepted = await create(context.pin);
  assert.equal(accepted.status, 201);
  assert.equal(accepted.headers.get('cache-control'), 'no-store');
  assert.equal((await accepted.json()).temporaryPassword.length, 16);
  const replay = await create(context.pin);
  assert.equal((await replay.json()).temporaryPassword, undefined);
});

test('failure to confirm compensating disable is recorded without disclosing credentials', async () => {
  const f = fixture({ failure: 'finish' });
  const setEnabled = f.management.setEnabled;
  f.management.setEnabled = async (subject, enabled) => {
    if (!enabled) throw new KeycloakServiceError('KEYCLOAK_NETWORK_ERROR');
    await setEnabled(subject, enabled);
  };
  const response = await f.service.prepare(context, input);
  assert.equal(response.outcome, 'needs_reconciliation');
  assert.equal(f.state().operation.last_error, 'IDENTITY_DISABLE_UNCONFIRMED');
  assert.equal(response.temporaryPassword, undefined);
});

test('local persistence writes both Keycloak identifier and external binding inside a transaction', async () => {
  let user, binding;
  const tx = {
    $queryRaw: async () => [{ subject: context.subject, provider: 'keycloak', issuer,
      rol_usuario: context.role, estado_usuario: 'Activo' }],
    usuario: { create: async ({ data }) => { user = data; return { id_usuario: 2 }; } },
    externalIdentity: { create: async ({ data }) => { binding = data; } },
    securityAuditEvent: { create: async () => ({}) },
    identityProvisionOperation: { updateMany: async () => ({ count: 1 }), findUnique: async () => ({ state: 'running' }) },
  };
  let transactions = 0;
  const repository = new KeycloakIdentityRepository({ prisma: { $transaction: async fn => { transactions++; return fn(tx); } } });
  await repository.complete({ id: operationId, issuer, input, revision: 1 }, 'new-user', 1, context.subject, context.role);
  assert.equal(transactions, 1);
  assert.equal(user.id_keycloak, 'new-user');
  assert.equal(binding.subject, user.id_keycloak);
  assert.equal(binding.user_id, 2);
  assert.equal(user.rut_usuario, input.rut);
  assert.equal(user.estado_usuario, 'Pendiente');
});

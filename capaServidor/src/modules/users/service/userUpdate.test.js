import test from 'node:test';
import assert from 'node:assert/strict';
import { KeycloakIdentityAdministrationService } from './keycloakIdentityAdministration.service.js';
import { KeycloakIdentityRepository } from '../repo/keycloakIdentity.repo.js';
import { ROLES, PERMISSIONS } from '../../../../../shared/keycloakAuthorization.js';
import { PinServiceError } from '../../auth/service/pin.service.js';
import express from 'express';
import { ROLES_CLAIM } from '../../../../../shared/keycloakAuthorization.js';
import { createKeycloakIdentityPreparationRouter } from '../routes/keycloakIdentityPreparation.routes.js';

const context = { provider: 'keycloak', subject: 'operator', role: ROLES.SOPORTE,
  permissions: [PERMISSIONS.MANAGE_USERS], pin: '123456' };
const input = { firstName: 'Maria', lastName: 'Soto', email: 'MARIA@example.com', role: ROLES.COBRANZAS, state: 'Activo' };

function fixture({ fail, pinError, localState = 'Activo', role = ROLES.VENTAS } = {}) {
  const events = [];
  let failureUsed = false;
  const binding = { user_id: 2, subject: 'target', issuer: 'issuer', username: 'jo.perez', Usuario: {
    id_usuario: 2, nombre_usuario: 'Jose', apellido_usuario: 'Perez', correo_usuario: 'jose@example.com',
    rol_usuario: role, estado_usuario: localState,
  } };
  const external = { id: 'target', username: binding.username, firstName: 'Jose', lastName: 'Perez',
    email: 'jose@example.com', enabled: localState !== 'Desvinculado', role };
  function check(stage) {
    events.push(stage);
    if (stage === fail && !failureUsed) { failureUsed = true; throw Error('Failure'); }
  }
  const repository = {
    actor: async () => ({ id_usuario: 1, rol_usuario: context.role, estado_usuario: 'Activo' }),
    binding: async () => structuredClone(binding),
    beginUpdate: async () => {
      check('begin');
      if (binding.Usuario.estado_usuario.startsWith('Actualizando:')) throw Object.assign(Error(), { code: 'IDENTITY_UPDATE_BUSY' });
      const snapshot = { ...structuredClone(binding), updateState: 'Actualizando:test' };
      binding.Usuario.estado_usuario = snapshot.updateState;
      return snapshot;
    },
    finishUpdate: async (_binding, data, _actor, outcome) => { check(outcome === 'reverted' ? 'restore' : 'save'); Object.assign(binding.Usuario, data); },
  };
  const management = {
    config: { issuer: 'issuer' },
    getUser: async () => ({ ...external }), roles: async () => [{ name: external.role }],
    setEnabled: async (_subject, enabled) => { check(enabled ? 'enable' : 'disable'); external.enabled = enabled; },
    logout: async () => { check('logout'); },
    updateAttributes: async (_subject, data) => { check('attributes'); Object.assign(external, data); },
    replaceRole: async (_subject, next) => { check('role'); external.role = next; },
  };
  const pins = { validate: async (subject, pin) => {
    assert.equal(subject, context.subject); assert.equal(pin, context.pin); events.push('pin');
    if (pinError) throw new PinServiceError(pinError, 'PIN rechazado', { status: 403 });
    return { idUsuario: 1 };
  } };
  const service = new KeycloakIdentityAdministrationService({ repository, management, pins });
  return { service, repository, management, binding, external, events };
}

test('updates all five fields in Keycloak and MySQL using the operator PIN', async () => {
  const f = fixture();
  assert.deepEqual(await f.service.update(context, 'target', input), { outcome: 'user_updated', subject: 'target' });
  assert.equal(f.external.firstName, input.firstName);
  assert.equal(f.external.lastName, input.lastName);
  assert.equal(f.external.email, 'maria@example.com');
  assert.equal(f.external.role, input.role);
  assert.equal(f.binding.Usuario.nombre_usuario, input.firstName);
  assert.equal(f.binding.Usuario.apellido_usuario, input.lastName);
  assert.equal(f.binding.Usuario.correo_usuario, 'maria@example.com');
  assert.equal(f.binding.Usuario.rol_usuario, input.role);
  assert.equal(f.binding.Usuario.estado_usuario, input.state);
  assert.equal(f.external.username, 'jo.perez');
  assert.ok(f.events.indexOf('pin') < f.events.indexOf('begin'));
  assert.ok(f.events.indexOf('logout') < f.events.indexOf('role'));
});

for (const state of ['Desvinculado', 'Activo']) {
  test(`synchronizes account access for ${state}`, async () => {
    const f = fixture({ localState: state === 'Activo' ? 'Desvinculado' : 'Activo' });
    await f.service.update(context, 'target', { ...input, state });
    assert.equal(f.external.enabled, state === 'Activo');
    assert.equal(f.binding.Usuario.estado_usuario, state);
  });
}

for (const pinError of ['PIN_INVALID', 'PIN_LOCKED']) {
  test(`rejects ${pinError} without modifying the user`, async () => {
    const f = fixture({ pinError });
    await assert.rejects(f.service.update(context, 'target', input), { code: pinError });
    assert.deepEqual(f.events, ['pin']);
  });
}

test('blocks self editing and privileged role assignment', async () => {
  const f = fixture();
  await assert.rejects(f.service.update(context, context.subject, input), { code: 'IDENTITY_SELF_TARGET_FORBIDDEN' });
  await assert.rejects(f.service.update(context, 'target', { ...input, role: ROLES.SOPORTE }), { code: 'IDENTITY_ROLE_FORBIDDEN' });
  assert.equal(f.events.includes('begin'), false);
});

test('rejects invalid input, missing email and an arbitrary lifecycle state', async () => {
  for (const patch of [{ email: '' }, { email: 'invalid' }, { firstName: '123' }, { state: 'anything' }, { username: 'changed' }]) {
    const f = fixture();
    await assert.rejects(f.service.update(context, 'target', { ...input, ...patch }), { code: 'IDENTITY_INPUT_INVALID' });
    assert.equal(f.events.includes('begin'), false);
  }
});

for (const fail of ['attributes', 'role', 'save']) {
  test(`restores previous data on ${fail} failure`, async () => {
    const f = fixture({ fail });
    await assert.rejects(f.service.update(context, 'target', input));
    assert.equal(f.binding.Usuario.estado_usuario, 'Activo');
    assert.equal(f.binding.Usuario.nombre_usuario, 'Jose');
    assert.equal(f.external.firstName, 'Jose');
    assert.equal(f.external.role, ROLES.VENTAS);
    assert.equal(f.external.enabled, true);
  });
}

test('retains local access blocking if remote compensation also fails', async () => {
  const f = fixture();
  f.management.updateAttributes = async () => { throw Error('Keycloak unavailable'); };
  await assert.rejects(f.service.update(context, 'target', input), { code: 'IDENTITY_UPDATE_REQUIRES_REVIEW' });
  assert.match(f.binding.Usuario.estado_usuario, /^Actualizando:/);
  assert.equal(f.external.enabled, false);
});

test('a concurrent edit is rejected before external writes', async () => {
  const f = fixture({ localState: 'Actualizando:another-operation' });
  await assert.rejects(f.service.update(context, 'target', input), { code: 'IDENTITY_UPDATE_BUSY' });
  assert.equal(f.events.includes('disable'), false);
});

test('repository commits only the state owned by this update and records audit', async () => {
  let where, audit;
  const repository = new KeycloakIdentityRepository({ prisma: { $transaction: fn => fn({
    usuario: { updateMany: async options => { where = options.where; return { count: 1 }; } },
    securityAuditEvent: { create: async ({ data }) => { audit = data; } },
  }) } });
  await repository.finishUpdate({ user_id: 2, subject: 'target', issuer: 'issuer', updateState: 'Actualizando:unique' },
    { estado_usuario: 'Activo' }, 1);
  assert.equal(where.estado_usuario, 'Actualizando:unique');
  assert.equal(audit.actor_user_id, 1);
  assert.equal(audit.outcome, 'updated');
});

test('PATCH updates the authenticated target and rejects unexpected request fields', async t => {
  const f = fixture();
  const app = express();
  app.use(express.json());
  app.use(createKeycloakIdentityPreparationRouter({ service: f.service, authenticate: (req, _res, next) => {
    req.identityProvider = 'keycloak';
    req.auth = { payload: { sub: context.subject, [ROLES_CLAIM]: [context.role], permissions: context.permissions } };
    next();
  } }));
  const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  t.after(() => { server.closeAllConnections(); server.close(); });
  const send = body => fetch(`http://127.0.0.1:${server.address().port}/identities/target`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const accepted = await send({ pin: context.pin, identity: input });
  assert.equal(accepted.status, 200);
  assert.equal((await accepted.json()).outcome, 'user_updated');
  assert.equal(accepted.headers.get('cache-control'), 'no-store');
  const rejected = await send({ pin: context.pin, identity: input, password: 'unexpected' });
  assert.equal(rejected.status, 400);
});

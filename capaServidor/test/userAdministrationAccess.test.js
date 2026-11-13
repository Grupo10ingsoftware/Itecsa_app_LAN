import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';
import { BUSINESS_ADMIN_ROLES, ASSIGNABLE_ROLES, ROLES, ROLE_PERMISSIONS, PERMISSIONS,
  ROLES_CLAIM, can, manageableRoles, roleFromPayload } from '../../shared/authorization.js';
import { normalizeKeycloakClaims } from '../src/middlewares/keycloakClaims.js';
import { createKeycloakIdentityPreparationRouter } from '../src/modules/users/routes/keycloakIdentityPreparation.routes.js';
import { KeycloakIdentityAdministrationService } from '../src/modules/users/service/keycloakIdentityAdministration.service.js';
import { isValidVerifiedIdentity } from '../../capaVista/src/app/providers/verifiedIdentity.js';

const payload = (role, permissions = ROLE_PERMISSIONS[role]) => ({
  sub: 'actor', typ: 'Bearer', azp: 'itecsa-web', permissions,
  resource_access: { 'itecsa-api-v1': { roles: [role] } },
});
const normalize = value => normalizeKeycloakClaims(value, 'itecsa-web', 'itecsa-api-v1');

test('each departmental administrator inherits every support capability and can manage all ordinary roles', () => {
  for (const role of BUSINESS_ADMIN_ROLES) {
    for (const permission of ROLE_PERMISSIONS[ROLES.SOPORTE]) assert.equal(can(role, ROLE_PERMISSIONS[role], permission), true);
    assert.deepEqual(manageableRoles(role), ASSIGNABLE_ROLES);
    const verified = normalize(payload(role));
    assert.equal(roleFromPayload(verified), role);
    assert.equal(can(role, verified.permissions, PERMISSIONS.MANAGE_USERS), true);
    assert.equal(can(role, [], PERMISSIONS.MANAGE_USERS), false, 'stale tokens require renewal');
  }
  for (const role of [ROLES.PRODUCCION, ROLES.VENTAS, ROLES.COBRANZAS, ROLES.GERENCIA]) {
    assert.equal(can(role, [PERMISSIONS.MANAGE_USERS], PERMISSIONS.MANAGE_USERS), false);
    assert.deepEqual(manageableRoles(role), []);
  }
  assert.equal(can(ROLES.DESARROLLADOR, ROLE_PERMISSIONS[ROLES.DESARROLLADOR], PERMISSIONS.MANAGE_USERS), true);
});

test('disabled support is rejected even with previously issued roles and permissions', () => {
  const oldToken = payload(ROLES.SOPORTE);
  assert.equal(normalize(oldToken), null);
  assert.equal(roleFromPayload({ [ROLES_CLAIM]: [ROLES.SOPORTE] }), null);
  for (const permission of ROLE_PERMISSIONS[ROLES.SOPORTE]) assert.equal(can(ROLES.SOPORTE, oldToken.permissions, permission), false);
  assert.deepEqual(manageableRoles(ROLES.SOPORTE), []);
  assert.equal(isValidVerifiedIdentity({ sub: 'actor', rolUsuario: ROLES.SOPORTE, permissions: oldToken.permissions,
    identityProvider: 'keycloak', authorizationPolicy: 'itecsa-keycloak-v1', estadoUsuario: 'Activo' },
  { subject: 'actor' }), false);
});

const endpoints = [
  ['GET', '/users', 'list'], ['GET', '/users/summary', 'summary'],
  ['GET', '/users/target/movements', 'movements'],
  ['GET', '/identities/by-username/target', 'findByUsername'],
  ['GET', '/identities/target', 'inspect'],
  ['PATCH', '/identities/target', 'update', { identity: {}, pin: '1234' }],
  ['POST', '/identities/prepare', 'prepare', { identity: {}, pin: '1234' }],
  ['POST', '/operations/operation/reconcile', 'reconcile', { pin: '1234' }],
  ['POST', '/operations/status', 'creationStatus', { identity: {} }],
];
test('the complete users HTTP API admits all three administrators and rejects non-administrators', async t => {
  const calls = [];
  const service = Object.fromEntries(endpoints.map(([, , name]) => [name, async context => {
    calls.push({ name, context });
    return { outcome: 'user_created' };
  }]));
  let role = ROLES.ADMINISTRADOR;
  let permissions;
  const app = express();
  app.use(express.json());
  app.use(createKeycloakIdentityPreparationRouter({
    service,
    authenticate(req, res, next) {
      const normalized = normalize(payload(role, permissions ?? ROLE_PERMISSIONS[role]));
      if (!normalized) return res.sendStatus(403);
      req.auth = { payload: normalized };
      req.identityProvider = 'keycloak';
      next();
    },
  }));
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  await once(server, 'listening');
  const request = async ([method, path, , body]) => fetch('http://127.0.0.1:' + server.address().port + path, {
    method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  for (role of [...BUSINESS_ADMIN_ROLES, ROLES.DESARROLLADOR]) {
    for (const endpoint of endpoints) {
      const response = await request(endpoint);
      assert.ok(response.ok, role + ' ' + endpoint[0] + ' ' + endpoint[1] + ': ' + response.status);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(calls.at(-1).name, endpoint[2]);
      assert.equal(calls.at(-1).context.role, role);
    }
  }
  const before = calls.length;
  for (role of [ROLES.PRODUCCION, ROLES.VENTAS, ROLES.COBRANZAS, ROLES.GERENCIA, ROLES.SOPORTE]) {
    permissions = [PERMISSIONS.MANAGE_USERS];
    for (const endpoint of endpoints) assert.equal((await request(endpoint)).status, 403);
  }
  role = ROLES.ADMINISTRADOR;
  permissions = [];
  for (const endpoint of endpoints) assert.equal((await request(endpoint)).status, 403);
  assert.equal(calls.length, before, 'forbidden requests never reach administrative operations');
});

test('administrators still need an active local identity and their personal PIN for mutations', async () => {
  for (const role of BUSINESS_ADMIN_ROLES) {
    let activeRole = role;
    let state = 'Activo';
    let checked = 0;
    const service = new KeycloakIdentityAdministrationService({
      management: {},
      repository: { async actor() { return { id_usuario: 7, rol_usuario: activeRole, estado_usuario: state }; } },
      pins: { async validate(subject, pin) {
        checked++;
        assert.equal(subject, 'actor');
        if (pin !== '1234') throw Error('PIN_INVALID');
        return { idUsuario: 7 };
      } },
    });
    const context = { provider: 'keycloak', subject: 'actor', role, permissions: ROLE_PERMISSIONS[role] };
    assert.equal(await service.authorize(context), 7);
    assert.equal(await service.authorize({ ...context, pin: '1234' }, { mutation: true }), 7);
    assert.equal(checked, 1);
    await assert.rejects(service.authorize(context, { mutation: true }), /PIN_INVALID/);
    state = 'Desvinculado';
    await assert.rejects(service.authorize(context), { code: 'IDENTITY_ADMIN_FORBIDDEN' });
    state = 'Activo';
    activeRole = ROLES.VENTAS;
    await assert.rejects(service.authorize(context), { code: 'IDENTITY_ADMIN_FORBIDDEN' });
  }
});

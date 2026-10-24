import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeKeycloakClaims } from '../src/middlewares/keycloakClaims.js';
import { ROLES_CLAIM } from '../../shared/authorization.js';
import { createVerifyAuthSessionHandler } from '../src/modules/auth/controller/auth.controller.js';
import { createRequireActiveIdentity } from '../src/middlewares/requireActiveIdentity.js';

const claims = { typ: 'Bearer', azp: 'itecsa-web', sub: 'pilot-id', realm_access: { roles: ['default-roles-itecsa', 'Soporte'] },
  resource_access: { 'itecsa-api-v1': { roles: ['Desarrollador'] } },
  permissions: ['read:own-profile', 'read:orders', 'view:metrics'] };
const normalize = payload => normalizeKeycloakClaims(payload, 'itecsa-web', 'itecsa-api-v1');

test('Keycloak normaliza un unico rol ITECSA y conserva permisos emitidos', () => {
  const normalized = normalize(claims);
  assert.deepEqual(normalized[ROLES_CLAIM], ['Desarrollador']);
  assert.deepEqual(normalized.permissions, claims.permissions);
});

test('Keycloak rechaza cliente, tipo, rol y permisos invalidos', () => {
  for (const invalid of [
    { azp: 'otro-cliente' }, { typ: 'ID' },
    { resource_access: { 'itecsa-api-v1': { roles: [] } } }, { resource_access: { 'itecsa-api-v1': { roles: ['Soporte', 'Gerencia'] } } },
    { permissions: undefined }, { permissions: ['read:own-profile', 5] },
  ]) assert.equal(normalize({ ...claims, ...invalid }), null);
});

test('verify acepta la cuenta piloto sin correo', async () => {
  const handler = createVerifyAuthSessionHandler();
  let status;
  let body;
  await handler({ identityProvider: 'keycloak', auth: { payload: normalize(claims) },
    currentUser: { nombreUsuario: 'Usuario', apellidoUsuario: 'Prueba', estadoUsuario: 'Activo' } },
  { status(code) { status = code; return this; }, json(value) { body = value; return this; } });
  assert.equal(status, 200);
  assert.equal(body.email, null);
  assert.equal(body.rolUsuario, 'Desarrollador');
});

test('Keycloak exige usuario local activo con el mismo rol y nunca consulta Auth0', async () => {
  let user = null;
  let auth0Calls = 0;
  const middleware = createRequireActiveIdentity({ repository: { async findByAuth0Id() { return user; } },
    async resolveAuth0Role() { auth0Calls++; return 'Soporte'; } });
  async function status() {
    let code;
    await middleware({ identityProvider: 'keycloak', auth: { payload: normalize(claims) } },
      { status(value) { code = value; return this; }, json() { return this; } }, () => { code = 200; });
    return code;
  }
  assert.equal(await status(), 403);
  user = { idAuth0: 'pilot-id', rolUsuario: 'Gerencia', estadoUsuario: 'Activo' };
  assert.equal(await status(), 403);
  user = { idAuth0: 'pilot-id', rolUsuario: 'Desarrollador', estadoUsuario: 'Activo' };
  assert.equal(await status(), 200);
  assert.equal(auth0Calls, 0);
});

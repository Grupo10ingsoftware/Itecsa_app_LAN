import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import express from 'express';
import { KeycloakIdentityRepository } from '../src/modules/users/repo/keycloakIdentity.repo.js';
import { KeycloakIdentityAdministrationService } from '../src/modules/users/service/keycloakIdentityAdministration.service.js';
import { createKeycloakIdentityPreparationRouter } from '../src/modules/users/routes/keycloakIdentityPreparation.routes.js';
import { ASSIGNABLE_ROLES, ROLE_PERMISSIONS, ROLES_CLAIM, BUSINESS_PERMISSIONS } from '../../shared/keycloakAuthorization.js';

const issuer = 'http://keycloak.invalid/realms/itecsa';
const support = { provider: 'keycloak', subject: 'support', role: 'Soporte', permissions: ROLE_PERMISSIONS.Soporte };

test('Users queries restrict issuer, provider and six assignable roles, including search, states and pagination', async () => {
  const observed = [];
  const repository = new KeycloakIdentityRepository({ prisma: { usuario: {
    findMany: async query => { observed.push(query); return [{ id_usuario: 9, id_auth0: 'worker',
      rol_usuario: 'Operario Produccion', estado_usuario: 'Activo', ExternalIdentity: { subject: 'worker', username: 'worker.2' } }]; },
    count: async ({ where }) => { observed.push({ where }); return 1; },
    groupBy: async query => { observed.push(query); return [
      { estado_usuario: 'Activo', _count: { _all: 2 } }, { estado_usuario: 'Pendiente rol', _count: { _all: 1 } },
      { estado_usuario: 'Desvinculado', _count: { _all: 1 } }]; },
  } } });
  const result = await repository.list(issuer, { page: 2, perPage: 10, search: 'worker.2', estadoUsuario: 'Vinculado', rolUsuario: 'Operario Produccion' });
  assert.equal(result.usuarios[0].username, 'worker.2');
  assert.equal(result.usuarios[0].idUsuarioAutenticacionExterna, 'worker');
  assert.equal(observed[0].skip, 10); assert.equal(observed[0].take, 10);
  assert.deepEqual(observed[0].where, observed[1].where);
  assert.deepEqual(observed[0].where.ExternalIdentity, { is: { provider: 'keycloak', issuer } });
  assert.deepEqual(observed[0].where.rol_usuario.in, [...ASSIGNABLE_ROLES]);
  assert.equal(observed[0].where.rol_usuario.equals, 'Operario Produccion');
  assert.deepEqual(observed[0].where.estado_usuario.in, ['Activo', 'Vinculado']);
  assert.ok(JSON.stringify(observed[0].where.OR).includes('username'));
  assert.deepEqual(await repository.summary(issuer), { totalUsuarios: 4, vinculados: 2, desvinculados: 1, pendientes: 0, pendientesRol: 1 });
  assert.deepEqual(observed[2].where, repository.userScope(issuer));
});

test('historical binding conflicts remain visible but cannot target identity operations or block the whole list', async () => {
  const repository = new KeycloakIdentityRepository({ prisma: { usuario: {
    findMany: async () => [{ id_auth0: 'legacy|wrong', ExternalIdentity: { subject: 'worker' } }], count: async () => 1,
  } } });
  const result = await repository.list(issuer, { page: 1, perPage: 10 });
  assert.equal(result.usuarios[0].identityBindingConflict, true);
  assert.equal(result.usuarios[0].idUsuarioAutenticacionExterna, null);
});

test('only active local Soporte reads Users; privileged targets and foreign/unbound identities are denied', async () => {
  let active = true, targetRole = 'Operario Produccion', historyCalls = 0, queryCalls = 0;
  const service = new KeycloakIdentityAdministrationService({
    management: { config: { issuer }, getUser: async () => ({ username: 'worker' }), roles: async () => [{ name: targetRole }] },
    repository: {
      actor: async () => ({ id_usuario: 1, rol_usuario: 'Soporte', estado_usuario: active ? 'Activo' : 'Desvinculado' }),
      list: async () => { queryCalls++; return {}; }, summary: async () => { queryCalls++; return {}; },
      binding: async (_issuer, subject) => subject === 'unbound' ? null : ({ user_id: 9, issuer, username: 'worker',
        Usuario: { id_auth0: subject, rol_usuario: targetRole } }),
      movements: async (id, filters) => { historyCalls++; assert.equal(id, 9); return filters; },
    },
    pins: { validate: async () => { throw Error('Read must never validate or change a PIN'); } },
  });
  for (const [role, permissions] of Object.entries(ROLE_PERMISSIONS)) {
    const context = { ...support, role, permissions };
    if (role === 'Soporte') { await service.list(context, {}); await service.summary(context); }
    else { await assert.rejects(service.list(context, {}), e => e.status === 403); await assert.rejects(service.summary(context), e => e.status === 403); }
  }
  assert.equal(queryCalls, 2);
  await service.movements(support, 'worker', { page: 1 }); assert.equal(historyCalls, 1);
  for (const role of ['Gerencia', 'Desarrollador', 'Soporte']) {
    targetRole = role;
    await assert.rejects(service.movements(support, 'worker', {}), e => e.status === 403);
    await assert.rejects(service.list(support, { rolUsuario: role }), e => e.status === 403);
  }
  await assert.rejects(service.movements(support, 'support', {}), e => e.status === 403);
  await assert.rejects(service.movements(support, 'unbound', {}), e => e.status === 403);
  for (const change of [{ provider: 'auth0' }, { permissions: [] }, { subject: '' }]) {
    await assert.rejects(service.list({ ...support, ...change }, {}), e => e.status === 403);
  }
  active = false;
  await assert.rejects(service.list(support, {}), e => e.status === 403);
  assert.equal(queryCalls, 2); assert.equal(historyCalls, 1);
});

test('Users routes enforce all nine roles and query validation; unsupported account writes remain absent', async t => {
  const calls = [];
  const authenticate = (req, res, next) => {
    const role = req.get('x-role');
    if (!ROLE_PERMISSIONS[role] || req.get('x-expired')) return res.sendStatus(401);
    req.identityProvider = 'keycloak';
    req.auth = { payload: { sub: 'actor', [ROLES_CLAIM]: [role], permissions: req.get('x-empty') ? [] : BUSINESS_PERMISSIONS } };
    next();
  };
  const service = Object.fromEntries(['list', 'summary', 'movements'].map(name => [name, async (...args) => { calls.push([name, ...args]); return { ok: true }; }]));
  const app = express(); app.use(express.json()); app.use('/identity', createKeycloakIdentityPreparationRouter({ authenticate, service }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}/identity`;
  for (const path of ['/users', '/users/summary', '/users/worker/movements']) {
    for (const role of Object.keys(ROLE_PERMISSIONS)) {
      assert.equal((await fetch(base + path, { headers: { 'x-role': role } })).status, role === 'Soporte' ? 200 : 403);
    }
    assert.equal((await fetch(base + path)).status, 401);
    assert.equal((await fetch(base + path, { headers: { 'x-role': 'Soporte', 'x-empty': '1' } })).status, 403);
    assert.equal((await fetch(base + path, { headers: { 'x-role': 'Soporte', 'x-expired': '1' } })).status, 401);
  }
  assert.equal(calls.length, 3);
  const headers = { 'x-role': 'Soporte' };
  assert.equal((await fetch(base + '/users?estadoUsuario=unknown', { headers })).status, 400);
  assert.equal((await fetch(base + '/users/worker/movements?search=' + 'x'.repeat(121), { headers })).status, 400);
  for (const path of ['/users/worker', '/users/worker/status', '/users/worker/temporary-password']) {
    assert.equal((await fetch(base + path, { method: 'PATCH', headers })).status, 404);
  }
  assert.equal(calls.length, 3);
});

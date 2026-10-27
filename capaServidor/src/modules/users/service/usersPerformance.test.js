import test from 'node:test';
import assert from 'node:assert/strict';
import { KeycloakIdentityAdministrationService } from './keycloakIdentityAdministration.service.js';
import { KeycloakManagementService } from './keycloakManagement.service.js';
import { KeycloakIdentityRepository } from '../repo/keycloakIdentity.repo.js';
import { UserMovementsRepository } from '../repo/userMovements.repo.js';
import { ROLES, PERMISSIONS } from '../../../../../shared/keycloakAuthorization.js';

const context = { provider: 'keycloak', subject: 'operator', role: ROLES.SOPORTE,
  permissions: [PERMISSIONS.MANAGE_USERS], pin: '123456', currentUser: {
    identitySubject: 'operator', idUsuario: 1, rolUsuario: ROLES.SOPORTE, estadoUsuario: 'Activo',
  } };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function fixture() {
  const events = [];
  let actor = { id_usuario: 1, rol_usuario: context.role, estado_usuario: 'Activo' };
  const binding = { subject: 'target', user_id: 2, issuer: 'issuer', username: 'user', Usuario: {
    id_usuario: 2, rol_usuario: ROLES.VENTAS, estado_usuario: 'Activo',
    nombre_usuario: 'Ana', apellido_usuario: 'Soto', correo_usuario: 'ana@example.test',
  } };
  const external = { id: 'target', username: 'user', firstName: 'Ana', lastName: 'Soto', email: 'ana@example.test', enabled: true };
  const repository = {
    actor: async () => { events.push('actor'); return actor; },
    list: async () => ({ usuarios: [], total: 0 }), summary: async () => ({ totalUsuarios: 0 }),
    binding: async () => structuredClone(binding),
    movements: async () => { events.push('movements'); return { records: [], total: 0 }; },
    beginUpdate: async () => { events.push('begin'); return { ...structuredClone(binding), updateState: 'Actualizando:test' }; },
    finishUpdate: async () => { events.push('commit'); },
  };
  const management = { config: { issuer: 'issuer' },
    getUser: async () => ({ ...external }), roles: async () => [{ name: ROLES.VENTAS }],
    setEnabled: async (_sub, value) => { events.push(value ? 'enable' : 'disable'); external.enabled = value; },
    logout: async () => { events.push('logout'); },
    updateAttributes: async (_sub, values) => { events.push(['attributes', values]); Object.assign(external, values); },
    replaceRole: async () => { events.push('role'); },
  };
  const pins = { validate: async () => { events.push('pin'); return { idUsuario: 1 }; } };
  const service = new KeycloakIdentityAdministrationService({ management, repository, pins });
  return { service, repository, management, pins, binding, external, events, revoke: () => { actor = { ...actor, estado_usuario: 'Desvinculado' }; } };
}

test('reads reuse only matching active middleware actor, with fresh fallback for internal callers', async () => {
  const f = fixture();
  await f.service.list(context, {}); await f.service.summary(context);
  assert.deepEqual(f.events, []);
  await f.service.summary({ ...context, currentUser: undefined });
  assert.deepEqual(f.events, ['actor']);
  for (const patch of [{ identitySubject: 'another' }, { idUsuario: 0 }, { idUsuario: '1' },
    { rolUsuario: ROLES.VENTAS }, { estadoUsuario: 'Desvinculado' }]) {
    await assert.rejects(f.service.summary({ ...context, currentUser: { ...context.currentUser, ...patch } }), { code: 'IDENTITY_ADMIN_FORBIDDEN' });
  }
});

test('inspection waits for both independent remote reads and rejects inconsistent targets before history', async () => {
  const f = fixture(), gate = deferred();
  let rolesStarted = false;
  f.management.getUser = async () => { await gate.promise; return f.external; };
  f.management.roles = async () => { rolesStarted = true; return [{ name: ROLES.VENTAS }]; };
  const pending = f.service.inspect(context, 'target');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(rolesStarted, true);
  gate.resolve(); assert.equal((await pending).subject, 'target');
  f.external.username = 'other';
  await assert.rejects(f.service.movements(context, 'target', {}), { code: 'IDENTITY_BINDING_CONFLICT' });
  assert.equal(f.events.includes('movements'), false);
  f.external.username = 'user'; f.binding.Usuario.estado_usuario = 'Desvinculado';
  assert.equal((await f.service.movements(context, 'target', {})).total, 0);
  await assert.rejects(f.service.inspect(context, 'operator'), { code: 'IDENTITY_SELF_TARGET_FORBIDDEN' });
  f.binding.Usuario.estado_usuario = 'Actualizando:another';
  await assert.rejects(f.service.inspect(context, 'target'), { code: 'IDENTITY_UPDATE_BUSY' });
});

test('actor is revalidated after remote username search despite trusted request identity', async () => {
  const f = fixture();
  f.management.findByUsername = async () => { f.revoke(); return { id: 'target' }; };
  await assert.rejects(f.service.findByUsername(context, 'user'), { code: 'IDENTITY_ADMIN_FORBIDDEN' });
});

const update = { firstName: 'Ana', lastName: 'Soto', email: 'ana@example.test', role: ROLES.VENTAS, state: 'Activo' };
test('no-attribute update keeps PIN, three fresh actor reads, logout, verification and commit', async () => {
  const f = fixture();
  assert.equal((await f.service.update(context, 'target', update)).outcome, 'user_updated');
  assert.deepEqual(f.events, ['actor', 'pin', 'actor', 'begin', 'disable', 'logout', 'actor', 'enable', 'commit']);
});
test('name-only update sends only changed attribute and commits after logout and revalidation', async () => {
  const f = fixture();
  await f.service.update(context, 'target', { ...update, firstName: 'Maria' });
  assert.deepEqual(f.events.find(Array.isArray), ['attributes', { firstName: 'Maria' }]);
  assert.ok(f.events.indexOf('logout') < f.events.findIndex(Array.isArray));
  assert.equal(f.events.at(-1), 'commit');
});
test('revocation during PIN cannot reach update lock or any remote write', async () => {
  const f = fixture();
  f.pins.validate = async () => { f.revoke(); return { idUsuario: 1 }; };
  await assert.rejects(f.service.update(context, 'target', update), { code: 'IDENTITY_ADMIN_FORBIDDEN' });
  assert.deepEqual(f.events, ['actor', 'actor']);
});
test('revocation during remote update is rejected before activation and success', async () => {
  const f = fixture();
  f.management.logout = async () => { f.revoke(); };
  await assert.rejects(f.service.update(context, 'target', update), { code: 'IDENTITY_ADMIN_FORBIDDEN' });
  assert.equal(f.events.includes('enable'), false); assert.equal(f.events.includes('commit'), false);
});
test('parameterized page preserves wildcard input, role/status scope and independent canonical count', async () => {
  let sql, countWhere;
  const prisma = { $queryRaw: async query => { sql = query; return [{ id_usuario: 3, subject: 's', username: 'u', estado_usuario: 'Actualizando:123' }]; },
    usuario: { count: async ({ where }) => { countWhere = where; return 11; } } };
  const repo = new KeycloakIdentityRepository({ prisma });
  const data = await repo.list('issuer', { page: 2, perPage: 10, search: "x%' OR 1=1 --", estadoUsuario: 'Vinculado', rolUsuario: ROLES.VENTAS });
  assert.equal(sql.sql.includes("x%'"), false);
  assert.ok(sql.values.includes("%x%' OR 1=1 --%"));
  assert.deepEqual(sql.values.slice(-2), [10, 10]);
  assert.equal(countWhere.ExternalIdentity.is.issuer, 'issuer');
  assert.equal(countWhere.OR.length, 5); assert.ok(countWhere.estado_usuario.in.includes('Activo'));
  assert.equal(data.usuarios[0].estadoUsuario, 'Actualizando'); assert.equal(data.total, 11);
});
test('history projection preserves date, relation presence, null defaults, priority and JavaScript trimming', async () => {
  let sql, where;
  const date = new Date('2026-01-01T00:00:00Z');
  const rows = [
    { ID_REGISTRO: 5, FECHA_HORA: date, paymentId: 5, paymentName: null, stageId: 5, stageName: 'other', subprocessId: null },
    { ID_REGISTRO: 4, FECHA_HORA: date, paymentId: null, stageId: 4, stageName: null, subprocessId: null },
    { ID_REGISTRO: 3, FECHA_HORA: date, paymentId: null, stageId: null, subprocessId: 3, subprocessName: 'Diseño' },
    { ID_REGISTRO: 2, FECHA_HORA: date, paymentId: null, stageId: null, subprocessId: null, observacion: '\u00a0 Acción \n' },
    { ID_REGISTRO: 1, FECHA_HORA: date, paymentId: null, stageId: null, subprocessId: null, observacion: '  ' },
  ];
  const repo = new UserMovementsRepository({ prisma: { $queryRaw: async query => { sql = query; return rows; },
    registros: { count: async input => { where = input.where; return 5; } } } });
  const result = await repo.list(2, { page: 1, perPage: 10, search: 'Subproceso: Diseño' });
  assert.deepEqual(result.records.map(r => r.detail), ['Estado de pago: No informado', 'Etapa del pedido: No informada', 'Subproceso: Diseño', 'Acción', 'Actividad del pedido']);
  assert.equal(result.records[0].dateTime, date); assert.equal(where.id_usuario, 2);
  assert.ok(sql.values.includes('%Diseño%'));
  await assert.rejects(repo.list(-1, {}), { code: 'USER_NOT_FOUND' });
});

const env = { APP_ENV: 'test', KEYCLOAK_ISSUER: 'https://identity.example.test/realms/itecsa',
  KEYCLOAK_ROLE_CLIENT_ID: 'roles', KEYCLOAK_CLIENT_ID: 'web', KEYCLOAK_ADMIN_CLIENT_ID: 'technical', KEYCLOAK_ADMIN_CLIENT_SECRET: 'test-only' };
test('client UUID discovery shares only in-flight lookup, clears failure and permits a later retry', async () => {
  const service = new KeycloakManagementService({ env });
  const gate = deferred(); let calls = 0;
  service.request = async () => { calls++; await gate.promise; throw Error('unavailable'); };
  const first = service.roleClient(), second = service.roleClient();
  gate.resolve(); await assert.rejects(first); await assert.rejects(second); assert.equal(calls, 1);
  service.request = async () => { calls++; return { data: [{ clientId: 'roles', id: 'uuid' }] }; };
  assert.deepEqual(await Promise.all([service.roleClient(), service.roleClient()]), ['uuid', 'uuid']);
  assert.equal(calls, 2);
});
test('credential reads are concurrent and both password metadata and required action remain mandatory', async () => {
  const service = new KeycloakManagementService({ env }), gate = deferred(); let credentialsStarted = false;
  service.getUser = async () => { await gate.promise; return { requiredActions: ['UPDATE_PASSWORD'] }; };
  service.request = async () => { credentialsStarted = true; return { data: [{ type: 'password' }] }; };
  const result = service.hasTemporaryPassword('target'); await new Promise(resolve => setImmediate(resolve));
  assert.equal(credentialsStarted, true); gate.resolve(); assert.equal(await result, true);
  service.getUser = async () => ({ requiredActions: [] }); assert.equal(await service.hasTemporaryPassword('target'), false);
  service.getUser = async () => ({ requiredActions: ['UPDATE_PASSWORD'] });
  service.request = async () => ({ data: [] }); assert.equal(await service.hasTemporaryPassword('target'), false);
  let fetches = 0;
  const invalidSubject = new KeycloakManagementService({ env, fetcher: async () => { fetches++; throw Error('Unexpected I/O'); } });
  await assert.rejects(invalidSubject.hasTemporaryPassword('../target'), { code: 'KEYCLOAK_INVALID_INPUT' });
  assert.equal(fetches, 0);
});
test('role reads start after disabled guard; DELETE, POST, verification stay sequential', async () => {
  const service = new KeycloakManagementService({ env }), gate = deferred(), events = [];
  service.getUser = async () => { events.push('guard'); return { enabled: false }; };
  let roleCalls = 0;
  service.roles = async (_subject, options) => { const n = ++roleCalls; events.push(options ? 'direct' : n === 3 ? 'verify' : 'effective');
    if (n === 1) await gate.promise; return [{ name: n === 3 ? ROLES.COBRANZAS : ROLES.VENTAS, id: 'r' }]; };
  service.roleRepresentation = async () => { events.push('target'); return { name: ROLES.COBRANZAS, id: 'next' }; };
  service.roleClient = async () => 'uuid';
  service.request = async (_path, options) => { events.push(options.method); return {}; };
  const result = service.replaceRole('target', ROLES.COBRANZAS);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(events, ['guard', 'effective', 'direct', 'target']);
  gate.resolve(); await result;
  assert.deepEqual(events.slice(-3), ['DELETE', 'POST', 'verify']);
  events.length = 0; service.getUser = async () => ({ enabled: true });
  await assert.rejects(service.replaceRole('target', ROLES.VENTAS), { code: 'KEYCLOAK_ROLE_CHANGE_REQUIRES_DISABLED' });
  assert.deepEqual(events, []);
});
for (const invalidSource of ['effective', 'direct']) {
  test(`forbidden ${invalidSource} role still prevents DELETE/POST after concurrent reads`, async () => {
    const service = new KeycloakManagementService({ env }); let writes = 0;
    service.getUser = async () => ({ enabled: false });
    service.roles = async (_subject, options) => [{ name: (options ? 'direct' : 'effective') === invalidSource ? ROLES.SOPORTE : ROLES.VENTAS, id: 'r' }];
    service.roleRepresentation = async () => ({ id: 'next', name: ROLES.COBRANZAS });
    service.roleClient = async () => 'uuid'; service.request = async () => { writes++; return {}; };
    await assert.rejects(service.replaceRole('target', ROLES.COBRANZAS), { code: 'KEYCLOAK_TARGET_FORBIDDEN' });
    assert.equal(writes, 0);
  });
}

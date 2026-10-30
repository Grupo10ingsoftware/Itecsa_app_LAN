// No dotenv, sockets, business DB or real identity provider. Only orchestration is measured.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { KeycloakIdentityAdministrationService } from '../src/modules/users/service/keycloakIdentityAdministration.service.js';
import { KeycloakManagementService } from '../src/modules/users/service/keycloakManagement.service.js';
import { ROLES, PERMISSIONS } from '../../shared/keycloakAuthorization.js';
const arg = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const variant = arg('variant');
if (!arg('reference-root') && !['before', 'after'].includes(variant)) throw Error('--reference-root or --variant=before|after is required');
const sampleCount = Number(arg('samples') ?? 10);
if (!Number.isSafeInteger(sampleCount) || sampleCount < 1 || sampleCount > 100) throw Error('--samples must be 1..100');
const load = file => import(pathToFileURL(resolve(arg('reference-root'), 'capaServidor/src/modules/users/service', file)).href);
const BeforeService = arg('reference-root') ? (await load('keycloakIdentityAdministration.service.js')).KeycloakIdentityAdministrationService : null;
const BeforeManagement = arg('reference-root') ? (await load('keycloakManagement.service.js')).KeycloakManagementService : null;
const issuer = 'https://synthetic.invalid/realms/itecsa';
const env = { APP_ENV: 'test', KEYCLOAK_ISSUER: issuer, KEYCLOAK_CLIENT_ID: 'web', KEYCLOAK_ROLE_CLIENT_ID: 'roles',
  KEYCLOAK_ADMIN_CLIENT_ID: 'technical', KEYCLOAK_ADMIN_CLIENT_SECRET: 'synthetic-only-never-sent' };
const context = { provider: 'keycloak', subject: 'actor', role: ROLES.SOPORTE,
  permissions: [PERMISSIONS.MANAGE_USERS], pin: '123456', currentUser: {
    idUsuario: 1, identitySubject: 'actor', rolUsuario: ROLES.SOPORTE, estadoUsuario: 'Activo',
  } };
const id = '00000000-0000-4000-8000-000000000001';
const input = { username: 'ana.soto', firstName: 'Ana', lastName: 'Soto', email: 'ana@example.test', rut: '12345678-5', role: ROLES.VENTAS };
const delay = () => new Promise(resolve => setTimeout(resolve, 5));
function fixture(Service, Management, scenario) {
  const calls = {}, events = []; let actorReads = 0, passwordWrites = 0;
  const creating = scenario === 'create', reconciling = scenario.startsWith('reconcile');
  let external = creating ? null : { id: 'target', username: input.username, firstName: input.firstName,
    lastName: input.lastName, email: input.email, enabled: !reconciling,
    attributes: { itecsa_provision_id: [id] }, requiredActions: reconciling ? ['UPDATE_PASSWORD'] : [] };
  let passwordPresent = reconciling;
  let roles = creating || reconciling ? [] : [{ id: 'old-role', name: ROLES.VENTAS }];
  if (scenario === 'reconcile-assigned') roles = [{ id: 'next-role', name: input.role }];
  let operation = { id, issuer, username: input.username, input: { ...input }, revision: 0,
    state: reconciling ? 'needs_reconciliation' : 'pending', ...(reconciling ? { external_subject: 'target' } : {}) };
  const binding = { subject: 'target', user_id: 2, issuer, username: input.username, Usuario: { id_usuario: 2,
    nombre_usuario: input.firstName, apellido_usuario: input.lastName, correo_usuario: input.email,
    rol_usuario: ROLES.VENTAS, estado_usuario: 'Activo' } };
  const json = (data, status = 200, headers) => new Response(status === 204 ? null : JSON.stringify(data), { status, headers });
  const management = new Management({ env, fetcher: async (url, options) => {
    const u = new URL(url), method = options.method;
    const path = u.pathname.replace('/admin/realms/itecsa', '');
    const kind = path.endsWith('/token') ? 'token' : path === '/clients' ? 'clientUuid'
      : path.includes('/role-mappings/') ? 'roleMapping' : path.includes('/roles/') ? 'roleRepresentation'
        : path.endsWith('/credentials') ? 'credentialMetadata' : path.endsWith('/reset-password') ? 'password'
          : path.endsWith('/logout') ? 'logout' : path === '/users' ? 'users' : 'user';
    calls[method + ' ' + kind] = (calls[method + ' ' + kind] ?? 0) + 1; events.push(method + ' ' + kind);
    await delay();
    if (kind === 'token') return json({ access_token: 'synthetic-token', token_type: 'Bearer', expires_in: 300 });
    const body = options.body && !options.headers['content-type'].includes('x-www-form') ? JSON.parse(options.body) : null;
    if (kind === 'clientUuid') return json([{ id: 'role-client', clientId: 'roles' }]);
    if (kind === 'roleRepresentation') return json({ id: 'next-role', name: decodeURIComponent(path.split('/').at(-1)) });
    if (kind === 'roleMapping') {
      if (method === 'GET') return json(roles);
      if (method === 'DELETE') roles = [];
      if (method === 'POST') roles = body;
      return json(null, 204);
    }
    if (kind === 'users') {
      if (method === 'GET') return json(external ? [external] : []);
      assert.equal(body.enabled, false); external = { ...body, id: 'target', requiredActions: [] };
      return json(null, 201, { location: management.config.adminUrl + '/users/target' });
    }
    if (kind === 'password') {
      assert.equal(external.enabled, false); assert.equal(body.temporary, true);
      passwordWrites++; passwordPresent = true; external.requiredActions = ['UPDATE_PASSWORD']; return json(null, 204);
    }
    if (kind === 'credentialMetadata') return json(passwordPresent ? [{ type: 'password' }] : []);
    if (kind === 'logout') return json(null, 204);
    if (path === '/users/target') {
      if (method === 'GET') return json(external);
      if (body.enabled === true) assert.ok(events.includes('db.complete') || events.includes('db.beginUpdate'));
      Object.assign(external, body); return json(null, 204);
    }
    throw Error('UNEXPECTED_SYNTHETIC_ENDPOINT');
  } });
  const local = async event => { events.push(event); await delay(); };
  const repository = {
    actor: async () => { actorReads++; await local('db.actor'); return { id_usuario: 1, rol_usuario: context.role, estado_usuario: 'Activo' }; },
    binding: async () => { await local('db.binding'); return structuredClone(binding); },
    movements: async () => { await local('db.movements'); return { records: [], total: 0, page: 1, perPage: 10 }; },
    beginUpdate: async () => { await local('db.beginUpdate'); return { ...structuredClone(binding), updateState: 'Actualizando:test' }; },
    finishUpdate: async (_binding, values) => { await local('db.finishUpdate'); Object.assign(binding.Usuario, values); },
    claim: async ({ input: values, digest }) => { await local('db.claim'); operation.input = values; operation.payload_digest = digest; return structuredClone(operation); },
    operation: async () => { await local('db.operation'); return structuredClone(operation); },
    acquire: async () => { await local('db.acquire'); operation.state = 'running'; operation.revision++; return structuredClone(operation); },
    checkpoint: async (_op, subject) => { await local('db.checkpoint'); operation.external_subject = subject; },
    complete: async () => { assert.equal(external.enabled, false); await local('db.complete'); operation.local_user_id = 2; return structuredClone(operation); },
    finish: async () => { assert.equal(external.enabled, true); await local('db.finish'); operation.state = 'created'; return structuredClone(operation); },
    fail: async () => { throw Error('UNEXPECTED_WORKFLOW_FAILURE'); },
  };
  const pins = { validate: async () => { await local('pin.double'); return { idUsuario: 1 }; } };
  const service = new Service({ management, repository, pins });
  return { async run() {
    if (scenario === 'inspect') assert.equal((await service.inspect(context, 'target')).subject, 'target');
    else if (scenario === 'movements') assert.equal((await service.movements(context, 'target', { page: 1, perPage: 10 })).total, 0);
    else if (creating || reconciling) {
      const result = creating ? await service.prepare(context, input) : await service.reconcile(context, id);
      assert.equal(result.outcome, 'user_created'); assert.equal(external.enabled, true);
      assert.equal(passwordWrites, creating ? 1 : 0); assert.equal(Boolean(result.temporaryPassword), creating);
      assert.equal(roles.length, 1); assert.equal(roles[0].name, input.role);
    } else {
      const update = { firstName: input.firstName, lastName: input.lastName, email: input.email, role: input.role, state: 'Activo',
        ...(scenario === 'update-name' ? { firstName: 'Maria' } : scenario === 'update-role' ? { role: ROLES.COBRANZAS }
          : scenario === 'update-state' ? { state: 'Desvinculado' } : {}) };
      assert.equal((await service.update(context, 'target', update)).outcome, 'user_updated');
      assert.equal(external.firstName, update.firstName); assert.equal(external.enabled, update.state === 'Activo');
      assert.equal(binding.Usuario.rol_usuario, update.role);
      assert.ok(events.indexOf('POST logout') < events.indexOf('db.finishUpdate'));
    }
    return { actorReads, repositoryCalls: events.filter(event => event.startsWith('db.')).length,
      checkpoints: events.filter(event => event === 'db.checkpoint').length,
      httpCalls: Object.values(calls).reduce((a, b) => a + b, 0), calls };
  } };
}
const output = { run: 'gestion-usuarios', reference: arg('commit') ?? 'unspecified', variant: variant ?? 'comparison', capturedAt: new Date().toISOString(), node: process.version,
  environment: 'SYNTHETIC / real administration+management services / fake fetch and DB+PIN / 5ms per IO / fresh cold fixture each sample',
  excludes: ['real network', 'MySQL', 'real PIN hashing', 'real Keycloak', 'HTTP middleware', 'UI/render'], samples: {} };
const versions = variant ? [[variant, KeycloakIdentityAdministrationService, KeycloakManagementService]]
  : [['before', BeforeService, BeforeManagement], ['after', KeycloakIdentityAdministrationService, KeycloakManagementService]];
for (const scenario of ['inspect', 'movements', 'create', 'reconcile', 'reconcile-assigned', 'update-name', 'update-role', 'update-state', 'update-noop']) {
  for (const [version, Service, Management] of versions) {
    const values = [];
    for (let i = 0; i < sampleCount; i++) {
      const f = fixture(Service, Management, scenario), start = performance.now(); const counts = await f.run();
      values.push({ ms: +(performance.now() - start).toFixed(3), ...counts });
    }
    const sorted = values.map(v => v.ms).sort((a, b) => a - b);
    const middle = Math.floor(sampleCount / 2);
    output.samples[scenario + '_' + version] = { n: sampleCount, minMs: sorted[0],
      medianMs: +(sampleCount % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2).toFixed(3),
      ...(sampleCount >= 30 ? { p95Ms: sorted[Math.ceil(sampleCount * 0.95) - 1] } : {}),
      meanMs: +(sorted.reduce((a, b) => a + b, 0) / sampleCount).toFixed(3), maxMs: sorted.at(-1), values };
  }
}
const json = JSON.stringify(output, null, 2) + '\n';
if (arg('output')) await writeFile(arg('output'), json); else process.stdout.write(json);

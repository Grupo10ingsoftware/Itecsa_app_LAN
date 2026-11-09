import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRealm } from './render-realm.mjs';
import { bootstrap } from './post-bootstrap.mjs';
import { RECOGNIZED_ROLES, BUSINESS_PERMISSIONS, ROLE_PERMISSIONS } from '../../shared/keycloakAuthorization.js';

// These tests exercise the import/bootstrap contract against a strict Admin API
// fixture. They do not claim to emulate Keycloak's actual token issuance.
const origin = 'https://itecsa.example.test';
const expectedUsernameMapper = {
  name: 'Username', protocol: 'openid-connect', protocolMapper: 'oidc-usermodel-property-mapper',
  consentRequired: false,
  config: {
    'user.attribute': 'username', 'claim.name': 'preferred_username', 'jsonType.label': 'String',
    'access.token.claim': 'true', 'id.token.claim': 'false',
    'userinfo.token.claim': 'false', 'introspection.token.claim': 'false',
  },
};
const legacyMappers = [
  { id: 'application-roles', name: 'Application roles', config: { 'claim.name': 'resource_access.itecsa-api-v1.roles' } },
  { id: 'permissions', name: 'ITECSA permissions', config: { 'claim.name': 'permissions' } },
  { id: 'audience', name: 'API audience', config: { 'included.custom.audience': 'https://api.itecsa.local' } },
];
const mapperPath = '/admin/realms/itecsa/clients/web/protocol-mappers/models';
const configuredMapper = () => ({ id: 'username', ...structuredClone(expectedUsernameMapper) });
const env = {
  PUBLIC_ORIGIN: origin,
  KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME: 'temporary-fixture',
  KEYCLOAK_OPERATOR_USERNAME: 'operator-fixture',
  // Deliberately synthetic; this fixture never authenticates against a server.
  KEYCLOAK_OPERATOR_PASSWORD: 'fixture-'.repeat(4),
};
const json = (value, status = 200) => Response.json(value, { status });

function fixture({ usernameMappers = [], createStatus = 201, persistCreated = true, alterCreated, alterLegacy } = {}) {
  const calls = [];
  const mappers = structuredClone(legacyMappers);
  alterLegacy?.(mappers);
  mappers.push(...structuredClone(usernameMappers));
  const clients = {
    'itecsa-web': { id: 'web', clientId: 'itecsa-web', publicClient: true, directAccessGrantsEnabled: false,
      redirectUris: [origin, origin + '/*'], attributes: { 'pkce.code.challenge.method': 'S256' } },
    'itecsa-pin-recovery': { id: 'pin', clientId: 'itecsa-pin-recovery',
      redirectUris: [origin + '/auth/pin-recovery/callback'],
      attributes: { 'pkce.code.challenge.method': 'S256', login_theme: 'itecsa-pin-recovery' } },
    'itecsa-backend-admin': { id: 'backend', clientId: 'itecsa-backend-admin', publicClient: false, serviceAccountsEnabled: true },
    'itecsa-api-v1': { id: 'roles', clientId: 'itecsa-api-v1' },
    'itecsa-api': { id: 'capabilities', clientId: 'itecsa-api' },
    'realm-management': { id: 'management', clientId: 'realm-management' },
  };
  const roles = RECOGNIZED_ROLES.map((name, i) => ({ id: 'role-' + i, name }));
  const capabilities = BUSINESS_PERMISSIONS.map((name, i) => ({ id: 'capability-' + i, name, containerId: 'capabilities' }));
  const management = ['query-users', 'view-users', 'manage-users', 'view-clients'].map(name => ({ id: name, name }));
  const assigned = new Map([
    ['/clients/web/scope-mappings/clients/roles', roles],
    ['/clients/web/scope-mappings/clients/capabilities', capabilities],
    ['/users/service-account/role-mappings/clients/management', management],
    ['/clients/backend/scope-mappings/clients/management', management],
  ]);
  const realm = {
    realm: 'itecsa', sslRequired: 'all', registrationAllowed: false, resetPasswordAllowed: false,
    bruteForceProtected: true, loginTheme: 'itecsa',
    passwordPolicy: 'length(8) and upperCase(1) and lowerCase(1) and digits(1) and specialChars(1)',
    attributes: { itecsaBootstrapVersion: '1' },
  };
  const fetcher = async (input, options = {}) => {
    const url = new URL(input);
    assert.equal(url.origin, origin, 'bootstrap must stay on the configured origin');
    const method = options.method ?? 'GET';
    const pathname = url.pathname;
    if (pathname === '/realms/master/protocol/openid-connect/token') {
      assert.equal(method, 'POST');
      assert.equal(options.body.get('username'), env.KEYCLOAK_OPERATOR_USERNAME);
      assert.equal(options.body.get('client_id'), 'admin-cli');
      calls.push({ method, pathname });
      return json({ access_token: 'fixture-admin-token' });
    }
    assert.equal(options.headers?.authorization, 'Bearer fixture-admin-token');
    const body = options.body === undefined ? undefined : JSON.parse(options.body);
    calls.push({ method, pathname, ...(body === undefined ? {} : { body }) });
    if (pathname === mapperPath && method === 'POST') {
      assert.deepEqual(body, expectedUsernameMapper, 'only the intended username mapper may be created');
      if (createStatus >= 400) return json({ error: 'fixture request failure' }, createStatus);
      if (persistCreated) {
        const created = { id: 'created-username', ...structuredClone(body) };
        alterCreated?.(created);
        mappers.push(created);
      }
      return new Response(null, { status: createStatus });
    }
    if (method !== 'GET') throw Error(`Unexpected fixture mutation: ${method} ${pathname}`);
    if (pathname.startsWith('/admin/realms/master')) {
      const resource = pathname.slice('/admin/realms/master'.length);
      if (resource === '/users') return json(url.searchParams.get('username') === env.KEYCLOAK_OPERATOR_USERNAME
        ? [{ id: 'operator', username: env.KEYCLOAK_OPERATOR_USERNAME }] : []);
      if (resource === '/users/operator/role-mappings/realm') return json([{ id: 'admin', name: 'admin' }]);
      if (resource === '/users/operator') return json({ id: 'operator', username: env.KEYCLOAK_OPERATOR_USERNAME });
      throw Error(`Unexpected master fixture read: ${resource}`);
    }
    assert.ok(pathname.startsWith('/admin/realms/itecsa'));
    const resource = pathname.slice('/admin/realms/itecsa'.length);
    if (resource === '') return json(realm);
    if (resource === '/authentication/required-actions') return json([{ alias: 'UPDATE_PASSWORD', providerId: 'UPDATE_PASSWORD', enabled: true }]);
    if (resource === '/clients') {
      const client = clients[url.searchParams.get('clientId')];
      return json(client ? [client] : []);
    }
    const client = Object.values(clients).find(value => resource === '/clients/' + value.id);
    if (client) return json(client);
    if (resource === '/clients/web/protocol-mappers/models') return json(mappers);
    if (resource === '/clients/web/default-client-scopes') return json([{ id: 'basic', name: 'basic' }]);
    if (resource === '/clients/roles/roles') return json(roles);
    if (resource === '/clients/capabilities/roles') return json(capabilities);
    if (resource === '/clients/management/roles') return json(management);
    const composite = /^\/clients\/roles\/roles\/([^/]+)\/composites$/.exec(resource);
    if (composite) {
      const desired = ROLE_PERMISSIONS[decodeURIComponent(composite[1])];
      assert.ok(desired, 'unknown role composite');
      return json(capabilities.filter(role => desired.includes(role.name)));
    }
    if (assigned.has(resource)) return json(assigned.get(resource));
    if (resource === '/clients/backend/service-account-user') return json({ id: 'service-account' });
    if (resource === '/users/profile') return json({ attributes: [{ name: 'itecsa_provision_id', multivalued: false,
      permissions: { view: ['admin'], edit: ['admin'] }, validations: { length: { max: 36 } } }] });
    throw Error(`Unexpected fixture read: ${resource}`);
  };
  const mutations = () => calls.filter(call => call.method !== 'GET' && call.pathname.startsWith('/admin/'));
  return { calls, mappers, fetcher, mutations };
}

test('new realm exposes only username in the web access token without broadening public scopes', () => {
  const realm = buildRealm({ origin, adminClientSecret: 'fixture-'.repeat(5) });
  const web = realm.clients.find(client => client.clientId === 'itecsa-web');
  const username = web.protocolMappers.filter(mapper => mapper.name === 'Username');
  assert.deepEqual(username, [expectedUsernameMapper]);
  assert.deepEqual(web.protocolMappers.map(mapper => mapper.name).sort(), ['API audience', 'Application roles', 'ITECSA permissions', 'Username']);
  for (const client of realm.clients.filter(client => client.publicClient)) {
    assert.deepEqual(client.defaultClientScopes, ['basic']);
    assert.deepEqual(client.optionalClientScopes, []);
    assert.equal(client.fullScopeAllowed, false);
    assert.equal(client.directAccessGrantsEnabled, false);
  }
  for (const client of realm.clients.filter(client => client.clientId !== 'itecsa-web')) {
    assert.ok(!client.protocolMappers?.some(mapper => mapper.config?.['claim.name'] === 'preferred_username'));
  }
  assert.equal(realm.editUsernameAllowed, false);
});

test('check detects an existing realm missing username without changing configuration', async () => {
  const state = fixture();
  await assert.rejects(bootstrap(env, state.fetcher, { readOnly: true }), /KEYCLOAK_BOOTSTRAP/);
  assert.deepEqual(state.mutations(), []);
  assert.deepEqual(state.mappers, legacyMappers);
});

test('existing realm receives one mapper, confirms readback, and is idempotent on configure and check', async () => {
  const state = fixture();
  await bootstrap(env, state.fetcher);
  assert.deepEqual(state.mutations(), [{ method: 'POST', pathname: mapperPath, body: expectedUsernameMapper }]);
  assert.deepEqual(state.mappers.slice(0, legacyMappers.length), legacyMappers);
  assert.equal(state.mappers.filter(mapper => mapper.name === 'Username').length, 1);
  const createdAt = state.calls.findIndex(call => call.method === 'POST' && call.pathname === mapperPath);
  assert.ok(state.calls.slice(createdAt + 1).some(call => call.method === 'GET' && call.pathname === mapperPath), 'the newly created mapper must be read back');
  await bootstrap(env, state.fetcher);
  await bootstrap(env, state.fetcher, { readOnly: true });
  assert.equal(state.mutations().length, 1, 'repeated runs must not create, update, or duplicate configuration');
});

test('check accepts an already configured mapper returned with a server identifier', async () => {
  const state = fixture({ usernameMappers: [configuredMapper()] });
  await bootstrap(env, state.fetcher, { readOnly: true });
  assert.deepEqual(state.mutations(), []);
});

const incompatibleMappers = [
  ['protocol', mapper => { mapper.protocol = 'saml'; }],
  ['mapper implementation', mapper => { mapper.protocolMapper = 'oidc-hardcoded-claim-mapper'; }],
  ['consent', mapper => { mapper.consentRequired = true; }],
  ['user property', mapper => { mapper.config['user.attribute'] = 'email'; }],
  ['claim name', mapper => { mapper.config['claim.name'] = 'email'; }],
  ['JSON type', mapper => { mapper.config['jsonType.label'] = 'boolean'; }],
  ['missing access token claim', mapper => { mapper.config['access.token.claim'] = 'false'; }],
  ['extra ID token disclosure', mapper => { mapper.config['id.token.claim'] = 'true'; }],
  ['extra userinfo disclosure', mapper => { mapper.config['userinfo.token.claim'] = 'true'; }],
  ['extra introspection disclosure', mapper => { mapper.config['introspection.token.claim'] = 'true'; }],
];
for (const [label, alter] of incompatibleMappers) {
  test(`incompatible Username mapper (${label}) fails without changing realm in either mode`, async () => {
    for (const readOnly of [true, false]) {
      const mapper = configuredMapper();
      alter(mapper);
      const state = fixture({ usernameMappers: [mapper] });
      await assert.rejects(bootstrap(env, state.fetcher, { readOnly }), /KEYCLOAK_BOOTSTRAP/);
      assert.deepEqual(state.mutations(), []);
      assert.deepEqual(state.mappers.at(-1), mapper);
    }
  });
}

test('duplicate Username mappers are rejected instead of selecting one arbitrarily', async () => {
  const state = fixture({ usernameMappers: [configuredMapper(), { ...configuredMapper(), id: 'duplicate' }] });
  await assert.rejects(bootstrap(env, state.fetcher), /KEYCLOAK_BOOTSTRAP/);
  assert.deepEqual(state.mutations(), []);
});

test('an unrelated mapper claiming preferred_username is rejected without adding a competing mapper', async () => {
  const state = fixture({ usernameMappers: [{ ...configuredMapper(), name: 'Unexpected username mapper' }] });
  await assert.rejects(bootstrap(env, state.fetcher), /KEYCLOAK_BOOTSTRAP/);
  assert.deepEqual(state.mutations(), []);
});

test('incompatible existing audience is rejected before attempting the username addition', async () => {
  const state = fixture({ alterLegacy(mappers) { mappers.find(mapper => mapper.name === 'API audience').config['included.custom.audience'] = 'wrong-audience'; } });
  await assert.rejects(bootstrap(env, state.fetcher), /KEYCLOAK_BOOTSTRAP/);
  assert.deepEqual(state.mutations(), []);
});

test('failed mapper creation remains an error and does not report a configured realm', async () => {
  const state = fixture({ createStatus: 500 });
  await assert.rejects(bootstrap(env, state.fetcher), /KEYCLOAK_BOOTSTRAP.*HTTP 500/);
  assert.equal(state.mutations().length, 1);
  assert.deepEqual(state.mappers, legacyMappers);
});

test('successful HTTP creation without persistence is rejected by readback', async () => {
  const state = fixture({ persistCreated: false });
  await assert.rejects(bootstrap(env, state.fetcher), /KEYCLOAK_BOOTSTRAP/);
  assert.equal(state.mutations().length, 1);
  assert.deepEqual(state.mappers, legacyMappers);
});

test('mapper persisted with an incorrect property is rejected by readback', async () => {
  const state = fixture({ alterCreated(mapper) { mapper.config['user.attribute'] = 'email'; } });
  await assert.rejects(bootstrap(env, state.fetcher), /KEYCLOAK_BOOTSTRAP/);
  assert.equal(state.mutations().length, 1);
});

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
const expectedRegistrationMapper = {
  name: 'Account creation date', protocol: 'openid-connect', protocolMapper: 'oidc-usermodel-property-mapper',
  consentRequired: false,
  config: {
    'user.attribute': 'createdTimestamp', 'claim.name': 'itecsa_account_created_at_ms', 'jsonType.label': 'long',
    'access.token.claim': 'true', 'id.token.claim': 'false',
    'userinfo.token.claim': 'false', 'introspection.token.claim': 'false',
  },
};
const profileMappers = [expectedUsernameMapper, expectedRegistrationMapper];
const legacyMappers = [
  { id: 'application-roles', name: 'Application roles', config: { 'claim.name': 'resource_access.itecsa-api-v1.roles' } },
  { id: 'permissions', name: 'ITECSA permissions', config: { 'claim.name': 'permissions' } },
  { id: 'audience', name: 'API audience', config: { 'included.custom.audience': 'https://api.itecsa.local' } },
];
const mapperPath = '/admin/realms/itecsa/clients/web/protocol-mappers/models';
const configuredMapper = mapper => ({ id: 'configured-' + mapper.name, ...structuredClone(mapper) });
const env = {
  PUBLIC_ORIGIN: origin,
  KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME: 'temporary-fixture',
  KEYCLOAK_OPERATOR_USERNAME: 'operator-fixture',
  // Deliberately synthetic; this fixture never authenticates against a server.
  KEYCLOAK_OPERATOR_PASSWORD: 'fixture-'.repeat(4),
};
const json = (value, status = 200) => Response.json(value, { status });

function fixture({ existingMappers = [], createStatus = 201, persistCreated = true, alterCreated, alterLegacy, realmSettings = {}, localeStatus = 204, persistLocale = true } = {}) {
  const calls = [];
  const mappers = structuredClone(legacyMappers);
  alterLegacy?.(mappers);
  mappers.push(...structuredClone(existingMappers));
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
    internationalizationEnabled: true, supportedLocales: ['es'], defaultLocale: 'es',
    passwordPolicy: 'length(8) and upperCase(1) and lowerCase(1) and digits(1) and specialChars(1)',
    attributes: { itecsaBootstrapVersion: '1' },
    ...realmSettings,
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
    if (pathname === '/admin/realms/itecsa' && method === 'PUT') {
      assert.deepEqual(body, { internationalizationEnabled: true, supportedLocales: ['es'], defaultLocale: 'es' });
      if (localeStatus >= 400) return json({ error: 'fixture request failure' }, localeStatus);
      if (persistLocale) Object.assign(realm, body);
      return new Response(null, { status: localeStatus });
    }
    if (pathname === mapperPath && method === 'POST') {
      const expected = profileMappers.find(mapper => mapper.name === body?.name);
      assert.ok(expected, 'only the two intended profile mappers may be created');
      assert.deepEqual(body, expected);
      if (createStatus >= 400) return json({ error: 'fixture request failure' }, createStatus);
      if (persistCreated) {
        const created = { id: 'created-' + body.name, ...structuredClone(body) };
        alterCreated?.(created, mappers);
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
  return { calls, mappers, realm, fetcher, mutations };
}

test('new realm exposes username and account creation date only in the web access token without broadening scopes', () => {
  const realm = buildRealm({ origin, adminClientSecret: 'fixture-'.repeat(5) });
  const web = realm.clients.find(client => client.clientId === 'itecsa-web');
  for (const expected of profileMappers) {
    assert.deepEqual(web.protocolMappers.filter(mapper => mapper.name === expected.name), [expected]);
  }
  assert.deepEqual(web.protocolMappers.map(mapper => mapper.name).sort(),
    ['API audience', 'Account creation date', 'Application roles', 'ITECSA permissions', 'Username']);
  for (const client of realm.clients.filter(client => client.publicClient)) {
    assert.deepEqual(client.defaultClientScopes, ['basic']);
    assert.deepEqual(client.optionalClientScopes, []);
    assert.equal(client.fullScopeAllowed, false);
    assert.equal(client.directAccessGrantsEnabled, false);
  }
  const profileClaims = profileMappers.map(mapper => mapper.config['claim.name']);
  for (const client of realm.clients.filter(client => client.clientId !== 'itecsa-web')) {
    assert.ok(!client.protocolMappers?.some(mapper => profileClaims.includes(mapper.config?.['claim.name'])));
  }
  assert.equal(realm.editUsernameAllowed, false);
});

const incompleteConfigurations = [
  ['both profile mappers', []],
  ['account creation date', [expectedUsernameMapper]],
  ['username', [expectedRegistrationMapper]],
];
for (const [label, existing] of incompleteConfigurations) {
  test(`check detects missing ${label} without changing the existing realm`, async () => {
    const state = fixture({ existingMappers: existing.map(configuredMapper) });
    const before = structuredClone(state.mappers);
    await assert.rejects(bootstrap(env, state.fetcher, { readOnly: true }), /KEYCLOAK_BOOTSTRAP/);
    assert.deepEqual(state.mutations(), []);
    assert.deepEqual(state.mappers, before);
  });

  test(`configure adds missing ${label}, confirms readback, and is idempotent`, async () => {
    const state = fixture({ existingMappers: existing.map(configuredMapper) });
    const before = structuredClone(state.mappers);
    const missing = profileMappers.filter(mapper => !existing.includes(mapper));
    await bootstrap(env, state.fetcher);
    assert.deepEqual(state.mutations(), missing.map(body => ({ method: 'POST', pathname: mapperPath, body })));
    assert.deepEqual(state.mappers.slice(0, before.length), before, 'existing mappers remain intact');
    for (const expected of profileMappers) {
      assert.equal(state.mappers.filter(mapper => mapper.name === expected.name).length, 1);
    }
    const lastCreation = state.calls.findLastIndex(call => call.method === 'POST' && call.pathname === mapperPath);
    assert.ok(state.calls.slice(lastCreation + 1).some(call => call.method === 'GET' && call.pathname === mapperPath),
      'the final mapper configuration must be read back');
    await bootstrap(env, state.fetcher);
    await bootstrap(env, state.fetcher, { readOnly: true });
    assert.equal(state.mutations().length, missing.length, 'repeated runs must not mutate configuration');
  });
}

test('configure and check accept both already configured profile mappers with server identifiers', async () => {
  const state = fixture({ existingMappers: profileMappers.map(configuredMapper) });
  await bootstrap(env, state.fetcher);
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
  ['missing property', mapper => { delete mapper.config['user.attribute']; }],
  ['unexpected config', mapper => { mapper.config.multivalued = 'true'; }],
  ['missing access token claim', mapper => { mapper.config['access.token.claim'] = 'false'; }],
  ['extra ID token disclosure', mapper => { mapper.config['id.token.claim'] = 'true'; }],
  ['extra userinfo disclosure', mapper => { mapper.config['userinfo.token.claim'] = 'true'; }],
  ['extra introspection disclosure', mapper => { mapper.config['introspection.token.claim'] = 'true'; }],
];
for (const expected of profileMappers) {
  for (const [label, alter] of incompatibleMappers) {
    test(`incompatible ${expected.name} mapper (${label}) fails without changing the realm in either mode`, async () => {
      for (const readOnly of [true, false]) {
        const mapper = configuredMapper(expected);
        alter(mapper);
        const existingMappers = profileMappers.map(value => value === expected ? mapper : configuredMapper(value));
        const state = fixture({ existingMappers });
        const before = structuredClone(state.mappers);
        await assert.rejects(bootstrap(env, state.fetcher, { readOnly }), /KEYCLOAK_BOOTSTRAP/);
        assert.deepEqual(state.mutations(), []);
        assert.deepEqual(state.mappers, before);
      }
    });
  }

  test(`duplicate ${expected.name} mappers are rejected in either mode`, async () => {
    for (const readOnly of [true, false]) {
      const state = fixture({ existingMappers: [...profileMappers.map(configuredMapper),
        { ...configuredMapper(expected), id: 'duplicate' }] });
      await assert.rejects(bootstrap(env, state.fetcher, { readOnly }), /KEYCLOAK_BOOTSTRAP/);
      assert.deepEqual(state.mutations(), []);
    }
  });

  test(`an unrelated mapper claiming ${expected.config['claim.name']} is rejected without adding a competitor`, async () => {
    const state = fixture({ existingMappers: [{ ...configuredMapper(expected), name: 'Unexpected mapper' }] });
    await assert.rejects(bootstrap(env, state.fetcher), /KEYCLOAK_BOOTSTRAP/);
    assert.deepEqual(state.mutations(), []);
  });

  test(`incompatible ${expected.name} is detected before adding the other missing mapper`, async () => {
    const mapper = configuredMapper(expected);
    mapper.config['user.attribute'] = 'email';
    const state = fixture({ existingMappers: [mapper] });
    await assert.rejects(bootstrap(env, state.fetcher), /KEYCLOAK_BOOTSTRAP/);
    assert.deepEqual(state.mutations(), []);
  });

  const other = profileMappers.filter(value => value !== expected).map(configuredMapper);
  test(`failed creation of ${expected.name} does not report a configured realm`, async () => {
    const state = fixture({ existingMappers: other, createStatus: 500 });
    const before = structuredClone(state.mappers);
    await assert.rejects(bootstrap(env, state.fetcher), /KEYCLOAK_BOOTSTRAP.*HTTP 500/);
    assert.equal(state.mutations().length, 1);
    assert.deepEqual(state.mappers, before);
  });

  test(`creation of ${expected.name} without persistence is rejected by readback`, async () => {
    const state = fixture({ existingMappers: other, persistCreated: false });
    const before = structuredClone(state.mappers);
    await assert.rejects(bootstrap(env, state.fetcher), /KEYCLOAK_BOOTSTRAP/);
    assert.equal(state.mutations().length, 1);
    assert.deepEqual(state.mappers, before);
  });

  test(`incorrect ${expected.name} property after creation is rejected by readback`, async () => {
    const state = fixture({ existingMappers: other, alterCreated(mapper) { mapper.config['user.attribute'] = 'email'; } });
    await assert.rejects(bootstrap(env, state.fetcher), /KEYCLOAK_BOOTSTRAP/);
    assert.equal(state.mutations().length, 1);
  });
}

test('account creation date uses the lowercase long JSON type required by Keycloak', async () => {
  const mapper = configuredMapper(expectedRegistrationMapper);
  mapper.config['jsonType.label'] = 'Long';
  const state = fixture({ existingMappers: [configuredMapper(expectedUsernameMapper), mapper] });
  await assert.rejects(bootstrap(env, state.fetcher), /KEYCLOAK_BOOTSTRAP/);
  assert.deepEqual(state.mutations(), []);
});

test('incompatible existing audience is rejected before attempting profile mapper additions', async () => {
  const state = fixture({ alterLegacy(mappers) { mappers.find(mapper => mapper.name === 'API audience').config['included.custom.audience'] = 'wrong-audience'; } });
  await assert.rejects(bootstrap(env, state.fetcher), /KEYCLOAK_BOOTSTRAP/);
  assert.deepEqual(state.mutations(), []);
});

test('readback also rejects an existing profile mapper changed during creation of the missing mapper', async () => {
  const state = fixture({ existingMappers: [configuredMapper(expectedUsernameMapper)],
    alterCreated(_created, mappers) { mappers.find(mapper => mapper.name === 'Username').config['user.attribute'] = 'email'; } });
  await assert.rejects(bootstrap(env, state.fetcher), /KEYCLOAK_BOOTSTRAP/);
  assert.equal(state.mutations().length, 1);
});

const desiredLocale = { internationalizationEnabled: true, supportedLocales: ['es'], defaultLocale: 'es' };
const legacyLocale = { internationalizationEnabled: false, supportedLocales: [], defaultLocale: undefined };

test('new realm explicitly serves the application in Spanish', () => {
  const realm = buildRealm({ origin, adminClientSecret: 'fixture-'.repeat(5) });
  for (const [key, value] of Object.entries(desiredLocale)) assert.deepEqual(realm[key], value);
});

test('legacy locale is detected read-only, configured minimally, read back, and remains idempotent', async () => {
  const state = fixture({ existingMappers: profileMappers.map(configuredMapper), realmSettings: legacyLocale });
  const before = structuredClone(state.realm);
  await assert.rejects(bootstrap(env, state.fetcher, { readOnly: true }), /idioma del tema pendiente/);
  assert.deepEqual(state.mutations(), []);
  await bootstrap(env, state.fetcher);
  assert.deepEqual(state.realm, { ...before, ...desiredLocale });
  assert.deepEqual(state.mutations(), [{ method: 'PUT', pathname: '/admin/realms/itecsa', body: desiredLocale }]);
  const applied = state.calls.findIndex(call => call.method === 'PUT');
  assert.equal(state.calls[applied + 1].method, 'GET');
  assert.equal(state.calls[applied + 1].pathname, '/admin/realms/itecsa');
  await bootstrap(env, state.fetcher);
  await bootstrap(env, state.fetcher, { readOnly: true });
  assert.equal(state.mutations().length, 1);
});

for (const realmSettings of [
  { internationalizationEnabled: true, supportedLocales: ['en'], defaultLocale: 'en' },
  { internationalizationEnabled: true, supportedLocales: ['es', 'en'], defaultLocale: 'es' },
  { internationalizationEnabled: false, defaultLocale: 'fr' },
]) {
  test(`unrecognized language policy is not overwritten: ${JSON.stringify(realmSettings)}`, async () => {
    const state = fixture({ existingMappers: profileMappers.map(configuredMapper), realmSettings });
    await assert.rejects(bootstrap(env, state.fetcher), /idioma del realm incompatible/);
    assert.deepEqual(state.mutations(), []);
  });
}

for (const options of [{ localeStatus: 500 }, { persistLocale: false }]) {
  test(`locale write or readback failure does not report success: ${JSON.stringify(options)}`, async () => {
    const state = fixture({ existingMappers: profileMappers.map(configuredMapper), realmSettings: legacyLocale, ...options });
    await assert.rejects(bootstrap(env, state.fetcher), /KEYCLOAK_BOOTSTRAP/);
    assert.deepEqual(state.realm, { ...state.realm, ...legacyLocale });
  });
}

test('an incompatible mapper is rejected before applying a pending locale', async () => {
  const broken = configuredMapper(expectedUsernameMapper);
  broken.config['user.attribute'] = 'email';
  const state = fixture({ existingMappers: [broken], realmSettings: legacyLocale });
  await assert.rejects(bootstrap(env, state.fetcher), /mapper Username incompatible/);
  assert.deepEqual(state.mutations(), []);
});

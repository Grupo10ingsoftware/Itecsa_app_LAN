import test from 'node:test';
import assert from 'node:assert/strict';
import { bootstrap } from './post-bootstrap.mjs';
import { buildRealm, managementRoles } from './render-realm.mjs';

const env = {
  PUBLIC_ORIGIN: 'https://itecsa.lan.test',
  KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME: 'temporary',
  KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD: 'synthetic-temporary-password',
  KEYCLOAK_OPERATOR_USERNAME: 'operator',
  KEYCLOAK_OPERATOR_PASSWORD: 'synthetic-permanent-password',
};

function fixture({ failAssignment = false, rejectOperator = false, missingActionProvider = false } = {}) {
  const realm = buildRealm({ origin: env.PUBLIC_ORIGIN, adminClientSecret: 'synthetic-client-secret-at-least-32-chars' });
  if (missingActionProvider) delete realm.requiredActions[0].providerId;
  const clients = realm.clients.map(client => ({ ...client, id: client.clientId }));
  clients.push({ clientId: 'realm-management', id: 'realm-management' });
  const roles = Object.fromEntries(Object.entries(realm.roles.client).map(([client, values]) => [client,
    values.map(role => ({ ...role, id: role.name, containerId: client }))]));
  roles['realm-management'] = managementRoles.map(name => ({ id: name, name }));
  const state = { temporary: true, operator: false, admin: false, deletions: 0, grants: 0 };
  const mappings = new Map();
  let profile = { attributes: [] };
  const ok = (body, status = 200) => new Response(body === undefined ? null : JSON.stringify(body), { status });
  const fetcher = async (input, options = {}) => {
    const url = new URL(input);
    const method = options.method ?? 'GET';
    if (url.pathname.endsWith('/protocol/openid-connect/token')) {
      const temporary = options.body.get('username').toLowerCase() === 'temporary';
      return (temporary ? state.temporary : state.operator && !rejectOperator)
        ? ok({ access_token: temporary ? 'temporary-token' : (state.admin ? 'operator-token' : 'operator-without-role') }) : ok({}, 401);
    }
    const body = options.body ? JSON.parse(options.body) : undefined;
    if (url.pathname.startsWith('/admin/realms/master')) {
      const route = url.pathname.slice('/admin/realms/master'.length);
      if (options.headers.authorization === 'Bearer operator-without-role') return ok({}, 403);
      if (route === '/users' && method === 'POST') { state.operator = true; return ok(undefined, 201); }
      if (route === '/users') {
        const temporary = url.searchParams.get('username').toLowerCase() === 'temporary';
        return ok((temporary ? state.temporary : state.operator)
          ? [{ id: temporary ? 'temporary-id' : 'operator-id', username: temporary ? 'temporary' : 'operator' }] : []);
      }
      if (route === '/roles/admin') return ok({ id: 'admin', name: 'admin' });
      if (route === '/users/operator-id/role-mappings/realm') {
        if (method === 'POST') {
          if (failAssignment) { failAssignment = false; return ok({}, 503); }
          state.admin = true; state.grants++; return ok(undefined, 204);
        }
        return ok(state.admin ? [{ id: 'admin', name: 'admin' }] : []);
      }
      if (route === '/users/operator-id') return ok({ id: 'operator-id' });
      if (route === '/users/temporary-id' && method === 'DELETE') {
        assert.equal(state.admin, true);
        state.temporary = false; state.deletions++; return ok(undefined, 204);
      }
    }
    const route = url.pathname.slice('/admin/realms/itecsa'.length);
    if (route === '') { if (method === 'PUT') Object.assign(realm, body); return ok(realm); }
    if (route === '/authentication/required-actions') return ok(realm.requiredActions);
    if (route === '/clients') return ok(clients.filter(client => client.clientId === url.searchParams.get('clientId')));
    if (route === '/users/profile') { if (method === 'PUT') profile = body; return ok(profile); }
    if (route.includes('/scope-mappings/') || route.includes('/role-mappings/')) {
      if (method === 'POST') mappings.set(route, [...(mappings.get(route) ?? []), ...body]);
      return ok(mappings.get(route) ?? []);
    }
    const parts = route.split('/');
    const client = clients.find(value => value.id === parts[2]);
    if (client) {
      if (parts.length === 3) return ok(client);
      if (parts[3] === 'protocol-mappers') return ok(client.protocolMappers);
      if (parts[3] === 'default-client-scopes') return ok([{ name: 'basic' }]);
      if (parts[3] === 'service-account-user') return ok({ id: 'service' });
      if (parts[3] === 'roles' && parts.length === 4) return ok(roles[client.id]);
      if (parts[5] === 'composites') {
        const role = roles[client.id].find(value => value.name === decodeURIComponent(parts[4]));
        return ok(roles['itecsa-api'].filter(value => role.composites.client['itecsa-api'].includes(value.name)));
      }
    }
    throw Error(`Unexpected fixture request ${method} ${url.pathname}`);
  };
  return { state, fetcher };
}

test('bootstrap resumes after operator creation and only retires temporary admin after access verification', async () => {
  const { state, fetcher } = fixture({ failAssignment: true });
  await assert.rejects(bootstrap(env, fetcher), /HTTP 503/);
  assert.equal(state.operator, true);
  assert.equal(state.admin, false);
  assert.equal(state.temporary, true);
  await bootstrap(env, fetcher);
  assert.equal(state.admin, true);
  assert.equal(state.deletions, 1);
  await bootstrap(env, fetcher);
  assert.equal(state.grants, 1);
  assert.equal(state.deletions, 1);
});

test('invalid permanent credentials never grant admin or remove temporary access', async () => {
  const { state, fetcher } = fixture({ rejectOperator: true });
  await assert.rejects(bootstrap(env, fetcher), /no puede iniciar sesion/);
  assert.equal(state.grants, 0);
  assert.equal(state.temporary, true);
});

test('bootstrap rejects an imported password action without its provider before retiring temporary access', async () => {
  const { state, fetcher } = fixture({ missingActionProvider: true });
  await assert.rejects(bootstrap(env, fetcher), /UPDATE_PASSWORD sin proveedor/);
  assert.equal(state.operator, false);
  assert.equal(state.temporary, true);
});


test('bootstrap recognizes Keycloak lowercase names when configured with mixed case', async () => {
  const { state, fetcher } = fixture();
  await bootstrap({ ...env, KEYCLOAK_OPERATOR_USERNAME: 'OperAtor', KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME: 'Temporary' }, fetcher);
  assert.equal(state.operator, true);
  assert.equal(state.temporary, false);
});

test('check verifies a completed bootstrap without writes to admin endpoints', async () => {
  const { state, fetcher } = fixture();
  await bootstrap(env, fetcher);
  const readonly = async (url, options) => {
    if (url.includes('/admin/')) assert.equal(options.method, 'GET');
    return fetcher(url, options);
  };
  await bootstrap({ ...env, KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD: '' }, readonly, { readOnly: true });
  state.temporary = true;
  await assert.rejects(bootstrap(env, readonly, { readOnly: true }), /administrador temporal activo/);
  assert.equal(state.temporary, true);
});

test('check reports incomplete scopes without completing them', async () => {
  const { state, fetcher } = fixture();
  state.operator = true; state.admin = true;
  const readonly = async (url, options) => {
    if (url.includes('/admin/')) assert.equal(options.method, 'GET');
    return fetcher(url, options);
  };
  await assert.rejects(bootstrap(env, readonly, { readOnly: true }), /faltan roles o scopes/);
});

test('temporary and permanent names cannot differ only by case', async () => {
  await assert.rejects(bootstrap({ ...env, KEYCLOAK_OPERATOR_USERNAME: 'Temporary' }, () => { throw Error('must not call'); }), /credenciales administrativas/);
});

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { buildRealm } from './render-realm.mjs';
import { configureSupportDelegation, DELEGATED_BUSINESS_ROLES, DELEGATED_QUERY_ROLES } from '../../shared/keycloakSupportDelegation.mjs';
import { normalizeKeycloakClaims } from '../../capaServidor/src/middlewares/keycloakClaims.js';
import { ROLE_PERMISSIONS, ASSIGNABLE_ROLES, RECOGNIZED_ROLES } from '../../shared/keycloakAuthorization.js';

// Always creates its own disposable server, with a random name/port and secrets.
// No production origin, realm credentials or deployment env file are accepted.
const name = 'itecsa-delegation-test-' + randomUUID().slice(0, 8);
const password = randomUUID() + '!Aa1';
const image = 'quay.io/keycloak/keycloak@sha256:a78d6b79572168cb25886b80a8b5b8d4ed4390743e3eecb810538683e209dd6b';
let origin, admin, business, management, capabilities, serviceSubject, request, first, second, ordinary, developer, authz;
const roles = new Map(), managementRoles = new Map();
let writes = 0;
async function token(username, realm = 'itecsa', client = 'admin-cli') {
  const response = await fetch(origin + '/realms/' + realm + '/protocol/openid-connect/token', {
    method: 'POST', body: new URLSearchParams({ grant_type: 'password', client_id: client, username, password }),
  });
  assert.equal(response.status, 200, 'test identity must authenticate');
  return (await response.json()).access_token;
}
async function call(path, { method = 'GET', body, access = admin } = {}) {
  const response = await fetch(origin + path, { method, redirect: 'error', signal: AbortSignal.timeout(10000),
    headers: { authorization: 'Bearer ' + access, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const text = await response.text();
  return { status: response.status, data: text ? JSON.parse(text) : null };
}
async function user(username, role) {
  await request('/users', 'POST', { username, email: username + '@example.test', firstName: 'Delegation', lastName: 'Test',
    enabled: true, credentials: [{ type: 'password', value: password, temporary: false }] });
  const [value] = await request('/users?username=' + username + '&exact=true');
  await request('/users/' + value.id + '/role-mappings/clients/' + business, 'POST', [roles.get(role)]);
  return { ...value, access: await token(username) };
}
const userPath = value => '/users/' + value.id;
const mapping = (value, client = business) => userPath(value) + '/role-mappings/clients/' + client;
async function as(value, path, method = 'GET', body) {
  return call('/admin/realms/itecsa' + path, { access: value.access, method, body });
}

before(async () => {
  execFileSync('docker', ['run', '-d', '--rm', '--name', name, '-p', '127.0.0.1::8080',
    '-e', 'KC_BOOTSTRAP_ADMIN_USERNAME=test-admin', '-e', 'KC_BOOTSTRAP_ADMIN_PASSWORD=' + password,
    '-e', 'JAVA_OPTS_KC_HEAP=-Xms128m -Xmx384m', image, 'start-dev', '--features=admin-fine-grained-authz:v2'], { stdio: 'pipe' });
  const port = execFileSync('docker', ['port', name, '8080'], { encoding: 'utf8' }).trim().split(':').at(-1);
  origin = 'http://127.0.0.1:' + port;
  const deadline = Date.now() + 120000;
  for (;;) {
    try { if ((await fetch(origin + '/realms/master', { signal: AbortSignal.timeout(2000) })).ok) break; } catch { /* Server is starting. */ }
    if (Date.now() >= deadline) throw Error('Disposable Keycloak did not become ready');
    await delay(1000);
  }
  admin = await token('test-admin', 'master');
  request = async (path, method = 'GET', body) => {
    if (method !== 'GET') writes++;
    const response = await call('/admin/realms/itecsa' + path, { method, body });
    assert.ok([200, 201, 204].includes(response.status), method + ' ' + path + ': HTTP ' + response.status);
    return response.data;
  };
  const realm = buildRealm({ origin: 'https://itecsa.test', adminClientSecret: password });
  realm.sslRequired = 'none';
  delete realm.loginTheme;
  // Direct grants exist only inside this test container; production stays PKCE.
  realm.clients.find(value => value.clientId === 'itecsa-web').directAccessGrantsEnabled = true;
  assert.equal((await call('/admin/realms', { method: 'POST', body: realm })).status, 201);
  const clients = await request('/clients');
  const id = clientId => clients.find(value => value.clientId === clientId).id;
  business = id('itecsa-api-v1'); management = id('realm-management'); capabilities = id('itecsa-api');
  for (const role of await request('/clients/' + business + '/roles?max=1000')) roles.set(role.name, role);
  for (const role of await request('/clients/' + management + '/roles?max=1000')) managementRoles.set(role.name, role);
  serviceSubject = (await request('/clients/' + id('itecsa-backend-admin') + '/service-account-user')).id;
  const web = id('itecsa-web');
  await request('/clients/' + web + '/scope-mappings/clients/' + business, 'POST', [...roles.values()]);
  await request('/clients/' + web + '/scope-mappings/clients/' + capabilities, 'POST', await request('/clients/' + capabilities + '/roles?max=1000'));
  first = await user('support-existing', 'Soporte');
  ordinary = await user('ordinary', 'Operario Ventas');
  developer = await user('developer', 'Desarrollador');
}, { timeout: 150000 });
after(() => { try { execFileSync('docker', ['rm', '-f', name], { stdio: 'pipe' }); } catch { /* Already removed. */ } });

test('existing deployment is configured once, read-only detects pending, and repeats produce no writes', async () => {
  const before = writes;
  await assert.rejects(configureSupportDelegation({ request, readOnly: true }), /delegacion pendiente/);
  assert.equal(writes, before);
  await configureSupportDelegation({ request });
  const configuredWrites = writes;
  await configureSupportDelegation({ request });
  await configureSupportDelegation({ request, readOnly: true });
  assert.equal(writes, configuredWrites);
  first.access = await token(first.username);
  second = await user('support-added-later', 'Soporte');
  authz = '/clients/' + (await request('/clients?clientId=admin-permissions'))[0].id + '/authz/resource-server';
});

test('existing and later Soporte can use the console scope without user-management capabilities', async () => {
  for (const actor of [first, second]) {
    assert.equal((await as(actor, '/users')).status, 200);
    const detail = await as(actor, userPath(ordinary));
    assert.equal(detail.status, 200);
    assert.equal(detail.data.access.mapRoles, true);
    for (const scope of ['manage', 'resetPassword', 'impersonate', 'manageGroupMembership']) assert.equal(detail.data.access[scope], false);
    const clients = await as(actor, '/clients');
    assert.equal(clients.status, 200);
    assert.deepEqual(clients.data.map(value => value.clientId), ['itecsa-api-v1']);
    const available = await as(actor, mapping(ordinary) + '/available');
    assert.equal(available.status, 200);
    assert.ok(available.data.some(role => role.name === 'Gerencia'));
    assert.ok(available.data.some(role => role.name === 'Soporte'));
    assert.ok(available.data.every(role => DELEGATED_BUSINESS_ROLES.includes(role.name)));
  }
});

test('replace ordinary role with Gerencia, then Soporte, preserves subject and exactly one final business role', async () => {
  const old = await request(userPath(ordinary));
  for (const [from, to, actor] of [['Operario Ventas', 'Gerencia', first], ['Gerencia', 'Soporte', second]]) {
    assert.equal((await as(actor, mapping(ordinary), 'DELETE', [roles.get(from)])).status, 204);
    assert.deepEqual(await request(mapping(ordinary) + '/composite'), []);
    const without = JSON.parse(Buffer.from((await token(ordinary.username, 'itecsa', 'itecsa-web')).split('.')[1], 'base64url'));
    assert.equal(normalizeKeycloakClaims(without, 'itecsa-web', 'itecsa-api-v1'), null);
    assert.equal((await as(actor, mapping(ordinary), 'POST', [roles.get(to)])).status, 204);
    assert.deepEqual((await request(mapping(ordinary) + '/composite')).map(role => role.name), [to]);
  }
  assert.equal((await request(userPath(ordinary))).id, old.id);
  assert.equal((await request(userPath(ordinary))).username, old.username);
  ordinary.access = await token(ordinary.username);
  assert.equal((await as(ordinary, '/users')).status, 200, 'promoted Soporte receives the same delegation');
});

test('Soporte cannot escalate itself or others to developer, realm administration or direct capabilities', async () => {
  for (const target of [first, second, ordinary]) {
    assert.equal((await as(first, mapping(target), 'POST', [roles.get('Desarrollador')])).status, 403);
    for (const role of ['realm-admin', 'manage-users', 'manage-clients', 'impersonation', 'manage-authorization']) {
      assert.equal((await as(first, mapping(target, management), 'POST', [managementRoles.get(role)])).status, 403, role);
    }
    const capability = (await request('/clients/' + capabilities + '/roles?max=1'))[0];
    assert.equal((await as(first, mapping(target, capabilities), 'POST', [capability])).status, 403);
  }
  assert.equal((await as(first, '/users/' + serviceSubject + '/role-mappings/clients/' + business, 'POST', [roles.get('Soporte')])).status, 403);
});

test('direct Admin API mutations remain forbidden beyond role mapping', async () => {
  const cases = [
    ['/users', 'POST', { username: 'forbidden-created', enabled: true }],
    [userPath(second), 'PUT', { enabled: false }], [userPath(second), 'DELETE'],
    [userPath(second) + '/reset-password', 'PUT', { type: 'password', value: password, temporary: true }],
    [userPath(second) + '/impersonation', 'POST'], [userPath(second) + '/logout', 'POST'],
    ['/clients/' + business, 'PUT', { fullScopeAllowed: true }],
    ['/clients/' + business + '/roles/Soporte/composites', 'POST', [managementRoles.get('realm-admin')]],
    ['', 'PUT', { registrationAllowed: true }],
    [authz + '/policy/role', 'POST', { name: 'forbidden-policy', roles: [{ id: roles.get('Soporte').id }] }],
  ];
  for (const [path, method, body] of cases) assert.equal((await as(first, path, method, body)).status, 403, method + ' ' + path);
  assert.equal((await as(first, '/clients/' + management)).status, 403);
  assert.equal((await call('/admin/realms/master/users', { access: first.access })).status, 403);
});

test('non-support business roles cannot use the delegated Admin API', async () => {
  const sales = await user('sales-after-delegation', 'Operario Ventas');
  for (const actor of [sales, developer]) {
    assert.equal((await as(actor, '/users')).status, 403);
    assert.equal((await as(actor, mapping(second), 'POST', [roles.get('Gerencia')])).status, 403);
  }
});

test('ITECSA token keeps exactly the business role/permissions and rejects multi-role assignments', async () => {
  const payload = JSON.parse(Buffer.from((await token(first.username, 'itecsa', 'itecsa-web')).split('.')[1], 'base64url'));
  const normalized = normalizeKeycloakClaims(payload, 'itecsa-web', 'itecsa-api-v1');
  assert.deepEqual(payload.resource_access['itecsa-api-v1'].roles, ['Soporte']);
  assert.equal(payload.resource_access['realm-management'], undefined);
  assert.deepEqual([...normalized.permissions].sort(), [...ROLE_PERMISSIONS.Soporte].sort());
  assert.ok(normalized.permissions.every(value => !DELEGATED_QUERY_ROLES.includes(value)));
  for (const role of ['Gerencia', 'Soporte', 'Desarrollador']) assert.equal(ASSIGNABLE_ROLES.includes(role), false);
  await request(mapping(ordinary), 'POST', [roles.get('Gerencia')]);
  const ambiguous = JSON.parse(Buffer.from((await token(ordinary.username, 'itecsa', 'itecsa-web')).split('.')[1], 'base64url'));
  assert.equal(normalizeKeycloakClaims(ambiguous, 'itecsa-web', 'itecsa-api-v1'), null);
  await request(mapping(ordinary), 'DELETE', [roles.get('Gerencia')]);
});

test('own business downgrade loses delegation on the next session without removing another Soporte', async () => {
  assert.equal((await as(second, mapping(second), 'DELETE', [roles.get('Soporte')])).status, 204);
  await request(mapping(second), 'POST', [roles.get('Gerencia')]);
  second.access = await token(second.username);
  assert.equal((await as(second, '/users')).status, 403);
  assert.deepEqual((await request(mapping(first) + '/composite')).map(role => role.name), ['Soporte']);
});

test('drift fails closed without repairing an unexpected grant', async () => {
  const policies = await request(authz + '/policy?first=0&max=1000');
  const selected = policies.find(value => value.name === 'itecsa-support-business-roles');
  await request(authz + '/permission/scope/' + selected.id, 'PUT', {
    id: selected.id, name: selected.name, resourceType: 'Roles', scopes: ['map-role'],
    resources: RECOGNIZED_ROLES.map(role => roles.get(role).id), policies: ['itecsa-support-role'],
  });
  const before = writes;
  for (const readOnly of [true, false]) await assert.rejects(configureSupportDelegation({ request, readOnly }), /permiso incompatible/);
  assert.equal(writes, before);
});

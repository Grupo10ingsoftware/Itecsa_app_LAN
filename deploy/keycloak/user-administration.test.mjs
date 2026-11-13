import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BUSINESS_ADMIN_ROLES, RECOGNIZED_ROLES, ROLE_PERMISSIONS, ROLES } from '../../shared/authorization.js';
import { configureUserAdministration, disableSupportAccounts } from '../../shared/keycloakUserAdministration.mjs';
import { buildRealm } from './render-realm.mjs';

function fixture({ legacy = true, drift = false, persist = true } = {}) {
  const roles = RECOGNIZED_ROLES.map(name => ({ id: name, name }));
  const capabilities = [...new Set(Object.values(ROLE_PERMISSIONS).flat())]
    .map(name => ({ id: name, name, containerId: 'capabilities' }));
  const composites = new Map(roles.map(({ name }) => [name, capabilities.filter(value => ROLE_PERMISSIONS[name].includes(value.name)
    && !(legacy && BUSINESS_ADMIN_ROLES.includes(name) && value.name === 'manage:users'))]));
  if (drift) composites.get(ROLES.ADMIN_VENTAS).push(capabilities.find(value => value.name === 'read:payments'));
  const writes = [];
  const request = async (path, method = 'GET', body) => {
    const match = /^\/clients\/roles\/roles\/([^/]+)\/composites$/.exec(path);
    assert.ok(match, path);
    const name = decodeURIComponent(match[1]);
    if (method === 'GET') return structuredClone(composites.get(name));
    assert.equal(method, 'POST');
    writes.push({ name, body });
    if (persist) composites.get(name).push(...body);
  };
  return { request, rolesClient: 'roles', capabilitiesClient: 'capabilities', managementClient: 'management',
    roles, capabilities, writes, composites };
}

test('new realm grants user administration to all three departmental administrators', () => {
  const realm = buildRealm({ origin: 'https://itecsa.example.test', adminClientSecret: 'fixture-'.repeat(5) });
  for (const name of BUSINESS_ADMIN_ROLES) {
    assert.ok(realm.roles.client['itecsa-api-v1'].find(role => role.name === name).composites.client['itecsa-api'].includes('manage:users'));
  }
});

test('old deployments gain exactly manage:users for each administrator and repeats are read-only', async () => {
  const state = fixture();
  await assert.rejects(configureUserAdministration({ ...state, readOnly: true }), /pendientes/);
  assert.deepEqual(state.writes, []);
  await configureUserAdministration(state);
  assert.deepEqual(state.writes.map(value => value.name).sort(), [...BUSINESS_ADMIN_ROLES].sort());
  assert.ok(state.writes.every(value => value.body.length === 1 && value.body[0].name === 'manage:users'));
  await configureUserAdministration(state);
  await configureUserAdministration({ ...state, readOnly: true });
  assert.equal(state.writes.length, 3);
});

test('unexpected grants fail before any role is changed and failed readbacks stop deployment', async () => {
  const drift = fixture({ drift: true });
  await assert.rejects(configureUserAdministration(drift), /composicion invalida/);
  assert.deepEqual(drift.writes, []);
  await assert.rejects(configureUserAdministration(fixture({ persist: false })), /verificar/);
});

test('support accounts are preserved, disabled and logged out across all result pages', async () => {
  const users = Array.from({ length: 101 }, (_, index) => ({ id: String(index), enabled: index !== 1 }));
  const writes = [];
  const request = async (path, method = 'GET', body) => {
    const url = new URL(path, 'https://fixture.test');
    if (url.pathname.endsWith('/roles/Soporte/users')) {
      const first = Number(url.searchParams.get('first'));
      return structuredClone(users.slice(first, first + 100));
    }
    const [, id, logout] = /^\/users\/(\d+)(\/logout)?$/.exec(path) ?? [];
    assert.ok(id !== undefined, path);
    if (method === 'GET') return structuredClone(users[Number(id)]);
    writes.push({ path, method });
    if (logout) assert.equal(method, 'POST');
    else { assert.equal(method, 'PUT'); assert.deepEqual(body, { enabled: false }); users[Number(id)].enabled = false; }
  };
  await assert.rejects(disableSupportAccounts({ request, rolesClient: 'roles', readOnly: true }), /Soporte habilitadas/);
  assert.deepEqual(writes, []);
  await disableSupportAccounts({ request, rolesClient: 'roles' });
  assert.equal(users.length, 101);
  assert.ok(users.every(user => user.enabled === false));
  assert.equal(writes.length, 200);
  await disableSupportAccounts({ request, rolesClient: 'roles' });
  await disableSupportAccounts({ request, rolesClient: 'roles', readOnly: true });
  assert.equal(writes.length, 200);
});

import { configureSupportDelegation, DELEGATED_QUERY_ROLES, DELEGATED_BUSINESS_ROLES } from '../../shared/keycloakSupportDelegation.mjs';

function delegationFixture({ drift = false, persist = true } = {}) {
  const realm = { adminPermissionsEnabled: true, adminEventsEnabled: true, adminEventsDetailsEnabled: false,
    attributes: { itecsaSupportDelegationVersion: '1' } };
  const clients = [
    { id: 'roles', clientId: 'itecsa-api-v1' }, { id: 'capabilities', clientId: 'itecsa-api' },
    { id: 'management', clientId: 'realm-management' }, { id: 'authz', clientId: 'admin-permissions' },
    { id: 'backend', clientId: 'itecsa-backend-admin', serviceAccountsEnabled: true },
  ];
  const roles = RECOGNIZED_ROLES.map(name => ({ id: 'id-' + name, name }));
  const queries = DELEGATED_QUERY_ROLES.map(name => ({ id: name, name, composite: false, containerId: 'management' }));
  const composites = new Map(roles.map(({ name }) => [name, [
    ...ROLE_PERMISSIONS[name].map(value => ({ id: value, name: value, containerId: 'capabilities' })),
    ...(name === 'Soporte' ? queries : []),
  ]]));
  const prefix = 'itecsa-support-';
  const policies = new Map();
  const add = (name, data) => policies.set(prefix + name, { id: prefix + name, name: prefix + name,
    decisionStrategy: 'UNANIMOUS', logic: 'POSITIVE', ...data });
  add('role', { type: 'role', roles: [{ id: 'id-Soporte', required: true }] });
  add('deny-technical', { type: 'role', logic: 'NEGATIVE', roles: [{ id: 'id-Soporte', required: true }] });
  add('protected-users', { type: 'scope', resourceType: 'Users', scopes: ['map-roles'], resources: ['service'],
    policies: [prefix + 'deny-technical'] });
  add('business-roles', { type: 'scope', resourceType: 'Roles', scopes: ['map-role'],
    resources: [...DELEGATED_BUSINESS_ROLES, 'Soporte'].map(name => 'id-' + name), policies: [prefix + 'role'] });
  add('business-client', { type: 'scope', resourceType: 'Clients', scopes: ['view'], resources: ['roles'], policies: [prefix + 'role'] });
  add('users', { type: 'scope', resourceType: 'Users', scopes: ['view', 'map-roles'], policies: [prefix + 'role'] });
  if (drift) policies.get(prefix + 'business-roles').resources.push('id-Desarrollador');
  const writes = [];
  const request = async (path, method = 'GET', body) => {
    const url = new URL(path || '/', 'https://fixture.test');
    const resource = url.pathname;
    if (method !== 'GET') {
      writes.push({ path, method, body, enabled: realm.adminPermissionsEnabled });
      if (resource === '/') { Object.assign(realm, body); return; }
      const composite = /^\/clients\/roles\/roles\/([^/]+)\/composites$/.exec(resource);
      if (composite) {
        const name = decodeURIComponent(composite[1]);
        if (method === 'DELETE') composites.set(name, composites.get(name).filter(role => !body.some(value => value.id === role.id)));
        else { assert.equal(method, 'POST'); composites.get(name).push(...body); }
        return;
      }
      const policy = /^\/clients\/authz\/authz\/resource-server\/(?:policy\/role|permission\/scope)\/([^/]+)$/.exec(resource);
      assert.ok(policy, method + ' ' + path);
      assert.equal(method, 'PUT');
      assert.equal(realm.adminPermissionsEnabled, false, 'legacy policy changes occur only while FGAP is suspended');
      if (persist) policies.set(policy[1], structuredClone({ ...body, type: body.type ?? 'scope' }));
      return;
    }
    if (resource === '/') return structuredClone(realm);
    if (resource === '/clients') return structuredClone(url.searchParams.has('clientId')
      ? clients.filter(client => client.clientId === url.searchParams.get('clientId')) : clients);
    if (resource === '/clients/roles/roles') return roles;
    if (resource === '/clients/management/roles') return queries;
    if (resource === '/clients/backend/service-account-user') return { id: 'service' };
    const composite = /^\/clients\/roles\/roles\/([^/]+)\/composites$/.exec(resource);
    if (composite) return structuredClone(composites.get(decodeURIComponent(composite[1])));
    const authz = '/clients/authz/authz/resource-server';
    if (resource === authz + '/policy') return [...policies.values()].map(({ id, name, type }) => ({ id, name, type }));
    const policy = new RegExp('^' + authz + '/(?:policy/role|permission/scope)/([^/]+)$').exec(resource);
    if (policy) return structuredClone(policies.get(policy[1]));
    const associated = new RegExp('^' + authz + '/policy/([^/]+)/(resources|scopes|associatedPolicies)$').exec(resource);
    if (associated) {
      const value = policies.get(associated[1]);
      const items = associated[2] === 'resources' ? value.resources ?? [value.resourceType]
        : associated[2] === 'scopes' ? value.scopes : value.policies;
      return items.map(name => ({ name }));
    }
    throw Error('Unexpected delegation fixture request: ' + path);
  };
  return { request, writes, realm, policies, composites };
}

test('legacy console delegation moves to the three administrators with FGAP suspended and remains idempotent', async () => {
  const state = delegationFixture();
  await assert.rejects(configureSupportDelegation({ ...state, readOnly: true }), /pendiente/);
  assert.deepEqual(state.writes, []);
  await configureSupportDelegation(state);
  assert.equal(state.realm.adminPermissionsEnabled, true);
  assert.equal(state.realm.attributes.itecsaSupportDelegationVersion, '2');
  for (const name of BUSINESS_ADMIN_ROLES) {
    assert.deepEqual(state.composites.get(name).filter(role => role.containerId === 'management').map(role => role.name).sort(),
      [...DELEGATED_QUERY_ROLES].sort());
  }
  assert.ok(!state.composites.get('Soporte').some(role => role.containerId === 'management'));
  for (const name of ['itecsa-support-role', 'itecsa-support-deny-technical']) {
    assert.deepEqual(state.policies.get(name).roles.map(value => value.id).sort(), BUSINESS_ADMIN_ROLES.map(role => 'id-' + role).sort());
    assert.ok(state.policies.get(name).roles.every(role => role.required === false));
  }
  assert.ok(!state.policies.get('itecsa-support-business-roles').resources.includes('id-Soporte'));
  const before = state.writes.length;
  await configureSupportDelegation(state);
  await configureSupportDelegation({ ...state, readOnly: true });
  assert.equal(state.writes.length, before);
});

test('unrecognized delegation grants are rejected without writes or reactivation', async () => {
  const state = delegationFixture({ drift: true });
  await assert.rejects(configureSupportDelegation(state), /permiso incompatible/);
  assert.deepEqual(state.writes, []);
  state.realm.adminPermissionsEnabled = false;
  await assert.rejects(configureSupportDelegation(state), /permiso incompatible/);
  assert.deepEqual(state.writes, []);
  assert.equal(state.realm.adminPermissionsEnabled, false);
});

test('unconfirmed legacy policy changes leave FGAP suspended', async () => {
  const state = delegationFixture({ persist: false });
  await assert.rejects(configureSupportDelegation(state), /delegacion pendiente/);
  assert.equal(state.realm.adminPermissionsEnabled, false);
  assert.ok(!state.writes.some(value => value.body?.adminPermissionsEnabled === true));
});

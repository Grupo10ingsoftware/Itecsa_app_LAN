import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPhase02Realm, LAB } from './keycloak-phase02-realm.mjs';
import { buildPhase06Realm, ADMIN_LAB } from './keycloak-phase06-realm.mjs';

test('administration laboratory separates service credentials from SPA and preserves the canonical nine-role policy', () => {
  const realm = buildPhase06Realm(), baseline = buildPhase02Realm();
  assert.deepEqual(realm.roles, baseline.roles);
  assert.deepEqual(realm.clients.find(client => client.clientId === LAB.clientId), baseline.clients.find(client => client.clientId === LAB.clientId));
  const service = realm.clients.find(client => client.clientId === ADMIN_LAB.clientId);
  assert.equal(service.publicClient, false); assert.equal(service.standardFlowEnabled, false);
  assert.equal(service.directAccessGrantsEnabled, false); assert.equal(service.serviceAccountsEnabled, true);
  assert.equal(service.fullScopeAllowed, false);
  assert.deepEqual(realm.clientScopeMappings['realm-management'], [{ client: ADMIN_LAB.clientId,
    roles: ['query-users', 'view-users', 'manage-users', 'view-clients'] }]);
  const account = realm.users.find(user => user.serviceAccountClientId === ADMIN_LAB.clientId);
  assert.deepEqual(account.clientRoles['realm-management'], ['query-users', 'view-users', 'manage-users', 'view-clients']);
  assert.equal(account.clientRoles[LAB.roleClientId], undefined);
  const restricted = realm.users.find(user => user.serviceAccountClientId === ADMIN_LAB.insufficientClientId);
  assert.equal(restricted.clientRoles, undefined);
  const profile = JSON.parse(realm.components['org.keycloak.userprofile.UserProfileProvider'][0].config['kc.user.profile.config'][0]);
  const marker = profile.attributes.find(attribute => attribute.name === 'itecsa_provision_id');
  assert.deepEqual(marker.permissions, { view: ['admin'], edit: ['admin'] });
  assert.equal(profile.unmanagedAttributePolicy, undefined);
  assert.equal(profile.attributes.find(attribute => attribute.name === 'email').required, undefined);
});

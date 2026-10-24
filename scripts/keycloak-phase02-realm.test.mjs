import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPhase02Realm, LAB, LAB_USERS } from './keycloak-phase02-realm.mjs';
import * as policy from '../shared/keycloakAuthorization.js';

test('laboratory realm derives all roles and composite permissions from the approved policy', () => {
  const realm = buildPhase02Realm();
  assert.deepEqual(realm.roles.client[LAB.roleClientId].map(role => role.name), policy.RECOGNIZED_ROLES);
  for (const role of realm.roles.client[LAB.roleClientId]) {
    assert.deepEqual(role.composites.client[LAB.capabilityClientId], policy.ROLE_PERMISSIONS[role.name]);
  }
  assert.deepEqual(realm.roles.client[LAB.capabilityClientId].map(role => role.name), policy.BUSINESS_PERMISSIONS);
  assert.equal(LAB_USERS.length, 9);
  const spa = realm.clients.find(client => client.clientId === LAB.clientId);
  assert.equal(spa.publicClient, true);
  assert.equal(spa.directAccessGrantsEnabled, false);
  assert.equal(spa.fullScopeAllowed, false);
  assert.equal(spa.attributes['pkce.code.challenge.method'], 'S256');
  assert.deepEqual(spa.redirectUris, [LAB.redirectUri]);
  assert.deepEqual(spa.defaultClientScopes, ['basic']);
  assert.equal('defaultRoles' in realm, false);
  assert.equal(spa.protocolMappers.every(mapper => mapper.config['id.token.claim'] === 'false'), true);
});

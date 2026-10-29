import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRealm } from './render-realm.mjs';
import { RECOGNIZED_ROLES, BUSINESS_PERMISSIONS, ROLE_PERMISSIONS } from '../../shared/keycloakAuthorization.js';

const parameters = { origin: 'https://itecsa.lan.test',
  adminClientSecret: 'test-only-012345678901234567890123456789' };

test('realm import has the full application contract and exact PIN callback', () => {
  const realm = buildRealm(parameters);
  assert.equal(realm.realm, 'itecsa');
  assert.equal(realm.clients.length, 5);
  assert.equal(realm.loginTheme, 'itecsa');
  assert.equal(realm.resetPasswordAllowed, false);
  assert.equal(realm.bruteForceProtected, true);
  assert.deepEqual(realm.roles.client['itecsa-api'].map(role => role.name), BUSINESS_PERMISSIONS);
  assert.deepEqual(realm.roles.client['itecsa-api-v1'].map(role => role.name), RECOGNIZED_ROLES);
  for (const role of realm.roles.client['itecsa-api-v1']) {
    assert.deepEqual(role.composites.client['itecsa-api'], ROLE_PERMISSIONS[role.name]);
  }
  const web = realm.clients.find(client => client.clientId === 'itecsa-web');
  const pin = realm.clients.find(client => client.clientId === 'itecsa-pin-recovery');
  const service = realm.clients.find(client => client.clientId === 'itecsa-backend-admin');
  assert.deepEqual(web.defaultClientScopes, ['basic']);
  assert.equal(web.protocolMappers.length, 3);
  assert.equal(web.attributes['pkce.code.challenge.method'], 'S256');
  assert.deepEqual(pin.redirectUris, ['https://itecsa.lan.test/auth/pin-recovery/callback']);
  assert.equal(pin.attributes.login_theme, 'itecsa-pin-recovery');
  assert.equal(service.secret, parameters.adminClientSecret);
  assert.equal(service.serviceAccountsEnabled, true);
});

test('deployment renderer rejects provisional and insecure origins', () => {
  for (const origin of ['http://itecsa.lan.test', 'https://127.0.0.1', 'https://localhost',
    'https://itecsa.lan.test/path', 'https://itecsa.lan.test:8443']) {
    assert.throws(() => buildRealm({ ...parameters, origin }));
  }
});

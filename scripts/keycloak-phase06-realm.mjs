import { buildPhase02Realm, LAB } from './keycloak-phase02-realm.mjs';

export const ADMIN_LAB = Object.freeze({ clientId: 'phase06-administration', insufficientClientId: 'phase06-insufficient',
  secret: 'Synthetic-Administration-Phase06-Only' });

// Import only into the disposable realm created by our runner.
export function buildPhase06Realm() {
  const realm = buildPhase02Realm();
  for (const clientId of [ADMIN_LAB.clientId, ADMIN_LAB.insufficientClientId]) realm.clients.push({
    clientId, enabled: true, publicClient: false, secret: ADMIN_LAB.secret,
    serviceAccountsEnabled: true, standardFlowEnabled: false, directAccessGrantsEnabled: false,
    fullScopeAllowed: false, defaultClientScopes: ['roles'], optionalClientScopes: [],
  });
  realm.clientScopeMappings['realm-management'] = [{ client: ADMIN_LAB.clientId,
    roles: ['query-users', 'view-users', 'manage-users', 'view-clients'] }];
  realm.users.push({ username: 'service-account-' + ADMIN_LAB.clientId, enabled: true,
    serviceAccountClientId: ADMIN_LAB.clientId,
    clientRoles: { 'realm-management': ['query-users', 'view-users', 'manage-users', 'view-clients'] } },
  { username: 'service-account-' + ADMIN_LAB.insufficientClientId, enabled: true,
    serviceAccountClientId: ADMIN_LAB.insufficientClientId });
  realm.users.push({ username: 'phase06-privileged-target', enabled: false, firstName: 'Synthetic', lastName: 'Privileged',
    clientRoles: { [LAB.roleClientId]: ['Soporte'] } });
  // In 26.8.1, absence means disabled; "DISABLED" is not a REST enum value.
  const profile = { attributes: [
    ...['username', 'email', 'firstName', 'lastName'].map(name => ({ name, multivalued: false,
      permissions: { view: ['admin', 'user'], edit: name === 'username' ? ['admin'] : ['admin', 'user'] },
      ...(name === 'username' ? { validations: { length: { min: 1, max: 255 }, 'username-prohibited-characters': {} } } : {}),
    })),
    { name: 'itecsa_provision_id', multivalued: false, permissions: { view: ['admin'], edit: ['admin'] },
      validations: { length: { max: 36 } } },
  ] };
  realm.components = { 'org.keycloak.userprofile.UserProfileProvider': [{
    providerId: 'declarative-user-profile', config: { 'kc.user.profile.config': [JSON.stringify(profile)] },
  }] };
  return realm;
}

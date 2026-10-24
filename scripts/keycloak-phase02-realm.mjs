import { RECOGNIZED_ROLES, ROLE_PERMISSIONS, BUSINESS_PERMISSIONS } from '../shared/keycloakAuthorization.js';

// Synthetic fixtures only. Never import this realm into an existing installation.
export const LAB = Object.freeze({ realm: 'itecsa-phase02', clientId: 'itecsa-web',
  roleClientId: 'itecsa-api-v1', capabilityClientId: 'itecsa-capabilities-v1',
  issuer: 'http://phase02-keycloak:8080/realms/itecsa-phase02',
  audience: 'https://api.itecsa.local', redirectUri: 'http://127.0.0.1:18973/callback',
  password: 'Synthetic-Phase02-Only!42' });

export const LAB_USERS = Object.freeze(RECOGNIZED_ROLES.map((role, index) =>
  Object.freeze({ username: `phase02-role-${index}`, role })));

export function buildPhase02Realm() {
  const roleMapper = (name, owner, claim) => ({ name, protocol: 'openid-connect',
    protocolMapper: 'oidc-usermodel-client-role-mapper', consentRequired: false,
    config: { 'usermodel.clientRoleMapping.clientId': owner, 'claim.name': claim,
      'multivalued': 'true', 'jsonType.label': 'String', 'access.token.claim': 'true',
      'id.token.claim': 'false', 'userinfo.token.claim': 'false' } });
  const resource = clientId => ({ clientId, enabled: true, bearerOnly: true,
    standardFlowEnabled: false, directAccessGrantsEnabled: false, serviceAccountsEnabled: false });
  const user = (username, clientRoles, realmRoles = []) => ({ username, enabled: true,
    firstName: 'Synthetic', lastName: 'Phase02', email: `${username}@example.invalid`, emailVerified: false,
    requiredActions: [], credentials: [{ type: 'password', value: LAB.password, temporary: false }], clientRoles, realmRoles });
  return {
    realm: LAB.realm, enabled: true, sslRequired: 'none', registrationAllowed: false,
    resetPasswordAllowed: false, loginWithEmailAllowed: false, editUsernameAllowed: false,
    accessTokenLifespan: 300, ssoSessionIdleTimeout: 600, ssoSessionMaxLifespan: 1800,
    defaultDefaultClientScopes: [], defaultOptionalClientScopes: [],
    roles: {
      realm: [{ name: 'Soporte', description: 'Legacy role for a negative migration fixture' }],
      client: {
        [LAB.roleClientId]: RECOGNIZED_ROLES.map(name => ({ name, composite: true,
          composites: { client: { [LAB.capabilityClientId]: [...ROLE_PERMISSIONS[name]] } } })),
        [LAB.capabilityClientId]: BUSINESS_PERMISSIONS.map(name => ({ name })),
      },
    },
    clients: [resource(LAB.roleClientId), resource(LAB.capabilityClientId), {
      clientId: LAB.clientId, enabled: true, publicClient: true, standardFlowEnabled: true,
      directAccessGrantsEnabled: false, serviceAccountsEnabled: false, fullScopeAllowed: false,
      redirectUris: [LAB.redirectUri], webOrigins: ['http://127.0.0.1:18973'],
      attributes: { 'pkce.code.challenge.method': 'S256' }, defaultClientScopes: ['basic'], optionalClientScopes: [],
      protocolMappers: [roleMapper('Application roles', LAB.roleClientId, `resource_access.${LAB.roleClientId}.roles`),
        roleMapper('ITECSA permissions', LAB.capabilityClientId, 'permissions'), {
          name: 'API audience', protocol: 'openid-connect', protocolMapper: 'oidc-audience-mapper',
          config: { 'included.custom.audience': LAB.audience, 'access.token.claim': 'true', 'id.token.claim': 'false' },
        }],
    }],
    clientScopeMappings: {
      [LAB.roleClientId]: [{ client: LAB.clientId, roles: [...RECOGNIZED_ROLES] }],
      [LAB.capabilityClientId]: [{ client: LAB.clientId, roles: [...BUSINESS_PERMISSIONS] }],
    },
    users: [
      ...LAB_USERS.map(({ username, role }) => user(username, { [LAB.roleClientId]: [role] })),
      user('phase02-legacy-support', { [LAB.capabilityClientId]: ['read:own-profile'] }, ['Soporte']),
      user('phase02-multiple', { [LAB.roleClientId]: ['Soporte', 'Desarrollador'] }),
      user('phase02-excessive', { [LAB.roleClientId]: ['Administrador Produccion'], [LAB.capabilityClientId]: ['manage:users'] }),
    ],
  };
}

import { RECOGNIZED_ROLES, BUSINESS_PERMISSIONS, ROLE_PERMISSIONS } from '../shared/keycloakAuthorization.js';
import { fileURLToPath } from 'node:url';

// Existing development clients, with no lab fixtures or synthetic users.
export function buildUbuntuContract() {
  const clientId = 'itecsa-web', roleClientId = 'itecsa-api-v1', capabilityClientId = 'itecsa-api';
  const origin = 'http://127.0.0.1:5173', audience = 'https://api.itecsa.local';
  const roleMapper = (name, owner, claim) => ({ name, protocol: 'openid-connect',
    protocolMapper: 'oidc-usermodel-client-role-mapper', consentRequired: false,
    config: { 'usermodel.clientRoleMapping.clientId': owner, 'claim.name': claim,
      multivalued: 'true', 'jsonType.label': 'String', 'access.token.claim': 'true',
      'id.token.claim': 'false', 'userinfo.token.claim': 'false' } });
  return { realm: 'itecsa', origin, issuer: 'http://127.0.0.1:18080/realms/itecsa', audience,
    clientId, roleClientId, capabilityClientId, adminClientId: 'itecsa-backend-admin',
    roles: [...RECOGNIZED_ROLES], capabilities: [...BUSINESS_PERMISSIONS], rolePermissions: ROLE_PERMISSIONS,
    spa: { enabled: true, publicClient: true, standardFlowEnabled: true,
      implicitFlowEnabled: false, directAccessGrantsEnabled: false, serviceAccountsEnabled: false,
      fullScopeAllowed: false, redirectUris: [origin + '/*'], webOrigins: [origin],
      attributes: { 'pkce.code.challenge.method': 'S256', 'post.logout.redirect.uris': origin + '/*',
        'access.token.lifespan': '300' },
      protocolMappers: [roleMapper('Application roles', roleClientId, `resource_access.${roleClientId}.roles`),
        roleMapper('ITECSA permissions', capabilityClientId, 'permissions'), {
          name: 'API audience', protocol: 'openid-connect', protocolMapper: 'oidc-audience-mapper',
          config: { 'included.custom.audience': audience, 'access.token.claim': 'true', 'id.token.claim': 'false' },
        }],
    },
    administrativeRoles: ['query-users', 'view-users', 'manage-users', 'view-clients'],
    marker: { name: 'itecsa_provision_id', multivalued: false,
      permissions: { view: ['admin'], edit: ['admin'] }, validations: { length: { max: 36 } } },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(buildUbuntuContract(), null, 2));

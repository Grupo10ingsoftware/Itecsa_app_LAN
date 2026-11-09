import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RECOGNIZED_ROLES, BUSINESS_PERMISSIONS, ROLE_PERMISSIONS } from '../../shared/keycloakAuthorization.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const audience = 'https://api.itecsa.local';
const roleClient = 'itecsa-api-v1';
const capabilityClient = 'itecsa-api';
const managementRoles = ['query-users', 'view-users', 'manage-users', 'view-clients'];
const fail = message => { throw Error('KEYCLOAK_REALM: ' + message); };

export function validateOrigin(value) {
  let url;
  try { url = new URL(value); } catch { fail('PUBLIC_ORIGIN invalido'); }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.pathname !== '/' ||
      url.search || url.hash || url.port || /^(localhost|127\.|0\.0\.0\.0|<)/i.test(url.hostname)) {
    fail('PUBLIC_ORIGIN debe ser un origen HTTPS definitivo sin puerto');
  }
  return url.origin;
}

const roleMapper = (name, owner, claim) => ({
  name, protocol: 'openid-connect', protocolMapper: 'oidc-usermodel-client-role-mapper',
  consentRequired: false, config: {
    'usermodel.clientRoleMapping.clientId': owner, 'claim.name': claim,
    multivalued: 'true', 'jsonType.label': 'String',
    'access.token.claim': 'true', 'id.token.claim': 'false', 'userinfo.token.claim': 'false',
  },
});
// Display identity only: authorization remains bound to sub, roles and permissions.
export const usernameMapper = () => ({
  name: 'Username', protocol: 'openid-connect', protocolMapper: 'oidc-usermodel-property-mapper',
  consentRequired: false, config: {
    'user.attribute': 'username', 'claim.name': 'preferred_username', 'jsonType.label': 'String',
    'access.token.claim': 'true', 'id.token.claim': 'false',
    'userinfo.token.claim': 'false', 'introspection.token.claim': 'false',
  },
});
const bareClient = clientId => ({
  clientId, enabled: true, protocol: 'openid-connect', bearerOnly: true,
  publicClient: false, standardFlowEnabled: false, implicitFlowEnabled: false,
  directAccessGrantsEnabled: false, serviceAccountsEnabled: false,
  fullScopeAllowed: false,
});

export function buildRealm({ origin, adminClientSecret }) {
  const publicOrigin = validateOrigin(origin);
  if (typeof adminClientSecret !== 'string' || adminClientSecret.length < 32 ||
      /[\r\n<>]/.test(adminClientSecret)) fail('falta secreto nuevo del client administrativo');
  const publicClient = (clientId, redirectUris, attributes = {}) => ({
    clientId, enabled: true, protocol: 'openid-connect', publicClient: true,
    standardFlowEnabled: true, implicitFlowEnabled: false, directAccessGrantsEnabled: false,
    serviceAccountsEnabled: false, fullScopeAllowed: false,
    redirectUris, webOrigins: [publicOrigin], defaultClientScopes: ['basic'],
    optionalClientScopes: [], attributes: {
      'pkce.code.challenge.method': 'S256', 'pkce.required': 'true', ...attributes,
    },
  });
  return {
    realm: 'itecsa', enabled: true, sslRequired: 'all',
    loginTheme: 'itecsa', registrationAllowed: false, resetPasswordAllowed: false,
    rememberMe: false, verifyEmail: false, loginWithEmailAllowed: false,
    duplicateEmailsAllowed: false, editUsernameAllowed: false,
    passwordPolicy: 'length(8) and upperCase(1) and lowerCase(1) and digits(1) and specialChars(1)',
    bruteForceProtected: true, permanentLockout: false, failureFactor: 5,
    waitIncrementSeconds: 60, maxFailureWaitSeconds: 900, maxDeltaTimeSeconds: 43200,
    requiredActions: [{ alias: 'UPDATE_PASSWORD', providerId: 'UPDATE_PASSWORD', name: 'Update Password', enabled: true, defaultAction: false }],
    attributes: { userProfileEnabled: 'true' },
    roles: { client: {
      [capabilityClient]: BUSINESS_PERMISSIONS.map(name => ({ name })),
      [roleClient]: RECOGNIZED_ROLES.map(name => ({ name, composite: true,
        composites: { client: { [capabilityClient]: ROLE_PERMISSIONS[name] } } })),
    } },
    clients: [
      bareClient(capabilityClient),
      bareClient(roleClient),
      {
        ...publicClient('itecsa-web', [publicOrigin, publicOrigin + '/*'], {
          'post.logout.redirect.uris': publicOrigin + '/login',
          'access.token.lifespan': '300',
        }),
        rootUrl: publicOrigin, baseUrl: publicOrigin + '/',
        protocolMappers: [
          usernameMapper(),
          roleMapper('Application roles', roleClient, `resource_access.${roleClient}.roles`),
          roleMapper('ITECSA permissions', capabilityClient, 'permissions'),
          { name: 'API audience', protocol: 'openid-connect',
            protocolMapper: 'oidc-audience-mapper', consentRequired: false,
            config: { 'included.custom.audience': audience, 'access.token.claim': 'true',
              'id.token.claim': 'false', 'introspection.token.claim': 'true' } },
        ],
      },
      {
        ...publicClient('itecsa-pin-recovery', [publicOrigin + '/auth/pin-recovery/callback'], {
          login_theme: 'itecsa-pin-recovery',
          'post.logout.redirect.uris': publicOrigin + '/auth/pin-recovery/callback',
        }),
        rootUrl: publicOrigin, baseUrl: publicOrigin + '/',
      },
      {
        clientId: 'itecsa-backend-admin', enabled: true, protocol: 'openid-connect',
        publicClient: false, clientAuthenticatorType: 'client-secret', secret: adminClientSecret,
        standardFlowEnabled: false, implicitFlowEnabled: false, directAccessGrantsEnabled: false,
        serviceAccountsEnabled: true, fullScopeAllowed: false,
        defaultClientScopes: ['roles'], optionalClientScopes: [],
      },
    ],
    // Keycloak creates its built-in scopes and realm-management client during import.
    // post-bootstrap.mjs assigns explicit scope mappings and service-account roles.
  };
}

export function renderRealm(env = process.env) {
  const realm = buildRealm({ origin: env.PUBLIC_ORIGIN, adminClientSecret: env.KEYCLOAK_ADMIN_CLIENT_SECRET });
  const output = path.resolve(env.KEYCLOAK_REALM_OUTPUT ?? path.join(root, 'deploy/keycloak/private/itecsa-realm.json'));
  if (!output.startsWith(path.join(root, 'deploy/keycloak/private') + path.sep)) fail('ruta de import fuera del directorio privado');
  fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 });
  fs.writeFileSync(output, JSON.stringify(realm, null, 2) + '\n', { mode: 0o600 });
  fs.chmodSync(output, 0o600);
  return output;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  renderRealm();
  console.log('KEYCLOAK_REALM: import privado preparado');
}

export { managementRoles };

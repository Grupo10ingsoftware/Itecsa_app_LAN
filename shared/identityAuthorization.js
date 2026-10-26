import * as keycloak from './keycloakAuthorization.js';

// Provider context is established by authentication, never a request body.
export function authorizationForProvider(provider = 'keycloak') {
  return provider === 'keycloak' ? keycloak : null;
}

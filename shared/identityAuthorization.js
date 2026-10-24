import * as auth0 from './authorization.js';
import * as keycloak from './keycloakAuthorization.js';

// Select only from server/provider context, never from a claim or request body.
// The default preserves legacy callers; unknown explicit providers fail closed.
export function authorizationForProvider(provider = 'auth0') {
  if (provider === 'auth0') return auth0;
  if (provider === 'keycloak') return keycloak;
  return null;
}

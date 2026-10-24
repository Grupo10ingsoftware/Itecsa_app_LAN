// No discovery, credentials or provider calls occur while resolving configuration.
export function resolveIdentityConfiguration(environment = process.env) {
  const provider = environment.AUTH_PROVIDER ?? 'auth0';
  if (!['auth0', 'keycloak'].includes(provider)) throw Error('AUTH_PROVIDER invalido.');
  const required = provider === 'keycloak'
    ? ['KEYCLOAK_ISSUER', 'KEYCLOAK_AUDIENCE', 'KEYCLOAK_CLIENT_ID', 'KEYCLOAK_ROLE_CLIENT_ID', 'KEYCLOAK_JWKS_URI']
    : ['AUTH0_DOMAIN', 'AUTH0_AUDIENCE'];
  if (required.some(key => typeof environment[key] !== 'string' || !environment[key].trim())) {
    throw Error('La configuracion del proveedor de identidad esta incompleta.');
  }
  if (provider === 'auth0') return Object.freeze({ provider,
    issuerBaseURL: `https://${environment.AUTH0_DOMAIN.trim()}/`, audience: environment.AUTH0_AUDIENCE.trim() });
  const issuer = new URL(environment.KEYCLOAK_ISSUER.trim());
  const jwks = new URL(environment.KEYCLOAK_JWKS_URI.trim());
  for (const url of [issuer, jwks]) {
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw Error('URL de identidad no valida.');
    }
    if (url.protocol !== 'https:' &&
      (environment.APP_ENV === 'production' || environment.KEYCLOAK_ALLOW_HTTP !== 'true')) {
      throw Error('Keycloak requiere HTTPS fuera del laboratorio autorizado.');
    }
  }
  const clientId = environment.KEYCLOAK_CLIENT_ID.trim();
  const roleClientId = environment.KEYCLOAK_ROLE_CLIENT_ID.trim();
  const audience = environment.KEYCLOAK_AUDIENCE.trim();
  if (audience === clientId || roleClientId === clientId) throw Error('La SPA y el recurso API deben ser distintos.');
  return Object.freeze({ provider, issuer: environment.KEYCLOAK_ISSUER.trim(),
    jwksUri: environment.KEYCLOAK_JWKS_URI.trim(), audience, clientId, roleClientId });
}

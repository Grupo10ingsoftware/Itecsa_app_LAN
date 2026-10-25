// Server-only configuration. Resolving it performs no network or database work.
export function resolveKeycloakAdministration(env = process.env) {
  const fail = () => { throw Error('Configuracion administrativa Keycloak invalida.'); };
  if (env.AUTH_PROVIDER !== 'keycloak') fail();
  const required = ['KEYCLOAK_ISSUER', 'KEYCLOAK_ROLE_CLIENT_ID', 'KEYCLOAK_ADMIN_CLIENT_ID', 'KEYCLOAK_ADMIN_CLIENT_SECRET'];
  if (required.some(key => typeof env[key] !== 'string' || !env[key].trim())) fail();
  let issuer;
  try { issuer = new URL(env.KEYCLOAK_ISSUER); } catch { fail(); }
  const match = issuer.pathname.match(/^(.*)\/realms\/([^/]+)$/);
  if (!match || !['http:', 'https:'].includes(issuer.protocol) || issuer.username || issuer.password || issuer.search || issuer.hash) fail();
  if (issuer.protocol !== 'https:' && (env.APP_ENV === 'production' || env.KEYCLOAK_ALLOW_HTTP !== 'true')) fail();
  const clientId = env.KEYCLOAK_ADMIN_CLIENT_ID.trim(), roleClientId = env.KEYCLOAK_ROLE_CLIENT_ID.trim();
  if ([env.KEYCLOAK_CLIENT_ID?.trim(), roleClientId].includes(clientId)) fail();
  const timeoutMs = Number(env.KEYCLOAK_ADMIN_TIMEOUT_MS ?? 5000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000) fail();
  let transportOrigin = issuer.origin;
  if (env.KEYCLOAK_ADMIN_TRANSPORT_ORIGIN) {
    // Docker reaches the host tunnel through its internal gateway. This changes
    // only transport; JWT validation and persisted bindings keep the public issuer.
    if (!['development', 'test'].includes(env.APP_ENV)) fail();
    let transport;
    try { transport = new URL(env.KEYCLOAK_ADMIN_TRANSPORT_ORIGIN); } catch { fail(); }
    if (transport.origin !== env.KEYCLOAK_ADMIN_TRANSPORT_ORIGIN || transport.username || transport.password
      || transport.protocol !== issuer.protocol) fail();
    transportOrigin = transport.origin;
  }
  return Object.freeze({ issuer: issuer.href, tokenUrl: transportOrigin + issuer.pathname + '/protocol/openid-connect/token',
    adminUrl: transportOrigin + match[1] + '/admin/realms/' + match[2],
    roleClientId, clientId, clientSecret: env.KEYCLOAK_ADMIN_CLIENT_SECRET, timeoutMs });
}

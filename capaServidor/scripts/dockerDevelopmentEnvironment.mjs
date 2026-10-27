// The host .env names a host CA file; Compose mounts that same CA as a secret.
// Normalize its path in memory before npm/Prisma/nodemon start. Never log the URL.
export function dockerDatabaseUrl(env) {
  if (!env.DATABASE_URL || !env.DB_SSL_CA_PATH || (env.DB_SSL_MODE ?? 'required') !== 'required') return env.DATABASE_URL;
  let url;
  try { url = new URL(env.DATABASE_URL); } catch { throw Error('DATABASE_URL no válida para el contenedor.'); }
  // Leave invalid or ambiguous TLS options for the existing strict validator to reject.
  if (url.searchParams.getAll('sslcert').length !== 1 || !url.searchParams.get('sslcert')
    || url.searchParams.getAll('sslaccept').length !== 1 || url.searchParams.get('sslaccept') !== 'strict') return env.DATABASE_URL;
  url.searchParams.set('sslcert', env.DB_SSL_CA_PATH);
  return url.href;
}

if (process.env.ITECSA_DOCKER_DEVELOPMENT === 'true' && process.env.APP_ENV === 'development') {
  const value = dockerDatabaseUrl(process.env);
  if (value) process.env.DATABASE_URL = value;
}

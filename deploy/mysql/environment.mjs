import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateFirstUser } from '../../shared/deploymentValidation.mjs';

const fail = message => { throw Error('MYSQL_PREFLIGHT: ' + message); };
export function readEnvironment(file) {
  const result = {};
  for (const [index, line] of fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).entries()) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const match = line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!match) fail(`sintaxis .env invalida en linea ${index + 1}`);
    const [, key, raw] = match;
    if (Object.hasOwn(result, key)) fail(`variable repetida: ${key}`);
    let value;
    if (/^["']/.test(raw)) {
      const end = raw.indexOf(raw[0], 1);
      if (end < 0 || !/^\s*(?:#.*)?$/.test(raw.slice(end + 1))) fail(`comillas invalidas: ${key}`);
      value = raw.slice(1, end);
    } else {
      value = raw.split(/\s+#/, 1)[0].trimEnd();
      if (/["']/.test(value)) fail(`usar comillas alrededor del valor completo: ${key}`);
    }
    // Values are literal. Compose receives these exports instead of reparsing/interpolating this file.
    if (/[\r\n\0]/.test(value)) fail(`valor multilinea no admitido: ${key}`);
    result[key] = value;
  }
  return result;
}

export function validateDeployment(env, root, action) {
  const required = key => {
    if (!env[key]?.trim() || /<[^>]+>/.test(env[key])) fail(`completar ${key}`);
  };
  for (const key of ['COMPOSE_PROJECT_NAME', 'APP_VERSION', 'DEPLOY_IMAGE_MODE', 'MYSQL_IMAGE',
    'API_IMAGE', 'WEB_IMAGE', 'DB_TOOLS_IMAGE', 'KEYCLOAK_IMAGE', 'API_ENV_FILE', 'WEB_ENV_FILE',
    'MYSQL_CERTS_DIR', 'MYSQL_PRIVATE_DIR', 'PUBLIC_ORIGIN', 'LAN_CA_FILE', 'LAN_TLS_CERT_FILE',
    'LAN_TLS_KEY_FILE', 'MYSQL_DATABASE', 'MYSQL_USER', 'MYSQL_MIGRATION_USER', 'KEYCLOAK_DB_NAME',
    'KEYCLOAK_DB_USER', 'KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME', 'KEYCLOAK_OPERATOR_USERNAME']) required(key);
  for (const key of ['MYSQL_ROOT_PASSWORD', 'MYSQL_PASSWORD', 'MYSQL_MIGRATION_PASSWORD',
    'KEYCLOAK_DB_PASSWORD', 'KEYCLOAK_OPERATOR_PASSWORD',
    'KEYCLOAK_ADMIN_CLIENT_SECRET']) {
    required(key);
    if (env[key].length < (key === 'KEYCLOAK_ADMIN_CLIENT_SECRET' ? 32 : 20)) fail(`${key} demasiado corto`);
  }
  if (action === 'install' || env.KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD) {
    required('KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD');
    if (env.KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD.length < 20) fail('KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD demasiado corto');
  }
  for (const key of ['MYSQL_DATABASE', 'MYSQL_USER', 'MYSQL_MIGRATION_USER', 'KEYCLOAK_DB_NAME', 'KEYCLOAK_DB_USER']) {
    if (!/^[A-Za-z0-9_]{1,32}$/.test(env[key])) fail(`identificador invalido: ${key}`);
  }
  if (env.MYSQL_DATABASE.toLowerCase() === env.KEYCLOAK_DB_NAME.toLowerCase()) fail('las bases MySQL y Keycloak deben ser distintas');
  const users = [env.MYSQL_USER, env.MYSQL_MIGRATION_USER, env.KEYCLOAK_DB_USER].map(v => v.toLowerCase());
  if (new Set(users).size !== 3 || users.includes('root')) fail('los usuarios de base deben ser distintos y no root');
  const passwords = ['MYSQL_ROOT_PASSWORD', 'MYSQL_PASSWORD', 'MYSQL_MIGRATION_PASSWORD', 'KEYCLOAK_DB_PASSWORD'].map(k => env[k]);
  if (new Set(passwords).size !== 4) fail('las cuatro claves MySQL deben ser distintas');
  if (env.KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME.toLowerCase() === env.KEYCLOAK_OPERATOR_USERNAME.toLowerCase()) fail('los administradores temporal y permanente deben ser distintos');
  if (env.APP_RUNTIME_ENV && env.APP_RUNTIME_ENV !== 'production') fail('el stack integrado requiere APP_RUNTIME_ENV=production');
  for (const key of ['API_ENV_FILE', 'WEB_ENV_FILE']) {
    try { fs.accessSync(path.resolve(root, env[key]), fs.constants.R_OK); }
    catch { fail(`archivo no legible: ${key}`); }
  }
  const api = readEnvironment(path.resolve(root, env.API_ENV_FILE));
  const forbidden = Object.keys(api).filter(k => /^(DB_TARGET|DB_HOST|DB_PORT|DB_USER|DB_PASSWORD|DB_NAME|DB_SSL_MODE|DB_SSL_CA_PATH|DATABASE_URL)$/.test(k));
  if (forbidden.length) fail('API_ENV_FILE contiene variables de conexion MySQL heredadas; recrear capaServidor/.env desde capaServidor/env.example');
  for (const key of ['PIN_SECRET', 'RATE_LIMIT_SECRET', 'SECURITY_LOG_HMAC_KEY', 'CURSOR_SECRET']) {
    if (!/^[A-Za-z0-9+/]{43}=$/.test(api[key] ?? '') || Buffer.from(api[key], 'base64').length !== 32) {
      fail(`API_ENV_FILE: ${key} debe contener 32 bytes en base64`);
    }
  }
  if (new Set(['PIN_SECRET', 'RATE_LIMIT_SECRET', 'SECURITY_LOG_HMAC_KEY', 'CURSOR_SECRET'].map(k => api[k])).size !== 4) fail('los cuatro secretos de API deben ser distintos');
  for (const file of [env.API_ENV_FILE, env.WEB_ENV_FILE]) {
    for (const [key, value] of Object.entries(readEnvironment(path.resolve(root, file)))) {
      if (/<[^>]+>/.test(value)) fail(`marcador sin reemplazar: ${key}`);
    }
  }
  if (action === 'first-user') validateFirstUser(env);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const [mode, file, action] = process.argv.slice(2);
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    const env = readEnvironment(file);
    if (mode === 'images') {
      for (const key of ['APP_VERSION', 'MYSQL_IMAGE', 'API_IMAGE', 'WEB_IMAGE', 'DB_TOOLS_IMAGE', 'KEYCLOAK_IMAGE']) {
        process.stdout.write(`${key}\0${env[key] ?? ''}\0`);
      }
    } else if (mode === 'load') {
      // Only declared deployment keys can enter the shell. No eval/source, and no ambient override.
      const defaults = readEnvironment(path.join(root, 'deploy/mysql.env.example'));
      for (const key of Object.keys(env)) if (!Object.hasOwn(defaults, key)) fail(`variable de despliegue desconocida: ${key}`);
      for (const [key, value] of Object.entries(defaults)) {
        process.stdout.write(`${key}\0${env[key] ?? (/<[^>]+>/.test(value) ? '' : value)}\0`);
      }
    } else if (mode === 'validate') validateDeployment(process.env, root, action);
    else fail('modo invalido');
  } catch (error) {
    // Filesystem errors may name a path, but never dump .env content.
    console.error(error.code ? `MYSQL_PREFLIGHT: archivo no accesible (${error.code})` : error.message);
    process.exitCode = 1;
  }
}

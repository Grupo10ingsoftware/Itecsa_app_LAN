import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// This receipt only controls retries of the initial installation. It is not a migration journal.
export function installationState(action, env = process.env, directory = '/run/mysql-state') {
  const file = path.join(directory, 'installation.json');
  const record = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  const identity = fs.existsSync(path.join(directory, 'instance.env'));
  const keys = ['COMPOSE_PROJECT_NAME', 'APP_VERSION', 'MYSQL_DATABASE', 'MYSQL_USER', 'MYSQL_PASSWORD',
    'MYSQL_ROOT_PASSWORD', 'MYSQL_MIGRATION_USER', 'MYSQL_MIGRATION_PASSWORD', 'KEYCLOAK_DB_NAME',
    'KEYCLOAK_DB_USER', 'KEYCLOAK_DB_PASSWORD', 'PUBLIC_ORIGIN', 'KEYCLOAK_ADMIN_CLIENT_SECRET',
    'KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME', 'KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD',
    'KEYCLOAK_OPERATOR_USERNAME', 'KEYCLOAK_OPERATOR_PASSWORD'];
  const fingerprint = createHash('sha256').update(JSON.stringify(keys.map(k => env[k] ?? ''))).digest('hex');
  const fail = message => { throw Error('MYSQL_INSTALL: ' + message); };
  if (action === 'status') return record?.status ?? (identity ? 'legacy' : 'absent');
  if (action === 'begin') {
    if (record || identity) fail('ya existe una instalacion; usar resume si esta interrumpida o update si esta completa');
  } else if (action === 'resume' || action === 'complete') {
    if (!record || record.status !== 'pending') fail('no existe una instalacion pendiente registrada');
    if (record.fingerprint !== fingerprint) fail('resume requiere la misma version y configuracion del install original');
    if (action === 'resume') return 'pending';
    if (!identity) fail('falta la identidad MySQL');
  } else fail('accion invalida');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const content = JSON.stringify({ status: action === 'complete' ? 'complete' : 'pending', fingerprint }) + '\n';
  if (action === 'begin') {
    fs.writeFileSync(file, content, { flag: 'wx', mode: 0o600 });
    return 'pending';
  }
  const temporary = file + '.tmp';
  fs.writeFileSync(temporary, content, { mode: 0o600 });
  fs.renameSync(temporary, file);
  return action === 'complete' ? 'complete' : 'pending';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { console.log(installationState(process.argv[2])); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

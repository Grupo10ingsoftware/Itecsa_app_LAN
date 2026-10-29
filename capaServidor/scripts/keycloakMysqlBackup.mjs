import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import mariadb from 'mariadb';
import { readLabInstanceIdentity } from '../src/database/mysqlLabSafety.js';

const env = process.env;
const action = process.argv[2];
const fail = message => { throw Error('KEYCLOAK_BACKUP: ' + message); };
const directory = path.resolve(env.KEYCLOAK_BACKUP_DIR ?? '/backups');
const database = env.KEYCLOAK_DB_NAME;
if (!/^[A-Za-z0-9_]{1,32}$/.test(database ?? '') || !env.MYSQL_ROOT_PASSWORD ||
    !['backup', 'restore'].includes(action)) fail('parametros invalidos');
const identity = readLabInstanceIdentity(env.MYSQL_INSTANCE_FILE);
if (identity.MYSQL_COMPOSE_PROJECT !== env.COMPOSE_PROJECT_NAME ||
    identity.MYSQL_DATABASE !== env.MYSQL_DATABASE) fail('identidad de instalacion incompatible');
const connection = await mariadb.createConnection({
  socketPath: '/var/run/mysqld/mysqld.sock', user: 'root', password: env.MYSQL_ROOT_PASSWORD,
});
try {
  const [server] = await connection.query('SELECT @@hostname AS hostname, @@server_uuid AS uuid, @@version AS version, @@require_secure_transport AS tls');
  if (server.hostname !== 'itecsa-mysql' || server.uuid !== identity.MYSQL_SERVER_UUID ||
      !String(server.version).startsWith('8.4.') || Number(server.tls) !== 1) fail('MySQL inesperado');
  const [schema] = await connection.query('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?', [database]);
  if (!schema) fail('base Keycloak ausente');
  const sha = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  async function run(binary, args, stdio) {
    const child = spawn(binary, args, { env: { ...env, MYSQL_PWD: env.MYSQL_ROOT_PASSWORD }, stdio });
    let stderr = '';
    child.stderr?.on('data', chunk => { if (stderr.length < 8192) stderr += chunk; });
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject); child.once('close', resolve);
    });
    if (code !== 0) fail(binary + ' termino con codigo ' + code + ': ' + stderr.trim());
  }
  if (action === 'backup') {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const name = `${env.COMPOSE_PROJECT_NAME}-${database}-${stamp}`;
    const sql = path.join(directory, name + '.sql');
    const fd = fs.openSync(sql, 'wx', 0o600);
    try {
      await run('mariadb-dump', ['--socket', '/var/run/mysqld/mysqld.sock', '--user', 'root',
        '--single-transaction', '--quick', '--skip-lock-tables', '--no-tablespaces',
        '--routines', '--triggers', '--events', '--hex-blob', '--default-character-set=utf8mb4',
        database], ['ignore', fd, 'pipe']);
    } catch (error) { fs.rmSync(sql, { force: true }); throw error; }
    finally { fs.closeSync(fd); }
    fs.writeFileSync(path.join(directory, name + '.manifest.json'), JSON.stringify({
      format: 1, database, project: env.COMPOSE_PROJECT_NAME, serverUuid: server.uuid,
      keycloakVersion: '26.8.1', sqlFile: path.basename(sql), sha256: sha(sql),
      createdAt: new Date().toISOString(),
    }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    console.log('KEYCLOAK_BACKUP: ' + path.basename(sql));
  } else {
    const name = env.KEYCLOAK_RESTORE_FILE;
    if (!name || name !== path.basename(name) || !name.endsWith('.sql')) fail('archivo SQL invalido');
    const sql = path.join(directory, name);
    const manifest = JSON.parse(fs.readFileSync(sql.replace(/\.sql$/, '.manifest.json'), 'utf8'));
    if (manifest.format !== 1 || manifest.database !== database || manifest.project !== env.COMPOSE_PROJECT_NAME ||
        manifest.sqlFile !== name || manifest.keycloakVersion !== '26.8.1' ||
        !/^[0-9a-f-]{36}$/i.test(manifest.serverUuid) || manifest.sha256 !== sha(sql)) fail('manifiesto o checksum invalido');
    const confirm = `${env.COMPOSE_PROJECT_NAME}:${database}:${server.uuid}`;
    if (env.KEYCLOAK_RESTORE_CONFIRM !== confirm) fail('confirmacion incorrecta: ' + confirm);
    const tables = await connection.query('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?', [database]);
    if (tables.length) fail('restauracion solo permitida sobre una base vacia');
    const fd = fs.openSync(sql, 'r');
    try {
      await run('mariadb', ['--socket', '/var/run/mysqld/mysqld.sock', '--user', 'root', database],
        [fd, 'ignore', 'pipe']);
    } finally { fs.closeSync(fd); }
    console.log('KEYCLOAK_RESTORE: restauracion completada');
  }
} finally { await connection.end(); }

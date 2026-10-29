import mariadb from 'mariadb';
import { readLabInstanceIdentity } from '../src/database/mysqlLabSafety.js';

const env = process.env;
const identifier = /^[A-Za-z0-9_]{1,32}$/;
const fail = message => { throw Error('KEYCLOAK_MYSQL: ' + message); };
const database = env.KEYCLOAK_DB_NAME;
const user = env.KEYCLOAK_DB_USER;
if (!identifier.test(database ?? '') || !identifier.test(user ?? '') ||
    !env.KEYCLOAK_DB_PASSWORD || !env.MYSQL_ROOT_PASSWORD ||
    database === env.MYSQL_DATABASE || [env.MYSQL_USER, env.MYSQL_MIGRATION_USER].includes(user)) {
  fail('base, usuario o credenciales invalidos');
}
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
  const existing = await connection.query('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?', [database]);
  if (existing.length) {
    const tables = await connection.query('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?', [database]);
    if (tables.length) fail('la base Keycloak ya contiene tablas');
  } else {
    await connection.query(`CREATE DATABASE ${connection.escapeId(database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  }
  const account = `'${user}'@'%'`;
  const present = await connection.query('SELECT User FROM mysql.user WHERE User = ? AND Host = ?', [user, '%']);
  if (present.length) fail('la cuenta Keycloak ya existe; no se alterara su clave');
  await connection.query(`CREATE USER ${account} IDENTIFIED BY ? REQUIRE SSL`, [env.KEYCLOAK_DB_PASSWORD]);
  await connection.query(`GRANT ALL PRIVILEGES ON ${connection.escapeId(database)}.* TO ${account}`);
  console.log('KEYCLOAK_MYSQL: base y cuenta exclusivas creadas');
} finally {
  await connection.end();
}

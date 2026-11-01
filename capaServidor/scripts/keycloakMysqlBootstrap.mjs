import mariadb from 'mariadb';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readLabInstanceIdentity } from '../src/database/mysqlLabSafety.js';
import { createStrictTlsOptions } from '../src/database/connectionConfig.js';

export async function bootstrapKeycloakDatabase(env = process.env, connector = mariadb) {
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
  const connection = await connector.createConnection({
    socketPath: '/var/run/mysqld/mysqld.sock', user: 'root', password: env.MYSQL_ROOT_PASSWORD,
  });
  try {
    const [server] = await connection.query('SELECT @@hostname AS hostname, @@server_uuid AS uuid, @@version AS version, @@require_secure_transport AS tls');
    if (server.hostname !== 'itecsa-mysql' || server.uuid !== identity.MYSQL_SERVER_UUID ||
        !String(server.version).startsWith('8.4.') || Number(server.tls) !== 1) fail('MySQL inesperado');
    const existing = await connection.query('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?', [database]);
    if (existing.length) {
      const tables = await connection.query('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?', [database]);
      if (tables.length && env.KEYCLOAK_BOOTSTRAP_RESUME !== '1') fail('la base Keycloak ya contiene tablas');
    } else {
      await connection.query(`CREATE DATABASE ${connection.escapeId(database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    }
    const account = `'${user}'@'%'`;
    const present = await connection.query('SELECT User FROM mysql.user WHERE User = ? AND Host = ?', [user, '%']);
    if (present.length) {
      if (env.KEYCLOAK_BOOTSTRAP_RESUME !== '1') fail('la cuenta Keycloak ya existe; usar resume');
      // Verify the existing password before completing grants. Never reset it on a retry.
      let probe;
      try {
        probe = await connector.createConnection({ host: 'mysql', port: 3306, user,
          password: env.KEYCLOAK_DB_PASSWORD,
          ssl: createStrictTlsOptions('mysql', fs.readFileSync(env.DB_SSL_CA_PATH)) });
        const [current] = await probe.query('SELECT CURRENT_USER() AS account');
        if (current.account !== `${user}@%`) fail('cuenta Keycloak inesperada');
      } catch { fail('no se pudo verificar la clave existente de Keycloak MySQL'); }
      finally { if (probe) await probe.end(); }
      const grants = await connection.query(`SHOW GRANTS FOR ${account}`);
      const expected = `GRANT ALL PRIVILEGES ON ${connection.escapeId(database)}.* TO `;
      if (grants.some(row => {
        const grant = String(Object.values(row)[0]);
        return (!grant.startsWith('GRANT USAGE ON *.* TO ') && !grant.startsWith(expected)) || /WITH GRANT OPTION/.test(grant);
      })) fail('la cuenta Keycloak tiene privilegios inesperados');
      const [security] = await connection.query('SELECT ssl_type FROM mysql.user WHERE User = ? AND Host = ?', [user, '%']);
      if (security?.ssl_type !== 'ANY') fail('la cuenta Keycloak debe requerir SSL');
    } else {
      await connection.query(`CREATE USER ${account} IDENTIFIED BY ? REQUIRE SSL`, [env.KEYCLOAK_DB_PASSWORD]);
    }
    await connection.query(`GRANT ALL PRIVILEGES ON ${connection.escapeId(database)}.* TO ${account}`);
    console.log('KEYCLOAK_MYSQL: base y cuenta exclusivas verificadas');
  } finally {
    await connection.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  bootstrapKeycloakDatabase().catch(error => {
    console.error(error.message?.startsWith('KEYCLOAK_MYSQL:') ? error.message
      : 'KEYCLOAK_MYSQL: no se pudo acceder a MySQL o a sus archivos; comprobar servicio, identidad y credenciales');
    process.exitCode = 1;
  });
}

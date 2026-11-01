import fs from "node:fs";
import path from "node:path";
import mariadb from "mariadb";

const IDENTIFIER = /^[A-Za-z0-9_]{1,32}$/;
const MYSQL_LAB = Object.freeze({
  database: "itecsa_lab",
  hostname: "itecsa-mysql-lab",
  socketPath: "/var/run/mysqld/mysqld.sock",
  apiUser: "itecsa_app",
  migrationUser: "itecsa_migrator",
});

function expectedHostname(env) {
  return env.MYSQL_EXPECTED_HOSTNAME ?? env.MYSQL_LAB_EXPECTED_HOSTNAME ?? MYSQL_LAB.hostname;
}

function fail(message) {
  throw new Error(`Bootstrap MySQL rechazado: ${message}`);
}

function account(value, label) {
  if (!IDENTIFIER.test(value ?? "")) fail(`${label} no es un identificador permitido.`);
  return `'${value}'@'%'`;
}

export function validateAccountBootstrapEnvironment(env = process.env) {
  for (const key of ["MYSQL_ROOT_PASSWORD", "MYSQL_DATABASE", "MYSQL_USER", "MYSQL_PASSWORD", "MYSQL_MIGRATION_USER", "MYSQL_MIGRATION_PASSWORD"]) {
    if (env[key] === undefined || env[key] === "") fail(`falta ${key}.`);
  }
  if (!IDENTIFIER.test(env.MYSQL_DATABASE)) fail("MYSQL_DATABASE no es un identificador permitido.");
  if (!env.MYSQL_STANDALONE && env.MYSQL_DATABASE !== MYSQL_LAB.database) fail("MYSQL_DATABASE no coincide con la base fija del laboratorio.");
  if (!env.MYSQL_STANDALONE && env.MYSQL_USER !== MYSQL_LAB.apiUser) fail("MYSQL_USER no coincide con la cuenta API fija del laboratorio.");
  if (!env.MYSQL_STANDALONE && env.MYSQL_MIGRATION_USER !== MYSQL_LAB.migrationUser) fail("MYSQL_MIGRATION_USER no coincide con la cuenta migradora fija del laboratorio.");
  if (env.MYSQL_USER === env.MYSQL_MIGRATION_USER) fail("las cuentas API y migradora deben ser distintas.");
  account(env.MYSQL_USER, "MYSQL_USER");
  account(env.MYSQL_MIGRATION_USER, "MYSQL_MIGRATION_USER");
}

export async function bootstrapMysqlLabAccounts(env = process.env, {
  connector = mariadb,
  identityPath = env.MYSQL_INSTANCE_FILE ?? env.MYSQL_LAB_INSTANCE_FILE ?? "/run/mysql-state/instance.env",
} = {}) {
  validateAccountBootstrapEnvironment(env);
  const connection = await connector.createConnection({
    socketPath: MYSQL_LAB.socketPath,
    user: "root",
    password: env.MYSQL_ROOT_PASSWORD,
    database: env.MYSQL_DATABASE,
  });
  try {
    const rows = await connection.query(`SELECT DATABASE() AS databaseName, @@hostname AS hostname,
      @@server_uuid AS serverUuid, @@port AS serverPort, @@version AS version,
      @@version_comment AS versionComment, @@require_secure_transport AS secureTransport`);
    const server = rows[0];
    if (server.databaseName !== env.MYSQL_DATABASE) fail("DATABASE() no coincide con MYSQL_DATABASE.");
    if (server.hostname !== expectedHostname(env)) fail("el socket no pertenece al hostname esperado.");
    if (!/^[0-9a-f-]{36}$/i.test(String(server.serverUuid ?? ""))) fail("server_uuid no es valido.");
    if (!String(server.version).startsWith("8.4.")) fail("la instancia local no usa MySQL 8.4.");
    if (Number(server.secureTransport) !== 1) fail("require_secure_transport no esta habilitado.");
    if (env.MYSQL_REQUIRE_EMPTY === "1") {
      const tables = await connection.query(
        "SELECT TABLE_NAME AS tableName FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?",
        [env.MYSQL_DATABASE],
      );
      if (tables.length) fail("install/restore requiere una base nueva sin tablas.");
    }
    try { fs.accessSync(path.dirname(identityPath), fs.constants.W_OK); }
    catch { fail("el directorio de identidad local no es escribible."); }

    const api = account(env.MYSQL_USER, "MYSQL_USER");
    const migrator = account(env.MYSQL_MIGRATION_USER, "MYSQL_MIGRATION_USER");
    const schema = connection.escapeId(env.MYSQL_DATABASE);
    await connection.query(`CREATE USER IF NOT EXISTS ${api} IDENTIFIED BY ?`, [env.MYSQL_PASSWORD]);
    await connection.query(`ALTER USER ${api} IDENTIFIED BY ?`, [env.MYSQL_PASSWORD]);
    await connection.query(`REVOKE ALL PRIVILEGES, GRANT OPTION FROM ${api}`);
    await connection.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${schema}.* TO ${api}`);
    await connection.query(`CREATE USER IF NOT EXISTS ${migrator} IDENTIFIED BY ?`, [env.MYSQL_MIGRATION_PASSWORD]);
    await connection.query(`ALTER USER ${migrator} IDENTIFIED BY ?`, [env.MYSQL_MIGRATION_PASSWORD]);
    await connection.query(`REVOKE ALL PRIVILEGES, GRANT OPTION FROM ${migrator}`);
    await connection.query(`GRANT ALL PRIVILEGES ON ${schema}.* TO ${migrator}`);

    const identity = [
      `MYSQL_SERVER_UUID=${server.serverUuid}`,
      `MYSQL_SERVER_HOSTNAME=${server.hostname}`,
      `MYSQL_SERVER_PORT=${server.serverPort}`,
      `MYSQL_COMPOSE_PROJECT=${env.COMPOSE_PROJECT_NAME ?? ""}`,
      `MYSQL_DATABASE=${env.MYSQL_DATABASE}`,
      `MYSQL_LAB_SERVER_UUID=${server.serverUuid}`,
      `MYSQL_LAB_SERVER_HOSTNAME=${server.hostname}`,
      `MYSQL_LAB_SERVER_PORT=${server.serverPort}`,
      "",
    ].join("\n");
    fs.writeFileSync(identityPath, identity, { mode: 0o600 });
    fs.chmodSync(identityPath, 0o600);
    return { identityPath, serverUuid: server.serverUuid };
  } finally {
    await connection.end();
  }
}

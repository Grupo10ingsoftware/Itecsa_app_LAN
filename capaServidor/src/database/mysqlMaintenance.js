import mariadb from "mariadb";
import { readLabInstanceIdentity } from "./mysqlLabSafety.js";

const IDENTIFIER = /^[A-Za-z0-9_]{1,32}$/;
function fail(message) { throw new Error(`Mantenimiento MySQL rechazado: ${message}`); }
function account(value, label) {
  if (!IDENTIFIER.test(value ?? "")) fail(`${label} no es un identificador permitido.`);
  return `'${value}'@'%'`;
}

export async function setMysqlApiWrites(env = process.env, { connector = mariadb } = {}) {
  const action = env.MYSQL_MAINTENANCE_ACTION;
  if (!["lock", "migrate", "unlock"].includes(action)) fail("accion desconocida.");
  if (!IDENTIFIER.test(env.MYSQL_DATABASE ?? "")) fail("MYSQL_DATABASE no es valido.");
  const identity = readLabInstanceIdentity(env.MYSQL_INSTANCE_FILE);
  const connection = await connector.createConnection({
    socketPath: "/var/run/mysqld/mysqld.sock",
    user: "root",
    password: env.MYSQL_ROOT_PASSWORD,
    database: env.MYSQL_DATABASE,
  });
  try {
    const [server] = await connection.query(`SELECT DATABASE() AS databaseName, @@hostname AS hostname,
      @@server_uuid AS serverUuid, @@version AS version, @@version_comment AS versionComment,
      @@require_secure_transport AS secureTransport`);
    if (server.databaseName !== env.MYSQL_DATABASE ||
        server.hostname !== (env.MYSQL_EXPECTED_HOSTNAME ?? "itecsa-mysql") ||
        server.hostname !== identity.MYSQL_SERVER_HOSTNAME ||
        server.serverUuid !== identity.MYSQL_SERVER_UUID ||
        !String(server.version).startsWith("8.4.") || Number(server.secureTransport) !== 1 ||
        /aiven/i.test(`${server.hostname} ${server.versionComment}`)) {
      fail("la identidad efectiva no corresponde al despliegue autonomo.");
    }
    const schema = connection.escapeId(env.MYSQL_DATABASE);
    const api = account(env.MYSQL_USER, "MYSQL_USER");
    const migrator = account(env.MYSQL_MIGRATION_USER, "MYSQL_MIGRATION_USER");
    const revokeIfPresent = async (sql) => {
      try { await connection.query(sql); }
      catch (error) { if (Number(error?.errno) !== 1141) throw error; }
    };
    if (action === "lock") {
      await revokeIfPresent(`REVOKE INSERT, UPDATE, DELETE ON ${schema}.* FROM ${api}`);
      await revokeIfPresent(`REVOKE ALL PRIVILEGES, GRANT OPTION FROM ${migrator}`);
      const sessions = await connection.query(
        "SELECT ID AS id FROM information_schema.PROCESSLIST WHERE USER IN (?, ?) AND ID <> CONNECTION_ID()",
        [env.MYSQL_USER, env.MYSQL_MIGRATION_USER],
      );
      for (const session of sessions) {
        const id = Number(session.id);
        if (Number.isInteger(id) && id > 0) await connection.query(`KILL CONNECTION ${id}`);
      }
    } else if (action === "migrate") {
      await connection.query(`GRANT ALL PRIVILEGES ON ${schema}.* TO ${migrator}`);
    } else {
      await connection.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${schema}.* TO ${api}`);
    }
    return { action, serverUuid: server.serverUuid };
  } finally {
    await connection.end();
  }
}

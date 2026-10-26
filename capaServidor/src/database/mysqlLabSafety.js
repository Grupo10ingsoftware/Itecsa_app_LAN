import fs from "node:fs";
import mariadb from "mariadb";
import { createStrictTlsOptions, resolveDatabaseConnection } from "./connectionConfig.js";

const LAB_TARGETS = new Set(["mysql-lab-host", "mysql-lab-docker"]);
const AIVEN_MARKER = /aiven/i;
const MYSQL_LAB = Object.freeze({
  database: "itecsa_lab",
  hostname: "itecsa-mysql-lab",
  port: 3306,
  apiUser: "itecsa_app",
  migrationUser: "itecsa_migrator",
});

function fail(message) {
  throw new Error(`Inicializacion MySQL rechazada: ${message}`);
}

export function buildMigrationDatabaseUrl(env = process.env) {
  const connection = resolveDatabaseConnection(env);
  const user = env.DB_MIGRATION_USER?.trim();
  const password = env.DB_MIGRATION_PASSWORD;
  if (!user || !password) fail("faltan DB_MIGRATION_USER o DB_MIGRATION_PASSWORD.");

  const url = new URL("mysql://localhost");
  url.username = user;
  url.password = password;
  url.hostname = connection.host;
  url.port = String(connection.port);
  url.pathname = `/${connection.database}`;
  if (connection.sslMode === "required") {
    url.searchParams.set("sslcert", env.DB_SSL_CA_PATH);
    url.searchParams.set("sslaccept", "strict");
  }
  return url.href;
}

export function readLabInstanceIdentity(path = process.env.MYSQL_LAB_INSTANCE_FILE) {
  if (!path) fail("falta MYSQL_LAB_INSTANCE_FILE.");
  let contents;
  try { contents = fs.readFileSync(path, "utf8"); }
  catch { fail("no se pudo leer la identidad local del volumen."); }
  const values = Object.fromEntries(contents.split(/\r?\n/).filter(Boolean).map((line) => {
    const index = line.indexOf("=");
    return index > 0 ? [line.slice(0, index), line.slice(index + 1)] : [line, ""];
  }));
  if (!/^[0-9a-f-]{36}$/i.test(values.MYSQL_LAB_SERVER_UUID ?? "")) fail("server_uuid local invalido.");
  if (!values.MYSQL_LAB_SERVER_HOSTNAME || !values.MYSQL_LAB_SERVER_PORT) fail("identidad local incompleta.");
  if (values.MYSQL_LAB_SERVER_HOSTNAME !== MYSQL_LAB.hostname ||
      Number(values.MYSQL_LAB_SERVER_PORT) !== MYSQL_LAB.port) fail("identidad local no corresponde al laboratorio.");
  return values;
}

export function assertLabSelection(env = process.env) {
  if (!LAB_TARGETS.has(env.DB_TARGET)) fail("DB_TARGET no selecciona el laboratorio.");
  if (env.DB_NAME !== MYSQL_LAB.database) fail("DB_NAME no coincide con la base fija del laboratorio.");
  if (env.DB_USER !== MYSQL_LAB.apiUser) fail("DB_USER no coincide con la cuenta API fija del laboratorio.");
  if (env.DB_MIGRATION_USER !== MYSQL_LAB.migrationUser) fail("DB_MIGRATION_USER no coincide con la cuenta migradora fija del laboratorio.");
  if (!env.MYSQL_LAB_INIT_CONFIRM || env.MYSQL_LAB_INIT_CONFIRM !== env.DB_NAME) {
    fail("MYSQL_LAB_INIT_CONFIRM debe coincidir exactamente con DB_NAME.");
  }
  return resolveDatabaseConnection(env);
}

export function verifyEffectiveLabServer(row, identity, env = process.env) {
  const database = String(row.databaseName ?? "");
  const hostname = String(row.hostname ?? "");
  const uuid = String(row.serverUuid ?? "");
  const version = String(row.version ?? "");
  const versionComment = String(row.versionComment ?? "");
  const currentUser = String(row.currentUser ?? "");
  if (database !== env.DB_NAME) fail("DATABASE() no coincide con DB_NAME.");
  if (hostname !== identity.MYSQL_LAB_SERVER_HOSTNAME) fail("hostname efectivo desconocido.");
  if (uuid !== identity.MYSQL_LAB_SERVER_UUID) fail("server_uuid no pertenece al volumen registrado.");
  if (Number(row.serverPort) !== Number(identity.MYSQL_LAB_SERVER_PORT)) fail("puerto interno efectivo inesperado.");
  if (!version.startsWith("8.4.")) fail("la version efectiva no es MySQL 8.4.");
  if (Number(row.secureTransport) !== 1) fail("require_secure_transport no esta habilitado.");
  if (currentUser.split("@")[0] !== env.DB_USER) fail("CURRENT_USER() no coincide con la cuenta API.");
  if (AIVEN_MARKER.test(`${hostname} ${versionComment}`)) fail("el servidor efectivo contiene indicadores de Aiven.");
  return true;
}

export async function openVerifiedLabConnection(env = process.env, { connector = mariadb } = {}) {
  const selected = assertLabSelection(env);
  const identity = readLabInstanceIdentity(env.MYSQL_LAB_INSTANCE_FILE);
  const connection = await connector.createConnection({
    host: selected.host,
    port: selected.port,
    user: selected.user,
    password: selected.password,
    database: selected.database,
    connectTimeout: 8000,
    ssl: createStrictTlsOptions(selected.host, selected.ca),
  });
  try {
    const rows = await connection.query(`SELECT DATABASE() AS databaseName, @@hostname AS hostname,
      @@server_uuid AS serverUuid, @@port AS serverPort, @@version AS version,
      @@version_comment AS versionComment, @@require_secure_transport AS secureTransport,
      CURRENT_USER() AS currentUser`);
    verifyEffectiveLabServer(rows[0], identity, env);
    return connection;
  } catch (error) {
    await connection.end().catch(() => {});
    throw error;
  }
}

export async function assertSafeMigrationState(connection, database) {
  const tables = await connection.query(
    "SELECT TABLE_NAME AS tableName FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?",
    [database],
  );
  const names = new Set(tables.map(({ tableName }) => tableName));
  const hasHistory = names.has("_prisma_migrations");
  const applicationTables = [...names].filter((name) => name !== "_prisma_migrations");
  if (!hasHistory && applicationTables.length > 0) fail("hay tablas sin historial Prisma.");
  if (hasHistory) {
    const failed = await connection.query(
      "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL",
    );
    if (failed.length) fail("el historial Prisma contiene migraciones fallidas o revertidas.");
  }
  return { fresh: !hasHistory, tableCount: applicationTables.length };
}

import fs from "node:fs";
import mariadb from "mariadb";
import { createStrictTlsOptions, resolveDatabaseConnection } from "./connectionConfig.js";

const LAB_TARGETS = new Set(["mysql-lab-host", "mysql-lab-docker"]);
const DOCKER_TARGET = "mysql-docker";
const MYSQL_LAB = Object.freeze({
  database: "itecsa_lab",
  hostname: "itecsa-mysql-lab",
  port: 3306,
  apiUser: "itecsa_app",
  migrationUser: "itecsa_migrator",
});

function standalone(env) {
  return env.DB_TARGET === DOCKER_TARGET;
}

function expected(env) {
  return standalone(env) ? {
    database: env.DB_NAME,
    hostname: env.MYSQL_EXPECTED_HOSTNAME ?? "itecsa-mysql",
    port: 3306,
    apiUser: env.DB_USER,
    migrationUser: env.DB_MIGRATION_USER,
    confirmation: env.MYSQL_INIT_CONFIRM,
  } : {
    ...MYSQL_LAB,
    confirmation: env.MYSQL_LAB_INIT_CONFIRM,
  };
}

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

export function readLabInstanceIdentity(path = process.env.MYSQL_INSTANCE_FILE ?? process.env.MYSQL_LAB_INSTANCE_FILE) {
  if (!path) fail("falta MYSQL_INSTANCE_FILE.");
  let contents;
  try { contents = fs.readFileSync(path, "utf8"); }
  catch { fail("no se pudo leer la identidad local del volumen."); }
  const values = Object.fromEntries(contents.split(/\r?\n/).filter(Boolean).map((line) => {
    const index = line.indexOf("=");
    return index > 0 ? [line.slice(0, index), line.slice(index + 1)] : [line, ""];
  }));
  const identity = {
    ...values,
    MYSQL_SERVER_UUID: values.MYSQL_SERVER_UUID ?? values.MYSQL_LAB_SERVER_UUID,
    MYSQL_SERVER_HOSTNAME: values.MYSQL_SERVER_HOSTNAME ?? values.MYSQL_LAB_SERVER_HOSTNAME,
    MYSQL_SERVER_PORT: values.MYSQL_SERVER_PORT ?? values.MYSQL_LAB_SERVER_PORT,
  };
  if (!/^[0-9a-f-]{36}$/i.test(identity.MYSQL_SERVER_UUID ?? "")) fail("server_uuid local invalido.");
  if (!identity.MYSQL_SERVER_HOSTNAME || !identity.MYSQL_SERVER_PORT) fail("identidad local incompleta.");
  return identity;
}

export function assertLabSelection(env = process.env) {
  if (!LAB_TARGETS.has(env.DB_TARGET) && env.DB_TARGET !== DOCKER_TARGET) fail("DB_TARGET no selecciona MySQL administrado por Docker.");
  const selected = expected(env);
  if (!standalone(env) && env.DB_NAME !== selected.database) fail("DB_NAME no coincide con la base fija del laboratorio.");
  if (!standalone(env) && env.DB_USER !== selected.apiUser) fail("DB_USER no coincide con la cuenta API fija del laboratorio.");
  if (!standalone(env) && env.DB_MIGRATION_USER !== selected.migrationUser) fail("DB_MIGRATION_USER no coincide con la cuenta migradora fija del laboratorio.");
  if (!selected.confirmation || selected.confirmation !== env.DB_NAME) {
    fail(`${standalone(env) ? "MYSQL_INIT_CONFIRM" : "MYSQL_LAB_INIT_CONFIRM"} debe coincidir exactamente con DB_NAME.`);
  }
  return resolveDatabaseConnection(env);
}

export function verifyEffectiveLabServer(row, identity, env = process.env) {
  const selected = expected(env);
  const database = String(row.databaseName ?? "");
  const hostname = String(row.hostname ?? "");
  const uuid = String(row.serverUuid ?? "");
  const version = String(row.version ?? "");
  const currentUser = String(row.currentUser ?? "");
  const identityHostname = identity.MYSQL_SERVER_HOSTNAME ?? identity.MYSQL_LAB_SERVER_HOSTNAME;
  const identityUuid = identity.MYSQL_SERVER_UUID ?? identity.MYSQL_LAB_SERVER_UUID;
  const identityPort = identity.MYSQL_SERVER_PORT ?? identity.MYSQL_LAB_SERVER_PORT;
  if (database !== env.DB_NAME) fail("DATABASE() no coincide con DB_NAME.");
  if (hostname !== selected.hostname || hostname !== identityHostname) fail("hostname efectivo desconocido.");
  if (uuid !== identityUuid) fail("server_uuid no pertenece al volumen registrado.");
  if (Number(row.serverPort) !== selected.port || Number(row.serverPort) !== Number(identityPort)) fail("puerto interno efectivo inesperado.");
  if (!version.startsWith("8.4.")) fail("la version efectiva no es MySQL 8.4.");
  if (Number(row.secureTransport) !== 1) fail("require_secure_transport no esta habilitado.");
  if (currentUser.split("@")[0] !== env.DB_USER) fail("CURRENT_USER() no coincide con la cuenta API.");
  return true;
}

export async function openVerifiedLabConnection(env = process.env, { connector = mariadb } = {}) {
  const selected = assertLabSelection(env);
  const identity = readLabInstanceIdentity(env.MYSQL_INSTANCE_FILE ?? env.MYSQL_LAB_INSTANCE_FILE);
  if (standalone(env) && (identity.MYSQL_COMPOSE_PROJECT !== env.COMPOSE_PROJECT_NAME ||
      identity.MYSQL_DATABASE !== env.DB_NAME)) {
    fail("la identidad registrada no coincide con el proyecto y la base seleccionados.");
  }
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

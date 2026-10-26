import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { config } from "dotenv";
import mariadb from "mariadb";
import { createStrictTlsOptions, resolveDatabaseConnection } from "../src/database/connectionConfig.js";
import { validateMysqlLabCatalog } from "../src/database/mysqlLabSeed.js";
import { buildMigrationDatabaseUrl, openVerifiedLabConnection } from "../src/database/mysqlLabSafety.js";
import getPrismaClient, { disconnectPrismaClient } from "../src/database/prisma.js";

config(process.env.DOTENV_PATH ? { path: process.env.DOTENV_PATH, override: true } : undefined);

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsRoot = path.join(serverRoot, "prisma/migrations");
const prismaCli = path.resolve(serverRoot, "../tooling/prisma/node_modules/prisma/build/index.js");

function fail(message) { throw new Error(`Verificacion MySQL lab fallida: ${message}`); }
function redact(value, secrets) {
  let result = String(value ?? "");
  for (const secret of secrets.filter(Boolean)) result = result.split(secret).join("<redacted>");
  return result;
}
function runPrisma(args, databaseUrl) {
  const child = spawnSync(process.execPath, [prismaCli, ...args, "--config", "prisma.config.ts"], {
    cwd: serverRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: "utf8",
  });
  const output = redact(`${child.stdout ?? ""}${child.stderr ?? ""}`, [databaseUrl, process.env.DB_PASSWORD, process.env.DB_MIGRATION_PASSWORD]);
  if (child.status !== 0) fail(`Prisma ${args.slice(0, 2).join(" ")} termino con codigo ${child.status}.\n${output}`);
  if (output.trim()) process.stdout.write(output);
}

const selected = resolveDatabaseConnection(process.env);
let expected;
const apiConnection = await openVerifiedLabConnection(process.env);
try {
  const migrationRows = await apiConnection.query(
    "SELECT migration_name AS name, checksum, finished_at AS finishedAt, rolled_back_at AS rolledBackAt FROM _prisma_migrations ORDER BY started_at",
  );
  expected = fs.readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(migrationsRoot, entry.name, "migration.sql")))
    .map((entry) => ({
      name: entry.name,
      checksum: createHash("sha256").update(fs.readFileSync(path.join(migrationsRoot, entry.name, "migration.sql"))).digest("hex"),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  if (expected.length === 0 || migrationRows.length !== expected.length) fail("el historial no coincide con las migraciones incluidas en esta imagen.");
  const actualByName = new Map(migrationRows.map((row) => [row.name, row]));
  for (const migration of expected) {
    const actual = actualByName.get(migration.name);
    if (!actual || actual.checksum !== migration.checksum || !actual.finishedAt || actual.rolledBackAt) {
      fail(`historial o checksum incompatible para ${migration.name}.`);
    }
  }
  const grants = (await apiConnection.query("SHOW GRANTS")).map((row) => Object.values(row)[0]).join("\n");
  const expectedPrivileges = process.env.MYSQL_EXPECT_API_READ_ONLY === "1"
    ? ["SELECT"] : ["SELECT", "INSERT", "UPDATE", "DELETE"];
  for (const privilege of expectedPrivileges) if (!grants.includes(privilege)) fail(`falta ${privilege} para la API.`);
  if (process.env.MYSQL_EXPECT_API_READ_ONLY === "1" && /\bINSERT\b|\bUPDATE\b|\bDELETE\b/.test(grants)) {
    fail("la cuenta API conserva escrituras durante mantenimiento.");
  }
  if (/ALL PRIVILEGES|\bCREATE\b|\bALTER\b|\bDROP\b/.test(grants)) fail("la API conserva privilegios estructurales.");
  const tls = (await apiConnection.query("SHOW SESSION STATUS LIKE 'Ssl_cipher'"))[0]?.Value;
  if (!tls) fail("la sesion API no usa TLS.");
} finally {
  await apiConnection.end();
}

const migrator = await mariadb.createConnection({
  host: selected.host,
  port: selected.port,
  user: process.env.DB_MIGRATION_USER,
  password: process.env.DB_MIGRATION_PASSWORD,
  database: selected.database,
  ssl: createStrictTlsOptions(selected.host, selected.ca),
});
try {
  const grants = (await migrator.query("SHOW GRANTS")).map((row) => Object.values(row)[0]).join("\n");
  if (!grants.includes("ALL PRIVILEGES ON `" + selected.database + "`.*")) fail("la cuenta migradora no controla el esquema esperado.");
  if (!(await migrator.query("SHOW SESSION STATUS LIKE 'Ssl_cipher'"))[0]?.Value) fail("la sesion migradora no usa TLS.");
} finally {
  await migrator.end();
}

const db = getPrismaClient();
try {
  const catalogs = await validateMysqlLabCatalog(db);
  if (!catalogs.valid) fail("los catalogos no coinciden con las definiciones versionadas.");
  if (process.env.DB_TARGET?.startsWith("mysql-lab")) {
    const businessCounts = await Promise.all([
      db.pedidos.count(), db.detalle_pedido.count(), db.cliente.count(), db.usuario.count(),
    ]);
    if (businessCounts.some((count) => count !== 0)) fail("hay datos de negocio ajenos al seed en el laboratorio.");
  }
} finally {
  await disconnectPrismaClient();
}

const databaseUrl = buildMigrationDatabaseUrl(process.env);
runPrisma(["migrate", "status"], databaseUrl);
runPrisma(["migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--exit-code"], databaseUrl);
console.log(`MYSQL_VERIFY: identidad, TLS, cuentas, ${expected.length} checksums, esquema y catalogos verificados.`);

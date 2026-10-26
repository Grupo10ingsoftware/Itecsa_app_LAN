import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { initializeMysqlLab } from "../src/database/mysqlLabInitializer.js";
import { assertLabSelection, assertSafeMigrationState, buildMigrationDatabaseUrl, verifyEffectiveLabServer } from "../src/database/mysqlLabSafety.js";

const temporary = mkdtempSync(path.join(tmpdir(), "itecsa-init-"));
const caPath = path.join(temporary, "ca.pem");
writeFileSync(caPath, "synthetic CA");
test.after(() => rmSync(temporary, { recursive: true, force: true }));

function env() {
  return {
    APP_ENV: "development", DB_TARGET: "mysql-lab-host", DB_HOST: "127.0.0.1", DB_PORT: "33307",
    DB_USER: "itecsa_app", DB_PASSWORD: "api @:/?# ñ", DB_NAME: "itecsa_lab",
    DB_SSL_MODE: "required", DB_SSL_CA_PATH: caPath,
    DB_MIGRATION_USER: "itecsa_migrator", DB_MIGRATION_PASSWORD: "migration @:/?# \\ 漢字\nsecret",
    MYSQL_LAB_INIT_CONFIRM: "itecsa_lab",
  };
}

test("DATABASE_URL codifica credenciales arbitrarias sin alterar el destino", () => {
  const source = env();
  const url = new URL(buildMigrationDatabaseUrl(source));
  assert.equal(decodeURIComponent(url.username), source.DB_MIGRATION_USER);
  assert.equal(decodeURIComponent(url.password), source.DB_MIGRATION_PASSWORD);
  assert.equal(url.hostname, source.DB_HOST);
  assert.equal(url.pathname, `/${source.DB_NAME}`);
  assert.equal(url.searchParams.get("sslaccept"), "strict");
});

test("la identidad efectiva rechaza Aiven y UUID distintos pese a la etiqueta lab", () => {
  const source = env();
  const identity = { MYSQL_LAB_SERVER_UUID: "12345678-1234-1234-1234-123456789abc", MYSQL_LAB_SERVER_HOSTNAME: "itecsa-mysql-lab", MYSQL_LAB_SERVER_PORT: "3306" };
  const row = { databaseName: "itecsa_lab", hostname: "itecsa-mysql-lab", serverUuid: identity.MYSQL_LAB_SERVER_UUID, serverPort: 3306, version: "8.4.13", versionComment: "MySQL Community", secureTransport: 1, currentUser: "itecsa_app@%" };
  assert.equal(verifyEffectiveLabServer(row, identity, source), true);
  assert.throws(() => verifyEffectiveLabServer({ ...row, serverUuid: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" }, identity, source), /server_uuid/);
  assert.throws(() => verifyEffectiveLabServer({ ...row, versionComment: "Aiven for MySQL" }, identity, source), /Aiven/);
});

test("la seleccion requiere confirmacion explicita y una URL heredada coincidente", () => {
  const source = env();
  delete source.MYSQL_LAB_INIT_CONFIRM;
  assert.throws(() => assertLabSelection(source), /MYSQL_LAB_INIT_CONFIRM/);
  source.MYSQL_LAB_INIT_CONFIRM = source.DB_NAME;
  assert.throws(() => assertLabSelection({ ...source, DB_NAME: "other", MYSQL_LAB_INIT_CONFIRM: "other" }), /base fija/);
  source.DATABASE_URL = "mysql://someone:secret@mysql.aivencloud.com:3306/itecsa_lab";
  assert.throws(() => buildMigrationDatabaseUrl(source), /destinos distintos/);
});

test("el preflight rechaza tablas de aplicacion sin historial Prisma coherente", async () => {
  const connection = {
    async query(sql) {
      if (sql.includes("information_schema.TABLES")) return [{ tableName: "Pedidos" }];
      return [];
    },
  };
  await assert.rejects(assertSafeMigrationState(connection, "itecsa_lab"), /sin historial Prisma/);
});

test("el inicializador ejecuta migracion, seed y validacion en orden", async () => {
  const steps = [];
  const connection = {
    async query(sql) { assert.match(sql, /information_schema\.TABLES/); return []; },
    async end() { steps.push("connection closed"); },
  };
  const runner = (_command, args, options) => {
    steps.push(args.includes("migrate") ? "migrate" : args.includes("seed") ? "seed" : "catalogs");
    assert.ok(options.env.DATABASE_URL);
  };
  await initializeMysqlLab(env(), { openConnection: async () => connection, runner });
  assert.deepEqual(steps, ["connection closed", "migrate", "seed", "catalogs"]);
});

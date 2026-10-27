import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { openVerifiedLabConnection } from "../src/database/mysqlLabSafety.js";
import { setMysqlApiWrites } from "../src/database/mysqlMaintenance.js";

const temporary = mkdtempSync(path.join(tmpdir(), "itecsa-deployment-"));
const caPath = path.join(temporary, "ca.pem");
const identityPath = path.join(temporary, "instance.env");
writeFileSync(caPath, "synthetic CA");
writeFileSync(identityPath, [
  "MYSQL_SERVER_UUID=12345678-1234-1234-1234-123456789abc",
  "MYSQL_SERVER_HOSTNAME=itecsa-mysql",
  "MYSQL_SERVER_PORT=3306",
  "MYSQL_COMPOSE_PROJECT=itecsa-test",
  "MYSQL_DATABASE=custom_db",
  "",
].join("\n"));
test.after(() => rmSync(temporary, { recursive: true, force: true }));

function env(overrides = {}) {
  return {
    APP_ENV: "production", DB_TARGET: "mysql-docker", DB_HOST: "mysql", DB_PORT: "3306",
    DB_USER: "custom_api", DB_PASSWORD: "api secret", DB_NAME: "custom_db",
    DB_SSL_MODE: "required", DB_SSL_CA_PATH: caPath,
    DB_MIGRATION_USER: "custom_migrator", DB_MIGRATION_PASSWORD: "migration secret",
    MYSQL_INIT_CONFIRM: "custom_db", MYSQL_INSTANCE_FILE: identityPath,
    MYSQL_EXPECTED_HOSTNAME: "itecsa-mysql", COMPOSE_PROJECT_NAME: "itecsa-test", ...overrides,
  };
}

test("mysql-docker admite nombres configurados y verifica proyecto, UUID y TLS efectivos", async () => {
  let options;
  const connection = {
    async query() { return [{ databaseName: "custom_db", hostname: "itecsa-mysql",
      serverUuid: "12345678-1234-1234-1234-123456789abc", serverPort: 3306,
      version: "8.4.13", versionComment: "MySQL Community Server", secureTransport: 1,
      currentUser: "custom_api@%" }]; },
    async end() {},
  };
  const connector = { async createConnection(received) { options = received; return connection; } };
  assert.equal(await openVerifiedLabConnection(env(), { connector }), connection);
  assert.equal(options.host, "mysql");
  assert.equal(options.user, "custom_api");
  await assert.rejects(openVerifiedLabConnection(env({ COMPOSE_PROJECT_NAME: "otro" }), { connector }), /proyecto y la base/);
});

test("mantenimiento bloquea escrituras y cierra sesiones API mediante el socket", async () => {
  const calls = [];
  const connection = {
    escapeId(value) { assert.equal(value, "custom_db"); return "`custom_db`"; },
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql.startsWith("SELECT DATABASE")) return [{ databaseName: "custom_db", hostname: "itecsa-mysql",
        serverUuid: "12345678-1234-1234-1234-123456789abc", version: "8.4.13",
        versionComment: "MySQL Community Server", secureTransport: 1 }];
      if (sql.includes("PROCESSLIST")) return [{ id: 41 }, { id: 42 }];
      return [];
    },
    async end() {},
  };
  let options;
  const connector = { async createConnection(received) { options = received; return connection; } };
  await setMysqlApiWrites({ ...env(), MYSQL_MAINTENANCE_ACTION: "lock",
    MYSQL_ROOT_PASSWORD: "root secret", MYSQL_DATABASE: "custom_db", MYSQL_USER: "custom_api",
    MYSQL_MIGRATION_USER: "custom_migrator" }, { connector });
  assert.equal(options.socketPath, "/var/run/mysqld/mysqld.sock");
  assert.ok(calls.some(({ sql }) => sql === "REVOKE INSERT, UPDATE, DELETE ON `custom_db`.* FROM 'custom_api'@'%'"));
  assert.ok(calls.some(({ sql }) => sql === "KILL CONNECTION 41"));
  assert.ok(calls.some(({ sql }) => sql === "KILL CONNECTION 42"));
  assert.deepEqual(calls.find(({ sql }) => sql.includes("PROCESSLIST")).values, ["custom_api", "custom_migrator"]);
  assert.ok(calls.some(({ sql }) => sql ===
    "REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'custom_migrator'@'%'"));
});

test("mantenimiento solo rehabilita los privilegios de datos aprobados", async () => {
  const calls = [];
  const connection = {
    escapeId() { return "`custom_db`"; },
    async query(sql) {
      calls.push(sql);
      if (sql.startsWith("SELECT DATABASE")) return [{ databaseName: "custom_db", hostname: "itecsa-mysql",
        serverUuid: "12345678-1234-1234-1234-123456789abc", version: "8.4.13",
        versionComment: "MySQL Community Server", secureTransport: 1 }];
      return [];
    },
    async end() {},
  };
  await setMysqlApiWrites({ ...env(), MYSQL_MAINTENANCE_ACTION: "unlock",
    MYSQL_ROOT_PASSWORD: "root secret", MYSQL_DATABASE: "custom_db", MYSQL_USER: "custom_api",
    MYSQL_MIGRATION_USER: "custom_migrator" },
    { connector: { async createConnection() { return connection; } } });
  assert.ok(calls.includes("GRANT SELECT, INSERT, UPDATE, DELETE ON `custom_db`.* TO 'custom_api'@'%'"));
  assert.equal(calls.some((sql) => /ALL PRIVILEGES|CREATE|ALTER|DROP/.test(sql)), false);
});

test("update valida versiones, bloquea escritores y respalda antes de migrar", () => {
  const script = readFileSync(new URL("../../deploy/mysql/manage.sh", import.meta.url), "utf8");
  const body = script.slice(script.indexOf("update_database()"), script.indexOf("case \"$ACTION\""));
  const ordered = [
    "preflight", "compose stop api", "lock_writes", "backup_database", "enable_migrations",
    "deploy_database", "verify_database_read_only", "unlock_writes", "verify_database", "compose up -d api web",
  ];
  let position = -1;
  for (const step of ordered) {
    const next = body.indexOf(step, position + 1);
    assert.ok(next > position, `orden invalido para ${step}`);
    position = next;
  }
  assert.match(script, /api_revision.*tools_revision/s);
  assert.match(script, /API y database-tools pertenecen a versiones distintas/);
  assert.match(body, /trap 'if \(\( maintenance_active \)\); then lock_writes[^']+' ERR/);
  assert.ok(body.indexOf("maintenance_active=0", body.indexOf("deploy_database")) < body.indexOf("compose up -d api web"));
});


test("restore autoriza el UUID destino sin confundirlo con la identidad fuente", () => {
  const script = readFileSync(new URL("../scripts/mysqlRestore.mjs", import.meta.url), "utf8");
  assert.match(script, /manifest\.source\?\.serverUuid/);
  assert.match(script, /COMPOSE_PROJECT_NAME.*DB_NAME.*identity\.MYSQL_SERVER_UUID/s);
  assert.match(script, /tables\.length !== 0/);
  assert.doesNotMatch(script, /identity\.MYSQL_SERVER_UUID\s*!==\s*manifest\.source/);
});

test("el Compose autonomo no incluye Aiven ni publica MySQL", () => {
  const compose = readFileSync(new URL("../../compose.mysql.yaml", import.meta.url), "utf8");
  assert.doesNotMatch(compose, /aiven/i);
  const mysqlBlock = compose.slice(compose.indexOf("  mysql:"), compose.indexOf("  api:"));
  assert.doesNotMatch(mysqlBlock, /\n    ports:/);
  assert.match(mysqlBlock, /mysql_tls:\/run\/mysql-tls:ro/);
  assert.doesNotMatch(mysqlBlock, /MYSQL_CERTS_DIR/);
  assert.match(compose, /install -o 999 -g 999 -m 0600 \/input\/server-key\.pem/);
  assert.ok(compose.includes("mysql_private:\n    internal: true"));
});

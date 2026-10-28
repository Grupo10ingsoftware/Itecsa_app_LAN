import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import fs from "node:fs";
import { bootstrapMysqlLabAccounts } from "../src/database/mysqlLabAccounts.js";

const temporary = mkdtempSync(path.join(tmpdir(), "itecsa-accounts-"));
test.after(() => rmSync(temporary, { recursive: true, force: true }));

function environment() {
  return {
    MYSQL_ROOT_PASSWORD: "root ' \\ 🔐\nsecret",
    MYSQL_DATABASE: "itecsa_lab",
    MYSQL_USER: "itecsa_app",
    MYSQL_PASSWORD: "api ' \\ ñ\nsecret",
    MYSQL_MIGRATION_USER: "itecsa_migrator",
    MYSQL_MIGRATION_PASSWORD: "migration ' \\ 漢字\nsecret",
    MYSQL_LAB_EXPECTED_HOSTNAME: "itecsa-mysql-lab",
  };
}

test("el bootstrap usa solo socket y envia contrasenas como valores parametrizados", async t => {
  const calls = [];
  let options;
  const connection = {
    escapeId(value) { assert.equal(value, "itecsa_lab"); return "`itecsa_lab`"; },
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql.startsWith("SELECT DATABASE")) return [{
        databaseName: "itecsa_lab", hostname: "itecsa-mysql-lab",
        serverUuid: "12345678-1234-1234-1234-123456789abc", serverPort: 3306,
        version: "8.4.13", versionComment: "MySQL Community Server", secureTransport: 1,
      }];
      return [];
    },
    async end() {},
  };
  const connector = { async createConnection(received) { options = received; return connection; } };
  const identityPath = path.join(temporary, "instance.env");
  const originalWrite = fs.writeFileSync, originalChmod = fs.chmodSync;
  const modes = [];
  t.mock.method(fs, 'writeFileSync', (file, contents, options) => {
    if (file === identityPath) modes.push(['create', options.mode]);
    return originalWrite(file, contents, options);
  });
  t.mock.method(fs, 'chmodSync', (file, mode) => {
    if (file === identityPath) modes.push(['chmod', mode]);
    return originalChmod(file, mode);
  });
  const env = environment();
  await bootstrapMysqlLabAccounts(env, { connector, identityPath });

  assert.equal(options.socketPath, "/var/run/mysqld/mysqld.sock");
  assert.equal("host" in options, false);
  assert.equal("port" in options, false);
  const passwordCalls = calls.filter(({ sql }) => /IDENTIFIED BY \?/.test(sql));
  assert.deepEqual(passwordCalls.flatMap(({ values }) => values), [env.MYSQL_PASSWORD, env.MYSQL_PASSWORD, env.MYSQL_MIGRATION_PASSWORD, env.MYSQL_MIGRATION_PASSWORD]);
  for (const { sql } of passwordCalls) {
    assert.doesNotMatch(sql, /api ' |migration ' /);
  }
  assert.ok(calls.some(({ sql }) => sql === "GRANT SELECT, INSERT, UPDATE, DELETE ON `itecsa_lab`.* TO 'itecsa_app'@'%'"));
  assert.ok(calls.some(({ sql }) => sql === "GRANT ALL PRIVILEGES ON `itecsa_lab`.* TO 'itecsa_migrator'@'%'"));
  assert.match(readFileSync(identityPath, "utf8"), /MYSQL_LAB_SERVER_UUID=12345678/);
  assert.deepEqual(modes, [['create', 0o600], ['chmod', 0o600]]);
  // Windows chmod supports only the writable bit, not POSIX owner/group masks.
  // Linux CI still verifies the actual effective 0600 mode, as before.
  if (process.platform === 'win32') assert.equal(statSync(identityPath).mode & 0o200, 0o200);
  else assert.equal(statSync(identityPath).mode & 0o777, 0o600);
});

test("el bootstrap rechaza un socket de otro hostname antes de administrar cuentas", async () => {
  const connection = {
    escapeId() { return "`itecsa_lab`"; },
    async query() { return [{ databaseName: "itecsa_lab", hostname: "other", serverUuid: "x", serverPort: 3306, version: "8.4.13", versionComment: "MySQL", secureTransport: 1 }]; },
    async end() {},
  };
  await assert.rejects(
    bootstrapMysqlLabAccounts(environment(), { connector: { async createConnection() { return connection; } }, identityPath: path.join(temporary, "rejected.env") }),
    /socket no pertenece/,
  );
});

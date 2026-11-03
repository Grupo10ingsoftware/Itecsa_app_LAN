import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import {
  createManagerPool,
  readManagerConfiguration,
  readManagerLookbackDays,
} from "../src/database/managerConnection.js";

const environment = (extra = {}) => ({
  MANAGER_DB_HOST: "127.0.0.1",
  MANAGER_DB_PORT: "1433",
  MANAGER_DB_NAME: "MiniManagerItecsaCSV",
  MANAGER_DB_USER: "manager_reader",
  MANAGER_DB_PASSWORD: "not-a-real-password",
  ...extra,
});

test("Manager configuration applies bounded pool, timeout and TLS defaults", () => {
  const config = readManagerConfiguration(environment());
  assert.equal(config.server, "127.0.0.1");
  assert.equal(config.port, 1433);
  assert.equal(config.database, "MiniManagerItecsaCSV");
  assert.equal(config.connectionTimeout, 8000);
  assert.equal(config.requestTimeout, 15000);
  assert.deepEqual(config.pool, { min: 0, max: 5, idleTimeoutMillis: 30000 });
  assert.equal(config.options.encrypt, true);
  assert.equal(config.options.trustServerCertificate, false);
  assert.equal(readManagerLookbackDays(environment()), 5);
});

test("Manager configuration rejects missing and unsafe values without exposing credentials", () => {
  for (const overrides of [
    { MANAGER_DB_HOST: "" },
    { MANAGER_DB_PORT: "0" },
    { MANAGER_DB_POOL_MAX: "21" },
    { MANAGER_DB_ENCRYPT: "yes" },
    { MANAGER_SALES_NOTE_LOOKBACK_DAYS: "31" },
  ]) {
    assert.throws(
      () => overrides.MANAGER_SALES_NOTE_LOOKBACK_DAYS === undefined
        ? readManagerConfiguration(environment(overrides))
        : readManagerLookbackDays(environment(overrides)),
      (error) => !error.message.includes("not-a-real-password"),
    );
  }
});

test("Manager pool keeps the supplied configuration and sanitizes asynchronous pool errors", () => {
  const events = [];
  class Pool extends EventEmitter {
    constructor(config) {
      super();
      this.config = config;
    }
  }
  const config = readManagerConfiguration(environment());
  const pool = createManagerPool(config, {
    driver: { ConnectionPool: Pool },
    logger: { error: (...args) => events.push(args) },
  });
  assert.equal(pool.config, config);
  pool.emit("error", Object.assign(new Error("private driver details"), { code: "ESOCKET" }));
  assert.deepEqual(events, [["manager_db.pool_error", { code: "ESOCKET", outcome: "error" }]]);
  assert.ok(!JSON.stringify(events).includes("private driver details"));
});

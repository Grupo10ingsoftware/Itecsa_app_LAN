import sql from "mssql";
import { safeLogger } from "../shared/safeLogger.js";

const REQUIRED_KEYS = [
  "MANAGER_DB_HOST",
  "MANAGER_DB_NAME",
  "MANAGER_DB_USER",
  "MANAGER_DB_PASSWORD",
];

let managerPoolPromise;

function invalid(message) {
  throw new Error(`Configuracion de Manager invalida: ${message}`);
}

function integerOption(env, key, fallback, min, max) {
  const raw = env[key];
  const value = raw === undefined ? fallback : Number(raw);
  if ((typeof raw === "string" && !raw.trim()) || !Number.isInteger(value) || value < min || value > max) {
    invalid(`${key} debe ser un entero entre ${min} y ${max}.`);
  }
  return value;
}

function booleanOption(env, key, fallback) {
  const raw = env[key];
  if (raw === undefined) return fallback;
  if (raw === "true") return true;
  if (raw === "false") return false;
  invalid(`${key} solo admite true o false.`);
}

export function readManagerConfiguration(env = process.env) {
  const missing = REQUIRED_KEYS.filter((key) => !env[key]?.trim());
  if (missing.length > 0) invalid(`faltan ${missing.join(", ")}.`);

  return {
    server: env.MANAGER_DB_HOST.trim(),
    port: integerOption(env, "MANAGER_DB_PORT", 1433, 1, 65535),
    database: env.MANAGER_DB_NAME.trim(),
    user: env.MANAGER_DB_USER.trim(),
    password: env.MANAGER_DB_PASSWORD,
    connectionTimeout: integerOption(env, "MANAGER_DB_CONNECT_TIMEOUT_MS", 8000, 1000, 60000),
    requestTimeout: integerOption(env, "MANAGER_DB_REQUEST_TIMEOUT_MS", 15000, 1000, 120000),
    pool: {
      min: 0,
      max: integerOption(env, "MANAGER_DB_POOL_MAX", 5, 1, 20),
      idleTimeoutMillis: integerOption(env, "MANAGER_DB_POOL_IDLE_TIMEOUT_MS", 30000, 1000, 300000),
    },
    options: {
      encrypt: booleanOption(env, "MANAGER_DB_ENCRYPT", true),
      trustServerCertificate: booleanOption(env, "MANAGER_DB_TRUST_SERVER_CERTIFICATE", false),
      enableArithAbort: true,
    },
  };
}

export function readManagerLookbackDays(env = process.env) {
  return integerOption(env, "MANAGER_SALES_NOTE_LOOKBACK_DAYS", 5, 0, 30);
}

export function createManagerPool(config, { driver = sql, logger = safeLogger } = {}) {
  const pool = new driver.ConnectionPool(config);
  pool.on("error", (error) => {
    logger.error("manager_db.pool_error", {
      code: error?.code ?? "MANAGER_DB_POOL_ERROR",
      outcome: "error",
    });
  });
  return pool;
}

export function getManagerPool({ env = process.env, logger = safeLogger } = {}) {
  if (!managerPoolPromise) {
    const pool = createManagerPool(readManagerConfiguration(env), { logger });
    const connecting = pool.connect()
      .then(() => pool)
      .catch((error) => {
        if (managerPoolPromise === connecting) managerPoolPromise = undefined;
        throw error;
      });
    managerPoolPromise = connecting;
  }
  return managerPoolPromise;
}

export async function disconnectManagerPool() {
  const pending = managerPoolPromise;
  managerPoolPromise = undefined;
  if (!pending) return;
  const pool = await pending;
  await pool.close();
}

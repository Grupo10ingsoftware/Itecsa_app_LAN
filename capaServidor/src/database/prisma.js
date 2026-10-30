import { createRequire } from "node:module";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { createStrictTlsOptions, resolveDatabaseConnection } from "./connectionConfig.js";

let prisma;
const require = createRequire(import.meta.url);

function boundedOption(env, key, fallback, min, max) {
    const value = env[key] === undefined ? fallback : Number(env[key]);
    if ((typeof env[key] === "string" && !env[key].trim()) || !Number.isInteger(value) || value < min || value > max) {
        throw new Error(`${key} debe ser un entero entre ${min} y ${max}.`);
    }
    return value;
}

export function readPrismaConfiguration(env = process.env) {
    const { host, port, user, password, database, sslMode, ca } = resolveDatabaseConnection(env);
    const connectTimeout = Number(env.DB_CONNECT_TIMEOUT_MS ?? 8000);
    const socketTimeout = Number(env.DB_QUERY_TIMEOUT_MS ?? 15000);

    if (!Number.isInteger(connectTimeout) || connectTimeout < 1000 || !Number.isInteger(socketTimeout) || socketTimeout < 1000) {
        throw new Error("Los timeouts de base de datos deben ser enteros de al menos 1000 ms.");
    }

    return {
        host,
        port,
        user,
        password,
        database,
        connectTimeout,
        socketTimeout,
        ...(sslMode === "required" ? { ssl: createStrictTlsOptions(host, ca) } : {}),
        connectionLimit: 10,
        // Explicitly override the adapter's default of zero. Bounded per-session
        // LRU; the adapter still owns the single pool and the binary protocol.
        prepareCacheLength: boundedOption(env, "DB_PREPARE_CACHE_LENGTH", 32, 0, 256),
        // Reuse recently healthy sessions; validate after idle. Known-invalid
        // sockets still fail the driver's isValid check on every acquisition.
        minDelayValidation: boundedOption(env, "DB_POOL_VALIDATION_DELAY_MS", 5000, 0, 30000),
        pingTimeout: boundedOption(env, "DB_POOL_PING_TIMEOUT_MS", 1000, 100, connectTimeout),
    };
}

export function getPrismaClient() {
    if (!prisma) {
        const adapter = new PrismaMariaDb(readPrismaConfiguration());
        const { PrismaClient } = require("@prisma/client");
        prisma = new PrismaClient({ adapter });
    }

    return prisma;
}

export async function checkDatabaseConnection() {
    const rows = await getPrismaClient().$queryRaw`SELECT 1 AS ok`;

    return rows?.[0]?.ok === 1 || rows?.[0]?.ok === 1n;
}

export async function disconnectPrismaClient() {
    if (!prisma) return;

    await prisma.$disconnect();
    prisma = undefined;
}

export default getPrismaClient;

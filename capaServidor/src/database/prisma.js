import { createRequire } from "node:module";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { resolveDatabaseConnection } from "./connectionConfig.js";

let prisma;
const require = createRequire(import.meta.url);

function readPrismaConfiguration() {
    const { host, port, user, password, database, sslMode, ca } = resolveDatabaseConnection();
    const connectTimeout = Number(process.env.DB_CONNECT_TIMEOUT_MS ?? 8000);
    const socketTimeout = Number(process.env.DB_QUERY_TIMEOUT_MS ?? 15000);

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
        ...(sslMode === "required" ? { ssl: { ca } } : {}),
        connectionLimit: 10,
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

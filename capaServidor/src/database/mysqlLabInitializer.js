import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { assertSafeMigrationState, buildMigrationDatabaseUrl, openVerifiedLabConnection } from "./mysqlLabSafety.js";

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const prismaCli = path.resolve(serverRoot, "../tooling/prisma/node_modules/prisma/build/index.js");

function sanitized(value, secrets) {
  let result = String(value ?? "");
  for (const secret of secrets.filter(Boolean)) result = result.split(secret).join("<redacted>");
  return result;
}

export function runChild(command, args, { env, secrets = [] } = {}) {
  const result = spawnSync(command, args, { cwd: serverRoot, env, encoding: "utf8" });
  const output = sanitized(`${result.stdout ?? ""}${result.stderr ?? ""}`, secrets);
  if (result.status !== 0) throw new Error(`Fallo el paso de inicializacion (${args.slice(0, 2).join(" ")}).\n${output}`);
  if (output.trim()) process.stdout.write(output);
}

export async function preflightMysqlLab(env = process.env, {
  openConnection = openVerifiedLabConnection,
  requireExisting = false,
} = {}) {
  const connection = await openConnection(env);
  try {
    // A consistent snapshot for catalog reads; never run DML/DDL or seed here.
    await connection.query("START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY");
    return await assertSafeMigrationState(connection, env.DB_NAME, { requireExisting });
  } finally {
    try { await connection.query("ROLLBACK"); }
    finally { await connection.end(); }
  }
}

export async function initializeMysqlLab(env = process.env, {
  openConnection = openVerifiedLabConnection,
  runner = runChild,
} = {}) {
  // Recheck after maintenance starts: the earlier update check is not a lock.
  await preflightMysqlLab(env, { openConnection });

  const databaseUrl = buildMigrationDatabaseUrl(env);
  const childEnv = {
    ...env,
    ...(env.DB_TARGET === "mysql-docker" ? {
      DB_USER: env.DB_MIGRATION_USER,
      DB_PASSWORD: env.DB_MIGRATION_PASSWORD,
    } : {}),
    DATABASE_URL: databaseUrl,
  };
  const options = { env: childEnv, secrets: [env.DB_PASSWORD, env.DB_MIGRATION_PASSWORD, databaseUrl] };
  runner(process.execPath, [prismaCli, "migrate", "deploy", "--config", "prisma.config.ts"], options);
  runner(process.execPath, [prismaCli, "db", "seed", "--config", "prisma.config.ts"], options);
  runner(process.execPath, [path.resolve(serverRoot, "scripts/mysqlLabCatalogCheck.mjs")], options);
  return { steps: ["migrate deploy", "db seed", "catalog check"] };
}

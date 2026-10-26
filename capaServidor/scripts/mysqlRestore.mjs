import { createHash } from "node:crypto";
import fs from "node:fs";
import { createReadStream } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { openVerifiedLabConnection, readLabInstanceIdentity } from "../src/database/mysqlLabSafety.js";

async function sha256File(file) {
  const hash = createHash("sha256");
  const stream = createReadStream(file);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest("hex");
}

const backupDir = path.resolve(process.env.MYSQL_BACKUP_DIR ?? "/backups");
const requested = process.env.MYSQL_RESTORE_FILE;
if (!requested || requested !== path.basename(requested) || !requested.endsWith(".sql")) {
  throw new Error("MYSQL_RESTORE_FILE debe ser el nombre de un .sql dentro del directorio de respaldos.");
}
const sqlPath = path.join(backupDir, requested);
const manifestPath = path.join(backupDir, requested.replace(/\.sql$/, ".manifest.json"));
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
if (manifest.format !== 1 || manifest.sqlFile !== requested ||
    !/^[0-9a-f-]{36}$/i.test(manifest.source?.serverUuid ?? "")) {
  throw new Error("El manifiesto del respaldo no es valido.");
}
const checksum = await sha256File(sqlPath);
if (checksum !== manifest.sha256) throw new Error("El checksum del respaldo no coincide.");

const identity = readLabInstanceIdentity(process.env.MYSQL_INSTANCE_FILE);
const expectedConfirmation = `${process.env.COMPOSE_PROJECT_NAME}:${process.env.DB_NAME}:${identity.MYSQL_SERVER_UUID}`;
if (process.env.MYSQL_RESTORE_CONFIRM !== expectedConfirmation) {
  throw new Error("La confirmacion no coincide con el proyecto, base y UUID del destino.");
}

const connection = await openVerifiedLabConnection(process.env);
try {
  const tables = await connection.query(
    "SELECT TABLE_NAME AS tableName FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?",
    [process.env.DB_NAME],
  );
  if (tables.length !== 0) throw new Error("La restauracion solo se admite sobre una base nueva sin tablas.");
} finally {
  await connection.end();
}

const client = ["mariadb", "mysql"].find((candidate) =>
  ["/usr/bin", "/usr/local/bin"].some((dir) => fs.existsSync(path.join(dir, candidate))));
if (!client) throw new Error("No se encontro mariadb o mysql.");
const input = fs.openSync(sqlPath, "r");
let stderr = "";
const child = spawn(client, [
  "--host", process.env.DB_HOST,
  "--port", process.env.DB_PORT,
  "--user", process.env.DB_MIGRATION_USER,
  `--ssl-ca=${process.env.DB_SSL_CA_PATH}`,
  "--ssl-verify-server-cert",
  process.env.DB_NAME,
], {
  env: { ...process.env, MYSQL_PWD: process.env.DB_MIGRATION_PASSWORD },
  stdio: [input, "inherit", "pipe"],
});
child.stderr.on("data", (chunk) => { if (stderr.length < 8192) stderr += chunk; });
const exitCode = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("close", resolve);
});
fs.closeSync(input);
if (exitCode !== 0) throw new Error(`La restauracion fallo con codigo ${exitCode}: ${stderr.trim()}`);
console.log(`MYSQL_RESTORE: respaldo de ${manifest.source.project} (${manifest.source.serverUuid}) restaurado en ${identity.MYSQL_SERVER_UUID}.`);

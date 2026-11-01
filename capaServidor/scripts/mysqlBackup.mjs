import { createHash } from "node:crypto";
import fs from "node:fs";
import { createReadStream } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import mariadb from "mariadb";
import { readLabInstanceIdentity } from "../src/database/mysqlLabSafety.js";

async function sha256File(file) {
  const hash = createHash("sha256");
  const stream = createReadStream(file);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest("hex");
}

const backupDir = path.resolve(process.env.MYSQL_BACKUP_DIR ?? "/backups");
fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
const identity = readLabInstanceIdentity(process.env.MYSQL_INSTANCE_FILE);
const connection = await mariadb.createConnection({
  socketPath: "/var/run/mysqld/mysqld.sock",
  user: "root",
  password: process.env.MYSQL_ROOT_PASSWORD,
  database: process.env.MYSQL_DATABASE,
});
let migrations;
try {
  const [server] = await connection.query(`SELECT DATABASE() AS databaseName, @@hostname AS hostname,
    @@server_uuid AS serverUuid, @@version AS version, @@version_comment AS versionComment,
    @@require_secure_transport AS secureTransport`);
  if (server.databaseName !== process.env.MYSQL_DATABASE ||
      server.hostname !== "itecsa-mysql" ||
      server.hostname !== identity.MYSQL_SERVER_HOSTNAME ||
      server.serverUuid !== identity.MYSQL_SERVER_UUID ||
      !String(server.version).startsWith("8.4.") || Number(server.secureTransport) !== 1) {
    throw new Error("La identidad efectiva no corresponde al despliegue autonomo.");
  }
  migrations = await connection.query(
    "SELECT migration_name AS name, checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name",
  );
} finally {
  await connection.end();
}
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const base = `${process.env.COMPOSE_PROJECT_NAME}-${process.env.MYSQL_DATABASE}-${stamp}`;
const sqlPath = path.join(backupDir, `${base}.sql`);
const manifestPath = path.join(backupDir, `${base}.manifest.json`);
const dump = ["mariadb-dump", "mysqldump"].find((candidate) =>
  ["/usr/bin", "/usr/local/bin"].some((dir) => fs.existsSync(path.join(dir, candidate))));
if (!dump) throw new Error("No se encontro mariadb-dump o mysqldump.");
const output = fs.openSync(sqlPath, "wx", 0o600);
let stderr = "";
const child = spawn(dump, [
  "--socket", "/var/run/mysqld/mysqld.sock", "--user", "root",
  "--single-transaction", "--quick", "--skip-lock-tables", "--no-tablespaces",
  "--routines", "--triggers", "--events", "--hex-blob",
  "--default-character-set=utf8mb4", process.env.MYSQL_DATABASE,
], {
  env: { ...process.env, MYSQL_PWD: process.env.MYSQL_ROOT_PASSWORD },
  stdio: ["ignore", output, "pipe"],
});
child.stderr.on("data", (chunk) => { if (stderr.length < 8192) stderr += chunk; });
const exitCode = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("close", resolve);
});
fs.closeSync(output);
if (exitCode !== 0) {
  fs.rmSync(sqlPath, { force: true });
  throw new Error(`El respaldo fallo con codigo ${exitCode}: ${stderr.trim()}`);
}
const checksum = await sha256File(sqlPath);
const manifest = {
  format: 1,
  source: { project: process.env.COMPOSE_PROJECT_NAME, database: process.env.MYSQL_DATABASE,
    serverUuid: identity.MYSQL_SERVER_UUID },
  appVersion: process.env.APP_VERSION,
  createdAt: new Date().toISOString(),
  sqlFile: path.basename(sqlPath),
  sha256: checksum,
  migrations: migrations.map(({ name, checksum: migrationChecksum }) => ({ name, checksum: migrationChecksum })),
};
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", { mode: 0o600, flag: "wx" });
console.log(`MYSQL_BACKUP: ${path.basename(sqlPath)}`);

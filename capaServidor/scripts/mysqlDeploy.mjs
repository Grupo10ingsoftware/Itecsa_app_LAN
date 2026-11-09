import fs from "node:fs";
import { initializeMysqlLab, preflightMysqlLab } from "../src/database/mysqlLabInitializer.js";

const args = process.argv.slice(2);
if (args.length && (args.length !== 1 || args[0] !== "--check")) {
  throw new Error("Uso: mysqlDeploy.mjs [--check]; argumento desconocido, no se ejecutaron migraciones.");
}

const bakedVersionPath = new URL("../.database-tools-version", import.meta.url);
if (process.env.DB_TARGET === "mysql-docker" && fs.existsSync(bakedVersionPath)) {
  const baked = fs.readFileSync(bakedVersionPath, "utf8").trim();
  if (!baked || baked !== process.env.APP_VERSION) {
    throw new Error("La imagen database-tools no corresponde a APP_VERSION.");
  }
}

if (args[0] === "--check") {
  console.log(`MYSQL_UPDATE_CHECK: version destino ${process.env.APP_VERSION ?? 'no declarada'}.`);
  const result = await preflightMysqlLab(process.env, { requireExisting: true });
  console.log(`MYSQL_UPDATE_CHECK: contrato de catalogo v${result.catalogVersion} compatible; `
    + `${result.appliedMigrations} migraciones aplicadas; ultima: ${result.lastMigration}. `
    + 'Comprobacion de solo lectura; las migraciones pendientes se aplicaran durante update.');
} else {
  const result = await initializeMysqlLab(process.env);
  console.log(`MYSQL_DEPLOY: ${result.steps.join(" -> ")}.`);
}

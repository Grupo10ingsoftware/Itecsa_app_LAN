import fs from "node:fs";
import { initializeMysqlLab } from "../src/database/mysqlLabInitializer.js";

const bakedVersionPath = new URL("../.database-tools-version", import.meta.url);
if (process.env.DB_TARGET === "mysql-docker" && fs.existsSync(bakedVersionPath)) {
  const baked = fs.readFileSync(bakedVersionPath, "utf8").trim();
  if (!baked || baked !== process.env.APP_VERSION) {
    throw new Error("La imagen database-tools no corresponde a APP_VERSION.");
  }
}

const result = await initializeMysqlLab(process.env);
console.log(`MYSQL_DEPLOY: ${result.steps.join(" -> ")}.`);

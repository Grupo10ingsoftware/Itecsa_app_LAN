import { config } from "dotenv";

config(process.env.DOTENV_PATH
  ? { path: process.env.DOTENV_PATH, override: true }
  : undefined);

const { initializeMysqlLab } = await import("../src/database/mysqlLabInitializer.js");
const result = await initializeMysqlLab();
console.log(`MYSQL_LAB_INITIALIZATION: ${result.steps.join(" -> ")}.`);

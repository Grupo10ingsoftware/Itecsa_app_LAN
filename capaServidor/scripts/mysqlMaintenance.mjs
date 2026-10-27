import { setMysqlApiWrites } from "../src/database/mysqlMaintenance.js";

const result = await setMysqlApiWrites(process.env);
const messages = {
  lock: "API y migradora bloqueadas",
  migrate: "migradora habilitada; API bloqueada",
  unlock: "API habilitada",
};
console.log(`MYSQL_MAINTENANCE: ${messages[result.action]}.`);

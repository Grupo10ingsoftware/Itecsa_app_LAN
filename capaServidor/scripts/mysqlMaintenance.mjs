import { setMysqlApiWrites } from "../src/database/mysqlMaintenance.js";

const result = await setMysqlApiWrites(process.env);
console.log(`MYSQL_MAINTENANCE: escrituras API ${result.action === "lock" ? "bloqueadas" : "habilitadas"}.`);

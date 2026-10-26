import { bootstrapMysqlLabAccounts } from "../src/database/mysqlLabAccounts.js";

const result = await bootstrapMysqlLabAccounts();
console.log(`MYSQL_LAB_ACCOUNTS: cuentas preparadas; identidad guardada en ${result.identityPath}.`);

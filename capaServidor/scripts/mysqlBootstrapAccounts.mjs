import { bootstrapMysqlLabAccounts } from "../src/database/mysqlLabAccounts.js";

const result = await bootstrapMysqlLabAccounts(process.env);
console.log(`MYSQL_ACCOUNTS: cuentas preparadas; identidad guardada en ${result.identityPath}.`);

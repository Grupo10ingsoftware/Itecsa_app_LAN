import getPrismaClient, { disconnectPrismaClient } from "../src/database/prisma.js";
import { seedMysqlLabCatalog } from "../src/database/mysqlLabSeed.js";

try {
  const result = await seedMysqlLabCatalog(getPrismaClient());
  console.log(`MYSQL_LAB_SEED: ${result.created} registros de catalogo creados.`);
  for (const diagnostic of result.diagnostics) console.warn(`MYSQL_LAB_SEED_DIAGNOSTIC ${diagnostic.code}: ${diagnostic.message}`);
} finally {
  await disconnectPrismaClient();
}

import getPrismaClient, { disconnectPrismaClient } from "../src/database/prisma.js";
import { validateMysqlLabCatalog } from "../src/database/mysqlLabSeed.js";

try {
  const result = await validateMysqlLabCatalog(getPrismaClient());
  if (!result.valid) {
    throw new Error(`Catalogos incompletos o incompatibles: faltan=${result.missing.length}, conflictos=${result.conflicts.length}.`);
  }
  console.log("MYSQL_LAB_CATALOGS: validos.");
  for (const diagnostic of result.diagnostics) console.warn(`MYSQL_LAB_CATALOG_DIAGNOSTIC ${diagnostic.code}: ${diagnostic.message}`);
} finally {
  await disconnectPrismaClient();
}

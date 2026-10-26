import assert from "node:assert/strict";
import test from "node:test";
import { MYSQL_LAB_CATALOG } from "../src/database/mysqlLabCatalog.js";
import { seedMysqlLabCatalog, validateMysqlLabCatalog } from "../src/database/mysqlLabSeed.js";

function memoryPrisma(initial = {}) {
  const stores = Object.fromEntries([
    "estado_Pago", "estado_Pedido", "tipo_Producto", "etiqueta", "estado_Subprocesos", "producto_Subproceso",
  ].map((name) => [name, structuredClone(initial[name] ?? [])]));
  const client = Object.fromEntries(Object.entries(stores).map(([name, rows]) => [name, {
    async findMany() { return structuredClone(rows); },
    async create({ data }) { rows.push(structuredClone(data)); return data; },
  }]));
  return { ...client, stores, async $transaction(callback) { return callback(client); } };
}

test("el catalogo reutiliza valores existentes y no inventa capacidades", () => {
  assert.deepEqual(MYSQL_LAB_CATALOG.productTypes, [
    { id_tipo_producto: 1, nombre_producto: "Yoyo", capacidad_diaria: null },
    { id_tipo_producto: 2, nombre_producto: "Lanyard", capacidad_diaria: 1200 },
    { id_tipo_producto: 3, nombre_producto: "Tarjeta", capacidad_diaria: null },
  ]);
  assert.deepEqual(MYSQL_LAB_CATALOG.subprocesses.map((row) => row.nombre_estado), ["Impresión", "Corte", "Empaquetado"]);
  assert.deepEqual([...new Set(MYSQL_LAB_CATALOG.productSubprocesses.map((row) => row.id_tipo_producto))], [2, 3]);
});

test("el seed crea solo ausentes y una segunda ejecucion no escribe", async () => {
  const prisma = memoryPrisma();
  const first = await seedMysqlLabCatalog(prisma);
  const second = await seedMysqlLabCatalog(prisma);
  assert.equal(first.created, 24);
  assert.equal(second.created, 0);
  assert.equal((await validateMysqlLabCatalog(prisma)).valid, true);
  assert.equal(prisma.stores.tipo_Producto.find((row) => row.nombre_producto === "Yoyo").capacidad_diaria, null);
});

test("el seed rechaza conflictos antes de crear registros", async () => {
  const prisma = memoryPrisma({ estado_Pago: [{ id_estado_pago: 1, nombre_estado_pago: "Otro" }] });
  await assert.rejects(seedMysqlLabCatalog(prisma), /Catalogos MySQL incompatibles/);
  assert.equal(prisma.stores.estado_Pedido.length, 0);
});

test("el seed rechaza una identidad de catalogo asignada a otro id", async () => {
  const prisma = memoryPrisma({
    estado_Pedido: [{ id_estado_pedido: 99, nombre_etapa: "Confirmacion de pago", orden_kanban: 99 }],
  });
  await assert.rejects(seedMysqlLabCatalog(prisma), /Catalogos MySQL incompatibles/);
  assert.equal(prisma.stores.estado_Pago.length, 0);
});

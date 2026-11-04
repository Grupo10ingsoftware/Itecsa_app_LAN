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
    { id_tipo_producto: 1, nombre_producto: "Lanyard", capacidad_diaria: 1200 },
    { id_tipo_producto: 2, nombre_producto: "Tarjeta", capacidad_diaria: null },
    { id_tipo_producto: 3, nombre_producto: "Yoyo", capacidad_diaria: null },
  ]);
  assert.deepEqual(MYSQL_LAB_CATALOG.subprocesses.map((row) => row.nombre_estado), ["Impresion", "Sublimacion", "Corte", "Costura", "Empaquetado", "Revision info", "Orden info", "Carga info", "Confeccion", "Ensamblado"]);
  assert.deepEqual([...new Set(MYSQL_LAB_CATALOG.productSubprocesses.map((row) => row.id_tipo_producto))], [1, 2, 3]);
});

test("el seed crea solo ausentes y una segunda ejecucion no escribe", async () => {
  const prisma = memoryPrisma();
  const first = await seedMysqlLabCatalog(prisma);
  const second = await seedMysqlLabCatalog(prisma);
  assert.equal(first.created, 37);
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


test("los flujos conservan los IDs de referencia con Yoyo=3 y Terminado=5", () => {
  assert.deepEqual(MYSQL_LAB_CATALOG.productSubprocesses.map(row => [row.id_tipo_producto, row.id_estado_subproceso, row.orden_flujo]), [
    [1,1,1], [1,2,2], [1,3,3], [1,4,4], [1,5,5],
    [2,6,1], [2,7,2], [2,8,3], [2,9,4], [2,5,5], [3,10,1], [3,5,2],
  ]);
  assert.equal(MYSQL_LAB_CATALOG.orderStatuses.length, 7);
  assert.deepEqual(MYSQL_LAB_CATALOG.orderStatuses[4], { id_estado_pedido: 5, nombre_etapa: 'Terminado', orden_kanban: 4 });
});

test("la capacidad editable sobrevive al seed y un catalogo incompleto no valida", async () => {
  const prisma = memoryPrisma();
  await seedMysqlLabCatalog(prisma);
  prisma.stores.tipo_Producto[0].capacidad_diaria = 1500;
  assert.equal((await seedMysqlLabCatalog(prisma)).created, 0);
  assert.equal(prisma.stores.tipo_Producto[0].capacidad_diaria, 1500);
  assert.equal((await validateMysqlLabCatalog(prisma)).valid, true);
  prisma.stores.producto_Subproceso.pop();
  assert.equal((await validateMysqlLabCatalog(prisma)).valid, false);
});

test("catalogos con filas extra o capacidad invalida son incompatibles", async () => {
  const prisma = memoryPrisma();
  await seedMysqlLabCatalog(prisma);
  prisma.stores.tipo_Producto[0].capacidad_diaria = 0;
  await assert.rejects(seedMysqlLabCatalog(prisma), /incompatibles/);
  prisma.stores.tipo_Producto[0].capacidad_diaria = 1500;
  prisma.stores.tipo_Producto.push({ id_tipo_producto: 5, nombre_producto: 'Otro' });
  await assert.rejects(seedMysqlLabCatalog(prisma), /incompatibles/);
});

import assert from "node:assert/strict";
import { config } from "dotenv";
import { openVerifiedLabConnection } from "../src/database/mysqlLabSafety.js";

config(process.env.DOTENV_PATH ? { path: process.env.DOTENV_PATH, override: true } : undefined);
process.env.SALES_NOTE_SOURCE = "fixture";

const verified = await openVerifiedLabConnection(process.env);
await verified.end();

const [{ default: getPrismaClient, disconnectPrismaClient }, { default: OrderService }, { default: OrderRepository },
  { default: ClientRepo }, { default: ClientService }, { default: OrderDetailRepo }, { default: OrderDetailService },
  { default: ProductTypeRepo }, { default: ProductTypeService }, { default: SecurityAuditRepository }] = await Promise.all([
  import("../src/database/prisma.js"),
  import("../src/modules/orders/service/order.service.js"),
  import("../src/modules/orders/repo/orders.repo.js"),
  import("../src/modules/clients/repo/clients.repo.js"),
  import("../src/modules/clients/service/clients.service.js"),
  import("../src/modules/orders/repo/orderDetail.repo.js"),
  import("../src/modules/orders/service/orderDetail.service.js"),
  import("../src/modules/products/repo/product.repo.js"),
  import("../src/modules/products/service/product.service.js"),
  import("../src/modules/security/repo/securityAudit.repo.js"),
]);

const db = getPrismaClient();
const before = await Promise.all([db.usuario.count(), db.cliente.count(), db.pedidos.count(), db.detalle_pedido.count()]);
const rollback = new Error("MYSQL_LAB_EXPECTED_ROLLBACK");
let checked = false;
try {
  await db.$transaction(async (tx) => {
    const actor = await tx.usuario.create({ data: {
      id_keycloak: "local-lab-yoyo-rollback-check",
      correo_usuario: "yoyo-rollback-check@example.invalid",
      rol_usuario: "Soporte",
      estado_usuario: "Activo",
    } });
    const salesOrderTransaction = (operation) => operation({
      repo: new OrderRepository({ prisma: tx }),
      clientService: new ClientService({ repo: new ClientRepo({ prisma: tx }) }),
      orderDetailService: new OrderDetailService({ repo: new OrderDetailRepo({ prisma: tx }) }),
      productTypeService: new ProductTypeService({ repo: new ProductTypeRepo({ prisma: tx }) }),
      securityAudit: new SecurityAuditRepository({ prisma: tx }),
      repoClient: tx,
    });
    const orders = new OrderService({ prisma: tx, salesOrderTransaction });
    const created = await orders.createOrder({ numeroNota: "24226" }, { actorId: actor.id_usuario });
    const detail = await tx.detalle_pedido.findFirst({
      where: { id_pedido: created.id_pedido },
      include: { Tipo_Producto: true },
    });
    assert.equal(detail?.Tipo_Producto?.nombre_producto, "Yoyo");
    assert.equal(detail?.id_tipo_producto, 3);
    assert.equal(detail?.id_estado_subproceso, 10);
    checked = true;
    throw rollback;
  }, { timeout: 20000, maxWait: 10000 });
} catch (error) {
  if (error !== rollback) throw error;
} finally {
  const after = await Promise.all([db.usuario.count(), db.cliente.count(), db.pedidos.count(), db.detalle_pedido.count()]);
  await disconnectPrismaClient();
  assert.equal(checked, true);
  assert.deepEqual(after, before, "La comprobacion Yoyo dejo datos persistidos.");
}

console.log("MYSQL_LAB_PHYSICAL_CHECK: Yoyo=3 comienza en Ensamblado=10 y la transaccion fue revertida sin residuos.");

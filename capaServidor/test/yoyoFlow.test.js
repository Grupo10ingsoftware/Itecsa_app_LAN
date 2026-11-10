import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeSalesNote, validatedRepositoryDTO } from '../src/modules/orders/service/salesNoteSource.service.js';
import { validateSalesNoteSource } from '../src/modules/orders/service/salesOrder.validator.js';
import SalesOrderCreationService from '../src/modules/orders/service/salesOrderCreation.service.js';
import { getCreationProductContextOperation } from '../src/modules/orders/repo/orderCreationOperations.js';
import { completeSubprocessOperation, rollbackSubprocessOperation } from '../src/modules/orders/repo/orderSubprocessOperations.js';
import { updateGeneralStepOperation } from '../src/modules/orders/repo/orderStageOperations.js';
import { completeSubprocessOperation as completeWithActor, updGeneralStepOperation } from '../src/modules/orders/service/orderProduction.service.js';
import { ROLES, ROLE_PERMISSIONS } from '../../shared/authorization.js';
import { yoyoDetail, yoyoRepository } from './fixtures/yoyo.js';

function sourceNote() {
  return normalizeSalesNote({
    numeroNota: 'QA-47-YOYO', cliente: { rut: '99.047.047-7', nombre: 'Cliente sintético QA' },
    items: [
      { codigo: 'QA-YOYO-1', producto: 'Yoyo sintético azul', cantidad: 12, familia: 'ACCESORIOS', subfamilia: ' yOyO ', importable: true },
      { codigo: 'QA-OTRO-1', producto: 'Bolsa sintética', cantidad: 2, familia: 'OTROS', subfamilia: 'BOLSA', importable: false },
    ],
  });
}
const complete = (s, subprocessId, extra = {}) => completeSubprocessOperation(s.repo, {
  orderId: 47, detailId: 470, subprocessId, userId: 7, comment: 'QA Yoyo', hydrate: false, ...extra,
});
const conflict = error => error.statusCode === 409;

test('source normalization imports Yoyo as productive while keeping unrelated accessories separate', () => {
  const note = validatedRepositoryDTO(sourceNote());
  const validated = validateSalesNoteSource(note, 'QA-47-YOYO');
  assert.equal(validated.items.length, 1);
  assert.equal(validated.items[0].tipoProducto, 'Yoyo');
  assert.equal(validated.items[0].cantidad, 12);
  assert.equal(validated.itemsSinSeguimientoProductivo.length, 1);
  assert.equal(validated.itemsSinSeguimientoProductivo[0].producto, 'Bolsa sintética');
  assert.throws(() => validateSalesNoteSource({ ...note, items: [{ ...note.items[0], cantidad: 0 }] }, 'QA-47-YOYO'), error => error.statusCode === 422);
});

test('creation persists the resolved Yoyo product and first process, preserving source quantities and snapshots', async () => {
  const sample = yoyoDetail(), details = [], events = [];
  const client = {
    tipo_Producto: { async findFirst({ where }) { assert.equal(where.nombre_producto, 'Yoyo'); return sample.Tipo_Producto; } },
    producto_Subproceso: { async findMany({ where, orderBy }) {
      assert.equal(where.id_tipo_producto, sample.id_tipo_producto);
      assert.deepEqual(orderBy, { orden_flujo: 'asc' });
      return sample.Tipo_Producto.Producto_Subproceso;
    } },
  };
  const repo = {
    existsBySalesNoteNumber: async () => false,
    async create(data) { events.push(['create', data]); return { id_pedido: 47, numero_nota_venta: data.numero_nota_venta }; },
    recordCreation: async data => events.push(['history', data]),
    getCreationProductContext: name => getCreationProductContextOperation({ client }, name),
    async createCreationDetails(id, entries) { assert.equal(id, 47); details.push(...entries); },
    async createCreationAccessories(id, entries) { events.push(['accessories', entries]); },
    notifyCreatedOrder: async data => events.push(['notification', data]),
  };
  const service = new SalesOrderCreationService({ source: { getByNumber: async () => sourceNote() },
    runInTransaction: async callback => callback({ repo, clientService: { findOrCreateClient: async () => ({ id_cliente: 47 }) },
      securityAudit: { record: async entry => events.push(['audit', entry]) } }),
  });
  const result = await service.create({ numeroNota: 'QA-47-YOYO' }, { actorId: 7, response: 'receipt' });
  assert.deepEqual(result, { id_pedido: 47, numero_nota_venta: 'QA-47-YOYO' });
  assert.equal(details.length, 1);
  assert.equal(details[0].id_tipo_producto, 3);
  assert.equal(details[0].id_estado_subproceso, 10, 'start at Ensamblado, not the lowest numeric process ID');
  assert.equal(details[0].cantidad, 12);
  assert.equal(details[0].producto_origen, 'Yoyo sintético azul');
  assert.equal(details[0].fecha_estimada_termino, null, 'planning remains a calendar action');
  assert.equal(events.find(([type]) => type === 'create')[1].id_estado_pago, 1);
  assert.equal(events.find(([type]) => type === 'audit')[1].eventType, 'order.imported');
});

for (const kind of ['missing step', 'reversed sequence', 'wrong product ID']) {
  test(`Yoyo creation fails closed for an inconsistent MySQL catalog: ${kind}`, async () => {
    const detail = yoyoDetail();
    let steps = detail.Tipo_Producto.Producto_Subproceso;
    if (kind === 'missing step') steps = steps.slice(0, 1);
    if (kind === 'reversed sequence') steps = [...steps].reverse();
    const client = {
      tipo_Producto: { findFirst: async () => ({ ...detail.Tipo_Producto, id_tipo_producto: kind === 'wrong product ID' ? 1 : detail.id_tipo_producto }) },
      producto_Subproceso: { findMany: async () => steps },
    };
    await assert.rejects(getCreationProductContextOperation({ client }, 'Yoyo'), error => error.code === 'INVALID_PRODUCT_FLOW');
  });
}

test('Yoyo advances Ensamblado→Empaquetado→finished without Lanyard progress and audits each completed process', async () => {
  const s = yoyoRepository();
  await complete(s, 10);
  assert.equal(s.detail.id_estado_subproceso, 5);
  assert.equal(s.detail.fecha_real_termino, null);
  await complete(s, 5);
  assert.equal(s.detail.id_estado_subproceso, 5);
  assert.ok(s.detail.fecha_real_termino instanceof Date);
  assert.deepEqual(s.subprocessAudit.map(record => record.id_estado_subproceso), [10, 5]);
  assert.deepEqual(s.audit.map(record => record.id_usuario), [7, 7]);
  assert.equal(s.locks.length, 2);
  await assert.rejects(complete(s, 5), conflict);
  assert.equal(s.audit.length, 2, 'repeated completion must not add history');
});

test('Yoyo cannot skip assembly or invoke a process belonging to a different product', async () => {
  const s = yoyoRepository();
  await assert.rejects(complete(s, 5), conflict);
  await assert.rejects(complete(s, 1), error => error.statusCode === 404);
  assert.equal(s.writes.length, 0);
  assert.equal(s.audit.length, 0);
});

for (const [name, change] of [['outside production', { id_etapa_general: 1 }], ['unconfirmed payment', { estado_pago: 'Pendiente' }]]) {
  test(`Yoyo rejects subprocess changes ${name}`, async () => {
    const s = yoyoRepository();
    Object.assign(s.order, change);
    await assert.rejects(complete(s, 10), conflict);
    assert.equal(s.writes.length, 0);
  });
}

test('missing PIN-validated actor rejects completion before the transaction starts', async () => {
  let transactions = 0;
  await assert.rejects(completeWithActor({ runInTransaction() { transactions++; } }, 47, 470, 10), error => error.statusCode === 403);
  assert.equal(transactions, 0);
});

test('optimistic conflict cannot create a duplicate subprocess history record', async () => {
  const s = yoyoRepository();
  s.repo.client.detalle_pedido.updateMany = async () => ({ count: 0 });
  await assert.rejects(complete(s, 10), conflict);
  assert.equal(s.audit.length, 0);
  assert.equal(s.subprocessAudit.length, 0);
});

test('Yoyo can roll back only the immediately previous process, including reopening completed packaging', async () => {
  const s = yoyoRepository();
  const rollback = subprocessId => rollbackSubprocessOperation(s.repo, { orderId: 47, detailId: 470, subprocessId, userId: 7, comment: 'QA correction', hydrate: false });
  await assert.rejects(rollback(5), conflict);
  await complete(s, 10);
  await rollback(10);
  assert.equal(s.detail.id_estado_subproceso, 10);
  await complete(s, 10);
  await complete(s, 5);
  await assert.rejects(rollback(10), conflict);
  await rollback(5);
  assert.equal(s.detail.fecha_real_termino, null);
  assert.equal(s.detail.id_estado_subproceso, 5);
});

test('delivery remains blocked until packaging ends; completed Yoyo needs no Lanyard percentage', async () => {
  const s = yoyoRepository();
  await assert.rejects(updateGeneralStepOperation(s.repo, 47, 3, { userId: 7 }), conflict);
  await complete(s, 10);
  await assert.rejects(updateGeneralStepOperation(s.repo, 47, 3, { userId: 7 }), conflict);
  await complete(s, 5);
  assert.deepEqual(await updateGeneralStepOperation(s.repo, 47, 3, { userId: 7 }), { id_pedido: 47, id_etapa_general: 3 });
  assert.equal(s.transitions.length, 1);
});

test('production role can finish Yoyo; sales role cannot finish it even with a PIN-validated actor', async () => {
  const s = yoyoRepository();
  await complete(s, 10);
  await complete(s, 5);
  let transactions = 0;
  const service = { repo: s.repo, runInTransaction: async work => { transactions++; return work({ repo: { updateGeneralStep: (...args) => updateGeneralStepOperation(s.repo, ...args) } }); } };
  const options = role => ({ actor: { idUsuario: 7 }, role, identityProvider: 'keycloak', permissions: ROLE_PERMISSIONS[role] });
  await assert.rejects(updGeneralStepOperation(service, 47, 3, options(ROLES.VENTAS)), error => error.statusCode === 403);
  assert.equal(transactions, 0);
  await updGeneralStepOperation(service, 47, 3, options(ROLES.PRODUCCION));
  assert.equal(s.order.id_etapa_general, 3);
  assert.equal(transactions, 1);
});

test('a completed Yoyo cannot bypass unfinished Lanyard requirements in a mixed order', async () => {
  const s = yoyoRepository();
  await complete(s, 10);
  await complete(s, 5);
  s.repo.client.detalle_pedido.findMany = async () => [s.detail, {
    fecha_real_termino: new Date(), id_estado_subproceso: 5,
    Tipo_Producto: { nombre_producto: 'Lanyard', Producto_Subproceso: [{ id_estado_subproceso: 5 }] },
    Avance_Lanyard: [{ porcentaje_acumulado: 80 }],
  }];
  await assert.rejects(updateGeneralStepOperation(s.repo, 47, 3, { userId: 7 }), conflict);
  assert.equal(s.transitions.length, 0);
});

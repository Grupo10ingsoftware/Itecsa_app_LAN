import test from 'node:test';
import assert from 'node:assert/strict';
import { productionFixture } from '../scripts/fixtures/kanbanProductionFixture.mjs';
import OrderRepository from '../src/modules/orders/repo/orders.repo.js';
import OrderService from '../src/modules/orders/service/order.service.js';
import { getKanbanRow, listKanbanRows } from '../src/modules/orders/repo/kanbanRead.repo.js';
import { getOrderViewOperation } from '../src/modules/orders/repo/orderViewOperations.js';
import ProductionLoadRepository from '../src/modules/productionLoad/repo/productionLoad.repo.js';
import { reevaluateFromSalesNoteOperation } from '../src/modules/orders/repo/orderSalesNoteOperations.js';
import { sendToReviewOperation, cancelProductionOperation } from '../src/modules/orders/repo/orderStageOperations.js';
import OrderController from '../src/modules/orders/controller/orders.controller.js';

const actor = { idUsuario: 9 };
for (const current of [1, 2, 3]) test(`completing subprocess ${current} keeps lock, conditional update, records and commit`, async () => {
  const f = productionFixture({ current });
  assert.deepEqual(await f.service.completeSubprocess(1, 2, current, { actor, comment: 'observación', response: 'receipt' }), { id_pedido: 1 });
  const s = f.state(); assert.equal(s.current, Math.min(current + 1, 3)); assert.equal(s.finished, current === 3);
  assert.equal(s.records.length, 1); assert.equal(s.records[0].id_usuario, 9); assert.equal(s.records[0].observacion, 'observación');
  assert.equal(s.subprocessRecords.length, 1); assert.equal(f.events.at(-1), 'commit');
  assert.ok(f.events.indexOf('lock') < f.events.indexOf('detail'));
  assert.ok(f.events.indexOf('conditionalUpdate') < f.events.indexOf('record'));
  assert.equal(f.calls['orm.order'], undefined);
});
test('internal callers retain hydrated return by default', async () => {
  const f = productionFixture(); const result = await f.service.completeSubprocess(1, 2, 1, { actor });
  assert.equal(result.id_pedido, 1); assert.equal(result.detalles.length, 1); assert.equal(f.calls['orm.order'], 1);
});
for (const patch of [{ stage: 1 }, { payment: 'Pendiente' }, { finished: true }]) test(`completion rejects invalid current production condition ${JSON.stringify(patch)}`, async () => {
  const f = productionFixture(patch);
  await assert.rejects(f.service.completeSubprocess(1, 2, 1, { actor, response: 'receipt' }));
  assert.equal(f.state().records.length, 0); assert.equal(f.events.at(-1), 'rollback');
});
test('wrong subprocess, missing detail and missing PIN actor cannot create history', async () => {
  const f = productionFixture();
  await assert.rejects(f.service.completeSubprocess(1, 2, 3, { actor, response: 'receipt' }));
  await assert.rejects(f.service.completeSubprocess(1, 999, 1, { actor, response: 'receipt' }));
  await assert.rejects(f.service.completeSubprocess(1, 2, 1, { response: 'receipt' }));
  assert.equal(f.state().records.length, 0);
});
test('two normal advances serialize and only one creates a subprocess record', async () => {
  const f = productionFixture({ latency: 1 });
  const results = await Promise.allSettled([1, 2].map(() => f.service.completeSubprocess(1, 2, 1, { actor, response: 'receipt' })));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(f.state().records.length, 1); assert.equal(f.state().subprocessRecords.length, 1);
});
test('Lanyard repeats before packaging below 100%, preserves completion at 100%', async () => {
  for (const progress of [50, 100]) {
    const f = productionFixture({ current: 2, product: 'Lanyard', progress });
    await f.service.completeSubprocess(1, 2, 2, { actor, response: 'receipt' });
    assert.equal(f.state().current, progress < 100 ? 1 : 3); assert.equal(f.state().finished, false);
  }
});
for (const finished of [false, true]) test(`rollback preserves observation, record and current state (finished=${finished})`, async () => {
  const f = productionFixture({ current: 3, finished });
  const target = finished ? 3 : 2;
  assert.deepEqual(await f.service.rollbackSubprocess(1, 2, target, { actor, comment: ' Corrección válida ', response: 'receipt' }), { id_pedido: 1 });
  assert.equal(f.state().current, target); assert.equal(f.state().finished, false);
  assert.equal(f.state().records[0].observacion, 'Corrección válida');
  assert.equal(f.state().subprocessRecords[0].fecha_hora_salida, null); assert.equal(f.calls['orm.order'], undefined);
});
test('rollback first step, skipped step, invalid stage, empty or excessive observation are rejected', async () => {
  const first = productionFixture();
  await assert.rejects(first.service.rollbackSubprocess(1, 2, 1, { actor, comment: 'reason', response: 'receipt' }));
  const f = productionFixture({ current: 3 });
  for (const comment of ['', ' '.repeat(4), 'a'.repeat(2001)]) await assert.rejects(f.service.rollbackSubprocess(1, 2, 2, { actor, comment, response: 'receipt' }));
  await assert.rejects(f.service.rollbackSubprocess(1, 2, 1, { actor, comment: 'reason', response: 'receipt' }));
  assert.equal(f.state().records.length, 0);
});
for (const action of ['complete', 'rollback']) test(`${action}: failure while creating audit record rolls back the conditional change`, async () => {
  const f = productionFixture({ current: action === 'complete' ? 1 : 2, failAt: 'subprocessRecord' });
  const before = f.state();
  const work = action === 'complete' ? f.service.completeSubprocess(1, 2, 1, { actor, response: 'receipt' })
    : f.service.rollbackSubprocess(1, 2, 1, { actor, comment: 'reason', response: 'receipt' });
  await assert.rejects(work); assert.deepEqual(f.state(), before); assert.equal(f.events.at(-1), 'rollback');
});
test('detail projection retains complete comments, subprocess names, dates and Lanyard progress', async () => {
  const f = productionFixture({ current: 2, product: 'Lanyard', progress: 40 });
  const baseRaw = f.tx.$queryRaw;
  f.tx.$queryRaw = (input, ...values) => {
    const sql = Array.isArray(input) ? input.join('?') : input.sql;
    if (sql.includes('FROM Comentario_Produccion')) return Promise.resolve([{ id_detalle_pedido: 2, id_comentario_produccion: 7,
      comentario: '  Producción ✓ ', fecha_comentario: new Date('2026-02-01') }]);
    if (sql.includes('FROM Registros r JOIN')) return Promise.resolve([{ ID_REGISTRO: 8, FECHA_HORA: new Date('2026-01-01'),
      observacion: 'Avance Lanyard: 40% (40/100 producidos)\n Observación ', id_detalle_pedido: 2, nombre_estado: 'Impresión' }]);
    return baseRaw(input, ...values);
  };
  const result = await getOrderViewOperation({ client: f.tx }, 1, 'kanban');
  assert.equal(result.detalles.length, 1); assert.equal(result.detalles[0].subProcesses.length, 3);
  assert.deepEqual(result.detalles[0].subProcesses.map(p => p.status), ['done', 'pending', 'pending']);
  assert.equal(result.detalles[0].lanyardProgress.percentage, 40);
  assert.deepEqual(result.comments.map(c => c.text), ['Observación', 'Producción ✓']);
  assert.deepEqual(result.comments.map(c => c.subprocessName), ['Impresión', 'Produccion - Lanyard']);
  assert.ok(result.comments[0].createdAt instanceof Date);
  const precheck = await getOrderViewOperation({ client: f.tx }, 1, 'kanban-precheck');
  assert.deepEqual(precheck.detalles, result.detalles); assert.deepEqual(precheck.comments, []);
});
test('independent detail queries run concurrently, with no Cartesian history/flow join', async () => {
  let release; const gate = new Promise(resolve => { release = resolve; }), queries = [];
  const work = getKanbanRow({ $queryRaw: async input => { queries.push(input); await gate; return []; } }, 1);
  assert.equal(queries.length, 4);
  release(); assert.equal(await work, null);
  assert.ok(queries.every(q => !String(q.sql ?? q.join('?')).includes('Avance_Lanyard') || !String(q.sql ?? q.join('?')).includes('Comentario_Produccion')));
});
test('large synthetic detail retains 200 items, 600 subprocesses and every comment with four fixed reads', async () => {
  const f = productionFixture(), base = f.tx.$queryRaw; let queries = 0;
  f.tx.$queryRaw = async (input, ...values) => {
    queries++;
    const sql = Array.isArray(input) ? input.join('?') : input.sql;
    if (sql.includes('flowId')) return Array.from({ length: 200 }, (_, i) => [1, 2, 3].map(flowId => ({
      id_detalle_pedido: i + 1, cantidad: 10, fecha_estimada_termino: null, fecha_real_termino: null,
      id_estado_subproceso: 2, nombre_producto: 'Tarjeta', flowId, orden_flujo: flowId, nombre_estado: 'Process', id_avance_lanyard: null,
    }))).flat();
    if (sql.includes('FROM Comentario_Produccion')) return Array.from({ length: 200 }, (_, i) => ({
      id_detalle_pedido: i + 1, id_comentario_produccion: i + 1, comentario: 'Production ' + i, fecha_comentario: null,
    }));
    if (sql.includes('FROM Registros r JOIN')) return Array.from({ length: 500 }, (_, i) => ({
      ID_REGISTRO: i + 1, FECHA_HORA: new Date('2026-01-01'), observacion: 'History ' + i, id_detalle_pedido: 1, nombre_estado: 'Process',
    }));
    return base(input, ...values);
  };
  const result = await getOrderViewOperation({ client: f.tx }, 1, 'kanban');
  assert.equal(queries, 4); assert.equal(result.detalles.length, 200);
  assert.equal(result.detalles.reduce((n, d) => n + d.subProcesses.length, 0), 600);
  assert.equal(result.comments.length, 700); assert.equal(new Set(result.comments.map(c => c.id)).size, 700);
});
test('summary binds cursor, wildcard search/product and date range before page limit', async () => {
  let sql; const data = await listKanbanRows({ $queryRaw: async q => { sql = q; return []; } }, {
    limit: 50, cursor: { id: 123 }, search: "%' OR 1=1 --", productType: 'Lanyard', status: 'En producción', from: new Date('2026-01-01'),
  });
  assert.deepEqual(data, []); assert.ok(sql.values.includes(123)); assert.ok(sql.values.includes("%%' OR 1=1 --%"));
  assert.ok(sql.values.includes('%Lanyard%')); assert.ok(sql.values.includes(51)); assert.equal(sql.sql.includes("OR 1=1 --"), false);
});
test('daily load selects last progress up to date and today separately, preserving zero/null and pending values', async () => {
  let sql; const repo = new ProductionLoadRepository({ prisma: { $queryRaw: async (input, ...values) => {
    sql = { text: input.join('?'), values }; return [{ id_detalle_pedido: 3, id_pedido: 1, cantidad: 100, dueDate: null,
      numero_nota_venta: 'SYNTHETIC', nombre_cliente: null, razon_social: 'Razón', nombre_producto: 'Lanyard', nombre_etapa: 'En producción', orden_kanban: 2,
      latestId: 7, cantidad_acumulada: 40, porcentaje_acumulado: '40.00', todayId: null, cantidad_dia: null }];
  } } });
  const [row] = await repo.listLanyardDetails('2026-10-27');
  assert.equal(row.dailyQuantity, 0); assert.equal(row.accumulatedQuantity, 40); assert.equal(row.remainingQuantity, 60);
  assert.equal(row.progressPercentage, 40); assert.equal(row.latestProgressId, 7); assert.equal(row.todayProgressId, null);
  assert.equal(row.clientName, 'Razón'); assert.equal(row.dueDate, null);
  assert.ok(sql.text.includes('a.fecha_produccion<=?')); assert.equal(sql.values[0].toISOString(), '2026-10-27T00:00:00.000Z');
});
test('compact correction preserves persisted recipient and message, and cancellation passes compact flag', async () => {
  const events = []; const repo = { transitionGeneralStage: async values => { events.push(values); return { id_pedido: 1 }; },
    client: { pedidos: { findUnique: async () => ({ id_usuario: 4, numero_nota_venta: 'SYNTHETIC-1' }) },
      mensaje: { create: async ({ data }) => { assert.match(data.contenido, /SYNTHETIC-1/); assert.match(data.contenido, /corregir/); return { id_mensaje: 3 }; } },
      mENSAJE_USUARIO: { create: async ({ data }) => { assert.equal(data.id_usuario, 4); } } } };
  assert.deepEqual(await sendToReviewOperation(repo, 1, { userId: 9, comment: 'corregir', compact: true }), { id_pedido: 1 });
  await cancelProductionOperation(repo, 1, { compact: true, comment: 'motivo' });
  assert.equal(events.length, 2); assert.ok(events.every(e => e.compact));
});
test('reevaluation resolves repeated product names/first subprocess only once, without dropping lines', async () => {
  let typeReads = 0, flowReads = 0, creates = 0;
  const repo = { client: { pedidos: { findUnique: async () => ({ id_cliente: 1, Detalle_pedido: [] }), update: async () => {} },
    cliente: { update: async () => {} }, tipo_Producto: { findFirst: async () => { typeReads++; return { id_tipo_producto: 1 }; } },
    producto_Subproceso: { findFirst: async () => { flowReads++; return { id_estado_subproceso: 1 }; } },
    detalle_pedido: { create: async () => { creates++; } }, usuario: { findMany: async () => [] } },
    transitionGeneralStage: async values => { assert.equal(values.compact, true); return { id_pedido: 1 }; } };
  await reevaluateFromSalesNoteOperation(repo, { orderId: 1, userId: 9, compact: true, salesNote: {
    numeroNota: 'SYNTHETIC', cliente: { nombre: 'Synthetic' }, items: [1, 2, 3].map(id => ({ lineaOrigen: String(id), codigo: 'code-' + id,
      producto: 'Item ' + id, tipoProducto: 'Tarjeta', cantidad: 10 })),
  } });
  assert.equal(creates, 3); assert.equal(typeReads, 1); assert.equal(flowReads, 1);
});
test('controller waits for mutation commit, requests receipt and preserves public detail after writes', async () => {
  let resolve; const gate = new Promise(done => { resolve = done; }); const events = [];
  const fixture = productionFixture(); const service = { completeSubprocess: async (...args) => { assert.equal(args[3].response, 'receipt'); await gate; events.push('commit'); },
    getOrderViewById: async () => { events.push('projection'); return getOrderViewOperation({ client: fixture.tx }, 1, 'kanban'); } };
  const controller = new OrderController({ service }), res = { status() { return this; }, json(body) { events.push('response'); this.body = body; return this; } };
  const pending = controller.completeSubprocess({ params: { orderId: 1, detailId: 2, subprocessId: 1 }, pinActor: actor, body: {} }, res);
  assert.deepEqual(events, []); resolve(); await pending;
  assert.deepEqual(events, ['commit', 'projection', 'response']); assert.equal(res.body.items[0].subProcesses.length, 3);
});

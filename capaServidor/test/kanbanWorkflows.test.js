import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import OrderService from '../src/modules/orders/service/order.service.js';
import OrderRepository from '../src/modules/orders/repo/orders.repo.js';
import OrderController from '../src/modules/orders/controller/orders.controller.js';
import { updateGeneralStepOperation, transitionGeneralStageOperation } from '../src/modules/orders/repo/orderStageOperations.js';
import { setOrderLabelOperation } from '../src/modules/orders/repo/orderWriteOperations.js';
import { reevaluateFromSalesNoteOperation } from '../src/modules/orders/repo/orderSalesNoteOperations.js';
import ProductionLoadRepository from '../src/modules/productionLoad/repo/productionLoad.repo.js';
import ProductionLoadService from '../src/modules/productionLoad/service/productionLoad.service.js';
import { createOrderRouter } from '../src/modules/orders/routes/order.routes.js';
import { createRequirePin } from '../src/middlewares/requirePin.js';
import { PinServiceError } from '../src/modules/auth/service/pin.service.js';
import { ROLES, ROLES_CLAIM, PERMISSIONS as P } from '../../shared/authorization.js';
import { productionFixture } from '../scripts/fixtures/kanbanProductionFixture.mjs';

const actor = { idUsuario: 9 };
for (const [current, next] of [[1, 2], [2, 3], [3, 4]]) test(`manual transition ${current}→${next} preserves expected-state and PIN actor`, async () => {
  let call;
  const state = { id_estado_pedido: current + 10, id_estado_pago: 2, id_etapa_general: current, estado_pago: 'Confirmado' };
  const service = new OrderService({ repo: { getTransitionState: async () => state,
    updateGeneralStep: async (...args) => { call = args; return { id_pedido: 1 }; } } });
  assert.deepEqual(await service.updGeneralStep(1, next, { actor, role: ROLES.ADMINISTRADOR, identityProvider: 'keycloak',
    permissions: [P.START_PRODUCTION, P.MOVE_ORDERS] }), { id_pedido: 1 });
  assert.equal(call[2].userId, 9); assert.deepEqual(call[2].expectedState, { id_estado_pedido: current + 10, id_estado_pago: 2 });
});
test('backwards/skipped stages, payment mismatch, missing actor and unauthorized start cannot write', async () => {
  let writes = 0, payment = 'Confirmado';
  const service = new OrderService({ repo: { getTransitionState: async () => ({ id_etapa_general: 1, estado_pago: payment }),
    updateGeneralStep: async () => { writes++; } } });
  const options = { actor, role: ROLES.ADMINISTRADOR, identityProvider: 'keycloak', permissions: [P.START_PRODUCTION] };
  for (const next of [0, 3, 'invalid']) await assert.rejects(service.updGeneralStep(1, next, options));
  await assert.rejects(service.updGeneralStep(1, 2, { ...options, actor: null }));
  await assert.rejects(service.updGeneralStep(1, 2, { ...options, permissions: [] }));
  payment = 'Pendiente'; await assert.rejects(service.updGeneralStep(1, 2, options)); assert.equal(writes, 0);
});
test('ready-for-delivery preconditions stay under the order lock; missing/unfinished details block transition', async () => {
  for (const details of [[], [{ fecha_real_termino: null }], [{ fecha_real_termino: new Date() }],
    [{ fecha_real_termino: new Date(), id_estado_subproceso: 7,
      Tipo_Producto: { nombre_producto: 'Tarjeta', Producto_Subproceso: [{ id_estado_subproceso: 7 }] } }]]) {
    const events = []; const repo = { lockProductionOrder: async () => { events.push('lock'); },
      getTransitionState: async () => { assert.equal(events[0], 'lock'); return { id_etapa_general: 2, estado_pago: 'Confirmado' }; },
      client: { detalle_pedido: { findMany: async () => { events.push('read'); return details; } } },
      transitionGeneralStage: async input => { events.push('write'); assert.equal(input.compact, true); return { id_pedido: 1 }; } };
    const work = updateGeneralStepOperation(repo, 1, 3, { userId: 9 });
    if (!details.length || !details[0].fecha_real_termino || !details[0].Tipo_Producto) { await assert.rejects(work); assert.deepEqual(events, ['lock', 'read']); }
    else { await work; assert.deepEqual(events, ['lock', 'read', 'write']); }
  }
});
test('compact transition preserves records and ready notification; conflict cannot duplicate history', async () => {
  const events = []; let count = 1;
  const repo = { client: {
    estado_Pedido: { findFirst: async () => ({ id_estado_pedido: 4, orden_kanban: 3, nombre_etapa: 'Listo para entrega' }) },
    pedidos: { updateMany: async ({ where }) => { assert.equal(where.id_estado_pago, 2); return { count }; },
      findUnique: async () => ({ id_pedido: 1, id_usuario: 7 }) },
    registro_Etapas: { updateMany: async () => { events.push('close'); }, create: async () => { events.push('stage'); } },
    registros: { create: async ({ data }) => { events.push('record'); assert.equal(data.id_usuario, 9); return { ID_REGISTRO: 1 }; } },
  }, notifyOrderReady: async () => { events.push('notify'); }, get: async () => { throw Error('Unnecessary hydration'); } };
  await transitionGeneralStageOperation(repo, { id: 1, ordenKanban: 3, userId: 9, compact: true,
    expectedState: { id_estado_pedido: 3, id_estado_pago: 2 } });
  assert.deepEqual(events, ['close', 'record', 'stage', 'notify']); count = 0; events.length = 0;
  await assert.rejects(transitionGeneralStageOperation(repo, { id: 1, ordenKanban: 3, userId: 9, compact: true,
    expectedState: { id_estado_pedido: 3, id_estado_pago: 2 } })); assert.deepEqual(events, []);
});
test('label operation preserves assignment/removal actor and audit before its compact JOIN response', async () => {
  for (const active of [true, false]) {
    const events = []; const label = { id_etiqueta: 2, nombre_etiqueta: 'Urgencia', descripcion: 'Synthetic', esta_activa: 1 };
    const repo = { client: { etiqueta: { findFirst: async () => label },
      pedido_Etiqueta: { upsert: async ({ create }) => { assert.equal(create.id_usuario_asigna, 9); events.push('assign'); },
        deleteMany: async () => { events.push('remove'); } },
      registros: { create: async ({ data }) => { assert.equal(data.id_usuario, 9); assert.match(data.observacion, /etiqueta Urgencia/); events.push('audit'); } },
      $queryRaw: async (_query, id) => { assert.equal(id, 1); events.push('response'); return active ? [label] : []; } } };
    const result = await setOrderLabelOperation(repo, { orderId: 1, label: 'Urgencia', active, userId: 9 });
    assert.deepEqual(events, [active ? 'assign' : 'remove', 'audit', 'response']); assert.equal(result.etiquetas.length, active ? 1 : 0);
  }
});
test('reevaluation never deletes a line with progress/history and rejects ambiguous source lines', async () => {
  let removed = false;
  const existing = { id_detalle_pedido: 1, codigo_origen: 'previous', _count: { registro_subprocesos: 1 } };
  const repo = { client: { pedidos: { findUnique: async () => ({ id_cliente: 1, Detalle_pedido: [existing] }), update: async () => {} },
    cliente: { update: async () => {} }, detalle_pedido: { deleteMany: async () => { removed = true; } } } };
  await assert.rejects(reevaluateFromSalesNoteOperation(repo, { orderId: 1, userId: 9, salesNote: { items: [] } }));
  assert.equal(removed, false);
  await assert.rejects(reevaluateFromSalesNoteOperation(repo, { orderId: 1, userId: 9,
    salesNote: { items: [{ codigo: 'same' }, { codigo: 'same' }] } }));
});
function loadFixture({ product = 'Lanyard', stage = 2, quantity = 100, fail = false } = {}) {
  let statements = 0, values, committed = false;
  const prisma = { $transaction: async callback => {
    const tx = { detalle_pedido: { findMany: async () => [{ id_detalle_pedido: 1, cantidad: quantity,
      Tipo_Producto: { nombre_producto: product }, Pedidos: { Estado_Pedido: { orden_kanban: stage } } }] },
    avance_Lanyard: { findMany: async ({ where }) => { assert.equal(where.fecha_produccion.lt.toISOString(), '2026-10-27T00:00:00.000Z');
      return [{ id_detalle_pedido: 1, cantidad_acumulada: 30 }]; } },
    $executeRaw: async (query, ...params) => { statements++; values = params.length ? params : query.values; if (fail) throw Error('SQL_FAILURE'); } };
    const result = await callback(tx); committed = true; return result;
  } };
  return { repo: new ProductionLoadRepository({ prisma }), result: () => ({ statements, values, committed }) };
}
test('daily-load batch uses one upsert and last duplicate input, preserving previous-day accumulated amount', async () => {
  const f = loadFixture();
  await f.repo.updateDailyLoads({ dateKey: '2026-10-27', entries: [{ detailId: 1, quantity: 9 }, { detailId: 1, quantity: 20 }], userId: 9, capacity: 1200 });
  const r = f.result(); assert.equal(r.statements, 1); assert.equal(r.committed, true);
  assert.ok(r.values.flatMap(value => value?.values ?? [value]).includes(50));
});
for (const options of [{ product: 'Tarjeta' }, { stage: 1 }, { quantity: 40 }, { quantity: 0 }]) test(`daily-load guards precede the batch upsert: ${JSON.stringify(options)}`, async () => {
  const f = loadFixture(options);
  await assert.rejects(f.repo.updateDailyLoads({ dateKey: '2026-10-27', entries: [{ detailId: 1, quantity: 20 }], userId: 9, capacity: 1200 }));
  assert.equal(f.result().statements, 0); assert.equal(f.result().committed, false);
});
test('daily-load SQL failure cannot be followed by success/reload; invalid calendar dates are rejected', async () => {
  const f = loadFixture({ fail: true }); let reads = 0;
  f.repo.getCapacity = async () => 1200; f.repo.listLanyardDetails = async () => { reads++; return []; };
  const service = new ProductionLoadService({ repo: f.repo, userRepo: { findBySubject: async () => actor } });
  await assert.rejects(service.saveDailyLoad({ date: '2026-10-27', entries: [{ detailId: 1, quantity: 1 }], identitySubject: 'synthetic' }));
  assert.equal(reads, 0); assert.equal(f.result().committed, false);
  await assert.rejects(service.getDailyLoad({ date: '2026-02-29' }));
});
test('new precheck route keeps READ_ORDERS; mutation still requires PIN middleware', async t => {
  let mutations = 0; const f = productionFixture();
  const service = { getOrderViewById: async (_id, view) => { assert.equal(view, 'kanban-precheck'); return new OrderRepository({ prisma: f.tx }).getOrderView(1, view); },
    completeSubprocess: async () => { mutations++; } };
  const app = express(); app.use(express.json()); app.locals.errorLogger = { error() {} };
  const authenticate = (req, res, next) => {
    if (!req.get('authorization')) return res.sendStatus(401);
    req.identityProvider = 'keycloak'; req.auth = { payload: { sub: 'synthetic', [ROLES_CLAIM]: [ROLES.ADMINISTRADOR],
      permissions: req.get('authorization') === 'denied' ? [] : [P.READ_ORDERS, P.UPDATE_SUBPROCESSES] } }; next();
  };
  app.use(createOrderRouter({ authenticate, controller: new OrderController({ service }),
    validatePin: createRequirePin({ pins: { validate: async () => { throw new PinServiceError('PIN_LOCKED', 'locked', { status: 403 }); } } }) }));
  const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(url + '/1/kanban-precheck')).status, 401);
  assert.equal((await fetch(url + '/1/kanban-precheck', { headers: { authorization: 'denied' } })).status, 403);
  assert.equal((await fetch(url + '/1/kanban-precheck', { headers: { authorization: 'allowed' } })).status, 200);
  const response = await fetch(url + '/1/details/2/subprocesses/1/complete', { method: 'PATCH', headers: { authorization: 'allowed', 'content-type': 'application/json' }, body: JSON.stringify({ pin: '123456' }) });
  assert.equal(response.status, 423); assert.equal(mutations, 0);
});
test('post-commit detail failure returns error without undoing or retrying a confirmed subprocess', async () => {
  const f = productionFixture();
  f.service.getOrderViewById = async () => { throw Error('READ_FAILED_AFTER_COMMIT'); };
  const controller = new OrderController({ service: f.service }); let status;
  await controller.completeSubprocess({ params: { orderId: 1, detailId: 2, subprocessId: 1 }, pinActor: actor, body: {}, app: { locals: { errorLogger: { error() {} } } } },
    { status(code) { status = code; return this; }, json() { return this; } });
  assert.equal(status, 500); assert.equal(f.state().records.length, 1); assert.equal(f.events.filter(e => e === 'commit').length, 1);
});

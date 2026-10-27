import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { updateGeneralStepOperation, transitionGeneralStageOperation } from '../src/modules/orders/repo/orderStageOperations.js';
import { updGeneralStepOperation } from '../src/modules/orders/service/orderProduction.service.js';
import { listOrderViewsOperation } from '../src/modules/orders/repo/orderViewOperations.js';
import { createOrderRouter } from '../src/modules/orders/routes/order.routes.js';
import { createRequirePin } from '../src/middlewares/requirePin.js';
import { PinServiceError } from '../src/modules/auth/service/pin.service.js';
import { ROLES, ROLE_PERMISSIONS, ROLES_CLAIM } from '../../shared/authorization.js';

function fixture() {
  const state = { id_estado_pedido: 3, id_estado_pago: 2, id_etapa_general: 2, estado_pago: 'Confirmado' };
  const details = [{ fecha_real_termino: new Date(), id_estado_subproceso: 7,
    Tipo_Producto: { nombre_producto: 'Tarjeta', Producto_Subproceso: [{ id_estado_subproceso: 7 }] } }];
  const records = [], stages = [];
  let locked = false;
  const repo = {
    lockProductionOrder: async () => { locked = true; },
    getTransitionState: async () => ({ ...state }),
    notifyOrderReady: async () => {},
    client: {
      detalle_pedido: { findMany: async () => { assert.ok(locked); return details; } },
      estado_Pedido: { findFirst: async ({ where }) => where.nombre_etapa === 'Terminado'
        ? { id_estado_pedido: 5, orden_kanban: 4, nombre_etapa: 'Terminado' }
        : { id_estado_pedido: 4, orden_kanban: 3, nombre_etapa: 'Listo para entrega' } },
      pedidos: {
        updateMany: async ({ where, data }) => {
          assert.ok(locked);
          if (where.id_estado_pedido !== state.id_estado_pedido) return { count: 0 };
          state.id_estado_pedido = data.id_estado_pedido;
          state.id_etapa_general = data.id_estado_pedido === 5 ? 4 : 3;
          return { count: 1 };
        },
        findUnique: async () => ({ id_pedido: 10, id_usuario: 5 }),
      },
      registros: { create: async ({ data }) => { records.push(data); return { ID_REGISTRO: records.length }; } },
      registro_Etapas: { updateMany: async () => {}, create: async ({ data }) => stages.push(data) },
    },
  };
  repo.transitionGeneralStage = args => transitionGeneralStageOperation(repo, args);
  repo.updateGeneralStep = (...args) => updateGeneralStepOperation(repo, ...args);
  const service = { repo, runInTransaction: callback => callback({ repo }) };
  return { service, repo, state, details, records, stages };
}

test('production completion records actor, timestamp and stage without delivering or deleting the order', async () => {
  const f = fixture();
  const result = await updGeneralStepOperation(f.service, 10, 3, { actor: { idUsuario: 8 }, role: ROLES.PRODUCCION, permissions: ROLE_PERMISSIONS[ROLES.PRODUCCION] });
  assert.equal(result.generalStepId, 3);
  assert.equal(f.records.length, 1);
  assert.equal(f.records[0].id_pedido, 10);
  assert.equal(f.records[0].id_usuario, 8);
  assert.ok(f.records[0].FECHA_HORA instanceof Date);
  assert.match(f.records[0].observacion, /Produccion finalizada/);
  assert.equal(f.stages[0].id_estado_pedido, 4);
  await assert.rejects(updGeneralStepOperation(f.service, 10, 3, { actor: { idUsuario: 8 }, role: ROLES.PRODUCCION, permissions: ROLE_PERMISSIONS[ROLES.PRODUCCION] }), { statusCode: 409 });
  assert.equal(f.records.length, 1);
});

test('finishing a ready order selects Terminado and records exactly one closure under concurrent requests', async () => {
  const f = fixture();
  f.state.id_etapa_general = 3;
  f.state.id_estado_pedido = 4;
  const options = { actor: { idUsuario: 8 }, role: ROLES.PRODUCCION, permissions: ROLE_PERMISSIONS[ROLES.PRODUCCION] };
  const results = await Promise.allSettled([1, 2].map(() => updGeneralStepOperation(f.service, 10, 4, options)));
  const success = results.filter(result => result.status === 'fulfilled');
  assert.equal(success.length, 1);
  assert.equal(success[0].value.nombre_etapa_general, 'Terminado');
  assert.equal(f.state.id_etapa_general, 4);
  assert.equal(f.records.length, 1);
  assert.equal(f.records[0].id_usuario, 8);
  assert.equal(f.records[0].id_pedido, 10);
  assert.ok(f.records[0].FECHA_HORA instanceof Date);
  assert.match(f.records[0].observacion, /Pedido terminado/);
  assert.equal(f.stages[0].id_estado_pedido, 5);
  await assert.rejects(updGeneralStepOperation(f.service, 10, 4, options), { statusCode: 409 });
});

test('finishing an order still requires PIN, permission and completed subprocesses', async () => {
  const f = fixture();
  f.state.id_etapa_general = 3;
  f.state.id_estado_pedido = 4;
  const options = { actor: { idUsuario: 8 }, role: ROLES.PRODUCCION, permissions: ROLE_PERMISSIONS[ROLES.PRODUCCION] };
  await assert.rejects(updGeneralStepOperation(f.service, 10, 4, { ...options, actor: null }), { statusCode: 403 });
  await assert.rejects(updGeneralStepOperation(f.service, 10, 4, { ...options, permissions: [] }), { statusCode: 403 });
  f.details[0].fecha_real_termino = null;
  await assert.rejects(updGeneralStepOperation(f.service, 10, 4, options), { statusCode: 409 });
  assert.equal(f.records.length, 0);
});

for (const scenario of ['pending', 'no-details', 'no-processes', 'invalid-current', 'lanyard-incomplete', 'cancelled', 'finished', 'payment']) {
  test(`rejects completion: ${scenario}`, async () => {
    const f = fixture();
    if (scenario === 'pending') f.details[0].fecha_real_termino = null;
    if (scenario === 'no-details') f.details.length = 0;
    if (scenario === 'no-processes') f.details[0].Tipo_Producto.Producto_Subproceso = [];
    if (scenario === 'invalid-current') f.details[0].id_estado_subproceso = 99;
    if (scenario === 'lanyard-incomplete') f.details[0].Tipo_Producto.nombre_producto = 'Lanyard';
    if (scenario === 'cancelled') f.state.id_etapa_general = 5;
    if (scenario === 'finished') f.state.id_etapa_general = 3;
    if (scenario === 'payment') f.state.estado_pago = 'Pendiente';
    await assert.rejects(updGeneralStepOperation(f.service, 10, 3, { actor: { idUsuario: 8 }, role: ROLES.PRODUCCION, permissions: ROLE_PERMISSIONS[ROLES.PRODUCCION] }));
    assert.equal(f.records.length, 0);
  });
}

test('requires PIN actor and rejects a stale transition without writing history', async () => {
  const f = fixture();
  await assert.rejects(updGeneralStepOperation(f.service, 10, 3, { role: ROLES.PRODUCCION, permissions: ROLE_PERMISSIONS[ROLES.PRODUCCION] }), { statusCode: 403 });
  await assert.rejects(f.repo.updateGeneralStep(10, 3, { userId: 8, expectedState: { id_estado_pedido: 999, id_estado_pago: 2 } }), { statusCode: 409 });
  assert.equal(f.records.length, 0);
});

test('completion respects the existing capability policy', async () => {
  for (const role of [ROLES.VENTAS, ROLES.GERENCIA, ROLES.SOPORTE]) {
    const f = fixture();
    await assert.rejects(updGeneralStepOperation(f.service, 10, 3, {
      actor: { idUsuario: 8 }, role, permissions: ROLE_PERMISSIONS[role],
    }), { statusCode: 403 });
    assert.equal(f.records.length, 0);
  }
  const f = fixture();
  await assert.rejects(updGeneralStepOperation(f.service, 10, 3, {
    actor: { idUsuario: 8 }, role: ROLES.PRODUCCION, permissions: [],
  }), { statusCode: 403 });
  await updGeneralStepOperation(f.service, 10, 3, {
    actor: { idUsuario: 8 }, role: ROLES.ADMINISTRADOR, permissions: ROLE_PERMISSIONS[ROLES.ADMINISTRADOR],
  });
  assert.equal(f.records.length, 1);
});

test('Developer can finish a ready order using existing permissions and a validated PIN actor', async () => {
  const f = fixture();
  f.state.id_etapa_general = 3;
  f.state.id_estado_pedido = 4;
  const options = { role: ROLES.DESARROLLADOR, permissions: ROLE_PERMISSIONS[ROLES.DESARROLLADOR] };
  await assert.rejects(updGeneralStepOperation(f.service, 10, 4, options), { statusCode: 403 });
  const result = await updGeneralStepOperation(f.service, 10, 4, { ...options, actor: { idUsuario: 8 } });
  assert.equal(result.nombre_etapa_general, 'Terminado');
  assert.equal(f.records.length, 1);
});

test('concurrent completion attempts only persist one transition and history entry', async () => {
  const f = fixture();
  const results = await Promise.allSettled([1, 2].map(() => updGeneralStepOperation(f.service, 10, 3, { actor: { idUsuario: 8 }, role: ROLES.PRODUCCION, permissions: ROLE_PERMISSIONS[ROLES.PRODUCCION] })));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(f.records.length, 1);
});

test('active Kanban keeps ready-for-delivery and excludes terminal orders; calendar stays available', async () => {
  let query, sql;
  const repo = { client: {
    $queryRaw: async statement => { sql = statement.sql; return []; },
    pedidos: { findMany: async args => { query = args; return []; } },
  } };
  await listOrderViewsOperation(repo, { view: 'kanban', limit: 50 });
  assert.match(sql, /ep\.orden_kanban <> 4/);
  assert.ok(!sql.includes('Listo para entrega'));
  assert.match(sql, /ep\.nombre_etapa NOT IN \('Terminado', 'Cancelado'\)/);
  await listOrderViewsOperation(repo, { view: 'calendar', limit: 50 });
  assert.equal(query.where.Estado_Pedido, undefined);
});

test('HTTP registration and completion require capability and a fresh PIN on every request', async t => {
  let role = ROLES.VENTAS, calls = 0;
  const app = express();
  app.locals.errorLogger = { error() {} };
  app.use(express.json());
  const authenticate = (req, _res, next) => {
    req.identityProvider = 'keycloak';
    req.auth = { payload: { sub: 'actor', [ROLES_CLAIM]: [role], permissions: ROLE_PERMISSIONS[role] } };
    next();
  };
  const validatePin = createRequirePin({ pins: { validate: async (subject, pin) => {
    assert.equal(subject, 'actor');
    if (pin !== '123456') throw new PinServiceError('PIN_INVALID', 'invalid');
    return { idUsuario: 8 };
  } } });
  const controller = new Proxy({}, { get: () => (req, res) => {
    calls++;
    assert.equal(req.body.pin, undefined);
    assert.equal(req.pinActor.idUsuario, 8);
    res.json({ ok: true });
  } });
  app.use('/orders', createOrderRouter({ authenticate, validatePin, controller }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const send = (path, method, body) => fetch(`http://127.0.0.1:${server.address().port}/orders${path}`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  for (const [path, method, allowedRole] of [['', 'POST', ROLES.VENTAS], ['/10/move', 'PATCH', ROLES.PRODUCCION]]) {
    role = allowedRole;
    assert.equal((await send(path, method, {})).status, 403);
    assert.equal((await send(path, method, { pin: '000000' })).status, 403);
    assert.equal((await send(path, method, { pin: '123456' })).status, 200);
    assert.equal((await send(path, method, {})).status, 403);
    role = ROLES.GERENCIA;
    assert.equal((await send(path, method, { pin: '123456' })).status, 403);
  }
  assert.equal(calls, 2);
});

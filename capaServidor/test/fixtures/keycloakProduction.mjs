import assert from 'node:assert/strict';
import express from 'express';
import OrderService from '../../src/modules/orders/service/order.service.js';
import OrderController from '../../src/modules/orders/controller/orders.controller.js';
import { createOrderRouter } from '../../src/modules/orders/routes/order.routes.js';
import { createOrderStatusRouter } from '../../src/modules/orders/routes/orderStatus.routes.js';
import { createProductionCapacityRouter } from '../../src/modules/productionCapacity/routes/productionCapacity.routes.js';
import { createProductionLoadRouter } from '../../src/modules/productionLoad/routes/productionLoad.routes.js';
import { PinService } from '../../src/modules/auth/service/pin.service.js';
import { createRequirePin } from '../../src/middlewares/requirePin.js';

// Runs only from the guarded, disposable Keycloak/MySQL laboratory. Never reads .env.
export async function runProductionRegression(t, { db, authenticate, login, bind, users }) {
  assert.equal(process.env.RUN_KEYCLOAK_PRODUCTION_INTEGRATION, 'true');
  assert.equal(process.env.DB_NAME, 'itecsa_identity_phase02_test');
  assert.equal(process.env.DB_HOST, 'phase02-mysql');
  assert.equal((await db.$queryRaw`SELECT DATABASE() AS name`)[0].name, process.env.DB_NAME);
  assert.equal(await db.pedidos.count(), 0, 'Production cases require an empty disposable order catalog');
  const roles = ['Administrador Produccion', 'Administrador Ventas', 'Administrador Cobranzas', 'Operario Produccion',
    'Operario Ventas', 'Operario Cobranzas', 'Gerencia', 'Desarrollador', 'Soporte'];
  const [AP, AV, AC, OP, OV, OC, G, D, S] = roles;
  const pins = new PinService({ prisma: db, secret: Buffer.alloc(32, 14).toString('base64') });
  const actors = new Map();
  for (const { username, role } of users) {
    const { tokens } = await login(username);
    const row = await bind(tokens, username, role);
    await pins.ensureProvisioned(row.id_auth0);
    const pin = await pins.reveal(row.id_auth0);
    await pins.acknowledge(row.id_auth0);
    actors.set(role, { token: tokens.access_token, id: row.id_usuario, sub: row.id_auth0, pin });
  }
  assert.deepEqual([...actors.keys()], roles);
  const stateNames = ['Confirmacion de pago', 'Listo para produccion', 'En producción', 'Listo para entrega', 'Entregado', 'Cancelado', 'En revisión'];
  const states = await Promise.all(stateNames.map((name, index) => db.estado_Pedido.create({ data: { nombre_etapa: name, orden_kanban: index } })));
  const pending = await db.estado_Pago.create({ data: { nombre_estado_pago: 'Pendiente' } });
  const paid = await db.estado_Pago.create({ data: { nombre_estado_pago: 'Confirmado' } });
  const card = await db.tipo_Producto.create({ data: { nombre_producto: 'Tarjeta', capacidad_diaria: 100 } });
  const lanyard = await db.tipo_Producto.create({ data: { nombre_producto: 'Lanyard', capacidad_diaria: 1200 } });
  const customer = await db.cliente.create({ data: { nombre_cliente: 'Synthetic Phase04' } });
  const processes = [8401, 8402, 8403];
  await db.estado_Subprocesos.createMany({ data: processes.map((id, index) => ({ id_estado_subproceso: id,
    nombre_estado: ['Impresión', 'Corte', 'Empaquetado'][index] })) });
  await db.producto_Subproceso.createMany({ data: [card, lanyard].flatMap(product => processes.map((id, index) => ({
    id_tipo_producto: product.id_tipo_producto, id_estado_subproceso: id, orden_flujo: index + 1,
  }))) });
  let serial = 0;
  async function order({ stage = 2, confirmed = true, finished = false, process = 0, product = card, dueDate = null } = {}) {
    const row = await db.pedidos.create({ data: { numero_nota_venta: `P04-${++serial}`, fecha_creacion: new Date('2026-10-01'),
      id_usuario: actors.get(AV).id, id_cliente: customer.id_cliente, id_estado_pedido: states[stage].id_estado_pedido,
      id_estado_pago: confirmed ? paid.id_estado_pago : pending.id_estado_pago, fecha_estimada_termino: dueDate,
      Detalle_pedido: { create: { id_tipo_producto: product.id_tipo_producto, cantidad: 100,
        id_estado_subproceso: processes[process], fecha_estimada_termino: dueDate, fecha_real_termino: finished ? new Date() : null } },
    }, include: { Detalle_pedido: true } });
    return { ...row, detail: row.Detalle_pedido[0] };
  }
  const app = express(); app.use(express.json());
  const service = new OrderService({ prisma: db });
  const validatePin = createRequirePin({ pins });
  app.use('/orders', createOrderRouter({ authenticate, validatePin, controller: new OrderController({ service }) }));
  app.use('/order-status', createOrderStatusRouter({ authenticate }));
  app.use('/production-capacity', createProductionCapacityRouter({ authenticate }));
  app.use('/production-load', createProductionLoadRouter({ authenticate }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(role, path, body, method = body === undefined ? 'GET' : 'PATCH') {
    const response = await fetch(base + path, { method, headers: { authorization: `Bearer ${actors.get(role).token}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  }
  const records = id => db.registros.findMany({ where: { id_pedido: id }, orderBy: { ID_REGISTRO: 'asc' } });
  const subpath = (row, process, action) => `/orders/${row.id_pedido}/details/${row.detail.id_detalle_pedido}/subprocesses/${processes[process]}/${action}`;
  const ordinary = [AP, AV, AC, OP, OV, OC, G, D];
  const operations = [
    ['kanban', ordinary, {}, row => `/orders/kanban-summary?limit=2&search=${row.numero_nota_venta}`],
    ['detail', ordinary, {}, row => `/orders/${row.id_pedido}/kanban-detail`],
    ['statuses', ordinary, {}, () => '/order-status'],
    ['calendar', [AP, AV, OV, D], {}, () => '/orders/calendar-summary?unscheduled=true&limit=2'],
    ['calendar-detail', [AP, AV, OV, D], {}, row => `/orders/${row.id_pedido}/calendar-detail`],
    ['capacity-read', ordinary, {}, () => '/production-capacity'],
    ['load-read', ordinary, {}, () => '/production-load/today?date=2026-10-20'],
    ['start', [AP, D], { stage: 1 }, row => `/orders/${row.id_pedido}/move`, () => ({ generalStepId: 2 })],
    ['ready', [AP, OP, D], { finished: true, process: 2 }, row => `/orders/${row.id_pedido}/move`, () => ({ generalStepId: 3 })],
    ['deliver', [AP, OP, D], { stage: 3, finished: true, process: 2 }, row => `/orders/${row.id_pedido}/move`, () => ({ generalStepId: 4 })],
    ['review', [AP, D], { stage: 1 }, row => `/orders/${row.id_pedido}/review`, () => ({ comment: 'Synthetic review' })],
    ['cancel', [AP, D], {}, row => `/orders/${row.id_pedido}/cancel-production`, () => ({ comment: 'Synthetic cancellation' })],
    ['label', [AP, D], {}, row => `/orders/${row.id_pedido}/labels`, () => ({ label: 'Urgencia', active: true })],
    ['date', [AP, D], {}, row => `/orders/${row.id_pedido}/delivery-date`, () => ({ dueDate: '2026-10-26' })],
    ['complete', [AP, OP, D], {}, row => subpath(row, 0, 'complete'), () => ({ comment: 'Synthetic completion' })],
    ['rollback', [AP, D], { process: 1 }, row => subpath(row, 0, 'rollback'), () => ({ comment: 'Synthetic rollback' })],
    ['capacity-write', [AP, D], {}, () => '/production-capacity', (_row, role) => ({ capacities: [{ id: lanyard.id_tipo_producto, capacity: 1500 + roles.indexOf(role) }] })],
    ['load-write', [AP, D], { product: lanyard }, () => '/production-load/today', row => ({ date: '2026-10-20', entries: [{ detailId: row.detail.id_detalle_pedido, quantity: 20 }] })],
  ];
  for (const [name, allowed, fixture, path, payload] of operations) await t.test(`phase04 ${name}: nine real roles and persisted effects`, async () => {
    for (const role of roles) {
      const row = await order(fixture);
      const input = payload ? { ...payload(row, role), pin: actors.get(role).pin, actor: { idUsuario: actors.get(AV).id }, idUsuario: actors.get(AV).id } : undefined;
      const capacityBefore = name === 'capacity-write' ? (await db.tipo_Producto.findUnique({ where: { id_tipo_producto: lanyard.id_tipo_producto } })).capacidad_diaria : null;
      const result = await request(role, path(row), input);
      const accepted = allowed.includes(role);
      assert.equal(result.status, accepted ? 200 : 403, `${name} ${role}: ${JSON.stringify(result.body)}`);
      const history = await records(row.id_pedido);
      const audited = payload && !['capacity-write', 'load-write'].includes(name);
      assert.equal(history.length, accepted && audited ? 1 : 0, `${name}: no records on denied requests`);
      if (history.length) assert.equal(history[0].id_usuario, actors.get(role).id, `${name}: authenticated actor, never body.actor`);
      const persisted = await db.pedidos.findUnique({ where: { id_pedido: row.id_pedido }, include: { Detalle_pedido: true } });
      assert.equal(persisted.id_usuario, actors.get(AV).id, 'Owner and historical foreign keys are preserved');
      const targetStage = { start: 2, ready: 3, deliver: 4, review: 6, cancel: 5 }[name];
      if (targetStage !== undefined) assert.equal(persisted.id_estado_pedido, accepted ? states[targetStage].id_estado_pedido : row.id_estado_pedido);
      if (name === 'date') {
        assert.equal(persisted.fecha_estimada_termino?.toISOString().slice(0, 10) ?? null, accepted ? '2026-10-26' : null);
        assert.equal(persisted.Detalle_pedido[0].fecha_estimada_termino?.toISOString().slice(0, 10) ?? null, accepted ? '2026-10-26' : null);
      }
      if (name === 'complete' || name === 'rollback') assert.equal(persisted.Detalle_pedido[0].id_estado_subproceso, accepted ? processes[name === 'complete' ? 1 : 0] : row.detail.id_estado_subproceso);
      if (name === 'load-write') {
        const progress = await db.avance_Lanyard.findMany({ where: { id_detalle_pedido: row.detail.id_detalle_pedido } });
        assert.equal(progress.length, accepted ? 1 : 0);
        if (accepted) assert.equal(progress[0].id_usuario_registra, actors.get(role).id);
      }
      if (name === 'capacity-write') assert.equal((await db.tipo_Producto.findUnique({ where: { id_tipo_producto: lanyard.id_tipo_producto } })).capacidad_diaria,
        accepted ? input.capacities[0].capacity : capacityBefore);
      if (name === 'label') {
        const labels = await db.pedido_Etiqueta.findMany({ where: { id_pedido: row.id_pedido } });
        assert.equal(labels.length, accepted ? 1 : 0);
        if (accepted) assert.equal(labels[0].id_usuario_asigna, actors.get(role).id);
      }
      if (name === 'ready' || name === 'review') {
        const messages = await db.mensaje.findMany({ where: { id_pedido: row.id_pedido }, include: { MENSAJE_USUARIO: true } });
        assert.equal(messages.length, accepted ? 1 : 0);
        if (accepted) assert.deepEqual(messages[0].MENSAJE_USUARIO.map(link => link.id_usuario), [actors.get(AV).id]);
      }
    }
  });
  await t.test('phase04 business and PIN rejections leave persisted order/history unchanged', async () => {
    const row = await order({ stage: 1, confirmed: false });
    assert.equal((await request(AP, `/orders/${row.id_pedido}/move`, { generalStepId: 2, pin: actors.get(AP).pin })).status, 409);
    assert.equal((await request(AP, `/orders/${row.id_pedido}/cancel-production`, { comment: '', pin: actors.get(AP).pin })).status, 400);
    assert.equal((await request(AP, `/orders/${row.id_pedido}/delivery-date`, { dueDate: '2026-10-25', pin: actors.get(AP).pin })).status, 400);
    assert.equal((await request(AP, `/orders/${row.id_pedido}/move`, { generalStepId: 3, pin: actors.get(AP).pin })).status, 409);
    assert.equal((await request(AP, `/orders/${row.id_pedido}/move`, { generalStepId: 2, pin: actors.get(D).pin })).status, 403);
    assert.equal((await request(AP, `/orders/${row.id_pedido}/move`, { generalStepId: 2 })).status, 400);
    assert.equal((await request(OP, subpath(row, 0, 'rollback'), { comment: 'Forbidden rollback', pin: actors.get(OP).pin })).status, 403);
    assert.equal((await records(row.id_pedido)).length, 0);
    assert.equal((await db.pedidos.findUnique({ where: { id_pedido: row.id_pedido } })).id_estado_pedido, states[1].id_estado_pedido);
    const unfinished = await order();
    assert.equal((await request(AP, `/orders/${unfinished.id_pedido}/move`, { generalStepId: 3, pin: actors.get(AP).pin })).status, 409);
    assert.equal((await request(AP, subpath(unfinished, 1, 'complete'), { pin: actors.get(AP).pin })).status, 409);
    assert.equal((await request(AP, subpath(unfinished, 0, 'rollback'), { comment: 'No previous stage', pin: actors.get(AP).pin })).status, 409);
    assert.equal((await records(unfinished.id_pedido)).length, 0);
  });
  await t.test('phase04 concurrent completions/rollbacks and ready notifications are single transitions', async () => {
    for (const action of ['complete', 'rollback', 'ready']) {
      const row = await order({ process: action === 'rollback' ? 1 : 0, finished: action === 'ready' });
      const path = action === 'ready' ? `/orders/${row.id_pedido}/move` : subpath(row, 0, action);
      const results = await Promise.all([AP, D].map(role => request(role, path, { pin: actors.get(role).pin, comment: 'Concurrent synthetic action', ...(action === 'ready' ? { generalStepId: 3 } : {}) })));
      assert.ok(results.some(result => result.status === 200), `${action}: one succeeds`);
      assert.ok(results.every(result => [200, 409].includes(result.status)), `${action}: no unexpected failures`);
      const history = await records(row.id_pedido);
      assert.equal(history.length, 1, `${action}: exactly one record`);
      assert.ok([actors.get(AP).id, actors.get(D).id].includes(history[0].id_usuario));
      if (action === 'ready') assert.equal(await db.mensaje.count({ where: { id_pedido: row.id_pedido } }), 1);
    }
  });
  await t.test('phase04 Lanyard repeats before 100%, load is idempotent per day and actor is local', async () => {
    const row = await order({ product: lanyard, process: 1 });
    assert.equal((await request(D, subpath(row, 1, 'complete'), { pin: actors.get(D).pin })).status, 200);
    assert.equal((await db.detalle_pedido.findUnique({ where: { id_detalle_pedido: row.detail.id_detalle_pedido } })).id_estado_subproceso, processes[0]);
    const entry = { date: '2026-10-20', entries: [{ detailId: row.detail.id_detalle_pedido, quantity: 100 }] };
    const loads = await Promise.all([AP, D].map(role => request(role, '/production-load/today', entry)));
    assert.ok(loads.every(result => result.status === 200));
    const progress = await db.avance_Lanyard.findMany({ where: { id_detalle_pedido: row.detail.id_detalle_pedido } });
    assert.equal(progress.length, 1); assert.equal(progress[0].cantidad_acumulada, 100);
    assert.ok([actors.get(AP).id, actors.get(D).id].includes(progress[0].id_usuario_registra));
    assert.equal((await request(AP, '/production-load/today', { ...entry, entries: [{ ...entry.entries[0], quantity: 101 }] })).status, 400);
    assert.equal((await request(D, subpath(row, 0, 'complete'), { pin: actors.get(D).pin })).status, 200);
    assert.equal((await request(D, subpath(row, 1, 'complete'), { pin: actors.get(D).pin })).status, 200);
    assert.equal((await db.detalle_pedido.findUnique({ where: { id_detalle_pedido: row.detail.id_detalle_pedido } })).id_estado_subproceso, processes[2]);
  });
  await t.test('phase04 pagination, date filters and calendar omit financial/identity secrets', async () => {
    const first = await request(AP, '/orders/kanban-summary?limit=2');
    assert.equal(first.status, 200); assert.equal(first.body.items.length, 2); assert.ok(first.body.pageInfo.hasMore);
    const next = await request(AP, '/orders/kanban-summary?limit=2&cursor=' + encodeURIComponent(first.body.pageInfo.nextCursor));
    assert.equal(next.status, 200); assert.ok(next.body.items.every(item => !first.body.items.some(previous => previous.id === item.id)));
    assert.equal((await request(AP, '/orders/kanban-summary?cursor=tampered')).status, 400);
    assert.equal((await request(AP, '/orders/calendar-summary?unscheduled=true&from=2026-10-01')).status, 400);
    const calendar = await request(AV, '/orders/calendar-summary?from=2026-10-26&to=2026-10-26&limit=100');
    assert.equal(calendar.status, 200); assert.ok(calendar.body.items.length > 0);
    assert.ok(calendar.body.items.every(item => item.dueDate?.startsWith('2026-10-26')));
    for (const item of calendar.body.items) for (const key of ['paymentStatus', 'paymentStatusId', 'id_auth0', 'pin_hash', 'pin_salt']) assert.equal(Object.hasOwn(item, key), false);
  });
  await t.test('phase04 SQL transaction rolls back stage, audit and messages when notification insertion fails', async () => {
    const failing = db.$extends({ query: { mensaje: { create() { throw Error('Synthetic notification failure'); } } } });
    const failingService = new OrderService({ prisma: failing });
    for (const review of [false, true]) {
      const stage = review ? 1 : 2;
      const row = await order({ stage, finished: true });
      // Same production transaction boundary, with only the notification insert faulted.
      const action = review ? failingService.sendToReview(row.id_pedido, 'Synthetic review', { auth0UserId: actors.get(D).sub })
        : failingService.updGeneralStep(row.id_pedido, 3, { identityProvider: 'keycloak', role: D,
          permissions: ['move:orders'], actor: { idUsuario: actors.get(D).id } });
      await assert.rejects(action, /Synthetic notification failure/);
      assert.equal((await db.pedidos.findUnique({ where: { id_pedido: row.id_pedido } })).id_estado_pedido, states[stage].id_estado_pedido);
      assert.equal((await records(row.id_pedido)).length, 0);
      assert.equal(await db.mensaje.count({ where: { id_pedido: row.id_pedido } }), 0);
    }
  });
  console.log('PHASE04_PRODUCTION:EXECUTED roles=9 operations=18 decisions=162 realPIN=true businessSQL=true; check TAP result');
}

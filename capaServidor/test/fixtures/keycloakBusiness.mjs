import assert from 'node:assert/strict';
import express from 'express';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import OrderService from '../../src/modules/orders/service/order.service.js';
import OrderController from '../../src/modules/orders/controller/orders.controller.js';
import { createOrderRouter } from '../../src/modules/orders/routes/order.routes.js';
import { createPaymentStatusRouter as createClientRouter } from '../../src/modules/clients/routes/clients.routes.js';
import { createProductTypeRouter } from '../../src/modules/products/routes/product.routes.js';
import { createOrderHistoryRouter } from '../../src/modules/history/routes/orderHistory.routes.js';
import { createMetricsRouter } from '../../src/modules/metrics/routes/metrics.routes.js';
import { createMessageRouter } from '../../src/modules/messages/routes/message.routes.js';
import { createAuthRouter } from '../../src/modules/auth/routes/auth.routes.js';
import { createPrivacyRouter } from '../../src/modules/privacy/routes/privacy.routes.js';
import { createIncidentReportRouter } from '../../src/modules/security/routes/incidentReport.routes.js';
import { createRequirePin } from '../../src/middlewares/requirePin.js';
import { UserRepository } from '../../src/modules/users/repo/users.repo.js';
import PrivacyController from '../../src/modules/privacy/controller/privacy.controller.js';
import PrivacyRequestService from '../../src/modules/privacy/service/privacyRequest.service.js';
import IncidentReportController from '../../src/modules/security/controller/incidentReport.controller.js';
import IncidentReportService from '../../src/modules/security/service/incidentReport.service.js';

export async function runBusinessRegression(t, { db, authenticate, users, actors, pins }) {
  assert.equal(process.env.RUN_KEYCLOAK_BUSINESS_INTEGRATION, 'true');
  assert.equal(process.env.APP_ENV, 'test');
  assert.equal(process.env.DB_HOST, 'phase02-mysql');
  assert.equal(process.env.DB_NAME, 'itecsa_identity_phase02_test');
  // Reuse the legitimate in-memory PINs obtained before acknowledgement in phase 04.
  // Acknowledged PINs must not be revealed again or reset to accommodate a fixture.
  assert.equal(actors?.size, 9);
  assert.ok(pins);
  const roles = ['Administrador Produccion', 'Administrador Ventas', 'Administrador Cobranzas', 'Operario Produccion',
    'Operario Ventas', 'Operario Cobranzas', 'Gerencia', 'Desarrollador', 'Soporte'];
  const [AP, AV, AC, OP, OV, OC, G, D, S] = roles;
  const sales = [AV, OV, D], collection = [AC, OC, D], review = [AC, D], business = roles.filter(role => role !== S);
  const fixturePath = '/app/capaServidor/data/demo/sales-notes-fixture.json';
  const previousFixture = readFileSync(fixturePath);
  const previousSource = process.env.SALES_NOTE_SOURCE;
  const notes = roles.map((_role, index) => ({ numeroNota: String(950500 + index),
    cliente: { RUT: String(11000000 + index) + '-1', CLIENTE: 'Synthetic Phase05 ' + index },
    usuarioOrigenManager: 'Synthetic fixture, not Manager',
    items: [{ codigo: 'B05-CARD', producto: 'Synthetic Card', cantidad: 100, familia: 'TARJETAS', subfamilia: 'TARJETAS', importable: true }],
  }));
  // Only the ephemeral container's writable image layer: never mount/modify host data.
  writeFileSync(fixturePath, JSON.stringify(notes));
  process.env.SALES_NOTE_SOURCE = 'fixture';
  t.after(() => { writeFileSync(fixturePath, previousFixture);
    if (previousSource === undefined) delete process.env.SALES_NOTE_SOURCE; else process.env.SALES_NOTE_SOURCE = previousSource; });
  const service = new OrderService({ prisma: db });
  const customer = await db.cliente.create({ data: { nombre_cliente: 'Synthetic B05 isolation' } });
  const product = await db.tipo_Producto.findFirst({ where: { nombre_producto: 'Tarjeta' } });
  const states = await db.estado_Pedido.findMany({ orderBy: { orden_kanban: 'asc' } });
  let rejected = await db.estado_Pago.findFirst({ where: { nombre_estado_pago: 'Rechazado' } });
  rejected ??= await db.estado_Pago.create({ data: { nombre_estado_pago: 'Rechazado' } });
  let serial = 0;
  const order = (payment = 1, stage = 0, note = 'B05-' + (++serial)) => db.pedidos.create({ data: {
    numero_nota_venta: note, id_usuario: actors.get(AV).id, id_cliente: customer.id_cliente, id_estado_pago: payment,
    id_estado_pedido: states[stage].id_estado_pedido, fecha_creacion: new Date('2026-10-10'),
    Detalle_pedido: { create: { id_tipo_producto: product.id_tipo_producto, cantidad: 100, id_estado_subproceso: 8401 } },
  } });
  const app = express(); app.use(express.json());
  app.use('/orders', createOrderRouter({ authenticate, validatePin: createRequirePin({ pins }), controller: new OrderController({ service }) }));
  app.use('/clients', createClientRouter({ authenticate }));
  app.use('/products', createProductTypeRouter({ authenticate }));
  app.use('/history', createOrderHistoryRouter({ authenticate }));
  app.use('/metrics', createMetricsRouter({ authenticate }));
  app.use('/messages', createMessageRouter({ authenticate }));
  app.use('/auth', createAuthRouter({ authenticate, pins, users: new UserRepository({ prisma: db }), includeDebugRoutes: true }));
  app.use('/privacy', createPrivacyRouter({ authenticate }));
  app.use('/incidents', createIncidentReportRouter({ authenticate }));
  const deliveries = [];
  const delivery = { async send(payload) { deliveries.push(payload); return 'synthetic-provider-' + deliveries.length; } };
  const channel = { PRIVACY_REQUEST_PROVIDER: 'resend', SECURITY_INCIDENT_PROVIDER: 'resend',
    PRIVACY_REQUEST_RECIPIENT: 'privacy@example.invalid', PRIVACY_REQUEST_FROM: 'sender@example.invalid',
    SECURITY_INCIDENT_RECIPIENT: 'security@example.invalid', SECURITY_INCIDENT_FROM: 'sender@example.invalid',
    RESEND_API_KEY: 'synthetic-not-a-real-key', RATE_LIMIT_SECRET: 'synthetic-business-digest-only' };
  app.use('/privacy-enabled', createPrivacyRouter({ authenticate,
    controller: new PrivacyController({ service: new PrivacyRequestService({ env: channel, delivery }) }) }));
  app.use('/incidents-enabled', createIncidentReportRouter({ authenticate,
    controller: new IncidentReportController({ service: new IncidentReportService({ env: channel, delivery }) }) }));
  app.use((error, _req, res, _next) => res.status(error.status || error.statusCode || 500).json({ code: error.code || 'TEST_ERROR' }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = 'http://127.0.0.1:' + server.address().port;
  async function request(role, path, body, method = body === undefined ? 'GET' : 'POST') {
    const response = await fetch(base + path, { method, headers: { authorization: 'Bearer ' + actors.get(role).token,
      'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  }
  const records = id => db.registros.findMany({ where: { id_pedido: id }, orderBy: { ID_REGISTRO: 'asc' } });
  let decisions = 0, permitted = 0, denied = 0;
  function decision(result, allowed, role, operation, success = 200) {
    decisions++; allowed ? permitted++ : denied++;
    assert.equal(result.status, allowed ? success : 403, operation + ' ' + role + ': ' + JSON.stringify(result.body));
  }
  for (const role of roles) await t.test('phase05 role ' + role + ': real modules and SQL', async () => {
    const reads = [
      ['/orders/sales-notes/' + notes[roles.indexOf(role)].numeroNota, sales],
      ['/clients/' + customer.id_cliente, sales], ['/products', business], ['/orders/payments', collection],
      ['/history/orders?limit=2', business], ['/metrics/summary?from=2026-10-01&to=2026-10-31', [AP, G, D]],
      ['/metrics/production-performance?from=2026-10-01&to=2026-10-31', [AP, G, D]],
      ['/messages', roles], ['/messages/notifications', roles], ['/auth/verify', roles],
    ];
    for (const [path, allowed] of reads) decision(await request(role, path), allowed.includes(role), role, path);
    assert.equal((await request(role, '/auth/verify')).body.email, users[roles.indexOf(role)].username + '@example.invalid');
    decision(await request(role, '/auth/pin/debug-reset', {}), false, role, 'debug PIN');
    const note = notes[roles.indexOf(role)].numeroNota;
    const created = await request(role, '/orders', { numeroNota: note, id_usuario: actors.get(S).id, actorId: actors.get(S).id });
    decision(created, sales.includes(role), role, 'sales create', 201);
    if (sales.includes(role)) {
      const persisted = await db.pedidos.findUnique({ where: { id_pedido: created.body.id } });
      assert.equal(persisted.id_usuario, actors.get(role).id);
      assert.equal((await records(persisted.id_pedido))[0].id_usuario, actors.get(role).id);
      const notifications = await db.mensaje.findMany({ where: { id_pedido: persisted.id_pedido }, include: { MENSAJE_USUARIO: true } });
      assert.equal(notifications.length, 2);
      const recipients = await db.usuario.findMany({ where: { rol_usuario: { in: [AP, AC] }, NOT: { estado_usuario: 'Desvinculado' } } });
      assert.deepEqual(notifications.flatMap(message => message.MENSAJE_USUARIO.map(link => link.id_usuario)).sort(),
        recipients.map(user => user.id_usuario).sort());
      assert.equal((await request(role, '/orders', { numeroNota: note })).status, 409);
      await db.pedidos.update({ where: { id_pedido: persisted.id_pedido }, data: { id_estado_pedido: states[6].id_estado_pedido } });
      const result = await request(role, '/orders/' + persisted.id_pedido + '/reevaluate', {}, 'PATCH');
      decision(result, true, role, 'reevaluate');
      assert.equal((await records(persisted.id_pedido)).at(-1).id_usuario, actors.get(role).id);
    } else {
      const row = await order(1, 6);
      decision(await request(role, '/orders/' + row.id_pedido + '/reevaluate', {}, 'PATCH'), false, role, 'reevaluate');
      assert.equal((await records(row.id_pedido)).length, 0);
    }
    for (const [resolved, allowed] of [[false, collection], [true, review]]) {
      const row = await order(resolved ? 2 : 1);
      const response = await request(role, '/orders/' + row.id_pedido + '/payment-status',
        { paymentStatusId: resolved ? rejected.id_estado_pago : 2, observacion: 'B05 private payment observation',
          pin: actors.get(role).pin, actor: { idUsuario: actors.get(S).id } }, 'PATCH');
      decision(response, allowed.includes(role), role, resolved ? 'review payment' : 'ordinary payment');
      const logs = await records(row.id_pedido);
      assert.equal(logs.length, allowed.includes(role) ? 1 : 0);
      if (logs.length) assert.equal(logs[0].id_usuario, actors.get(role).id);
      assert.equal((await db.pedidos.findUnique({ where: { id_pedido: row.id_pedido } })).id_usuario, actors.get(AV).id);
    }
  });
  await t.test('phase05 ownership: read/hide/clear/notifications never affect another local subject', async () => {
    const message = await db.mensaje.create({ data: { Asunto: 'B05 personal support', contenido: 'Synthetic own message',
      fecha_publicacion: new Date(), MENSAJE_USUARIO: { create: { id_usuario: actors.get(S).id, leido_: false, oculto_: false } } } });
    for (const path of ['/messages/' + message.id_mensaje, '/messages/' + message.id_mensaje + '/read',
      '/messages/notifications/' + message.id_mensaje]) {
      const result = await request(D, path, path.endsWith('/read') || path.includes('/notifications/') ? {} : undefined,
        path.endsWith('/read') || path.includes('/notifications/') ? 'PATCH' : 'GET');
      assert.equal(result.status, 404);
    }
    assert.equal((await request(S, '/messages/' + message.id_mensaje)).status, 200);
    assert.equal((await request(S, '/messages/' + message.id_mensaje + '/read', {}, 'PATCH')).status, 200);
    assert.equal((await request(S, '/messages/notifications', {}, 'PATCH')).status, 200);
    assert.equal((await request(S, '/messages/notifications')).body.unreadCount, 0);
  });
  await t.test('phase05 PIN and payment boundaries, duplicate concurrency and rollback', async () => {
    const row = await order();
    const path = '/orders/' + row.id_pedido + '/payment-status';
    for (const [body, status] of [[{ paymentStatusId: 2 }, 400], [{ paymentStatusId: 2, pin: actors.get(OC).pin }, 403]]) {
      assert.equal((await request(AC, path, body, 'PATCH')).status, status);
      assert.equal((await records(row.id_pedido)).length, 0);
    }
    const responses = await Promise.all([AC, D].map(role => request(role, path,
      { paymentStatusId: 2, pin: actors.get(role).pin }, 'PATCH')));
    assert.ok(responses.every(response => [200, 409].includes(response.status)));
    assert.equal((await records(row.id_pedido)).length, 1);
    const protectedOrder = await order(2);
    assert.equal((await request(OC, '/orders/' + protectedOrder.id_pedido + '/payment-status',
      { paymentStatusId: rejected.id_estado_pago, pin: actors.get(OC).pin, observacion: 'not authorized' }, 'PATCH')).status, 403);
    assert.equal((await request(AC, '/orders/' + protectedOrder.id_pedido + '/payment-status',
      { paymentStatusId: 1, pin: actors.get(AC).pin, observacion: 'cannot reopen pending' }, 'PATCH')).status, 409);
    const failing = db.$extends({ query: { mensaje: { create() { throw Error('B05 notification failure'); } } } });
    const failedOrder = await order();
    await assert.rejects(new OrderService({ prisma: failing }).updPaymentState(failedOrder.id_pedido, 2,
      { actor: { idUsuario: actors.get(AC).id }, identityProvider: 'keycloak', role: AC, permissions: ['update:payment-status'] }), /B05 notification failure/);
    assert.equal((await records(failedOrder.id_pedido)).length, 0);
    assert.equal((await db.pedidos.findUnique({ where: { id_pedido: failedOrder.id_pedido } })).id_estado_pago, 1);
  });
  await t.test('phase05 history redacts financial observations and retains historical actor and cursor', async () => {
    const row = await order();
    await request(AC, '/orders/' + row.id_pedido + '/payment-status',
      { paymentStatusId: 2, pin: actors.get(AC).pin, observacion: 'B05 restricted observation' }, 'PATCH');
    await request(AC, '/orders/' + row.id_pedido + '/payment-status',
      { paymentStatusId: rejected.id_estado_pago, pin: actors.get(AC).pin, observacion: 'B05 restricted observation revision' }, 'PATCH');
    for (const role of roles) {
      const result = await request(role, '/history/orders/' + row.id_pedido + '?limit=1');
      assert.equal(result.status, role === S ? 403 : 200);
      if (role === S) continue;
      assert.equal(JSON.stringify(result.body).includes('B05 restricted observation'), collection.includes(role));
      if (collection.includes(role)) assert.ok(result.body.events[0].responsible);
      assert.equal(result.body.pageInfo.hasMore, true);
      const next = await request(role, '/history/orders/' + row.id_pedido + '/events?limit=1&cursor=' + encodeURIComponent(result.body.pageInfo.nextCursor));
      assert.equal(next.status, 200); assert.notEqual(next.body.events[0].id, result.body.events[0].id);
      assert.equal(JSON.stringify(next.body).includes('B05 restricted observation'), collection.includes(role));
      assert.equal((await request(role, '/history/orders/' + row.id_pedido + '/events?cursor=tampered')).status, 400);
    }
  });
  await t.test('phase05 sales concurrency and SQL rollback preserve a single original actor', async () => {
    const note = notes[0].numeroNota;
    const results = await Promise.all([AV, D].map(role => request(role, '/orders', { numeroNota: note })));
    assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
    const persisted = await db.pedidos.findUnique({ where: { numero_nota_venta: note } });
    assert.ok([actors.get(AV).id, actors.get(D).id].includes(persisted.id_usuario));
    assert.equal((await records(persisted.id_pedido)).length, 1);
    const failing = db.$extends({ query: { mensaje: { create() { throw Error('B05 sales notification failure'); } } } });
    await assert.rejects(new OrderService({ prisma: failing }).createOrder({ numeroNota: notes[3].numeroNota },
      { auth0UserId: actors.get(D).sub }), /B05 sales notification failure/);
    assert.equal(await db.pedidos.count({ where: { numero_nota_venta: notes[3].numeroNota } }), 0);
    await db.cliente.create({ data: { rut_cliente: notes[3].cliente.RUT, nombre_cliente: notes[3].cliente.CLIENTE } });
    const duplicate = await Promise.all([AV, D].map(role => request(role, '/orders', { numeroNota: notes[3].numeroNota })));
    assert.deepEqual(duplicate.map(result => result.status).sort(), [201, 409]);
    assert.equal(await db.pedidos.count({ where: { numero_nota_venta: notes[3].numeroNota } }), 1);
  });
  await t.test('phase05 metrics SQL produces known aggregates and validates filters', async () => {
    const row = await order(2, 2);
    await db.pedidos.update({ where: { id_pedido: row.id_pedido }, data: { fecha_creacion: new Date('2025-03-02') } });
    await db.detalle_pedido.updateMany({ where: { id_pedido: row.id_pedido }, data: { fecha_real_termino: new Date('2025-03-03'), cantidad: 17 } });
    for (const role of [AP, G, D]) {
      const result = await request(role, '/metrics/summary?from=2025-03-01&to=2025-03-04');
      assert.equal(result.status, 200); assert.equal(result.body.production.total, 17);
      assert.equal((await request(role, '/metrics/summary?from=2026-02-30&to=2026-03-01')).status, 400);
    }
  });
  await t.test('phase05 privacy/incidents use local email; disabled delivery is an explicit external dependency', async () => {
    const privacy = { requestId: randomUUID(), type: 'access', subject: 'Synthetic request', description: 'Synthetic privacy request description for this test.' };
    const incident = { reportId: randomUUID(), module: 'other', observedAt: '2026-10-24T12:00:00.000Z',
      description: 'Synthetic incident report description for this test.' };
    for (const role of roles) {
      assert.equal((await request(role, '/incidents/config')).status, 200);
      assert.equal((await request(role, '/incidents/config')).body.contactEmail, users[roles.indexOf(role)].username + '@example.invalid');
      assert.equal((await request(role, '/privacy/requests', { ...privacy, email: 'foreign@example.invalid' })).status, 400);
      // Authenticated, valid subject, but no external email channel is enabled in this laboratory.
      const response = await request(role, '/privacy/requests', privacy);
      assert.equal(response.status, 503, JSON.stringify(response));
      const report = await request(role, '/incidents', incident);
      assert.equal(report.status, 503, JSON.stringify(report));
    }
  });
  await t.test('phase05 privacy/incident SQL binds subjects and deduplicates; only external delivery is doubled', async () => {
    const privacy = { requestId: randomUUID(), type: 'access', subject: 'Synthetic request', description: 'Private synthetic description.' };
    const first = await request(S, '/privacy-enabled/requests', privacy);
    assert.equal(first.status, 200, JSON.stringify(first));
    assert.equal((await request(S, '/privacy-enabled/requests', privacy)).status, 200);
    assert.equal((await request(AC, '/privacy-enabled/requests', privacy)).status, 409);
    const row = await db.privacySubmission.findUnique({ where: { id: privacy.requestId } });
    assert.equal(row.user_id, actors.get(S).id); assert.equal(row.status, 'sent');
    assert.equal(deliveries.length, 1); assert.equal(deliveries[0].request.email, users[8].username + '@example.invalid');
    const incident = { reportId: randomUUID(), module: 'other', observedAt: '2026-10-24T12:00:00.000Z', description: 'Synthetic incident description.' };
    assert.equal((await request(S, '/incidents-enabled', incident)).status, 200);
    assert.equal((await request(S, '/incidents-enabled', incident)).status, 200);
    assert.equal(deliveries.length, 2);
    const audit = await db.securityAuditEvent.findMany({ where: { resource_id: incident.reportId } });
    assert.ok(audit.length >= 2); assert.ok(audit.every(event => event.actor_user_id === actors.get(S).id));
  });
  await t.test('phase05 unavailable source and unauthenticated callers fail without business writes', async () => {
    const before = await db.pedidos.count();
    assert.equal((await fetch(base + '/orders/payments')).status, 401);
    assert.equal((await fetch(base + '/messages', { headers: { authorization: 'Bearer malformed' } })).status, 401);
    process.env.SALES_NOTE_SOURCE = 'unavailable';
    try {
      assert.equal((await request(AV, '/orders/sales-notes/' + notes[4].numeroNota)).status, 503);
      assert.equal((await request(S, '/orders/sales-notes/' + notes[4].numeroNota)).status, 403);
    } finally { process.env.SALES_NOTE_SOURCE = 'fixture'; }
    assert.equal(await db.pedidos.count(), before);
  });
  console.log('PHASE05_BUSINESS:EXECUTED decisions=' + decisions + ' permitted=' + permitted + ' denied=' + denied + '; realJWT=true realPIN=true realSQL=true; check TAP');
}

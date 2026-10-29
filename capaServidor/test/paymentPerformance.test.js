import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { readPaymentPage, readPaymentCounts } from '../src/modules/orders/repo/paymentWorkspaceRead.repo.js';
import { listPaymentViewsOperation } from '../src/modules/orders/repo/orderViewOperations.js';
import OrderService from '../src/modules/orders/service/order.service.js';
import OrderController from '../src/modules/orders/controller/orders.controller.js';
import PaymentRecordService from '../src/modules/payments/service/paymentRecord.service.js';
import PaymentStatusRepo from '../src/modules/payments/repo/paymentStatus.repo.js';
import { createOrderRouter } from '../src/modules/orders/routes/order.routes.js';
import { createRequirePin } from '../src/middlewares/requirePin.js';
import { PinServiceError } from '../src/modules/auth/service/pin.service.js';
import { ROLES, ROLE_PERMISSIONS, ROLES_CLAIM, PERMISSIONS as P } from '../../shared/authorization.js';
import { paymentWorkflowFixture } from '../scripts/fixtures/paymentWorkflowFixture.mjs';

const options = { actor: { idUsuario: 9 }, identityProvider: 'keycloak', role: ROLES.ADMIN_COBRANZAS,
  permissions: [P.UPDATE_PAYMENT_STATUS, P.REVISE_PAYMENT_STATUS], observacion: 'Synthetic review reason' };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('page binds all partial search fields, dates, status, cursor and limit without OFFSET', async () => {
  let query;
  const input = "%' OR 1=1 --";
  const from = new Date('2026-01-01'), to = new Date('2026-02-01');
  const rows = [{ id_pedido: 10 }];
  assert.equal(await readPaymentPage({ $queryRaw: async q => { query = q; return rows; } },
    { limit: 50, cursor: { id: 99 }, search: input, status: 'Pendiente', from, to }), rows);
  assert.ok(!query.sql.includes(input)); assert.ok(!query.sql.includes('OFFSET'));
  assert.equal(query.values.filter(v => v === `%${input}%`).length, 4);
  assert.ok(query.values.includes(from)); assert.ok(query.values.includes(to));
  assert.deepEqual(query.values.slice(-3), [99, 'Pendiente', 51]);
  assert.match(query.sql, /ORDER BY p.id_pedido DESC LIMIT/);
});

test('one grouped count keeps zeroes, BigInt conversion and ignores selected status/cursor', async () => {
  let query;
  const counts = await readPaymentCounts({ $queryRaw: async q => { query = q;
    return [{ pending: 12n, confirmed: 3n, rejected: null }]; } },
  { status: 'Rechazado', cursor: { id: 91 }, search: 'sample' });
  assert.deepEqual(counts, { pending: 12, rejected: 0, confirmed: 3 });
  assert.ok(!query.values.includes(91)); assert.ok(!query.values.includes('Rechazado'));
  assert.match(query.sql, /SUM\(s.nombre_estado_pago = 'Pendiente'\)/);
});

test('numbered payment pages bind their offset and preserve the selected filters', async () => {
  let query;
  await readPaymentPage({ $queryRaw: async statement => { query = statement; return []; } },
    { page: 3, limit: 20, status: 'Pendiente', search: 'Cliente' });
  assert.match(query.sql, /ORDER BY p.id_pedido DESC LIMIT \?\s+OFFSET \?/);
  assert.deepEqual(query.values.slice(-3), ['Pendiente', 21, 40]);
  assert.equal(query.values.filter(value => value === '%Cliente%').length, 4);
});

test('numbered payment pages accept all UI sizes and reject invalid page numbers', async () => {
  let args;
  const service = new OrderService({ repo: { listPaymentViews: async filters => { args = filters; return { rows: [], counts: {} }; } },
    paymentRepo: { getAll: async () => [] } });
  for (const size of [10, 20, 30, 40, 50]) {
    await service.getPagedPaymentWorkspace({ page: '3', limit: String(size), status: 'Pendiente' });
    assert.equal(args.limit, size); assert.equal(args.page, 3); assert.equal(args.cursor, null);
  }
  for (const page of ['0', '-1', '1.5', 'invalid', String(Number.MAX_SAFE_INTEGER)]) {
    await assert.rejects(service.getPagedPaymentWorkspace({ page, limit: 50 }), /Pagina de pagos no valida/);
  }
});

test('page and grouped summary execute concurrently; partial modes do exactly requested work', async () => {
  const holds = [deferred(), deferred()]; let calls = 0;
  const repo = { client: { $queryRaw: () => holds[calls++].promise } };
  const work = listPaymentViewsOperation(repo, { limit: 2 });
  assert.equal(calls, 2); holds[0].resolve([]); holds[1].resolve([]);
  assert.deepEqual(await work, { rows: [], counts: { pending: 0, rejected: 0, confirmed: 0 } });
  const statements = [];
  repo.client.$queryRaw = async q => { statements.push(q.sql); return []; };
  assert.deepEqual(await listPaymentViewsOperation(repo, { limit: 2, includeSummary: false }), { rows: [], counts: null });
  assert.equal(statements.length, 1); assert.ok(!statements[0].includes('SUM'));
  statements.length = 0;
  await listPaymentViewsOperation(repo, { limit: 2, summaryOnly: true });
  assert.equal(statements.length, 1); assert.match(statements[0], /SUM/);
});

test('workspace preserves default contract, inclusive UTC day and strict validation; page skips catalog', async () => {
  let args, catalogCalls = 0;
  const service = new OrderService({ repo: { listPaymentViews: async filters => { args = filters; return { rows: [], counts: {} }; } },
    paymentRepo: { getAll: async () => { catalogCalls++; return []; } } });
  const result = await service.getPagedPaymentWorkspace({ from: '2026-09-06', to: '2026-09-06' });
  assert.deepEqual(result.pageInfo, { limit: 50, nextCursor: null, hasMore: false });
  assert.equal(args.from.toISOString(), '2026-09-06T00:00:00.000Z');
  assert.equal(args.to.toISOString(), '2026-09-07T00:00:00.000Z');
  await service.getPagedPaymentWorkspace({ includeSummary: 'false', search: '  sample  ' });
  assert.equal(catalogCalls, 1); assert.equal(args.includeSummary, false); assert.equal(args.search, 'sample');
  for (const invalid of [{ status: 'Other' }, { from: '2026-02-30' }, { from: '2026-12-02', to: '2026-12-01' }, { cursor: 'invalid' }]) {
    await assert.rejects(service.getPagedPaymentWorkspace(invalid));
  }
});

test('catalog shares concurrent reads, retains five-minute TTL and retries failures', async () => {
  let calls = 0; const hold = deferred();
  const repo = new PaymentStatusRepo({ prisma: { estado_Pago: { findMany: () => { calls++; return hold.promise; } } } });
  const a = repo.getAll(), b = repo.getAll(); assert.equal(calls, 1);
  hold.resolve([{ id_estado_pago: 1, nombre_estado_pago: 'Pendiente' }]);
  assert.deepEqual(await a, await b); await repo.getAll(); assert.equal(calls, 1);
  assert.equal((await repo.get(1)).nombre_estado_pago, 'Pendiente');
  let fails = true;
  const retry = new PaymentStatusRepo({ prisma: { estado_Pago: { findMany: async () => { if (fails) throw Error('Unavailable'); return []; } } } });
  await assert.rejects(retry.getAll()); fails = false; assert.deepEqual(await retry.getAll(), []);
});

for (const target of [2, 3]) test(`pending decision ${target} preserves lock, audit, commit and distinct notifications`, async () => {
  const f = paymentWorkflowFixture();
  const result = await f.service.updPaymentState(1, target, options);
  assert.equal(result.id_estado_pago, target); assert.equal(f.state.decisions.length, 1);
  assert.equal(f.state.decisions[0].id_estado_pago_anterior, 1);
  assert.equal(f.state.decisions[0].id_estado_pago_nuevo, target);
  assert.equal(f.state.records[0].id_usuario, 9); assert.ok(f.state.records[0].FECHA_HORA instanceof Date);
  assert.equal(f.state.messages.length, target === 2 ? 1 : 0);
  assert.equal(f.state.recipients.length, target === 2 ? 2 : 0);
  assert.equal(f.state.stage, target === 2 ? 1 : 0);
  const begin = f.events.indexOf('begin'); assert.equal(f.events[begin + 1], 'lock'); assert.equal(f.events[begin + 2], 'payment-read');
  assert.equal(f.events.at(-1), 'commit'); assert.ok(!f.events.includes('discarded-audit-hydration'));
  await f.service.updPaymentState(1, target, options);
  assert.equal(f.state.decisions.length, 1); assert.equal(f.state.messages.length, target === 2 ? 1 : 0);
});

for (const targets of [[2, 2], [3, 3], [2, 3], [3, 2]]) test(`concurrent decisions ${targets} serialize and never duplicate financial history`, async () => {
  const f = paymentWorkflowFixture({ delayMs: 1 });
  const results = await Promise.allSettled(targets.map(target => f.service.updPaymentState(1, target, options)));
  assert.equal(f.state.decisions.length, 1); assert.equal(f.state.records.length, 1);
  assert.equal(f.state.payment, targets[0]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, targets[0] === targets[1] ? 2 : 1);
  if (targets[0] !== targets[1]) assert.equal(results[1].reason.statusCode, 409);
});

for (const stage of [1, 2, 3]) test(`confirmed-to-rejected revision at stage ${stage} preserves production consequences`, async () => {
  const f = paymentWorkflowFixture({ payment: 2, stage });
  await f.service.updPaymentState(1, 3, options);
  assert.equal(f.state.stage, stage === 1 ? 5 : stage);
  assert.equal(f.state.decisions[0].id_estado_pago_anterior, 2);
  assert.equal(f.state.messages.length, stage <= 2 ? 1 : 0);
  if (stage === 1) assert.match(f.state.messages[0].Asunto, /cancelado/);
  if (stage === 2) assert.match(f.state.messages[0].Asunto, /requerida/);
});

test('revision requires special capability and reason; resolved payments cannot return to pending', async () => {
  for (const [target, changes, code] of [[3, { permissions: [P.UPDATE_PAYMENT_STATUS] }, 403],
    [3, { observacion: '  ' }, 400], [1, {}, 409]]) {
    const f = paymentWorkflowFixture({ payment: 2, stage: 1 });
    await assert.rejects(f.service.updPaymentState(1, target, { ...options, ...changes }), { statusCode: code });
    assert.equal(f.state.decisions.length, 0);
  }
  const f = paymentWorkflowFixture({ payment: 3 });
  await f.service.updPaymentState(1, 2, options); assert.equal(f.state.stage, 1); assert.equal(f.state.messages.length, 1);
});

for (const fail of ['order-update', 'audit-insert', 'decision-insert', 'message-insert', 'recipient-insert']) test(`SQL failure ${fail} rolls back decision, stage, audit and durable notifications`, async () => {
  const f = paymentWorkflowFixture({ fail });
  await assert.rejects(f.service.updPaymentState(1, 2, options));
  assert.equal(f.state.payment, 1); assert.equal(f.state.stage, 0);
  assert.equal(f.state.records.length + f.state.decisions.length + f.state.messages.length + f.state.recipients.length, 0);
  assert.equal(f.events.at(-1), 'rollback');
});

test('preview keeps snapshot products exact and fetches source only when necessary', async () => {
  let sources = 0;
  const order = { id_pedido: 1, numero_nota_venta: 'SYNTH', Cliente: { razon_social: 'Synthetic' },
    Usuario: { id_usuario: 9, nombre_usuario: 'Test', apellido_usuario: 'Actor' },
    Detalle_pedido: [{ id_detalle_pedido: 10, cantidad: 0, linea_origen: '1', producto_origen: 'Snapshot', codigo_origen: 'Code', Tipo_Producto: { nombre_producto: 'Tarjeta' } }] };
  const service = new PaymentRecordService({ repo: { getConfirmationSource: async () => order },
    salesNoteSourceService: { getByNumber: async () => { sources++; return { items: [{ tipoProducto: 'Tarjeta', cantidad: 0, producto: 'Source', codigo: 'Other' }] }; } } });
  const preview = await service.getConfirmationDetails(1);
  assert.equal(sources, 0); assert.equal(preview.products[0].product, 'Snapshot'); assert.equal(preview.products[0].quantity, 0);
  assert.equal(preview.sellerName, 'Test Actor');
  delete order.Detalle_pedido[0].linea_origen;
  assert.equal((await service.getConfirmationDetails(1)).products[0].product, 'Source'); assert.equal(sources, 1);
  await assert.rejects(service.getConfirmationDetails('invalid'), { statusCode: 400 });
});

test('payment controller waits for committed service result and keeps public DTO', async () => {
  const hold = deferred(); let status;
  const controller = new OrderController({ service: { updPaymentState: () => hold.promise } });
  const res = { status: code => { status = code; return res; }, json: payload => payload };
  const work = controller.updatePaymentStatus({ params: { orderId: '1' }, body: { paymentStatusId: 2 }, pinActor: options.actor }, res);
  assert.equal(status, undefined);
  hold.resolve({ id_pedido: 1, estado_pago: 'Confirmado', id_estado_pago: 2 });
  const body = await work; assert.equal(status, 200); assert.equal(body.id, 1); assert.equal(body.paymentStatus, 'Confirmado');
  assert.equal(Object.hasOwn(body, 'pin'), false);
});

test('HTTP partial reads keep auth/capability; every payment mutation still requires a fresh valid PIN', async t => {
  let role = ROLES.ADMIN_COBRANZAS, mode = 'valid', writes = 0;
  const app = express(); app.use(express.json()); app.locals.errorLogger = { error() {} };
  const authenticate = (req, _res, next) => { req.identityProvider = 'keycloak'; req.auth = { payload: { sub: 'synthetic', [ROLES_CLAIM]: [role], permissions: ROLE_PERMISSIONS[role] } }; next(); };
  const validatePin = createRequirePin({ pins: { validate: async (_subject, pin) => {
    if (!pin) throw new PinServiceError('PIN_FORMAT_INVALID', 'Synthetic PIN missing');
    if (mode !== 'valid') throw new PinServiceError(mode, 'Synthetic PIN error'); return options.actor;
  } } });
  const controller = { getPaymentWorkspace: (_req, res) => res.json({ ok: true }), updatePaymentStatus: (req, res) => {
    writes++; assert.equal(req.pinActor.idUsuario, 9); assert.equal(req.body.pin, undefined); return res.json({ ok: true });
  } };
  app.use('/orders', createOrderRouter({ authenticate, validatePin, controller }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const url = `http://127.0.0.1:${server.address().port}/orders`;
  assert.equal((await fetch(url + '/payments?includeSummary=false')).status, 200);
  for (const [code, expected] of [['PIN_INVALID', 403], ['PIN_LOCKED', 423], ['PIN_NOT_ACKNOWLEDGED', 403]]) {
    mode = code;
    assert.equal((await fetch(url + '/1/payment-status', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin: '123456', paymentStatusId: 2 }) })).status, expected);
  }
  assert.equal(writes, 0); mode = 'valid';
  assert.equal((await fetch(url + '/1/payment-status', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin: '123456' }) })).status, 200);
  assert.equal((await fetch(url + '/1/payment-status', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 400);
  role = ROLES.GERENCIA;
  assert.equal((await fetch(url + '/1/payment-status', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin: '123456' }) })).status, 403);
  assert.equal(writes, 1);
});

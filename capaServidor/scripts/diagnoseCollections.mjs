// Explicit, bounded diagnostic. Never prints credentials, tokens, PINs or business rows.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import OrderService from '../src/modules/orders/service/order.service.js';
import PaymentRecordService from '../src/modules/payments/service/paymentRecord.service.js';
import PaymentRecordRepo from '../src/modules/payments/repo/paymentRecord.repo.js';
import { readPaymentCounts, readPaymentPage } from '../src/modules/orders/repo/paymentWorkspaceRead.repo.js';
import { resolveDatabaseConnection, createStrictTlsOptions } from '../src/database/connectionConfig.js';
import { toPaymentOrderDTO, toPaymentStatusDTO } from '../src/modules/orders/dto/order.dto.js';
import { ROLES, PERMISSIONS as P } from '../../shared/authorization.js';
import { supportsOrderSnapshots } from '../src/modules/orders/repo/orderSnapshotSchema.js';
import PaymentStatusRepo from '../src/modules/payments/repo/paymentStatus.repo.js';
import { measureCollectionsHttp } from './collectionsHttpProbe.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: path.join(root, 'capaServidor/.env'), quiet: true });
const arg = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const phase = arg('phase');
const fixture = arg('fixture');
if (!['before', 'after'].includes(phase) || !/^COB-TEST-\d{13}$/.test(fixture ?? '') ||
    !process.argv.includes('--allow-aiven-reads')) throw Error('EXPLICIT_DIAGNOSTIC_ARGUMENTS_REQUIRED');
const connection = resolveDatabaseConnection();
if (process.env.APP_ENV !== 'development' || connection.sslMode !== 'required' ||
    !connection.host.endsWith('.aivencloud.com')) throw Error('UNEXPECTED_DIAGNOSTIC_TARGET');
const writes = process.argv.includes('--allow-aiven-test-writes');
const output = { capturedAt: new Date().toISOString(), node: process.version, phase, fixture,
  environment: 'Windows Node to Aiven MySQL; strict TLS; pool 10; no Keycloak writes',
  methodology: '10 warm sequential samples; p95 withheld; service/SQL only until HTTP harness; no browser claim',
  samples: {}, checks: [], plans: {}, errors: [] };
const db = new PrismaClient({ adapter: new PrismaMariaDb({ host: connection.host, port: connection.port,
  user: connection.user, password: connection.password, database: connection.database,
  ssl: createStrictTlsOptions(connection.host, connection.ca), connectionLimit: 10,
  connectTimeout: 8000, socketTimeout: 15000 }), log: [{ emit: 'event', level: 'query' }] });
let trace = null;
db.$on('query', event => { if (trace) trace.push({ kind: event.query.trim().split(/\s/)[0], ms: event.duration }); });
const rounded = n => +n.toFixed(3);
async function sample(name, work, n = 10, warm = true) {
  if (warm) await work();
  const values = [];
  for (let i = 0; i < n; i++) {
    trace = []; const start = performance.now();
    try {
      const result = await work(i);
      values.push({ ms: rounded(performance.now() - start), sql: trace,
        bytes: Buffer.byteLength(JSON.stringify(result)),
        rows: Array.isArray(result) ? result.length : result?.items?.length ?? null });
    } finally { trace = null; }
  }
  const sorted = values.map(value => value.ms).sort((a, b) => a - b);
  output.samples[name] = { n, p50Ms: sorted.length % 2 ? sorted[(n - 1) / 2] : rounded((sorted[n / 2 - 1] + sorted[n / 2]) / 2),
    p95Ms: null, maxMs: sorted.at(-1), values };
  console.log(JSON.stringify({ series: name, n, p50Ms: output.samples[name].p50Ms, maxMs: sorted.at(-1) }));
}
const service = new OrderService({ prisma: db });
// Keep the production transaction boundary: do not inject service dependencies.
service.repo.prisma = db; service.paymentRepo.prisma = db;
const preview = new PaymentRecordService({ repo: new PaymentRecordRepo({ prisma: db }) });
const publicWorkspace = async query => {
  const result = await service.getPagedPaymentWorkspace(query);
  return { ...result, items: result.items.map(toPaymentOrderDTO), paymentStatuses: result.paymentStatuses.map(toPaymentStatusDTO) };
};
let stage = 'server';
try {
  const [server] = await db.$queryRaw`SELECT @@version AS version, @@require_secure_transport AS secureTransport`;
  const tls = await db.$queryRawUnsafe("SHOW SESSION STATUS LIKE 'Ssl_cipher'");
  assert.ok(tls[0]?.Value);
  output.server = { version: server.version, requireSecureTransport: Boolean(Number(server.secureTransport)), tlsSession: true };
  stage = 'catalog';
  const statuses = await db.estado_Pago.findMany();
  const ids = Object.fromEntries(statuses.map(row => [row.nombre_estado_pago, row.id_estado_pago]));
  for (const status of ['Pendiente', 'Confirmado', 'Rechazado']) assert.ok(ids[status]);
  let client = await db.cliente.findFirst({ where: { nombre_cliente: fixture }, select: { id_cliente: true } });
  stage = 'fixture';
  if (!client) {
    if (!writes || phase !== 'before') throw Error('FIXTURE_MISSING_WRITES_NOT_AUTHORIZED');
    const stage = await db.estado_Pedido.findFirst({ where: { orden_kanban: 0 } });
    assert.ok(stage);
    const snapshots = await supportsOrderSnapshots(db);
    client = await db.$transaction(async tx => {
      const customer = await tx.cliente.create({ data: { nombre_cliente: fixture, razon_social: fixture, estado_cliente: 'Prueba' }, select: { id_cliente: true } });
      const actor = await tx.usuario.create({ data: { nombre_usuario: fixture, apellido_usuario: 'Ficticio',
        rol_usuario: ROLES.ADMIN_COBRANZAS, estado_usuario: 'Desvinculado' }, select: { id_usuario: true } });
      const orders = Array.from({ length: 39 }, (_, index) => ({
        numero_nota_venta: `${fixture}-${String(index + 1).padStart(2, '0')}`,
        id_cliente: customer.id_cliente, id_usuario: actor.id_usuario, id_estado_pedido: stage.id_estado_pedido,
        id_estado_pago: index < 23 ? ids.Pendiente : index < 31 ? ids.Confirmado : ids.Rechazado,
        fecha_creacion: new Date(index % 2 ? '2026-09-06' : '2026-09-07'), observacion_interna: fixture,
      }));
      await tx.pedidos.createMany({ data: orders });
      const order = await tx.pedidos.findUnique({ where: { numero_nota_venta: `${fixture}-01` }, select: { id_pedido: true } });
      await tx.detalle_pedido.create({ data: { id_pedido: order.id_pedido, cantidad: 0,
        ...(snapshots ? { linea_origen: '1', producto_origen: `${fixture} Producto`, codigo_origen: 'SINTETICO' } : {}) }, select: { id_detalle_pedido: true } });
      return customer;
    }, { timeout: 20000, maxWait: 10000 });
    output.checks.push('fixture_committed_39_orders_1_customer_1_disabled_synthetic_actor_1_detail');
  }
  const orders = await db.pedidos.findMany({ where: { id_cliente: client.id_cliente,
    observacion_interna: fixture, numero_nota_venta: { startsWith: `${fixture}-` } }, orderBy: { id_pedido: 'desc' },
    select: { id_pedido: true, numero_nota_venta: true, id_estado_pago: true, fecha_creacion: true, id_usuario: true } });
  assert.equal(orders.length, 39);
  output.fixtureIds = { customer: client.id_cliente, actor: orders[0].id_usuario, orders: orders.map(row => row.id_pedido) };
  const filters = { search: fixture, from: '2026-09-06', to: '2026-09-07' };
  if (process.argv.includes('--cache-only')) {
    const previewId = orders.find(row => row.numero_nota_venta.endsWith('-01')).id_pedido;
    await measureCollectionsHttp({ db, output, sample, service, preview, previewId, fixture, cacheOnly: true });
  } else {
    stage = 'filter_equivalence';
    // Compare physical records, not HTTP 200, with every production parameter.
    if (!process.argv.includes('--measure-only')) {
      for (const status of ['Pendiente', 'Confirmado', 'Rechazado']) {
        for (const limit of [1, 10, 20, 30, 40, 50]) {
          const expected = orders.filter(row => row.id_estado_pago === ids[status]);
          const found = [];
          for (let page = 1; page <= Math.max(1, Math.ceil(expected.length / limit)); page++) {
            const result = await publicWorkspace({ ...filters, status, limit, page });
            assert.equal(result.counts.pending, orders.filter(row => row.id_estado_pago === ids.Pendiente).length);
            assert.equal(result.counts.confirmed, orders.filter(row => row.id_estado_pago === ids.Confirmado).length);
            assert.equal(result.counts.rejected, orders.filter(row => row.id_estado_pago === ids.Rechazado).length);
            found.push(...result.items.map(row => row.id));
          }
          assert.deepEqual(found, expected.map(row => row.id_pedido));
          assert.equal(new Set(found).size, found.length);
        }
      }
      for (const date of ['2026-09-06', '2026-09-07']) {
        const result = await publicWorkspace({ search: fixture, from: date, to: date, limit: 50 });
        assert.deepEqual(result.items.map(row => row.id), orders.filter(row => row.fecha_creacion.toISOString().startsWith(date)).map(row => row.id_pedido));
      }
      const empty = await publicWorkspace({ search: `${fixture}-ABSENT` });
      assert.equal(empty.items.length, 0); assert.deepEqual(empty.counts, { pending: 0, rejected: 0, confirmed: 0 });
      output.checks.push('3_statuses_6_sizes_all_numbered_pages_exact_counts_no_duplicates', 'inclusive_dates_and_empty_universe');
    }
    const previewId = orders.find(row => row.numero_nota_venta.endsWith('-01')).id_pedido;
    stage = 'samples';
    await sample('workspace_initial', () => publicWorkspace({ status: 'Pendiente', page: 1, limit: 10 }));
    await sample('workspace_filter', () => publicWorkspace({ ...filters, status: 'Pendiente', page: 1, limit: 10 }));
    await sample('page_only', () => publicWorkspace({ ...filters, status: 'Pendiente', page: 2, limit: 10, includeSummary: 'false' }));
    await sample('summary_only', () => publicWorkspace({ ...filters, summaryOnly: 'true' }));
    await sample('count_no_search', () => readPaymentCounts(db, {}));
    await sample('count_search', () => readPaymentCounts(db, { search: fixture }));
    await sample('catalog_warm', () => service.paymentRepo.getAll());
    await sample('catalog_cold', () => new PaymentStatusRepo({ prisma: db }).getAll());
    await sample('preview', () => preview.getConfirmationDetails(previewId));
    const planClient = { $queryRaw: query => db.$queryRawUnsafe(`EXPLAIN ${query.sql}`, ...query.values) };
    await readPaymentCounts({ $queryRaw: async query => { output.plans.countNoSearch = await planClient.$queryRaw(query); return []; } }, {});
    await readPaymentPage({ $queryRaw: async query => { output.plans.page = await planClient.$queryRaw(query); return []; } }, { limit: 10, page: 2, status: 'Pendiente', search: fixture });
    await readPaymentCounts({ $queryRaw: async query => {
      output.plans.countEngine = await db.$queryRawUnsafe(`EXPLAIN ANALYZE ${query.sql}`, ...query.values); return [];
    } }, {});
    if (process.argv.includes('--with-http')) {
      stage = 'http';
      await measureCollectionsHttp({ db, output, sample, service, preview, previewId, fixture });
    }
    if (writes) {
      stage = 'committed_rejections';
      // Only rejection commits: it does not send live notifications to other users.
      const actor = { idUsuario: orders[0].id_usuario };
      const data = { actor, identityProvider: 'keycloak', role: ROLES.ADMIN_COBRANZAS,
        permissions: [P.UPDATE_PAYMENT_STATUS, P.REVISE_PAYMENT_STATUS], observacion: fixture };
      const suffixes = phase === 'before' ? ['02', '03', '04'] : ['05', '06', '07'];
      const targets = suffixes.map(suffix => orders.find(row => row.numero_nota_venta.endsWith(`-${suffix}`)).id_pedido);
      assert.ok(targets.every(id => orders.find(row => row.id_pedido === id).id_estado_pago === ids.Pendiente),
        'Writing samples require a fresh pending cohort; do not time idempotent replays as new writes');
      await sample('reject_committed_service', i => service.updPaymentState(targets[i], ids.Rechazado, data), 3, false);
      for (const id of targets) {
        const physical = await db.pedidos.findUnique({ where: { id_pedido: id }, select: { id_estado_pago: true, Registros: { select: { Registro_Pago: true } } } });
        assert.equal(physical.id_estado_pago, ids.Rechazado);
        assert.equal(physical.Registros.filter(row => row.Registro_Pago).length, 1);
        await service.updPaymentState(id, ids.Rechazado, data);
        assert.equal(await db.registro_Pago.count({ where: { Registros: { id_pedido: id } } }), 1);
      }
      output.checks.push('3_committed_rejections_physically_verified_and_idempotent_no_notifications');
      if (phase === 'after') {
        const raceId = orders.find(row => row.numero_nota_venta.endsWith('-08')).id_pedido;
        const start = performance.now();
        await Promise.all([service.updPaymentState(raceId, ids.Rechazado, data), service.updPaymentState(raceId, ids.Rechazado, data)]);
        assert.equal(await db.registro_Pago.count({ where: { Registros: { id_pedido: raceId } } }), 1);
        output.race = { operations: 2, totalMs: rounded(performance.now() - start), decisions: 1 };
        const rollbackId = orders.find(row => row.numero_nota_venta.endsWith('-09')).id_pedido;
        const transaction = service.runInTransaction.bind(service);
        service.runInTransaction = callback => transaction(async dependencies => {
          await callback(dependencies);
          throw Object.assign(Error(), { code: 'CONTROLLED_ROLLBACK' });
        });
        await assert.rejects(service.updPaymentState(rollbackId, ids.Rechazado, data), { code: 'CONTROLLED_ROLLBACK' });
        service.runInTransaction = transaction;
        const physical = await db.pedidos.findUnique({ where: { id_pedido: rollbackId }, select: { id_estado_pago: true } });
        assert.equal(physical.id_estado_pago, ids.Pendiente);
        assert.equal(await db.registros.count({ where: { id_pedido: rollbackId } }), 0);
        output.checks.push('two_real_concurrent_rejections_one_decision', 'real_rollback_after_update_and_audit_no_persisted_changes');
        const record = await db.registro_Pago.findFirst({ where: { Registros: { id_pedido: targets[0] } }, select: { id_registro: true } });
        await assert.rejects(preview.getPaymentRecord(targets[1], record.id_registro), { statusCode: 404 });
        output.checks.push('payment_record_cannot_be_read_under_another_order');
      }
      output.finalFixtureCounts = await readPaymentCounts(db, { search: fixture });
    }
  }
} catch (error) {
  const nativeMessage = error.meta?.driverAdapterError?.cause?.originalMessage ?? '';
  const missingColumn = nativeMessage.match(/Unknown column '([^']+)'/)?.[1] ?? error.meta?.column;
  output.errors.push({ stage, code: error.code ?? error.name, status: error.statusCode ?? null, ...(missingColumn ? { missingColumn } : {}) });
  process.exitCode = 1;
} finally {
  await db.$disconnect();
  const target = path.join(root, 'docs/optimización/evidencia', process.argv.includes('--cache-only') ? 'cobranzas-preview-cache.json' : `cobranzas-${phase}.json`);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(output, (_key, value) => typeof value === 'bigint' ? Number(value) : value, 2) + '\n');
  console.log(JSON.stringify({ phase, checks: output.checks, errors: output.errors }));
}

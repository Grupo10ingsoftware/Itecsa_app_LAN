// Explicit development-only SELECT/EXPLAIN diagnostic. No PIN attempts or writes.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { resolveDatabaseConnection, createStrictTlsOptions } from '../src/database/connectionConfig.js';
import OrderRepository from '../src/modules/orders/repo/orders.repo.js';
import OrderService from '../src/modules/orders/service/order.service.js';
import PaymentStatusRepo from '../src/modules/payments/repo/paymentStatus.repo.js';
import PaymentRecordRepo from '../src/modules/payments/repo/paymentRecord.repo.js';
import PaymentRecordService from '../src/modules/payments/service/paymentRecord.service.js';
import { toPaymentOrderDTO, toPaymentStatusDTO } from '../src/modules/orders/dto/order.dto.js';

const arg = name => process.argv.find(v => v.startsWith(`--${name}=`))?.slice(name.length + 3);
if (process.env.APP_ENV !== 'development' || !process.argv.includes('--allow-development-reads') || !arg('reference-root')) {
  throw Error('Requires development, --allow-development-reads and --reference-root');
}
// Docker env-file keeps quotes unlike dotenv/Compose. Normalize public identity
// values in this process only; never print environment values or credentials.
for (const key of ['KEYCLOAK_ISSUER', 'AUTH_PROVIDER', 'KEYCLOAK_ROLE_CLIENT_ID']) {
  if (process.env[key] !== undefined) process.env[key] = dotenv.parse(key + '=' + process.env[key])[key];
}
const baseline = file => import(pathToFileURL(resolve(arg('reference-root'), 'capaServidor', file)).href);
const { default: BeforeRepository } = await baseline('src/modules/orders/repo/orders.repo.js');
const { default: BeforeService } = await baseline('src/modules/orders/service/order.service.js');
const { default: BeforeStatuses } = await baseline('src/modules/payments/repo/paymentStatus.repo.js');
const { default: BeforePreviewRepo } = await baseline('src/modules/payments/repo/paymentRecord.repo.js');
const { default: BeforePreviewService } = await baseline('src/modules/payments/service/paymentRecord.service.js');
const c = resolveDatabaseConnection();
const db = new PrismaClient({ adapter: new PrismaMariaDb({ host: c.host, port: c.port, user: c.user, password: c.password,
  database: c.database, connectionLimit: 10, connectTimeout: 8000, socketTimeout: 15000,
  ...(c.sslMode === 'required' ? { ssl: createStrictTlsOptions(c.host, c.ca) } : {}) }), log: [{ emit: 'event', level: 'query' }] });
let selects = 0; const shapes = new Set(), plans = new Map();
db.$on('query', e => { if (/^\s*(SELECT|WITH)\b/i.test(e.query)) { selects++; shapes.add(e.query); } });
const client = new Proxy(db, { get(target, key) {
  if (key === '$queryRaw') return (input, ...values) => {
    const query = Array.isArray(input) ? Prisma.sql(input, ...values) : input;
    if (!/information_schema|^EXPLAIN/i.test(query.sql)) plans.set(query.sql, query);
    return target.$queryRaw(query);
  };
  const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value;
} });
const output = { reference: 'b8e8a94', capturedAt: new Date().toISOString(), node: process.version,
  environment: 'isolated diagnostic container / development MySQL / unchanged strict TLS and pool 10',
  methodology: '10 warm sequential samples per series, 250ms pause outside clock; no p95/E2E claim; no real writes',
  samples: {}, sql: {}, equivalence: [], errors: 0 };
async function sample(name, work) {
  await work(); shapes.clear(); const values = [];
  for (let i = 0; i < 10; i++) {
    selects = 0; const started = performance.now(); const result = await work();
    values.push({ ms: +(performance.now() - started).toFixed(3), selects, bytes: Buffer.byteLength(JSON.stringify(result)) });
    await new Promise(r => setTimeout(r, 250));
  }
  const sorted = values.map(v => v.ms).sort((a, b) => a - b);
  output.samples[name] = { n: 10, minMs: sorted[0], medianMs: +((sorted[4] + sorted[5]) / 2).toFixed(3),
    meanMs: +(sorted.reduce((a, b) => a + b, 0) / 10).toFixed(3), maxMs: sorted.at(-1), values };
  output.sql[name] = [...shapes]; console.error(JSON.stringify({ series: name, medianMs: output.samples[name].medianMs }));
}
const publicWorkspace = result => ({ ...result, items: result.items.map(toPaymentOrderDTO), paymentStatuses: result.paymentStatuses.map(toPaymentStatusDTO) });
let stage = 'fixture';
try {
  const before = new BeforeService({ repo: new BeforeRepository({ prisma: db }), paymentRepo: new BeforeStatuses({ prisma: db }) });
  const after = new OrderService({ repo: new OrderRepository({ prisma: client }), paymentRepo: new PaymentStatusRepo({ prisma: client }) });
  const oldPreview = new BeforePreviewService({ repo: new BeforePreviewRepo({ prisma: db }) });
  const preview = new PaymentRecordService({ repo: new PaymentRecordRepo({ prisma: client }) });
  const ids = await db.pedidos.findMany({ orderBy: { id_pedido: 'desc' }, take: 3, select: { id_pedido: true } });
  if (!ids.length) throw Error('NO_READ_FIXTURE');
  const first = await before.getPagedPaymentWorkspace({ limit: 1 });
  const cases = [{}, { status: 'Pendiente' }, { status: 'Confirmado' }, { status: 'Rechazado' },
    { search: 'a' }, { search: '%' }, { search: '_' }, { search: '\\' }, { search: "' OR 1=1 --" },
    { from: '2026-01-01', to: '2026-12-31' }, { from: '2026-09-06', to: '2026-09-06' },
    { status: 'Pendiente', search: 'a', from: '2026-01-01' }, { limit: 1 },
    ...(first.pageInfo.nextCursor ? [{ limit: 1, cursor: first.pageInfo.nextCursor }] : [])];
  if (process.argv.includes('--http-only')) {
    stage = 'HTTP';
    const { measurePaymentHttp } = await import('./paymentHttpProbeOpt02.mjs');
    await measurePaymentHttp({ db, output, sample, baseline, before, after, oldPreview, preview, id: ids[0].id_pedido });
  } else {
    stage = 'equivalence';
    for (const [i, query] of cases.entries()) {
      const expected = publicWorkspace(await before.getPagedPaymentWorkspace(query));
      assert.deepEqual(publicWorkspace(await after.getPagedPaymentWorkspace(query)), expected);
      const page = await after.getPagedPaymentWorkspace({ ...query, includeSummary: 'false' });
      assert.deepEqual(page.items.map(toPaymentOrderDTO), expected.items); assert.deepEqual(page.pageInfo, expected.pageInfo);
      assert.equal(page.counts, null); assert.deepEqual(page.paymentStatuses, []);
      const summary = await after.getPagedPaymentWorkspace({ ...query, summaryOnly: 'true' });
      assert.deepEqual(summary.counts, expected.counts); assert.deepEqual(summary.items, []);
      output.equivalence.push('workspace_full_page_summary_' + i);
    }
    for (const [i, fixture] of ids.entries()) {
      assert.deepEqual(await preview.getConfirmationDetails(fixture.id_pedido), await oldPreview.getConfirmationDetails(fixture.id_pedido));
      output.equivalence.push('preview_' + i);
    }
    output.fixture = { totalMatching: Object.values(first.counts).reduce((a, b) => a + b, 0), previewOrders: ids.length };
    stage = 'samples';
    for (const [name, query] of [['workspace', {}], ['status', { status: 'Pendiente' }], ['search', { search: 'a' }],
      ['date', { from: '2026-01-01', to: '2026-12-31' }], ['page', { limit: 1, cursor: first.pageInfo.nextCursor }]]) {
      const expected = publicWorkspace(await before.getPagedPaymentWorkspace(query));
      await sample(name + '_before', async () => { const value = publicWorkspace(await before.getPagedPaymentWorkspace(query)); assert.deepEqual(value, expected); return value; });
      await sample(name + '_after', async () => {
        const value = publicWorkspace(await after.getPagedPaymentWorkspace({ ...query, ...(['status', 'page'].includes(name) ? { includeSummary: 'false' } : {}) }));
        assert.deepEqual(value.items, expected.items); assert.deepEqual(value.pageInfo, expected.pageInfo); return value;
      });
    }
    const expected = await oldPreview.getConfirmationDetails(ids[0].id_pedido);
    await sample('preview_before', () => oldPreview.getConfirmationDetails(ids[0].id_pedido));
    await sample('preview_after', async () => { const value = await preview.getConfirmationDetails(ids[0].id_pedido); assert.deepEqual(value, expected); return value; });
    await sample('summary_only_after', () => after.getPagedPaymentWorkspace({ summaryOnly: 'true' }));
    stage = 'explain'; output.explain = [];
    for (const query of plans.values()) output.explain.push({ sql: query.sql, plan: await db.$queryRaw(Prisma.sql`EXPLAIN ${query}`) });
    output.indexes = await db.$queryRaw`SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('Pedidos','Cliente','Estado_Pago','Detalle_pedido') ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`;
    output.databaseVersion = (await db.$queryRaw`SELECT VERSION() AS version`)[0].version;
  }
} catch (error) {
  output.errors++; output.failure = { stage, type: error.name, code: error.code ?? 'DIAGNOSTIC_FAILED' }; process.exitCode = 1;
} finally {
  try { await db.$disconnect(); } catch { output.errors++; process.exitCode = 1; }
  const json = JSON.stringify(output, (_key, value) => typeof value === 'bigint' ? value.toString() : value, 2) + '\n';
  if (arg('output')) await writeFile(arg('output'), json); else process.stdout.write(json);
}

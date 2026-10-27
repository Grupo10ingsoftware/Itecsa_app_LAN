// Explicit opt-in, SELECT-only diagnostics. No business writes, PIN attempts or user rows in output.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { resolveDatabaseConnection, createStrictTlsOptions } from '../src/database/connectionConfig.js';
import OrderRepository from '../src/modules/orders/repo/orders.repo.js';
import OrderService from '../src/modules/orders/service/order.service.js';
import ProductionLoadRepository from '../src/modules/productionLoad/repo/productionLoad.repo.js';
import { toKanbanOrderDetailDTO, toKanbanOrderSummaryDTO } from '../src/modules/orders/dto/order.dto.js';

const arg = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
if (process.env.APP_ENV !== 'development' || !process.argv.includes('--allow-development-reads') || !arg('reference-root')) {
  throw Error('Requires development, --allow-development-reads and --reference-root pointing to isolated e7c65e3 sources');
}
const baseline = file => import(pathToFileURL(resolve(arg('reference-root'), 'capaServidor', file)).href);
const { default: BeforeRepository } = await baseline('src/modules/orders/repo/orders.repo.js');
const { default: BeforeService } = await baseline('src/modules/orders/service/order.service.js');
const { default: BeforeLoad } = await baseline('src/modules/productionLoad/repo/productionLoad.repo.js');
const c = resolveDatabaseConnection();
const db = new PrismaClient({ adapter: new PrismaMariaDb({ host: c.host, port: c.port, user: c.user, password: c.password,
  database: c.database, connectionLimit: 10, connectTimeout: 8000, socketTimeout: 15000,
  ...(c.sslMode === 'required' ? { ssl: createStrictTlsOptions(c.host, c.ca) } : {}) }), log: [{ emit: 'event', level: 'query' }] });
let selects = 0; const shapes = new Set(), plans = new Map();
db.$on('query', event => { if (/^\s*(SELECT|WITH)\b/i.test(event.query)) { selects++; shapes.add(event.query); } });
const client = new Proxy(db, { get(target, key) {
  if (key === '$queryRaw') return (input, ...values) => {
    const query = Array.isArray(input) ? Prisma.sql(input, ...values) : input;
    if (!/information_schema|^EXPLAIN/i.test(query.sql)) plans.set(query.sql, query);
    return target.$queryRaw(query);
  };
  const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value;
} });
const output = { reference: 'e7c65e3', capturedAt: new Date().toISOString(), node: process.version,
  environment: 'isolated diagnostic container / existing development MySQL / strict TLS / pool 10 / warm SELECTs',
  methodology: '10 sequential samples per series; 250ms pause outside clock; no p95 from n=10; no real mutations',
  samples: {}, sql: {}, equivalence: [], errors: 0 };
const pause = () => new Promise(resolve => setTimeout(resolve, 250));
async function sample(name, work) {
  await work(); shapes.clear(); const values = [];
  for (let i = 0; i < 10; i++) {
    selects = 0; const started = performance.now(); const result = await work();
    values.push({ ms: +(performance.now() - started).toFixed(3), selects, bytes: Buffer.byteLength(JSON.stringify(result)) }); await pause();
  }
  const sorted = values.map(v => v.ms).sort((a, b) => a - b);
  output.samples[name] = { n: 10, minMs: sorted[0], medianMs: +((sorted[4] + sorted[5]) / 2).toFixed(3),
    meanMs: +(sorted.reduce((a, b) => a + b, 0) / 10).toFixed(3), maxMs: sorted.at(-1), values };
  output.sql[name] = [...shapes]; console.error(JSON.stringify({ series: name, medianMs: output.samples[name].medianMs }));
}
function differences(a, b, path = '$', found = []) {
  if (found.length >= 12 || Object.is(a, b)) return found;
  if (a instanceof Date && b instanceof Date) { if (+a !== +b) found.push(path); return found; }
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') { found.push(path); return found; }
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) differences(a[key], b[key], path + '.' + key, found);
  return found;
}
function equal(a, b) {
  try { assert.deepEqual(a, b); } catch (error) { output.mismatchPaths = differences(a, b); throw error; }
}
let stage = 'fixture';
try {
  const before = new BeforeRepository({ prisma: db }), after = new OrderRepository({ prisma: client });
  const oldService = new BeforeService({ repo: before }), service = new OrderService({ repo: after });
  const oldLoad = new BeforeLoad({ prisma: db }), load = new ProductionLoadRepository({ prisma: client });
  const ids = await db.pedidos.findMany({ orderBy: { id_pedido: 'desc' }, take: 4, select: { id_pedido: true } });
  if (!ids.length) throw Error('NO_ORDER_FIXTURE');
  const id = ids[0].id_pedido;
  const date = arg('date') ?? new Date().toISOString().slice(0, 10);
  stage = 'equivalence';
  if (!process.argv.includes('--http-only') && !process.argv.includes('--transition-only')) {
    for (const [i, filter] of [{}, { limit: 1 }, { cursor: { id } }, { status: 'En producción' }, { status: 'Terminado' },
      { search: 'a' }, { search: '%' }, { search: '_' }, { search: '\\' }, { search: "' OR 1=1 --" },
      { productType: 'Lanyard' }, { productType: 'Tarjeta', search: 'a' },
      { from: new Date('2026-01-01'), to: new Date('2027-01-01') }].entries()) {
      const args = { view: 'kanban', limit: 50, ...filter };
      equal(await after.listOrderViews(args), await before.listOrderViews(args)); output.equivalence.push('summary_' + i);
    }
    for (const [i, fixture] of ids.entries()) {
      const previous = await before.getOrderView(fixture.id_pedido, 'kanban');
      equal(await after.getOrderView(fixture.id_pedido, 'kanban'), previous);
      const precheck = await after.getOrderView(fixture.id_pedido, 'kanban-precheck');
      equal(precheck.detalles, previous.detalles); equal(precheck.id_etapa_general, previous.id_etapa_general);
      equal(precheck.estado_pago, previous.estado_pago);
      output.equivalence.push('detail_and_precheck_' + i);
    }
    equal(await after.getOrderView(2147483647, 'kanban'), await before.getOrderView(2147483647, 'kanban'));
    output.equivalence.push('missing_detail');
    for (const key of [date, '2026-01-01', '2026-10-26']) {
      equal(await load.listLanyardDetails(key), await oldLoad.listLanyardDetails(key)); output.equivalence.push('daily_load_date');
    }
    stage = 'samples';
    for (const [name, previous, current] of [
      ['summary', () => oldService.getOrderViews({ limit: 50 }, 'kanban'), () => service.getOrderViews({ limit: 50 }, 'kanban')],
      ['detail', () => before.getOrderView(id, 'kanban'), () => after.getOrderView(id, 'kanban')],
      ['load', () => oldLoad.listLanyardDetails(date), () => load.listLanyardDetails(date)],
    ]) {
      const expected = await previous();
      await sample(name + '_before', async () => { const result = await previous(); equal(result, expected); return result; });
      await sample(name + '_after', async () => { const result = await current(); equal(result, expected); return result; });
    }
    await sample('precheck_after', () => after.getOrderView(id, 'kanban-precheck'));
    output.publicPayloadBytes = {
      summary: Buffer.byteLength(JSON.stringify((await service.getOrderViews({ limit: 50 }, 'kanban')).items.map(toKanbanOrderSummaryDTO))),
      detail: Buffer.byteLength(JSON.stringify(toKanbanOrderDetailDTO(await after.getOrderView(id, 'kanban')))),
      precheck: Buffer.byteLength(JSON.stringify(toKanbanOrderDetailDTO(await after.getOrderView(id, 'kanban-precheck')))),
    };
    stage = 'explain'; output.explain = [];
    for (const query of plans.values()) output.explain.push({ sql: query.sql, plan: await db.$queryRaw(Prisma.sql`EXPLAIN ${query}`) });
    output.indexes = await db.$queryRaw`SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME
      FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE()
      AND TABLE_NAME IN ('Pedidos','Detalle_pedido','Avance_Lanyard','Comentario_Produccion','Producto_Subproceso')
      ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX`;
  }
  if (process.argv.includes('--transition-only')) {
    stage = 'transition equivalence';
    const common = ({ fecha_creacion: _date, numero_nota_venta: _number, ...state }) => state;
    for (const [i, fixture] of ids.entries()) {
      equal(common(await after.getTransitionState(fixture.id_pedido)), await before.getTransitionState(fixture.id_pedido));
      output.equivalence.push('transition_' + i);
    }
    stage = 'transition samples';
    const expected = await before.getTransitionState(id);
    await sample('transition_before', async () => { const result = await before.getTransitionState(id); equal(result, expected); return result; });
    await sample('transition_after', async () => { const result = await after.getTransitionState(id); equal(common(result), expected); return result; });
    output.explain = [];
    for (const query of plans.values()) output.explain.push({ sql: query.sql, plan: await db.$queryRaw(Prisma.sql`EXPLAIN ${query}`) });
  }
  if (process.argv.includes('--http-only')) {
    stage = 'http'; const { measureKanbanHttp } = await import('./kanbanHttpProbeOpt01.mjs');
    await measureKanbanHttp({ db, output, sample, id, baseline, before, after, oldService, service, oldLoad, load });
  }
} catch (error) {
  output.errors++; output.failure = { stage, type: error.name, code: error.code ?? 'DIAGNOSTIC_FAILED' }; process.exitCode = 1;
} finally {
  try { await db.$disconnect(); } catch { output.errors++; process.exitCode = 1; }
  const json = JSON.stringify(output, (_key, value) => typeof value === 'bigint' ? value.toString() : value, 2) + '\n';
  if (arg('output')) await writeFile(arg('output'), json); else process.stdout.write(json);
}

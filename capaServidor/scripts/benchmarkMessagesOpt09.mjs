// Development-only SELECT/EXPLAIN. No real mark/hide/clear/create operations.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { resolveDatabaseConnection, createStrictTlsOptions } from '../src/database/connectionConfig.js';
import MessageRepository from '../src/modules/messages/repo/message.repo.js';
import MessageService from '../src/modules/messages/service/message.service.js';
const arg = name => process.argv.find(v => v.startsWith(`--${name}=`))?.slice(name.length + 3);
if (process.env.APP_ENV !== 'development' || !process.argv.includes('--allow-development-reads') || !arg('reference-root')) throw Error('Requires development, explicit reads opt-in and reference-root');
const baseline = file => import(pathToFileURL(resolve(arg('reference-root'), 'capaServidor', file)).href);
const { default: BeforeRepository } = await baseline('src/modules/messages/repo/message.repo.js');
const { default: BeforeService } = await baseline('src/modules/messages/service/message.service.js');
const c = resolveDatabaseConnection();
const db = new PrismaClient({ adapter: new PrismaMariaDb({ host: c.host, port: c.port, user: c.user, password: c.password, database: c.database,
  connectionLimit: 10, connectTimeout: 8000, socketTimeout: 15000, ...(c.sslMode === 'required' ? { ssl: createStrictTlsOptions(c.host, c.ca) } : {}) }), log: [{ emit: 'event', level: 'query' }] });
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
const output = { reference: '755ce1e', node: process.version, capturedAt: new Date().toISOString(),
  methodology: '10 warm sequential samples, 250ms pause outside clock; same strict TLS/pool10. No real writes or p95/E2E claim.', samples: {}, sql: {}, equivalence: [], errors: 0 };
async function sample(name, work) {
  await work(); shapes.clear(); const values = [];
  for (let i = 0; i < 10; i++) { selects = 0; const started = performance.now(); const result = await work();
    values.push({ ms: +(performance.now() - started).toFixed(3), selects, bytes: Buffer.byteLength(JSON.stringify(result)) }); await new Promise(r => setTimeout(r, 250)); }
  const sorted = values.map(v => v.ms).sort((a, b) => a - b);
  output.samples[name] = { n: 10, minMs: sorted[0], medianMs: +((sorted[4] + sorted[5]) / 2).toFixed(3),
    meanMs: +(sorted.reduce((a,b) => a+b, 0)/10).toFixed(3), maxMs: sorted.at(-1), values };
  output.sql[name] = [...shapes]; console.error(JSON.stringify({ series: name, medianMs: output.samples[name].medianMs }));
}
let stage = 'fixture';
try {
  const groups = await db.mENSAJE_USUARIO.groupBy({ by: ['id_usuario'], _count: { id_mensaje: true }, orderBy: { _count: { id_mensaje: 'desc' } }, take: 1 });
  if (!groups.length) throw Object.assign(Error(), { code: 'NO_ASSIGNED_MESSAGE_FIXTURE' });
  const userId = groups[0].id_usuario;
  const context = { currentUser: { idUsuario: userId, identitySubject: 'opt09-read-fixture', estadoUsuario: 'Activo' } };
  const beforeRepo = new BeforeRepository({ prisma: db }), repo = new MessageRepository({ prisma: client });
  const before = new BeforeService({ repo: beforeRepo }), after = new MessageService({ repo });
  const oldInbox = query => before.getInbox('opt09-read-fixture', query, context);
  const newInbox = query => after.getInbox('opt09-read-fixture', query, context);
  const oldNotifications = query => before.getNotifications('opt09-read-fixture', query, context);
  const newNotifications = query => after.getNotifications('opt09-read-fixture', query, context);
  const first = await oldInbox({ perPage: 12 }); const id = first.messages[0].id_mensaje;
  output.fixture = { assignments: groups[0]._count.id_mensaje, firstPage: first.messages.length, unreadVisible: (await oldNotifications({ limit: 50 })).unreadCount };
  stage = 'measure';
  if (process.argv.includes('--http-only')) {
    const { measureMessageHttp } = await import('./messageHttpProbeOpt09.mjs');
    await measureMessageHttp({ db, beforeRepo, repo, output, sample, baseline });
  } else {
    for (const [name, previous, current] of [
      ['inbox', () => oldInbox({ perPage: 12 }), () => newInbox({ perPage: 12 })],
      ['filter', () => oldInbox({ status: 'unread', sort: 'oldest', perPage: 12 }), () => newInbox({ status: 'unread', sort: 'oldest', perPage: 12 })],
      ['page', () => oldInbox({ page: 2, perPage: 12 }), () => newInbox({ page: 2, perPage: 12 })],
      ['notifications', () => oldNotifications({ limit: 50 }), () => newNotifications({ limit: 50 })],
      ['empty_notifications', () => Promise.all([beforeRepo.listNotifications(2147483647, 50), beforeRepo.countUnreadNotifications(2147483647)])
        .then(([notifications, unreadCount]) => ({ notifications, unreadCount })),
        () => repo.getNotificationSnapshot(2147483647, 50)],
      ['detail', () => beforeRepo.findUserMessage(userId, id), () => repo.findUserMessage(userId, id)],
    ]) {
      const expected = await previous(); await sample(name + '_before', previous);
      if (!process.argv.includes('--baseline-only')) await sample(name + '_after', async () => { const value = await current(); assert.deepEqual(value, expected); return value; });
    }
    if (!process.argv.includes('--baseline-only')) {
      for (const [i, query] of [{}, { status: 'read' }, { status: 'unread' }, { sort: 'oldest' }, { page: 2 },
        { page: 999 }, { from: '2026-01-01', to: '2026-12-31' }, { from: '2026-09-06', to: '2026-09-06' }].entries()) {
        assert.deepEqual(await newInbox(query), await oldInbox(query)); output.equivalence.push('inbox_' + i);
      }
      for (const limit of [1,10,50]) { assert.deepEqual(await newNotifications({ limit }), await oldNotifications({ limit })); output.equivalence.push('notifications_limit_' + limit); }
      assert.equal(await repo.findUserMessage(2147483647, id), null); output.equivalence.push('unassigned_detail');
      await sample('bell_compact_after', () => newNotifications({ limit: 50, view: 'bell' }));
      const revision = (await newNotifications({ limit: 50, view: 'bell' })).revision;
      await sample('bell_unchanged_after', () => newNotifications({ limit: 50, view: 'bell', revision }));
      output.explain = [];
      for (const query of plans.values()) output.explain.push({ sql: query.sql, plan: await db.$queryRaw(Prisma.sql`EXPLAIN ${query}`) });
      output.indexes = await db.$queryRaw`SELECT TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX, COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('Mensaje','MENSAJE_USUARIO') ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`;
    }
  }
} catch (error) { output.errors++; output.failure = { stage, type: error.name, code: error.code ?? 'DIAGNOSTIC_FAILED' }; process.exitCode = 1; }
finally {
  try { await db.$disconnect(); } catch { output.errors++; process.exitCode = 1; }
  const json = JSON.stringify(output, (_key, value) => typeof value === 'bigint' ? value.toString() : value, 2)+'\n';
  if (arg('output')) await writeFile(arg('output'), json); else process.stdout.write(json);
}

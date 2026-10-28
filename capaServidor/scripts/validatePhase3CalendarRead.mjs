import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { resolveDatabaseConnection, createStrictTlsOptions } from '../src/database/connectionConfig.js';
import { listOrderViewsOperation as before } from '../test/fixtures/fase3/calendar.before.repo.js';
import { listOrderViewsOperation as after } from '../src/modules/orders/repo/orderViewOperations.js';

if (process.env.APP_ENV !== 'development' || !process.argv.includes('--allow-development-reads')) throw Error('Explicit development read opt-in required');
const c = resolveDatabaseConnection(), db = new PrismaClient({ adapter: new PrismaMariaDb({ host: c.host, port: c.port, user: c.user,
    password: c.password, database: c.database, connectionLimit: 10, connectTimeout: 8000, socketTimeout: 15000,
    ...(c.sslMode === 'required' ? { ssl: createStrictTlsOptions(c.host, c.ca) } : {}) }), log: [{ emit: 'event', level: 'query' }] });
let reads = 0;
const shapes = new Map(); db.$on('query', e => { if (/^\s*(SELECT|WITH)\b/i.test(e.query)) { reads++; shapes.set(e.query, JSON.parse(e.params)); } });
const output = { reference: '1e7bddd', capturedAt: new Date().toISOString(), methodology: '5 warm pairs, alternating order; strict TLS/pool10, SELECT/EXPLAIN only. Internal repository rows, not HTTP or true E2E. Complete DTO equality per pair; no reliable p95.', cases: {}, equivalence: [], plans: [] };
const filters = { view: 'calendar', limit: 100, cursor: null, status: null, search: null, productType: null,
    from: new Date('2026-10-01T00:00:00Z'), to: new Date('2026-11-01T00:00:00Z') };
const variants = { month: {}, pending: { from: null, to: null, unscheduled: true }, search: { search: 'a' },
    terminal: { from: null, to: null, status: 'Terminado' }, noResults: { search: "' OR 1=1 --" } };
try {
    for (const [name, change] of Object.entries(variants)) {
        const f = { ...filters, ...change }, a = [], b = [];
        assert.deepEqual(await before({ client: db }, f), await after({ client: db }, f));
        for (let i = 0; i < (['month', 'pending', 'search'].includes(name) ? 5 : 1); i++) {
            const pair = {};
            for (const [version, fn] of i % 2 ? [['after', after], ['before', before]] : [['before', before], ['after', after]]) {
                reads = 0; const start = performance.now(), value = await fn({ client: db }, f);
                pair[version] = value;
                (version === 'before' ? a : b).push({ ms: performance.now() - start, selects: reads, resultBytes: Buffer.byteLength(JSON.stringify(value)), rows: value.length });
            }
            assert.deepEqual(pair.before, pair.after);
        }
        const stats = samples => { const t = samples.map(s => s.ms).sort((x, y) => x - y); return { n: samples.length, minMs: t[0], medianMs: t[Math.floor(t.length / 2)],
            meanMs: t.reduce((x, y) => x + y) / t.length, maxMs: t.at(-1), samples }; };
        output.cases[name] = { before: stats(a), after: stats(b) }; output.equivalence.push({ name, equal: true });
        console.log(name, output.cases[name].before.medianMs, output.cases[name].after.medianMs);
    }
    for (const extra of [{ cursor: { id: 30 } }, { productType: 'Lanyard' }, { search: '%' }, { search: '_' }]) {
        assert.deepEqual(await before({ client: db }, { ...filters, ...extra }), await after({ client: db }, { ...filters, ...extra }));
        output.equivalence.push({ variant: Object.keys(extra)[0], equal: true });
    }
    for (const [sql, params] of [...shapes.entries()].filter(([sql]) => sql.includes('WITH page')).slice(0, 6)) output.plans.push({ sql, plan: await db.$queryRawUnsafe('EXPLAIN ' + sql, ...params) });
} catch (error) { output.failure = { name: error.name, code: error.code ?? 'CALENDAR_EQUIVALENCE' }; process.exitCode = 1; }
finally { await db.$disconnect(); await writeFile('../docs/FASE3_CALENDARIO_COMPARACION.json', JSON.stringify(output, (_k, v) => typeof v === 'bigint' ? v.toString() : v, 2) + '\n'); }

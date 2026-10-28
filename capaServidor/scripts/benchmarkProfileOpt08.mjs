// Bounded read-only comparison. Never queries PIN credentials or prints business rows/parameters.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { resolveDatabaseConnection, createStrictTlsOptions } from '../src/database/connectionConfig.js';
import { UserRepository as Before } from '../test/fixtures/opt08/users.before.repo.js';
import { UserRepository as After } from '../src/modules/users/repo/users.repo.js';
import { UserMovementsRepository } from '../src/modules/users/repo/userMovements.repo.js';

if (process.env.APP_ENV !== 'development' || !process.argv.includes('--allow-development-reads')) throw Error('Explicit development read opt-in required');
const c = resolveDatabaseConnection();
const db = new PrismaClient({ adapter: new PrismaMariaDb({ host: c.host, port: c.port, user: c.user,
    password: c.password, database: c.database, connectionLimit: 10, connectTimeout: 8000, socketTimeout: 15000,
    ...(c.sslMode === 'required' ? { ssl: createStrictTlsOptions(c.host, c.ca) } : {}) }), log: [{ emit: 'event', level: 'query' }] });
let queries = [];
const shapes = new Map();
db.$on('query', e => {
    assert.match(e.query, /^\s*(SELECT|WITH|EXPLAIN|SHOW)\b/i);
    queries.push({ sql: e.query, driverMs: e.duration });
    if (/^\s*SELECT\b/i.test(e.query)) shapes.set(e.query, JSON.parse(e.params));
});
const before = new Before({ prisma: db }), after = new After({ prisma: db });
const result = { reference: 'b71fd33', capturedAt: new Date().toISOString(), node: process.version,
    methodology: 'Five warm samples per series; driver includes network. No reliable p95, engine CPU or real browser E2E. SELECT/EXPLAIN only; strict TLS/pool10 unchanged.', samples: {}, equivalence: [], explain: [], errors: 0 };
const bytes = value => Buffer.byteLength(JSON.stringify(value));
async function measure(name, fn) {
    await fn(); const samples = [];
    for (let i = 0; i < 5; i++) {
        queries = []; const start = performance.now(), cpu = process.cpuUsage();
        const value = await fn(), used = process.cpuUsage(cpu);
        samples.push({ ms: +(performance.now() - start).toFixed(3), selects: queries.length,
            resultBytes: bytes(value), driverMs: queries.map(q => q.driverMs), cpuMs: (used.user + used.system) / 1000 });
    }
    const times = samples.map(s => s.ms).sort((a, b) => a - b);
    result.samples[name] = { n: samples.length, minMs: times[0], meanMs: times.reduce((a, b) => a + b) / times.length,
        medianMs: times[2], maxMs: times.at(-1), samples };
    console.log(name, times[2]);
}
try {
    if (process.argv.includes('--fixtures-only')) {
        const { verifyProfileSqlFixtures } = await import('./profileSqlFixtureProbeOpt08.mjs');
        const fixtures = await verifyProfileSqlFixtures(db);
        const saved = JSON.parse(await readFile('../docs/OPT-08_RENDIMIENTO.json', 'utf8'));
        Object.assign(result, saved, { fixtures });
    } else {
    const httpOnly = process.argv.includes('--http-only');
    if (httpOnly) Object.assign(result, JSON.parse(await readFile('../docs/OPT-08_RENDIMIENTO.json', 'utf8')));
    const [actor] = await db.$queryRaw`SELECT id_usuario FROM Registros WHERE id_usuario IS NOT NULL GROUP BY id_usuario ORDER BY COUNT(*) DESC LIMIT 1`;
    if (!actor) throw Object.assign(Error(), { code: 'NO_PROFILE_ACTIVITY_FIXTURE' });
    const id = Number(actor.id_usuario);
    const cases = { recent: repo => repo.listRecentRecords(id), first: repo => repo.listMovements(id, { page: 1, perPage: 10 }),
        search: repo => repo.listMovements(id, { page: 1, perPage: 10, search: 'a' }),
        next: repo => repo.listMovements(id, { page: 2, perPage: 10 }),
        previous: repo => repo.listMovements(id, { page: 1, perPage: 10 }),
        deep: repo => repo.listMovements(id, { page: 500, perPage: 10 }) };
    for (const [name, fn] of httpOnly ? [] : Object.entries(cases)) {
        await measure(name + '_before', () => fn(before)); await measure(name + '_after', () => fn(after));
        assert.deepEqual(await fn(after), await fn(before)); result.equivalence.push({ name, equal: true });
    }
    for (const search of httpOnly ? [] : ['', 'Estado de pago:', 'Etapa del pedido: a', 'Subproceso: a', 'á', '%', '_', '\\', "' OR 1=1 --", '1', '999999999999999999999']) {
        const filters = { page: 1, perPage: 10, search };
        const original = await before.listMovements(id, filters);
        assert.deepEqual(await after.listMovements(id, filters), original);
        assert.deepEqual(await new UserMovementsRepository({ prisma: db }).list(id, filters), original);
        result.equivalence.push({ searchCase: result.equivalence.length, profileAndAdministrativeEqual: true });
    }
    const plans = httpOnly ? [] : [...shapes.entries()];
    for (const [sql, params] of plans) result.explain.push({ sql, plan: await db.$queryRawUnsafe('EXPLAIN ' + sql, ...params) });
    if (!httpOnly) result.indexes = await db.$queryRaw(Prisma.sql`SHOW INDEX FROM Registros`);
    if (httpOnly || process.argv.includes('--http')) {
        const { measureProfileHttp } = await import('./profileHttpProbeOpt08.mjs');
        await measureProfileHttp({ db, before, after, result, measure });
    }
    }
} catch (error) {
    result.errors++; result.failure = { code: error.code ?? 'PROFILE_COMPARISON_FAILED', name: error.name }; process.exitCode = 1;
    console.error(result.failure);
} finally {
    await db.$disconnect();
    await writeFile('../docs/OPT-08_RENDIMIENTO.json', JSON.stringify(result, (_key, value) => typeof value === 'bigint' ? value.toString() : value, 2) + '\n');
}

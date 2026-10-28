// Consolidated bounded reads. No real PIN, mutations, business audits or Keycloak management.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import express from 'express';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { resolveDatabaseConnection, createStrictTlsOptions } from '../src/database/connectionConfig.js';
import { UserRepository } from '../src/modules/users/repo/users.repo.js';
import { KeycloakIdentityRepository } from '../src/modules/users/repo/keycloakIdentity.repo.js';
import { KeycloakIdentityAdministrationService } from '../src/modules/users/service/keycloakIdentityAdministration.service.js';
import { createKeycloakIdentityPreparationRouter } from '../src/modules/users/routes/keycloakIdentityPreparation.routes.js';
import Orders from '../src/modules/orders/repo/orders.repo.js';
import OrderService from '../src/modules/orders/service/order.service.js';
import OrderController from '../src/modules/orders/controller/orders.controller.js';
import PaymentStatusRepo from '../src/modules/payments/repo/paymentStatus.repo.js';
import { createOrderRouter } from '../src/modules/orders/routes/order.routes.js';
import { createAuthRouter } from '../src/modules/auth/routes/auth.routes.js';
import History from '../src/modules/history/repo/orderHistory.repo.js';
import HistoryService from '../src/modules/history/service/orderHistory.service.js';
import HistoryController from '../src/modules/history/controller/orderHistory.controller.js';
import { createOrderHistoryRouter } from '../src/modules/history/routes/orderHistory.routes.js';
import Metrics from '../src/modules/metrics/repo/metrics.repo.js';
import MetricsService from '../src/modules/metrics/service/metrics.service.js';
import MetricsController from '../src/modules/metrics/controller/metrics.controller.js';
import { createMetricsRouter } from '../src/modules/metrics/routes/metrics.routes.js';
import Messages from '../src/modules/messages/repo/message.repo.js';
import MessageService from '../src/modules/messages/service/message.service.js';
import MessageController from '../src/modules/messages/controller/message.controller.js';
import { createMessageRouter } from '../src/modules/messages/routes/message.routes.js';
import { createCheckJwt } from '../src/middlewares/checkJwt.js';
import { createRequireActiveIdentity } from '../src/middlewares/requireActiveIdentity.js';
import { createThrottleMiddleware } from '../src/middlewares/rateLimit.js';
import { MemoryThrottleService } from '../src/modules/security/service/securityThrottle.service.js';
import { requestContext, respondError } from '../src/errors/httpErrors.js';
import { ACTIVE_USER_STATUSES } from '../src/config/userLifecycle.js';
import { ROLE_PERMISSIONS, PERMISSIONS as P } from '../../shared/authorization.js';

if (process.env.APP_ENV !== 'development' || !process.argv.includes('--allow-development-reads')) throw Error('Explicit development read opt-in required');
const n = Number(process.argv.find(x => x.startsWith('--samples='))?.split('=')[1] ?? 10);
assert(Number.isInteger(n) && n >= 3 && n <= 30);
const c = resolveDatabaseConnection();
const db = new PrismaClient({ adapter: new PrismaMariaDb({ host: c.host, port: c.port, user: c.user, password: c.password,
    database: c.database, connectionLimit: 10, connectTimeout: 8000, socketTimeout: 15000,
    ...(c.sslMode === 'required' ? { ssl: createStrictTlsOptions(c.host, c.ca) } : {}) }), log: [{ emit: 'event', level: 'query' }] });
let queries = [], identityMs = 0, middlewareMs = 0;
const shapes = new Map();
db.$on('query', e => {
    if (!/^\s*(SELECT|SHOW|WITH|EXPLAIN)\b/i.test(e.query)) {
        result.controlStatements ??= [];
        if (!result.controlStatements.includes(e.query)) result.controlStatements.push(e.query);
        assert.doesNotMatch(e.query, /^\s*(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b/i);
    }
    if (/^\s*(SELECT|SHOW|WITH|EXPLAIN)\b/i.test(e.query)) queries.push({ sql: e.query, driverMs: e.duration });
    if (/^\s*SELECT/i.test(e.query)) shapes.set(e.query, JSON.parse(e.params)); });
const identity = new UserRepository({ prisma: db }), users = new KeycloakIdentityRepository({ prisma: db });
const findIdentity = identity.findBySubject.bind(identity);
identity.findBySubject = async (...args) => { const t = performance.now(); try { return await findIdentity(...args); } finally { identityMs += performance.now() - t; } };
const orders = new Orders({ prisma: db }), orderService = new OrderService({ repo: orders, paymentRepo: new PaymentStatusRepo({ prisma: db }) });
const metrics = new MetricsService({ repo: new Metrics({ prisma: db }) });
const history = new HistoryService({ repo: new History({ prisma: db }) });
const messages = new MessageService({ repo: new Messages({ prisma: db }), userRepo: identity });
const result = { reference: '1e7bddd', capturedAt: new Date().toISOString(), node: process.version,
    environment: 'development DB, strict TLS, pool10, sequential warm reads; synthetic local JWT/JWKS, fresh real DB binding each request',
    exclusions: ['real Keycloak login/refresh', 'business mutations', 'SQL quota/audit writes', 'real browser E2E', 'SQL engine CPU isolated', 'pool queue/server connection occupancy'],
    methodology: `n=${n} per operation, one excluded warmup, descriptive min/mean/median/max/stddev; no reliable production p95 from this bounded sample`,
    samples: {}, errors: [], plans: [] };
async function measure(name, fn) {
    const samples = []; let failures = 0;
    for (let i = -1; i < n; i++) {
        queries = []; identityMs = 0; middlewareMs = 0;
        const start = performance.now(), cpu = process.cpuUsage(), heap = process.memoryUsage().heapUsed;
        try {
            const value = await fn(), used = process.cpuUsage(cpu);
            if (i >= 0) samples.push({ ms: performance.now() - start, selects: queries.filter(q => !/^\s*(EXPLAIN|SHOW)/i.test(q.sql)).length,
                writes: 0, bytes: Buffer.byteLength(JSON.stringify(value)), identityMs, middlewareMs,
                driverMs: queries.map(q => q.driverMs), cpuMs: (used.user + used.system) / 1000, heapDeltaBytes: process.memoryUsage().heapUsed - heap });
        } catch (error) { failures++; result.errors.push({ operation: name, sample: i, code: error.code ?? error.name }); }
    }
    const times = samples.map(s => s.ms).sort((a, b) => a - b), mean = times.reduce((a, b) => a + b, 0) / times.length;
    result.samples[name] = { requested: n, successful: samples.length, failures, minMs: times[0], meanMs: mean,
        medianMs: times.length % 2 ? times[Math.floor(times.length / 2)] : (times[times.length / 2 - 1] + times[times.length / 2]) / 2,
        maxMs: times.at(-1), stddevMs: Math.sqrt(times.reduce((s, x) => s + (x - mean) ** 2, 0) / times.length), p95: null, samples };
    console.log(name, result.samples[name].medianMs?.toFixed(3), 'errors', failures);
}
const delay = monitorEventLoopDelay({ resolution: 20 }); delay.enable();
let server;
try {
    const bindings = await db.externalIdentity.findMany({ where: { provider: 'keycloak', issuer: process.env.KEYCLOAK_ISSUER,
        Usuario: { is: { estado_usuario: { in: [...ACTIVE_USER_STATUSES] } } } }, select: { subject: true, Usuario: { select: { rol_usuario: true } } } });
    const { privateKey, publicKey } = await generateKeyPair('RS256'), key = { ...await exportJWK(publicKey), kid: 'fase3', alg: 'RS256', use: 'sig' };
    const app = express(); app.locals.errorLogger = { error() {} }; app.use(requestContext);
    app.get('/certs', (_req, res) => res.json({ keys: [key] }));
    server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
    const origin = `http://127.0.0.1:${server.address().port}`, environment = { APP_ENV: 'test', KEYCLOAK_ALLOW_HTTP: 'true', KEYCLOAK_ISSUER: origin,
        KEYCLOAK_JWKS_URI: origin + '/certs', KEYCLOAK_AUDIENCE: 'api', KEYCLOAK_CLIENT_ID: 'web', KEYCLOAK_ROLE_CLIENT_ID: 'roles' };
    const base = createCheckJwt({ environment, requireIdentity: createRequireActiveIdentity({ repository: identity }), rateLimit: createThrottleMiddleware({
        throttle: new MemoryThrottleService(), rules: req => [{ scope: 'fase3', subject: req.currentUser.idUsuario, limit: 500, windowMs: 60000 }] }) });
    const authenticate = (req, res, next) => { const start = performance.now(); return base(req, res, error => { middlewareMs = performance.now() - start; next(error); }); };
    app.use('/orders', createOrderRouter({ authenticate, controller: new OrderController({ service: orderService }) }));
    app.use('/auth', createAuthRouter({ authenticate, users: identity }));
    app.use('/history', createOrderHistoryRouter({ authenticate, controller: new HistoryController({ service: history }) }));
    app.use('/metrics', createMetricsRouter({ authenticate, controller: new MetricsController({ service: metrics }) }));
    app.use('/messages', createMessageRouter({ authenticate, controller: new MessageController({ service: messages }) }));
    app.use('/admin/identity', createKeycloakIdentityPreparationRouter({ authenticate, service: new KeycloakIdentityAdministrationService({ repository: users }) }));
    app.use((error, req, res, _next) => respondError(error, req, res));
    const paths = { kanban: ['/orders/kanban-summary?limit=50', P.READ_ORDERS], calendar: ['/orders/calendar-summary?from=2026-10-01&to=2026-10-31&limit=100', P.READ_CALENDAR],
        calendarPending: ['/orders/calendar-summary?unscheduled=true&limit=100', P.READ_CALENDAR], payments: ['/orders/payments?limit=50', P.READ_PAYMENTS],
        users: ['/admin/identity/users?page=1&perPage=10', P.MANAGE_USERS], history: ['/history/orders?limit=50', P.READ_ORDERS],
        metrics: ['/metrics/summary?from=2026-10-01&to=2026-10-31', P.VIEW_METRICS], profile: ['/auth/profile', P.READ_PROFILE],
        movements: ['/auth/profile/movements', P.READ_PROFILE], inbox: ['/messages?limit=10', P.READ_MESSAGES],
        notifications: ['/messages/notifications?limit=50&view=bell', P.READ_MESSAGES] };
    const only = process.argv.find(x => x.startsWith('--only='))?.slice(7);
    const inboxRead = messages.getInbox.bind(messages);
    messages.getInbox = async (...args) => { try { return await inboxRead(...args); } catch (error) {
        result.errors.push({ operation: 'inbox-diagnostic', code: error.code ?? error.name, type: error.name,
            adapterKind: error.meta?.driverAdapterError?.cause?.kind ?? null }); throw error;
    } };
    for (const [name, [url, permission]] of Object.entries(paths).filter(([name]) => !only || name === only)) {
        const binding = bindings.find(b => ROLE_PERMISSIONS[b.Usuario.rol_usuario]?.includes(permission));
        if (!binding) { result.errors.push({ operation: name, code: 'NO_AUTHORIZED_BINDING' }); continue; }
        const token = await new SignJWT({ sub: binding.subject, typ: 'Bearer', azp: 'web', resource_access: { roles: { roles: [binding.Usuario.rol_usuario] } }, permissions: ROLE_PERMISSIONS[binding.Usuario.rol_usuario] })
            .setProtectedHeader({ alg: 'RS256', kid: 'fase3' }).setIssuer(origin).setAudience('api').setIssuedAt().setExpirationTime('30m').sign(privateKey);
        await measure('http_' + name, async () => { const response = await fetch(origin + url, { headers: { authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(30000) });
            if (!response.ok) { await response.body?.cancel(); throw Object.assign(Error(), { code: 'HTTP_' + response.status }); } return response.json(); });
        result.samples['http_' + name].role = binding.Usuario.rol_usuario;
    }
    const [existing] = await db.$queryRaw`SELECT numero_nota_venta FROM Pedidos WHERE numero_nota_venta IS NOT NULL LIMIT 1`;
    if (existing) await measure('opt04_duplicate_read_repository', () => orders.existsBySalesNoteNumber(existing.numero_nota_venta));
    const plans = [...shapes.entries()].filter(([sql]) => /FROM Registros|calendar|fecha_estimada_termino/i.test(sql)).slice(0, 12);
    for (const [sql, values] of plans) result.plans.push({ sql, plan: await db.$queryRawUnsafe('EXPLAIN ' + sql, ...values) });
} catch (error) { result.errors.push({ operation: 'setup', code: error.code ?? error.name }); process.exitCode = 1; }
finally {
    delay.disable(); result.eventLoop = { meanMs: delay.mean / 1e6, maxMs: delay.max / 1e6, note: 'Diagnostic process during reads; not production event loop or evidence of scrypt blocking.' };
    if (server) { server.closeAllConnections(); await new Promise(r => server.close(r)); }
    await db.$disconnect();
    const output = process.argv.find(x => x.startsWith('--output='))?.slice(9) ?? '../docs/FASE3_RENDIMIENTO_LECTURAS.json';
    await writeFile(output, JSON.stringify(result, (_k, v) => typeof v === 'bigint' ? v.toString() : v, 2) + '\n');
    if (result.errors.length) process.exitCode = 1;
}

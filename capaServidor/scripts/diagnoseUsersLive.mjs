// Opt-in diagnostic process. JSON lines on stdin/stdout; never log credentials,
// tokens, PINs, SQL parameters or business records. Response bodies are returned
// only to the parent process in memory, not written as evidence by this script.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import dotenv from 'dotenv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const reference = process.argv.find(value => value.startsWith('--reference='))?.slice('--reference='.length) ?? 'HEAD';
if (!/^(HEAD|[0-9a-f]{7,40})$/i.test(reference)) throw Error('INVALID_REFERENCE_COMMIT');
const referenceCommit = execFileSync('git', ['rev-parse', '--verify', `${reference}^{commit}`], { cwd: root, encoding: 'utf8' }).trim();
dotenv.config({ path: path.join(root, 'capaServidor/.env'), quiet: true });
const load = relative => import(pathToFileURL(path.join(root, relative)).href);
const { resolveDatabaseConnection, createStrictTlsOptions } = await load('capaServidor/src/database/connectionConfig.js');
const connection = resolveDatabaseConnection();
if (process.env.APP_ENV !== 'development' || !connection.host.endsWith('.aivencloud.com')
  || connection.sslMode !== 'required' || !process.argv.includes('--allow-aiven-reads')) throw Error('LIVE_TARGET_NOT_AUTHORIZED');
const allowWrites = process.argv.includes('--allow-aiven-test-writes');
const prepareCacheLength = Number(process.argv.find(value => value.startsWith('--prepare-cache='))?.split('=')[1] ?? 0);
if (!Number.isSafeInteger(prepareCacheLength) || prepareCacheLength < 0 || prepareCacheLength > 64) throw Error('INVALID_PREPARE_CACHE_BOUND');
const { PrismaClient } = await import('@prisma/client');
const { PrismaMariaDb } = await import('@prisma/adapter-mariadb');
const db = new PrismaClient({ adapter: new PrismaMariaDb({ host: connection.host, port: connection.port,
  user: connection.user, password: connection.password, database: connection.database, connectionLimit: 10,
  prepareCacheLength,
  connectTimeout: 8000, socketTimeout: 15000, ssl: createStrictTlsOptions(connection.host, connection.ca) }),
log: [{ level: 'query', emit: 'event' }] });
const context = new AsyncLocalStorage();
let active;
const round = value => +value.toFixed(3);
db.$on('query', event => {
  const scope = context.getStore();
  const sample = scope?.sample ?? active;
  if (!sample) return;
  const kind = event.query.trim().split(/\s/, 1)[0].toUpperCase();
  const table = ['Usuario', 'ExternalIdentity', 'IdentityProvisionOperation', 'SecurityAuditEvent', 'Registros', 'SecurityThrottle']
    .find(name => event.query.includes(name)) ?? 'other';
  sample.sql.push({ kind, table, stage: scope?.stage ?? 'unattributed', ms: event.duration,
    shape: createHash('sha256').update(event.query).digest('hex').slice(0, 12), atMs: round(performance.now() - sample.start) });
});
function instrument(object, prefix, names) {
  for (const name of names) {
    const original = object[name].bind(object);
    object[name] = async (...args) => {
      const scope = context.getStore();
      if (!scope?.sample) return original(...args);
      const start = performance.now();
      try { return await context.run({ ...scope, stage: `${prefix}.${name}` }, () => original(...args)); }
      finally { scope.sample.stages.push({ name: `${prefix}.${name}`, atMs: round(start - scope.sample.start), ms: round(performance.now() - start) }); }
    };
  }
  return object;
}

// Load only the three baseline implementations and router from the reference. Resolve
// their other dependencies to the existing repository, without checkout/reset.
const referenceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'itecsa-users-reference-'));
const files = ['repo/keycloakIdentity.repo.js', 'service/keycloakIdentityAdministration.service.js',
  'service/keycloakManagement.service.js', 'routes/keycloakIdentityPreparation.routes.js'];
const sources = new Map(files.map((relative, index) => [pathToFileURL(path.join(root, 'capaServidor/src/modules/users', relative)).href,
  pathToFileURL(path.join(referenceDir, `${index}.mjs`)).href]));
for (const relative of files) {
  const repoPath = `capaServidor/src/modules/users/${relative}`;
  const originalUrl = pathToFileURL(path.join(root, repoPath)).href;
  const source = execFileSync('git', ['show', `${referenceCommit}:${repoPath}`], { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 });
  const rewritten = source.replace(/(\bfrom\s*|\bimport\s*)['"]([^'"]+)['"]/g, (_all, prefix, specifier) => {
    const resolved = specifier.startsWith('.') ? new URL(specifier, originalUrl).href : import.meta.resolve(specifier);
    return `${prefix}'${sources.get(resolved) ?? resolved}'`;
  });
  await fs.writeFile(fileURLToPath(sources.get(originalUrl)), rewritten);
}
const moduleFor = (relative, before) => {
  const source = pathToFileURL(path.join(root, 'capaServidor/src/modules/users', relative)).href;
  return import(before ? sources.get(source) : source);
};
const { default: express } = await import('express');
const { createCheckJwt } = await load('capaServidor/src/middlewares/checkJwt.js');
const { createRequireActiveIdentity } = await load('capaServidor/src/middlewares/requireActiveIdentity.js');
const { UserRepository } = await load('capaServidor/src/modules/users/repo/users.repo.js');
const { PinService } = await load('capaServidor/src/modules/auth/service/pin.service.js');
const { requestContext, errorHandler } = await load('capaServidor/src/errors/httpErrors.js');
const { createSupportAudit } = await load('capaServidor/src/middlewares/supportAudit.js');
const { default: AuditRepository } = await load('capaServidor/src/modules/security/repo/securityAudit.repo.js');
const pendingAudits = new Set();
const audit = new AuditRepository({ prisma: db });
const record = audit.record.bind(audit);
audit.record = (...args) => {
  const task = record(...args);
  pendingAudits.add(task);
  task.then(() => pendingAudits.delete(task), () => pendingAudits.delete(task));
  return task;
};
const app = express();
app.locals.errorLogger = { error() {} };
app.use(requestContext, express.json({ limit: '100kb' }));
app.use((req, _res, next) => context.run({ sample: active, stage: 'middleware' }, next));
app.use(createSupportAudit({ repository: audit, logger: { error() {} } }));
const services = {};
for (const version of ['before', 'after']) {
  const before = version === 'before';
  const { KeycloakIdentityRepository } = await moduleFor('repo/keycloakIdentity.repo.js', before);
  const { KeycloakIdentityAdministrationService } = await moduleFor('service/keycloakIdentityAdministration.service.js', before);
  const { KeycloakManagementService } = await moduleFor('service/keycloakManagement.service.js', before);
  const { createKeycloakIdentityPreparationRouter } = await moduleFor('routes/keycloakIdentityPreparation.routes.js', before);
  const management = new KeycloakManagementService({ fetcher: async (url, options) => {
    const scope = context.getStore();
    const start = performance.now();
    let status;
    try {
      if (scope?.sample.fault === 'before-activation' && options.method === 'PUT'
        && options.body === '{"enabled":true}' && !scope.sample.faultApplied) {
        scope.sample.faultApplied = true;
        throw Error('CONTROLLED_TEST_ACTIVATION_FAILURE');
      }
      const response = await fetch(url, options); status = response.status; return response;
    }
    finally {
      if (scope?.sample) {
        const pathname = new URL(url).pathname;
        const category = pathname.endsWith('/token') ? 'token' : pathname.endsWith('/credentials') ? 'credential-metadata'
          : pathname.endsWith('/reset-password') ? 'password' : pathname.endsWith('/logout') ? 'logout'
            : pathname.includes('/role-mappings/') ? 'role-mapping' : pathname.includes('/roles/') ? 'role-representation'
              : pathname.endsWith('/clients') ? 'client-discovery' : pathname.endsWith('/users') ? 'users' : 'user';
        scope.sample.rpc.push({ category, method: options.method ?? 'GET', status: status ?? null,
          atMs: round(start - scope.sample.start), ms: round(performance.now() - start) });
      }
    }
  } });
  const repository = instrument(new KeycloakIdentityRepository({ prisma: db }), 'repo',
    ['actor', 'binding', 'list', 'summary', 'movements', 'claim', 'operation', 'acquire', 'checkpoint', 'complete', 'finish', 'fail', 'beginUpdate', 'finishUpdate']);
  const finishUpdate = repository.finishUpdate.bind(repository);
  repository.finishUpdate = async (...args) => {
    const sample = context.getStore()?.sample;
    if (sample?.fault === 'before-local-update-commit' && !sample.faultApplied && args[3] !== 'reverted') {
      sample.faultApplied = true;
      throw Error('CONTROLLED_TEST_LOCAL_FAILURE');
    }
    return finishUpdate(...args);
  };
  const pins = instrument(new PinService({ prisma: db }), 'pin', ['validate']);
  const service = instrument(new KeycloakIdentityAdministrationService({ management, repository, pins }), 'service',
    ['authorize', 'inspect', 'list', 'summary', 'update', 'prepare', 'reconcile', 'execute', 'movements', 'findByUsername']);
  services[version] = service;
  const identity = instrument(new UserRepository({ prisma: db }), 'identity', ['findBySubject']);
  app.use(`/api/${version}/admin/identity`, createKeycloakIdentityPreparationRouter({ service,
    authenticate: createCheckJwt({ requireIdentity: createRequireActiveIdentity({ repository: identity }) }) }));
}
app.use(errorHandler);
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const prefix = 'prueba.optfinal.';
async function guardFixture(subject) {
  const row = await db.externalIdentity.findUnique({ where: { provider_issuer_subject: {
    provider: 'keycloak', issuer: process.env.KEYCLOAK_ISSUER, subject } }, select: { username: true } });
  if (!row?.username.startsWith(prefix)) throw Error('ONLY_CURRENT_TEST_FIXTURES_MAY_BE_CHANGED');
}
async function command(input) {
  if (input.action === 'engine-users') {
    const { default: mariadb } = await import('mariadb');
    const { ASSIGNABLE_ROLES } = await load('shared/keycloakAuthorization.js');
    const conn = await mariadb.createConnection({ host: connection.host, port: connection.port, user: connection.user,
      password: connection.password, database: connection.database, ssl: createStrictTlsOptions(connection.host, connection.ca),
      connectTimeout: 8000, socketTimeout: 15000 });
    try {
      const from = `FROM Usuario u JOIN ExternalIdentity e ON e.user_id=u.id_usuario
        WHERE e.provider=? AND e.issuer=? AND u.rol_usuario IN (${ASSIGNABLE_ROLES.map(() => '?').join(',')})`;
      const values = ['keycloak', process.env.KEYCLOAK_ISSUER, ...ASSIGNABLE_ROLES];
      const result = [];
      for (const kind of ['list', 'count']) {
        const marker = `/* itecsa_probe_${kind} */ `;
        const sql = marker + (kind === 'list' ? `SELECT u.id_usuario, u.correo_usuario, u.rut_usuario,
          u.nombre_usuario,u.apellido_usuario,u.rol_usuario,u.estado_usuario,e.subject,e.username
          ${from} ORDER BY u.id_usuario DESC LIMIT 10 OFFSET 0` : `SELECT COUNT(*) AS total ${from}`);
        const samples = [];
        for (let i = 0; i < 3; i++) {
          const start = performance.now();
          const rows = await conn.query(sql, values);
          const ms = round(performance.now() - start);
          let engine;
          try {
            engine = await conn.query(`SELECT TIMER_WAIT/1000000000 AS engineMs,
              LOCK_TIME/1000000000 AS lockMs,ROWS_EXAMINED AS rowsExamined,ROWS_SENT AS rowsSent
              FROM performance_schema.events_statements_history
              WHERE THREAD_ID=(SELECT THREAD_ID FROM performance_schema.threads WHERE PROCESSLIST_ID=CONNECTION_ID())
                AND SQL_TEXT LIKE ? ORDER BY EVENT_ID DESC LIMIT 1`, [marker + '%']);
          } catch (error) { engine = [{ unavailable: true, code: error.code ?? 'ENGINE_CAPTURE_UNAVAILABLE' }]; }
          samples.push({ ms, rows: rows.length, engine });
        }
        result.push({ kind, protocol: 'text / dedicated connection / same predicates, no app configuration change', samples });
      }
      return result;
    } finally { await conn.end(); }
  }
  if (input.action === 'protocol') {
    const { default: mariadb } = await import('mariadb');
    const series = [];
    for (const prepareCacheLength of [0, 16]) {
      const conn = await mariadb.createConnection({ host: connection.host, port: connection.port, user: connection.user,
        password: connection.password, database: connection.database, ssl: createStrictTlsOptions(connection.host, connection.ca),
        connectTimeout: 8000, socketTimeout: 15000, prepareCacheLength });
      try {
        for (const protocol of ['query', 'execute']) {
          const probeSql = `SELECT ? AS probe_${protocol}`;
          await conn[protocol](probeSql, [0]);
          const counterQuery = "SHOW SESSION STATUS WHERE Variable_name IN ('Com_stmt_prepare','Com_stmt_execute','Com_stmt_close')";
          const countersBefore = await conn.query(counterQuery);
          const cpuBefore = process.cpuUsage();
          const times = [];
          for (let i = 1; i <= 5; i++) {
            const start = performance.now();
            const rows = await conn[protocol](probeSql, [i]);
            if (Number(rows[0][`probe_${protocol}`]) !== i) throw Error('PROBE_RESULT_MISMATCH');
            times.push(round(performance.now() - start));
          }
          const usedCpu = process.cpuUsage(cpuBefore);
          const countersAfter = await conn.query(counterQuery);
          const commands = Object.fromEntries(countersAfter.map(row => [row.Variable_name,
            Number(row.Value) - Number(countersBefore.find(before => before.Variable_name === row.Variable_name)?.Value ?? 0)]));
          let engine;
          try {
            engine = await conn.query(`SELECT TIMER_WAIT / 1000000000 AS engineMs,
              LOCK_TIME / 1000000000 AS lockMs, ROWS_EXAMINED AS rowsExamined
              FROM performance_schema.events_statements_history
              WHERE THREAD_ID = (SELECT THREAD_ID FROM performance_schema.threads WHERE PROCESSLIST_ID = CONNECTION_ID())
                AND SQL_TEXT LIKE ?
              ORDER BY EVENT_ID DESC LIMIT 1`, [`SELECT % AS probe_${protocol}`]);
          } catch (error) { engine = [{ unavailable: true, code: error.code ?? 'ENGINE_CAPTURE_UNAVAILABLE' }]; }
          series.push({ prepareCacheLength, protocol, times, engine, commands, cpuMs: round((usedCpu.user + usedCpu.system) / 1000) });
        }
      } finally { await conn.end(); }
    }
    return series;
  }
  if (input.action === 'explain') {
    await guardFixture(input.subject);
    return db.$queryRaw`EXPLAIN SELECT e.id_external_identity, e.provider, e.issuer, e.subject,
      e.username, e.user_id, u.id_usuario, u.rol_usuario, u.estado_usuario, u.correo_usuario,
      u.nombre_usuario, u.apellido_usuario, p.state AS provision_state
      FROM Usuario u JOIN ExternalIdentity e ON e.user_id = u.id_usuario
      LEFT JOIN IdentityProvisionOperation p ON p.issuer = e.issuer AND p.username = e.username AND p.local_user_id = u.id_usuario
      WHERE e.provider='keycloak' AND e.issuer=${process.env.KEYCLOAK_ISSUER} AND e.subject=${input.subject} FOR UPDATE`;
  }
  if (input.action === 'metadata') {
    return { node: process.version, referenceCommit, prepareCacheLength, database: await db.$queryRaw`SELECT @@version AS version, @@transaction_isolation AS isolationLevel`,
      variables: await db.$queryRaw`SHOW VARIABLES WHERE Variable_name IN ('innodb_buffer_pool_size','max_connections','max_prepared_stmt_count','innodb_flush_log_at_trx_commit','sync_binlog')`,
      status: await db.$queryRaw`SHOW GLOBAL STATUS WHERE Variable_name IN ('Threads_running','Threads_connected','Innodb_buffer_pool_reads','Innodb_buffer_pool_read_requests','Innodb_row_lock_waits','Innodb_row_lock_time','Uptime','Slow_queries')`,
      tls: await db.$queryRaw`SHOW SESSION STATUS LIKE 'Ssl_cipher'`,
      localHost: { totalRamBytes: os.totalmem(), freeRamBytes: os.freemem(), cpuCount: os.cpus().length },
      target: { database: connection.database, tls: connection.sslMode, issuer: process.env.KEYCLOAK_ISSUER } };
  }
  if (input.action === 'ping') {
    const start = performance.now(); await db.$queryRaw`SELECT 1`;
    return { ms: round(performance.now() - start) };
  }
  if (input.action === 'verify-fixture') {
    await guardFixture(input.subject);
    const binding = await services.after.repository.binding(process.env.KEYCLOAK_ISSUER, input.subject);
    const external = await services.after.management.getUser(input.subject);
    const roles = await services.after.management.roles(input.subject);
    const journal = await db.identityProvisionOperation.findUnique({ where: { issuer_username: {
      issuer: process.env.KEYCLOAK_ISSUER, username: binding.username } }, select: { id: true, state: true, local_user_id: true, external_subject: true } });
    return { consistent: binding.subject === external.id && binding.username === external.username && roles.length === 1
      && roles[0].name === binding.Usuario.rol_usuario && binding.Usuario.nombre_usuario === external.firstName
      && binding.Usuario.apellido_usuario === external.lastName && binding.Usuario.correo_usuario === external.email,
    localState: binding.Usuario.estado_usuario, enabled: external.enabled, role: binding.Usuario.rol_usuario,
    ...(input.expectedFirstName ? { expectedNameMatches: binding.Usuario.nombre_usuario === input.expectedFirstName
      && external.firstName === input.expectedFirstName } : {}),
    journalState: journal?.state, journalLinked: journal?.local_user_id === binding.user_id && journal?.external_subject === input.subject,
    revertedAudits: await db.securityAuditEvent.count({ where: { resource_type: 'user', resource_id: String(binding.user_id), outcome: 'reverted' } }),
    auditEvents: await db.securityAuditEvent.count({ where: { OR: [
      { resource_type: 'user', resource_id: String(binding.user_id) },
      { resource_type: 'identity_operation', resource_id: journal?.id ?? '' },
    ] } }) };
  }
  if (input.action !== 'request' || !['before', 'after'].includes(input.version)
    || !/^\/(users|identities|operations)(\/|\?|$)/.test(input.route)) throw Error('UNSUPPORTED_DIAGNOSTIC_ACTION');
  const method = input.method ?? 'GET';
  if (!['GET', 'POST', 'PATCH'].includes(method)) throw Error('UNSUPPORTED_METHOD');
  if (method !== 'GET') {
    if (!allowWrites) throw Error('TEST_WRITES_NOT_AUTHORIZED');
    if (method === 'POST' && input.route === '/identities/prepare') {
      if (!input.body?.identity?.username?.startsWith(prefix)) throw Error('TEST_USERNAME_REQUIRED');
    } else if (method === 'PATCH' && /^\/identities\/[^/]+$/.test(input.route)) {
      await guardFixture(decodeURIComponent(input.route.split('/')[2]));
    } else if (method === 'POST' && /^\/operations\/[^/]+\/reconcile$/.test(input.route)) {
      const operation = await db.identityProvisionOperation.findUnique({ where: { id: input.route.split('/')[2] }, select: { username: true } });
      if (!operation?.username.startsWith(prefix)) throw Error('TEST_OPERATION_REQUIRED');
    } else throw Error('UNSUPPORTED_TEST_MUTATION');
  }
  const start = performance.now();
  const cpu = process.cpuUsage();
  if (input.fault && !((input.fault === 'before-activation' && method === 'POST' && input.route === '/identities/prepare')
    || (input.fault === 'before-local-update-commit' && method === 'PATCH' && /^\/identities\/[^/]+$/.test(input.route)))) {
    throw Error('FAULT_ONLY_ALLOWED_FOR_CURRENT_TEST_CREATION');
  }
  const sample = { label: input.label, version: input.version, prepareCacheLength, method, start,
    ...(input.fault ? { fault: input.fault } : {}), sql: [], rpc: [], stages: [] };
  active = sample;
  try {
    const response = await fetch(origin + `/api/${input.version}/admin/identity` + input.route, {
      method, headers: { authorization: 'Bearer ' + input.token, ...(input.body ? { 'content-type': 'application/json' } : {}) },
      ...(input.body ? { body: JSON.stringify(input.body) } : {}), signal: AbortSignal.timeout(90000),
    });
    const raw = await response.text();
    sample.ms = round(performance.now() - start);
    sample.status = response.status;
    sample.bytes = Buffer.byteLength(raw);
    sample.sqlBeforeResponse = sample.sql.length;
    await Promise.allSettled([...pendingAudits]);
    sample.settledMs = round(performance.now() - start);
    const used = process.cpuUsage(cpu);
    sample.cpuMs = round((used.user + used.system) / 1000);
    sample.heapUsedBytes = process.memoryUsage().heapUsed;
    delete sample.start;
    return { sample, body: JSON.parse(raw) };
  } finally { active = undefined; }
}
const json = value => JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? String(item) : item);
process.stdout.write(json({ ready: true }) + '\n');
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of lines) {
  try { process.stdout.write(json({ ok: true, result: await command(JSON.parse(line)) }) + '\n'); }
  catch (error) { process.stdout.write(json({ ok: false, error: { type: error.name, code: error.code ?? 'DIAGNOSTIC_FAILED' } }) + '\n'); }
}
server.closeAllConnections();
await new Promise(resolve => server.close(resolve));
await db.$disconnect();
// Remove only the source directory created by this invocation, after verifying
// its resolved absolute parent. It never contains inputs or credentials.
const resolvedReference = await fs.realpath(referenceDir);
const resolvedTemp = await fs.realpath(os.tmpdir());
if (path.dirname(resolvedReference).toLowerCase() !== resolvedTemp.toLowerCase()
  || !/^itecsa-users-reference-[a-z0-9]+$/i.test(path.basename(resolvedReference))) throw Error('UNSAFE_REFERENCE_CLEANUP');
await fs.rm(resolvedReference, { recursive: true });

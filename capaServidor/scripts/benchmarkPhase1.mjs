// Opt-in, bounded, SELECT-only diagnostic. Never prints credentials, rows or parameters.
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import mariadb from 'mariadb';
import { resolveDatabaseConnection, createStrictTlsOptions } from '../src/database/connectionConfig.js';
import { identityUserWhere } from '../src/database/identityBinding.js';
import { UserRepository, USER_RESPONSE_SELECT } from '../src/modules/users/repo/users.repo.js';
import { createRequireActiveIdentity } from '../src/middlewares/requireActiveIdentity.js';
import MessageService from '../src/modules/messages/service/message.service.js';
import MessageRepository from '../src/modules/messages/repo/message.repo.js';
import { ROLES_CLAIM, PERMISSIONS as P } from '../../shared/authorization.js';
import express from 'express';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { createCheckJwt } from '../src/middlewares/checkJwt.js';
import { createThrottleMiddleware } from '../src/middlewares/rateLimit.js';
import { MemoryThrottleService } from '../src/modules/security/service/securityThrottle.service.js';
import requireCapability from '../src/middlewares/requireCapability.js';
import { requestContext, respondError } from '../src/errors/httpErrors.js';

if (!process.argv.includes('--allow-development-reads') || process.env.APP_ENV !== 'development') {
  throw Error('Requiere APP_ENV=development y --allow-development-reads. Solo lecturas autorizadas.');
}
const c = resolveDatabaseConnection();
const config = { host: c.host, port: c.port, user: c.user, password: c.password, database: c.database,
  connectionLimit: 10, connectTimeout: 8000, socketTimeout: 15000,
  ...(c.sslMode === 'required' ? { ssl: createStrictTlsOptions(c.host, c.ca) } : {}) };
const db = new PrismaClient({ adapter: new PrismaMariaDb(config), log: [{ emit: 'event', level: 'query' }] });
let selects = 0;
const shapes = new Set();
db.$on('query', e => { if (/^\s*SELECT/i.test(e.query)) selects++; shapes.add(e.query); });
const output = { environment: 'development / diagnostic process / same remote MySQL / strict TLS',
  node: process.version, samples: {}, sql: {}, errors: 0,
  selectCounterCoverage: 'Prisma query events only; driver sample counters are not attached.' };
const identityHttpOnly = process.argv.includes('--identity-http-only');
const httpOnly = process.argv.includes('--http-only') || identityHttpOnly;
const verifyOnly = process.argv.includes('--verify-only');
const pause = () => new Promise(resolve => setTimeout(resolve, 250));
async function sample(name, fn, n = 10) {
  const values = [];
  for (let i = 0; i < n; i++) {
    selects = 0;
    const start = performance.now();
    await fn();
    values.push({ ms: +(performance.now() - start).toFixed(3), selects });
    await pause();
  }
  const sorted = values.map(x => x.ms).sort((a, b) => a - b);
  output.samples[name] = { n, medianMs: sorted.length % 2 ? sorted[sorted.length >> 1]
    : +((sorted[n / 2 - 1] + sorted[n / 2]) / 2).toFixed(3), minMs: sorted[0], maxMs: sorted.at(-1), values };
}
let connection;
let httpServer;
try {
  if (!httpOnly && !verifyOnly) {
    await sample('prismaFirstQuery', () => db.$queryRaw`SELECT 1 AS ok`, 1);
    await sample('prismaWarm', () => db.$queryRaw`SELECT 1 AS ok`);
    connection = await mariadb.createConnection({ ...config, prepareCacheLength: 0 });
    await sample('driverQueryFirst', () => connection.query('SELECT 1 AS ok'), 1);
    await sample('driverQueryWarm', () => connection.query('SELECT 1 AS ok'));
    await sample('driverExecuteFirst', () => connection.execute('SELECT 1 AS ok'), 1);
    await sample('driverExecuteWarm', () => connection.execute('SELECT 1 AS ok'));
    await connection.end(); connection = undefined;
  }
  // Resolve one fixture in memory; nothing identifying it is written to output.
  const binding = await db.externalIdentity.findFirst({ where: { provider: 'keycloak',
    issuer: process.env.KEYCLOAK_ISSUER.trim(), Usuario: { is: { estado_usuario: 'Activo' } } },
    orderBy: { user_id: 'asc' }, select: { subject: true } });
  if (!binding) throw Error('No hay fixture activo para la lectura.');
  const subject = binding.subject;
  const repository = new UserRepository({ prisma: db });
  const legacy = { async findBySubject(sub) {
    const u = await db.usuario.findFirst({ where: identityUserWhere(sub), select: USER_RESPONSE_SELECT });
    return u ? { idUsuario: u.id_usuario, identitySubject: u.ExternalIdentity?.subject ?? null,
      correoUsuario: u.correo_usuario, rutUsuario: u.rut_usuario, nombreUsuario: u.nombre_usuario,
      apellidoUsuario: u.apellido_usuario, rolUsuario: u.rol_usuario, estadoUsuario: u.estado_usuario } : null;
  } };
  const expected = await legacy.findBySubject(subject);
  if (verifyOnly) {
    const fixtures = await db.externalIdentity.findMany({ where: { provider: 'keycloak', issuer: process.env.KEYCLOAK_ISSUER.trim() },
      orderBy: { user_id: 'asc' }, take: 5, select: { subject: true } });
    for (const fixture of fixtures) assert.deepEqual(await repository.findBySubject(fixture.subject), await legacy.findBySubject(fixture.subject));
    for (const sub of ['phase1-missing-binding-fixture', "phase1' OR 1=1 --"]) {
      assert.equal(await legacy.findBySubject(sub), null);
      assert.equal(await repository.findBySubject(sub), null);
    }
    const configuredIssuer = process.env.KEYCLOAK_ISSUER;
    try {
      process.env.KEYCLOAK_ISSUER = 'https://phase1.invalid/other-issuer';
      assert.equal(await legacy.findBySubject(subject), null);
      assert.equal(await repository.findBySubject(subject), null);
    } finally { process.env.KEYCLOAK_ISSUER = configuredIssuer; }
    output.equivalence = { comparedBindings: fixtures.length, missingBinding: true, injectionParameter: true, otherIssuer: true };
  } else {
    if (!httpOnly) {
      shapes.clear();
      await sample('identityLegacy', () => legacy.findBySubject(subject));
      output.sql.legacy = [...shapes]; shapes.clear();
      await sample('identityCurrent', async () => assert.deepEqual(await repository.findBySubject(subject), expected));
      output.sql.current = [...shapes]; shapes.clear();
    }
    const payload = { sub: subject, [ROLES_CLAIM]: [expected.rolUsuario], permissions: [] };
    async function resolve(repo) {
      const req = { identityProvider: 'keycloak', auth: { payload: { ...payload } } };
      let passed = false;
      const res = { status() { return this; }, json() { throw Error('Identidad rechazada.'); } };
      await createRequireActiveIdentity({ repository: repo })(req, res, () => { passed = true; });
      assert.ok(passed);
      return req;
    }
    if (!httpOnly) await sample('middlewareCurrent', () => resolve(repository));
    const messages = new MessageService({ repo: new MessageRepository({ prisma: db }), userRepo: repository });
    const oldMessages = new MessageService({ repo: new MessageRepository({ prisma: db }), userRepo: legacy });
    const previous = await oldMessages.getNotifications(subject);
    if (!httpOnly) {
      await sample('notificationsLegacyFlow', async () => {
        await resolve(legacy);
        assert.deepEqual(await oldMessages.getNotifications(subject), previous);
      });
      await sample('notificationsCurrentFlow', async () => {
        const req = await resolve(repository);
        assert.deepEqual(await messages.getNotifications(subject, {}, { currentUser: req.currentUser }), previous);
      });
    } else {
      // Entirely local JWT/JWKS authority and HTTP listener; no enterprise login,
      // token, admin call or SQL quota writes. Business and identity reads use TLS.
      output.httpHarness = 'loopback / synthetic RS256 authority / real SELECTs / memory quota 120 per minute';
      const { privateKey, publicKey } = await generateKeyPair('RS256');
      const jwk = { ...await exportJWK(publicKey), kid: 'phase1', alg: 'RS256', use: 'sig' };
      const app = express(); app.locals.errorLogger = { error() {} };
      app.use(requestContext);
      app.get('/certs', (_req, res) => res.json({ keys: [jwk] }));
      httpServer = app.listen(0, '127.0.0.1');
      await new Promise(resolve => httpServer.once('listening', resolve));
      const origin = `http://127.0.0.1:${httpServer.address().port}`;
      const environment = { APP_ENV: 'test', KEYCLOAK_ALLOW_HTTP: 'true', KEYCLOAK_ISSUER: origin,
        KEYCLOAK_JWKS_URI: `${origin}/certs`, KEYCLOAK_AUDIENCE: 'api', KEYCLOAK_CLIENT_ID: 'web', KEYCLOAK_ROLE_CLIENT_ID: 'api' };
      const throttle = new MemoryThrottleService();
      const rateLimit = createThrottleMiddleware({ throttle, rules: req => [{ scope: 'authenticated-read',
        subject: req.currentUser.idUsuario, limit: 120, windowMs: 60_000 }] });
      for (const [route, repo, service] of [['legacy', legacy, oldMessages], ['current', repository, messages]]) {
        const authenticate = createCheckJwt({ environment, rateLimit, requireIdentity: createRequireActiveIdentity({ repository: repo }) });
        app.get(`/${route}`, authenticate, requireCapability(P.READ_MESSAGES), async (req, res, next) => {
          try {
            if (identityHttpOnly) assert.deepEqual(req.currentUser, expected);
            else {
              const result = await service.getNotifications(subject, {}, route === 'current' ? { currentUser: req.currentUser } : undefined);
              assert.deepEqual(result, previous);
            }
            res.json({ ok: true }); // Never expose business rows through this listener.
          } catch (error) { next(error); }
        });
      }
      app.use((err, req, res, _next) => respondError(err, req, res));
      const token = await new SignJWT({ sub: subject, typ: 'Bearer', azp: 'web',
        resource_access: { api: { roles: [expected.rolUsuario] } }, permissions: [P.READ_MESSAGES] })
        .setProtectedHeader({ alg: 'RS256', kid: 'phase1' }).setIssuer(origin).setAudience('api')
        .setIssuedAt().setExpirationTime('10m').sign(privateKey);
      const read = async route => {
        const response = await fetch(`${origin}/${route}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) });
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { ok: true });
      };
      const prefix = identityHttpOnly ? 'httpIdentity' : 'httpNotifications';
      await sample(`${prefix}LegacyFirst`, () => read('legacy'), 1);
      await sample(`${prefix}CurrentFirst`, () => read('current'), 1);
      await sample(`${prefix}LegacyWarm`, () => read('legacy'));
      await sample(`${prefix}CurrentWarm`, () => read('current'));
    }
  }
  // Concurrency/load against the remote database is deliberately excluded.
} catch {
  output.errors++;
  process.exitCode = 1;
} finally {
  if (httpServer) {
    httpServer.closeAllConnections();
    await new Promise(resolve => httpServer.close(resolve));
  }
  const cleanup = await Promise.allSettled([connection?.end(), db.$disconnect()]);
  if (cleanup.some(result => result.status === 'rejected')) { output.errors++; process.exitCode = 1; }
  console.log(JSON.stringify(output, null, 2));
}

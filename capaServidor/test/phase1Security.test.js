import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { createCheckJwt } from '../src/middlewares/checkJwt.js';
import { createRequireActiveIdentity } from '../src/middlewares/requireActiveIdentity.js';
import { createThrottleMiddleware } from '../src/middlewares/rateLimit.js';
import { MemoryThrottleService, SecurityThrottleService, RateLimitExceededError } from '../src/modules/security/service/securityThrottle.service.js';
import { createMessageRouter } from '../src/modules/messages/routes/message.routes.js';
import MessageService from '../src/modules/messages/service/message.service.js';
import MessageController from '../src/modules/messages/controller/message.controller.js';
import { requestContext, respondError } from '../src/errors/httpErrors.js';
import { PinService } from '../src/modules/auth/service/pin.service.js';
import { ROLES, ROLE_PERMISSIONS, PERMISSIONS as P } from '../../shared/authorization.js';
import { createAuthRouter } from '../src/modules/auth/routes/auth.routes.js';
import { createOrderRouter } from '../src/modules/orders/routes/order.routes.js';
import { createOrderDetailRouter } from '../src/modules/orders/routes/orderDetail.routes.js';
import { createOrderHistoryRouter } from '../src/modules/history/routes/orderHistory.routes.js';
import { createMetricsRouter } from '../src/modules/metrics/routes/metrics.routes.js';
import { createProductionLoadRouter } from '../src/modules/productionLoad/routes/productionLoad.routes.js';
import { createPrivacyRouter } from '../src/modules/privacy/routes/privacy.routes.js';
import { createIncidentReportRouter } from '../src/modules/security/routes/incidentReport.routes.js';
import { createKeycloakIdentityPreparationRouter } from '../src/modules/users/routes/keycloakIdentityPreparation.routes.js';

async function listen(t, app) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return `http://127.0.0.1:${server.address().port}`;
}
async function fixture(t, { limit = 120, modules = false } = {}) {
  const keys = await generateKeyPair('RS256'), wrongKeys = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(keys.publicKey), kid: 'test', alg: 'RS256', use: 'sig' };
  const jwks = express(); jwks.get('/certs', (_req, res) => res.json({ keys: [jwk] }));
  const origin = await listen(t, jwks);
  const environment = { APP_ENV: 'test', KEYCLOAK_ALLOW_HTTP: 'true', KEYCLOAK_ISSUER: origin,
    KEYCLOAK_JWKS_URI: `${origin}/certs`, KEYCLOAK_AUDIENCE: 'api', KEYCLOAK_CLIENT_ID: 'web', KEYCLOAK_ROLE_CLIENT_ID: 'api' };
  const users = new Map(['alice', 'bob'].map((subject, index) => [subject,
    { idUsuario: index + 1, identitySubject: subject, rolUsuario: ROLES.PRODUCCION, estadoUsuario: 'Activo' }]));
  let lookups = 0;
  const repository = { findBySubject: async sub => {
    lookups++; await new Promise(resolve => setImmediate(resolve)); return users.get(sub);
  } };
  const throttle = new MemoryThrottleService();
  const authenticate = createCheckJwt({ environment, requireIdentity: createRequireActiveIdentity({ repository,
    readKeycloakRoles: async subject => [{ name: users.get(subject)?.rolUsuario }] }),
    rateLimit: createThrottleMiddleware({ throttle, rules: req => [{ scope: 'authenticated-read',
      subject: req.currentUser.idUsuario, limit, windowMs: 60_000 }] }) });
  const service = new MessageService({ userRepo: { findBySubject: () => assert.fail('duplicate identity') }, repo: {
    listInbox: async ({ userId }) => ({ messages: [{ recipient: userId }], total: 1 }),
    listNotifications: async id => [{ recipient: id }], countUnreadNotifications: async () => 1,
    findUserMessage: async (id, messageId) => messageId === id ? { recipient: id, leido: false, oculto: false } : null,
    markAsRead: async id => ({ recipient: id, leido: true }),
    hideNotification: async id => ({ recipient: id, oculto: true }), hideAllNotifications: async () => ({ count: 1 }),
  } });
  const app = express(); app.locals.errorLogger = { error() {} };
  app.use(express.json(), requestContext);
  app.use('/messages', createMessageRouter({ authenticate, controller: new MessageController({ service }) }));
  if (modules) {
    const ok = (req, res) => {
      assert.equal(req.currentUser.idUsuario, 1);
      assert.equal(req.currentUser.identitySubject, 'alice');
      res.json({ actor: req.currentUser.idUsuario });
    };
    const controller = new Proxy({}, { get: () => ok });
    app.use('/auth', createAuthRouter({ authenticate, users: { listRecentRecords: async id => { assert.equal(id, 1); return []; } } }));
    app.use('/orders', createOrderRouter({ authenticate, controller }));
    app.use('/order-details', createOrderDetailRouter({ authenticate, controller }));
    app.use('/history', createOrderHistoryRouter({ authenticate, controller }));
    app.use('/metrics', createMetricsRouter({ authenticate, controller }));
    app.use('/load', createProductionLoadRouter({ authenticate, controller }));
    app.use('/privacy', createPrivacyRouter({ authenticate, controller, throttle: new MemoryThrottleService() }));
    app.use('/incidents', createIncidentReportRouter({ authenticate, controller, throttle: new MemoryThrottleService() }));
    app.use('/admin', createKeycloakIdentityPreparationRouter({ authenticate, service: {
      summary: async context => { assert.equal(context.subject, 'alice'); return { actor: 1 }; },
    } }));
  }
  app.use((err, req, res, _next) => respondError(err, req, res));
  const api = await listen(t, app);
  async function token(changes = {}, wrongKey = false) {
    return new SignJWT({ iss: origin, aud: 'api', sub: 'alice', sid: 'synthetic-session', typ: 'Bearer', azp: 'web',
      resource_access: { api: { roles: [ROLES.PRODUCCION] } }, permissions: [P.READ_MESSAGES, P.UPDATE_MESSAGES],
      iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 120, ...changes })
      .setProtectedHeader({ alg: 'RS256', kid: 'test' }).sign(wrongKey ? wrongKeys.privateKey : keys.privateKey);
  }
  const get = (bearer, path = '/messages', options = {}) => fetch(`${api}${path}`, {
    ...options, headers: { ...(bearer ? { authorization: `Bearer ${bearer}` } : {}), ...options.headers },
  });
  return { token, get, users, lookups: () => lookups };
}

test('real JWT signature, issuer, audience, expiry and capabilities guard the optimized message flow', async t => {
  const f = await fixture(t);
  for (const [name, bearer, status] of [
    ['absent', null, 401], ['malformed', 'invalid', 401],
    ['expired', await f.token({ exp: Math.floor(Date.now() / 1000) - 120 }), 401],
    ['signature', await f.token({}, true), 401], ['issuer', await f.token({ iss: 'https://other.invalid' }), 401],
    ['audience', await f.token({ aud: 'other' }), 401], ['missing binding', await f.token({ sub: 'missing' }), 403],
    ['permission', await f.token({ permissions: [] }), 403],
    ['client', await f.token({ azp: 'other' }), 403],
    ['role', await f.token({ resource_access: { api: { roles: [ROLES.VENTAS] } } }), 403],
  ]) assert.equal((await f.get(bearer)).status, status, name);
  const before = f.lookups();
  const res = await f.get(await f.token());
  assert.equal(res.status, 200);
  assert.ok(res.headers.get('x-request-id'));
  assert.equal((await res.json()).messages[0].recipient, 1);
  assert.equal(f.lookups(), before + 1);
});
test('simultaneous HTTP requests, account changes, role changes, unlink and logout do not reuse previous identities', async t => {
  const f = await fixture(t), alice = await f.token(), bob = await f.token({ sub: 'bob' });
  const results = await Promise.all([alice, bob, alice, bob].map(async token => (await (await f.get(token)).json()).messages[0].recipient));
  assert.deepEqual(results, [1, 2, 1, 2]); assert.equal(f.lookups(), 4);
  assert.equal((await f.get(null)).status, 401);
  f.users.get('alice').estadoUsuario = 'Desvinculado';
  assert.equal((await f.get(alice)).status, 403);
  f.users.get('bob').rolUsuario = ROLES.VENTAS;
  assert.equal((await f.get(bob)).status, 403);
  f.users.delete('bob');
  assert.equal((await f.get(bob)).status, 403);
});
test('HTTP message ownership and actor injection cannot bypass the validated request user', async t => {
  const f = await fixture(t), token = await f.token();
  for (const [method, path, status] of [
    ['GET', '/messages/1', 200], ['GET', '/messages/2', 404],
    ['GET', '/messages/notifications?currentUser=2', 200],
    ['PATCH', '/messages/1/read', 200], ['PATCH', '/messages/2/read', 404],
    ['PATCH', '/messages/notifications/1', 200], ['PATCH', '/messages/notifications/2', 404],
    ['PATCH', '/messages/notifications', 200],
  ]) {
    const res = await f.get(token, path, { method,
      ...(method === 'PATCH' ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentUser: { idUsuario: 2 }, sub: 'bob' }) } : {}) });
    assert.equal(res.status, status, `${method} ${path}`);
    const data = await res.json();
    if (data.recipient !== undefined) assert.equal(data.recipient, 1);
  }
  assert.equal(f.lookups(), 8);
});
test('HTTP quota still returns 429 and isolates actors under concurrent requests', async t => {
  const f = await fixture(t, { limit: 2 }), alice = await f.token(), bob = await f.token({ sub: 'bob' });
  const statuses = await Promise.all(Array.from({ length: 4 }, async () => (await f.get(alice)).status));
  assert.deepEqual(statuses.sort(), [200, 200, 429, 429]);
  assert.equal((await f.get(bob)).status, 200);
});

test('consumer routers keep identity and authorization gates across profile, users, production, payments, history, metrics, calendar, sales, privacy and incidents', async t => {
  const f = await fixture(t, { modules: true });
  const protectedRoutes = [['/auth/profile', P.READ_PROFILE], ['/admin/users/summary', P.MANAGE_USERS],
    ['/orders/kanban', P.READ_ORDERS], ['/order-details/1', P.READ_ORDERS], ['/orders/payments', P.READ_PAYMENTS],
    ['/history/orders', P.READ_ORDERS], ['/metrics/summary', P.VIEW_METRICS], ['/orders/calendar-summary', P.READ_CALENDAR],
    ['/orders/sales-notes/123', P.READ_SALES_NOTES], ['/load/today', P.READ_CAPACITY]];
  let token;
  for (const [path, permission] of protectedRoutes) {
    const role = Object.entries(ROLE_PERMISSIONS).find(([, permissions]) => permissions.includes(permission))[0];
    f.users.get('alice').rolUsuario = role;
    const claims = { resource_access: { api: { roles: [role] } }, permissions: ROLE_PERMISSIONS[role] };
    token = await f.token(claims);
    const denied = await f.token({ ...claims, permissions: [] });
    assert.equal((await f.get(null, path)).status, 401, path);
    assert.equal((await f.get(denied, path)).status, 403, path);
    assert.equal((await f.get(token, path)).status, 200, path);
  }
  assert.equal((await f.get(null, '/incidents/config')).status, 401);
  assert.equal((await f.get(token, '/incidents/config')).status, 200);
  assert.equal((await f.get(null, '/privacy/requests', { method: 'POST' })).status, 401);
  assert.equal((await f.get(token, '/privacy/requests', { method: 'POST' })).status, 200);
  f.users.get('alice').estadoUsuario = 'Desvinculado';
  for (const [path] of protectedRoutes) assert.equal((await f.get(token, path)).status, 403, path);
});

test('SQL-mode quota retains its transactional increment, hashed actor and counters (serialized DB double)', async () => {
  const rows = new Map(); let tail = Promise.resolve(), increments = 0;
  const prisma = { $transaction(fn) {
    const run = tail.then(() => fn({
      $executeRaw: async (sql, ...args) => {
        assert.match(sql.join('?'), /INSERT INTO SecurityThrottle/);
        assert.match(sql.join('?'), /ON DUPLICATE KEY UPDATE/);
        const [scope, hash, now, expires] = args;
        assert.match(hash, /^[a-f0-9]{64}$/);
        const key = `${scope}:${hash}`, old = rows.get(key);
        rows.set(key, { request_count: !old || old.expires_at <= now ? 1 : old.request_count + 1, expires_at: old?.expires_at > now ? old.expires_at : expires });
        increments++;
      },
      securityThrottle: { findUnique: async ({ where }) => structuredClone(rows.get(`${where.scope_subject_hash.scope}:${where.scope_subject_hash.subject_hash}`)) },
    }));
    tail = run.catch(() => {}); return run;
  } };
  const quota = new SecurityThrottleService({ prisma, secret: Buffer.alloc(32, 7).toString('base64') });
  const rule = { scope: 'read', subject: 'alice', limit: 2, windowMs: 60_000 };
  const result = await Promise.allSettled(Array.from({ length: 4 }, () => quota.consume(rule)));
  assert.equal(result.filter(x => x.status === 'fulfilled').length, 2);
  assert.ok(result.filter(x => x.status === 'rejected').every(x => x.reason instanceof RateLimitExceededError));
  await quota.consume({ ...rule, subject: 'bob' }); await quota.consume({ ...rule, scope: 'write' });
  assert.equal(rows.size, 3); assert.equal(increments, 6);
  assert.equal([...rows.values()][0].request_count, 4);
});

test('PIN keeps independent locked lookup, accumulated attempts and concurrent lockout after request identity reuse', async t => {
  const previous = process.env.KEYCLOAK_ISSUER; process.env.KEYCLOAK_ISSUER = 'https://test.invalid';
  t.after(() => { if (previous === undefined) delete process.env.KEYCLOAK_ISSUER; else process.env.KEYCLOAK_ISSUER = previous; });
  let user = { id_usuario: 1, estado_usuario: 'Activo', pin_failed_attempts: 0 }, locks = 0, tail = Promise.resolve();
  const tx = { $queryRaw: async (sql, ...args) => {
    assert.match(sql.join('?'), /FOR UPDATE/); assert.deepEqual(args, ['keycloak', 'https://test.invalid', 'alice']);
    locks++; return [user];
  }, usuario: { update: async ({ data }) => { Object.assign(user, data); } } };
  const pins = new PinService({ secret: Buffer.alloc(32, 8).toString('base64'), prisma: { $transaction(fn) {
    const run = tail.then(() => fn(tx)); tail = run.catch(() => {}); return run;
  } } });
  const credential = await pins.buildCredential();
  Object.assign(user, credential.data, { pin_accepted_at: new Date() });
  assert.equal((await pins.validate('alice', credential.pin)).idUsuario, 1);
  user.pin_accepted_at = null;
  await assert.rejects(pins.validate('alice', credential.pin), { code: 'PIN_NOT_ACKNOWLEDGED' });
  user.pin_accepted_at = new Date();
  const wrong = credential.pin === '000000' ? '111111' : '000000';
  const attempts = await Promise.allSettled(Array.from({ length: 5 }, () => pins.validate('alice', wrong)));
  assert.ok(attempts.every(x => x.status === 'rejected' && x.reason.code === 'PIN_INVALID'));
  assert.ok(user.pin_locked_until > new Date());
  await assert.rejects(pins.validate('alice', credential.pin), { code: 'PIN_LOCKED' });
  user.estado_usuario = 'Desvinculado';
  await assert.rejects(pins.validate('alice', credential.pin), { code: 'PIN_USER_UNAVAILABLE' });
  assert.equal(locks, 9);
});

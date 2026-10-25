import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { test } from 'node:test';
import express from 'express';
import * as policy from '../../shared/keycloakAuthorization.js';
import { createCheckJwt } from '../src/middlewares/checkJwt.js';
import requireCapability from '../src/middlewares/requireCapability.js';
import { createRequireActiveIdentity } from '../src/middlewares/requireActiveIdentity.js';
import { createVerifyAuthSessionHandler } from '../src/modules/auth/controller/auth.controller.js';
import { createAdminUsersRouter } from '../src/modules/users/routes/adminUsers.routes.js';
import { createMetricsRouter } from '../src/modules/metrics/routes/metrics.routes.js';
import { createOrderRouter } from '../src/modules/orders/routes/order.routes.js';
import { createOrderHistoryRouter } from '../src/modules/history/routes/orderHistory.routes.js';
import { createMessageRouter } from '../src/modules/messages/routes/message.routes.js';
import { UserRepository } from '../src/modules/users/repo/users.repo.js';
import getPrismaClient, { disconnectPrismaClient } from '../src/database/prisma.js';

const enabled = process.env.RUN_KEYCLOAK_REAL_INTEGRATION === 'true';
// Development/runtime images do not need laboratory fixtures unless explicitly enabled.
const { LAB, LAB_USERS } = enabled ? await import('../../scripts/keycloak-phase02-realm.mjs') : {};
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const decode = token => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());

function assertIsolatedTarget() {
  assert.equal(process.env.APP_ENV, 'test');
  assert.equal(process.env.NODE_ENV, 'test');
  assert.equal(process.env.KEYCLOAK_ISSUER, LAB.issuer);
  assert.equal(process.env.KEYCLOAK_ROLE_CLIENT_ID, LAB.roleClientId);
  assert.equal(process.env.DB_HOST, 'phase02-mysql');
  assert.equal(process.env.DB_PORT, '3306');
  assert.equal(process.env.DB_NAME, 'itecsa_identity_phase02_test');
  assert.equal(process.env.DB_USER, 'phase02_test');
  assert.equal(process.env.DB_SSL_MODE, 'disabled');
  const url = new URL(process.env.DATABASE_URL);
  assert.equal(url.hostname, process.env.DB_HOST);
  assert.equal(url.pathname, '/' + process.env.DB_NAME);
  assert.equal(url.username, process.env.DB_USER);
  assert.equal(decodeURIComponent(url.password), process.env.DB_PASSWORD);
}

async function ready() {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch(LAB.issuer + '/.well-known/openid-configuration', { signal: AbortSignal.timeout(1000) });
      if (response.ok) {
        const discovery = await response.json();
        assert.equal(discovery.issuer, LAB.issuer);
        return discovery;
      }
    } catch { /* only the fixed disposable endpoint is retried */ }
    await pause(500);
  }
  throw Error('Keycloak de laboratorio no disponible.');
}

async function authorizationCode(username) {
  const verifier = randomBytes(32).toString('base64url');
  const state = randomBytes(16).toString('hex');
  const url = new URL(LAB.issuer + '/protocol/openid-connect/auth');
  url.search = new URLSearchParams({ client_id: LAB.clientId, response_type: 'code', scope: 'openid',
    redirect_uri: LAB.redirectUri, state, nonce: randomBytes(16).toString('hex'),
    code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' });
  const cookies = new Map();
  const remember = response => {
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';')[0];
      const split = pair.indexOf('=');
      cookies.set(pair.slice(0, split), pair.slice(split + 1));
    }
  };
  const page = await fetch(url, { redirect: 'manual' });
  remember(page);
  assert.equal(page.status, 200, 'Authorization Code must show the login form');
  const html = await page.text();
  const form = html.match(/<form\b[^>]*id="kc-form-login"[^>]*action="([^"]+)"/);
  assert.ok(form, 'Keycloak login form is required; do not silently use a password grant');
  const action = new URL(form[1].replaceAll('&amp;', '&'));
  assert.equal(action.origin, new URL(LAB.issuer).origin);
  const login = await fetch(action, { method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: [...cookies].map(([key, value]) => key + '=' + value).join('; ') },
    body: new URLSearchParams({ username, password: LAB.password, credentialId: '' }) });
  remember(login);
  assert.equal(login.status, 302, 'synthetic account must finish authentication without required actions');
  const callback = new URL(login.headers.get('location'));
  assert.equal(callback.origin + callback.pathname, LAB.redirectUri);
  assert.equal(callback.searchParams.get('state'), state);
  assert.equal(callback.searchParams.has('error'), false);
  assert.ok(callback.searchParams.get('code'));
  return { code: callback.searchParams.get('code'), verifier };
}

async function tokenRequest(parameters) {
  return fetch(LAB.issuer + '/protocol/openid-connect/token', { method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: LAB.clientId, ...parameters }) });
}

async function login(username) {
  const authorization = await authorizationCode(username);
  const parameters = { grant_type: 'authorization_code', redirect_uri: LAB.redirectUri,
    code: authorization.code, code_verifier: authorization.verifier };
  const response = await tokenRequest(parameters);
  assert.equal(response.status, 200);
  const tokens = await response.json();
  assert.ok(tokens.access_token && tokens.refresh_token && tokens.id_token);
  return { tokens, parameters };
}

test('phase 02: Keycloak 26.8.1 + MySQL real, synthetic Code/PKCE and identity authorization', { skip: !enabled }, async t => {
  assertIsolatedTarget();
  await ready();
  console.log('Keycloak real disponible; preparando solo la base efimera...');
  if (process.env.LAB_STAGE !== 'restart') {
    const cli = '/app/tooling/prisma/node_modules/prisma/build/index.js';
    const config = '/app/capaServidor/prisma.config.ts';
    const sql = execFileSync(process.execPath, [cli, 'migrate', 'diff', '--config', config,
      '--from-empty', '--to-schema', '/app/capaServidor/prisma/schema.prisma', '--script'], { encoding: 'utf8' });
    execFileSync(process.execPath, [cli, 'db', 'execute', '--config', config, '--stdin'], { input: sql, encoding: 'utf8' });
  }
  const db = getPrismaClient();
  t.after(disconnectPrismaClient);
  const database = await db.$queryRaw`SELECT DATABASE() AS name`;
  assert.equal(database[0].name, 'itecsa_identity_phase02_test');
  const repository = new UserRepository({ prisma: db });
  let auth0Calls = 0;
  const requireIdentity = createRequireActiveIdentity({ repository,
    async resolveAuth0Role() { auth0Calls++; throw Error('Auth0 is forbidden in this laboratory'); } });
  const authenticate = createCheckJwt({ requireIdentity, rateLimit: (_req, _res, next) => next() });
  const app = express();
  app.get('/verify', authenticate, requireCapability('read:own-profile'), createVerifyAuthSessionHandler());
  app.use('/admin', createAdminUsersRouter({ authenticate }));
  // Exercise actual route authorization without business SQL; identity resolution still uses real MySQL.
  const viewController = new Proxy({}, { get: () => (_req, res) => res.sendStatus(204) });
  for (const [path, factory] of [['/orders', createOrderRouter], ['/metrics', createMetricsRouter],
    ['/history', createOrderHistoryRouter], ['/messages', createMessageRouter]]) app.use(path, factory({ authenticate, controller: viewController }));
  app.get('/cap/:permission', authenticate, (req, res, next) => requireCapability(req.params.permission)(req, res, next), (_req, res) => res.sendStatus(204));
  app.use((error, _req, res, _next) => res.status(error.status || 503).end());
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (token, path = '/verify') => fetch(base + path, { headers: { authorization: `Bearer ${token}` } });
  async function bind(tokens, username, role) {
    const sub = decode(tokens.access_token).sub;
    assert.equal(typeof sub, 'string', 'basic scope must emit the stable subject');
    assert.ok(sub);
    return db.usuario.upsert({ where: { id_auth0: sub },
      create: { id_auth0: sub, correo_usuario: `${username}@example.invalid`, nombre_usuario: 'Synthetic',
        apellido_usuario: 'Phase02', estado_usuario: 'Activo', rol_usuario: role },
      update: { estado_usuario: 'Activo', rol_usuario: role } });
  }

  if (process.env.LAB_STAGE === 'restart') {
    await t.test('new Code+PKCE login and API verification survive a Keycloak restart', async () => {
      const { tokens } = await login(LAB_USERS[7].username);
      await bind(tokens, LAB_USERS[7].username, 'Desarrollador');
      assert.equal((await request(tokens.access_token)).status, 200);
      assert.equal((await request(tokens.access_token, '/cap/manage%3Ausers')).status, 403);
    });
    assert.equal(auth0Calls, 0);
    return;
  }

  for (const { username, role } of LAB_USERS) await t.test(`real role ${role}: Code+PKCE, 25 capabilities, local subject and verify contract`, async () => {
    const { tokens } = await login(username);
    const decoded = decode(tokens.access_token);
    assert.deepEqual(decoded.resource_access[LAB.roleClientId].roles, [role]);
    assert.deepEqual([...decoded.permissions].sort(), [...policy.ROLE_PERMISSIONS[role]].sort());
    const local = await bind(tokens, username, role);
    for (const permission of policy.BUSINESS_PERMISSIONS) {
      assert.equal((await request(tokens.access_token, '/cap/' + encodeURIComponent(permission))).status,
        policy.ROLE_PERMISSIONS[role].includes(permission) ? 204 : 403, `${role}: ${permission}`);
    }
    const verified = await (await request(tokens.access_token)).json();
    assert.equal(verified.sub, decoded.sub);
    assert.equal(verified.rolUsuario, role);
    assert.equal(verified.authorizationPolicy, policy.POLICY_ID);
    assert.deepEqual([...verified.permissions].sort(), [...policy.ROLE_PERMISSIONS[role]].sort());
    assert.equal((await request(tokens.id_token)).status, 401, 'ID token is not an API access token');
    try {
      await db.usuario.update({ where: { id_usuario: local.id_usuario }, data: { rol_usuario: role === 'Soporte' ? 'Desarrollador' : 'Soporte' } });
      assert.equal((await request(tokens.access_token)).status, 403, `${role}: old token after a local role change`);
    } finally {
      await db.usuario.update({ where: { id_usuario: local.id_usuario }, data: { rol_usuario: role } });
    }
    for (const [path, permission] of [['/orders/kanban', 'read:orders'], ['/orders/calendar-summary', 'read:production-calendar'],
      ['/orders/payments', 'read:payments'], ['/orders/sales-notes/NV1', 'read:sales-notes'], ['/history/orders', 'read:orders'],
      ['/history/orders/17', 'read:orders'], ['/metrics/summary', 'view:metrics'], ['/metrics/production-performance', 'view:metrics'],
      ['/messages', 'read:own-messages'], ['/messages/42', 'read:own-messages']]) {
      assert.equal((await request(tokens.access_token, path)).status, policy.ROLE_PERMISSIONS[role].includes(permission) ? 204 : 403, `${role} ${path}`);
    }
    // Actual administrative router: navigation grants cannot open Auth0 operations.
    for (const [method, path] of [['GET', '/users'], ['GET', '/users/summary'], ['GET', '/users/17/movements'],
      ['POST', '/users'], ['POST', '/users/password-setup-email'], ['PATCH', '/users/17'], ['PATCH', '/users/17/status']]) {
      const response = await fetch(base + '/admin' + path, { method, headers: { authorization: `Bearer ${tokens.access_token}` } });
      assert.equal(response.status, role === 'Soporte' ? 503 : 403, `${role} ${method} ${path}`);
    }
  });
  await t.test('old realm Soporte and two effective application roles cannot log into ITECSA', async () => {
    for (const username of ['phase02-legacy-support', 'phase02-multiple']) {
      const { tokens } = await login(username);
      assert.equal((await request(tokens.access_token)).status, 403);
    }
  });
  await t.test('misconfigured excessive grants never restore user management to AP', async () => {
    const { tokens } = await login('phase02-excessive');
    assert.equal(decode(tokens.access_token).permissions.includes('manage:users'), true);
    await bind(tokens, 'phase02-excessive', 'Administrador Produccion');
    assert.equal((await request(tokens.access_token, '/cap/manage%3Ausers')).status, 403);
  });
  await t.test('concurrent requests from different real subjects never share roles or local users', async () => {
    const developer = await login(LAB_USERS[7].username);
    const support = await login(LAB_USERS[8].username);
    await bind(developer.tokens, LAB_USERS[7].username, 'Desarrollador');
    await bind(support.tokens, LAB_USERS[8].username, 'Soporte');
    const results = await Promise.all(Array.from({ length: 20 }, (_, index) => request(
      index % 2 ? support.tokens.access_token : developer.tokens.access_token, '/cap/read%3Aorders')));
    results.forEach((response, index) => assert.equal(response.status, index % 2 ? 403 : 204));
  });
  await t.test('old JWT cannot authorize a changed role or inactive local account; subject binding is required', async () => {
    const { tokens } = await login(LAB_USERS[7].username);
    const user = await bind(tokens, LAB_USERS[7].username, 'Desarrollador');
    try {
      await db.usuario.update({ where: { id_usuario: user.id_usuario }, data: { rol_usuario: 'Administrador Produccion' } });
      assert.equal((await request(tokens.access_token)).status, 403);
      await db.usuario.update({ where: { id_usuario: user.id_usuario }, data: { rol_usuario: 'Desarrollador', estado_usuario: 'Desvinculado' } });
      assert.equal((await request(tokens.access_token)).status, 403);
      // The existing id_auth0 column is NOT NULL: use a different synthetic subject.
      await db.usuario.update({ where: { id_usuario: user.id_usuario }, data: { estado_usuario: 'Activo', id_auth0: `detached-${user.id_usuario}` } });
      assert.equal((await request(tokens.access_token)).status, 403);
    } finally {
      await db.usuario.update({ where: { id_usuario: user.id_usuario }, data: {
        id_auth0: decode(tokens.access_token).sub, rol_usuario: 'Desarrollador', estado_usuario: 'Activo',
      } });
    }
    assert.equal((await request(tokens.access_token)).status, 200);
  });
  await t.test('real refresh returns a fresh access token and authorization codes cannot be reused', async () => {
    const { tokens, parameters } = await login(LAB_USERS[7].username);
    await bind(tokens, LAB_USERS[7].username, 'Desarrollador');
    const refreshed = await tokenRequest({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token });
    assert.equal(refreshed.status, 200);
    const next = await refreshed.json();
    assert.equal((await request(next.access_token)).status, 200);
    // Replaying a consumed code may revoke its session; do it after testing refresh.
    assert.equal((await tokenRequest(parameters)).status, 400);
    const rejected = await tokenRequest({ grant_type: 'refresh_token', refresh_token: 'undefined' });
    assert.equal(rejected.status, 400);
    assert.equal((await rejected.json()).error, 'invalid_grant');
  });
  await t.test('PKCE is enforced by the real server', async () => {
    const authorization = await authorizationCode(LAB_USERS[7].username);
    const response = await tokenRequest({ grant_type: 'authorization_code', redirect_uri: LAB.redirectUri,
      code: authorization.code, code_verifier: randomBytes(32).toString('base64url') });
    assert.equal(response.status, 400);
  });
  if (process.env.RUN_KEYCLOAK_PRODUCTION_INTEGRATION === 'true') {
    const { runProductionRegression } = await import('./fixtures/keycloakProduction.mjs');
    await t.test('phase 04: productive flows with real identity, PIN, repositories and transactions',
      async production => runProductionRegression(production, { db, authenticate, login, bind, users: LAB_USERS }));
  }
  assert.equal(auth0Calls, 0);
});

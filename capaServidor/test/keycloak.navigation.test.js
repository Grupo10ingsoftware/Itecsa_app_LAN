import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import express from 'express';
import { createAdminUsersRouter } from '../src/modules/users/routes/adminUsers.routes.js';
import { ROLE_PERMISSIONS, ROLES_CLAIM, BUSINESS_PERMISSIONS } from '../../shared/keycloakAuthorization.js';
import { createOrderRouter } from '../src/modules/orders/routes/order.routes.js';
import { createMetricsRouter } from '../src/modules/metrics/routes/metrics.routes.js';
import { createOrderHistoryRouter } from '../src/modules/history/routes/orderHistory.routes.js';
import { createMessageRouter } from '../src/modules/messages/routes/message.routes.js';

test('fase 03: administración verifica identidad y capacidad antes de cerrar operaciones Keycloak', async t => {
  let calls = 0;
  const forbidden = () => { calls++; throw Error('No debe ejecutarse un servicio administrativo o PIN'); };
  const app = express();
  const authenticate = (req, res, next) => {
    const role = req.get('x-test-role');
    if (!role || req.get('x-test-expired')) return res.sendStatus(401);
    req.identityProvider = 'keycloak';
    req.auth = { payload: { sub: 'fixture-subject', [ROLES_CLAIM]: [role], permissions: req.get('x-test-empty') ? [] : ROLE_PERMISSIONS[role] } };
    next();
  };
  app.use('/admin', createAdminUsersRouter({ authenticate, validatePin: forbidden,
    users: new Proxy({}, { get: () => forbidden }), createUser: forbidden, updateUser: forbidden,
    updateStatus: forbidden, requestPasswordEmail: forbidden, pins: new Proxy({}, { get: () => forbidden }) }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}/admin`;
  const operations = [['GET', '/users'], ['GET', '/users/summary'], ['GET', '/users/17/movements'],
    ['POST', '/users'], ['POST', '/users/password-setup-email'], ['PATCH', '/users/17'], ['PATCH', '/users/17/status']];
  for (const [method, path] of operations) for (const role of Object.keys(ROLE_PERMISSIONS)) {
    const response = await fetch(base + path, { method, headers: { 'x-test-role': role } });
    assert.equal(response.status, role === 'Soporte' ? 503 : 403, `${method} ${path} ${role}`);
    if (role === 'Soporte') assert.equal((await response.json()).code, 'IDENTITY_PROVIDER_NOT_IMPLEMENTED');
  }
  for (const headers of [{}, ...Object.keys(ROLE_PERMISSIONS).map(role => ({ 'x-test-role': role, 'x-test-expired': '1' }))]) {
    assert.equal((await fetch(base + '/users', { headers })).status, 401);
  }
  assert.equal((await fetch(base + '/users', { headers: { 'x-test-role': 'Soporte', 'x-test-empty': '1' } })).status, 403);
  assert.equal(calls, 0);
});

test('fase 03: routers reales de las vistas intersectan permisos con los nueve roles', async t => {
  const AP = 'Administrador Produccion', AV = 'Administrador Ventas', AC = 'Administrador Cobranzas',
    OP = 'Operario Produccion', OV = 'Operario Ventas', OC = 'Operario Cobranzas', G = 'Gerencia', D = 'Desarrollador', S = 'Soporte';
  const all = [AP, AV, AC, OP, OV, OC, G, D, S], business = all.filter(role => role !== S);
  const endpoints = [['/orders/kanban', business], ['/orders/calendar-summary', [AP, AV, OV, D]],
    ['/orders/payments', [AC, OC, D]], ['/orders/sales-notes/NV1', [AV, OV, D]],
    ['/history/orders', business], ['/history/orders/17', business],
    ['/metrics/summary', [AP, G, D]], ['/metrics/production-performance', [AP, G, D]],
    ['/messages', all], ['/messages/42', all]];
  let calls = 0;
  const controller = new Proxy({}, { get: () => (_req, res) => { calls++; res.sendStatus(204); } });
  const authenticate = (req, res, next) => {
    if (!req.get('x-test-role') || req.get('x-test-expired')) return res.sendStatus(401);
    req.identityProvider = 'keycloak';
    // Deliberately excessive JWT permissions must never restore old Soporte business access.
    req.auth = { payload: { sub: 'synthetic-ui-actor', [ROLES_CLAIM]: [req.get('x-test-role')],
      permissions: req.get('x-test-empty') ? [] : BUSINESS_PERMISSIONS } };
    next();
  };
  const app = express();
  for (const [path, factory] of [['/orders', createOrderRouter], ['/metrics', createMetricsRouter],
    ['/history', createOrderHistoryRouter], ['/messages', createMessageRouter]]) app.use(path, factory({ authenticate, controller }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const [path, allowed] of endpoints) for (const role of all) {
    const before = calls;
    assert.equal((await fetch(base + path, { headers: { 'x-test-role': role } })).status, allowed.includes(role) ? 204 : 403, `${path} ${role}`);
    assert.equal(calls - before, allowed.includes(role) ? 1 : 0, 'Denegación antes del controlador');
    assert.equal((await fetch(base + path, { headers: { 'x-test-role': role, 'x-test-expired': '1' } })).status, 401);
    assert.equal((await fetch(base + path, { headers: { 'x-test-role': role, 'x-test-empty': '1' } })).status, 403);
    assert.equal(calls - before, allowed.includes(role) ? 1 : 0, 'Rechazos no ejecutan el controlador');
  }
});

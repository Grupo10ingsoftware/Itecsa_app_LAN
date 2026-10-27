import assert from 'node:assert/strict';
import express from 'express';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import OrderController from '../src/modules/orders/controller/orders.controller.js';
import { createOrderRouter } from '../src/modules/orders/routes/order.routes.js';
import ProductionLoadService from '../src/modules/productionLoad/service/productionLoad.service.js';
import ProductionLoadController from '../src/modules/productionLoad/controller/productionLoad.controller.js';
import { createProductionLoadRouter } from '../src/modules/productionLoad/routes/productionLoad.routes.js';
import { UserRepository } from '../src/modules/users/repo/users.repo.js';
import { createCheckJwt } from '../src/middlewares/checkJwt.js';
import { createRequireActiveIdentity } from '../src/middlewares/requireActiveIdentity.js';
import { createThrottleMiddleware } from '../src/middlewares/rateLimit.js';
import { MemoryThrottleService } from '../src/modules/security/service/securityThrottle.service.js';
import { PERMISSIONS, ROLES, ROLE_PERMISSIONS } from '../../shared/authorization.js';
import { requestContext, respondError } from '../src/errors/httpErrors.js';
import { ACTIVE_USER_STATUSES } from '../src/config/userLifecycle.js';

export async function measureKanbanHttp({ db, output, sample, id, baseline, oldService, service, oldLoad, load }) {
  const { default: BeforeController } = await baseline('src/modules/orders/controller/orders.controller.js');
  const { createOrderRouter: beforeRouter } = await baseline('src/modules/orders/routes/order.routes.js');
  const { default: BeforeLoadService } = await baseline('src/modules/productionLoad/service/productionLoad.service.js');
  const { default: BeforeLoadController } = await baseline('src/modules/productionLoad/controller/productionLoad.controller.js');
  const { createProductionLoadRouter: beforeLoadRouter } = await baseline('src/modules/productionLoad/routes/productionLoad.routes.js');
  const readRoles = Object.entries(ROLE_PERMISSIONS).filter(([, permissions]) =>
    [PERMISSIONS.READ_ORDERS, PERMISSIONS.READ_CAPACITY].every(permission => permissions.includes(permission))).map(([role]) => role);
  const fixture = await db.externalIdentity.findFirst({ where: { provider: 'keycloak', issuer: process.env.KEYCLOAK_ISSUER,
    Usuario: { is: { estado_usuario: { in: [...ACTIVE_USER_STATUSES] }, rol_usuario: { in: readRoles } } } }, select: { subject: true } });
  if (!fixture && !process.argv.includes('--allow-synthetic-identity')) throw Object.assign(Error(), { code: 'NO_ACTIVE_HTTP_FIXTURE' });
  const synthetic = !fixture;
  const subject = fixture?.subject ?? 'opt01-synthetic-read-only-actor';
  const identity = synthetic ? { findBySubject: async () => ({ idUsuario: 1, identitySubject: subject,
    rolUsuario: ROLES.ADMINISTRADOR, estadoUsuario: 'Activo' }) } : new UserRepository({ prisma: db });
  const actor = await identity.findBySubject(subject);
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(publicKey), kid: 'opt01', alg: 'RS256', use: 'sig' };
  const app = express(); app.locals.errorLogger = { error() {} }; app.use(requestContext);
  app.get('/certs', (_req, res) => res.json({ keys: [jwk] }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const environment = { APP_ENV: 'test', KEYCLOAK_ALLOW_HTTP: 'true', KEYCLOAK_ISSUER: origin,
      KEYCLOAK_JWKS_URI: origin + '/certs', KEYCLOAK_AUDIENCE: 'api', KEYCLOAK_CLIENT_ID: 'web', KEYCLOAK_ROLE_CLIENT_ID: 'roles' };
    const throttle = new MemoryThrottleService();
    const rateLimit = createThrottleMiddleware({ throttle, rules: req => [{ scope: 'opt01-read', subject: req.currentUser.idUsuario, limit: 120, windowMs: 60000 }] });
    const authenticate = createCheckJwt({ environment, rateLimit, requireIdentity: createRequireActiveIdentity({ repository: identity }) });
    app.use('/before/orders', beforeRouter({ authenticate, controller: new BeforeController({ service: oldService }) }));
    app.use('/after/orders', createOrderRouter({ authenticate, controller: new OrderController({ service }) }));
    app.use('/before/load', beforeLoadRouter({ authenticate, controller: new BeforeLoadController({ service: new BeforeLoadService({ repo: oldLoad }) }) }));
    app.use('/after/load', createProductionLoadRouter({ authenticate, controller: new ProductionLoadController({ service: new ProductionLoadService({ repo: load }) }) }));
    app.use((error, req, res, _next) => respondError(error, req, res));
    const token = await new SignJWT({ sub: subject, typ: 'Bearer', azp: 'web',
      resource_access: { roles: { roles: [actor.rolUsuario] } }, permissions: [PERMISSIONS.READ_ORDERS, PERMISSIONS.READ_CAPACITY] })
      .setProtectedHeader({ alg: 'RS256', kid: 'opt01' }).setIssuer(origin).setAudience('api').setIssuedAt().setExpirationTime('15m').sign(privateKey);
    const read = async (version, path) => {
      const response = await fetch(`${origin}/${version}${path}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
      if (response.status !== 200) {
        output.httpFailure = { version, route: path.includes('summary') ? 'summary' : path.includes('detail') ? 'detail' : 'load', status: response.status };
        await response.body?.cancel();
        throw Object.assign(Error(), { code: 'DIAGNOSTIC_HTTP_' + response.status });
      }
      return response.json();
    };
    output.httpHarness = { authority: 'synthetic loopback JWT+JWKS', includes: ['real routers/controllers/DTO', 'identity middleware', 'capabilities', 'MySQL TLS'],
      identityRepository: synthetic ? 'SYNTHETIC (no DB identity cost); no active binding for configured issuer' : 'real DB binding',
      realIdentityUnavailable: synthetic,
      excludes: ['real Keycloak user session', ...(synthetic ? ['database identity lookup'] : []), 'browser/render', 'global support audit middleware', 'SQL quota writes'], quota: 'memory 120/minute' };
    for (const [name, path] of [['summary', '/orders/kanban-summary?limit=50'], ['detail', `/orders/${id}/kanban-detail`], ['load', '/load/today']]) {
      const expected = await read('before', path); assert.deepEqual(await read('after', path), expected);
      for (const version of ['before', 'after']) await sample(`http_${name}_${version}`, async () => {
        const result = await read(version, path); assert.deepEqual(result, expected); return result;
      });
    }
    await sample('http_precheck_after', () => read('after', `/orders/${id}/kanban-precheck`));
  } finally {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
}

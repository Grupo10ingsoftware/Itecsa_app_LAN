import assert from 'node:assert/strict';
import express from 'express';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import OrderController from '../src/modules/orders/controller/orders.controller.js';
import { createOrderRouter } from '../src/modules/orders/routes/order.routes.js';
import PaymentRecordController from '../src/modules/payments/controller/paymentRecord.controller.js';
import { createPaymentRecordRouter } from '../src/modules/payments/routes/paymentRecord.routes.js';
import { UserRepository } from '../src/modules/users/repo/users.repo.js';
import { createCheckJwt } from '../src/middlewares/checkJwt.js';
import { createRequireActiveIdentity } from '../src/middlewares/requireActiveIdentity.js';
import { createThrottleMiddleware } from '../src/middlewares/rateLimit.js';
import { MemoryThrottleService } from '../src/modules/security/service/securityThrottle.service.js';
import { PERMISSIONS, ROLE_PERMISSIONS } from '../../shared/authorization.js';
import { requestContext, respondError } from '../src/errors/httpErrors.js';
import { ACTIVE_USER_STATUSES } from '../src/config/userLifecycle.js';

export async function measurePaymentHttp({ db, output, sample, baseline, before, after, oldPreview, preview, id }) {
  const { default: BeforeController } = await baseline('src/modules/orders/controller/orders.controller.js');
  const { createOrderRouter: beforeRouter } = await baseline('src/modules/orders/routes/order.routes.js');
  const readRoles = Object.entries(ROLE_PERMISSIONS).filter(([, permissions]) => permissions.includes(PERMISSIONS.READ_PAYMENTS)).map(([role]) => role);
  const fixture = await db.externalIdentity.findFirst({ where: { provider: 'keycloak', issuer: process.env.KEYCLOAK_ISSUER,
    Usuario: { is: { estado_usuario: { in: [...ACTIVE_USER_STATUSES] }, rol_usuario: { in: readRoles } } } }, select: { subject: true } });
  if (!fixture) throw Object.assign(Error(), { code: 'NO_ACTIVE_HTTP_FIXTURE' });
  const identity = new UserRepository({ prisma: db });
  const actor = await identity.findBySubject(fixture.subject);
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(publicKey), kid: 'opt02', alg: 'RS256', use: 'sig' };
  const app = express(); app.locals.errorLogger = { error() {} }; app.use(requestContext);
  app.get('/certs', (_req, res) => res.json({ keys: [jwk] }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const environment = { APP_ENV: 'test', KEYCLOAK_ALLOW_HTTP: 'true', KEYCLOAK_ISSUER: origin,
      KEYCLOAK_JWKS_URI: origin + '/certs', KEYCLOAK_AUDIENCE: 'api', KEYCLOAK_CLIENT_ID: 'web', KEYCLOAK_ROLE_CLIENT_ID: 'roles' };
    const rateLimit = createThrottleMiddleware({ throttle: new MemoryThrottleService(), rules: req => [{ scope: 'opt02-read', subject: req.currentUser.idUsuario, limit: 120, windowMs: 60000 }] });
    const authenticate = createCheckJwt({ environment, rateLimit, requireIdentity: createRequireActiveIdentity({ repository: identity }) });
    for (const [version, service, previewService, Controller, router] of [
      ['before', before, oldPreview, BeforeController, beforeRouter], ['after', after, preview, OrderController, createOrderRouter],
    ]) {
      app.use(`/${version}/orders/:orderId/payment-records`, createPaymentRecordRouter({ authenticate, controller: new PaymentRecordController({ service: previewService }) }));
      app.use(`/${version}/orders`, router({ authenticate, controller: new Controller({ service }) }));
    }
    app.use((error, req, res, _next) => respondError(error, req, res));
    const token = await new SignJWT({ sub: fixture.subject, typ: 'Bearer', azp: 'web', resource_access: { roles: { roles: [actor.rolUsuario] } }, permissions: [PERMISSIONS.READ_PAYMENTS] })
      .setProtectedHeader({ alg: 'RS256', kid: 'opt02' }).setIssuer(origin).setAudience('api').setIssuedAt().setExpirationTime('15m').sign(privateKey);
    const read = async (version, path) => {
      const response = await fetch(`${origin}/${version}/orders${path}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
      if (response.status !== 200) { await response.body?.cancel(); throw Object.assign(Error(), { code: 'DIAGNOSTIC_HTTP_' + response.status }); }
      return response.json();
    };
    output.httpHarness = { authority: 'synthetic local RS256 JWT+JWKS', identity: 'real active DB binding',
      includes: ['real routers/controllers/DTO', 'identity middleware', 'capabilities', 'strict MySQL TLS'],
      excludes: ['real Keycloak login/session', 'browser/render', 'global support audit', 'SQL quota writes'], quota: 'memory 120/minute' };
    for (const [name, path] of [['workspace', '/payments?limit=50'], ['preview', `/${id}/payment-records/preview`]]) {
      const expected = await read('before', path); assert.deepEqual(await read('after', path), expected);
      for (const version of ['before', 'after']) await sample(`http_${name}_${version}`, async () => {
        const result = await read(version, path); assert.deepEqual(result, expected); return result;
      });
    }
    await sample('http_page_only_after', () => read('after', '/payments?includeSummary=false&status=Pendiente&limit=50'));
    await sample('http_summary_only_after', () => read('after', '/payments?summaryOnly=true'));
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

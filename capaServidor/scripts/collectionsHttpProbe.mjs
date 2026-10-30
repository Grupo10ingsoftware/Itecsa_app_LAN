// Read-only local HTTP harness, real Aiven identity lookup and production routes.
// The JWT authority is synthetic; it is never accepted by the operational API.
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
import { PERMISSIONS as P, ROLE_PERMISSIONS } from '../../shared/authorization.js';
import { requestContext, respondError } from '../src/errors/httpErrors.js';
import { ACTIVE_USER_STATUSES } from '../src/config/userLifecycle.js';
import { createPaymentPreviewCache } from '../../capaVista/src/modules/payments/api/paymentPreviewCache.js';

export async function measureCollectionsHttp({ db, output, sample, service, preview, previewId, fixture, cacheOnly = false }) {
  const roles = Object.entries(ROLE_PERMISSIONS).filter(([, permissions]) => permissions.includes(P.READ_PAYMENTS)).map(([role]) => role);
  const binding = await db.externalIdentity.findFirst({ where: { provider: 'keycloak', issuer: process.env.KEYCLOAK_ISSUER,
    Usuario: { is: { estado_usuario: { in: [...ACTIVE_USER_STATUSES] }, rol_usuario: { in: roles } } } }, select: { subject: true } });
  if (!binding) throw Object.assign(Error(), { code: 'NO_ACTIVE_READ_IDENTITY' });
  const identity = new UserRepository({ prisma: db });
  const actor = await identity.findBySubject(binding.subject);
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(publicKey), kid: 'collections-diagnostic', alg: 'RS256', use: 'sig' };
  const app = express(); app.locals.errorLogger = { error() {} }; app.use(requestContext);
  app.get('/certs', (_req, res) => res.json({ keys: [jwk] }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const environment = { APP_ENV: 'test', KEYCLOAK_ALLOW_HTTP: 'true', KEYCLOAK_ISSUER: origin,
      KEYCLOAK_JWKS_URI: origin + '/certs', KEYCLOAK_AUDIENCE: 'api', KEYCLOAK_CLIENT_ID: 'web', KEYCLOAK_ROLE_CLIENT_ID: 'roles' };
    const rateLimit = createThrottleMiddleware({ throttle: new MemoryThrottleService(),
      rules: req => [{ scope: 'collections-read', subject: req.currentUser.idUsuario, limit: 120, windowMs: 60000 }] });
    const authenticate = createCheckJwt({ environment, rateLimit, requireIdentity: createRequireActiveIdentity({ repository: identity }) });
    app.use('/orders/:orderId/payment-records', createPaymentRecordRouter({ authenticate, controller: new PaymentRecordController({ service: preview }) }));
    app.use('/orders', createOrderRouter({ authenticate, controller: new OrderController({ service }) }));
    app.use((error, req, res, _next) => respondError(error, req, res));
    const token = await new SignJWT({ sub: binding.subject, typ: 'Bearer', azp: 'web',
      resource_access: { roles: { roles: [actor.rolUsuario] } }, permissions: [P.READ_PAYMENTS] })
      .setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).setIssuer(origin).setAudience('api').setIssuedAt().setExpirationTime('10m').sign(privateKey);
    let requests = 0;
    const read = async route => {
      requests++;
      const response = await fetch(origin + '/orders' + route, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
      if (response.status !== 200) { await response.body?.cancel(); throw Object.assign(Error(), { code: 'HTTP_' + response.status }); }
      return response.json();
    };
    output.httpHarness = { authority: 'synthetic local RS256/JWKS', identity: 'existing active Aiven DB binding, same role for all series',
      includes: ['real JWT validation', 'real active identity SQL', 'capabilities', 'routers/controllers/DTO', 'memory quota 120/min'],
      excludes: ['operational Keycloak login/session', 'browser/render', 'global support audit', 'SQL throttle persistence'] };
    assert.equal((await fetch(origin + '/orders/payments')).status, 401);
    const measured = async (name, work) => {
      const counts = [];
      await sample(name, async () => {
        const previous = requests;
        const result = await work();
        counts.push(requests - previous);
        return result;
      });
      // sample() warms once before the measured observations.
      output.samples[name].values.forEach((value, index) => { value.requestsHttp = counts[index + 1]; });
    };
    if (cacheOnly) {
      const cache = createPaymentPreviewCache({ getPaymentPreview: () => read(`/${previewId}/payment-records/preview`) });
      await measured('preview_cache_warm', () => cache.get(previewId));
      cache.clear();
      output.checks.push('live_http_preview_warmup_then_10_cache_hits_no_http_no_sql');
      return;
    }
    for (const [name, route] of [
      ['http_initial', '/payments?status=Pendiente&page=1&limit=10'],
      ['http_filter', '/payments?' + new URLSearchParams({ status: 'Pendiente', page: '1', limit: '10', search: fixture, from: '2026-09-06', to: '2026-09-07' })],
      ['http_page_only', '/payments?' + new URLSearchParams({ status: 'Pendiente', page: '2', limit: '10', search: fixture, includeSummary: 'false' })],
      ['http_preview', `/${previewId}/payment-records/preview`],
    ]) await measured(name, () => read(route));
    output.checks.push('http_missing_jwt_401_real_identity_capabilities_and_read_routes');
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

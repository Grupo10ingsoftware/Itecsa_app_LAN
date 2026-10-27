import assert from 'node:assert/strict';
import express from 'express';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { createCheckJwt } from '../src/middlewares/checkJwt.js';
import { createRequireActiveIdentity } from '../src/middlewares/requireActiveIdentity.js';
import { createThrottleMiddleware } from '../src/middlewares/rateLimit.js';
import { MemoryThrottleService } from '../src/modules/security/service/securityThrottle.service.js';
import { UserRepository } from '../src/modules/users/repo/users.repo.js';
import { requestContext, respondError } from '../src/errors/httpErrors.js';
import { ADMIN_ROLES, PERMISSIONS } from '../../shared/keycloakAuthorization.js';

// Isolated loopback listener; JWT/JWKS synthetic, identity and business SQL real.
// No production quota writes, real user sessions or global support audit middleware.
export async function measureUsersHttp({ db, versions, sample, output, issuer }) {
  const fixture = await db.externalIdentity.findFirst({ where: { provider: 'keycloak', issuer,
    Usuario: { is: { rol_usuario: { in: [...ADMIN_ROLES] }, estado_usuario: 'Activo' } } },
    select: { subject: true } });
  if (!fixture) throw Error('NO_ACTIVE_ADMIN_FIXTURE');
  const identity = new UserRepository({ prisma: db });
  const actor = await identity.findBySubject(fixture.subject);
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(publicKey), kid: 'opt03', alg: 'RS256', use: 'sig' };
  const app = express(); app.locals.errorLogger = { error() {} }; app.use(requestContext);
  app.get('/certs', (_req, res) => res.json({ keys: [jwk] }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const environment = { APP_ENV: 'test', KEYCLOAK_ALLOW_HTTP: 'true', KEYCLOAK_ISSUER: origin,
      KEYCLOAK_JWKS_URI: origin + '/certs', KEYCLOAK_AUDIENCE: 'api', KEYCLOAK_CLIENT_ID: 'web', KEYCLOAK_ROLE_CLIENT_ID: 'roles' };
    const throttle = new MemoryThrottleService();
    const rateLimit = createThrottleMiddleware({ throttle, rules: req => [{ scope: 'opt03-read',
      subject: req.currentUser.idUsuario, limit: 120, windowMs: 60_000 }] });
    for (const [label, { Repository, Service, router }] of Object.entries(versions)) {
      const authenticate = createCheckJwt({ environment, rateLimit,
        requireIdentity: createRequireActiveIdentity({ repository: identity }) });
      const service = new Service({ repository: new Repository({ prisma: db }), management: { config: { issuer } } });
      app.use('/' + label, router({ authenticate, service }));
    }
    app.use((error, req, res, _next) => respondError(error, req, res));
    const token = await new SignJWT({ sub: fixture.subject, typ: 'Bearer', azp: 'web',
      resource_access: { roles: { roles: [actor.rolUsuario] } }, permissions: [PERMISSIONS.MANAGE_USERS] })
      .setProtectedHeader({ alg: 'RS256', kid: 'opt03' }).setIssuer(origin).setAudience('api').setIssuedAt().setExpirationTime('15m').sign(privateKey);
    const read = async (label, path) => {
      const response = await fetch(`${origin}/${label}${path}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
      assert.equal(response.status, 200);
      const body = await response.text(); return { dto: JSON.parse(body), bytes: Buffer.byteLength(body) };
    };
    output.http = { environment: 'loopback / synthetic RS256 JWT+JWKS / real middleware, routers and MySQL TLS / memory quota 120/min',
      excludes: ['real Keycloak session', 'global support audit', 'SQL quota', 'browser and rendering'], payloadBytes: {} };
    for (const [kind, path] of [['list', '/users?page=1&perPage=10'], ['summary', '/users/summary']]) {
      const expected = await read('before', path);
      assert.deepEqual(await read('after', path), expected);
      output.http.payloadBytes[kind] = expected.bytes;
      for (const label of Object.keys(versions)) await sample(`http_${kind}_${label}`, async () => {
        assert.deepEqual(await read(label, path), expected);
      });
    }
  } finally {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
}

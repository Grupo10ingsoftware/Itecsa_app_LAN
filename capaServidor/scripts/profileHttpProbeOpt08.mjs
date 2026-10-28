import express from 'express';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { createAuthRouter } from '../src/modules/auth/routes/auth.routes.js';
import { createCheckJwt } from '../src/middlewares/checkJwt.js';
import { createRequireActiveIdentity } from '../src/middlewares/requireActiveIdentity.js';
import { createThrottleMiddleware } from '../src/middlewares/rateLimit.js';
import { MemoryThrottleService } from '../src/modules/security/service/securityThrottle.service.js';
import { UserRepository } from '../src/modules/users/repo/users.repo.js';
import { ACTIVE_USER_STATUSES } from '../src/config/userLifecycle.js';
import { ROLE_PERMISSIONS, PERMISSIONS as P } from '../../shared/authorization.js';
import { requestContext, respondError } from '../src/errors/httpErrors.js';

export async function measureProfileHttp({ db, before, after, result, measure }) {
    const roles = Object.entries(ROLE_PERMISSIONS).filter(([, p]) => p.includes(P.READ_PROFILE)).map(([r]) => r);
    const binding = await db.externalIdentity.findFirst({ where: { provider: 'keycloak', issuer: process.env.KEYCLOAK_ISSUER,
        Usuario: { is: { estado_usuario: { in: [...ACTIVE_USER_STATUSES] }, rol_usuario: { in: roles } } } }, select: { subject: true } });
    if (!binding) throw Object.assign(Error(), { code: 'NO_ACTIVE_PROFILE_IDENTITY' });
    const identity = new UserRepository({ prisma: db }), actor = await identity.findBySubject(binding.subject);
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const key = { ...await exportJWK(publicKey), kid: 'opt08', alg: 'RS256', use: 'sig' };
    const app = express(); app.locals.errorLogger = { error() {} }; app.use(requestContext);
    app.get('/certs', (_req, res) => res.json({ keys: [key] }));
    const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
    try {
        const origin = `http://127.0.0.1:${server.address().port}`;
        const environment = { APP_ENV: 'test', KEYCLOAK_ALLOW_HTTP: 'true', KEYCLOAK_ISSUER: origin,
            KEYCLOAK_JWKS_URI: origin + '/certs', KEYCLOAK_AUDIENCE: 'api', KEYCLOAK_CLIENT_ID: 'web', KEYCLOAK_ROLE_CLIENT_ID: 'roles' };
        const authenticate = createCheckJwt({ environment, requireIdentity: createRequireActiveIdentity({ repository: identity }),
            rateLimit: createThrottleMiddleware({ throttle: new MemoryThrottleService(), rules: req => [{ scope: 'opt08',
                subject: req.currentUser.idUsuario, limit: 200, windowMs: 60000 }] }) });
        for (const [version, users] of [['before', before], ['after', after]]) app.use('/' + version, createAuthRouter({ authenticate, users }));
        app.use((error, req, res, _next) => respondError(error, req, res));
        const token = await new SignJWT({ sub: binding.subject, typ: 'Bearer', azp: 'web', resource_access: { roles: { roles: [actor.rolUsuario] } }, permissions: [P.READ_PROFILE] })
            .setProtectedHeader({ alg: 'RS256', kid: 'opt08' }).setIssuer(origin).setAudience('api').setIssuedAt().setExpirationTime('15m').sign(privateKey);
        result.httpHarness = { includes: ['real router/controller/JWT signature', 'fresh active DB identity and capabilities', 'strict TLS MySQL'],
            excludes: ['real Keycloak login/refresh', 'browser/render', 'global audit and SQL quota writes'], quota: 'memory 200/minute' };
        for (const [operation, path] of Object.entries({ profile: '/profile', first: '/profile/movements', search: '/profile/movements?search=a',
            next: '/profile/movements?page=2', previous: '/profile/movements?page=1', deep: '/profile/movements?page=500' })) {
            for (const version of ['before', 'after']) await measure('http_' + operation + '_' + version, async () => {
                const response = await fetch(origin + '/' + version + path, { headers: { authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(30000) });
                if (!response.ok) { await response.body?.cancel(); throw Object.assign(Error(), { code: 'HTTP_' + response.status }); }
                return response.json();
            });
        }
    } finally { server.closeAllConnections(); await new Promise(r => server.close(r)); }
}

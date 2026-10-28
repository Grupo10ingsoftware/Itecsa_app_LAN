import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { createCheckJwt } from '../src/middlewares/checkJwt.js';
import { createRequireActiveIdentity } from '../src/middlewares/requireActiveIdentity.js';
import { createThrottleMiddleware } from '../src/middlewares/rateLimit.js';
import { MemoryThrottleService } from '../src/modules/security/service/securityThrottle.service.js';
import { createAuthRouter } from '../src/modules/auth/routes/auth.routes.js';
import { UserRepository } from '../src/modules/users/repo/users.repo.js';
import { requestContext, respondError } from '../src/errors/httpErrors.js';
import { ROLES, PERMISSIONS as P } from '../../shared/authorization.js';

test('profile JWT/capabilities, fresh identity, roles, own-user SQL and no-store survive optimization', async t => {
    const { privateKey, publicKey } = await generateKeyPair('RS256'), wrong = await generateKeyPair('RS256');
    const key = { ...await exportJWK(publicKey), kid: 'opt08', alg: 'RS256', use: 'sig' };
    let active = true, role = ROLES.PRODUCCION, lookups = 0, queries = 0;
    const owners = [];
    const identity = { findBySubject: async sub => {
        lookups++; return ['a', 'b'].includes(sub) ? { idUsuario: sub === 'a' ? 1 : 2, identitySubject: sub,
            rolUsuario: role, estadoUsuario: active ? 'Activo' : 'Desvinculado', nombreUsuario: sub, correoUsuario: null } : null;
    } };
    const users = new UserRepository({ prisma: { $queryRaw: async q => {
        queries++; owners.push(q.values[0]); return q.sql.includes('COUNT(*)') ? [{ total: 1n }]
            : [{ id: q.values[0], dateTime: new Date('2026-01-01T00:00:00Z'), observacion: 'owner-' + q.values[0] }];
    } } });
    const app = express(); app.locals.errorLogger = { error() {} }; app.use(requestContext);
    app.get('/certs', (_req, res) => res.json({ keys: [key] }));
    const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
    t.after(() => new Promise(r => { server.closeAllConnections(); server.close(r); }));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const environment = { APP_ENV: 'test', KEYCLOAK_ALLOW_HTTP: 'true', KEYCLOAK_ISSUER: origin, KEYCLOAK_JWKS_URI: origin + '/certs',
        KEYCLOAK_AUDIENCE: 'api', KEYCLOAK_CLIENT_ID: 'web', KEYCLOAK_ROLE_CLIENT_ID: 'roles' };
    const authenticate = createCheckJwt({ environment, requireIdentity: createRequireActiveIdentity({ repository: identity }),
        rateLimit: createThrottleMiddleware({ throttle: new MemoryThrottleService(), rules: () => [{ scope: 'opt08', subject: 'fixture', limit: 100, windowMs: 60000 }] }) });
    app.use('/auth', createAuthRouter({ authenticate, users })); app.use((error, req, res, _next) => respondError(error, req, res));
    const token = (changes = {}, signingKey = privateKey) => new SignJWT({ sub: 'a', typ: 'Bearer', azp: 'web',
        resource_access: { roles: { roles: [ROLES.PRODUCCION] } }, permissions: [P.READ_PROFILE], ...changes })
        .setProtectedHeader({ alg: 'RS256', kid: 'opt08' }).setIssuer(origin).setAudience('api').setIssuedAt().setExpirationTime('5m').sign(signingKey);
    const get = (path, bearer) => fetch(origin + '/auth' + path, { headers: bearer ? { authorization: 'Bearer ' + bearer } : {} });
    for (const path of ['/profile', '/profile/movements']) {
        const previous = queries;
        for (const [bearer, status] of [[null, 401], ['invalid', 401], [await token({}, wrong.privateKey), 401],
            [await token({ permissions: [] }), 403], [await token({ sub: 'missing' }), 403]]) assert.equal((await get(path, bearer)).status, status);
        active = false; assert.equal((await get(path, await token())).status, 403); active = true;
        role = ROLES.GERENCIA; assert.equal((await get(path, await token())).status, 403); role = ROLES.PRODUCCION;
        assert.equal(queries, previous);
        for (const sub of ['a', 'b']) {
            const count = lookups, response = await get(path + '?userId=999&subject=other', await token({ sub }));
            assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
            assert.equal(lookups, count + 1); const data = await response.json();
            assert.equal(data.records[0].detail, 'owner-' + (sub === 'a' ? 1 : 2));
        }
    }
    for (const query of ['page=-1', 'page=1.5', 'perPage=51', 'search=' + 'a'.repeat(121), 'page=9007199254740991']) {
        const previous = queries; assert.equal((await get('/profile/movements?' + query, await token())).status, 400); assert.equal(queries, previous);
    }
    assert(owners.every(id => id === 1 || id === 2));
});

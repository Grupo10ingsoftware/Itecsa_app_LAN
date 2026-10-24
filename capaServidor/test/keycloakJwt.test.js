import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { createServer } from 'node:http';
import { test } from 'node:test';
import express from 'express';
import { auth } from 'express-oauth2-jwt-bearer';
import { normalizeKeycloakClaims } from '../src/middlewares/keycloakClaims.js';

test('access token Keycloak exige firma, issuer, audience, cliente, rol y permisos', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'pilot-key', alg: 'RS256', use: 'sig' };
  const keyServer = createServer((_req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ keys: [jwk] })); });
  await new Promise(resolve => keyServer.listen(0, '127.0.0.1', resolve));
  const issuer = 'http://127.0.0.1:18080/realms/itecsa';
  const app = express();
  app.get('/verify', auth({ issuer, audience: 'https://api.itecsa.local',
    jwksUri: `http://127.0.0.1:${keyServer.address().port}/certs` }), (req, res) => {
    const claims = normalizeKeycloakClaims(req.auth.payload, 'itecsa-web');
    res.status(claims ? 200 : 403).end();
  });
  app.use((error, _req, res, _next) => res.status(error.status || 401).end());
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/verify`;
  const claims = { iss: issuer, aud: ['https://api.itecsa.local'], sub: 'pilot-id', azp: 'itecsa-web', typ: 'Bearer',
    realm_access: { roles: ['Soporte'] }, permissions: ['read:own-profile'], iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 300 };
  function sign(payload, signingKey = privateKey) {
    const encoded = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const input = `${encoded({ alg: 'RS256', typ: 'JWT', kid: 'pilot-key' })}.${encoded(payload)}`;
    return `${input}.${createSign('RSA-SHA256').update(input).sign(signingKey).toString('base64url')}`;
  }
  async function status(payload, key) {
    return (await fetch(base, { headers: { authorization: `Bearer ${sign(payload, key)}` } })).status;
  }
  try {
    assert.equal(await status(claims), 200);
    assert.equal(await status(claims, generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey), 401);
    assert.equal(await status({ ...claims, iss: 'http://other/realms/itecsa' }), 401);
    assert.equal(await status({ ...claims, aud: ['other-api'] }), 401);
    assert.equal(await status({ ...claims, azp: 'other-client' }), 403);
    assert.equal(await status({ ...claims, realm_access: { roles: ['Soporte', 'Gerencia'] } }), 403);
    assert.equal(await status({ ...claims, permissions: undefined }), 403);
  } finally {
    server.close();
    keyServer.close();
  }
});

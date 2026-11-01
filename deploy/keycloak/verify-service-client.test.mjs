import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyServiceClient } from './verify-service-client.mjs';

const env = { PUBLIC_ORIGIN: 'https://itecsa.test', KEYCLOAK_ADMIN_CLIENT_SECRET: 'synthetic-secret' };
test('technical account verification discards user data and never changes accounts', async () => {
  const methods = [];
  await verifyServiceClient(env, async (url, options) => {
    methods.push(options.method ?? 'GET');
    if (url.endsWith('/token')) return Response.json({ access_token: 'synthetic-token' });
    assert.equal(options.headers.authorization, 'Bearer synthetic-token');
    assert.match(url, /users\?max=1$/);
    return Response.json([{ id: 'synthetic-user' }]);
  });
  assert.deepEqual(methods, ['POST', 'GET']);
});
test('technical account verification rejects wrong credentials and missing permissions without exposing responses', async () => {
  for (const status of [401, 403]) {
    await assert.rejects(verifyServiceClient(env, async url => {
      if (status === 403 && url.endsWith('/token')) return Response.json({ access_token: 'synthetic-token' });
      return new Response('synthetic-secret synthetic-token private-user', { status });
    }), error => error.message.startsWith('KEYCLOAK_VERIFY:') && !/synthetic|private-user/.test(error.message));
  }
});

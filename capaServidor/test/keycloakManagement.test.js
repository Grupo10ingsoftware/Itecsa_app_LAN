import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { resolveKeycloakAdministration } from '../src/config/keycloakAdministration.js';
import { KeycloakManagementService, KeycloakServiceError } from '../src/modules/users/service/keycloakManagement.service.js';

const env = { AUTH_PROVIDER: 'keycloak', APP_ENV: 'test', KEYCLOAK_ALLOW_HTTP: 'true',
  KEYCLOAK_ISSUER: 'http://keycloak.invalid/auth/realms/synthetic', KEYCLOAK_CLIENT_ID: 'spa',
  KEYCLOAK_ROLE_CLIENT_ID: 'roles', KEYCLOAK_ADMIN_CLIENT_ID: 'service', KEYCLOAK_ADMIN_CLIENT_SECRET: 'synthetic-secret' };
const json = data => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
const token = () => json({ access_token: 'synthetic-service-token', token_type: 'Bearer', expires_in: 30 });
const isToken = url => url.endsWith('/protocol/openid-connect/token');

test('server administration configuration is explicit, HTTPS constrained and separate from public/role clients', () => {
  assert.equal(resolveKeycloakAdministration(env).adminUrl, 'http://keycloak.invalid/auth/admin/realms/synthetic');
  for (const change of [
    { AUTH_PROVIDER: 'auth0' }, { KEYCLOAK_ADMIN_CLIENT_SECRET: '' }, { KEYCLOAK_ADMIN_CLIENT_ID: 'spa' },
    { KEYCLOAK_ADMIN_CLIENT_ID: 'roles' }, { APP_ENV: 'production' }, { KEYCLOAK_ALLOW_HTTP: 'false' },
    { KEYCLOAK_ISSUER: 'https://example.invalid/realms/a?x=1' }, { KEYCLOAK_ISSUER: 'https://user:pass@example.invalid/realms/a' },
    { KEYCLOAK_ISSUER: 'https://example.invalid/' }, { KEYCLOAK_ADMIN_TIMEOUT_MS: '0' }, { KEYCLOAK_ADMIN_TIMEOUT_MS: '60000' },
  ]) assert.throws(() => resolveKeycloakAdministration({ ...env, ...change }), /Configuracion/);
});

test('concurrent administration reads share one service token; expiry obtains a fresh token without refresh grant', async () => {
  let now = 0, tokens = 0;
  const api = new KeycloakManagementService({ env, clock: () => now, fetcher: async (url, options) => {
    assert.equal(options.redirect, 'error');
    assert.equal(new URL(url).origin, 'http://keycloak.invalid');
    if (isToken(url)) {
      tokens++; assert.equal(options.body.get('grant_type'), 'client_credentials');
      assert.equal(options.body.get('client_secret'), 'synthetic-secret'); return token();
    }
    assert.equal(options.headers.authorization, 'Bearer synthetic-service-token');
    return json([]);
  } });
  await Promise.all(Array.from({ length: 10 }, () => api.listUsers()));
  assert.equal(tokens, 1);
  now = 26000;
  await api.listUsers();
  assert.equal(tokens, 2);
});

test('writes are never replayed; errors and ambiguous responses expose fixed codes without provider bodies or secrets', async () => {
  for (const [status, code, ambiguous] of [[403, 'KEYCLOAK_INSUFFICIENT_SCOPE', false], [409, 'KEYCLOAK_USER_EXISTS', false],
    [404, 'KEYCLOAK_USER_NOT_FOUND', false], [500, 'KEYCLOAK_UPSTREAM_ERROR', true], [401, 'KEYCLOAK_INSUFFICIENT_SCOPE', false]]) {
    let writes = 0;
    const api = new KeycloakManagementService({ env, fetcher: async url => {
      if (isToken(url)) return token();
      writes++; return new Response('synthetic-secret PRIVATE PROVIDER BODY', { status });
    } });
    await assert.rejects(api.setEnabled('subject', false), error => error instanceof KeycloakServiceError && error.code === code
      && error.ambiguous === ambiguous && !JSON.stringify(error).includes('synthetic-secret') && !error.message.includes('PRIVATE'));
    assert.equal(writes, 1);
  }
});

test('timeouts and network failures mark mutations ambiguous; malformed or oversized token responses do not leak', async () => {
  for (const name of ['TimeoutError', 'TypeError']) {
    const api = new KeycloakManagementService({ env, fetcher: async url => {
      if (isToken(url)) return token();
      throw Object.assign(Error('synthetic-secret'), { name });
    } });
    await assert.rejects(api.logout('subject'), error => error.ambiguous && ['KEYCLOAK_TIMEOUT', 'KEYCLOAK_NETWORK_ERROR'].includes(error.code));
  }
  for (const response of [() => json({ access_token: 'synthetic' }), () => new Response('{not json'),
    () => new Response('x'.repeat(262145))]) {
    const api = new KeycloakManagementService({ env, fetcher: async () => response() });
    await assert.rejects(api.listUsers(), error => error instanceof KeycloakServiceError && !error.ambiguous);
  }
});

test('exact username search is encoded; bounds, path traversal and privileged roles reject before mutation', async () => {
  const calls = [];
  const api = new KeycloakManagementService({ env, fetcher: async url => {
    calls.push(url); return isToken(url) ? token() : json([]);
  } });
  assert.equal(await api.findByUsername('synthetic+1'), null);
  const query = new URL(calls.at(-1)).searchParams;
  assert.equal(query.get('username'), 'synthetic+1'); assert.equal(query.get('exact'), 'true');
  const before = calls.length;
  for (const subject of ['../master', '..', '/admin', 'encoded%2fpath']) await assert.rejects(api.getUser(subject));
  for (const role of ['Gerencia', 'Desarrollador', 'Soporte', 'unknown']) {
    await assert.rejects(api.replaceRole('subject', role), error => error.code === 'KEYCLOAK_ROLE_FORBIDDEN');
    await assert.rejects(api.removeRole('subject', role), error => error.code === 'KEYCLOAK_ROLE_FORBIDDEN');
  }
  await assert.rejects(api.listUsers({ max: 101 }));
  await assert.rejects(api.listUsers({ first: -1 }));
  assert.equal(calls.length, before);
});

test('creation is disabled, credential-free and optional-email; unsafe Location is ambiguous', async () => {
  const input = { username: 'synthetic-worker', firstName: 'Synthetic', lastName: 'Worker',
    operationId: '11111111-1111-4111-8111-111111111111' };
  for (const location of ['http://attacker.invalid/users/id', 'http://keycloak.invalid/auth/admin/realms/synthetic/users/new-subject']) {
    const api = new KeycloakManagementService({ env, fetcher: async (url, options) => {
      if (isToken(url)) return token();
      const body = JSON.parse(options.body);
      assert.equal(body.enabled, false); assert.equal(body.email, undefined); assert.equal(body.credentials, undefined);
      assert.deepEqual(body.attributes, { itecsa_provision_id: [input.operationId] });
      return new Response(null, { status: 201, headers: { location } });
    } });
    if (location.includes('attacker')) await assert.rejects(api.createDisabled(input), error => error.ambiguous);
    else assert.equal(await api.createDisabled(input), 'new-subject');
  }
});

test('role mutation refuses enabled users and attribute updates cannot smuggle roles, credentials or flags', async () => {
  let mutations = 0;
  const api = new KeycloakManagementService({ env, fetcher: async (url, options) => {
    if (isToken(url)) return token();
    if (options.method !== 'GET') mutations++;
    return json({ id: 'subject', username: 'synthetic', enabled: true });
  } });
  await assert.rejects(api.replaceRole('subject', 'Operario Ventas'), error => error.code === 'KEYCLOAK_ROLE_CHANGE_REQUIRES_DISABLED');
  for (const key of ['enabled', 'credentials', 'attributes', 'realmRoles', 'username']) {
    await assert.rejects(api.updateAttributes('subject', { [key]: 'unsafe' }));
  }
  assert.equal(mutations, 0);
});

test('real HTTP deadline also covers a stalled mutation response without replay', async t => {
  let writes = 0;
  const server = createServer((req, res) => {
    req.resume();
    if (req.url.endsWith('/token')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ access_token: 'synthetic-token', token_type: 'Bearer', expires_in: 30 }));
    } else {
      writes++;
      // The provider received the write, but never completes its response body.
      res.writeHead(200, { 'content-type': 'application/json' });
      res.write('{');
    }
  });
  server.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const api = new KeycloakManagementService({ env: { ...env, KEYCLOAK_ADMIN_TIMEOUT_MS: '100',
    KEYCLOAK_ISSUER: 'http://127.0.0.1:' + server.address().port + '/realms/synthetic' } });
  await assert.rejects(api.request('/users/subject', { method: 'PUT', body: { enabled: false }, expected: [200] }),
    error => error.code === 'KEYCLOAK_TIMEOUT' && error.ambiguous);
  assert.equal(writes, 1);
});

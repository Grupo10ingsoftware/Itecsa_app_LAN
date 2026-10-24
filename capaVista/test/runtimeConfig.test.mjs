import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveRuntimeConfig, validateIdentityConfig, validateBrowserIdentityConfig } from '../src/config/runtimeConfig.js';
import { readFileSync } from 'node:fs';

test('runtime prevalece sobre Vite y no incorpora secretos', () => {
  const result = resolveRuntimeConfig({apiBaseUrl:' https://api.client.test/api ', auth0Domain:'client.auth0.com', DB_PASSWORD:'secret'}, {VITE_API_BASE_URL:'http://localhost:3000/api',VITE_AUTH0_CLIENT_ID:'local'});
  assert.equal(result.apiBaseUrl, 'https://api.client.test/api');
  assert.equal(result.auth0Domain, 'client.auth0.com');
  assert.equal(result.auth0ClientId, 'local');
  assert.equal('DB_PASSWORD' in result, false);
});

test('seleccion Keycloak runtime no requiere Auth0 ni permite secretos administrativos', () => {
  const config = resolveRuntimeConfig({ authProvider: 'keycloak', keycloakUrl: 'http://10.20.30.10:8080',
    keycloakRealm: 'itecsa', keycloakClientId: 'itecsa-web', keycloakAudience: 'https://api.itecsa.local',
    KEYCLOAK_ADMIN_CLIENT_SECRET: 'never', clientSecret: 'never' });
  assert.equal(validateIdentityConfig(config), config);
  assert.equal(JSON.stringify(config).includes('never'), false);
  assert.equal(resolveRuntimeConfig().authProvider, 'auth0');
  assert.throws(() => validateIdentityConfig({ ...config, keycloakClientId: '' }));
  assert.throws(() => validateIdentityConfig({ ...config, authProvider: 'unknown' }));
  assert.throws(() => validateIdentityConfig({ ...config, keycloakUrl: 'https://user:secret@id.test' }));
});

test('runtime shell exporta solo allowlist publica y valida requisitos por proveedor', () => {
  const script = readFileSync(new URL('../../deploy/40-runtime-config.sh', import.meta.url), 'utf8');
  assert.match(script, /VITE_AUTH_PROVIDER:-auth0/);
  assert.match(script, /keycloak\) required="VITE_KEYCLOAK_URL VITE_KEYCLOAK_REALM VITE_KEYCLOAK_CLIENT_ID VITE_KEYCLOAK_AUDIENCE"/);
  const emitted = [...script.matchAll(/env\.(VITE_[A-Z_0-9]+)/g)].map(match => match[1]);
  assert.deepEqual(new Set(emitted), new Set(['VITE_AUTH0_DOMAIN', 'VITE_AUTH0_CLIENT_ID', 'VITE_AUTH0_AUDIENCE', 'VITE_API_BASE_URL',
    'VITE_KEYCLOAK_URL', 'VITE_KEYCLOAK_REALM', 'VITE_KEYCLOAK_CLIENT_ID', 'VITE_KEYCLOAK_AUDIENCE']));
  assert.match(script, /jq -cn --arg provider/);
});

test('PKCE bloquea contexto LAN inseguro y contenido mixto sin rebajar controles', () => {
  const config = resolveRuntimeConfig({ authProvider: 'keycloak', keycloakUrl: 'http://10.20.30.10:8080',
    keycloakRealm: 'itecsa', keycloakClientId: 'itecsa-web', keycloakAudience: 'https://api.itecsa.local' });
  assert.throws(() => validateBrowserIdentityConfig(config, { isSecureContext: false }));
  assert.throws(() => validateBrowserIdentityConfig(config, { isSecureContext: true, crypto: { subtle: {} }, location: { protocol: 'https:' } }));
  assert.equal(validateBrowserIdentityConfig(config, { isSecureContext: true, crypto: { subtle: {} }, location: { protocol: 'http:' } }), config);
});

test('configuracion faltante conserva valores vacios para errores controlados de API', () => {
  assert.equal(resolveRuntimeConfig().apiBaseUrl, '');
  assert.equal(resolveRuntimeConfig({apiBaseUrl:''}, {VITE_API_BASE_URL:'http://localhost'}).apiBaseUrl, '');
});

#!/usr/bin/env node
// Integration contract: real Keycloak tokens + API + the frontend session adapter.
// Browser rendering is checked separately; no claims are fabricated here.
import { access } from 'node:fs/promises';
import { randomBytes, createHash, webcrypto } from 'node:crypto';
import { createRequire } from 'node:module';
import { ACCOUNT_CREATED_AT_CLAIM } from '../shared/identityProfile.js';

const usage = `Uso: node scripts/verify-profile-identity.mjs [--help]

Prueba el perfil de una cuenta EXISTENTE con Keycloak real en un despliegue HTTPS.
Requiere Node.js 22+, las dependencias de capaServidor instaladas y estas variables:
  PUBLIC_ORIGIN       Origen HTTPS del despliegue, sin ruta (p. ej. https://servidor).
  PROFILE_USERNAME    Nombre exacto de una cuenta activa, con perfil y rol preparados.
  PROFILE_PASSWORD    Contraseña actual; proporcionar por entorno, nunca por argumentos.
  PROFILE_EXPECT_CREATED_AT_MS Fecha Keycloak en ms esperada (opcional, para contrastar origen).
  NODE_EXTRA_CA_CERTS Archivo PEM de la CA de confianza, definido ANTES de iniciar Node.

Usa el realm itecsa, cliente público itecsa-web y audiencia https://api.itecsa.local.
Inicia sesión mediante authorization_code + PKCE S256, valida firma/issuer/audiencia,
consulta /api/auth/profile y comprueba username y fecha de creación registrada por Keycloak.
La cuenta de prueba debe conservar createdTimestamp; la prueba exige el claim firmado.
Comprueba también el usuario del adaptador de sesión del frontend.
Cierra su sesión con refresh_token, vuelve a entrar y repite las comprobaciones.
No crea usuarios ni modifica PIN, roles o permisos. Aborta ante MFA o acciones requeridas.
No omite TLS ni usa password grant. Solo imprime resultados sanitizados en JSON.
Es una prueba HTTP del contrato de identidad; no reemplaza la revisión en navegador.
`;

const fail = code => { throw Object.assign(new Error(code), { safeCode: code }); };
const expect = (condition, code) => { if (!condition) fail(code); };
const formHeaders = { 'content-type': 'application/x-www-form-urlencoded' };
const clientId = 'itecsa-web';
const audience = 'https://api.itecsa.local';
let origin, issuer, redirectUri, currentTokens, step = 'configuration';
let passed = 0;
const record = (name, cycle) => {
  passed++;
  console.log(JSON.stringify({ check: name, ...(cycle ? { cycle } : {}), pass: true }));
};

function json(response, code) {
  try { return JSON.parse(response.text); } catch { fail(code); }
}

function sameOrigin(value) {
  const target = new URL(value, origin);
  expect(target.origin === origin && !target.username && !target.password, 'CROSS_ORIGIN_REJECTED');
  return target;
}

async function request(value, options = {}, cookies) {
  const target = sameOrigin(value);
  const headers = { ...options.headers };
  if (cookies?.size) headers.cookie = [...cookies].map(([key, value]) => `${key}=${value}`).join('; ');
  const response = await fetch(target, {
    ...options, headers, redirect: 'manual', signal: AbortSignal.timeout(15000),
  });
  if (cookies) for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(';', 1)[0];
    const index = pair.indexOf('=');
    if (index > 0) cookies.set(pair.slice(0, index), pair.slice(index + 1));
  }
  return { status: response.status, location: response.headers.get('location'), text: await response.text() };
}

async function login() {
  const verifier = randomBytes(32).toString('base64url');
  const state = randomBytes(18).toString('hex');
  const nonce = randomBytes(18).toString('hex');
  const url = new URL(`${issuer}/protocol/openid-connect/auth`);
  url.search = new URLSearchParams({
    client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'openid',
    state, nonce, code_challenge_method: 'S256',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
  });
  // Each attempt owns an independent cookie jar and a fresh authorization request.
  const cookies = new Map();
  let response = await request(url, {}, cookies);
  let submitted = false;
  for (let count = 0; count < 12; count++) {
    if (response.status >= 300 && response.status < 400 && response.location) {
      const location = sameOrigin(response.location);
      expect(!location.searchParams.has('error'), 'AUTHORIZATION_REJECTED');
      if (location.pathname === '/' && location.searchParams.has('code')) {
        expect(submitted && location.searchParams.get('state') === state, 'AUTHORIZATION_STATE_MISMATCH');
        expect(!location.searchParams.has('iss') || location.searchParams.get('iss') === issuer, 'AUTHORIZATION_ISSUER_MISMATCH');
        const exchange = await request(`${issuer}/protocol/openid-connect/token`, {
          method: 'POST', headers: formHeaders,
          body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId,
            redirect_uri: redirectUri, code: location.searchParams.get('code'), code_verifier: verifier }),
        });
        expect(exchange.status === 200, 'TOKEN_EXCHANGE_FAILED');
        currentTokens = json(exchange, 'TOKEN_RESPONSE_INVALID');
        expect(['access_token', 'refresh_token', 'id_token'].every(key =>
          typeof currentTokens?.[key] === 'string' && currentTokens[key]), 'TOKEN_RESPONSE_INCOMPLETE');
        return { tokens: currentTokens, nonce };
      }
      response = await request(location, {}, cookies);
      continue;
    }
    // Only submit the ordinary username/password form. Never complete account actions.
    expect(response.status === 200 && !submitted && /name="username"/.test(response.text)
      && /name="password"/.test(response.text) && !/name="password-new"/.test(response.text), 'UNEXPECTED_LOGIN_FORM');
    const action = response.text.match(/<form[^>]+action="([^"]+)"/i)?.[1]?.replaceAll('&amp;', '&');
    expect(Boolean(action), 'LOGIN_FORM_MISSING');
    const actionUrl = sameOrigin(action);
    expect(actionUrl.pathname === '/realms/itecsa/login-actions/authenticate', 'LOGIN_ACTION_REJECTED');
    const body = new URLSearchParams();
    for (const match of response.text.matchAll(/<input\b[^>]*>/gi)) {
      const input = match[0];
      const type = input.match(/type="([^"]*)"/i)?.[1];
      const name = input.match(/name="([^"]*)"/i)?.[1];
      const value = input.match(/value="([^"]*)"/i)?.[1] ?? '';
      if (type === 'hidden' && name) body.set(name, value.replaceAll('&amp;', '&'));
    }
    body.set('username', process.env.PROFILE_USERNAME);
    body.set('password', process.env.PROFILE_PASSWORD);
    body.set('credentialId', '');
    submitted = true;
    response = await request(actionUrl, { method: 'POST', headers: formHeaders, body }, cookies);
  }
  fail('AUTHORIZATION_REDIRECT_LIMIT');
}

async function logout() {
  expect(typeof currentTokens?.refresh_token === 'string' && currentTokens.refresh_token, 'LOGOUT_TOKEN_MISSING');
  const response = await request(`${issuer}/protocol/openid-connect/logout`, {
    method: 'POST', headers: formHeaders,
    body: new URLSearchParams({ client_id: clientId, refresh_token: currentTokens.refresh_token }),
  });
  expect(response.status === 204, 'LOGOUT_FAILED');
  currentTokens = undefined;
}

async function main() {
  expect(process.argv.length === 2, 'UNEXPECTED_ARGUMENTS');
  expect(Number(process.versions.node.split('.')[0]) >= 22, 'NODE_22_REQUIRED');
  expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0' && process.env.NODE_EXTRA_CA_CERTS, 'TRUSTED_TLS_REQUIRED');
  await access(process.env.NODE_EXTRA_CA_CERTS);
  const target = new URL(process.env.PUBLIC_ORIGIN);
  expect(target.protocol === 'https:' && !target.username && !target.password
    && target.pathname === '/' && !target.search && !target.hash, 'HTTPS_ORIGIN_REQUIRED');
  origin = target.origin;
  issuer = `${origin}/realms/itecsa`;
  redirectUri = `${origin}/`;
  expect(process.env.PROFILE_USERNAME?.trim() && process.env.PROFILE_PASSWORD, 'EXISTING_ACCOUNT_CREDENTIALS_REQUIRED');
  const require = createRequire(new URL('../capaServidor/package.json', import.meta.url));
  const { createLocalJWKSet, jwtVerify } = require('jose');
  const { createKeycloakSession } = await import('../capaVista/src/app/providers/keycloakSession.js');

  step = 'discovery';
  const discovery = await request(`${issuer}/.well-known/openid-configuration`);
  expect(discovery.status === 200, 'DISCOVERY_FAILED');
  const provider = json(discovery, 'DISCOVERY_INVALID_JSON');
  expect(provider.issuer === issuer
    && provider.authorization_endpoint === `${issuer}/protocol/openid-connect/auth`
    && provider.token_endpoint === `${issuer}/protocol/openid-connect/token`
    && provider.end_session_endpoint === `${issuer}/protocol/openid-connect/logout`
    && provider.jwks_uri === `${issuer}/protocol/openid-connect/certs`, 'DISCOVERY_CONTRACT_MISMATCH');
  const jwks = await request(provider.jwks_uri);
  expect(jwks.status === 200, 'JWKS_FAILED');
  const keys = createLocalJWKSet(json(jwks, 'JWKS_INVALID_JSON'));
  record('trusted-public-issuer');

  let previousSubject, previousRegistrationDate;
  const expectedCreation = process.env.PROFILE_EXPECT_CREATED_AT_MS;
  if (expectedCreation !== undefined) expect(/^[1-9][0-9]*$/.test(expectedCreation)
    && Number.isSafeInteger(Number(expectedCreation)), 'EXPECTED_CREATION_TIME_INVALID');
  for (const cycle of [1, 2]) {
    step = `login-${cycle}`;
    const { tokens, nonce } = await login();
    record('authorization-code-pkce', cycle);

    step = `signed-identity-${cycle}`;
    const { payload: claims } = await jwtVerify(tokens.access_token, keys, {
      issuer, audience, algorithms: ['RS256'], requiredClaims: ['sub', 'exp', 'iat'],
    });
    const { payload: identity } = await jwtVerify(tokens.id_token, keys, {
      issuer, audience: clientId, algorithms: ['RS256'], requiredClaims: ['sub', 'exp', 'iat', 'nonce'],
    });
    expect(typeof claims.sub === 'string' && claims.sub && claims.sub === identity.sub
      && claims.typ === 'Bearer' && claims.azp === clientId && identity.nonce === nonce,
    'TOKEN_IDENTITY_MISMATCH');
    expect(!previousSubject || previousSubject === claims.sub, 'RELOGIN_SUBJECT_CHANGED');
    previousSubject = claims.sub;
    record('signed-issuer-subject-audience', cycle);

    step = `api-profile-${cycle}`;
    const profile = await request('/api/auth/profile', {
      headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: 'application/json' },
    });
    expect(profile.status === 200, 'PROFILE_HTTP_FAILED');
    const profileData = json(profile, 'PROFILE_INVALID_JSON');
    expect(profileData?.estadoUsuario === 'Activo' && typeof profileData.rolUsuario === 'string'
      && profileData.rolUsuario && Array.isArray(profileData.records), 'PROFILE_CONTRACT_MISMATCH');
    // The API handler checks the local identity subject against the validated JWT.
    record('api-profile-active', cycle);
    const createdAt = claims[ACCOUNT_CREATED_AT_CLAIM];
    expect(Number.isSafeInteger(createdAt) && createdAt > 0 && createdAt <= 253402300799999
      && Math.floor(createdAt / 1000) <= claims.iat, 'ACCOUNT_CREATION_CLAIM_INVALID');
    expect(expectedCreation === undefined || createdAt === Number(expectedCreation), 'ACCOUNT_CREATION_SOURCE_MISMATCH');
    expect(profileData.fechaRegistro === new Date(createdAt).toISOString(), 'PROFILE_REGISTRATION_DATE_MISMATCH');
    expect(previousRegistrationDate === undefined || previousRegistrationDate === profileData.fechaRegistro,
      'RELOGIN_REGISTRATION_DATE_CHANGED');
    previousRegistrationDate = profileData.fechaRegistro;
    record('signed-account-creation-and-profile-date', cycle);

    step = `frontend-identity-${cycle}`;
    // A minimal adapter supplies the actual, signature-verified Keycloak claims to
    // the production normalization code. This does not pretend to drive a browser.
    const keycloak = {
      authenticated: true, token: tokens.access_token, tokenParsed: claims,
      init: async () => true,
      clearToken() { this.authenticated = false; this.token = undefined; this.tokenParsed = undefined; },
    };
    const session = createKeycloakSession(keycloak, {
      isSecureContext: true, crypto: webcrypto, location: new URL(redirectUri),
    });
    await session.init();
    const snapshot = session.getSnapshot();
    expect(snapshot.isAuthenticated && !snapshot.isLoading && !snapshot.error
      && snapshot.user?.username === process.env.PROFILE_USERNAME && snapshot.user.sub === claims.sub,
    'FRONTEND_PROFILE_IDENTITY_MISMATCH');
    record('frontend-username-and-subject', cycle);

    step = `logout-${cycle}`;
    await logout();
    record('keycloak-session-logout', cycle);
  }
}

if (process.argv.length === 3 && process.argv[2] === '--help') {
  console.log(usage);
} else {
  try {
    await main();
    console.log(JSON.stringify({ passed, failed: 0, cycles: 2, browserTest: false }));
  } catch (error) {
    const code = error.safeCode ?? (error.name === 'TimeoutError' ? 'REQUEST_TIMEOUT' : 'CHECK_ABORTED');
    console.error(JSON.stringify({ check: step, pass: false, code }));
    if (typeof currentTokens?.refresh_token === 'string' && currentTokens.refresh_token) {
      try {
        await logout();
        console.log(JSON.stringify({ check: 'cleanup-session-logout', pass: true }));
      } catch {
        console.error(JSON.stringify({ check: 'cleanup-session-logout', pass: false, code: 'LOGOUT_FAILED' }));
      }
    }
    console.log(JSON.stringify({ passed, failed: 1, browserTest: false }));
    process.exitCode = 1;
  }
}

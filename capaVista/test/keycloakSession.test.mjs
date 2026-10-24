import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createKeycloakSession, safeReturnPath } from '../src/app/providers/keycloakSession.js'
import { createApiClient } from '../src/services/api/apiClient.js'

function fixture({ authenticated = true, secure = true, callback = true } = {}) {
  const storage = new Map(), calls = []
  const sdk = { authenticated, token: 'access-a', tokenParsed: { sub: 'a', preferred_username: 'ana' },
    async init(options) { calls.push(['init', options]); return authenticated },
    async updateToken(seconds) { calls.push(['refresh', seconds]); return false },
    isTokenExpired: () => false,
    clearToken() { calls.push(['clear']); this.authenticated = false; this.token = undefined; this.onAuthLogout?.() },
    async login(options) { calls.push(['login', options]) },
    createLogoutUrl(options) { calls.push(['logout', options]); return 'https://id.test/logout' },
  }
  const browser = { isSecureContext: secure, crypto: secure ? { subtle: {} } : {},
    location: { origin: 'https://app.test', href: `https://app.test/${callback ? '?code=synthetic' : ''}`,
      assign(url) { calls.push(['navigate', url]) } },
    sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
  }
  const session = createKeycloakSession(sdk, browser, path => calls.push(['return', path]))
  return { session, sdk, browser, storage, calls }
}

test('init unico bajo montaje repetido: Code+PKCE S256, sin credenciales persistidas', async () => {
  const f = fixture(); f.storage.set('itecsa.returnTo', '/pagos?pagina=2')
  await Promise.all([f.session.init(), f.session.init()])
  assert.equal(f.calls.filter(c => c[0] === 'init').length, 1)
  assert.equal(f.calls[0][1].flow, 'standard'); assert.equal(f.calls[0][1].pkceMethod, 'S256')
  assert.equal(f.calls[0][1].responseMode, 'query'); assert.equal(f.calls[0][1].checkLoginIframe, true)
  assert.deepEqual(f.calls.find(c => c[0] === 'return'), ['return', '/pagos?pagina=2'])
  assert.equal(f.storage.size, 0); assert.equal(f.session.getSnapshot().user.email, undefined)
  assert.equal(f.session.getSnapshot().user.sub, 'a')
})

test('login conserva solo destino interno y logout limpia memoria antes de navegar', async () => {
  const f = fixture(); await f.session.init()
  await f.session.loginWithRedirect({ appState: { returnTo: '//evil.test' } })
  assert.equal(f.storage.get('itecsa.returnTo'), '/kanban')
  assert.deepEqual(f.calls.find(c => c[0] === 'login')[1], { redirectUri: 'https://app.test' })
  await f.session.logout()
  assert.equal(f.sdk.token, undefined); assert.equal(f.session.getSnapshot().isAuthenticated, false)
  assert.equal(f.storage.size, 0); assert.equal(f.calls.at(-1)[0], 'navigate')
})

test('renovacion concurrente se deduplica y devuelve solo access token', async () => {
  const f = fixture(); await f.session.init()
  let release, refreshes = 0
  f.sdk.idToken = 'never-id-token'; f.sdk.refreshToken = 'never-refresh-token'
  f.sdk.updateToken = seconds => { assert.equal(seconds, 30); refreshes++; return new Promise(resolve => { release = resolve }) }
  const requests = [f.session.getAccessToken(), f.session.getAccessToken()]
  f.sdk.token = 'access-renewed'; release(true)
  assert.deepEqual(await Promise.all(requests), ['access-renewed', 'access-renewed'])
  assert.equal(refreshes, 1); assert.equal(f.session.getSnapshot().verificationKey, 2)
})

test('expiracion y fallo de renovacion cierran sesion sin devolver token viejo', async () => {
  for (const fail of [false, true]) {
    const f = fixture(); await f.session.init()
    f.sdk.isTokenExpired = () => true
    if (fail) f.sdk.updateToken = async () => { throw Error('refresh rejected') }
    await assert.rejects(f.session.getAccessToken())
    assert.equal(f.session.getSnapshot().isAuthenticated, false); assert.equal(f.sdk.token, undefined)
    await assert.rejects(f.session.getAccessToken())
  }
})

test('cierre durante renovacion descarta credenciales tardias', async () => {
  const f = fixture(); await f.session.init(); let release
  f.sdk.updateToken = () => new Promise(resolve => { release = resolve })
  const pending = f.session.getAccessToken(); await f.session.logout()
  f.sdk.token = 'old-token'; f.sdk.authenticated = true; release(true)
  await assert.rejects(pending); assert.equal(f.sdk.token, undefined); assert.equal(f.session.getSnapshot().isAuthenticated, false)
})

test('cambio de sujeto en renovacion cambia clave de sesion y rechaza la peticion anterior', async () => {
  const f = fixture(); await f.session.init(); const old = f.session.getSnapshot().sessionKey
  f.sdk.updateToken = async () => { f.sdk.tokenParsed = { sub: 'b' }; return true }
  await assert.rejects(f.session.getAccessToken())
  assert.notEqual(f.session.getSnapshot().sessionKey, old); assert.equal(f.session.getSnapshot().user.sub, 'b')
})

test('contexto HTTP inseguro o callback fallido nunca autentican', async () => {
  const f = fixture({ secure: false }); await f.session.init()
  assert.equal(f.session.getSnapshot().error.code, 'AUTH_CONFIGURATION_ERROR')
  assert.equal(f.calls.some(c => c[0] === 'init'), false)
  const broken = fixture(); broken.sdk.init = async () => { throw Error('invalid callback state') }
  await broken.session.init(); assert.equal(broken.session.getSnapshot().isAuthenticated, false)
  assert.equal(broken.sdk.token, undefined)
})

test('destinos externos, controles y backslash no se usan como redirect', () => {
  for (const value of ['https://evil.test', '//evil.test', '/\\evil.test', '/\n/evil', null]) assert.equal(safeReturnPath(value), '/kanban')
  assert.equal(safeReturnPath('/perfil?tab=1#datos'), '/perfil?tab=1#datos')
})

test('API descarta respuesta de usuario anterior y no inicia peticiones con identidad obsoleta', async t => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original })
  let active = true, complete
  globalThis.fetch = () => new Promise(resolve => { complete = resolve })
  const client = createApiClient({ baseUrl: 'https://api.test/api', getAccessToken: async () => 'token-a', isSessionCurrent: () => active })
  const request = client.get('/auth/verify'); await new Promise(resolve => setTimeout(resolve, 0))
  active = false; complete(new Response(JSON.stringify({ sub: 'a' }), { headers: { 'content-type': 'application/json' } }))
  await assert.rejects(request, { code: 'SESSION_INVALID' }); await assert.rejects(client.get('/auth/verify'), { code: 'SESSION_INVALID' })
})

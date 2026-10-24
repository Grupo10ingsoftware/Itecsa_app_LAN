import { StrictMode, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import Keycloak from 'keycloak-js'
import { AuthProvider } from '../src/app/providers/AuthProvider.jsx'
import { IdentityContext } from '../src/app/providers/identityContext.js'
import { useAuth } from '../src/hooks/useAuth.js'
import { ROLES, RECOGNIZED_ROLES, PERMISSIONS as P } from '../../shared/authorization.js'
import TemporaryPasswordModal from '../src/modules/users/components/TemporaryPasswordModal.jsx'

const assert = (condition, message) => { if (!condition) throw Error(message) }
const pause = () => new Promise(resolve => setTimeout(resolve, 10))
async function waitFor(check) { for (let i = 0; i < 100; i++) { if (check()) return; await pause() } throw Error('Timeout esperando estado React') }
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
const originalFetch = window.fetch
let auth, root
async function run() {
  // Real keycloak-js Code+PKCE generation and callback processing; synthetic token server.
  const origin = window.location.origin
  const config = { clientId: 'itecsa-web', oidcProvider: { issuer: origin + '/realm', authorization_endpoint: origin + '/oidc/auth',
    token_endpoint: origin + '/oidc/token', end_session_endpoint: origin + '/oidc/logout' } }
  const options = { flow: 'standard', pkceMethod: 'S256', responseMode: 'query', checkLoginIframe: false, redirectUri: origin + '/test/authSession.browser.html' }
  const first = new Keycloak(config)
  await first.init(options)
  const login = new URL(await first.createLoginUrl())
  assert(login.searchParams.get('response_type') === 'code', 'Authorization Code requerido')
  assert(login.searchParams.get('code_challenge_method') === 'S256', 'PKCE S256 requerido')
  assert(login.searchParams.get('code_challenge')?.length === 43, 'Challenge SHA256')
  const nonce = login.searchParams.get('nonce')
  const now = Math.floor(Date.now() / 1000)
  const jwt = claims => `${btoa(JSON.stringify({ alg: 'RS256' }))}.${btoa(JSON.stringify(claims))}.synthetic`
  const access = jwt({ sub: 'sdk-user', iat: now, exp: now + 300, realm_access: { roles: [ROLES.VENTAS] } })
  const refresh = jwt({ sub: 'sdk-user', iat: now, exp: now + 600 })
  const id = jwt({ sub: 'sdk-user', iat: now, exp: now + 300, nonce })
  const grants = []
  window.fetch = async (url, request) => {
    assert(String(url).endsWith('/oidc/token'), 'Solo servidor token simulado')
    const body = new URLSearchParams(request.body); grants.push(body.get('grant_type'))
    if (body.get('grant_type') === 'authorization_code') assert(body.get('code_verifier')?.length >= 43, 'Verifier PKCE enviado')
    return json({ access_token: access, refresh_token: refresh, id_token: id, expires_in: 300, token_type: 'Bearer' })
  }
  window.history.replaceState({}, '', `/test/authSession.browser.html?code=synthetic&state=${encodeURIComponent(login.searchParams.get('state'))}`)
  const sdk = new Keycloak(config)
  assert(await sdk.init(options), 'Callback SDK autenticado')
  assert(!window.location.search.includes('code='), 'SDK retira codigo del callback')
  await sdk.updateToken(-1)
  assert(grants.join(',') === 'authorization_code,refresh_token', 'Intercambio y renovacion reales del adapter')
  for (const store of [window.localStorage, window.sessionStorage]) {
    for (const value of Object.values(store)) assert(![access, refresh].some(token => value.includes(token)), 'Tokens no persistidos')
  }
  assert(new URL(sdk.createLogoutUrl({ redirectUri: origin })).searchParams.get('post_logout_redirect_uri') === origin, 'Logout destino correcto')
  sdk.clearToken()

  // Real React provider, effects and guards' authorization contract; synthetic API.
  let current = { provider: 'keycloak', isLoading: false, isAuthenticated: true, user: { sub: 'a' }, sessionKey: 1,
    verificationKey: 0, getVerificationKey: () => current.verificationKey,
    getAccessToken: async () => 'access-a', getSessionKey: () => current.sessionKey, loginWithRedirect: async () => {}, logout: async () => {} }
  const subscribers = new Set()
  const subscribe = listener => { subscribers.add(listener); return () => subscribers.delete(listener) }
  const change = patch => { current = { ...current, ...patch }; flushSync(() => subscribers.forEach(listener => listener())) }
  let reply = () => json({ sub: current.user.sub, rolUsuario: ROLES.VENTAS, permissions: [P.READ_PROFILE], pinStatus: 'active' })
  const pending = []
  window.fetch = async (url, request) => {
    assert(String(url).endsWith('/auth/verify'), 'Verificacion backend obligatoria')
    assert(request.headers.get('Authorization')?.startsWith('Bearer access-'), 'Access token centralizado')
    return reply()
  }
  function ReadAuth() { auth = useAuth(); return <div>{auth.authStatus}:{auth.user?.sub}</div> }
  function Harness() {
    const state = useSyncExternalStore(subscribe, () => current)
    return <IdentityContext.Provider value={state}><AuthProvider><ReadAuth /></AuthProvider></IdentityContext.Provider>
  }
  reply = () => new Promise(resolve => pending.push(resolve))
  root = createRoot(document.getElementById('root'))
  flushSync(() => root.render(<StrictMode><Harness /></StrictMode>))
  assert(auth.isAuthenticated === false && !auth.user, 'Credenciales solas no autorizan')
  await waitFor(() => pending.length > 0)
  reply = () => json({ sub: 'b', rolUsuario: ROLES.VENTAS, permissions: [], pinStatus: 'active' })
  change({ sessionKey: 2, user: { sub: 'b' }, getAccessToken: async () => 'access-b' })
  await waitFor(() => auth.authStatus === 'authenticated')
  pending.forEach(resolve => resolve(json({ sub: 'a', rolUsuario: ROLES.SOPORTE, permissions: [P.MANAGE_USERS] })))
  await pause()
  assert(auth.user.sub === 'b' && !auth.hasPermission(P.MANAGE_USERS), 'Respuesta tardia no contamina nueva identidad')
  assert(auth.identityUser.email === undefined, 'Identidad sin correo admitida')
  for (const role of RECOGNIZED_ROLES) {
    reply = () => json({ sub: 'b', rolUsuario: role, permissions: [] })
    await auth.refreshSession(); await waitFor(() => auth.user?.rolUsuario === role)
    assert(auth.hasRole(role) && !auth.hasPermission(P.MANAGE_USERS), 'Roles sin permisos no elevan acceso')
  }
  reply = () => json({ sub: 'b', rolUsuario: ROLES.VENTAS, permissions: [P.MANAGE_USERS] })
  await auth.refreshSession(); await waitFor(() => auth.user?.rolUsuario === ROLES.VENTAS)
  assert(!auth.hasPermission(P.MANAGE_USERS), 'Catalogo limita permiso explicito excesivo')
  let finishOldVerification
  reply = () => new Promise(resolve => { finishOldVerification = resolve })
  const oldVerification = auth.refreshSession().catch(() => {})
  await waitFor(() => Boolean(finishOldVerification))
  reply = () => json({ sub: 'b', rolUsuario: ROLES.ADMIN_VENTAS, permissions: [P.MANAGE_USERS] })
  change({ verificationKey: 1 })
  await waitFor(() => auth.user?.rolUsuario === ROLES.ADMIN_VENTAS)
  finishOldVerification(json({ sub: 'b', rolUsuario: ROLES.VENTAS, permissions: [] }))
  await oldVerification; await pause()
  assert(auth.isAuthenticated && auth.user.rolUsuario === ROLES.ADMIN_VENTAS, 'Verificacion anterior a renovacion no sobrescribe resultado actual')
  for (const status of [401, 403, 503]) {
    reply = () => json({ message: 'denied' }, status)
    try { await auth.refreshSession() } catch { /* expected */ }
    await waitFor(() => !auth.user)
    assert(!auth.isAuthenticated, 'Sesion rechazada no autoriza')
  }
  reply = () => json({ sub: 'other', rolUsuario: ROLES.VENTAS, permissions: [] })
  try { await auth.refreshSession() } catch { /* expected */ }
  await waitFor(() => auth.authStatus === 'session-invalid')
  change({ sessionKey: 3, isAuthenticated: false, user: null })
  assert(!auth.user && !auth.isAuthenticated, 'Logout limpia autorizacion')
  reply = () => json({ sub: 'b', rolUsuario: ROLES.VENTAS, permissions: [] })
  change({ provider: 'auth0', sessionKey: 4, isAuthenticated: true, user: { sub: 'b' } })
  await waitFor(() => auth.authStatus === 'authenticated')
  assert(auth.provider === 'auth0', 'Auth0 comparte contrato de verificacion sin fallback')
  flushSync(() => root.render(<IdentityContext.Provider value={current}><TemporaryPasswordModal
    user={{ idUsuarioAutenticacionExterna: 'target', nombreCompleto: 'Ana' }} onClose={() => {}} /></IdentityContext.Provider>))
  assert(document.querySelector('[type=submit]').disabled, 'Credenciales administrativas bloqueadas sobre HTTP')
  assert(document.getElementById('root').textContent.includes('HTTPS'), 'HTTPS requerido visible')
}
run().then(() => { document.getElementById('result').textContent = 'AUTH_TEST_RESULT:PASS' })
  .catch(error => { document.getElementById('result').textContent = `AUTH_TEST_RESULT:FAIL:${error.message}` })
  .finally(() => { window.fetch = originalFetch; root?.unmount() })

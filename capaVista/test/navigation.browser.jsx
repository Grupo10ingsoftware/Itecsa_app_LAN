/* eslint-disable react-refresh/only-export-components -- Standalone browser acceptance harness. */
import { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import AppRouter from '../src/app/router'
import { AuthContext } from '../src/app/providers/authContext'
import { IdentityContext } from '../src/app/providers/identityContext'
import { ROLE_PERMISSIONS, can } from '../../shared/keycloakAuthorization'
import { EXPECTED_NAVIGATION } from './navigation.expected'
import 'bootstrap/dist/css/bootstrap.min.css'
import '../src/styles/global.css'
import '../src/styles/bootstrap-overrides.css'
import '../src/styles/theme.css'

const assert = (condition, message) => { if (!condition) throw Error(message) }
const pause = () => new Promise(resolve => setTimeout(resolve, 15))
async function waitFor(check, message) { for (let i = 0; i < 300; i++) { if (check()) return; await pause() } throw Error(message) }
let navigate, location, auth, count = 0, refreshes = 0
const requests = [], errors = []
window.addEventListener('error', event => errors.push(event.message))
window.addEventListener('unhandledrejection', event => errors.push(String(event.reason)))
const originalFetch = window.fetch
window.fetch = async url => {
  const target = new URL(String(url))
  assert(target.origin === window.location.origin && target.pathname.startsWith('/mock-api/'), 'Solo API sintética permitida')
  requests.push(target.pathname)
  const notifications = target.pathname.includes('notifications')
  const privacy = target.pathname.endsWith('/privacy/documents')
  const incident = target.pathname.endsWith('/security/incident-reports/config')
  const value = notifications ? { notifications: [], unreadCount: 0 } : privacy ? { documents: [], requestsEnabled: true }
    : incident ? { reportsEnabled: true, contactEmail: 'test@example.invalid' } : { message: 'Servicio simulado no disponible' }
  return new Response(JSON.stringify(value), {
    status: notifications || privacy || incident ? 200 : 503, headers: { 'content-type': 'application/json' },
  })
}
const root = createRoot(document.getElementById('root'))
const identity = { provider: 'keycloak', sessionKey: 1, getSessionKey: () => 1, getAccessToken: async () => 'synthetic-navigation-only' }
function Observe() {
  const routerNavigate = useNavigate(), routerLocation = useLocation()
  useEffect(() => { navigate = routerNavigate; location = routerLocation }, [routerNavigate, routerLocation])
  return <AppRouter />
}
function render() {
  flushSync(() => root.render(<MemoryRouter initialEntries={['/']}><IdentityContext.Provider value={identity}>
    <AuthContext.Provider value={auth}><Observe /></AuthContext.Provider>
  </IdentityContext.Provider></MemoryRouter>))
}
function setRole(role, patch = {}) {
  const user = { rolUsuario: role, permissions: ROLE_PERMISSIONS[role], sub: 'synthetic-ui-subject', nombreUsuario: 'Prueba', apellidoUsuario: 'LAN' }
  auth = { provider: 'keycloak', user, identityUser: { sub: user.sub }, isAuthenticated: true, authStatus: 'authenticated',
    isLoading: false, pinStatus: 'active', hasRole: r => r === role, hasPermission: p => can(role, user.permissions, p),
    loginWithRedirect: async () => {}, refreshSession: async () => { refreshes++; return user },
    logout: () => { auth = { ...auth, user: null, identityUser: null, isAuthenticated: false, authStatus: 'unauthenticated' }; render() }, ...patch }
  render()
}
async function go(path, expected = path) {
  const previousKey = location.key
  flushSync(() => navigate(path))
  await waitFor(() => location.key !== previousKey && location.pathname === expected &&
    (expected === '/access-denied' ? !document.querySelector('aside') : !!document.querySelector('aside')) &&
    !document.querySelector('[role="status"]')?.textContent.includes('Cargando'), `Ruta no estabiliza: ${path} → ${location.pathname}`)
  await pause()
}
function visible(element) {
  const rect = element?.getBoundingClientRect()
  return !!rect && rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.left < innerWidth && getComputedStyle(element).display !== 'none'
}
async function run() {
  const direct = ['/kanban', '/pagos', '/ordenes/nuevo', '/historial-pedidos', '/calendario-produccion', '/metricas', '/admin/usuarios', '/admin/usuarios/nuevo', '/admin', '/historial-pedidos/17', '/perfil', '/mensajes', '/mensajes/42', '/documentos', '/solicitudes', '/reportar-incidente']
  for (const [role, expected] of Object.entries(EXPECTED_NAVIGATION)) {
    setRole(role)
    await waitFor(() => navigate && document.querySelector('aside'), 'Layout no monta')
    const home = role === 'Soporte' ? '/admin/usuarios' : '/kanban'
    if (count === 0) await waitFor(() => location.pathname === home, 'Primera redirección no termina')
    await go('/', home)
    const nav = document.querySelector('aside nav')
    await waitFor(() => nav?.querySelectorAll('a').length > 0, 'Menú sin enlaces')
    const mainLinks = [...nav.querySelectorAll('a')].map(a => a.getAttribute('href')).filter(path => !['/documentos', '/solicitudes', '/reportar-incidente'].includes(path))
    assert(JSON.stringify(mainLinks) === JSON.stringify(expected), `${role}: menú inesperado ${mainLinks}`); count++
    for (const name of ['Bandeja de mensajes', 'Mi perfil']) assert(visible(document.querySelector(`header a[aria-label="${name}"]`)), `${role}: topbar ${name}`)
    const opener = document.querySelector('button[aria-controls="main-sidebar"]')
    if (innerWidth < 992) {
      assert(visible(opener) && !visible(nav), `${role}: menú móvil inicialmente cerrado`)
      opener.click(); await pause()
      await waitFor(() => visible(nav), 'Menú móvil no abre')
      assert(visible(nav) && opener.getAttribute('aria-expanded') === 'true', `${role}: menú móvil abierto`)
      nav.querySelector(`a[href="${expected[0]}"]`).click(); await pause()
      await waitFor(() => !visible(nav), 'Menú móvil no cierra')
      assert(!visible(nav) && opener.getAttribute('aria-expanded') === 'false', `${role}: menú móvil cierra al navegar`)
    } else {
      assert(visible(nav) && !visible(opener), `${role}: menú escritorio`)
      const width = nav.getBoundingClientRect().width
      document.querySelector('[aria-label="Cerrar barra lateral"]').click(); await pause()
      await waitFor(() => nav.getBoundingClientRect().width < width, 'Barra no se contrae')
      assert(nav.getBoundingClientRect().width < width, `${role}: contraer barra`)
      document.querySelector('[aria-label="Abrir barra lateral"]').click(); await pause()
      await waitFor(() => nav.getBoundingClientRect().width >= width - 1, 'Barra no se expande')
    }
    count += 4
    for (const path of direct) {
      const common = ['/perfil', '/mensajes', '/mensajes/42', '/documentos', '/solicitudes', '/reportar-incidente'].includes(path)
      const base = ['/admin', '/admin/usuarios/nuevo'].includes(path) ? '/admin/usuarios' : path === '/historial-pedidos/17' ? '/historial-pedidos' : path
      const allowed = common || expected.includes(base)
      await go(path, allowed ? (['/admin', '/admin/usuarios/nuevo'].includes(path) ? '/admin/usuarios' : path) : '/access-denied')
      assert(!!document.querySelector('aside') === allowed, `${role}: URL directa ${path}`)
      if (!allowed) {
        assert(document.querySelector('h1')?.textContent === 'Acceso denegado', `${role}: denegación explícita`)
        const before = refreshes; await pause(); assert(refreshes === before, 'Denegación legítima no renueva en bucle')
      }
      count++
    }
    await go('/login?from=%2Fkanban', home)
    await go('/ruta-inexistente', home)
    count += 2
    if (role === 'Soporte') {
      await go('/', home)
      await waitFor(() => location.pathname === home, 'Inicio Soporte')
      assert(document.getElementById('support-title') && !document.querySelector('a[href="/kanban"]'), 'Inicio Soporte sin Kanban')
      for (const path of ['/solicitudes', '/reportar-incidente']) {
        await go(path)
        const cancel = [...document.querySelectorAll('button')].find(button => button.textContent === 'Cancelar')
        assert(cancel, 'Formulario con Cancelar'); cancel.click(); await waitFor(() => location.pathname === home, 'Cancelar vuelve a inicio propio')
      }
      count += 3
    }
    await go('/', home)
    setRole(role, { isAuthenticated: false, user: null, identityUser: null, authStatus: 'session-invalid' })
    await waitFor(() => location.pathname === '/login' && !document.querySelector('aside'), `${role}: sesión expirada`)
    assert(new URLSearchParams(location.search).get('from') === home, `${role}: retorno tras expiración`); count++
    setRole(role); await go('/', home)
    const changedRole = role === 'Soporte' ? 'Desarrollador' : 'Soporte'
    setRole(changedRole)
    await waitFor(() => location.pathname === '/access-denied' && !document.querySelector('aside'), `${role}: cambio de rol retira vista`); count++
    const returnHome = [...document.querySelectorAll('button')].find(button => button.textContent === 'Ir a mi inicio')
    returnHome.click()
    await waitFor(() => location.pathname === (changedRole === 'Soporte' ? '/admin/usuarios' : '/kanban'), `${role}: inicio tras cambio de rol`); count++
  }
  setRole('Desarrollador'); await go('/metricas')
  setRole('Soporte'); await waitFor(() => location.pathname === '/access-denied', 'Cambio de rol revoca vista abierta'); count++
  const ownHome = [...document.querySelectorAll('button')].find(button => button.textContent === 'Ir a mi inicio')
  ownHome.click(); await waitFor(() => location.pathname === '/admin/usuarios', 'Denegación vuelve a inicio propio'); count++
  setRole('Soporte', { pinStatus: 'pending_acknowledgement' }); await go('/', '/perfil'); count++
  setRole('Desarrollador'); await go('/metricas')
  setRole('Desarrollador', { isAuthenticated: false, user: null, identityUser: null, authStatus: 'session-invalid' })
  await waitFor(() => location.pathname === '/login', 'Sesión expirada vuelve a login')
  assert(!document.querySelector('aside') && location.search.includes('from=%2Fmetricas'), 'Sesión expirada oculta navegación y conserva retorno'); count++
  setRole('Soporte'); await go('/', '/admin/usuarios')
  const logout = [...document.querySelectorAll('button')].find(button => /Cerrar sesi[oó]n/.test(button.textContent))
  logout.click()
  await waitFor(() => document.querySelector('[role="dialog"] .btn-primary'), 'Confirmación de logout')
  document.querySelector('[role="dialog"] .btn-primary').click()
  await waitFor(() => location.pathname === '/login', 'Logout retira vistas'); count++
  assert(errors.length === 0, `Errores de navegador: ${errors.join('; ')}`)
  assert(!requests.some(path => path.includes('/admin/')), 'La pantalla Soporte no invoca servicios administrativos pendientes'); count++
  window.__NAVIGATION_REPORT__ = { checks: count, viewport: [innerWidth, innerHeight], roles: 9, directUrls: direct.length * 9, api: 'synthetic', errors: errors.length }
}
run().then(() => { document.getElementById('result').textContent = 'NAVIGATION_TEST_RESULT:PASS' })
  .catch(error => { document.getElementById('result').textContent = `NAVIGATION_TEST_RESULT:FAIL:${error.message}; errors=${errors.join('; ')}; body=${document.getElementById('root').textContent.slice(0, 350)}` })
  .finally(() => { root.unmount(); window.fetch = originalFetch })

import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../src/app/providers/authContext'
import NavigationMenu from '../src/shared/components/navigation/NavigationMenu'
import RoleGuard from '../src/shared/components/navigation/RoleGuard'
import RoleBadge from '../src/shared/components/data/RoleBadge'
import { homeForIdentity, resolvePostLoginPath, ROUTE_ACCESS } from '../src/config/navigationAccess'
import { ROLE_PERMISSIONS, can } from '../../shared/keycloakAuthorization'

import { EXPECTED_NAVIGATION } from './navigation.expected'
import * as legacy from '../../shared/authorization'

export function run() {
  let count = 0
  assert.deepEqual(Object.keys(EXPECTED_NAVIGATION).sort(), Object.keys(ROLE_PERMISSIONS).sort())
  for (const [role, expected] of Object.entries(EXPECTED_NAVIGATION)) {
    const user = { rolUsuario: role, permissions: ROLE_PERMISSIONS[role] }
    const auth = { provider: 'keycloak', user, authStatus: 'authenticated', isAuthenticated: true,
      isLoading: false, hasRole: r => role === r, hasPermission: p => can(role, user.permissions, p) }
    const render = element => renderToStaticMarkup(<MemoryRouter><AuthContext.Provider value={auth}>{element}</AuthContext.Provider></MemoryRouter>)
    const links = [...render(<NavigationMenu />).matchAll(/href="([^"]+)"/g)].map(m => m[1])
    assert.deepEqual(links, expected, role); count++
    const home = role === 'Soporte' ? '/admin/usuarios' : '/kanban'
    assert.equal(homeForIdentity('keycloak', user), home); count++
    for (const { path, permission } of ROUTE_ACCESS) {
      const candidate = path.replace(':orderId', '17').replace(':messageId', '42')
      const isCommon = ['/perfil', '/mensajes', '/mensajes/:messageId', '/documentos', '/solicitudes', '/reportar-incidente'].includes(path)
      const base = path === '/admin' || path === '/admin/usuarios/nuevo' ? '/admin/usuarios' : path === '/historial-pedidos/:orderId' ? '/historial-pedidos' : path
      const allowed = isCommon || expected.includes(base)
      assert.equal(render(<RoleGuard requiredPermission={permission}><span>allowed-content</span></RoleGuard>).includes('allowed-content'), allowed, `${role} ${path}`)
      assert.equal(resolvePostLoginPath(`${candidate}?q=1#detail`, 'keycloak', user), allowed ? `${candidate}?q=1#detail` : home)
      count += 2
    }
    for (const candidate of [undefined, '/', '//evil.example', '/\\evil.example', 'https://evil.example', '/login', '/access-denied', '/inexistente', '/perfil\n']) {
      assert.equal(resolvePostLoginPath(candidate, 'keycloak', user), home); count++
    }
    assert.equal(render(<RoleBadge role={role} provider="keycloak" />).includes('Rol no reconocido'), false); count++
  }
  const support = { rolUsuario: 'Soporte', permissions: ROLE_PERMISSIONS.Soporte }
  assert.equal(homeForIdentity('keycloak', { ...support, permissions: [] }), '/access-denied')
  assert.equal(resolvePostLoginPath('/kanban', 'keycloak', { ...support, permissions: ['read:orders'] }), '/access-denied')
  assert.equal(homeForIdentity('unknown', support), '/access-denied')
  assert.equal(homeForIdentity('keycloak', null), '/access-denied')
  assert.equal(homeForIdentity('auth0', { rolUsuario: 'Soporte', permissions: ['read:orders', 'manage:users'] }), '/kanban')
  const legacyMenus = {
    'Administrador Produccion': ['/kanban', '/admin/usuarios', '/historial-pedidos', '/calendario-produccion', '/metricas'],
    'Administrador Ventas': ['/kanban', '/admin/usuarios', '/ordenes/nuevo', '/historial-pedidos', '/calendario-produccion'],
    'Administrador Cobranzas': ['/kanban', '/pagos', '/admin/usuarios', '/historial-pedidos'],
    Soporte: ['/kanban', '/pagos', '/admin/usuarios', '/ordenes/nuevo', '/historial-pedidos', '/calendario-produccion', '/metricas'],
  }
  for (const role of legacy.RECOGNIZED_ROLES) {
    const auth = { provider: 'auth0', hasRole: r => role === r, hasPermission: p => legacy.can(role, legacy.ROLE_PERMISSIONS[role], p) }
    const html = renderToStaticMarkup(<MemoryRouter><AuthContext.Provider value={auth}><NavigationMenu /></AuthContext.Provider></MemoryRouter>)
    const links = [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1])
    assert.deepEqual(links, legacyMenus[role] ?? EXPECTED_NAVIGATION[role], `Auth0 ${role}`); count++
  }
  assert.equal(renderToStaticMarkup(<RoleBadge role="Desarrollador" provider="auth0" />).includes('Rol no reconocido'), true)
  console.log(`${count + 7} verificaciones fase 03: nueve roles, menú, rutas, retornos y etiquetas OK`)
}

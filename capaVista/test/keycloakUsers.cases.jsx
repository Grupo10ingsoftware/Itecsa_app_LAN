import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../src/app/providers/authContext'
import { IdentityContext } from '../src/app/providers/identityContext.js'
import RoleGuard from '../src/shared/components/navigation/RoleGuard'
import UserManagementPage from '../src/modules/users/pages/UserManagementPage'
import UserCreateForm from '../src/modules/users/components/UserCreateForm'
import UserEditModal from '../src/modules/users/components/UserEditModal'
import UserManagementTable from '../src/modules/users/components/UserManagementTable'
import UserManagementFilters from '../src/modules/users/components/UserManagementFilters'
import { createAdminUsersApi } from '../src/modules/users/api/adminUsersApi.js'
import { validateUserCreateForm, hasValidationErrors } from '../src/modules/users/utils/userValidation.js'
import { ROLE_PERMISSIONS, can, ASSIGNABLE_ROLES } from '../../shared/keycloakAuthorization.js'

export async function run() {
  const user = { id: 'worker', idUsuarioAutenticacionExterna: 'worker', nombreUsuario: 'Ana', apellidoUsuario: 'Perez',
    nombreCompleto: 'Ana Perez', nombreListado: 'Ana Perez', rutUsuario: '', correoUsuario: '', rolUsuario: 'Operario Produccion', estadoUsuario: 'Vinculado' }
  const render = (element, role = 'Soporte', provider = 'keycloak') => renderToStaticMarkup(
    <MemoryRouter><IdentityContext.Provider value={{ sessionKey: 'test', getSessionKey: () => 'test', getAccessToken: async () => 'synthetic' }}>
      <AuthContext.Provider value={{ provider, authStatus: 'authenticated', isAuthenticated: true, isLoading: false,
        user: { rolUsuario: role }, hasPermission: permission => can(role, ROLE_PERMISSIONS[role], permission) }}>
        {element}
      </AuthContext.Provider></IdentityContext.Provider></MemoryRouter>)
  for (const role of Object.keys(ROLE_PERMISSIONS)) {
    const html = render(<RoleGuard requiredPermission="manage:users"><UserManagementPage /></RoleGuard>, role)
    assert.equal(html.includes('user-management-title'), role === 'Soporte', role)
  }
  const form = render(<UserCreateForm />)
  assert.ok(form.includes('user-username') && form.includes('user-prepare-pin') && form.includes('Preparar cuenta pendiente'))
  assert.ok(!form.includes('>Gerencia</option>') && !form.includes('>Desarrollador</option>') && !form.includes('>Soporte</option>'))
  const legacy = render(<UserCreateForm />, 'Soporte', 'auth0')
  assert.ok(!legacy.includes('user-username') && !legacy.includes('user-prepare-pin') && legacy.includes('Crear usuario'))
  const filters = render(<UserManagementFilters activeRole="" activeStatus="" searchTerm="" isOpen />)
  assert.ok(!filters.includes('<span>Gerencia</span>'))
  for (const role of ASSIGNABLE_ROLES) assert.ok(form.includes(`value="${role}"`))
  const detail = render(<UserEditModal user={user} isOpen readOnly onCredentials={() => {}} />)
  assert.ok(detail.includes('Consultar usuario') && !detail.includes('Guardar cambios') && !detail.includes('>Desvincular<') && !detail.includes('Establecer credenciales'))
  const table = render(<UserManagementTable users={[user]} currentPage={1} totalPages={1} totalUsers={1} readOnly />)
  assert.ok(table.includes('<table') && table.includes('Consultar') && table.includes('Movimientos'))
  assert.equal(hasValidationErrors(validateUserCreateForm(user, { optionalEmail: true, requireRut: false })), false)
  assert.equal(hasValidationErrors(validateUserCreateForm(user)), true)
  const calls = []
  const api = createAdminUsersApi({ get: async path => { calls.push({ path }); return {} }, post: async (path, body) => { calls.push({ path, body }); return {} } }, { provider: 'keycloak' })
  await api.listUsers({ rolUsuario: user.rolUsuario }); await api.getSummary(); await api.getMovements('worker'); await api.inspectUser('worker')
  await api.createUser({ ...user, username: 'worker.2', pin: '123456' })
  assert.equal(calls[0].path, '/admin/identity/users?page=1&perPage=10&rolUsuario=Operario+Produccion')
  assert.equal(calls[1].path, '/admin/identity/users/summary')
  assert.equal(calls[2].path, '/admin/identity/users/worker/movements?page=1&perPage=10')
  assert.equal(calls[3].path, '/admin/identity/identities/worker')
  assert.deepEqual(calls[4], { path: '/admin/identity/identities/prepare', body: { pin: '123456', identity: {
    username: 'worker.2', firstName: 'Ana', lastName: 'Perez', email: null, role: 'Operario Produccion' } } })
  await api.reconcile({ operationId: 'operation', pin: '123456' })
  for (const name of ['updateUser', 'unlinkUser', 'setTemporaryPassword', 'requestPasswordSetupEmail']) {
    await assert.rejects(api[name]({}), error => error.status === 503)
  }
  assert.equal(calls.length, 6)
  console.log('Users Keycloak: interfaz original, nueve roles, seis destinos, lectura, preparacion y acciones pendientes OK')
}

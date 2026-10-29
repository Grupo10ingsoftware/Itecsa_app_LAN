import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import UserManagementPage from './UserManagementPage'

const state = vi.hoisted(() => ({ api: null, success: vi.fn(), error: vi.fn(), login: vi.fn() }))
vi.mock('../hooks/useAdminUsersApi', () => ({ useAdminUsersApi: () => state.api }))
vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => ({ user: { rolUsuario: 'Soporte' }, identityUser: { sub: 'operator' }, loginWithRedirect: state.login }) }))
vi.mock('../../../shared/notifications/useToast', () => ({ useToast: () => ({ success: state.success, error: state.error }) }))
vi.mock('../components/UserManagementTable', () => ({ default: props => <section>
  <output data-testid="table">{JSON.stringify({ page: props.currentPage, loading: props.isLoading, total: props.totalUsers, users: props.users })}</output>
  <button onClick={() => props.onPageChange(props.currentPage + 1)}>Next</button>
  <button onClick={() => props.onEditUser(props.users[0])}>Inspect</button>
</section> }))
vi.mock('../components/UserCreateModal', () => ({ default: props => props.isOpen && <section>
  <button onClick={() => { void props.onCreated({ outcome: 'user_created' }) }}>Confirm creation</button>
  <button onClick={() => { void props.onCreated({ outcome: 'needs_reconciliation', operationId: 'reference' }) }}>Partial creation</button>
</section> }))
vi.mock('../components/UserEditModal', () => ({ default: props => props.isOpen && <section role="dialog">
  <button onClick={() => { void props.onSave(props.user) }}>Save</button>
</section> }))
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const user = { idUsuario: 2, idUsuarioAutenticacionExterna: 'target', nombreUsuario: 'Ana', apellidoUsuario: 'Soto', rolUsuario: 'Operario Ventas', estadoUsuario: 'Activo' }
const page = { usuarios: [user], total: 21 }
const tick = async (ms = 1) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms) }) }
const table = () => JSON.parse(screen.getByTestId('table').textContent)
function renderUsers() {
  const view = render(<UserManagementPage />)
  const toggle = screen.getByRole('button', { name: 'Expandir filtros de usuarios' })
  expect(toggle.getAttribute('aria-expanded')).toBe('false')
  fireEvent.click(toggle)
  return view
}
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks()
  state.api = { listUsers: vi.fn().mockResolvedValue(page), getSummary: vi.fn().mockResolvedValue({ totalUsuarios: 21 }),
    inspectUser: vi.fn().mockResolvedValue({ subject: 'target', firstName: 'Ana', lastName: 'Soto', role: user.rolUsuario, localState: 'Activo' }),
    updateUser: vi.fn().mockResolvedValue({ outcome: 'user_updated' }) }
})
afterEach(() => { cleanup(); vi.useRealTimers() })

it('loads the list without requesting summary and cancels its read on unmount', async () => {
  const view = renderUsers(); await tick()
  expect(table().total).toBe(21); expect(table().loading).toBe(false)
  expect(state.api.getSummary).not.toHaveBeenCalled()
  const listSignal = state.api.listUsers.mock.calls[0][1].signal
  view.unmount(); expect(listSignal.aborted).toBe(true)
})
it('creation on page 2 reloads only page 1 once: [1,2,1]', async () => {
  renderUsers(); await tick()
  fireEvent.click(screen.getByText('Next')); await tick()
  fireEvent.click(screen.getByText('Crear usuario')); fireEvent.click(screen.getByText('Confirm creation')); await tick()
  expect(state.api.listUsers.mock.calls.map(([query]) => query.page)).toEqual([1, 2, 1])
  expect(state.api.getSummary).not.toHaveBeenCalled(); expect(table().page).toBe(1)
})
it('initial filters never reset a quick page change', async () => {
  renderUsers(); await tick()
  fireEvent.click(screen.getByText('Next')); await tick(400)
  expect(table().page).toBe(2); expect(state.api.listUsers.mock.calls.map(([query]) => query.page)).toEqual([1, 2])
})
it('partial creation from page 2 preserves reconciliation warning during the page reload', async () => {
  renderUsers(); await tick()
  fireEvent.click(screen.getByText('Next')); await tick()
  fireEvent.click(screen.getByText('Crear usuario')); fireEvent.click(screen.getByText('Partial creation')); await tick()
  expect(state.api.listUsers.mock.calls.map(([query]) => query.page)).toEqual([1, 2, 1])
  expect(screen.getByText(/Preparacion incompleta.*reference/)).toBeTruthy()
  expect(screen.getByText('Partial creation')).toBeTruthy(); expect(state.success).not.toHaveBeenCalled()
})
it('waits for Apply, aborts previous filter and ignores its late response', async () => {
  const old = deferred(); state.api.listUsers.mockReturnValueOnce(old.promise)
  renderUsers(); await tick()
  fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar usuario' }), { target: { value: ' Ana ' } })
  await tick(500); expect(state.api.listUsers).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByText('Aplicar filtros')); await tick(); expect(state.api.listUsers).toHaveBeenCalledTimes(2)
  expect(state.api.listUsers.mock.calls[0][1].signal.aborted).toBe(true)
  expect(state.api.listUsers.mock.calls[1][0].search).toBe('Ana')
  await act(async () => { old.resolve({ usuarios: [], total: 999 }) }); expect(table().total).toBe(21)
})
it('combines filters, resets page and clears query without duplicate loads', async () => {
  renderUsers(); await tick()
  fireEvent.click(screen.getByText('Next')); await tick()
  fireEvent.click(screen.getByText('Vinculados')); await tick()
  fireEvent.click(screen.getByText('Ventas')); await tick()
  expect(state.api.listUsers).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByText('Aplicar filtros')); await tick()
  expect(state.api.listUsers.mock.calls.at(-1)[0]).toMatchObject({ page: 1, estadoUsuario: 'Vinculado', department: 'sales' })
  fireEvent.click(screen.getByText('Limpiar filtros')); await tick(400)
  expect(state.api.listUsers.mock.calls.at(-1)[0]).toMatchObject({ page: 1, search: '', estadoUsuario: '', department: '' })
  expect(state.api.listUsers).toHaveBeenCalledTimes(4)
})
it('waits for confirmed PATCH before closing editor or reloading the list', async () => {
  const patch = deferred(); state.api.updateUser.mockReturnValue(patch.promise)
  renderUsers(); await tick()
  fireEvent.click(screen.getByText('Inspect')); await tick()
  fireEvent.click(screen.getByText('Save')); await tick()
  expect(screen.getByRole('dialog')).toBeTruthy(); expect(state.api.listUsers).toHaveBeenCalledTimes(1)
  expect(state.success).not.toHaveBeenCalled()
  await act(async () => { patch.resolve({ outcome: 'user_updated' }) }); await tick()
  expect(screen.queryByRole('dialog')).toBeNull(); expect(state.api.listUsers).toHaveBeenCalledTimes(2)
  expect(state.api.getSummary).not.toHaveBeenCalled()
})
it('does not show obsolete summary feedback or trigger extra reads', async () => {
  state.api.getSummary.mockRejectedValueOnce(new Error('network'))
  renderUsers(); await tick()
  expect(table().total).toBe(21)
  expect(screen.queryByRole('button', { name: 'Reintentar resumen' })).toBeNull()
  expect(screen.queryByRole('region', { name: 'Resumen de usuarios' })).toBeNull()
  expect(state.api.getSummary).not.toHaveBeenCalled(); expect(state.api.listUsers).toHaveBeenCalledTimes(1)
})
it.each([401, 403])('keeps authorization failure %s visible and does not retry writes', async status => {
  state.api.listUsers.mockRejectedValue({ status })
  renderUsers(); await tick()
  expect(table().total).toBe(0)
  expect(screen.getByText(status === 401 ? /La sesion no es valida o expiro/ : /Acceso denegado/).closest('[role="status"]')).toBeTruthy()
  expect(Boolean(screen.queryByRole('button', { name: 'Iniciar sesion' }))).toBe(status === 401)
  expect(state.api.updateUser).not.toHaveBeenCalled()
})
it('API/session change aborts old inspection and does not leave subsequent inspection busy', async () => {
  const old = deferred(); state.api.inspectUser.mockReturnValueOnce(old.promise)
  const previousApi = state.api, view = renderUsers(); await tick()
  fireEvent.click(screen.getByText('Inspect')); await tick()
  state.api = { ...previousApi, listUsers: vi.fn().mockResolvedValue(page), inspectUser: vi.fn().mockResolvedValue({ firstName: 'New', role: user.rolUsuario }) }
  view.rerender(<UserManagementPage />); await tick()
  expect(previousApi.inspectUser.mock.calls[0][1].signal.aborted).toBe(true)
  fireEvent.click(screen.getByText('Inspect')); await tick()
  expect(state.api.inspectUser).toHaveBeenCalledTimes(1)
  await act(async () => { old.reject(new Error('late')) })
  expect(state.error).not.toHaveBeenCalled(); expect(screen.getByRole('dialog')).toBeTruthy()
})
it('preserves combined drafts on collapse and applies from the integrated search without duplicate reads', async () => {
  renderUsers(); await tick()
  fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar usuario' }), { target: { value: 'Ana' } })
  fireEvent.click(screen.getByRole('button', { name: 'Pendientes' }))
  fireEvent.click(screen.getByRole('button', { name: 'Producción' }))
  fireEvent.click(screen.getByRole('button', { name: 'Contraer filtros de usuarios' }))
  await tick(500)
  expect(state.api.listUsers).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'Expandir filtros de usuarios' }))
  expect(screen.getByRole('searchbox', { name: 'Buscar usuario' }).value).toBe('Ana')
  fireEvent.click(screen.getByRole('button', { name: 'Buscar usuario' })); await tick()
  expect(state.api.listUsers.mock.calls.at(-1)[0]).toMatchObject({
    search: 'Ana', estadoUsuario: 'Pendiente', department: 'production', page: 1,
  })
  fireEvent.click(screen.getByText('Aplicar filtros')); await tick()
  expect(state.api.listUsers).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByText('Limpiar filtros')); await tick()
  expect(screen.getByRole('searchbox', { name: 'Buscar usuario' }).value).toBe('')
  expect(state.api.listUsers).toHaveBeenCalledTimes(3)
  expect(state.api.updateUser).not.toHaveBeenCalled()
})

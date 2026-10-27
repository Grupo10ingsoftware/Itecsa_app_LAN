import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import UserManagementPage from './UserManagementPage'

const state = vi.hoisted(() => ({ api: null, success: vi.fn(), error: vi.fn(), login: vi.fn() }))
vi.mock('../hooks/useAdminUsersApi', () => ({ useAdminUsersApi: () => state.api }))
vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => ({ identityUser: { sub: 'operator' }, loginWithRedirect: state.login }) }))
vi.mock('../../../shared/notifications/useToast', () => ({ useToast: () => ({ success: state.success, error: state.error }) }))
vi.mock('../components/UserManagementTable', () => ({ default: props => <section>
  <output data-testid="table">{JSON.stringify({ page: props.currentPage, loading: props.isLoading, total: props.totalUsers, users: props.users })}</output>
  <button onClick={() => props.onPageChange(props.currentPage + 1)}>Next</button>
  <button onClick={() => props.onEditUser(props.users[0])}>Inspect</button>
</section> }))
vi.mock('../components/UserSummaryCards', () => ({ default: props => <output data-testid="summary">{JSON.stringify(props)}</output> }))
vi.mock('../components/UserManagementFilters', () => ({ default: props => <section>
  <input aria-label="Search" value={props.searchTerm} onChange={event => props.onSearchChange(event.target.value)} />
  <button onClick={props.onCreateUser}>Create</button>
  <button onClick={() => props.onStatusChange('Vinculado')}>Active</button>
  <button onClick={() => props.onRoleChange('Operario Ventas')}>Role</button>
  <button onClick={props.onClear}>Clear</button>
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
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks()
  state.api = { listUsers: vi.fn().mockResolvedValue(page), getSummary: vi.fn().mockResolvedValue({ totalUsuarios: 21 }),
    inspectUser: vi.fn().mockResolvedValue({ subject: 'target', firstName: 'Ana', lastName: 'Soto', role: user.rolUsuario, localState: 'Activo' }),
    updateUser: vi.fn().mockResolvedValue({ outcome: 'user_updated' }) }
})
afterEach(() => { cleanup(); vi.useRealTimers() })

it('shows list independently of summary and cancels both reads on unmount', async () => {
  const summary = deferred(); state.api.getSummary.mockReturnValue(summary.promise)
  const view = render(<UserManagementPage />); await tick()
  expect(table().total).toBe(21); expect(table().loading).toBe(false)
  expect(JSON.parse(screen.getByTestId('summary').textContent).isLoading).toBe(true)
  const listSignal = state.api.listUsers.mock.calls[0][1].signal, summarySignal = state.api.getSummary.mock.calls[0][0].signal
  view.unmount(); expect(listSignal.aborted).toBe(true); expect(summarySignal.aborted).toBe(true)
  await act(async () => { summary.resolve({ totalUsuarios: 999 }) })
})
it('creation on page 2 reloads only page 1 once: [1,2,1]', async () => {
  render(<UserManagementPage />); await tick()
  fireEvent.click(screen.getByText('Next')); await tick()
  fireEvent.click(screen.getByText('Create')); fireEvent.click(screen.getByText('Confirm creation')); await tick()
  expect(state.api.listUsers.mock.calls.map(([query]) => query.page)).toEqual([1, 2, 1])
  expect(state.api.getSummary).toHaveBeenCalledTimes(2); expect(table().page).toBe(1)
})
it('initial debounce never resets a quick page change', async () => {
  render(<UserManagementPage />); await tick()
  fireEvent.click(screen.getByText('Next')); await tick(400)
  expect(table().page).toBe(2); expect(state.api.listUsers.mock.calls.map(([query]) => query.page)).toEqual([1, 2])
})
it('partial creation from page 2 preserves reconciliation warning during the page reload', async () => {
  render(<UserManagementPage />); await tick()
  fireEvent.click(screen.getByText('Next')); await tick()
  fireEvent.click(screen.getByText('Create')); fireEvent.click(screen.getByText('Partial creation')); await tick()
  expect(state.api.listUsers.mock.calls.map(([query]) => query.page)).toEqual([1, 2, 1])
  expect(screen.getByText(/Preparacion incompleta.*reference/)).toBeTruthy()
  expect(screen.getByText('Partial creation')).toBeTruthy(); expect(state.success).not.toHaveBeenCalled()
})
it('keeps 350ms debounce, aborts previous filter and ignores its late response', async () => {
  const old = deferred(); state.api.listUsers.mockReturnValueOnce(old.promise)
  render(<UserManagementPage />); await tick()
  fireEvent.change(screen.getByLabelText('Search'), { target: { value: ' Ana ' } })
  await tick(349); expect(state.api.listUsers).toHaveBeenCalledTimes(1)
  await tick(2); await tick(); expect(state.api.listUsers).toHaveBeenCalledTimes(2)
  expect(state.api.listUsers.mock.calls[0][1].signal.aborted).toBe(true)
  expect(state.api.listUsers.mock.calls[1][0].search).toBe('Ana')
  await act(async () => { old.resolve({ usuarios: [], total: 999 }) }); expect(table().total).toBe(21)
})
it('combines filters, resets page and clears query without a second debounce load', async () => {
  render(<UserManagementPage />); await tick()
  fireEvent.click(screen.getByText('Next')); await tick()
  fireEvent.click(screen.getByText('Active')); await tick()
  fireEvent.click(screen.getByText('Role')); await tick()
  expect(state.api.listUsers.mock.calls.at(-1)[0]).toMatchObject({ page: 1, estadoUsuario: 'Vinculado', rolUsuario: 'Operario Ventas' })
  fireEvent.click(screen.getByText('Clear')); await tick(400)
  expect(state.api.listUsers.mock.calls.at(-1)[0]).toMatchObject({ page: 1, search: '', estadoUsuario: '', rolUsuario: '' })
  expect(state.api.listUsers).toHaveBeenCalledTimes(5)
})
it('waits for confirmed PATCH before closing editor or reloading list and summary', async () => {
  const patch = deferred(); state.api.updateUser.mockReturnValue(patch.promise)
  render(<UserManagementPage />); await tick()
  fireEvent.click(screen.getByText('Inspect')); await tick()
  fireEvent.click(screen.getByText('Save')); await tick()
  expect(screen.getByRole('dialog')).toBeTruthy(); expect(state.api.listUsers).toHaveBeenCalledTimes(1)
  expect(state.success).not.toHaveBeenCalled()
  await act(async () => { patch.resolve({ outcome: 'user_updated' }) }); await tick()
  expect(screen.queryByRole('dialog')).toBeNull(); expect(state.api.listUsers).toHaveBeenCalledTimes(2)
  expect(state.api.getSummary).toHaveBeenCalledTimes(2)
})
it('summary failure can retry without reloading the list', async () => {
  state.api.getSummary.mockRejectedValueOnce(new Error('network'))
  render(<UserManagementPage />); await tick()
  expect(table().total).toBe(21)
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar resumen' })); await tick()
  expect(state.api.getSummary).toHaveBeenCalledTimes(2); expect(state.api.listUsers).toHaveBeenCalledTimes(1)
})
it.each([401, 403])('keeps authorization failure %s visible and does not retry writes', async status => {
  state.api.listUsers.mockRejectedValue({ status })
  render(<UserManagementPage />); await tick()
  expect(table().total).toBe(0)
  expect(screen.getByText(status === 401 ? /La sesion no es valida o expiro/ : /Acceso denegado/).closest('[role="status"]')).toBeTruthy()
  expect(Boolean(screen.queryByRole('button', { name: 'Iniciar sesion' }))).toBe(status === 401)
  expect(state.api.updateUser).not.toHaveBeenCalled()
})
it('API/session change aborts old inspection and does not leave subsequent inspection busy', async () => {
  const old = deferred(); state.api.inspectUser.mockReturnValueOnce(old.promise)
  const previousApi = state.api, view = render(<UserManagementPage />); await tick()
  fireEvent.click(screen.getByText('Inspect')); await tick()
  state.api = { ...previousApi, listUsers: vi.fn().mockResolvedValue(page), inspectUser: vi.fn().mockResolvedValue({ firstName: 'New', role: user.rolUsuario }) }
  view.rerender(<UserManagementPage />); await tick()
  expect(previousApi.inspectUser.mock.calls[0][1].signal.aborted).toBe(true)
  fireEvent.click(screen.getByText('Inspect')); await tick()
  expect(state.api.inspectUser).toHaveBeenCalledTimes(1)
  await act(async () => { old.reject(new Error('late')) })
  expect(state.error).not.toHaveBeenCalled(); expect(screen.getByRole('dialog')).toBeTruthy()
})

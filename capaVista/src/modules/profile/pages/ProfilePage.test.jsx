import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { render } from '../../../test/renderWithToast'
import { StrictMode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import ProfilePage from './ProfilePage.jsx'

const mocks = vi.hoisted(() => ({ api: { getProfile: vi.fn(), getProfileMovements: vi.fn(), revealPin: vi.fn(), acknowledgePin: vi.fn() },
  auth: { user: { sub: 'current', rolUsuario: 'Soporte' }, pinStatus: 'active', refreshSession: vi.fn() }, begin: vi.fn(), outcome: null }))
vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => mocks.auth }))
vi.mock('../../auth/hooks/useAuthApi', () => ({ useAuthApi: () => mocks.api }))
vi.mock('../../auth/pinRecoveryBrowser', () => ({ beginPinRecovery: (...args) => mocks.begin(...args),
  getPinRecoveryOutcome: () => mocks.outcome, clearPinRecoveryOutcome: vi.fn() }))
vi.mock('../../users/components/UserMovementsModal', () => ({ default: () => null }))
beforeEach(() => {
  vi.resetAllMocks()
  mocks.auth.pinStatus = 'active'
  mocks.auth.user = { sub: 'current', rolUsuario: 'Soporte' }
  mocks.outcome = null
  mocks.api.getProfile.mockResolvedValue({ email: null })
  mocks.api.getProfileMovements.mockResolvedValue({ records: [], total: 0 })
  mocks.api.revealPin.mockResolvedValue({ pin: '123456' })
})
afterEach(cleanup)
function show(path = '/perfil') { return render(<MemoryRouter initialEntries={[path]}><ProfilePage /></MemoryRouter>) }

it('keeps transition visible until current-tab navigation leaves the document', async () => {
  mocks.begin.mockReturnValue({ result: new Promise(() => {}), cancel: vi.fn() })
  show()
  fireEvent.click(screen.getByRole('button', { name: 'Recuperar PIN' }))
  expect(screen.getByText('Para recuperar tu PIN, debes autenticarte nuevamente')).toBeTruthy()
  expect(screen.queryByLabelText('Contraseña')).toBeNull()
  expect(mocks.api.revealPin).not.toHaveBeenCalled()
  expect(mocks.auth.refreshSession).not.toHaveBeenCalled()
  expect(mocks.api.acknowledgePin).not.toHaveBeenCalled()
})
it('failure does not reveal PIN or refresh authorization', async () => {
  mocks.begin.mockReturnValue({ result: Promise.reject(Error('Autenticación cancelada')), cancel: vi.fn() })
  show()
  fireEvent.click(screen.getByRole('button', { name: 'Recuperar PIN' }))
  await screen.findByText('No fue posible iniciar la recuperación del PIN. Intenta nuevamente.')
  expect(mocks.api.revealPin).not.toHaveBeenCalled()
  expect(mocks.auth.refreshSession).not.toHaveBeenCalled()
})
it('normal profile and manipulated query cannot open recovery modal or reveal PIN', async () => {
  show('/perfil?recovery=success&pinStatus=pending_acknowledgement')
  await waitFor(() => expect(mocks.api.getProfile).toHaveBeenCalled())
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(mocks.api.revealPin).not.toHaveBeenCalled()
  expect(mocks.begin).not.toHaveBeenCalled()
})

it('return in the same tab opens existing pending PIN modal and confirms acceptance', async () => {
  mocks.auth.pinStatus = 'pending_acknowledgement'
  mocks.outcome = { recovered: true, message: '' }
  mocks.auth.refreshSession.mockImplementation(async () => { mocks.auth.pinStatus = 'active' })
  show()
  await screen.findByText('123456')
  fireEvent.click(screen.getByRole('button', { name: 'Aceptar', exact: true }))
  await screen.findByText('Tu PIN se ha actualizado correctamente')
  expect(mocks.begin).not.toHaveBeenCalled()
})

it('cancelled callback returns to profile with message and without PIN modal', async () => {
  mocks.outcome = { recovered: false, message: 'La recuperación fue cancelada.' }
  show()
  await screen.findByText('La recuperación fue cancelada.')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(mocks.api.revealPin).not.toHaveBeenCalled()
})

it('late personal data from another account cannot replace the current profile', async () => {
  let resolve
  mocks.api.getProfile.mockReturnValueOnce(new Promise(done => { resolve = done }))
  const view = show()
  mocks.auth.user = { sub: 'other', primerNombre: 'Cuenta actual' }
  mocks.api.getProfile.mockResolvedValue({ primerNombre: 'Cuenta actual', email: null })
  view.rerender(<MemoryRouter><ProfilePage /></MemoryRouter>)
  await act(async () => resolve({ primerNombre: 'CUENTA ANTERIOR', email: 'previous@example.invalid' }))
  expect(screen.queryByText('CUENTA ANTERIOR')).toBeNull()
  expect(screen.queryByText('previous@example.invalid')).toBeNull()
})

it('leaving pending reception clears its secret even when the same account becomes pending again', async () => {
  mocks.auth.pinStatus = 'pending_acknowledgement'
  const view = show(); await screen.findByText('123456')
  mocks.auth.pinStatus = 'active'; view.rerender(<MemoryRouter><ProfilePage /></MemoryRouter>)
  expect(screen.queryByText('123456')).toBeNull()
  mocks.auth.pinStatus = 'pending_acknowledgement'
  mocks.api.revealPin.mockReturnValue(new Promise(() => {}))
  view.rerender(<MemoryRouter><ProfilePage /></MemoryRouter>)
  expect(screen.queryByText('123456')).toBeNull()
})

it('a new API session for the same subject removes the old PIN before its read finishes', async () => {
  mocks.auth.pinStatus = 'pending_acknowledgement'
  const original = mocks.api
  const view = show(); await screen.findByText('123456')
  try {
    mocks.api = { ...original, getProfile: vi.fn().mockResolvedValue({ email: null }), revealPin: vi.fn().mockReturnValue(new Promise(() => {})) }
    view.rerender(<MemoryRouter><ProfilePage /></MemoryRouter>)
    expect(screen.queryByText('123456')).toBeNull()
    await act(async () => {})
    expect(mocks.api.revealPin).toHaveBeenCalledOnce()
  } finally { mocks.api = original }
})

it('uses the real username and pages through all activity in groups of ten', async () => {
  mocks.auth.identityUser = { username: 'real.operator' }
  mocks.api.getProfileMovements.mockImplementation(async ({ page, perPage }) => ({ total: 23,
    records: Array.from({ length: page === 3 ? 3 : perPage }, (_, i) => ({ id: (page - 1) * 10 + i + 1,
      detail: `Movimiento ${(page - 1) * 10 + i + 1}`, dateTime: '2026-01-01T10:00:00Z' })) }))
  const view = show()
  await screen.findByText('Movimiento 1')
  expect(screen.getByText('real.operator')).toBeTruthy()
  expect(screen.queryByText('Ver historial completo')).toBeNull()
  expect(screen.queryByLabelText('Filas por página')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }))
  await screen.findByText('Movimiento 11')
  expect(screen.queryByText('Movimiento 1')).toBeNull()
  view.rerender(<MemoryRouter><ProfilePage /></MemoryRouter>)
  expect(mocks.api.getProfileMovements).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }))
  await screen.findByText('Movimiento 23')
  expect(screen.getByRole('button', { name: 'Página siguiente' }).disabled).toBe(true)
  expect(mocks.api.getProfileMovements.mock.calls.at(-1)[0]).toEqual({ page: 3, perPage: 10 })
  delete mocks.auth.identityUser
})

it('sends only one activity read under StrictMode and reports errors through Toast', async () => {
  mocks.api.getProfileMovements.mockRejectedValueOnce(Error('offline'))
  render(<StrictMode><MemoryRouter><ProfilePage /></MemoryRouter></StrictMode>)
  await screen.findByText('No fue posible cargar tu actividad. Intenta nuevamente.')
  expect(mocks.api.getProfileMovements).toHaveBeenCalledOnce()
  expect(document.querySelector('.alert-danger')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar actividad' }))
  await waitFor(() => expect(mocks.api.getProfileMovements).toHaveBeenCalledTimes(2))
})

it('aborts old history and ignores a late result after switching accounts', async () => {
  let resolve
  mocks.api.getProfileMovements.mockReturnValueOnce(new Promise(done => { resolve = done }))
  const view = show()
  await waitFor(() => expect(mocks.api.getProfileMovements).toHaveBeenCalledOnce())
  const signal = mocks.api.getProfileMovements.mock.calls[0][1].signal
  mocks.auth.user = { sub: 'other' }
  view.rerender(<MemoryRouter><ProfilePage /></MemoryRouter>)
  expect(signal.aborted).toBe(true)
  await act(async () => resolve({ records: [{ id: 99, detail: 'OLD ACTIVITY' }], total: 1 }))
  expect(screen.queryByText('OLD ACTIVITY')).toBeNull()
})

it('keeps activity headers and integrated footer during initial and subsequent loads without false zero counts', async () => {
  const pending = []
  mocks.api.getProfileMovements.mockImplementation(() => new Promise(resolve => pending.push(resolve)))
  show()
  const table = screen.getByRole('table', { name: 'Actividad reciente del usuario' })
  expect(screen.getAllByRole('columnheader')).toHaveLength(3)
  expect(screen.getByText('Cargando resultados…')).toBeTruthy()
  expect(screen.queryByText('Mostrando 0 a 0 de 0 resultados')).toBeNull()
  expect(screen.getByRole('button', { name: 'Página siguiente' }).disabled).toBe(true)
  await waitFor(() => expect(pending).toHaveLength(1))
  await act(async () => pending[0]({ total: 11,
    records: [{ id: 1, detail: 'Primera página', dateTime: '2026-10-30T12:00:00Z' }] }))
  fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }))
  expect(screen.getByRole('table')).toBe(table)
  expect(screen.getAllByRole('columnheader')).toHaveLength(3)
  expect(screen.getByText('Cargando resultados…')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Página 2' }).getAttribute('aria-current')).toBe('page')
  await waitFor(() => expect(pending).toHaveLength(2))
  await act(async () => pending[1]({ total: 11,
    records: [{ id: 11, detail: 'Última página', dateTime: '2026-10-29T12:00:00Z' }] }))
  expect(screen.getByRole('table')).toBe(table)
  expect(screen.getByText('Mostrando 11 a 11 de 11 resultados')).toBeTruthy()
})

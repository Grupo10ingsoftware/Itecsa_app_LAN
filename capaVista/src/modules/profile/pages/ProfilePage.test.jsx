import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { render } from '../../../test/renderWithToast'
import { MemoryRouter } from 'react-router-dom'
import ProfilePage from './ProfilePage.jsx'

const mocks = vi.hoisted(() => ({ api: { getProfile: vi.fn(), revealPin: vi.fn(), acknowledgePin: vi.fn() },
  auth: { user: { sub: 'current', rolUsuario: 'Soporte' }, pinStatus: 'active', refreshSession: vi.fn() }, begin: vi.fn(), outcome: null }))
vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => mocks.auth }))
vi.mock('../../auth/hooks/useAuthApi', () => ({ useAuthApi: () => mocks.api }))
vi.mock('../../auth/pinRecoveryBrowser', () => ({ beginPinRecovery: (...args) => mocks.begin(...args),
  getPinRecoveryOutcome: () => mocks.outcome, clearPinRecoveryOutcome: vi.fn() }))
vi.mock('../../users/components/UserMovementsTable', () => ({ default: () => null }))
vi.mock('../../users/components/UserMovementsModal', () => ({ default: () => null }))
beforeEach(() => {
  vi.resetAllMocks()
  mocks.auth.pinStatus = 'active'
  mocks.auth.user = { sub: 'current', rolUsuario: 'Soporte' }
  mocks.outcome = null
  mocks.api.getProfile.mockResolvedValue({ email: null })
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
  await screen.findByText('Autenticación cancelada')
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

import { useMemo, useSyncExternalStore } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { createKeycloakSession } from './keycloakSession'
import { IdentityContext } from './identityContext'
import { AuthProvider } from './AuthProvider'
import ProtectedRoute from '../../shared/components/navigation/ProtectedRoute'
import ToastProvider from '../../shared/notifications/ToastProvider'
import { POLICY_ID, ROLES } from '../../../../shared/authorization.js'

const api = vi.hoisted(() => ({ verify: vi.fn() }))
vi.mock('../../modules/auth/hooks/useAuthApi', () => ({ useAuthApi: () => api }))
const verified = { sub: 'subject', rolUsuario: ROLES.ADMINISTRADOR, permissions: [], estadoUsuario: 'Activo', identityProvider: 'keycloak', authorizationPolicy: POLICY_ID, pinStatus: 'active' }
beforeEach(() => api.verify.mockReset().mockResolvedValue(verified))
afterEach(cleanup)

function IdentityFixture({ session, children }) {
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot)
  const actions = useMemo(() => ({
    getSessionKey: () => session.getSnapshot().sessionKey,
    getVerificationKey: () => session.getSnapshot().verificationKey,
    loginWithRedirect: vi.fn(), logout: session.logout,
  }), [session])
  return <IdentityContext.Provider value={{ ...snapshot, ...actions, provider: 'keycloak' }}>{children}</IdentityContext.Provider>
}

async function fixture() {
  let clock = 0
  const keycloak = { authenticated: true, token: 'token', tokenParsed: { sub: 'subject' },
    init: vi.fn().mockResolvedValue(true), updateToken: vi.fn().mockResolvedValue(true),
    isTokenExpired: vi.fn().mockReturnValue(false), clearToken: vi.fn() }
  const session = createKeycloakSession(keycloak, { isSecureContext: true, crypto: { subtle: {} }, location: { href: 'https://fixture.invalid/', origin: 'https://fixture.invalid' } }, undefined, undefined, { now: () => clock })
  await session.init()
  render(<ToastProvider><MemoryRouter><IdentityFixture session={session}><AuthProvider>
    <ProtectedRoute fallback={<p>Sesión terminada</p>}><input aria-label="Borrador" defaultValue="" /></ProtectedRoute>
  </AuthProvider></IdentityFixture></MemoryRouter></ToastProvider>)
  await screen.findByLabelText('Borrador')
  return { session, keycloak, setClock: value => { clock = value } }
}

it('keeps the mounted form and its text across ordinary token renewals, then revalidates at 30 minutes', async () => {
  const { session, setClock } = await fixture()
  const input = screen.getByLabelText('Borrador')
  fireEvent.change(input, { target: { value: 'Trabajo en curso' } })
  for (const time of [300_000, 600_000, 1_799_999]) {
    setClock(time)
    await act(() => session.getAccessToken())
    expect(screen.getByLabelText('Borrador')).toBe(input)
    expect(input.value).toBe('Trabajo en curso')
  }
  expect(api.verify).toHaveBeenCalledTimes(1)
  let complete
  api.verify.mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
  setClock(1_800_000)
  await act(() => session.revalidate())
  expect(api.verify).toHaveBeenCalledTimes(2)
  expect(screen.queryByLabelText('Borrador')).toBeNull()
  await act(async () => complete(verified))
  expect(screen.getByLabelText('Borrador')).not.toBe(input)
})

it('removes the protected view immediately when token renewal fails before the periodic check', async () => {
  const { session, keycloak, setClock } = await fixture()
  setClock(10_000)
  keycloak.updateToken.mockRejectedValueOnce(Error('revoked'))
  await act(async () => { await expect(session.getAccessToken()).rejects.toThrow('revoked') })
  expect(screen.queryByLabelText('Borrador')).toBeNull()
  expect(session.getSnapshot().isAuthenticated).toBe(false)
})

it('authorization changes force the existing backend verification immediately, inside the 30-minute window', async () => {
  const { session, keycloak, setClock } = await fixture()
  let complete
  api.verify.mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
  setClock(20_000)
  keycloak.tokenParsed.permissions = ['changed']
  await act(() => session.getAccessToken())
  expect(api.verify).toHaveBeenCalledTimes(2)
  expect(screen.queryByLabelText('Borrador')).toBeNull()
  await act(async () => complete(verified))
  expect(screen.getByLabelText('Borrador')).toBeTruthy()
})

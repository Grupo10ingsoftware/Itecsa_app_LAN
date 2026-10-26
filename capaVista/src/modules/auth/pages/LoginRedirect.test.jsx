import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import LoginRedirect from './LoginRedirect.jsx'

const { auth } = vi.hoisted(() => ({ auth: {} }))
vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => auth }))

beforeEach(() => {
  Object.assign(auth, { isLoading: false, isAuthenticated: false, identityUser: null, error: null,
    authStatus: 'unauthenticated', loginWithRedirect: vi.fn(), logout: vi.fn() })
})
afterEach(cleanup)
function open(path = '/login') { return render(<MemoryRouter initialEntries={[path]}><LoginRedirect /></MemoryRouter>) }

describe('technical login entry point', () => {
  it('automatically starts Keycloak for old logout bookmarks without rendering a landing page', async () => {
    const view = open('/login?logged_out=1&from=%2Fperfil')
    await waitFor(() => expect(auth.loginWithRedirect).toHaveBeenCalledWith({ appState: { returnTo: '/perfil' } }))
    expect(view.container.querySelector('[data-scope="screen"]')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })
  it('waits for initialization and backend verification', () => {
    auth.isLoading = true
    const view = open()
    expect(auth.loginWithRedirect).not.toHaveBeenCalled()
    expect(view.container.querySelector('[data-scope="screen"]')).toBeTruthy()
  })
  it('does not repeatedly authenticate an identity rejected by the API', () => {
    auth.identityUser = { sub: 'subject' }
    auth.error = { status: 401, message: 'internal detail that must stay private' }
    open()
    expect(auth.loginWithRedirect).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Reiniciar sesión' })).toBeTruthy()
    expect(screen.queryByText(/internal detail/)).toBeNull()
  })
  it('shows a recoverable error without retry loops for communication failures', () => {
    auth.error = Error('internal host address')
    open()
    expect(auth.loginWithRedirect).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('No fue posible conectar')
    expect(screen.queryByText(/internal host/)).toBeNull()
  })
  it('restarts authentication automatically when a session expires', async () => {
    auth.error = { code: 'SESSION_INVALID' }
    open()
    await waitFor(() => expect(auth.loginWithRedirect).toHaveBeenCalledOnce())
    expect(screen.queryByRole('button')).toBeNull()
  })
})

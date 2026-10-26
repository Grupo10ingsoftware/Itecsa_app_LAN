import { expect, it, vi } from 'vitest'
import { createKeycloakSession } from './keycloakSession'

it('original login and renewal retain web client tokens and return path', async () => {
  const keycloak = { authenticated: true, token: 'original-token', tokenParsed: { sub: 'original-user' },
    init: vi.fn().mockResolvedValue(true), login: vi.fn().mockResolvedValue(), clearToken: vi.fn(),
    updateToken: vi.fn().mockResolvedValue(true), isTokenExpired: () => false }
  const browser = { isSecureContext: true, crypto: { subtle: {} },
    location: { href: 'http://127.0.0.1:5173/', origin: 'http://127.0.0.1:5173' },
    sessionStorage: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() } }
  const session = createKeycloakSession(keycloak, browser)
  await session.init()
  expect(keycloak.init).toHaveBeenCalledWith(expect.objectContaining({ flow: 'standard', pkceMethod: 'S256' }))
  await session.loginWithRedirect({ appState: { returnTo: '/perfil' } })
  expect(browser.sessionStorage.setItem).toHaveBeenCalledWith('itecsa.returnTo', '/perfil')
  expect(await session.getAccessToken()).toBe('original-token')
  expect(session.getSnapshot().user.sub).toBe('original-user')
  expect(keycloak.clearToken).not.toHaveBeenCalled()
})

it('recovery bootstrap restores original tokens with normal PKCE and session monitoring', async () => {
  const restored = { token: 'original-access', refreshToken: 'original-refresh', idToken: 'original-id', subject: 'original', sid: 'original-session' }
  const keycloak = { authenticated: true, token: restored.token, refreshToken: restored.refreshToken,
    tokenParsed: { sub: restored.subject, sid: restored.sid }, init: vi.fn().mockResolvedValue(true),
    updateToken: vi.fn().mockResolvedValue(false), isTokenExpired: () => false, clearToken: vi.fn() }
  const browser = { isSecureContext: true, crypto: { subtle: {} },
    location: { href: 'http://127.0.0.1:5173/perfil', origin: 'http://127.0.0.1:5173' } }
  const session = createKeycloakSession(keycloak, browser, vi.fn(), restored)
  await session.init()
  expect(keycloak.init).toHaveBeenCalledWith(expect.objectContaining({ token: restored.token, refreshToken: restored.refreshToken,
    idToken: restored.idToken, pkceMethod: 'S256', checkLoginIframe: true }))
  expect(await session.getRecoveryRefreshToken()).toBe(restored.refreshToken)
  expect(session.getSnapshot().user.sub).toBe('original')
})

it('a different account during restored SDK initialization is never published', async () => {
  const keycloak = { authenticated: true, token: 'different-token', tokenParsed: { sub: 'other', sid: 'other' },
    init: vi.fn().mockResolvedValue(true), clearToken: vi.fn() }
  const browser = { isSecureContext: true, crypto: { subtle: {} },
    location: { href: 'http://127.0.0.1:5173/perfil', origin: 'http://127.0.0.1:5173' } }
  const session = createKeycloakSession(keycloak, browser, vi.fn(), { subject: 'original', sid: 'session', token: 'original-token', refreshToken: 'original-refresh' })
  await session.init()
  expect(session.getSnapshot().isAuthenticated).toBe(false)
  expect(session.getSnapshot().user).toBeNull()
  expect(keycloak.clearToken).toHaveBeenCalled()
})

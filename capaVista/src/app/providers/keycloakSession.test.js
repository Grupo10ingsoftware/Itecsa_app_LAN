import { describe, expect, it, vi } from 'vitest'
import { createKeycloakSession, safeReturnPath } from './keycloakSession.js'

function setup(authenticated = false) {
  const keycloak = {
    authenticated, token: authenticated ? 'access-token' : undefined,
    idToken: authenticated ? 'id-token' : undefined,
    tokenParsed: authenticated ? { sub: 'subject', preferred_username: 'operator' } : undefined,
    init: vi.fn().mockResolvedValue(authenticated),
    login: vi.fn().mockResolvedValue(undefined),
    updateToken: vi.fn().mockResolvedValue(false),
    isTokenExpired: vi.fn().mockReturnValue(false),
    clearToken: vi.fn(function () { this.authenticated = false; this.token = undefined; this.idToken = undefined }),
    createLogoutUrl: vi.fn(function () {
      expect(this.idToken).toBe('id-token')
      return 'https://identity.example/logout'
    }),
  }
  const storage = new Map()
  const browser = {
    isSecureContext: true, crypto: { subtle: {} },
    location: { origin: 'https://app.example', href: 'https://app.example/kanban', replace: vi.fn() },
    sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
  }
  const onRedirect = vi.fn()
  const session = createKeycloakSession(keycloak, browser, onRedirect)
  return { session, keycloak, browser, storage, onRedirect }
}

describe('Keycloak navigation and session lifecycle', () => {
  it('initializes once and preserves PKCE and session monitoring', async () => {
    const { session, keycloak } = setup()
    await Promise.all([session.init(), session.init()])
    expect(keycloak.init).toHaveBeenCalledTimes(1)
    expect(keycloak.init).toHaveBeenCalledWith(expect.objectContaining({ pkceMethod: 'S256', flow: 'standard', checkLoginIframe: true }))
    expect(keycloak.login).not.toHaveBeenCalled()
  })

  it('deduplicates login navigation and stores only the destination', async () => {
    const { session, keycloak, storage } = setup()
    await Promise.all([session.loginWithRedirect({ appState: { returnTo: '/ordenes/nuevo?step=2' } }), session.loginWithRedirect()])
    expect(keycloak.login).toHaveBeenCalledTimes(1)
    expect(keycloak.login).toHaveBeenCalledWith({ redirectUri: 'https://app.example', locale: 'es' })
    expect([...storage.entries()]).toEqual([['itecsa.returnTo', '/ordenes/nuevo?step=2']])
  })

  it('builds the real logout request before clearing tokens and replaces history', async () => {
    const { session, keycloak, browser, storage } = setup(true)
    await session.init()
    storage.set('itecsa.returnTo', '/perfil')
    const observations = []
    session.subscribe(() => observations.push(session.getSnapshot()))
    await Promise.all([session.logout(), session.logout(), session.loginWithRedirect()])
    expect(keycloak.createLogoutUrl).toHaveBeenCalledOnce()
    expect(keycloak.createLogoutUrl).toHaveBeenCalledWith({ redirectUri: 'https://app.example/login' })
    expect(browser.location.replace).toHaveBeenCalledWith('https://identity.example/logout')
    expect(keycloak.idToken).toBeUndefined()
    expect(storage.size).toBe(0)
    expect(observations.every(s => !s.isAuthenticated && !s.user && s.isLoading)).toBe(true)
    expect(keycloak.login).not.toHaveBeenCalled()
  })

  it('cannot revive a session when a refresh finishes after logout', async () => {
    const { session, keycloak } = setup(true)
    await session.init()
    let complete
    keycloak.updateToken.mockImplementation(() => new Promise(resolve => { complete = resolve }))
    const request = session.getAccessToken()
    await session.logout()
    keycloak.authenticated = true
    keycloak.token = 'late-token'
    complete(true)
    await expect(request).rejects.toThrow('La sesion cambio.')
    expect(session.getSnapshot().isAuthenticated).toBe(false)
    expect(keycloak.token).toBeUndefined()
  })

  it('invalidates an expired session and requests fresh authentication once', async () => {
    const { session, keycloak } = setup(true)
    await session.init()
    keycloak.updateToken.mockRejectedValue(Error('offline'))
    await expect(session.getAccessToken()).rejects.toThrow('offline')
    expect(session.getSnapshot()).toMatchObject({ isAuthenticated: false, user: null, error: { code: 'SESSION_INVALID' } })
    await session.loginWithRedirect()
    expect(keycloak.login).toHaveBeenCalledWith(expect.objectContaining({ prompt: 'login' }))
  })

  it('checks the server again before exposing a page restored from browser history', async () => {
    const { session, keycloak } = setup(true)
    await session.init()
    keycloak.updateToken.mockRejectedValue(Error('session revoked'))
    await session.resume()
    expect(keycloak.updateToken).toHaveBeenCalledWith(-1)
    expect(session.getSnapshot()).toMatchObject({ isLoading: false, isAuthenticated: false, user: null })
  })

  it('keeps a restored page hidden while a previous refresh finishes, then forces a server check', async () => {
    const { session, keycloak } = setup(true)
    await session.init()
    let complete
    keycloak.updateToken.mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
    keycloak.updateToken.mockRejectedValueOnce(Error('revoked while away'))
    const regular = session.getAccessToken()
    const observations = []
    session.subscribe(() => observations.push(session.getSnapshot()))
    const resume = session.resume()
    complete(true)
    await regular
    await resume
    expect(keycloak.updateToken.mock.calls.map(args => args[0])).toEqual([30, -1])
    expect(observations.filter(state => state.isAuthenticated).every(state => state.isLoading)).toBe(true)
    expect(session.getSnapshot().isAuthenticated).toBe(false)
  })

  it('presents an error when the SDK rejects initialization without an error object', async () => {
    const { session, keycloak } = setup()
    keycloak.init.mockRejectedValue(undefined)
    await session.loginWithRedirect()
    expect(session.getSnapshot().error).toBeInstanceOf(Error)
    expect(keycloak.login).not.toHaveBeenCalled()
  })

  it('never starts OIDC from an insecure origin or a failed SDK initialization', async () => {
    const { session, keycloak, browser } = setup()
    browser.isSecureContext = false
    await session.loginWithRedirect()
    expect(keycloak.init).not.toHaveBeenCalled()
    expect(keycloak.login).not.toHaveBeenCalled()
    expect(session.getSnapshot().error.code).toBe('AUTH_CONFIGURATION_ERROR')
  })

  it('restores a safe destination after the authorization callback', async () => {
    const { session, browser, storage, onRedirect } = setup(true)
    browser.location.href = 'https://app.example/?code=authorization-code&state=state'
    storage.set('itecsa.returnTo', '/perfil')
    await session.init()
    expect(onRedirect).toHaveBeenCalledWith('/perfil')
    expect(storage.size).toBe(0)
  })

  it.each(['//external.example', '/\\external.example', '/login?logged_out=1', '/access-denied', '/\nperfil', undefined])('rejects unsafe or cyclic destination %s', value => {
    expect(safeReturnPath(value)).toBe('/kanban')
  })
})

describe('Keycloak PIN recovery session', () => {
  it('restores the original tokens with PKCE and session monitoring', async () => {
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

  it('never publishes a different account during restored SDK initialization', async () => {
    const keycloak = { authenticated: true, token: 'different-token', tokenParsed: { sub: 'other', sid: 'other' },
      init: vi.fn().mockResolvedValue(true), clearToken: vi.fn() }
    const browser = { isSecureContext: true, crypto: { subtle: {} },
      location: { href: 'http://127.0.0.1:5173/perfil', origin: 'http://127.0.0.1:5173' } }
    const session = createKeycloakSession(keycloak, browser, vi.fn(),
      { subject: 'original', sid: 'session', token: 'original-token', refreshToken: 'original-refresh' })

    await session.init()

    expect(session.getSnapshot().isAuthenticated).toBe(false)
    expect(session.getSnapshot().user).toBeNull()
    expect(keycloak.clearToken).toHaveBeenCalled()
  })
})

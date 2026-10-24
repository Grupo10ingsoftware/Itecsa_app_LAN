export function safeReturnPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')
    || Array.from(value).some(c => c.charCodeAt(0) < 32)) return '/kanban'
  return value
}

export function createKeycloakSession(keycloak, browser, onRedirect = () => {}) {
  let snapshot = { isLoading: true, isAuthenticated: false, user: null, error: null, sessionKey: 0, verificationKey: 0 }
  const listeners = new Set()
  let initialization, renewal, generation = 0
  const notify = patch => { snapshot = { ...snapshot, ...patch }; listeners.forEach(fn => fn()) }
  const invalid = error => {
    generation++
    notify({ isLoading: false, isAuthenticated: false, user: null, error, sessionKey: generation })
    keycloak.clearToken()
  }
  const publish = () => {
    const claims = keycloak.tokenParsed
    if (!keycloak.authenticated || !keycloak.token || typeof claims?.sub !== 'string' || !claims.sub) throw Error('Sesion Keycloak incompleta.')
    if (snapshot.user?.sub !== claims.sub || !snapshot.isAuthenticated) generation++
    notify({ isLoading: false, isAuthenticated: true, error: null, sessionKey: generation, verificationKey: snapshot.verificationKey + 1,
      user: { sub: claims.sub, name: claims.name || claims.preferred_username,
        ...(typeof claims.email === 'string' && claims.email ? { email: claims.email } : {}), picture: claims.picture } })
  }
  const getAccessToken = async () => {
    const expected = generation
    if (!snapshot.isAuthenticated) throw Error('Sesion no valida.')
    try {
      renewal ??= keycloak.updateToken(30).then(refreshed => ({ refreshed, published: false })).finally(() => { renewal = null })
      const update = await renewal
      if (expected !== generation) {
        if (!snapshot.isAuthenticated) keycloak.clearToken()
        throw Error('La sesion cambio.')
      }
      if (!keycloak.authenticated || !keycloak.token || keycloak.isTokenExpired(0)) throw Error('La sesion expiro.')
      if (keycloak.tokenParsed?.sub !== snapshot.user?.sub) { publish(); throw Error('La identidad cambio.') }
      if (update.refreshed && !update.published) { update.published = true; publish() }
      return keycloak.token
    } catch (error) {
      if (expected === generation) invalid(Object.assign(Error('La sesion expiro. Inicia sesion nuevamente.'), { code: 'SESSION_INVALID', status: 401, cause: error }))
      throw error
    }
  }
  keycloak.onTokenExpired = () => { void getAccessToken().catch(() => {}) }
  keycloak.onAuthLogout = () => {
    if (snapshot.isAuthenticated) invalid(Object.assign(Error('La sesion termino.'), { code: 'SESSION_INVALID', status: 401 }))
  }
  return {
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    getSnapshot: () => snapshot,
    init() {
      initialization ??= (async () => {
        try {
          if (!browser.isSecureContext || !browser.crypto?.subtle) throw Object.assign(Error('Keycloak con PKCE requiere un origen seguro HTTPS o localhost.'), { code: 'AUTH_CONFIGURATION_ERROR' })
          const callback = new URL(browser.location.href).searchParams.has('code')
          const authenticated = await keycloak.init({ flow: 'standard', pkceMethod: 'S256', responseMode: 'query',
            checkLoginIframe: true, redirectUri: browser.location.origin, enableLogging: false })
          if (authenticated) {
            publish()
            if (callback) {
              const path = safeReturnPath(browser.sessionStorage.getItem('itecsa.returnTo'))
              browser.sessionStorage.removeItem('itecsa.returnTo')
              onRedirect(path)
            }
          } else notify({ isLoading: false })
        } catch (error) { invalid(error) }
      })()
      return initialization
    },
    async loginWithRedirect(options = {}) {
      try {
        await this.init()
        if (snapshot.error && !browser.isSecureContext) throw snapshot.error
        browser.sessionStorage.setItem('itecsa.returnTo', safeReturnPath(options.appState?.returnTo))
        await keycloak.login({ redirectUri: browser.location.origin })
      } catch (error) { invalid(error) }
    },
    async logout() {
      try {
        const url = keycloak.createLogoutUrl({ redirectUri: `${browser.location.origin}/login?logged_out=1` })
        // Mantener la ruta protegida en carga hasta que el navegador salga hacia Keycloak.
        // Un estado "no autenticado" visible aqui redirige a /login e inicia otro login.
        generation++
        snapshot = { ...snapshot, isAuthenticated: false, user: null, sessionKey: generation }
        keycloak.clearToken()
        browser.sessionStorage.removeItem('itecsa.returnTo')
        notify({ isLoading: true, error: null })
        browser.location.assign(url)
      } catch (error) { invalid(error) }
    },
    getAccessToken,
  }
}

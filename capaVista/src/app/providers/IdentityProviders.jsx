import { useAuth0 } from '@auth0/auth0-react'
import Keycloak from 'keycloak-js'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { runtimeConfig } from '../../config/runtimeConfig.js'
import { IdentityContext } from './identityContext.js'
import { createKeycloakSession } from './keycloakSession.js'

export function Auth0IdentityProvider({ children }) {
  const auth = useAuth0()
  const sessionKey = useMemo(() => ({ authenticated: auth.isAuthenticated, subject: auth.user?.sub }), [auth.isAuthenticated, auth.user?.sub])
  const current = useRef(sessionKey)
  useLayoutEffect(() => { current.current = sessionKey }, [sessionKey])
  const getSessionKey = useCallback(() => current.current, [])
  const { getAccessTokenSilently } = auth
  const getAccessToken = useCallback(() => getAccessTokenSilently({
    authorizationParams: { audience: runtimeConfig.auth0Audience },
  }), [getAccessTokenSilently])
  const value = useMemo(() => ({ ...auth, provider: 'auth0', sessionKey, getSessionKey, getAccessToken }),
    [auth, sessionKey, getSessionKey, getAccessToken])
  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>
}

let keycloakSession
export function KeycloakIdentityProvider({ children, onRedirect }) {
  // One SDK initialization per document, including React StrictMode's effect replay.
  keycloakSession ??= createKeycloakSession(new Keycloak({ url: runtimeConfig.keycloakUrl,
    realm: runtimeConfig.keycloakRealm, clientId: runtimeConfig.keycloakClientId }), window, onRedirect)
  const session = keycloakSession
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot)
  useEffect(() => { void session.init() }, [session])
  const actions = useMemo(() => ({
    getAccessToken: session.getAccessToken, getSessionKey: () => session.getSnapshot().sessionKey,
    getVerificationKey: () => session.getSnapshot().verificationKey,
    loginWithRedirect: options => session.loginWithRedirect(options), logout: () => session.logout(),
  }), [session])
  const value = useMemo(() => ({ ...snapshot, ...actions, provider: 'keycloak' }), [snapshot, actions])
  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>
}

import Keycloak from 'keycloak-js'
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { runtimeConfig } from '../../config/runtimeConfig.js'
import { IdentityContext } from './identityContext.js'
import { createKeycloakSession } from './keycloakSession.js'

let keycloakSession
export function KeycloakIdentityProvider({ children, onRedirect, recoverySession }) {
  // One SDK initialization per document, including React StrictMode's effect replay.
  keycloakSession ??= createKeycloakSession(new Keycloak({ url: runtimeConfig.keycloakUrl,
    realm: runtimeConfig.keycloakRealm, clientId: runtimeConfig.keycloakClientId }), window, onRedirect, recoverySession)
  const session = keycloakSession
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot)
  useEffect(() => {
    void session.init()
    const handlePageShow = event => { if (event.persisted) void session.resume() }
    window.addEventListener('pageshow', handlePageShow)
    return () => window.removeEventListener('pageshow', handlePageShow)
  }, [session])
  const actions = useMemo(() => ({
    getAccessToken: session.getAccessToken, getSessionKey: () => session.getSnapshot().sessionKey,
    getRecoveryRefreshToken: session.getRecoveryRefreshToken,
    getVerificationKey: () => session.getSnapshot().verificationKey,
    loginWithRedirect: options => session.loginWithRedirect(options), logout: () => session.logout(),
  }), [session])
  const value = useMemo(() => ({ ...snapshot, ...actions, provider: 'keycloak' }), [snapshot, actions])
  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>
}

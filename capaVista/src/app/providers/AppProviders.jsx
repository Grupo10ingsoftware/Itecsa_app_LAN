import { runtimeConfig, validateBrowserIdentityConfig } from '../../config/runtimeConfig.js'
import { Auth0IdentityProvider, KeycloakIdentityProvider } from './IdentityProviders.jsx'
import { safeReturnPath } from './keycloakSession.js'
import { Auth0Provider } from '@auth0/auth0-react'
import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthProvider } from './AuthProvider'


export default function AppProviders({ children }) {
  const navigate = useNavigate()
  const handleRedirectCallback = useCallback(
    (appState) => {
      navigate(safeReturnPath(appState?.returnTo), { replace: true })
    },
    [navigate],
  )

  try { validateBrowserIdentityConfig(runtimeConfig, window) } catch (error) {
    return <div role="alert" className="alert alert-danger m-4">{error.message}</div>
  }
  if (runtimeConfig.authProvider === 'keycloak') return (
    <KeycloakIdentityProvider onRedirect={path => navigate(path, { replace: true })}>
      <AuthProvider>{children}</AuthProvider>
    </KeycloakIdentityProvider>
  )
  return (
    <Auth0Provider
      domain={runtimeConfig.auth0Domain}
      clientId={runtimeConfig.auth0ClientId}
      authorizationParams={{
        // Solicita access tokens destinados a la API ITECSA, no tokens Management.
        audience: runtimeConfig.auth0Audience,
        redirect_uri: window.location.origin,
      }}
      onRedirectCallback={handleRedirectCallback}
      cacheLocation="memory"
    >
      <Auth0IdentityProvider><AuthProvider>{children}</AuthProvider></Auth0IdentityProvider>
    </Auth0Provider>
  )
}

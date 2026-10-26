import { runtimeConfig, validateBrowserIdentityConfig } from '../../config/runtimeConfig.js'
import { KeycloakIdentityProvider } from './IdentityProviders.jsx'
import { safeReturnPath } from './keycloakSession.js'
import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthProvider } from './AuthProvider'

export default function AppProviders({ children, recoverySession }) {
  const navigate = useNavigate()
  const handleRedirectCallback = useCallback(
    path => navigate('/', { replace: true, state: { returnTo: safeReturnPath(path) } }),
    [navigate],
  )
  try { validateBrowserIdentityConfig(runtimeConfig, window) } catch (error) {
    return <div role="alert" className="alert alert-danger m-4">{error.message}</div>
  }
  return (
    <KeycloakIdentityProvider onRedirect={handleRedirectCallback} recoverySession={recoverySession}>
      <AuthProvider>{children}</AuthProvider>
    </KeycloakIdentityProvider>
  )
}

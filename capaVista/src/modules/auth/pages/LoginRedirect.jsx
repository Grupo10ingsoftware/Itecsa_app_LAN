import { useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../../hooks/useAuth'
import { safeReturnPath } from '../../../app/providers/keycloakSession.js'
import { resolvePostLoginPath } from '../../../config/navigationAccess'
import { APP_ROUTES } from '../../../config/routes'
import LoadingIndicator from '../../../shared/components/loading/LoadingIndicator'

export default function LoginRedirect() {
  const { identityUser, error, authStatus, isAuthenticated, isLoading, loginWithRedirect, logout, provider, user } = useAuth()
  const location = useLocation()
  const returnTo = safeReturnPath(location.state?.fromPath ?? new URLSearchParams(location.search).get('from') ?? location.state?.from?.pathname)
  const canRedirect = !isLoading && !isAuthenticated && !identityUser && (!error || error.code === 'SESSION_INVALID')

  useEffect(() => {
    if (canRedirect) void loginWithRedirect({ appState: { returnTo } })
  }, [canRedirect, loginWithRedirect, returnTo])

  if (isAuthenticated) return <Navigate replace to={resolvePostLoginPath(returnTo, provider, user)} />
  if (authStatus === 'access-denied') return <Navigate replace to={APP_ROUTES.ACCESS_DENIED} />

  // El indicador acompaña la redirección automática sin agregar pasos al login.
  if (error && !canRedirect && !isLoading) {
    return (
      <main className="container py-5">
        <div className="alert alert-danger" role="alert">
          No fue posible {identityUser ? 'verificar tu acceso' : 'conectar con el inicio de sesión'}. Intenta nuevamente o contacta al administrador.
        </div>
        <button className="btn btn-primary" type="button" onClick={() => identityUser ? logout() : window.location.reload()}>
          {identityUser ? 'Reiniciar sesión' : 'Volver a intentar'}
        </button>
      </main>
    )
  }
  return <LoadingIndicator scope="screen" context="Inicio de sesión" />
}

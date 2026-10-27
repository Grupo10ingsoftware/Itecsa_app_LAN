import LoadingIndicator from '../loading/LoadingIndicator'
import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { APP_ROUTES } from '../../../config/routes'
import { useAuth } from '../../../hooks/useAuth'

const AUTH_LOADING_TIMEOUT_MS = 10000

export default function ProtectedRoute({ children, fallback }) {
  const { authStatus, error, isAuthenticated, isLoading, pinStatus } = useAuth()
  const location = useLocation()
  const fromPath = `${location.pathname}${location.search}${location.hash}`
  const [wait, setWait] = useState({ isLoading, expired: false })
  // Reiniciar antes de renderizar otra espera; un timeout antiguo no debe
  // redirigir el primer render del siguiente ciclo de verificación.
  if (wait.isLoading !== isLoading) setWait({ isLoading, expired: false })
  const authLoadingExpired = wait.isLoading === isLoading && wait.expired

  useEffect(() => {
    if (!isLoading) {
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      setWait(current => ({ ...current, expired: true }))
    }, AUTH_LOADING_TIMEOUT_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [isLoading])

  if (isLoading && !authLoadingExpired) {
    return (
      <LoadingIndicator scope="screen" context="Verificación de acceso" />
    )
  }

  if (authStatus === 'access-denied') return <Navigate replace to={APP_ROUTES.ACCESS_DENIED} />

  if (authStatus === 'error') {
    return (
      <div className="alert alert-danger m-4" role="alert">
        No fue posible verificar la sesion con el backend.
        {error?.message ? ` ${error.message}` : ''}
      </div>
    )
  }

  if (!isAuthenticated || authStatus === 'session-invalid') {
    // Control visual de frontend: la autorizacion definitiva se valida en backend.
    return (
      fallback ?? (
        <Navigate
          replace
          state={{
            fromPath,
          }}
          to={`/login?from=${encodeURIComponent(fromPath)}`}
        />
      )
    )
  }

  if (pinStatus === 'pending_acknowledgement' && ![APP_ROUTES.PROFILE, APP_ROUTES.DOCUMENTS, APP_ROUTES.DATA_REQUESTS, APP_ROUTES.INCIDENT_REPORT].includes(location.pathname)) {
    return <Navigate replace to={APP_ROUTES.PROFILE} />
  }

  if (authStatus !== 'authenticated') return <Navigate replace to={APP_ROUTES.ACCESS_DENIED} />
  return children ?? <Outlet />
}

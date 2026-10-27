import LoadingIndicator, { LoadingAction } from '../../../shared/components/loading/LoadingIndicator'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../hooks/useAuth'
import styles from './AccessDeniedPage.module.css'
import { homeForIdentity } from '../../../config/navigationAccess'

export default function AccessDeniedPage() {
  const { logout, refreshSession, provider, user, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const automaticRetryStarted = useRef(false)
  const [isRetrying, setIsRetrying] = useState(!isAuthenticated)
  const [retryFailed, setRetryFailed] = useState(false)

  const retryAccess = useCallback(async () => {
    setIsRetrying(true)
    setRetryFailed(false)

    try {
      const verifiedUser = await refreshSession()
      const destination = homeForIdentity(provider, verifiedUser)
      if (destination !== '/access-denied') navigate(destination, { replace: true })
    } catch {
      setRetryFailed(true)
    } finally {
      setIsRetrying(false)
    }
  }, [navigate, refreshSession, provider])

  useEffect(() => {
    if (automaticRetryStarted.current) return
    automaticRetryStarted.current = true
    if (!isAuthenticated) {
      const timer = window.setTimeout(retryAccess, 0)
      return () => { window.clearTimeout(timer); automaticRetryStarted.current = false }
    }
  }, [retryAccess, isAuthenticated])

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <header className={styles.cardHeader}>
          <span className={styles.icon}>
            <i aria-hidden="true" className="bi bi-shield-lock" />
          </span>
          <h1 className={styles.title}>Acceso denegado</h1>
        </header>
        <div className={styles.body}>
          <p className={styles.description} aria-live="polite">
            {isRetrying
              ? <LoadingIndicator announce={false} context="Verificación de acceso" />
              : retryFailed
                ? 'No fue posible validar esta sesión. Puedes reintentar o iniciar una sesión nueva.'
                : 'No tienes permisos para acceder a este recurso.'}
          </p>
          <div className={styles.actions}>
            {isAuthenticated && homeForIdentity(provider, user) !== '/access-denied' && (
              <button className={styles.button} onClick={() => navigate(homeForIdentity(provider, user), { replace: true })} type="button">Ir a mi inicio</button>
            )}
            <button className={styles.button} disabled={isRetrying} onClick={retryAccess} type="button" aria-busy={isRetrying}>
              <i className="bi bi-arrow-clockwise" />
              <LoadingAction busy={isRetrying} context="Reintentar acceso">Reintentar acceso</LoadingAction>
            </button>
            <button className={styles.secondaryButton} onClick={logout} type="button">
              Cerrar sesión
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}

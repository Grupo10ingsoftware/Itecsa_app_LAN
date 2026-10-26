import AppProviders from './providers/AppProviders'
import AppRouter from './router'
import AppErrorBoundary from '../shared/components/errors/AppErrorBoundary.jsx'
import PinRecoveryCallbackPage from '../modules/auth/pages/PinRecoveryCallbackPage.jsx'
import { PIN_RECOVERY_CALLBACK, hasPinRecoveryContext } from '../modules/auth/pinRecoveryBrowser.js'
import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { APP_ROUTES } from '../config/routes.js'

function App() {
  const navigate = useNavigate()
  const [resuming, setResuming] = useState(() => window.location.pathname === PIN_RECOVERY_CALLBACK || hasPinRecoveryContext())
  const [restored, setRestored] = useState(null)
  const onComplete = useCallback(result => {
    setRestored(result)
    navigate(APP_ROUTES.PROFILE, { replace: true })
    setResuming(false)
  }, [navigate])
  // Never give the recovery code to the ordinary web-client SDK.
  if (resuming) return <PinRecoveryCallbackPage onComplete={onComplete} />
  if (restored?.error) return <main className="container py-5"><h1>Mi perfil</h1>
    <p role="alert">{restored.error}</p><a href="/login?logged_out=1">Volver al inicio de sesión</a></main>
  return (
    <AppErrorBoundary>
      <AppProviders recoverySession={restored?.session}>
        <AppRouter />
      </AppProviders>
    </AppErrorBoundary>
  )
}

export default App

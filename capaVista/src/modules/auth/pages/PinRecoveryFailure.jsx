import { useEffect, useRef, useState } from 'react'
import ToastProvider from '../../../shared/notifications/ToastProvider'
import { useToast } from '../../../shared/notifications/useToast'
import { PIN_RECOVERY_CONTEXT } from '../pinRecoveryBrowser'

export default function PinRecoveryFailure(props) {
  return <ToastProvider><Failure {...props} /></ToastProvider>
}

function Failure({ result, onComplete }) {
  const notify = useToast()
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(Date.now)
  const pending = useRef(false)
  useEffect(() => { notify.error(result.error) }, [notify, result])
  useEffect(() => {
    if (!result.retryAt) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [result.retryAt])
  async function retry() {
    if (pending.current) return
    pending.current = true; setBusy(true)
    try { onComplete(await result.retry()) }
    finally { pending.current = false; setBusy(false) }
  }
  return <main className="container py-5"><h1>Mi perfil</h1>
    {result.retry && <button type="button" className="btn btn-outline-secondary"
      disabled={busy || now < result.retryAt} onClick={retry}>Reintentar restauración de sesión</button>}
    <a className="btn btn-outline-secondary" href="/login?logged_out=1" onClick={() => {
      try { sessionStorage.removeItem(PIN_RECOVERY_CONTEXT) } catch { /* Public metadata only. */ }
    }}>Volver al inicio de sesión</a>
  </main>
}

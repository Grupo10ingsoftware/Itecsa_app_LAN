import { useEffect, useRef, useState } from 'react'
import PinModal, { PinError } from '../../../shared/components/pin/PinModal'
import styles from '../../../shared/components/pin/PinModal.module.css'
import LoadingIndicator, { LoadingAction } from '../../../shared/components/loading/LoadingIndicator'

// The secret lives only while the pending reception dialog is mounted.
export default function PendingPinModal({ api, refreshSession, onAcknowledged }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const acknowledged = useRef(false)
  const pending = useRef(false)
  const active = useRef(false)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  useEffect(() => {
    let current = true
    // Cancel the discarded StrictMode setup before sending a sensitive POST.
    queueMicrotask(() => {
      if (!current || acknowledged.current) return
      api.revealPin().then(({ pin: value }) => {
        if (current && !acknowledged.current) { setPin(value); setError('') }
      }).catch(failure => {
        if (current) setError(failure?.payload?.message ?? 'No fue posible mostrar el PIN.')
      })
    })
    return () => { current = false }
  }, [api, attempt])

  async function acknowledge() {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      if (!acknowledged.current) {
        await api.acknowledgePin()
        if (!active.current) return
        acknowledged.current = true
        setAccepted(true)
        setPin('')
        onAcknowledged()
      }
      // Keep verification: a durable receipt alone does not grant session permissions.
      await refreshSession()
    } catch (failure) {
      if (active.current) setError(failure?.payload?.message ?? 'No fue posible confirmar la recepcion del PIN.')
    } finally {
      pending.current = false
      if (active.current) setBusy(false)
    }
  }

  return <PinModal title="Tu PIN personal" canClose={false} busy={busy}
    description="Guardalo en un lugar seguro. Despues de aceptar no volvera a mostrarse."
    actions={<button className={styles.primary} disabled={(!pin && !accepted) || busy}
      onClick={acknowledge} type="button" aria-busy={busy}>
      <LoadingAction busy={busy} surface="light" context="Aceptar">{accepted ? 'Continuar' : 'Aceptar'}</LoadingAction>
    </button>}>
    <div className={styles.secret}>{pin || (accepted ? 'PIN aceptado' : error ? 'PIN no disponible'
      : <LoadingIndicator scope="action" context="PIN operativo" />)}</div>
    <PinError>{error}</PinError>
    {error && !pin && !accepted && <button className={styles.primary} type="button" onClick={() => {
      setError(''); setAttempt(value => value + 1)
    }}>Reintentar</button>}
  </PinModal>
}

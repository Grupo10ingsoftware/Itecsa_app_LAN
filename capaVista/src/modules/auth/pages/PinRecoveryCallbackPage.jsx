import { useEffect } from 'react'
import LoadingIndicator from '../../../shared/components/loading/LoadingIndicator'
import { continuePinRecovery } from '../pinRecoveryBrowser'

export default function PinRecoveryCallbackPage({ onComplete }) {
  useEffect(() => {
    let current = true
    void continuePinRecovery().then(result => { if (current) onComplete(result) })
    return () => { current = false }
  }, [onComplete])
  return <main className="container py-5 text-center" aria-live="polite">
    <h1 className="h4">Comprobando tu identidad</h1>
    <LoadingIndicator scope="section" context="Comprobando tu identidad" />
    <p>Volverás automáticamente a Mi perfil al finalizar la validación.</p>
  </main>
}

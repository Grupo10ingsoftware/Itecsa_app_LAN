import { useEffect } from 'react'
import { continuePinRecovery } from '../pinRecoveryBrowser'

export default function PinRecoveryCallbackPage({ onComplete }) {
  useEffect(() => {
    let current = true
    void continuePinRecovery().then(result => { if (current) onComplete(result) })
    return () => { current = false }
  }, [onComplete])
  return <main className="container py-5" aria-live="polite">
    <h1 className="h4">Comprobando tu identidad</h1>
    <p>Volverás automáticamente a Mi perfil al finalizar la validación.</p>
    <span className="spinner-border text-warning" role="status"><span className="visually-hidden">Cargando</span></span>
  </main>
}

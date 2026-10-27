import { useContext, useEffect, useRef, useState } from 'react'
import { AuthContext } from '../../../app/providers/authContext'
import PinModal, { PinActions, PinField, PinObservation } from './PinModal'

export default function PinAuthorizationModal({ contextKey = '', ...props }) {
  const auth = useContext(AuthContext)
  // A new actor or operation gets a fresh, empty, independently mounted form.
  return <AuthorizationForm key={`${auth?.user?.sub ?? ''}:${contextKey}`} {...props} />
}

function AuthorizationForm({ onConfirm, onCancel, observation, isSubmitting = false, errorMessage,
  failureMessage = 'No fue posible autorizar la operación.', confirmLabel, cancelLabel,
  disableUntilValid = false, ...presentation }) {
  const [pin, setPin] = useState('')
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const active = useRef(false)
  const inputRef = useRef(null)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const valid = /^\d{6}$/.test(pin) && (!observation?.required || Boolean(comment.trim()))
    && (!observation?.maxLength || comment.length <= observation.maxLength)
  const locked = busy || isSubmitting
  function close() {
    if (pending.current || isSubmitting) return
    setPin(''); setComment(''); setError('')
    onCancel?.()
  }
  async function submit(event) {
    event.preventDefault()
    if (pending.current || isSubmitting) return
    const enteredPin = pin
    setPin('') // Clear even on local validation failures, before awaiting the network.
    if (!valid) {
      setError(!/^\d{6}$/.test(enteredPin) ? 'Ingrese un PIN valido de 6 digitos.' : 'Revise la observación requerida y su límite de caracteres.')
      inputRef.current?.focus()
      return
    }
    pending.current = true
    setBusy(true); setError('')
    try {
      const result = await onConfirm({ pin: enteredPin, comment: comment.trim() })
      if (active.current && result === false) setError(failureMessage)
    } catch (failure) {
      if (active.current) setError(failure?.payload?.message || failureMessage)
    } finally {
      pending.current = false
      if (active.current) { setBusy(false); inputRef.current?.focus() }
    }
  }
  return <PinModal {...presentation} busy={locked} onClose={close} onSubmit={submit} initialFocusRef={inputRef}
    actions={<PinActions busy={locked} disabled={disableUntilValid && !valid} onCancel={close} confirmLabel={confirmLabel} cancelLabel={cancelLabel} />}>
    <PinField value={pin} onChange={value => { setPin(value); setError('') }} inputRef={inputRef} disabled={locked} error={error || errorMessage} />
    {observation && <PinObservation {...observation} value={comment} onChange={value => { setComment(value); setError('') }} disabled={locked} />}
  </PinModal>
}

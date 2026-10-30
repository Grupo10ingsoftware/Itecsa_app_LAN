import { useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useModalDialog } from '../../../modules/users/hooks/useModalDialog'
import { LoadingAction } from '../loading/LoadingIndicator'
import styles from './PinModal.module.css'

// Presentation only: the caller owns authorization and business transitions.
export default function PinModal({ title = 'Autorizar acción', description, children, actions,
  onClose, canClose = true, busy = false, onSubmit, initialFocusRef }) {
  const id = useId()
  const modalRef = useRef(null)
  const titleRef = useRef(null)
  useModalDialog({ containerRef: modalRef, initialFocusRef: initialFocusRef ?? titleRef,
    isOpen: true, canClose: canClose && !busy, onClose })
  const Element = onSubmit ? 'form' : 'section'
  return createPortal(
    <div className={styles.layer} data-modal-layer="true" onMouseDown={event => {
      if (event.target === event.currentTarget && canClose && !busy) onClose?.()
    }}>
      <Element className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}
        aria-describedby={description ? `${id}-description` : undefined} aria-busy={busy}
        ref={modalRef} tabIndex={-1} onSubmit={onSubmit} {...(onSubmit ? { noValidate: true } : {})}>
        <header className={styles.header}>
          <h2 id={`${id}-title`} ref={titleRef} tabIndex={-1}>{title}</h2>
          {canClose && <button type="button" className={styles.close} aria-label="Cerrar validacion" disabled={busy} onClick={onClose}>×</button>}
        </header>
        <div className={styles.body}>
          {description && <p className={styles.description} id={`${id}-description`}>{description}</p>}
          {children}
        </div>
        <footer className={styles.footer}>{actions}</footer>
      </Element>
    </div>, document.body)
}

export function PinActions({ busy, disabled, onCancel, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar' }) {
  return <>
    {onCancel && <button className={styles.secondary} disabled={busy} type="button" onClick={onCancel}>{cancelLabel}</button>}
    <button className={styles.primary} type="submit" disabled={busy || disabled} aria-busy={busy}>
      <LoadingAction busy={busy} surface="light" context={confirmLabel}>{confirmLabel}</LoadingAction>
    </button>
  </>
}

export function PinError({ id, children }) {
  return children ? <p id={id} className={styles.error} role="alert">{children}</p> : null
}

export function PinField({ value, onChange, disabled, error, inputRef, label = 'PIN personal' }) {
  const id = useId()
  return <>
    <label className={styles.field} htmlFor={id}>{label}
      <span className={styles.inputWrap}>
        <input id={id} ref={inputRef} className={styles.input} type="password" inputMode="numeric"
          autoComplete="off" maxLength={6} placeholder="000000" disabled={disabled} value={value}
          aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined}
          onChange={event => onChange(event.target.value.replace(/\D/g, '').slice(0, 6))} />
        <svg className={styles.eye} aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 3l18 18M10 5c5-1 9 4 11 7-1 2-2 3-4 4M6 6c-2 2-4 4-5 6 3 5 8 8 13 6M10 10a3 3 0 004 4" />
        </svg>
      </span>
    </label>
    <PinError id={`${id}-error`}>{error}</PinError>
  </>
}

export function PinObservation({ value, onChange, disabled, required = false, maxLength, label = 'Observación', placeholder = 'Escribe una observación (opcional)…' }) {
  const id = useId()
  return <div className={styles.field}><label htmlFor={id}>{label}</label>
    <textarea id={id} className={styles.textarea} rows={3} value={value} required={required}
      aria-required={required} maxLength={maxLength} disabled={disabled} placeholder={placeholder}
      aria-describedby={maxLength ? `${id}-count` : undefined} onChange={event => onChange(event.target.value)} />
    {maxLength && <span className={styles.counter} id={`${id}-count`}>{value.length} / {maxLength}</span>}
  </div>
}

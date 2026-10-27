import { createPortal } from 'react-dom'
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ToastContext } from './useToast'
import { createToastStore } from './toastStore'
import styles from './ToastProvider.module.css'

const titles = { success: 'Éxito', error: 'Error', warning: 'Advertencia', info: 'Información' }
const paths = {
  success: <path d="m6 12 4 4 8-8" />,
  error: <path d="m8 8 8 8m0-8-8 8" />,
  warning: <><path d="m12 3 10 18H2L12 3Z" /><path d="M12 9v5m0 3h.01" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10h.01" /></>,
}

function ToastCard({ toast, store }) {
  const returnFocus = useRef(null)
  function close() {
    const card = document.getElementById(toast.id)
    const focused = card?.contains(document.activeElement)
    const next = card?.nextElementSibling ?? card?.previousElementSibling
    store.api.dismiss(toast.id)
    if (focused) {
      const target = next?.querySelector('button') ?? returnFocus.current
      if (target?.isConnected && !target.closest('[inert], [aria-hidden="true"]')) target.focus()
    }
  }
  const title = toast.title || titles[toast.severity]
  return <article id={toast.id} className={styles.card} data-severity={toast.severity} data-closing={toast.closing || undefined} aria-hidden={toast.closing || undefined}
    onMouseEnter={() => store.pause(toast.id, 'pointer', true)}
    onMouseLeave={() => store.pause(toast.id, 'pointer', false)}
    onFocus={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) returnFocus.current = event.relatedTarget
      store.pause(toast.id, 'focus', true)
    }} onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) store.pause(toast.id, 'focus', false)
    }}>
    <span className={styles.icon} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{paths[toast.severity]}</svg></span>
    <div className={styles.copy}>
      <div role={toast.severity === 'error' ? 'alert' : 'status'} aria-atomic="true">
        <strong>{title}</strong><p>{toast.message}</p>
      </div>
      {toast.action && <button className={styles.action} disabled={toast.closing} type="button" onClick={() => { toast.action.onClick(); close() }}>{toast.action.label}</button>}
    </div>
    <button className={styles.close} disabled={toast.closing} aria-label={`Cerrar notificación: ${title}`} type="button" onClick={close}><span aria-hidden="true">×</span></button>
  </article>
}

function ToastViewport({ store }) {
  const toasts = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const viewportRef = useRef(null)
  useEffect(() => {
    const element = viewportRef.current
    const resize = () => {
      const modal = Boolean(document.querySelector('[role="dialog"][aria-modal="true"]'))
      element.dataset.dialogOpen = String(modal)
      const limit = modal && window.innerWidth <= 900 || window.innerHeight < 500 ? 1 : window.innerHeight < 700 || window.innerWidth < 600 ? 2 : 3
      const cards = [...element.querySelectorAll('article')]
      const focusedCard = document.activeElement?.closest('article')
      if (focusedCard && cards.indexOf(focusedCard) >= limit) cards[0]?.querySelector('button')?.focus()
      store.setLimit(limit)
      document.body.style.setProperty('--toast-reserve', `${element.childElementCount ? element.getBoundingClientRect().height + 32 : 16}px`)
    }
    resize()
    const observer = new MutationObserver(resize)
    observer.observe(document.body, { childList: true, subtree: true })
    const sizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null
    sizeObserver?.observe(element)
    window.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('resize', resize)
      observer.disconnect(); sizeObserver?.disconnect()
      document.body.style.removeProperty('--toast-reserve')
    }
  }, [store])
  return createPortal(<section ref={viewportRef} className={styles.viewport} data-toast-viewport="true" aria-label="Notificaciones del sistema"
    style={{ '--toast-count': Math.max(1, toasts.length) }}>
    {toasts.map(toast => <ToastCard key={toast.id} toast={toast} store={store} />)}
  </section>, document.body)
}

export default function ToastProvider({ children }) {
  const [store] = useState(createToastStore)
  // Activate before producers' passive effects, including StrictMode's replay.
  useLayoutEffect(() => { store.activate(); return () => store.dispose() }, [store])
  return <ToastContext.Provider value={store.api}>{children}<ToastViewport store={store} /></ToastContext.Provider>
}

import { createNotificationRefresh } from '../utils/notificationRefresh'
import LoadingIndicator, { LoadingAction } from '../../../shared/components/loading/LoadingIndicator'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { APP_ROUTES } from '../../../config/routes'
import { useMessagesApi } from '../hooks/useMessagesApi'
import { formatMessageDate, notificationPreview, notifyMessagesChanged } from '../utils/messageFormatters'
import styles from './NotificationBell.module.css'
import { collectNewNotifications } from '../utils/popupNotifications'
import { useToast } from '../../../shared/notifications/useToast'
import { useMessageSound } from '../hooks/useMessageSound'

const REFRESH_INTERVAL_MS = 5_000

export default function NotificationBell({ buttonClassName }) {
  const api = useMessagesApi()
  return <NotificationBellSession key={api.scopeId} api={api} buttonClassName={buttonClassName} />
}

function NotificationBellSession({ api, buttonClassName }) {
  const notify = useToast()
  const playSound = useMessageSound()
  const navigate = useNavigate()
  const rootRef = useRef(null)
  const latestIdRef = useRef(null)
  const revision = useRef(null)
  const refresh = useRef(null)
  const actionRef = useRef(false)
  const [action, setAction] = useState(null)
  const activity = useRef({ active: true })
  useEffect(() => {
    const tracker = activity.current
    tracker.active = true
    return () => { tracker.active = false }
  }, [api])
  const [isOpen, setIsOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const receive = useEffectEvent(result => {
    if (!result.unchanged) {
      const incoming = result.notifications ?? []
      const { latestId, messages } = collectNewNotifications(incoming, latestIdRef.current)
      latestIdRef.current = latestId
      for (const { id_mensaje: messageId } of messages) notify.info('Nuevo mensaje recibido.', {
        title: 'Nuevo mensaje', source: 'messages', operation: String(messageId),
        action: { label: 'Leer mensaje', onClick: () => {
          if (activity.current.active) navigate(APP_ROUTES.MESSAGE_DETAIL.replace(':messageId', messageId))
        } },
      })
      if (messages.length) playSound()
      setNotifications(incoming)
    }
    revision.current = result.revision ?? null
    setUnreadCount(result.unreadCount ?? 0)
    setIsLoading(false)
    setError('')
  })

  useEffect(() => {
    const visible = () => document.visibilityState === 'visible'
    let authorized = true
    const scheduler = createNotificationRefresh({
      visible: () => visible() && authorized,
      load: ({ signal }) => api.getNotifications(50, { compact: true, revision: revision.current, signal }),
      onData: result => receive(result),
      onLoading: setIsLoading,
      onError: error => {
        setIsLoading(false)
        setError('No fue posible cargar las notificaciones.')
        if ([401, 403].includes(error?.status)) {
          authorized = false
          revision.current = null
          setNotifications([])
          setUnreadCount(0)
        }
      },
    })
    refresh.current = scheduler
    const initialLoad = window.setTimeout(() => scheduler.request({ quiet: false }), 0)
    const refreshVisible = () => scheduler.request()
    const changed = () => { revision.current = null; void scheduler.request({ invalidate: true }) }
    const interval = window.setInterval(refreshVisible, REFRESH_INTERVAL_MS)
    document.addEventListener('visibilitychange', refreshVisible)
    window.addEventListener('focus', refreshVisible)
    window.addEventListener('messages:changed', changed)
    return () => {
      scheduler.dispose()
      window.clearTimeout(initialLoad)
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', refreshVisible)
      window.removeEventListener('focus', refreshVisible)
      window.removeEventListener('messages:changed', changed)
    }
  }, [api])

  useEffect(() => {
    function handlePointerDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) setIsOpen(false)
    }
    function handleKeyDown(event) {
      if (isOpen && event.key === 'Escape') {
        setIsOpen(false)
        rootRef.current?.querySelector('button')?.focus()
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  function handleOpenMessage(message) {
    if (actionRef.current) return
    setIsOpen(false)
    navigate(APP_ROUTES.MESSAGE_DETAIL.replace(':messageId', message.id_mensaje))
  }

  async function handleHide(event, messageId) {
    event.stopPropagation()
    if (actionRef.current) return
    actionRef.current = true
    refresh.current?.beginAction()
    setAction({ kind: 'hide', id: messageId })

    try {
      await api.hideNotification(messageId)
      if (!activity.current.active) return
      setNotifications((current) => current.filter((item) => item.id_mensaje !== messageId))
      revision.current = null
      notifyMessagesChanged()
    } catch {
      if (activity.current.active) notify.error('No fue posible limpiar la notificación.')
    } finally {
      await refresh.current?.endAction()
      actionRef.current = false
      if (activity.current.active) setAction(null)
    }
  }

  async function handleClearAll() {
    if (actionRef.current) return
    actionRef.current = true
    refresh.current?.beginAction()
    const before = notifications
    setAction({ kind: 'clear' })
    try {
      await api.clearNotifications()
      if (!activity.current.active) return
      const removed = new Set(before.map(item => item.id_mensaje))
      setNotifications(current => current.filter(item => !removed.has(item.id_mensaje)))
      revision.current = null
      setError('')
      notifyMessagesChanged()
    } catch {
      if (activity.current.active) notify.error('No fue posible limpiar las notificaciones.')
    } finally {
      await refresh.current?.endAction()
      actionRef.current = false
      if (activity.current.active) setAction(null)
    }
  }

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={`Notificaciones${unreadCount ? `, ${unreadCount} sin leer` : ''}`}
        className={`${styles.bellButton} ${buttonClassName}`}
        onClick={() => {
          setIsOpen((current) => !current)
          if (!isOpen) void refresh.current?.request({ quiet: false })
        }}
        type="button"
      >
        <i className="bi bi-bell" aria-hidden="true" />
        {unreadCount > 0 && <span className={styles.badge}>{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>

      {isOpen && (
        <section aria-label="Notificaciones nuevas" className={styles.panel} role="dialog">
          <header className={styles.header}>
            <div>
              <p className={styles.eyebrow}>Actividad reciente</p>
              <h2>Notificaciones</h2>
            </div>
            <button className={styles.clearButton} disabled={notifications.length === 0 || Boolean(action)} aria-busy={action?.kind === 'clear'} onClick={handleClearAll} type="button">
              <i className="bi bi-trash3" aria-hidden="true" />
              <LoadingAction surface="light" busy={action?.kind === 'clear'}>Limpiar</LoadingAction>
            </button>
          </header>

          <div className={styles.body}>
            {isLoading && <LoadingIndicator context="notificaciones" />}
            {!isLoading && error && <div className={styles.error} role="alert">{error}</div>}
            {!isLoading && !error && notifications.length === 0 && (
              <div className={styles.emptyState}>
                <i className="bi bi-bell-slash" aria-hidden="true" />
                <strong>Todo al día</strong>
                <span>No tienes notificaciones nuevas.</span>
              </div>
            )}
            {!isLoading && notifications.map((notification) => (
              <article className={styles.notification} key={notification.id_mensaje}>
                <button className={styles.notificationMain} disabled={Boolean(action)} onClick={() => handleOpenMessage(notification)} type="button">
                  <span className={styles.unreadDot} aria-label="Sin leer" />
                  <span className={styles.notificationCopy}>
                    <strong>{notification.Asunto}</strong>
                    <span>{notificationPreview(notification)}</span>
                    <small>{formatMessageDate(notification.fecha_publicacion)}</small>
                  </span>
                </button>
                <button aria-label={`Limpiar ${notification.Asunto}`} className={styles.itemTrash} disabled={Boolean(action)} aria-busy={action?.kind === 'hide' && action.id === notification.id_mensaje} onClick={(event) => handleHide(event, notification.id_mensaje)} type="button">
                  {action?.kind === 'hide' && action.id === notification.id_mensaje ? <LoadingIndicator scope="action" size="small" context="Limpiar notificación" /> : <i className="bi bi-trash3" aria-hidden="true" />}
                </button>
              </article>
            ))}
          </div>

          <button className={styles.viewAll} onClick={() => { setIsOpen(false); navigate(APP_ROUTES.MESSAGES) }} type="button">
            Ver bandeja de entrada
            <i className="bi bi-arrow-right" aria-hidden="true" />
          </button>
        </section>
      )}
    </div>
  )
}

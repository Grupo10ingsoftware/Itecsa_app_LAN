import LoadingIndicator, { LoadingAction } from '../../../shared/components/loading/LoadingIndicator'
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { APP_ROUTES } from '../../../config/routes'
import { useMessagesApi } from '../hooks/useMessagesApi'
import { formatMessageDate, messagePreview, notifyMessagesChanged } from '../utils/messageFormatters'
import styles from './NotificationBell.module.css'
import { collectNewNotifications } from '../utils/popupNotifications'
import { useToast } from '../../../shared/notifications/useToast'
import { useMessageSound } from '../hooks/useMessageSound'

const REFRESH_INTERVAL_MS = 5_000

export default function NotificationBell({ buttonClassName }) {
  const notify = useToast()
  const playSound = useMessageSound()
  const api = useMessagesApi()
  const navigate = useNavigate()
  const rootRef = useRef(null)
  const latestIdRef = useRef(null)
  const loadingRef = useRef(false)
  const actionRef = useRef(false)
  const [action, setAction] = useState(null)
  const activity = useRef({ active: true, version: 0 })
  useEffect(() => {
    const tracker = activity.current
    tracker.active = true
    return () => { tracker.active = false; tracker.version++ }
  }, [api])
  const [isOpen, setIsOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const loadNotifications = useCallback(async ({ quiet = false } = {}) => {
    if (loadingRef.current || actionRef.current) return
    const version = activity.current.version
    loadingRef.current = true
    if (!quiet) setIsLoading(true)

    try {
      const result = await api.getNotifications(50)
      if (!activity.current.active || version !== activity.current.version) return
      const incoming = result.notifications ?? []
      const { latestId, messages } = collectNewNotifications(incoming, latestIdRef.current)
      latestIdRef.current = latestId
      for (const { id_mensaje: messageId } of messages) notify.info('Nuevo mensaje recibido.', {
        title: 'Nuevo mensaje', source: 'messages', operation: String(messageId),
        action: { label: 'Leer mensaje', onClick: () => navigate(APP_ROUTES.MESSAGE_DETAIL.replace(':messageId', messageId)) },
      })
      if (messages.length) playSound()
      setNotifications(incoming)
      setUnreadCount(result.unreadCount ?? 0)
      setError('')
    } catch {
      if (activity.current.active && version === activity.current.version) setError('No fue posible cargar las notificaciones.')
    } finally {
      loadingRef.current = false
      if (!quiet && activity.current.active) setIsLoading(false)
    }
  }, [api, navigate, notify, playSound])

  const refreshNotifications = useEffectEvent((options) => loadNotifications(options))

  useEffect(() => {
    const initialLoad = window.setTimeout(() => refreshNotifications(), 0)
    const refreshVisible = () => {
      if (document.visibilityState === 'visible') refreshNotifications({ quiet: true })
    }
    const interval = window.setInterval(refreshVisible, REFRESH_INTERVAL_MS)
    document.addEventListener('visibilitychange', refreshVisible)
    window.addEventListener('focus', refreshVisible)
    const handleMessagesChanged = () => refreshNotifications({ quiet: true })
    window.addEventListener('messages:changed', handleMessagesChanged)

    return () => {
      window.clearTimeout(initialLoad)
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', refreshVisible)
      window.removeEventListener('focus', refreshVisible)
      window.removeEventListener('messages:changed', handleMessagesChanged)
    }
  }, [])

  useEffect(() => {
    function handlePointerDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) setIsOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [])

  async function handleOpenMessage(message) {
    if (actionRef.current) return
    actionRef.current = true
    activity.current.version++
    setAction({ kind: 'open', id: message.id_mensaje })
    try {
      await api.markAsRead(message.id_mensaje)
      if (!activity.current.active) return
      notifyMessagesChanged()
      setIsOpen(false)
      navigate(APP_ROUTES.MESSAGE_DETAIL.replace(':messageId', message.id_mensaje))
    } catch {
      if (activity.current.active) notify.error('No fue posible abrir la notificación.')
    } finally {
      actionRef.current = false
      if (activity.current.active) setAction(null)
    }
  }

  async function handleHide(event, messageId) {
    event.stopPropagation()
    if (actionRef.current) return
    actionRef.current = true
    activity.current.version++
    setAction({ kind: 'hide', id: messageId })

    try {
      await api.hideNotification(messageId)
      if (!activity.current.active) return
      setNotifications((current) => current.filter((item) => item.id_mensaje !== messageId))
      setUnreadCount((current) => Math.max(0, current - 1))
      notifyMessagesChanged()
    } catch {
      if (activity.current.active) notify.error('No fue posible limpiar la notificación.')
    } finally {
      actionRef.current = false
      if (activity.current.active) setAction(null)
    }
  }

  async function handleClearAll() {
    if (actionRef.current) return
    actionRef.current = true
    activity.current.version++
    setAction({ kind: 'clear' })
    try {
      await api.clearNotifications()
      if (!activity.current.active) return
      setNotifications([])
      setUnreadCount(0)
      setError('')
      notifyMessagesChanged()
    } catch {
      if (activity.current.active) notify.error('No fue posible limpiar las notificaciones.')
    } finally {
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
          if (!isOpen) loadNotifications()
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
                <button className={styles.notificationMain} disabled={Boolean(action)} aria-busy={action?.kind === 'open' && action.id === notification.id_mensaje} onClick={() => handleOpenMessage(notification)} type="button">
                  {action?.kind === 'open' && action.id === notification.id_mensaje && <LoadingIndicator scope="action" context="Abrir notificación" />}
                  <span className={styles.unreadDot} aria-label="Sin leer" />
                  <span className={styles.notificationCopy}>
                    <strong>{notification.Asunto}</strong>
                    <span>{messagePreview(notification.contenido, 82)}</span>
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

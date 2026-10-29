import LoadingIndicator from '../../../shared/components/loading/LoadingIndicator'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { APP_ROUTES } from '../../../config/routes'
import { useMessagesApi } from '../hooks/useMessagesApi'
import { formatMessageDate, notifyMessagesChanged } from '../utils/messageFormatters'
import styles from './MessageDetailPage.module.css'
import PageShell from '../../../shared/components/layout/PageShell'
import PageHeader from '../../../shared/components/layout/PageHeader'
import { useAuth } from '../../../hooks/useAuth'
import { PERMISSIONS } from '../../../config/permissions'

export default function MessageDetailPage() {
  const { messageId } = useParams()
  const api = useMessagesApi()
  return <DetailSession key={api.scopeId + ":" + messageId} api={api} messageId={messageId} />
}

function DetailSession({ api, messageId }) {
  const { hasPermission } = useAuth()
  const [message, setMessage] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const requestId = useRef(0)

  const loadMessage = useCallback(async () => {
    const id = ++requestId.current
    setIsLoading(true)
    setError('')

    try {
      const result = await api.openMessage(messageId)
      if (id !== requestId.current) return
      if (Number(result?.message?.id_mensaje) !== Number(messageId)) throw new Error('Respuesta de mensaje no valida')
      const response = result.message
      if (result.markedAsRead) notifyMessagesChanged()

      if (id === requestId.current) setMessage(response)
    } catch (requestError) {
      if (id !== requestId.current) return
      setMessage(null)
      setError(requestError?.status === 404 ? 'El mensaje no existe o no te pertenece.' : 'No fue posible cargar el mensaje.')
    } finally {
      if (id === requestId.current) setIsLoading(false)
    }
  }, [api, messageId])

  useEffect(() => {
    const requests = requestId
    const requestTimer = window.setTimeout(() => loadMessage(), 0)
    return () => { window.clearTimeout(requestTimer); requests.current++ }
  }, [loadMessage])

  return (
    <PageShell maxWidth="56rem">
      <section className={styles.shell}>
        {!isLoading && message && <PageHeader title="Detalle del mensaje" />}
        <Link className={styles.backLink} to={APP_ROUTES.MESSAGES}>
          <span className={styles.backIcon}><i className="bi bi-chevron-left" aria-hidden="true" /></span> Volver a la bandeja
        </Link>

        {isLoading && <LoadingIndicator context="Detalle del mensaje" />}

        {!isLoading && error && (
          <div className={styles.state} role="alert">
            <i className="bi bi-exclamation-circle" aria-hidden="true" />
            <strong>{error}</strong>
            <button onClick={loadMessage} type="button">Reintentar</button>
          </div>
        )}

        {!isLoading && message && (
          <article className={styles.messageCard}>
            <header className={styles.header}>
              <div className={styles.bannerUpper}>
                <span className={styles.eyebrow}><span className={styles.mailIcon}><i className="bi bi-envelope-open" aria-hidden="true" /></span>Mensaje recibido</span>
                <span className={styles.readBadge}><i className={message.leido ? 'bi bi-check2-all' : 'bi bi-envelope'} aria-hidden="true" /> {message.leido ? 'Leído' : 'Sin leer'}</span>
              </div>
              <h2>{message.Asunto}</h2>
              <div className={styles.date}><i className="bi bi-clock" aria-hidden="true" /><time dateTime={message.fecha_publicacion}>{formatMessageDate(message.fecha_publicacion)}</time></div>
            </header>

            <section className={styles.contentSection} aria-label="Contenido del mensaje">
              <h3 className={styles.sectionHeading}>Contenido del mensaje</h3>
              <p className={styles.content}>{message.contenido}</p>
            </section>

            {message.id_pedido && (
              <aside className={styles.orderCard}>
                <span className={styles.orderIcon}><i className="bi bi-box-seam" aria-hidden="true" /></span>
                <div className={styles.orderMeta}>
                  <small>Pedido relacionado</small>
                  <strong>{message.pedido?.numero_nota_venta ? `Nota de Venta ${message.pedido.numero_nota_venta}` : 'Nota de Venta no disponible'}</strong>
                  {message.pedido?.fecha_estimada_termino && <span>Entrega estimada: {formatMessageDate(message.pedido.fecha_estimada_termino, { includeTime: false })}</span>}
                </div>
                {hasPermission(PERMISSIONS.VIEW_KANBAN_MODULE) && (
                  <Link className={styles.orderLink} to={`${APP_ROUTES.KANBAN}?pedido=${encodeURIComponent(message.id_pedido)}`}>
                    Ver pedido en Kanban <i className="bi bi-arrow-right" aria-hidden="true" />
                  </Link>
                )}
              </aside>
            )}
          </article>
        )}
      </section>
    </PageShell>
  )
}

import LoadingIndicator from '../../../shared/components/loading/LoadingIndicator'
import { formatMessageDate, messagePreview } from '../utils/messageFormatters'
import styles from './MessageList.module.css'

export default function MessageList({ isLoading, messages, onOpen, openingId }) {
  if (isLoading) {
    return (
      <LoadingIndicator context="Mensajes" />
    )
  }

  if (messages.length === 0) {
    return (
      <div className={styles.emptyState}>
        <span className={styles.emptyIcon}><i className="bi bi-inbox" aria-hidden="true" /></span>
        <h2>¡Vaya!</h2>
        <p>No tienes mensajes nuevos.</p>
      </div>
    )
  }

  return (
    <div className={styles.list}>
      {messages.map((message) => (
        <button className={`${styles.item} ${!message.leido ? styles.unread : ''}`} key={message.id_mensaje} onClick={() => onOpen(message)} type="button" disabled={openingId != null} aria-busy={openingId === message.id_mensaje}>
          {openingId === message.id_mensaje && <LoadingIndicator scope="action" context="Abrir mensaje" />}
          <span className={styles.statusIcon}>
            <i className={`bi ${message.leido ? 'bi-envelope-open' : 'bi-envelope-fill'}`} aria-hidden="true" />
          </span>
          <span className={styles.copy}>
            <span className={styles.titleLine}>
              <strong>{message.Asunto}</strong>
              {!message.leido && <span className={styles.unreadPill}>Nuevo</span>}
            </span>
            <span className={styles.preview}>{messagePreview(message.contenido, 150)}</span>
            <span className={styles.metadata}>
              {message.id_pedido && <span><i className="bi bi-box-seam" aria-hidden="true" /> Pedido #{message.id_pedido}</span>}
              <span><i className="bi bi-clock" aria-hidden="true" /> {formatMessageDate(message.fecha_publicacion)}</span>
            </span>
          </span>
          <i className={`bi bi-chevron-right ${styles.chevron}`} aria-hidden="true" />
        </button>
      ))}
    </div>
  )
}

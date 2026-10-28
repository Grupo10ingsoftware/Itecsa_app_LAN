import { memo } from 'react'
import { formatDateTime, formatDuration } from '../utils/orderHistoryFormatters'
import styles from '../pages/OrderHistoryDetailPage.module.css'

const HistoryEvent = memo(function HistoryEvent({ event }) {
  const duration = formatDuration(event.durationSeconds)
  return <li>
    <div className={styles.marker}><i className="bi bi-clock-history" aria-hidden="true" /></div>
    <article>
      <span className={styles.type}>{event.typeLabel}</span>
      <h3>{event.title}</h3>
      <time>{formatDateTime(event.occurredAt)}</time>
      <p>Responsable: {event.responsible ?? 'No disponible'}</p>
      {event.description && <p>{event.description}</p>}
      {event.productType && <p>Producto: {event.productType}</p>}
      {event.lanyardProgress && <p>Avance producido: {event.lanyardProgress.accumulatedQuantity ?? 0}{event.lanyardProgress.totalQuantity ? ` / ${event.lanyardProgress.totalQuantity}` : ''} lanyards ({event.lanyardProgress.percentage}%)</p>}
      {event.type === 'payment' && <p>{event.previousStatus ?? 'Estado anterior desconocido'} → {event.nextStatus ?? 'Sin estado'}</p>}
      {duration && <strong>Tiempo transcurrido{event.isOngoing ? ' (en curso)' : ''}: {duration}</strong>}
    </article>
  </li>
})

export default HistoryEvent

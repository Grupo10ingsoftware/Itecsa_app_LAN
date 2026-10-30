import { FilterSelect } from '../../../shared/components/filters/FilterControls'
import LoadingIndicator, { LoadingAction } from '../../../shared/components/loading/LoadingIndicator'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { APP_ROUTES } from '../../../config/routes'
import { useOrderHistoryApi } from '../hooks/useOrderHistoryApi'
import { formatDate } from '../utils/orderHistoryFormatters'
import HistoryEvent from '../components/HistoryEvent'
import { historyScope, subscribeHistoryRead, appendHistoryEvents } from '../utils/historyReads'
import styles from './OrderHistoryDetailPage.module.css'
import PageShell from '../../../shared/components/layout/PageShell'
import PageHeader from '../../../shared/components/layout/PageHeader'

const EVENT_TYPES = [
  ['all', 'Todos los registros'],
  ['stage', 'Etapas generales'],
  ['payment', 'Pagos'],
  ['subprocess', 'Subprocesos'],
  ['calendar', 'Calendarizacion'],
  ['general', 'Generales'],
]

export default function OrderHistoryDetailPage() {
  const { orderId } = useParams()
  const api = useOrderHistoryApi()
  return <OrderHistoryDetail key={`${historyScope(api)}|${orderId}`} api={api} orderId={orderId} />
}

function OrderHistoryDetail({ api, orderId }) {
  const [type, setType] = useState('all')
  const [order, setOrder] = useState(null)
  const [cursor, setCursor] = useState(null)
  const [pageInfo, setPageInfo] = useState({ nextCursor: null, hasMore: false })
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const summaryOrderId = useRef(null)
  const pendingMore = useRef(false)

  useEffect(() => {
    const hasSummary = summaryOrderId.current === orderId
    return subscribeHistoryRead({ api, orderId, method: hasSummary ? 'listOrderEvents' : 'getOrderHistory', params: { type, cursor, limit: 50 },
      onSuccess: (result) => {
        if (!hasSummary) summaryOrderId.current = orderId
        setOrder((current) => hasSummary && current
          ? {
              ...current,
              events: cursor
                ? appendHistoryEvents(current.events, result.events ?? [])
                : (result.events ?? []),
            }
          : result)
        setPageInfo(result.pageInfo ?? { nextCursor: null, hasMore: false })
        pendingMore.current = false
        setLoading(false)
        setLoadingMore(false)
      },
      onError: (requestError) => {
        setError(requestError?.payload?.message ?? 'No fue posible cargar el historial.')
        pendingMore.current = false
        setLoading(false)
        setLoadingMore(false)
      },
    })
  }, [api, cursor, orderId, type, attempt])

  function selectType(nextType) {
    if (nextType === type) return
    setLoading(true)
    pendingMore.current = false
    setLoadingMore(false)
    setError('')
    setCursor(null)
    setPageInfo({ nextCursor: null, hasMore: false })
    setOrder((current) => current ? { ...current, events: [] } : current)
    setType(nextType)
  }

  function loadMore() {
    if (!pageInfo.hasMore || !pageInfo.nextCursor || pendingMore.current || loading) return
    pendingMore.current = true
    setLoadingMore(true)
    setError('')
    // Retrying a failed continuation uses the same cursor, with a new attempt.
    if (cursor === pageInfo.nextCursor) setAttempt(current => current + 1)
    setCursor(pageInfo.nextCursor)
  }

  function retry() {
    setError('')
    if (cursor && order) { pendingMore.current = true; setLoadingMore(true) }
    else setLoading(true)
    setAttempt(current => current + 1)
  }

  if (loading && !order) return <LoadingIndicator context="historial" />
  if (error && !order) return <div className={styles.state} role="alert"><p>{error}</p><button onClick={retry} type="button">Reintentar</button><Link to={APP_ROUTES.ORDER_HISTORY}>Volver al historial</Link></div>

  return (
    <PageShell className={styles.page}>
      <PageHeader title={order?.salesNoteNumber ?? `Pedido #${orderId}`} actions={
        <Link className={styles.backLink} to={APP_ROUTES.ORDER_HISTORY}><i className="bi bi-arrow-left" aria-hidden="true" /> Volver</Link>
      }>
        <p>{order?.client.name ?? 'Cliente no disponible'}</p>
      </PageHeader>

      {error && <div className={styles.error} role="alert"><p>{error}</p><button onClick={retry} type="button">Reintentar</button></div>}
      {order && (
        <>
          <section className={styles.summary} aria-label="Información del pedido">
            <article><span>Estado actual</span><strong>{order.status ?? 'Sin estado'}</strong><small>Pago: {order.paymentStatus ?? 'Sin estado'}</small></article>
            <article><span>Cliente</span><strong>{order.client.name ?? 'No disponible'}</strong></article>
            <article><span>Vendedor asociado</span><strong>{order.seller.name ?? 'No disponible'}</strong></article>
            <article><span>Fecha de creación</span><strong>{formatDate(order.createdAt)}</strong><small>Entrega: {formatDate(order.estimatedCompletionAt)}</small></article>
          </section>

          <section className={styles.products}>
            <h2>Productos del pedido</h2>
            {order.items.length === 0 ? <p>Sin productos registrados.</p> : (
              <div className={styles.productGrid}>{order.items.map((item) => (
                <article key={item.id}><strong>{item.productType ?? 'Producto'}</strong><span>Cantidad: {item.quantity ?? 'No disponible'}</span>{item.subprocessStatus && <small>Subproceso: {item.subprocessStatus}</small>}</article>
              ))}</div>
            )}
          </section>

          <section className={styles.timelineSection}>
            <header><div><span>Actividad</span><h2>Eventos del pedido</h2></div>
              <FilterSelect label="Filtrar por tipo de registro" onChange={selectType} value={type}
                options={EVENT_TYPES.map(([value, label]) => ({ value, label }))} />
            </header>
            {loading ? <LoadingIndicator context="Actualizando eventos" /> : order.events.length === 0 ? <div className={styles.empty}>No existen registros para este filtro.</div> : (
              <ol className={styles.timeline}>{order.events.map(event => <HistoryEvent key={event.id} event={event} />)}</ol>
            )}
            {pageInfo.hasMore && (
              <button className={styles.loadMore} disabled={loadingMore} onClick={loadMore} type="button" aria-busy={loadingMore}>
                <LoadingAction busy={loadingMore} context="Cargar más registros">Cargar más registros</LoadingAction>
              </button>
            )}
          </section>
        </>
      )}
    </PageShell>
  )
}

import FilterContent from '../../../shared/components/filters/FilterContent'
import OrderHistoryFilters from '../components/OrderHistoryFilters'
import LoadingIndicator from '../../../shared/components/loading/LoadingIndicator'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { APP_ROUTES } from '../../../config/routes'
import { useOrderHistoryApi } from '../hooks/useOrderHistoryApi'
import { formatDate } from '../utils/orderHistoryFormatters'
import styles from './OrderHistoryPage.module.css'
import PageShell, { PageSurface } from '../../../shared/components/layout/PageShell'
import PageHeader from '../../../shared/components/layout/PageHeader'
import { historyScope, historyDateError, subscribeHistoryRead } from '../utils/historyReads'

const EMPTY_FILTERS = Object.freeze({ status: '', search: '', from: '', to: '' })

function errorMessage(error) {
  return error?.payload?.message ?? 'No fue posible cargar el historial de pedidos.'
}

export default function OrderHistoryPage() {
  const api = useOrderHistoryApi()
  return <OrderHistoryList key={historyScope(api)} api={api} />
}

function OrderHistoryList({ api }) {
  const [orders, setOrders] = useState([])
  const [status, setStatus] = useState('')
  const [draftFilters, setDraftFilters] = useState(EMPTY_FILTERS)
  const [search, setSearch] = useState('')
  const [dateRange, setDateRange] = useState({ from: '', to: '' })
  const [cursorStack, setCursorStack] = useState([null])
  const [pageInfo, setPageInfo] = useState({ nextCursor: null, hasMore: false })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const validationError = historyDateError(dateRange)
  const draftError = historyDateError(draftFilters)

  useEffect(() => {
    if (validationError) return undefined
    const cursor = cursorStack.at(-1)
    return subscribeHistoryRead({ api, method: 'listOrders', params: { status, search, from: dateRange.from, to: dateRange.to, cursor, limit: 50 },
      onSuccess: (result) => {
        setOrders(result.items ?? [])
        setPageInfo(result.pageInfo ?? { nextCursor: null, hasMore: false })
        setLoading(false)
      },
      onError: (requestError) => { setError(errorMessage(requestError)); setLoading(false) },
    })
  }, [api, cursorStack, dateRange.from, dateRange.to, search, status, attempt, validationError])

  function beginRead() {
    setLoading(true)
    setError('')
    setOrders([])
    setPageInfo({ nextCursor: null, hasMore: false })
  }

  function applyFilters(next = draftFilters) {
    if (historyDateError(next)) return
    const nextSearch = next.search.trim()
    if (next.status === status && nextSearch === search && next.from === dateRange.from && next.to === dateRange.to) return
    beginRead()
    setCursorStack([null])
    setStatus(next.status)
    setSearch(nextSearch)
    setDateRange({ from: next.from, to: next.to })
  }

  function clearFilters() {
    setDraftFilters(EMPTY_FILTERS)
    applyFilters(EMPTY_FILTERS)
  }

  function nextPage() {
    if (loading || !pageInfo.nextCursor) return
    beginRead()
    setCursorStack((current) => [...current, pageInfo.nextCursor])
  }

  function previousPage() {
    if (loading || cursorStack.length === 1) return
    beginRead()
    setCursorStack((current) => current.slice(0, -1))
  }

  const noRegisteredOrders = !loading && !error && orders.length === 0 && cursorStack.length === 1 && !status && !search && !dateRange.from && !dateRange.to

  return (
    <PageShell className={styles.page}>
      <PageSurface>
        <PageHeader title="Historial de pedidos" actions={
          <strong className={styles.resultCount}>{orders.length} resultados en esta página</strong>
        } />

        <FilterContent>
          <OrderHistoryFilters value={draftFilters}
            onChange={change => setDraftFilters(current => ({ ...current, ...change }))}
            onApply={() => applyFilters()} onClear={clearFilters} error={draftError} loading={loading} />
          <section className={styles.panel}>
            {(validationError || error) && <div className={styles.error} role="alert"><p>{validationError || error}</p>{!validationError && <button onClick={() => { beginRead(); setAttempt(current => current + 1) }} type="button">Reintentar</button>}</div>}
            {loading && !validationError ? (
              <LoadingIndicator context="pedidos" />
            ) : validationError || error ? null : orders.length === 0 ? (
              <div className={styles.state}>{noRegisteredOrders ? 'No existen pedidos hasta el momento' : 'No se encontraron pedidos'}</div>
            ) : (
              <div className={styles.tableWrap}>
                <table>
                  <thead><tr><th>Nota de Venta</th><th>Cliente</th><th>Estado actual</th><th>Fecha creación</th><th>Acción</th></tr></thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr key={order.id}>
                        <td><strong>{order.salesNoteNumber ?? `Pedido #${order.id}`}</strong></td>
                        <td>{order.clientName ?? 'No disponible'}</td>
                        <td><span className={styles.status}>{order.status ?? 'Sin estado'}</span></td>
                        <td>{formatDate(order.createdAt)}</td>
                        <td>
                          <Link className={styles.detailButton} to={APP_ROUTES.ORDER_HISTORY_DETAIL.replace(':orderId', order.id)}>
                            Ver detalle <i className="bi bi-arrow-right" aria-hidden="true" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {(cursorStack.length > 1 || pageInfo.hasMore) && (
              <nav className={styles.pagination} aria-label="Paginación">
                <button disabled={loading || cursorStack.length === 1} onClick={previousPage} type="button">Anterior</button>
                <span>Página {cursorStack.length}</span>
                <button disabled={loading || !pageInfo.hasMore} onClick={nextPage} type="button">Siguiente</button>
              </nav>
            )}
          </section>
        </FilterContent>
      </PageSurface>
    </PageShell>
  )
}

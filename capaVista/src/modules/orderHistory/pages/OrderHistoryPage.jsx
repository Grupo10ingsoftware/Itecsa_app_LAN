import FilterContent from '../../../shared/components/filters/FilterContent'
import OrderHistoryFilters from '../components/OrderHistoryFilters'
import LoadingIndicator from '../../../shared/components/loading/LoadingIndicator'
import TablePagination from '../../../shared/components/pagination/TablePagination'
import OrderHistoryStatusBadge from '../components/OrderHistoryStatusBadge'
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
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const validationError = historyDateError(dateRange)
  const draftError = historyDateError(draftFilters)

  useEffect(() => {
    if (validationError) return undefined
    return subscribeHistoryRead({ api, method: 'listOrders', params: { status, search, from: dateRange.from, to: dateRange.to, page, limit: pageSize },
      onSuccess: (result) => {
        const count = result.total ?? 0
        setTotal(count)
        const lastPage = Math.max(1, Math.ceil(count / pageSize))
        if (page > lastPage) { setPage(lastPage); return }
        setOrders(result.items ?? [])
        setLoading(false)
      },
      onError: (requestError) => { setError(errorMessage(requestError)); setLoading(false) },
    })
  }, [api, page, pageSize, dateRange.from, dateRange.to, search, status, attempt, validationError])

  function beginRead() {
    setLoading(true)
    setError('')
    setOrders([])
  }

  function applyFilters(next = draftFilters) {
    if (historyDateError(next)) return
    const nextSearch = next.search.trim()
    if (next.status === status && nextSearch === search && next.from === dateRange.from && next.to === dateRange.to) return
    beginRead()
    setPage(1)
    setStatus(next.status)
    setSearch(nextSearch)
    setDateRange({ from: next.from, to: next.to })
  }

  function clearFilters() {
    setDraftFilters(EMPTY_FILTERS)
    applyFilters(EMPTY_FILTERS)
  }

  function changePage(nextPage) {
    if (loading || nextPage === page || nextPage < 1 || nextPage > Math.ceil(total / pageSize)) return
    beginRead()
    setPage(nextPage)
  }

  function changePageSize(nextSize) {
    if (loading || nextSize === pageSize) return
    beginRead()
    setPage(1)
    setPageSize(nextSize)
  }

  const noRegisteredOrders = !loading && !error && orders.length === 0 && page === 1 && !status && !search && !dateRange.from && !dateRange.to

  return (
    <PageShell className={styles.page}>
      <PageSurface>
        <PageHeader title="Historial de pedidos" />

        <FilterContent>
          <OrderHistoryFilters value={draftFilters}
            onChange={change => setDraftFilters(current => ({ ...current, ...change }))}
            onApply={() => applyFilters()} onClear={clearFilters} error={draftError} loading={loading} />
          {(validationError || error) && <div className={styles.error} role="alert"><p>{validationError || error}</p>{!validationError && <button onClick={() => { beginRead(); setAttempt(current => current + 1) }} type="button">Reintentar</button>}</div>}
          <section className={styles.panel} aria-label="Resultados del historial">
              <div className={styles.tableWrap} role="region" aria-label="Tabla del historial de pedidos" tabIndex={0}>
                <table className={styles.table} aria-busy={loading}>
                  <colgroup><col className={styles.colNote} /><col className={styles.colClient} /><col className={styles.colStatus} /><col className={styles.colDate} /><col className={styles.colAction} /></colgroup>
                  <thead><tr><th scope="col">Nota de venta</th><th scope="col">Cliente</th><th scope="col">Estado actual</th><th scope="col">Fecha creación</th><th scope="col">Acción</th></tr></thead>
                  <tbody>
                    {loading && !validationError ? (
                      <tr><td className={styles.state} colSpan={5}><LoadingIndicator context="pedidos" /></td></tr>
                    ) : validationError || error ? (
                      <tr><td className={styles.state} colSpan={5}>No fue posible mostrar los pedidos.</td></tr>
                    ) : orders.length === 0 ? (
                      <tr><td className={styles.state} colSpan={5}>{noRegisteredOrders ? 'No existen pedidos hasta el momento' : 'No se encontraron pedidos'}</td></tr>
                    ) : orders.map((order) => (
                      <tr key={order.id}>
                        <td><strong>{order.salesNoteNumber ?? `Pedido #${order.id}`}</strong></td>
                        <td>{order.clientName ?? 'No disponible'}</td>
                        <td><OrderHistoryStatusBadge status={order.status} /></td>
                        <td>{formatDate(order.createdAt)}</td>
                        <td>
                          <Link className={styles.detailButton} to={APP_ROUTES.ORDER_HISTORY_DETAIL.replace(':orderId', order.id)}>
                            Ver detalle
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            <TablePagination integrated page={page} pageSize={pageSize} total={total} visibleCount={orders.length}
              disabled={loading || Boolean(validationError || error)} label="Paginación del historial"
              onPageChange={changePage} onPageSizeChange={changePageSize} />
          </section>
        </FilterContent>
      </PageSurface>
    </PageShell>
  )
}

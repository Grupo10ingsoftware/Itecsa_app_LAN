import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { APP_ROUTES } from '../../../config/routes'
import { API_ERROR_CODES } from '../../../services/api/apiClient'
import MessageFilters from '../components/MessageFilters'
import MessageList from '../components/MessageList'
import { useMessagesApi } from '../hooks/useMessagesApi'
import styles from './MessageInboxPage.module.css'
import PageShell from '../../../shared/components/layout/PageShell'
import PageHeader from '../../../shared/components/layout/PageHeader'

const DEFAULT_FILTERS = Object.freeze({ status: 'all', sort: 'latest', from: '', to: '' })
const PAGE_SIZE = 12

function errorText(error) {
  if (error?.code === API_ERROR_CODES.NETWORK_ERROR) return 'No fue posible conectar con el servidor.'
  if (error?.status === 401) return 'Tu sesión expiró. Inicia sesión nuevamente.'
  return error?.payload?.message ?? 'No fue posible cargar la bandeja de entrada.'
}

export default function MessageInboxPage() {
  const api = useMessagesApi()
  return <InboxSession key={api.scopeId} api={api} />
}

function InboxSession({ api }) {
  const navigate = useNavigate()
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [page, setPage] = useState(1)
  const [result, setResult] = useState({ messages: [], total: 0, totalPages: 0 })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const requestId = useRef(0)
  const controller = useRef(null)
  const openingRef = useRef(false)
  const [openingId, setOpeningId] = useState(null)

  const loadInbox = useCallback(async () => {
    controller.current?.abort()
    const read = new AbortController()
    controller.current = read
    const id = ++requestId.current
    setIsLoading(true)
    setError('')

    try {
      const response = await api.getInbox({ ...filters, page, perPage: PAGE_SIZE }, { signal: read.signal })
      if (read.signal.aborted || id !== requestId.current) return
      setResult({
        messages: response.messages ?? [],
        total: response.total ?? 0,
        totalPages: response.totalPages ?? 0,
      })
    } catch (requestError) {
      if (read.signal.aborted || id !== requestId.current) return
      setResult({ messages: [], total: 0, totalPages: 0 })
      setError(errorText(requestError))
    } finally {
      if (id === requestId.current) setIsLoading(false)
    }
  }, [api, filters, page])

  useEffect(() => {
    const requests = requestId
    const requestTimer = window.setTimeout(() => loadInbox(), 0)
    return () => { window.clearTimeout(requestTimer); requests.current++; controller.current?.abort() }
  }, [loadInbox])

  function handleFiltersChange(nextFilters) {
    setFilters(nextFilters)
    setPage(1)
  }

  function handleOpen(message) {
    if (openingRef.current) return
    openingRef.current = true
    setOpeningId(message.id_mensaje)
    navigate(APP_ROUTES.MESSAGE_DETAIL.replace(':messageId', message.id_mensaje))
  }

  return (
    <PageShell maxWidth="78rem" aria-labelledby="message-inbox-title">
      <section className={styles.shell}>
        <PageHeader title="Bandeja de entrada" titleId="message-inbox-title" actions={
          <div className={styles.totalCard} aria-label={`${result.total} mensajes encontrados`}>
            <i className="bi bi-envelope-paper" aria-hidden="true" />
            <span><strong>{result.total}</strong> mensajes</span>
          </div>
        } />

        <MessageFilters
          filters={filters}
          onChange={handleFiltersChange}
          onClear={() => handleFiltersChange({ ...DEFAULT_FILTERS })}
        />

        {error && (
          <div className={styles.error} role="alert">
            <i className="bi bi-exclamation-triangle" aria-hidden="true" />
            <span>{error}</span>
            <button onClick={loadInbox} type="button">Reintentar</button>
          </div>
        )}

        {!error && <MessageList isLoading={isLoading} messages={result.messages} onOpen={handleOpen} openingId={openingId} />}

        {!isLoading && !error && result.totalPages > 1 && (
          <nav aria-label="Paginación de mensajes" className={styles.pagination}>
            <button disabled={page === 1} onClick={() => setPage((current) => current - 1)} type="button">
              <i className="bi bi-chevron-left" aria-hidden="true" /> Anterior
            </button>
            <span>Página <strong>{page}</strong> de {result.totalPages}</span>
            <button disabled={page >= result.totalPages} onClick={() => setPage((current) => current + 1)} type="button">
              Siguiente <i className="bi bi-chevron-right" aria-hidden="true" />
            </button>
          </nav>
        )}
      </section>
    </PageShell>
  )
}

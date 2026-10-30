import { FilterSearch } from '../../../shared/components/filters/FilterControls'
import { useToast } from '../../../shared/notifications/useToast'
import { publicOperationMessage } from '../../../shared/notifications/operationFeedback'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useModalDialog } from '../hooks/useModalDialog'
import pinStyles from '../../../shared/components/pin/PinModal.module.css'
import UserMovementsTable from './UserMovementsTable'
import paginationStyles from '../../../shared/components/pagination/TablePagination.module.css'
import styles from './UserMovementsModal.module.css'

export default function UserMovementsModal({ user, api, onClose, title = 'Movimientos de usuario', description }) {
  const notify = useToast()
  const dialogRef = useRef(null)
  const closeRef = useRef(null)
  useModalDialog({ containerRef: dialogRef, initialFocusRef: closeRef, isOpen: true, onClose })
  const [query, setQuery] = useState({ page: 1, perPage: 10, search: '' })
  const [search, setSearch] = useState('')
  const [outcome, setOutcome] = useState(null)
  const subject = user.idUsuarioAutenticacionExterna
  const current = outcome?.query === query && outcome?.subject === subject && outcome?.api === api
  const result = current ? outcome.data : null
  const error = current ? outcome.error : ''
  const loading = !current
  const total = result?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / query.perPage))
  const pageNumbers = [...new Set([1, query.page - 1, query.page, query.page + 1, totalPages])]
    .filter(page => page >= 1 && page <= totalPages).sort((a, b) => a - b)

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    api.getMovements(subject, query, { signal: controller.signal })
      .then(data => { if (active) setOutcome({ query, subject, api, data }) })
      .catch(failure => {
        if (active) {
          setOutcome({ query, subject, api, error: true })
          notify.error(publicOperationMessage(failure, 'No fue posible consultar los movimientos. Intenta nuevamente.'))
        }
      })
    return () => { active = false; controller.abort() }
  }, [api, subject, query, notify])

  return createPortal(<div className={pinStyles.layer} data-modal-layer="true">
    <section ref={dialogRef} className={styles.modal} role="dialog" aria-modal="true" tabIndex={-1}
      aria-labelledby="user-movements-title" aria-describedby="user-movements-description">
    <header className={styles.header}>
      <span className={styles.headerIcon}><i className="bi bi-clock-history" aria-hidden="true" /></span>
      <div><h2 id="user-movements-title">{title}</h2>
        <p id="user-movements-description">{description ?? `Consulta los movimientos de ${user.nombreCompleto}.`}</p></div>
      <button type="button" className={styles.close} aria-label="Cerrar historial" onClick={onClose} ref={closeRef}>
        <i className="bi bi-x-lg" aria-hidden="true" />
      </button>
    </header>
    <div className={styles.body}>
      <form className={styles.filters} onSubmit={event => { event.preventDefault(); setQuery({ ...query, page: 1, search: search.trim() }) }}>
        <FilterSearch label="Buscar por identificador o detalle" searchLabel="Buscar" value={search}
          maxLength={120} placeholder="Buscar por identificador o detalle…" onChange={setSearch} />
        <button className={styles.button} type="button" onClick={() => { setSearch(''); setQuery({ ...query, page: 1, search: '' }) }}>
          Limpiar filtros
        </button>
      </form>
      <UserMovementsTable records={result?.records} includeTime isLoading={loading} error={Boolean(error)}
        onRetry={() => setQuery({ ...query })} scrollable>
        <footer className={`${paginationStyles.footer} ${paginationStyles.integrated} ${styles.footer}`}>
          <span>{loading ? 'Cargando resultados...' : error ? 'Consulta pendiente' : total
            ? `Mostrando ${(query.page - 1) * query.perPage + 1}–${Math.min(query.page * query.perPage, total)} de ${total} registros`
            : '0 registros'}</span>
          <nav className={paginationStyles.pages} aria-label="Paginación de movimientos">
            <button type="button" disabled={loading || Boolean(error) || query.page <= 1}
              onClick={() => setQuery({ ...query, page: query.page - 1 })}>Anterior</button>
            {pageNumbers.map((page, index) => <span className={styles.pageNumber} key={page}>
              {index > 0 && page - pageNumbers[index - 1] > 1 && <span aria-hidden="true">…</span>}
              <button type="button"
                aria-label={`Página ${page}`} aria-current={page === query.page ? 'page' : undefined}
                disabled={loading || Boolean(error)} onClick={() => setQuery({ ...query, page })}>{page}</button>
            </span>)}
            <button type="button" disabled={loading || Boolean(error) || query.page >= totalPages}
              onClick={() => setQuery({ ...query, page: query.page + 1 })}>Siguiente</button>
          </nav>
        </footer>
      </UserMovementsTable>
    </div>
    </section>
  </div>, document.body)
}

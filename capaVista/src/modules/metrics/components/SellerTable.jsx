import { useMemo, useState } from 'react'
import styles from '../pages/MetricsPage.module.css'

const PAGE_SIZE = 10
const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-CL')

export default function SellerTable({ rows, exportActions }) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const filtered = useMemo(() => rows.filter(row => normalize(row.seller).includes(normalize(search.trim()))), [rows, search])
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pages)
  const start = (currentPage - 1) * PAGE_SIZE
  const visible = filtered.slice(start, start + PAGE_SIZE)

  return <>
    <div className={styles.sellerActions}>
      <label className={styles.sellerSearch}>
        <i className="bi bi-search" aria-hidden="true" />
        <span className={styles.visuallyHidden}>Buscar vendedor</span>
        <input type="search" placeholder="Buscar vendedor…" value={search} onChange={event => { setSearch(event.target.value); setPage(1) }} />
      </label>
      {exportActions}
    </div>
    <div className={styles.sellerTableWrapper} role="region" aria-label="Cumplimiento por vendedor" tabIndex={0}>
      <table className={styles.sellerTable}>
        <caption className={styles.visuallyHidden}>Cumplimiento de vendedores del período seleccionado</caption>
        <thead><tr>{['Vendedor', 'Notas de venta', 'Entregados a tiempo', 'Fuera de plazo', 'Con carga alta'].map(title => <th scope="col" key={title}>{title}</th>)}</tr></thead>
        <tbody>{visible.map(row => <tr key={row.seller}><th scope="row">{row.seller}</th><td>{row.salesNotes}</td><td>{row.deliveredOnTime}</td><td>{row.deliveredLate}</td><td>{row.enteredDuringHighLoad}</td></tr>)}</tbody>
      </table>
    </div>
    {filtered.length === 0 && <p className={styles.emptyState} role="status">{rows.length ? 'No hay vendedores que coincidan con la búsqueda.' : 'No hay vendedores o pedidos en el periodo seleccionado.'}</p>}
    <div className={styles.tableFooter}>
     
      <span role="status">{filtered.length ? `${start + 1}–${Math.min(start + PAGE_SIZE, filtered.length)} de ${filtered.length}` : '0 resultados'}</span>
      {pages > 1 && <nav className={styles.pagination} aria-label="Paginación de vendedores">
        <button type="button" aria-label="Página anterior" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><i className="bi bi-chevron-left" aria-hidden="true" /></button>
        <span>Página {currentPage} de {pages}</span>
        <button type="button" aria-label="Página siguiente" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}><i className="bi bi-chevron-right" aria-hidden="true" /></button>
      </nav>}
    </div>
  </>
}

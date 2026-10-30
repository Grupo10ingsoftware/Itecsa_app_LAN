import { useId } from 'react'
import styles from './TablePagination.module.css'

const PAGE_SIZES = [10, 20, 30, 40, 50]

export default function TablePagination({ page, pageSize, total, visibleCount, disabled, onPageChange, onPageSizeChange,
  label = 'Paginación de resultados', integrated = false, statusLabel }) {
  const selectId = useId()
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const firstPage = Math.max(1, Math.min(page - 2, pageCount - 4))
  const pages = Array.from({ length: Math.min(5, pageCount) }, (_, index) => firstPage + index)
  const from = visibleCount ? (page - 1) * pageSize + 1 : 0
  const to = visibleCount ? from + visibleCount - 1 : 0

  return <footer className={`${styles.footer} ${integrated ? styles.integrated : ''}`}>
    <span className={styles.range} role="status" aria-live="polite">{statusLabel ?? `Mostrando ${from} a ${to} de ${total} resultados`}</span>
    <nav className={styles.pages} aria-label={label}>
      <button type="button" aria-label="Página anterior" disabled={disabled || page <= 1} onClick={() => onPageChange(page - 1)}>
        <span aria-hidden="true">‹</span>
      </button>
      {pages.map(number => <button key={number} type="button" aria-label={`Página ${number}`}
        aria-current={number === page ? 'page' : undefined} disabled={disabled}
        onClick={() => { if (number !== page) onPageChange(number) }}>{number}</button>)}
      <button type="button" aria-label="Página siguiente" disabled={disabled || page >= pageCount} onClick={() => onPageChange(page + 1)}>
        <span aria-hidden="true">›</span>
      </button>
    </nav>
    {onPageSizeChange && <div className={styles.size}>
      <label htmlFor={selectId}>Filas por página</label>
      <select id={selectId} value={pageSize} disabled={disabled} onChange={event => {
        const nextSize = Number(event.target.value)
        if (PAGE_SIZES.includes(nextSize)) onPageSizeChange(nextSize)
      }}>{PAGE_SIZES.map(size => <option key={size} value={size}>{size}</option>)}</select>
    </div>}
  </footer>
}

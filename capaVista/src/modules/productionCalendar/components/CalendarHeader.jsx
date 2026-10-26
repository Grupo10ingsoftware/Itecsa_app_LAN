import styles from './CalendarHeader.module.css'

export default function CalendarHeader({ isFiltersOpen, onToggleFilters }) {
  return (
    <header className={styles.hero}>
      <div>
        <span className={styles.sectionLabel}>Produccion</span>
        <h1 className={styles.pageTitle}>Calendario</h1>
      </div>
      <button className={styles.filterToggleButton} onClick={onToggleFilters} type="button">
        <i className="bi bi-funnel" aria-hidden="true" />
        {isFiltersOpen ? 'Ocultar filtros' : 'Mostrar filtros'}
      </button>
    </header>
  )
}

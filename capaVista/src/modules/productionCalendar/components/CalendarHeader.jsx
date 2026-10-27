import styles from './CalendarHeader.module.css'
import PageHeader from '../../../shared/components/layout/PageHeader'

export default function CalendarHeader({ isFiltersOpen, onToggleFilters }) {
  return (
    <PageHeader title="Calendario" actions={
      <button className={styles.filterToggleButton} onClick={onToggleFilters} type="button">
        <i className="bi bi-funnel" aria-hidden="true" />
        {isFiltersOpen ? 'Ocultar filtros' : 'Mostrar filtros'}
      </button>
    } />
  )
}

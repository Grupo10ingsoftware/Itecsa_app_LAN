import { Children, useId, useState } from 'react'
import FilterIcon from './FilterIcon'
import styles from './Filters.module.css'

export default function FilterPanel({ children, onApply, onClear, label = 'Filtros',
  expanded, onExpandedChange, defaultExpanded = false, disabled = false, loading = false, error }) {
  const contentId = useId()
  const [isOpen, setIsOpen] = useState(defaultExpanded)
  const open = expanded ?? isOpen

  function toggle() {
    setIsOpen(!open)
    onExpandedChange?.(!open)
  }

  function submit(event) {
    event.preventDefault()
    if (disabled) return
    if (!event.currentTarget.checkValidity()) {
      event.currentTarget.reportValidity()
      return
    }
    onApply?.()
  }

  return <section className={styles.panel} aria-label={label}>
    <button className={styles.header} type="button" aria-expanded={open} aria-controls={contentId}
      aria-label={`${open ? 'Contraer' : 'Expandir'} ${label.toLowerCase()}`} onClick={toggle}>
      <FilterIcon name="sliders" className={styles.filterIcon} />
      <span>Filtros</span>
      <FilterIcon name="chevron" className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`} />
    </button>
    <form id={contentId} hidden={!open} onSubmit={submit} aria-label={`Aplicar ${label.toLowerCase()}`}>
      <fieldset className={styles.fields} disabled={disabled}>
        <div className={styles.body}>{Children.map(children, child => <div>{child}</div>)}</div>
        {error && <p className={styles.panelError} role="alert">{error}</p>}
        <footer className={styles.actions}>
          <button className={styles.secondary} type="button" onClick={onClear}>Limpiar filtros</button>
          <button className={styles.primary} type="submit" aria-busy={loading || undefined}>Aplicar filtros</button>
        </footer>
      </fieldset>
    </form>
  </section>
}

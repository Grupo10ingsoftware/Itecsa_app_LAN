import { Children, useId, useRef } from 'react'
import FilterIcon from './FilterIcon'
import styles from './Filters.module.css'

function Feedback({ id, error }) {
  return typeof error === 'string' && error ? <span id={`${id}-error`} className={styles.fieldError} role="alert">{error}</span> : null
}

export function FilterRow({ children, columns = 3, divided = false }) {
  // Dividers belong to layout wrappers, outside native fieldset legends.
  return <div className={styles.row} data-columns={columns} data-divided={divided}>
    {Children.map(children, child => <div className={styles.column}>{child}</div>)}
  </div>
}

export function FilterGroup({ children, label }) {
  return <fieldset className={styles.group}><legend>{label}</legend>{children}</fieldset>
}

export function FilterSearch({ label, value, onChange, placeholder, searchLabel = label,
  id, disabled = false, error, maxLength, onSearch }) {
  const generatedId = useId()
  const controlId = id ?? generatedId
  return <div className={styles.field}>
    <label htmlFor={controlId}>{label}</label>
    <div className={styles.search} data-disabled={disabled} data-error={Boolean(error)}>
      <input id={controlId} type="search" value={value} onChange={event => onChange(event.target.value)}
        placeholder={placeholder} disabled={disabled} maxLength={maxLength} aria-invalid={error ? true : undefined}
        aria-describedby={typeof error === 'string' && error ? `${controlId}-error` : undefined}
        onKeyDown={event => { if (event.key === 'Enter' && onSearch) { event.preventDefault(); onSearch() } }} />
      <button type={onSearch ? 'button' : 'submit'} disabled={disabled} onClick={onSearch} aria-label={searchLabel}>
        <FilterIcon name="search" />
      </button>
    </div>
    <Feedback id={controlId} error={error} />
  </div>
}

export function FilterSelect({ label, value, onChange, options, id, disabled = false, error }) {
  const generatedId = useId()
  const controlId = id ?? generatedId
  return <div className={styles.field}>
    <label htmlFor={controlId}>{label}</label>
    <div className={styles.select}>
      <select className={styles.control} id={controlId} value={value} onChange={event => onChange(event.target.value)}
        disabled={disabled} aria-invalid={error ? true : undefined}
        aria-describedby={typeof error === 'string' && error ? `${controlId}-error` : undefined}>
        {options.map(option => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
      </select>
      <FilterIcon name="chevron" />
    </div>
    <Feedback id={controlId} error={error} />
  </div>
}

export function FilterDateField({ label, value, onChange, min, max, id, disabled = false, error,
  hideLabel = false, placeholder = 'Seleccionar fecha' }) {
  const generatedId = useId()
  const controlId = id ?? generatedId
  const input = useRef(null)
  function openPicker() {
    if (disabled) return
    input.current?.focus({ preventScroll: true })
    try { input.current?.showPicker?.() } catch { /* Native keyboard entry remains available. */ }
  }
  return <div className={styles.field}>
    <label htmlFor={controlId} className={hideLabel ? 'visually-hidden' : undefined}>{label}</label>
    <div className={styles.date} data-disabled={disabled} data-error={Boolean(error)}>
      <button type="button" aria-label={`Abrir calendario: ${label}`} onClick={openPicker} disabled={disabled}><FilterIcon name="calendar" /></button>
      <input ref={input} id={controlId} type="date" value={value} min={min} max={max} disabled={disabled}
        data-empty={!value}
        onChange={event => onChange(event.target.value)} onClick={openPicker} aria-invalid={error ? true : undefined}
        aria-describedby={typeof error === 'string' && error ? `${controlId}-error` : undefined} />
      {!value && <span className={styles.datePlaceholder} aria-hidden="true">{placeholder}</span>}
    </div>
    <Feedback id={controlId} error={error} />
  </div>
}

export function FilterDateRange({ from, to, onFromChange, onToChange, label = 'Rango de fechas', disabled = false, compact = false }) {
  return <FilterGroup label={label}><div className={styles.dateRange}>
    <FilterDateField label="Desde" value={from} max={to || undefined} onChange={onFromChange} disabled={disabled}
      hideLabel={compact} placeholder={compact ? 'Desde' : undefined} />
    <FilterDateField label="Hasta" value={to} min={from || undefined} onChange={onToChange} disabled={disabled}
      hideLabel={compact} placeholder={compact ? 'Hasta' : undefined} />
  </div></FilterGroup>
}

export function FilterChipGroup({ label, value, onChange, options, disabled = false }) {
  return <FilterGroup label={label}><div className={styles.chips}>
    {options.map(option => <button key={option.value} type="button" className={styles.chip}
      aria-pressed={value === option.value} aria-label={option.count !== undefined ? `${option.label} ${option.count}` : undefined}
      disabled={disabled || option.disabled} onClick={() => onChange(option.value)}>
      <span>{option.label}</span>
      {option.count !== undefined && <span className={styles.count}> {option.count}</span>}
    </button>)}
  </div></FilterGroup>
}

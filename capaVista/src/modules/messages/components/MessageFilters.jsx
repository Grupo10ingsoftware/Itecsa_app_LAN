import FilterPanel from '../../../shared/components/filters/FilterPanel'
import { FilterChipGroup, FilterDateRange, FilterRow } from '../../../shared/components/filters/FilterControls'

const STATUSES = [
  { value: 'all', label: 'Todos' },
  { value: 'unread', label: 'No leídos' },
  { value: 'read', label: 'Leídos' },
]
const SORTS = [{ value: 'latest', label: 'Últimos' }, { value: 'oldest', label: 'Más antiguos' }]

export default function MessageFilters({ filters, onChange, onApply, onClear, loading }) {
  const update = (name, value) => onChange({ ...filters, [name]: value })
  return (
    <FilterPanel label="Filtros de mensajes" onApply={onApply} onClear={onClear} loading={loading}>
      <FilterRow divided>
        <FilterChipGroup label="Estado de lectura" options={STATUSES} value={filters.status} onChange={value => update('status', value)} />
        <FilterChipGroup label="Orden de los mensajes" options={SORTS} value={filters.sort} onChange={value => update('sort', value)} />
        <FilterDateRange from={filters.from} to={filters.to} onFromChange={value => update('from', value)} onToChange={value => update('to', value)} />
      </FilterRow>
    </FilterPanel>
  )
}

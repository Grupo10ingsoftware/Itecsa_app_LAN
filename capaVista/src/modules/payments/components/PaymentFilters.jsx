import FilterPanel from '../../../shared/components/filters/FilterPanel'
import { FilterChipGroup, FilterDateRange, FilterRow, FilterSearch } from '../../../shared/components/filters/FilterControls'

export default function PaymentFilters({ value, onChange, onApply, onClear, filters, getFilterCount, disabled, loading }) {
  return <FilterPanel label="Filtros de pago" onApply={onApply} onClear={onClear} disabled={disabled} loading={loading}>
    <FilterRow divided>
      <FilterChipGroup label="Estado del pago" value={value.status} onChange={status => onChange({ status })}
        options={filters.map(filter => ({ value: filter.key, label: filter.label, count: getFilterCount(filter.key) }))} />
      <FilterDateRange compact from={value.from} to={value.to} onFromChange={from => onChange({ from })} onToChange={to => onChange({ to })} />
      <FilterSearch label="Búsqueda" searchLabel="Buscar pagos" placeholder="Buscar por RUT, NV o cliente"
        value={value.search} onChange={search => onChange({ search })} />
    </FilterRow>
  </FilterPanel>
}

import { PRODUCTION_STATUSES } from '../config/productionCalendar.config'
import FilterPanel from '../../../shared/components/filters/FilterPanel'
import { FilterRow, FilterSearch, FilterSelect } from '../../../shared/components/filters/FilterControls'

const STATUSES = [{ value: '', label: 'Todos' }, ...Object.values(PRODUCTION_STATUSES).map(value => ({ value, label: value }))]
const PRODUCTS = ['', 'Lanyard', 'Tarjeta', 'Yoyo'].map(value => ({ value, label: value || 'Todos' }))

export default function CalendarFilters({ filters, onChange, onApply, onClear }) {
  return (
    <FilterPanel label="Filtros de calendario" onApply={onApply} onClear={onClear}>
      <FilterRow divided>
        <FilterSelect label="Estado" value={filters.status} options={STATUSES} onChange={status => onChange({ status })} />
        <FilterSelect label="Producto" value={filters.productType} options={PRODUCTS} onChange={productType => onChange({ productType })} />
        <FilterSearch label="Buscar en el calendario" placeholder="NV, cliente o producto" value={filters.search} onChange={search => onChange({ search })} />
      </FilterRow>
    </FilterPanel>
  )
}

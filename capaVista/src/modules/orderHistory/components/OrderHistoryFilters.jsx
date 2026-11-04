import { ORDER_STATUS } from '../../../../../shared/businessCatalog.js'
import FilterPanel from '../../../shared/components/filters/FilterPanel'
import { FilterChipGroup, FilterDateRange, FilterRow, FilterSearch } from '../../../shared/components/filters/FilterControls'

const STATUS_FILTERS = [
  { label: 'Todos', value: '' },
  { label: 'Confirmación de Pago', value: ORDER_STATUS.CONFIRMACION_PAGO },
  { label: 'Listo para producción', value: ORDER_STATUS.LISTO_PRODUCCION },
  { label: 'En producción', value: ORDER_STATUS.EN_PRODUCCION },
  { label: 'Listo para entrega', value: ORDER_STATUS.LISTO_ENTREGA },
  { label: 'Terminado', value: ORDER_STATUS.TERMINADO },
  { label: 'Cancelado', value: ORDER_STATUS.CANCELADO },
]

export default function OrderHistoryFilters({ value, onChange, onApply, onClear, error, loading }) {
  return (
    <FilterPanel label="Filtros del historial" onApply={onApply} onClear={onClear} error={error} loading={loading}>
      <FilterRow columns={2} divided>
        <FilterDateRange compact from={value.from} to={value.to}
          onFromChange={from => onChange({ from })} onToChange={to => onChange({ to })} />
        <FilterSearch label="Buscar pedidos" placeholder="Nota de venta o nombre del cliente" value={value.search}
          onChange={search => onChange({ search })} />
      </FilterRow>
      <FilterChipGroup label="Estado actual del pedido" options={STATUS_FILTERS} value={value.status}
        onChange={status => onChange({ status: value.status === status ? '' : status })} />
    </FilterPanel>
  )
}

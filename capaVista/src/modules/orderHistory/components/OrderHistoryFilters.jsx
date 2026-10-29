import FilterPanel from '../../../shared/components/filters/FilterPanel'
import { FilterChipGroup, FilterDateRange, FilterRow, FilterSearch } from '../../../shared/components/filters/FilterControls'

const STATUS_FILTERS = [
  { label: 'Todos', value: '' },
  { label: 'Confirmación de Pago', value: 'Confirmación de Pago' },
  { label: 'Listo para producción', value: 'Listo para Producción' },
  { label: 'En producción', value: 'En producción' },
  { label: 'Listo para despacho', value: 'Listo para Entrega' },
  { label: 'Finalizado', value: 'Terminado' },
  { label: 'Cancelado', value: 'Cancelado' },
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

import { useState } from 'react'
import FilterPanel from '../../../shared/components/filters/FilterPanel'
import { FilterRow, FilterSearch, FilterSelect } from '../../../shared/components/filters/FilterControls'

const EMPTY_FILTERS = Object.freeze({ clientName: '', salesNoteNumber: '', productType: '' })
const PRODUCT_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'lanyard', label: 'Lanyard' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'yoyo', label: 'Yoyo' },
  { value: 'mixto', label: 'Mixto' },
]

export default function KanbanFilters({ onApplyFilters, onClearFilters }) {
  const [draftFilters, setDraftFilters] = useState(EMPTY_FILTERS)
  const change = (field, value) => setDraftFilters(current => ({ ...current, [field]: value }))
  return <FilterPanel label="Filtros del tablero" onApply={() => onApplyFilters?.(draftFilters)}
    onClear={() => { setDraftFilters(EMPTY_FILTERS); onClearFilters?.() }}>
    <FilterRow>
      <FilterSearch label="Número de pedido" searchLabel="Buscar por número de pedido" placeholder="Ej. 24038"
        value={draftFilters.salesNoteNumber} onChange={value => change('salesNoteNumber', value)} />
      <FilterSearch label="Nombre del cliente" searchLabel="Buscar por nombre del cliente" placeholder="Ej. Colegio Andes"
        value={draftFilters.clientName} onChange={value => change('clientName', value)} />
      <FilterSelect label="Tipo de producto" options={PRODUCT_OPTIONS}
        value={draftFilters.productType} onChange={value => change('productType', value)} />
    </FilterRow>
  </FilterPanel>
}

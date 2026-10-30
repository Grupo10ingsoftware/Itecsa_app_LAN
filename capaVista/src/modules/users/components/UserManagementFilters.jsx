import { useAuth } from '../../../hooks/useAuth'
import { manageableRoles } from '../../../config/roles'
import { USER_DEPARTMENTS } from '../../../../../shared/userDepartments'
import FilterPanel from '../../../shared/components/filters/FilterPanel'
import { FilterChipGroup, FilterRow, FilterSearch } from '../../../shared/components/filters/FilterControls'

const STATUS_FILTERS = [
  { value: '', label: 'Todos' },
  { value: 'Vinculado', label: 'Vinculados' },
  { value: 'Pendiente', label: 'Pendientes' },
  { value: 'Desvinculado', label: 'Desvinculados' },
]

export default function UserManagementFilters({ value, onChange, onApply, onClear, loading }) {
  const { user: actor } = useAuth()
  const roles = manageableRoles(actor?.rolUsuario)
  const departments = [
    { value: '', label: 'Todos' },
    ...USER_DEPARTMENTS.map(item => ({
      value: item.value, label: item.label, disabled: !item.roles.some(role => roles.includes(role)),
    })),
  ]
  return (
    <FilterPanel label="Filtros de usuarios" onApply={onApply} onClear={onClear} loading={loading}>
      <FilterRow divided>
        <FilterChipGroup label="Estado de vínculo" options={STATUS_FILTERS} value={value.status}
          onChange={status => onChange({ status })} />
        <FilterChipGroup label="Rol administrable" options={departments} value={value.department}
          onChange={department => onChange({ department })} />
        <FilterSearch label="Buscar usuario" value={value.search} onChange={search => onChange({ search })}
          placeholder="Nombre, apellido, correo o RUT" />
      </FilterRow>
    </FilterPanel>
  )
}

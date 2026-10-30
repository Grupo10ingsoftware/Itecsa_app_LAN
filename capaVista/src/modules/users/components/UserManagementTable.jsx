import { getRoleLabel } from '../../../config/roles'
import LoadingIndicator from '../../../shared/components/loading/LoadingIndicator'
import TablePagination from '../../../shared/components/pagination/TablePagination'
import UserButton from './UserButton'
import UserStatusBadge from './UserStatusBadge'
import styles from './UserManagementTable.module.css'

const TABLE_COLUMNS = Object.freeze(['Usuario', 'Nombre', 'RUT', 'Correo', 'Rol', 'Estado', 'Acciones'])

export default function UserManagementTable({
  currentPage = 1, pageSize = 10, totalUsers = 0, totalPages = Math.max(1, Math.ceil(totalUsers / pageSize)),
  isLoading = false, inspectingId, onEditUser, onViewMovements, onPageChange,
  onPageSizeChange = () => {}, users, readOnly = false,
}) {
  return (
    <div className={styles.tableCard}>
      <div className={styles.tableResponsive} role="region" aria-label="Tabla de usuarios" tabIndex={0}>
        <table className={styles.usersTable} aria-busy={isLoading}>
          <colgroup>
            <col className={styles.colUsername} />
            <col className={styles.colName} />
            <col className={styles.colRut} />
            <col className={styles.colEmail} />
            <col className={styles.colRole} />
            <col className={styles.colStatus} />
            <col className={styles.colActions} />
          </colgroup>
          <thead><tr>{TABLE_COLUMNS.map(column => <th key={column} scope="col">{column}</th>)}</tr></thead>
          <tbody>
            {isLoading ? (
              <tr><td className={styles.tableStateCell} colSpan={TABLE_COLUMNS.length}><LoadingIndicator context="Usuarios" /></td></tr>
            ) : users.length === 0 ? (
              <tr><td className={styles.tableStateCell} colSpan={TABLE_COLUMNS.length}>No se encontraron usuarios para los filtros seleccionados.</td></tr>
            ) : users.map(user => (
              <tr key={user.id}>
                <td>{user.username || 'No disponible'}
                  {user.identityBindingConflict && <small className="d-block">Vinculo pendiente de conciliacion</small>}
                </td>
                <td>{user.nombreCompleto || user.nombreListado || 'Usuario sin nombre'}</td>
                <td>{user.rutUsuario}</td>
                <td>{user.correoUsuario || 'Sin correo'}</td>
                <td>{getRoleLabel(user.rolUsuario)}</td>
                <td><UserStatusBadge status={user.estadoUsuario} /></td>
                <td>
                  <div className={styles.userActions}>
                    <UserButton className={styles.actionButton} disabled={!user.idUsuarioAutenticacionExterna}
                      onClick={() => onEditUser(user)} busy={inspectingId === user.id} variant="primary">
                      {readOnly ? 'Consultar' : 'Editar'}
                    </UserButton>
                    <UserButton className={styles.actionButton} disabled={!user.idUsuarioAutenticacionExterna}
                      onClick={() => onViewMovements(user)} variant="primary">Movimientos</UserButton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TablePagination page={currentPage} pageSize={pageSize} total={totalUsers} visibleCount={isLoading ? 0 : users.length}
        disabled={isLoading} label="Paginación de usuarios" integrated
        onPageChange={nextPage => { if (nextPage >= 1 && nextPage <= totalPages) onPageChange(nextPage) }}
        onPageSizeChange={onPageSizeChange} />
    </div>
  )
}

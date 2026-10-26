import LoadingIndicator from '../../../shared/components/loading/LoadingIndicator'
import { getRoleLabel } from '../../../config/roles'
import UserButton from './UserButton'
import UserStatusBadge from './UserStatusBadge'
import styles from '../pages/UserManagementPage.module.css'

export default function UserManagementMobileList({ isLoading, inspectingId, onEditUser, onViewMovements, users, readOnly = false }) {
  if (isLoading) {
    return (
      <div className={styles.mobileList}>
        <LoadingIndicator context="usuarios" />
      </div>
    )
  }

  if (users.length === 0) {
    return (
      <div className={styles.mobileList}>
        <p className={styles.mobileState}>No se encontraron usuarios para los filtros seleccionados.</p>
      </div>
    )
  }

  return (
    <div className={styles.mobileList}>
      {users.map((user) => (
        <article className={styles.mobileUserCard} key={user.id}>
          <header>
            <strong>{user.nombreListado}</strong>
            {user.username && <small>{user.username}</small>}
            {user.identityBindingConflict && <small>Vinculo pendiente de conciliacion</small>}
            <UserStatusBadge status={user.estadoUsuario} />
          </header>
          <dl>
            <div>
              <dt>RUT</dt>
              <dd>{user.rutUsuario}</dd>
            </div>
            <div>
              <dt>Correo</dt>
              <dd>{user.correoUsuario || 'Sin correo'}</dd>
            </div>
            <div>
              <dt>Rol</dt>
              <dd>{getRoleLabel(user.rolUsuario)}</dd>
            </div>
          </dl>
          <footer className={styles.userActions}>
            <UserButton icon="bi-pencil-fill" busy={inspectingId === user.id} disabled={!user.idUsuarioAutenticacionExterna}
                      onClick={() => onEditUser(user)} variant="secondary">
              {readOnly ? 'Consultar' : 'Editar'}
            </UserButton>
            <UserButton
              icon="bi-clock-history"
              disabled={!user.idUsuarioAutenticacionExterna}
                      onClick={() => onViewMovements(user)}
              variant="secondary"
            >
              Movimientos
            </UserButton>
          </footer>
        </article>
      ))}
    </div>
  )
}

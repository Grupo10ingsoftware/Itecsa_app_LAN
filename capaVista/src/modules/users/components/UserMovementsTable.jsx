import { formatProfileDate } from '../../profile/utils/profileFormatters'
import styles from './UserMovementsModal.module.css'
import tableStyles from './UserManagementTable.module.css'
import LoadingIndicator from '../../../shared/components/loading/LoadingIndicator'

export default function UserMovementsTable({ records = [], includeTime = false, label = 'Movimientos del usuario',
  isLoading = false, error = false, onRetry, children, scrollable = false }) {
  const table = <table className={`${tableStyles.usersTable} ${styles.table}`} aria-label={label} aria-busy={isLoading}>
    <thead><tr><th scope="col">Identificador</th><th scope="col">Detalle del movimiento</th><th scope="col">Fecha</th></tr></thead>
    <tbody>{isLoading || error || records.length === 0 ? <tr><td colSpan={3} className={tableStyles.tableStateCell}>
      <div className={styles.state}>
        {isLoading ? <LoadingIndicator context="movimientos" /> : error ? <>
          <p role="status">No fue posible mostrar los movimientos.</p>
          {onRetry && <button className={styles.button} type="button" onClick={onRetry}>Reintentar actividad</button>}
        </> : <p role="status">No existen movimientos para esta consulta.</p>}
      </div>
    </td></tr> : records.map(record => <tr key={record.id}>
      <td data-label="Identificador">{record.id}</td>
      <td data-label="Detalle del movimiento">{record.detail}</td>
      <td data-label="Fecha"><time dateTime={record.dateTime}>{formatProfileDate(record.dateTime, { includeTime })}</time></td>
    </tr>)}</tbody>
  </table>
  return <div className={tableStyles.tableCard}>
    <div className={`${tableStyles.tableResponsive} ${scrollable ? styles.scroll : ''}`} tabIndex={0} role="region" aria-label={label}>{table}</div>
    {children}
  </div>
}

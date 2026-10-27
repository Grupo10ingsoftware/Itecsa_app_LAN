import { formatDayTitle } from '../utils/calendarPresentation.js';
import styles from './ProductionCalendarGrid.module.css';
import PinAuthorizationModal from '../../../shared/components/pin/PinAuthorizationModal'

export function DeliveryChangeConfirmModal({ change, onCancel, onConfirm }) {
  if (!change) return null

  return (
    <div className={styles.modalLayer} role="presentation">
      <section aria-labelledby="delivery-change-title" aria-modal="true" className={styles.confirmModal} role="dialog">
        <header className={styles.modalHeader}>
          <div>
            <span>Confirmacion</span>
            <h2 id="delivery-change-title">Cambiar fecha de entrega</h2>
          </div>
        </header>

        <div className={styles.modalBody}>
          <p className={styles.confirmText}>
            Estas seguro que quieres cambiar la fecha de entrega del pedido {change.item.orderNumber} de{' '}
            {formatDayTitle(change.fromDate)} a {formatDayTitle(change.toDate)}?
          </p>
        </div>

        <footer className={styles.modalFooter}>
          <button className={styles.secondaryButton} onClick={onCancel} type="button">
            No
          </button>
          <button className={styles.primaryButton} onClick={onConfirm} type="button">
            Si
          </button>
        </footer>
      </section>
    </div>
  )
}

export function DeliveryChangeCredentialsModal({ change, onCancel, onConfirm }) {
  if (!change) return null
  return <PinAuthorizationModal contextKey={`${change.item.id ?? change.item.orderNumber}:${change.fromDate}:${change.toDate}`}
    title="Confirmar cambio" description={`Ingrese su PIN para hacer efectivo el cambio de fecha de ${change.item.orderNumber}.`}
    onConfirm={({ pin }) => onConfirm({ pin })} onCancel={onCancel}
    failureMessage="No fue posible cambiar la fecha de entrega." />
}

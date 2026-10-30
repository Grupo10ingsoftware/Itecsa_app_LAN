import { formatPaymentDate } from '../utils/paymentDocuments'
import PaymentRowActions from './PaymentRowActions'
import PaymentStatusBadge from './PaymentStatusBadge'
import styles from './PaymentOrdersTable.module.css'

export default function PaymentOrdersTable({
  canUpdatePaymentStatus,
  editingStatus,
  isUpdatingPaymentStatus = false,
  orders,
  onCloseEditor,
  onPrefetchDetails,
  onSelectStatus,
  onToggleEditor,
  onViewDetail,
}) {
  return (
    <section
      className={`d-none d-lg-block ${styles.desktopTableWrap}`}
      aria-label="Tabla de pagos"
    >
      <table className={styles.paymentTable}>
        <colgroup>
          <col className={styles.colOrder} />
          <col className={styles.colClient} />
          <col className={styles.colRut} />
          <col className={styles.colDate} />
          <col className={styles.colPaymentStatus} />
          <col className={styles.colActions} />
        </colgroup>

        <thead>
          <tr>
            <th scope="col">Pedido</th>
            <th scope="col">Cliente</th>
            <th scope="col">RUT</th>
            <th scope="col">Fecha</th>
            <th scope="col">Estado</th>
            <th scope="col">Acciones</th>
          </tr>
        </thead>

        <tbody>
          {orders.length > 0 ? (
            orders.map((order) => (
              <tr key={order.id}>
                <td className={styles.orderCell}>{order.nvNumber}</td>
                <td className={styles.clientCell}>{order.companyName}</td>
                <td className={styles.rutCell}>{order.rut}</td>
                <td className={styles.dateCell}>
                  {formatPaymentDate(order.createdAt)}
                </td>
                <td>
                  <PaymentStatusBadge status={order.paymentStatus} />
                </td>
                <td className={styles.actionsCell}>
                  <PaymentRowActions
                    canUpdatePaymentStatus={canUpdatePaymentStatus}
                    editingStatus={editingStatus}
                    isUpdatingPaymentStatus={isUpdatingPaymentStatus}
                    onCloseEditor={onCloseEditor}
                    onPrefetchDetails={onPrefetchDetails}
                    onSelectStatus={onSelectStatus}
                    onToggleEditor={onToggleEditor}
                    onViewDetail={onViewDetail}
                    order={order}
                  />
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td className={styles.emptyState} colSpan="6">
                No hay pedidos que coincidan con los filtros aplicados.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  )
}

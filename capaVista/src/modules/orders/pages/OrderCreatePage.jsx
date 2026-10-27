import { LoadingAction } from '../../../shared/components/loading/LoadingIndicator'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../hooks/useAuth'
import OrderCreateHeader from '../components/OrderCreateHeader'
import OrderCreateConfirmModal from '../components/OrderCreateConfirmModal'
import PinAuthorizationModal from '../../../shared/components/pin/PinAuthorizationModal'
import SalesNoteStep from '../components/SalesNoteStep'
import { useOrderCreateFlow } from '../../../hooks/useOrderCreateFlow'
import styles from './OrderCreatePage.module.css'
import PageShell, { PageSurface } from '../../../shared/components/layout/PageShell'

export default function OrderCreatePage() {
  const navigate = useNavigate()
  const { identityUser, user } = useAuth()
  const flow = useOrderCreateFlow({ navigate })
  const { actions } = flow
  const responsibleUserName = [
    user?.nombreUsuario,
    user?.apellidoUsuario,
  ].filter(Boolean).join(' ')
    || user?.correoUsuario
    || user?.email
    || identityUser?.name
    || identityUser?.email
    || 'Usuario no identificado'

  return (
    <PageShell className={styles.page}>
      <PageSurface className={styles.dashboardShell} inert={flow.showConfirmModal || flow.showPinModal || undefined}>
        <OrderCreateHeader />

        <div className={styles.content}>
          <SalesNoteStep
            draft={flow.draft}
            errors={flow.errors}
            isSearching={flow.isSearching}
            onChange={actions.updateDraftField}
            onPriorityChange={actions.updatePriority}
            onSearch={actions.handleSearchSalesNote}
            responsibleUserName={responsibleUserName}
          />

          <div className={styles.footerActions}>
            <button
              className={styles.cancelButton}
              disabled={flow.isRegistering}
              onClick={actions.resetFlow}
              type="button"
            >
              Cancelar
            </button>
            <button
              className={styles.registerButton}
              disabled={!flow.salesNoteIsValid || flow.isRegistering}
              onClick={actions.handleOpenConfirmModal}
              type="button"
             aria-busy={flow.isRegistering}>
              <i className="bi bi-plus-circle" aria-hidden="true" />
              <LoadingAction busy={flow.isRegistering} context="Registrar pedido">Registrar pedido</LoadingAction>
            </button>
          </div>
        </div>
      </PageSurface>

      {flow.showPinModal && <PinAuthorizationModal
        contextKey="register-sales-note" title="Autorizar registro"
        description="Ingrese su PIN personal para registrar la Nota de Venta."
        feedbackMode="toast" isSubmitting={flow.isRegistering}
        onCancel={actions.closeConfirmModal} onConfirm={actions.authorizeRegister}
        failureMessage="No fue posible registrar el pedido."
      />}
      {flow.showConfirmModal && (
        <OrderCreateConfirmModal
          draft={flow.draft}
          isRegistering={flow.isRegistering}
          onCancel={actions.closeConfirmModal}
          onConfirm={actions.handleConfirmRegister}
        />
      )}
    </PageShell>
  )
}

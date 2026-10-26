import PaymentCredentialsModal from '../src/modules/payments/components/PaymentCredentialsModal'
import { MoveToProductionModal } from '../src/modules/kanban/components/MoveToProductionModal'
import { SubprocessAuthModal } from '../src/modules/kanban/components/SubprocessAuthModal'
import { CancelProductionModal } from '../src/modules/kanban/components/CancelProductionModal'
import { PaymentDeconfirmationModal } from '../src/modules/kanban/components/PaymentDeconfirmationModal'
import { DeliveryChangeCredentialsModal } from '../src/modules/productionCalendar/components/DeliveryChangeModals'
import UserEditModal from '../src/modules/users/components/UserEditModal'
import ProfilePage from '../src/modules/profile/pages/ProfilePage'
import { ROLES } from '../src/config/roles'

// Solo presentación de componentes reales. Los callbacks no acceden a servicios.
const noop = () => {}
const pending = () => new Promise(() => {})
const order = { id: 1, salesNoteNumber: 'NV-fixture' }
const user = { id: 'fixture', nombreUsuario: 'Ana', apellidoUsuario: 'Perez',
  correoUsuario: 'preview@example.test', rolUsuario: ROLES.PRODUCCION, estadoUsuario: 'Activo' }

export default function PinLoadingPreview({ id }) {
  if (id.startsWith('pin-profile-')) return <ProfilePage />
  if (['pin-payments', 'pin-user-create', 'pin-user-reconcile'].includes(id)) {
    return <PaymentCredentialsModal isSubmitting description={id === 'pin-payments' ? 'Autorizar pago mediante PIN.'
      : id === 'pin-user-create' ? 'Autorizar creación de usuario mediante PIN.' : 'Conciliar preparación mediante PIN.'}
      onCancel={noop} onConfirm={pending} />
  }
  if (id === 'pin-move') return <MoveToProductionModal isOpen order={order} onClose={noop} onConfirm={pending} />
  if (['pin-complete', 'pin-rollback'].includes(id)) return <SubprocessAuthModal
    authModal={{ action: id === 'pin-rollback' ? 'rollback' : 'complete', process: { name: 'Subproceso de prueba' } }}
    isCompletingSubprocess completeSubProcess={noop} closeAuthModal={noop} operatorPin="123456"
    operatorComment="Observación de prueba" setOperatorPin={noop} setAuthError={noop} setOperatorComment={noop} />
  if (id === 'pin-cancel') return <CancelProductionModal isCancelling submitCancellation={noop}
    setIsCancelModalOpen={noop} setCancelPin={noop} setCancelError={noop} cancelPin="123456"
    setCancelComment={noop} cancelComment="Observación de prueba" />
  if (id === 'pin-deconfirmation') return <PaymentDeconfirmationModal order={order} isApprovingDeconfirmation
    approvePaymentDeconfirmation={noop} closeDeconfirmationAuthModal={noop} setDeconfirmationPin={noop}
    setDeconfirmationError={noop} deconfirmationPin="123456" />
  if (id === 'pin-calendar') return <DeliveryChangeCredentialsModal
    change={{ item: { orderNumber: order.salesNoteNumber } }} onCancel={noop} onConfirm={pending} />
  if (id === 'pin-user-edit') return <UserEditModal isOpen user={user} onClose={noop} onSave={pending} />
  throw Error(`Caso PIN no definido: ${id}`)
}

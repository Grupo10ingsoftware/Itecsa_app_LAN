import PinAuthorizationModal from '../../../shared/components/pin/PinAuthorizationModal'

export function PaymentDeconfirmationModal({ approvePaymentDeconfirmation, isApprovingDeconfirmation, closeDeconfirmationAuthModal, order, deconfirmationError }) {
  return <PinAuthorizationModal contextKey={order.id ?? order.salesNoteNumber}
    title="Aprobar desconfirmacion"
    description={`Ingrese su PIN para devolver el pedido ${order.salesNoteNumber} a Confirmacion de pago.`}
    onConfirm={({ pin }) => approvePaymentDeconfirmation({ pin })} onCancel={closeDeconfirmationAuthModal}
    isSubmitting={isApprovingDeconfirmation} errorMessage={deconfirmationError} />
}

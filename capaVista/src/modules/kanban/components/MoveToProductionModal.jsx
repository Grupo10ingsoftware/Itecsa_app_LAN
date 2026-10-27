import PinAuthorizationModal from '../../../shared/components/pin/PinAuthorizationModal'

export function MoveToProductionModal({ isOpen, onClose, onConfirm, order }) {
  if (!isOpen || !order) return null
  return <PinAuthorizationModal contextKey={order.id ?? order.salesNoteNumber} title="Mover pedido"
    description={`Ingrese su PIN para hacer efectivo el traspaso del pedido ${order.salesNoteNumber}.`}
    observation={{ label: 'Comentario opcional', placeholder: 'Agrega una observacion para produccion si corresponde.' }}
    onConfirm={onConfirm} onCancel={onClose} confirmLabel="Mover pedido" failureMessage="No fue posible mover la orden." />
}

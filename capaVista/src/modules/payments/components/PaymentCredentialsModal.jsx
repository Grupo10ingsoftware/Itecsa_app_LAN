import { PAYMENT_STATUS } from '@/config/status'
import PinAuthorizationModal from '../../../shared/components/pin/PinAuthorizationModal'

export default function PaymentCredentialsModal({ isSubmitting = false, onCancel, onConfirm, order,
  targetStatus, description, errorMessage = '' }) {
  if (!description && (!order || !targetStatus)) return null
  const requiresComment = order?.paymentStatus !== undefined && order.paymentStatus !== PAYMENT_STATUS.PENDIENTE
  return <PinAuthorizationModal contextKey={`${order?.id ?? order?.nvNumber ?? ''}:${targetStatus ?? description}`}
    description={description ?? `Ingrese su PIN personal para hacer efectivo el cambio de pago de ${order.nvNumber} a ${targetStatus}.`}
    observation={requiresComment ? { label: 'Motivo del cambio', required: true, maxLength: 2000,
      placeholder: 'Explique por qué se modifica la decisión de pago' } : undefined}
    onConfirm={onConfirm} onCancel={onCancel} isSubmitting={isSubmitting} errorMessage={errorMessage} disableUntilValid />
}

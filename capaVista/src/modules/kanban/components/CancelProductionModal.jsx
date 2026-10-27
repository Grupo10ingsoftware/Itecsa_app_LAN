import PinAuthorizationModal from '../../../shared/components/pin/PinAuthorizationModal'

export function CancelProductionModal({ submitCancellation, isCancelling, setIsCancelModalOpen, cancelError }) {
  return <PinAuthorizationModal title="Cancelar produccion" description="Ingresa tu PIN y el motivo de la cancelaci?n."
    observation={{ label: 'Observacion', required: true, maxLength: 2000, placeholder: 'Explique por que se cancela la produccion.' }}
    onConfirm={submitCancellation} onCancel={() => setIsCancelModalOpen(false)} isSubmitting={isCancelling}
    errorMessage={cancelError} cancelLabel="Volver" confirmLabel="Confirmar cancelacion" />
}

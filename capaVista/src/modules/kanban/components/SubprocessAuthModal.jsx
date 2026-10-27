import PinAuthorizationModal from '../../../shared/components/pin/PinAuthorizationModal'

export function SubprocessAuthModal({ completeSubProcess, authModal, isCompletingSubprocess, closeAuthModal, authError }) {
  const rollback = authModal.action === 'rollback'
  return <PinAuthorizationModal contextKey={`${authModal.item.id}:${authModal.process.id}:${authModal.action}`}
    title={rollback ? `Retroceder a ${authModal.process.name}` : authModal.process.name}
    description="Ingresa tu PIN y una observación para continuar."
    observation={{ label: rollback ? 'Observación obligatoria' : 'Comentario opcional', required: rollback,
      maxLength: rollback ? 2000 : undefined, placeholder: rollback ? 'Explique el motivo del retroceso.' : 'Agrega una observación si corresponde.' }}
    onConfirm={completeSubProcess} onCancel={closeAuthModal} isSubmitting={isCompletingSubprocess}
    errorMessage={authError} confirmLabel={rollback ? 'Confirmar retroceso' : 'Completar subproceso'} />
}

import { KanbanDetailSection } from './KanbanDetailSection'
import LoadingIndicator, { LoadingAction } from '../../../shared/components/loading/LoadingIndicator'
import PinModal, { PinActions } from '../../../shared/components/pin/PinModal'
import PinAuthorizationModal from '../../../shared/components/pin/PinAuthorizationModal'
import { isItemReadyForDelivery, isPaymentConfirmed } from '../utils/kanbanOrderRules'
import { formatCommentDate } from '../utils/kanbanDetail'
import { PaymentDeconfirmationModal } from './PaymentDeconfirmationModal.jsx';
import { CancelProductionModal } from './CancelProductionModal.jsx';
import { SubprocessAuthModal } from './SubprocessAuthModal.jsx';
import { KanbanComments } from './KanbanComments.jsx';
import { KanbanSubprocesses } from './KanbanSubprocesses.jsx';
import { KanbanOrderSummary } from './KanbanOrderSummary.jsx';
import {
  getOrderItems,
  getCommentGroups,
  KANBAN_EN_PRODUCCION_STEP,
  KANBAN_LISTO_PRODUCCION_STEP,
  isLanyardPackagingBlocked,
} from '../utils/kanbanDetail.js';
import { useRef, useState } from 'react';
import styles from '../styles/Kanban.module.css';
import { useModalDialog } from '../../users/hooks/useModalDialog'
import { useToast } from '../../../shared/notifications/useToast'
import { operationFailureMessage, requiresContext, uncertainOperation } from '../../../shared/notifications/operationFeedback'

export default function KanbanOffCanvas(props) {
  return props.isOpen ? <KanbanOffCanvasContent key={props.order?.id ?? props.order?.salesNoteNumber ?? 'loading'} {...props} /> : null
}

function KanbanOffCanvasContent({
  canCancelProduction = false,
  canRollbackSubprocess = false,
  canCompleteSubprocess = false,
  canReview = false,
  canReevaluate = false,
  isOpen,
  isLoading = false,
  loadError = null,
  onApprovePaymentDeconfirmation,
  onClose,
  onCompleteSubprocess,
  onFinishProduction,
  canFinishProduction = false,
  onRollbackSubprocess,
  onReevaluate,
  onCancelProduction,
  onSendToReview,
  order,
}) {
  const [finishOpen, setFinishOpen] = useState(false)
  const [isFinishing, setIsFinishing] = useState(false)
  const [authModal, setAuthModal] = useState(null)
  const [authError, setAuthError] = useState('')
  const [isCompletingSubprocess, setIsCompletingSubprocess] = useState(false)
  const [isCorrectionFormOpen, setIsCorrectionFormOpen] = useState(false)
  const [correctionText, setCorrectionText] = useState('')
  const [correctionError, setCorrectionError] = useState('')
  const [deconfirmationAuthOpen, setDeconfirmationAuthOpen] = useState(false)
  const [deconfirmationError, setDeconfirmationError] = useState('')
  const [isApprovingDeconfirmation, setIsApprovingDeconfirmation] = useState(false)
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false)
  const [cancelError, setCancelError] = useState('')
  const [isCancelling, setIsCancelling] = useState(false)
  const [isReevaluating, setIsReevaluating] = useState(false)
  const notify = useToast()
  const [reevaluateOpen, setReevaluateOpen] = useState(false)
  const [isSendingCorrection, setIsSendingCorrection] = useState(false)
  const correctionPending = useRef(false)
  const operationPending = useRef(false)
  const panelRef = useRef(null)
  const isMutating = isFinishing || isCompletingSubprocess || isCancelling || isReevaluating || isApprovingDeconfirmation || isSendingCorrection
  useModalDialog({ containerRef: panelRef, isOpen: Boolean(isOpen && order && !finishOpen && !authModal && !isCancelModalOpen && !deconfirmationAuthOpen && !reevaluateOpen), canClose: !isMutating, onClose })

  if (!isOpen || !order) {
    return null
  }

  if (isLoading || loadError) {
    return (
      <div className={styles.offcanvasLayer} role="presentation">
        <aside ref={panelRef} aria-labelledby="kanban-detail-title" className={styles.offcanvasPanel} role="dialog" tabIndex={-1}>
          <header className={styles.offcanvasHeader}>
            <div><span className={styles.offcanvasKicker}>{order.salesNoteNumber}</span><h2 id="kanban-detail-title">Detalle del pedido</h2></div>
            <button aria-label="Cerrar detalle" className={styles.offcanvasCloseButton} onClick={onClose} type="button"><i className="bi bi-x-lg" aria-hidden="true" /></button>
          </header>
          <div className={styles.offcanvasBody} role={loadError ? 'alert' : undefined}>
            {loadError || <LoadingIndicator scope="dialog" context="Detalle del pedido" />}
          </div>
        </aside>
      </div>
    )
  }

  const orderItems = getOrderItems(order)
  const commentGroups = getCommentGroups(order)
  const isInProduction = Number(order.generalStepId) === KANBAN_EN_PRODUCCION_STEP
  const productionFinished = [3, 4].includes(Number(order.generalStepId))
  const readyToFinishOrder = Number(order.generalStepId) === 3
  const finishLabel = readyToFinishOrder ? 'Finalizar pedido' : 'Finalizar producción'
  const readyToFinish = isInProduction && isPaymentConfirmed(order) && orderItems.length > 0 && orderItems.every(isItemReadyForDelivery)
  async function finishProduction({ pin }) {
    if (operationPending.current) return
    operationPending.current = true
    setIsFinishing(true)
    try {
      await onFinishProduction(order, { pin })
      setFinishOpen(false)
    } finally {
      operationPending.current = false
      setIsFinishing(false)
    }
  }
  const canRequestCorrection = canReview && Number(order.generalStepId) === KANBAN_LISTO_PRODUCCION_STEP
  const hasCorrectionRequest = Boolean(order.correctionRequested)
  const canApprovePaymentDeconfirmation =
    canReview && typeof onApprovePaymentDeconfirmation === 'function' &&
    Number(order.generalStepId) === KANBAN_LISTO_PRODUCCION_STEP &&
    Boolean(order.paymentDeconfirmationRequested)

  function closeReevaluation() {
    if (!operationPending.current) setReevaluateOpen(false)
  }

  async function confirmReevaluation(event) {
    event.preventDefault()
    if (operationPending.current || !canReevaluate) return
    operationPending.current = true
    setIsReevaluating(true)
    try {
      const result = await onReevaluate?.(order)
      if (result !== false) setReevaluateOpen(false)
    } catch (error) {
      notify.error(operationFailureMessage(error, 'No fue posible reevaluar el pedido.'))
    } finally {
      operationPending.current = false
      setIsReevaluating(false)
    }
  }

  function openAuthModal(item, process, processIndex, currentProcessIndex) {
    if (
      !canCompleteSubprocess ||
      !isInProduction ||
      process.status === 'done' ||
      processIndex !== currentProcessIndex ||
      isLanyardPackagingBlocked(item, process)
    ) {
      return
    }

    setAuthModal({ item, process, action: 'complete' })
    setAuthError('')
  }

  function resetAuthModal() {
    setAuthModal(null)
    setAuthError('')
  }
  function closeAuthModal() {
    if (!operationPending.current) resetAuthModal()
  }

  function openRollbackModal(item, process) {
    setAuthModal({ item, process, action: 'rollback' })
    setAuthError('')
  }

  async function completeSubProcess({ pin, comment }) {
    if (operationPending.current) return
    const trimmedPin = pin.trim()

    if (!/^\d{6}$/.test(trimmedPin)) {
      setAuthError('Ingrese un PIN valido de 6 digitos.')
      return
    }

    const trimmedComment = comment.trim()

    if (authModal.action === 'rollback' && !trimmedComment) {
      setAuthError('Debe ingresar una observacion para retroceder.')
      return
    }

    operationPending.current = true
    setIsCompletingSubprocess(true)
    const action = authModal.action === 'rollback' ? onRollbackSubprocess : onCompleteSubprocess
    try {
      const wasCompleted = await action(order, authModal.item, authModal.process, {
        pin: trimmedPin,
        comment: trimmedComment,
      })

      if (wasCompleted === false) {
        setAuthError('No fue posible completar el subproceso.')
        return
      }

      resetAuthModal()
    } catch (error) {
      const message = operationFailureMessage(error, authModal.action === 'rollback' ? 'No fue posible retroceder el subproceso.' : 'No fue posible completar el subproceso.')
      if (requiresContext(error) || uncertainOperation(error)) setAuthError(message)
      else notify.error(message)
    } finally { operationPending.current = false; setIsCompletingSubprocess(false) }
  }

  async function submitCorrection(event) {
    event.preventDefault()
    if (correctionPending.current) return
    const trimmedCorrection = correctionText.trim()

    if (!trimmedCorrection) {
      setCorrectionError('Debe especificar la correccion necesaria.')
      return
    }

    correctionPending.current = true
    setIsSendingCorrection(true)
    try {
      const wasSent = await onSendToReview?.(order, trimmedCorrection)
      if (wasSent === false) {
        setCorrectionError('No fue posible enviar el pedido a revisión.')
        return
      }
      setCorrectionText('')
      setCorrectionError('')
      setIsCorrectionFormOpen(false)
    } catch (error) {
      const message = operationFailureMessage(error, 'No fue posible enviar el pedido a revisión.')
      if (requiresContext(error) || uncertainOperation(error)) setCorrectionError(message)
      else notify.error(message)
    } finally { correctionPending.current = false; setIsSendingCorrection(false) }
  }

  async function submitCancellation({ pin, comment }) {
    if (operationPending.current) return

    if (!/^\d{6}$/.test(pin)) {
      setCancelError('Ingrese un PIN valido de 6 digitos.')
      return
    }
    if (!comment) {
      setCancelError('Debe ingresar una observacion para cancelar.')
      return
    }

    operationPending.current = true
    setIsCancelling(true)
    try {
      const wasCancelled = await onCancelProduction?.(order, { pin, comment })
      if (wasCancelled === false) {
        setCancelError('No fue posible cancelar la produccion.')
      }
    } catch (error) {
      const message = operationFailureMessage(error, 'No fue posible cancelar la producción.')
      if (requiresContext(error) || uncertainOperation(error)) setCancelError(message)
      else notify.error(message)
    } finally {
      operationPending.current = false
      setIsCancelling(false)
    }
  }

  function closeDeconfirmationAuthModal() {
    if (isApprovingDeconfirmation) return

    setDeconfirmationAuthOpen(false)
    setDeconfirmationError('')
  }

  async function approvePaymentDeconfirmation({ pin }) {
    if (operationPending.current) return
    const trimmedPin = pin.trim()

    if (!/^\d{6}$/.test(trimmedPin)) {
      setDeconfirmationError('Ingrese un PIN valido de 6 digitos.')
      return
    }

    operationPending.current = true
    setIsApprovingDeconfirmation(true)
    setDeconfirmationError('')

    try {
      const wasApproved = await onApprovePaymentDeconfirmation?.(order, {
        pin: trimmedPin,
      })
      if (wasApproved === false) {
        setDeconfirmationError('No fue posible aprobar la desconfirmacion.')
        return
      }
      setDeconfirmationAuthOpen(false)
    } catch {
      setDeconfirmationError('No fue posible aprobar la desconfirmacion.')
    } finally {
      operationPending.current = false
      setIsApprovingDeconfirmation(false)
    }
  }

  return (
    <div className={styles.offcanvasLayer} role="presentation">
      <aside ref={panelRef} aria-labelledby="kanban-detail-title" className={styles.offcanvasPanel} role="dialog" tabIndex={-1}>
        <header className={styles.offcanvasHeader}>
          <div>
            <span className={styles.offcanvasKicker}>{order.salesNoteNumber}</span>
            <h2 id="kanban-detail-title">Detalle del pedido</h2>
          </div>
          <button aria-label="Cerrar detalle" className={styles.offcanvasCloseButton} disabled={isMutating} onClick={onClose} type="button">
            <i className="bi bi-x-lg" aria-hidden="true" />
          </button>
        </header>

        <div className={styles.offcanvasBody}>
          <KanbanOrderSummary
            order={order}
            orderItems={orderItems}
          />

          {(productionFinished || readyToFinish) && (
            <section className={styles.productionCompletion}>
              <header className={styles.completionHeader}>
                <span className={styles.completionCheck}><i className="bi bi-check-lg" aria-hidden="true" /></span>
                <div className={styles.completionTitle}>
                  <span className={styles.completionKicker}>{productionFinished ? 'ETAPA COMPLETADA' : 'SUBPROCESOS COMPLETADOS'}</span>
                  <h3>{Number(order.generalStepId) === 4 ? 'Pedido terminado' : productionFinished ? 'Producción finalizada' : 'Proceso productivo completo'}</h3>
                </div>
                {productionFinished && order.orderStatus && <span className={styles.completionStatus}>{order.orderStatus}</span>}
              </header>
              <div className={styles.completionBody}>
                {readyToFinishOrder && canFinishProduction && <p>Producción finalizada, ahora puedes finalizar este pedido.</p>}
                {!productionFinished && <p>Todos los subprocesos están completados. El pedido puede quedar listo para entrega.</p>}
                {productionFinished && (order.productionCompletion?.completedAt || order.productionCompletion?.responsible) && (
                  <div className={styles.completionMeta}>
                    {order.productionCompletion?.completedAt && <span><i className="bi bi-calendar-check" aria-hidden="true" /> {formatCommentDate(order.productionCompletion.completedAt)}</span>}
                    {order.productionCompletion?.responsible && <span><i className="bi bi-person" aria-hidden="true" /> {order.productionCompletion.responsible}</span>}
                  </div>
                )}
              </div>
            </section>
          )}
          {canApprovePaymentDeconfirmation && (
            <KanbanDetailSection title="Solicitud de desconfirmacion" icon="clipboard-check">
              <div className={styles.deconfirmationApprovalPanel}>
                <div>
                  <span>Solicitud de desconfirmacion</span>
                  <strong>
                    {order.paymentDeconfirmationRequestedBy || 'Cobranza'} solicita devolver este pedido a Confirmacion de pago.
                  </strong>
                </div>
                <button
                  className={styles.orderCardButton}
                  onClick={() => setDeconfirmationAuthOpen(true)}
                  type="button"
                >
                  <i className="bi bi-check2-circle" aria-hidden="true" />
                  Aprobar Desconfirmacion
                </button>
              </div>
            </KanbanDetailSection>
          )}

          {canRequestCorrection && (
            <KanbanDetailSection title="Correccion previa a OP" icon="wrench">
              {hasCorrectionRequest && (
                <div className={styles.correctionNotice}>
                  <i className="bi bi-exclamation-triangle-fill" aria-hidden="true" />
                  <span>Este pedido quedo marcado en correccion.</span>
                </div>
              )}
              <button
                className={styles.orderCardButton}
                disabled={isMutating}
                onClick={() => {
                  setIsCorrectionFormOpen((currentValue) => !currentValue)
                  setCorrectionError('')
                }}
                type="button"
              >
                <i className="bi bi-pencil-square" aria-hidden="true" />
                Solicita correccion
              </button>

              {isCorrectionFormOpen && (
                <form className={styles.correctionForm} onSubmit={submitCorrection}>
                  <label htmlFor="correction-request-text">Especifique la correccion necesaria</label>
                  <textarea
                    id="correction-request-text"
                    onChange={(event) => {
                      setCorrectionText(event.target.value)
                      setCorrectionError('')
                    }}
                    placeholder="Ej: corregir posicion del codigo antes de generar la OP."
                    rows={4}
                    value={correctionText}
                  />
                  {correctionError && <p className={styles.operatorModalError} role="alert">{correctionError}</p>}
                  <div className={styles.correctionActions}>
                    <button
                      className={styles.resetFilterButton}
                      disabled={isSendingCorrection}
                      onClick={() => {
                        setIsCorrectionFormOpen(false)
                        setCorrectionText('')
                        setCorrectionError('')
                      }}
                      type="button"
                    >
                      Cancelar
                    </button>
                    <button className={styles.orderCardButton} disabled={isSendingCorrection} aria-busy={isSendingCorrection} type="submit">
                      <LoadingAction busy={isSendingCorrection}>Confirmar correccion</LoadingAction>
                    </button>
                  </div>
                </form>
              )}
            </KanbanDetailSection>
          )}

          {canReevaluate && (
            <KanbanDetailSection title="Revision del pedido" icon="arrow-repeat">
              <button className={styles.orderCardButton} disabled={isMutating} onClick={() => setReevaluateOpen(true)} type="button" aria-busy={isReevaluating}>
                <i className="bi bi-arrow-repeat" aria-hidden="true" />
                <LoadingAction busy={isReevaluating} context="Reevaluar pedido">Reevaluar pedido</LoadingAction>
              </button>
            </KanbanDetailSection>
          )}

          <KanbanSubprocesses
            isInProduction={isInProduction}
            orderItems={orderItems}
            canCompleteSubprocess={canCompleteSubprocess}
            canRollbackSubprocess={canRollbackSubprocess}
            openRollbackModal={openRollbackModal}
            openAuthModal={openAuthModal}
          />

          <KanbanComments
            commentGroups={commentGroups}
          />
        </div>
        {(canCancelProduction || (canFinishProduction && (readyToFinishOrder || readyToFinish))) && (
          <footer className={styles.offcanvasFooter}>
            {canCancelProduction && <button className={styles.cancelOrderButton} type="button"
              onClick={() => { setCancelError(''); setIsCancelModalOpen(true) }}>
              <i className="bi bi-trash" aria-hidden="true" /> Cancelar pedido
            </button>}
            {canFinishProduction && (readyToFinishOrder || readyToFinish) && (
              <button className={styles.finishOrderButton} disabled={isMutating} aria-busy={isFinishing}
                type="button" onClick={() => setFinishOpen(true)}>
                <i className="bi bi-check-lg" aria-hidden="true" />
                <LoadingAction busy={isFinishing}>{finishLabel}</LoadingAction>
              </button>
            )}
          </footer>
        )}
      </aside>

      {reevaluateOpen && <PinModal
        title="Confirmar reevaluación"
        description="¿Confirmas que ya corregiste la información de este pedido en Manager?"
        busy={isReevaluating} onClose={closeReevaluation} onSubmit={confirmReevaluation}
        actions={<PinActions busy={isReevaluating} onCancel={closeReevaluation} confirmLabel="Sí, ya corregí los datos" />}>
        <p>Antes de continuar, verifica que los cambios necesarios estén guardados en Manager. Al confirmar, el sistema ejecutará la reevaluación del pedido.</p>
      </PinModal>}
      {finishOpen && <PinAuthorizationModal
        contextKey={`finish-${order.id}-${order.generalStepId}`} title={finishLabel}
        description={readyToFinishOrder ? 'Ingrese su PIN personal para cambiar el pedido a Terminado.' : 'Ingrese su PIN personal para finalizar la producción del pedido.'}
        feedbackMode="toast" isSubmitting={isFinishing} onConfirm={finishProduction}
        onCancel={() => { if (!operationPending.current) setFinishOpen(false) }}
        failureMessage={readyToFinishOrder ? 'No fue posible finalizar el pedido.' : 'No fue posible finalizar la producción.'}
      />}
      {authModal && (
        <SubprocessAuthModal
          completeSubProcess={completeSubProcess}
          authModal={authModal}
          isCompletingSubprocess={isCompletingSubprocess}
          closeAuthModal={closeAuthModal}
          authError={authError}
        />
      )}

      {isCancelModalOpen && (
        <CancelProductionModal
          submitCancellation={submitCancellation}
          isCancelling={isCancelling}
          setIsCancelModalOpen={setIsCancelModalOpen}
          cancelError={cancelError}
        />
      )}

      {deconfirmationAuthOpen && (
        <PaymentDeconfirmationModal
          approvePaymentDeconfirmation={approvePaymentDeconfirmation}
          isApprovingDeconfirmation={isApprovingDeconfirmation}
          closeDeconfirmationAuthModal={closeDeconfirmationAuthModal}
          order={order}
          deconfirmationError={deconfirmationError}
        />
      )}
    </div>
  )
}

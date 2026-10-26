import { LoadingAction } from '../../../shared/components/loading/LoadingIndicator'
import styles from '../styles/Kanban.module.css';
import { useRef } from 'react'
import { useModalDialog } from '../../users/hooks/useModalDialog'

export function CancelProductionModal({ submitCancellation, isCancelling, setIsCancelModalOpen, setCancelPin, setCancelError, cancelPin, setCancelComment, cancelComment, cancelError }) {
  const modalRef = useRef(null)
  useModalDialog({ containerRef: modalRef, isOpen: true, canClose: !isCancelling, onClose: () => setIsCancelModalOpen(false) })
  return (
    <div className={styles.operatorModalLayer} role="presentation">
      <form ref={modalRef} aria-modal="true" className={styles.operatorModal} onSubmit={submitCancellation} role="dialog" aria-labelledby="cancel-production-title">
        <header className={styles.operatorModalHeader}>
          <div>
            <span className={styles.offcanvasKicker}>Confirmacion requerida</span>
            <h3 id="cancel-production-title">Cancelar produccion</h3>
          </div>
          <button
            aria-label="Cerrar cancelacion"
            className={styles.offcanvasCloseButton}
            disabled={isCancelling}
            onClick={() => setIsCancelModalOpen(false)}
            type="button"
          >
            <i className="bi bi-x-lg" aria-hidden="true" />
          </button>
        </header>
        <div className={styles.operatorModalBody}>
          <label>
            <span>PIN personal</span>
            <input
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={6}
              onChange={(event) => {
                setCancelPin(event.target.value.replace(/\D/g, '').slice(0, 6))
                setCancelError('')
              }}
              placeholder="000000"
              type="password"
              value={cancelPin}
            />
          </label>
          <label>
            <span>Observacion</span>
            <textarea
              maxLength={2000}
              onChange={(event) => {
                setCancelComment(event.target.value)
                setCancelError('')
              }}
              placeholder="Explique por que se cancela la produccion."
              required
              rows={4}
              value={cancelComment}
            />
          </label>
          {cancelError && <p className={styles.operatorModalError}>{cancelError}</p>}
        </div>
        <footer className={styles.operatorModalFooter}>
          <button className={styles.resetFilterButton} disabled={isCancelling} onClick={() => setIsCancelModalOpen(false)} type="button">
            Volver
          </button>
          <button className={styles.orderCardButton} disabled={isCancelling} type="submit" aria-busy={isCancelling}>
            <LoadingAction busy={isCancelling} context="Confirmar cancelacion">Confirmar cancelacion</LoadingAction>
          </button>
        </footer>
      </form>
    </div>
  )
}

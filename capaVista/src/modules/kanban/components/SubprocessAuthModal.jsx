import { LoadingAction } from '../../../shared/components/loading/LoadingIndicator'
import styles from '../styles/Kanban.module.css';
import { useRef } from 'react'
import { useModalDialog } from '../../users/hooks/useModalDialog'

export function SubprocessAuthModal({ completeSubProcess, authModal, isCompletingSubprocess, closeAuthModal, setOperatorPin, setAuthError, operatorPin, setOperatorComment, operatorComment, authError }) {
  const modalRef = useRef(null)
  useModalDialog({ containerRef: modalRef, isOpen: true, canClose: !isCompletingSubprocess, onClose: closeAuthModal })
  return (
    <div className={styles.operatorModalLayer} role="presentation">
      <form
        ref={modalRef}
        aria-modal="true"
        aria-labelledby="operator-modal-title"
        className={styles.operatorModal}
        onSubmit={completeSubProcess}
        role="dialog"
      >
        <header className={styles.operatorModalHeader}>
          <div>
            <span className={styles.offcanvasKicker}>Validacion PIN</span>
            <h3 id="operator-modal-title">{authModal.action === 'rollback' ? `Retroceder a ${authModal.process.name}` : authModal.process.name}</h3>
          </div>
          <button
            aria-label="Cerrar validacion"
            className={styles.offcanvasCloseButton}
            disabled={isCompletingSubprocess}
            onClick={closeAuthModal}
            type="button"
          >
            <i className="bi bi-x-lg" aria-hidden="true" />
          </button>
        </header>

        <div className={styles.operatorModalBody}>
          <label>
            <span>PIN</span>
            <input
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={6}
              onChange={(event) => {
                setOperatorPin(event.target.value.replace(/\D/g, '').slice(0, 6))
                setAuthError('')
              }}
              placeholder="000000"
              type="password"
              value={operatorPin}
            />
          </label>
          <label>
            <span>{authModal.action === 'rollback' ? 'Observacion obligatoria' : 'Comentario opcional'}</span>
            <textarea
              onChange={(event) => setOperatorComment(event.target.value)}
              placeholder="Describe una observacion del traspaso si corresponde."
              rows={3}
              value={operatorComment}
            />
          </label>
          {authError && <p className={styles.operatorModalError}>{authError}</p>}
        </div>

        <footer className={styles.operatorModalFooter}>
          <button className={styles.resetFilterButton} disabled={isCompletingSubprocess} onClick={closeAuthModal} type="button">
            Cancelar
          </button>
          <button className={styles.orderCardButton} disabled={isCompletingSubprocess} type="submit" aria-busy={isCompletingSubprocess}>
            <LoadingAction busy={isCompletingSubprocess}>{authModal.action === 'rollback' ? 'Confirmar retroceso' : 'Completar subproceso'}</LoadingAction>
          </button>
        </footer>
      </form>
    </div>
  )
}

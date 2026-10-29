import { useId } from 'react'
import { OverlayTrigger, Tooltip } from 'react-bootstrap'
import { KanbanDetailSection } from './KanbanDetailSection'
import styles from '../styles/Kanban.module.css';
import { getLanyardProgress, isLanyardItem, isLanyardPackagingBlocked, formatStatus } from '../utils/kanbanDetail.js';

export function KanbanSubprocesses({ isInProduction, orderItems, canCompleteSubprocess, canRollbackSubprocess, openRollbackModal, openAuthModal }) {
  const tooltipId = useId()
  return (
    <KanbanDetailSection title="Subprocesos" icon="gear">
      {!isInProduction && (
        <div className={styles.stepperNotice}>
          <i className="bi bi-lock-fill" aria-hidden="true" />
          <span>Los subprocesos se habilitan cuando el pedido llega a En produccion.</span>
        </div>
      )}
      <div className={styles.stepperStack}>
        {orderItems.map((item) => {
          const firstPendingIndex = item.subProcesses.findIndex((process) => process.status !== 'done')
          const currentProcessIndex = firstPendingIndex < 0 ? item.subProcesses.length : firstPendingIndex
          const lanyardProgress = getLanyardProgress(item)

          return (
            <article className={styles.stepperGroup} key={item.id}>
              <div className={styles.stepperGroupHeader}>
                <h4>{item.product}</h4>
                {isLanyardItem(item) && (
                  <span className={styles.lanyardProgressBadge}>
                    <strong>{Math.round(lanyardProgress.percentage)}%</strong>
                    <small>{lanyardProgress.accumulatedQuantity} / {lanyardProgress.totalQuantity} lanyards</small>
                  </span>
                )}
              </div>
              <div className={styles.subProcessStepper}>
                {item.subProcesses.map((process, index) => {
                  const isDone = process.status === 'done'
                  const isCurrent = isInProduction && index === currentProcessIndex
                  const isPackagingBlocked = isLanyardPackagingBlocked(item, process)
                  const isLocked = !canCompleteSubprocess || !isInProduction || (!isDone && !isCurrent) || isPackagingBlocked
                  const canRollback = canRollbackSubprocess && isInProduction && isDone && index === currentProcessIndex - 1

                  return (
                    <div
                      aria-current={isCurrent ? 'step' : undefined}
                      className={[
                        styles.subProcessStep,
                        isDone ? styles.subProcessDone : '',
                        isCurrent ? styles.subProcessCurrent : '',
                        isLocked ? styles.subProcessLocked : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      key={process.id}
                    >
                      <OverlayTrigger placement="right" trigger={['hover', 'focus']} overlay={
                        <Tooltip id={tooltipId + '-' + item.id + '-' + process.id}>
                          {canRollback ? 'Retroceder subproceso' : 'Marcar como completo'}
                        </Tooltip>
                      }>
                        <button className={styles.subProcessMarker}
                          aria-label={(canRollback ? 'Retroceder subproceso' : isDone ? 'Completado' : 'Marcar como completo') + ': ' + process.name}
                          disabled={!canRollback && (isLocked || isDone)}
                          onClick={() => canRollback ? openRollbackModal(item, process) : openAuthModal(item, process, index, currentProcessIndex)}
                          type="button">
                          {isDone ? <i className="bi bi-check-lg" aria-hidden="true" /> : index + 1}
                        </button>
                      </OverlayTrigger>
                      <span className={styles.subProcessContent}>
                        <span>{process.name}</span>
                        <strong>
                          {isDone
                            ? formatStatus(process.status)
                          : isPackagingBlocked
                            ? 'Bloqueado hasta 100%'
                            : isCurrent && isInProduction
                              ? 'En curso'
                              : 'Bloqueado'}
                        </strong>
                      </span>
                    </div>
                  )
                })}
              </div>
            </article>
          )
        })}
      </div>
    </KanbanDetailSection>
  )
}

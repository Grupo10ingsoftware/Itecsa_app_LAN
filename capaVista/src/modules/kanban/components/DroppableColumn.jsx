import { useDroppable } from '@dnd-kit/react';
import { useId } from 'react';
import { OverlayTrigger, Tooltip } from 'react-bootstrap';
import styles from '../styles/Kanban.module.css';

export function DroppableColumn({ id, accent, icon, count, children, allCollapsed = false, onToggleExpansion }) {
  const { ref } = useDroppable({ id })
  const tooltipId = useId()
  const action = allCollapsed ? 'Expandir' : 'Contraer'

  return (
    <section className={styles.column} ref={ref} style={{ '--kanban-accent': accent }}>
      <header className={styles.columnHeader}>
        <div className={styles.columnTitleGroup}>
          <i className={`bi ${icon}`} aria-hidden="true" />
          <h2>{id}</h2>
        </div>
        <div className={styles.columnHeaderActions}>
          <span className={styles.columnCount}>{count}</span>
          {onToggleExpansion && <OverlayTrigger placement="bottom" trigger={['hover', 'focus']}
            overlay={<Tooltip id={tooltipId}>{action}</Tooltip>}>
            <button type="button" className={styles.columnExpandButton} disabled={count === 0}
              aria-label={`${action} pedidos de ${id}`}
              onClick={event => { event.stopPropagation(); onToggleExpansion() }}>
              <i className={`bi bi-chevron-${allCollapsed ? 'down' : 'up'}`} aria-hidden="true" />
            </button>
          </OverlayTrigger>}
        </div>
      </header>

      <div className={styles.columnBody}>{children}</div>
    </section>
  )
}

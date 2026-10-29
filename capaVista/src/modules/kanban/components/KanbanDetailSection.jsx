import { useId, useState } from 'react'
import styles from '../styles/Kanban.module.css'

export function KanbanDetailSection({ title, icon, count, children }) {
  const id = useId()
  const [expanded, setExpanded] = useState(true)
  return (
    <section className={styles.detailAccordion}>
      <h3>
        <button type="button" id={`${id}-heading`} className={styles.detailToggle}
          aria-expanded={expanded} aria-controls={`${id}-content`}
          onClick={() => setExpanded(value => !value)}>
          <i className={`bi bi-${icon}`} aria-hidden="true" />
          <span>{title}</span>
          {count !== undefined && <> <span className={styles.detailCount}>{count}</span></>}
          <i className={`bi bi-chevron-${expanded ? 'up' : 'down'} ${styles.detailChevron}`} aria-hidden="true" />
        </button>
      </h3>
      <div id={`${id}-content`} aria-labelledby={`${id}-heading`} hidden={!expanded} className={styles.detailContent}>
        {children}
      </div>
    </section>
  )
}

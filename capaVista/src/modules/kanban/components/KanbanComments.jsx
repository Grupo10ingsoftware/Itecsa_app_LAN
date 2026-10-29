import { useId, useState } from 'react'
import styles from '../styles/Kanban.module.css'
import { formatCommentDate } from '../utils/kanbanDetail.js'
import { KanbanDetailSection } from './KanbanDetailSection'

const categories = [
  { key: 'source', label: 'Observaciones de Manager', short: 'Manager', empty: 'Esta produccion no tenia observaciones asociadas.' },
  { key: 'subprocesses', label: 'Comentarios de subprocesos', short: 'Subprocesos', empty: 'Sin comentarios de subprocesos.' },
  { key: 'system', label: 'Observaciones del sistema', short: 'Sistema', empty: 'Sin observaciones del sistema.' },
]

// Sort a copy for display; invalid or absent timestamps follow dated records.
function newestFirst(comments) {
  const timestamp = value => {
    const parsed = value ? new Date(value).getTime() : NaN
    return Number.isFinite(parsed) ? parsed : -Infinity
  }
  return [...comments].sort((left, right) => timestamp(right.createdAt) - timestamp(left.createdAt))
}

export function KanbanComments({ commentGroups }) {
  const id = useId()
  const [active, setActive] = useState('source')
  function navigate(event, index) {
    let next
    if (event.key === 'ArrowRight') next = (index + 1) % categories.length
    if (event.key === 'ArrowLeft') next = (index + categories.length - 1) % categories.length
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = categories.length - 1
    if (next === undefined) return
    event.preventDefault()
    setActive(categories[next].key)
    document.getElementById(`${id}-${categories[next].key}-tab`)?.focus()
  }
  return (
    <KanbanDetailSection title="Comentarios" icon="chat-left-dots" count={categories.reduce((total, { key }) => total + commentGroups[key].length, 0)}>
      <div className={styles.commentTabs} role="tablist" aria-label="Categorías de comentarios">
        {categories.map(({ key, label, short }, index) => (
          <button key={key} type="button" role="tab" id={`${id}-${key}-tab`}
            aria-label={label} aria-selected={active === key} aria-controls={`${id}-${key}-panel`}
            tabIndex={active === key ? 0 : -1} onClick={() => setActive(key)} onKeyDown={event => navigate(event, index)}>
            {short} <span>({commentGroups[key].length})</span>
          </button>
        ))}
      </div>
      {categories.map(({ key, empty, short }) => (
        <div key={key} role="tabpanel" id={`${id}-${key}-panel`} aria-labelledby={`${id}-${key}-tab`} hidden={active !== key} tabIndex={0}>
          <ul className={styles.detailComments}>
            {newestFirst(commentGroups[key]).map(item => (
              <li key={item.id}>
                <i className={key === 'system' ? 'bi bi-clock-history' : 'bi bi-chat-left-text'} aria-hidden="true" />
                <div>
                  <strong>{short}</strong>
                  {key === 'subprocesses' && <strong>{item.subprocessName}</strong>}
                  <time>{formatCommentDate(item.createdAt)}</time>
                  <p>{item.text}</p>
                </div>
              </li>
            ))}
            {commentGroups[key].length === 0 && <li className={styles.emptyComment}>{empty}</li>}
          </ul>
        </div>
      ))}
    </KanbanDetailSection>
  )
}

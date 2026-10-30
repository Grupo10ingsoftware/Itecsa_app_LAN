import styles from '../pages/MetricsPage.module.css'

// Scaling changes only the drawing; labels always show the API's actual counts.
export default function MetricsBarChart({ items, label, unit }) {
  const maximum = items.reduce((max, item) => Math.max(max, Number(item.value)), 0)
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(1, maximum / 4)))
  const step = Math.max(1, Math.ceil(maximum / 4 / magnitude) * magnitude)
  const ceiling = step * 4
  return <div className={styles.barChart}>
    <div className={styles.chartAxis} aria-hidden="true">
      {[4, 3, 2, 1, 0].map(tick => <span key={tick}>{(tick * step).toLocaleString('es-CL')}</span>)}
    </div>
    <div className={styles.chartScroll} role="region" aria-label={label} tabIndex={0}>
      <ul className={styles.chartColumns} style={{ '--chart-columns': items.length }}>
        {items.map(item => <li className={styles.chartColumn} key={item.label}>
          <div className={styles.barArea}>
              <div
              className={`${styles.verticalBar} ${styles[item.tone] ?? ''}`}
              style={{
                height: `${Number(item.value) / ceiling * 100}%`,
                ...(item.color ? { backgroundColor: item.color, '--bar-color': item.color } : {}),
              }}
            >
              <strong className={styles.barValue}>{Number(item.value).toLocaleString('es-CL')}<span className={styles.visuallyHidden}> {unit}</span></strong>
            </div>
          </div>
          <span className={styles.barLabel}>{item.label}</span>
        </li>)}
      </ul>
    </div>
  </div>
}

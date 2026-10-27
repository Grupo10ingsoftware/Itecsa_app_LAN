import styles from './PageShell.module.css'

export default function PageHeader({ title, titleId, actions, children }) {
  return (
    <div className={styles.headerContainer} data-page-header-container="">
      <header className={styles.header} data-page-header="">
        <div className={styles.heading}>
          <h1 className={styles.title} id={titleId}>{title}</h1>
          {children && <div className={styles.details}>{children}</div>}
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </header>
    </div>
  )
}

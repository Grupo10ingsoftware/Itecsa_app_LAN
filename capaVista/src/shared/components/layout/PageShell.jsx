import styles from './PageShell.module.css'

export default function PageShell({ children, className = '', maxWidth, ...props }) {
  return (
    <div className={`${styles.shell} ${className}`} style={maxWidth ? { '--page-max-width': maxWidth } : undefined} {...props}>
      <div className={styles.frame}>{children}</div>
    </div>
  )
}

export function PageSurface({ children, className = '', ...props }) {
  return <section className={`${styles.surface} ${className}`} {...props}>{children}</section>
}

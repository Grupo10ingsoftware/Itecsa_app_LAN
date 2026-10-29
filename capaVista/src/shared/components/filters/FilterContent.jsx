import styles from './Filters.module.css'

export default function FilterContent({ children }) {
  return <div className={styles.content}>{children}</div>
}

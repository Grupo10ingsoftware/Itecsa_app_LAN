import { getOrderStagePresentation } from '../../../shared/orderStagePresentation'
import styles from './OrderHistoryStatusBadge.module.css'

export default function OrderHistoryStatusBadge({ status }) {
  const label = status || 'Sin estado'
  let tone = getOrderStagePresentation(label).token
  if (tone === 'unknown') {
    const normalized = label.trim().toLowerCase()
    if (normalized === 'terminado') tone = 'finished'
    if (normalized === 'cancelado') tone = 'review'
  }
  return <span className={styles.badge} data-tone={tone}>{label}</span>
}

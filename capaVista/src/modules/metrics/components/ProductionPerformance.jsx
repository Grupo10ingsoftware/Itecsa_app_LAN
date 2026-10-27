import LoadingIndicator, { LoadingAction } from '../../../shared/components/loading/LoadingIndicator'
import { useEffect, useRef, useState } from 'react'
import styles from '../pages/MetricsPage.module.css'
import { getMetricsScope } from '../utils/metricsPage'

export function PerformanceResult({ report }) {
  if (!report.totalOrders) return <p role="status" className={styles.emptyState}>No existen datos disponibles para generar el reporte en el período seleccionado.</p>
  return <div role="status">
    <p>Período: {report.period.from} al {report.period.to}. Pedidos: {report.totalOrders}.</p>
    <dl className={styles.performanceCounts}>
      <div><dt>Pedidos entregados a tiempo</dt><dd>{report.deliveredOnTime}</dd></div>
      <div><dt>Pedidos entregados fuera del plazo solicitado</dt><dd>{report.deliveredLate}</dd></div>
    </dl>
    {report.missingDeadline > 0 && <p>Sin plazo solicitado: {report.missingDeadline}. Estos pedidos no se incluyen en las dos categorías.</p>}
  </div>
}

export default function ProductionPerformance({ api, period }) {
  return <PerformanceRequest key={`${getMetricsScope(api)}|${period.from}|${period.to}`} api={api} period={period} />
}

function PerformanceRequest({ api, period }) {
  const [open, setOpen] = useState(false)
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const active = useRef(false)
  const pending = useRef(false)
  const controller = useRef(null)
  useEffect(() => {
    active.current = true
    return () => { active.current = false; controller.current?.abort() }
  }, [])

  async function generate() {
    if (pending.current) return
    pending.current = true
    setLoading(true)
    setReport(null)
    setError('')
    controller.current = new AbortController()
    try {
      const result = await api.getProductionPerformance({ ...period, signal: controller.current.signal })
      if (active.current) setReport(result)
    } catch (requestError) {
      if (active.current) setError(requestError?.payload?.message ?? 'No fue posible generar el reporte. Inténtalo nuevamente.')
    } finally {
      pending.current = false
      if (active.current) setLoading(false)
    }
  }

  return <section className={styles.dwellSection} aria-labelledby="performance-title">
    <button type="button" className={styles.dwellToggle} aria-expanded={open} aria-controls="performance-content" onClick={() => setOpen((value) => !value)}>
      <span><strong id="performance-title">Rendimiento de producción</strong><small>Cumplimiento de los plazos solicitados de los pedidos.</small></span>
      <i className={`bi ${open ? 'bi-chevron-up' : 'bi-chevron-down'}`} aria-hidden="true" />
    </button>
    <div id="performance-content" hidden={!open} className={styles.sellerContent}>
      <button type="button" className={styles.generateButton} disabled={loading || !period.from || !period.to || period.from > period.to} onClick={generate} aria-busy={loading}>
        <LoadingAction busy={loading} announce={false} context="Generar reporte">Generar reporte</LoadingAction>
      </button>
      {loading && <LoadingIndicator context="Procesando pedidos" />}
      {error && <p role="alert">{error}</p>}
      {report && <PerformanceResult report={report} />}
    </div>
  </section>
}

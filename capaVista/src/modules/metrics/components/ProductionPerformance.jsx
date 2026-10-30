import LoadingIndicator, { LoadingAction } from '../../../shared/components/loading/LoadingIndicator'
import { useEffect, useRef, useState } from 'react'
import MetricsBarChart from './MetricsBarChart'
import styles from '../pages/MetricsPage.module.css'
import { getMetricsScope } from '../utils/metricsPage'

export function PerformanceResult({ report }) {
  if (!report.totalOrders) return <p role="status" className={styles.emptyState}>No existen datos disponibles para generar el reporte en el período seleccionado.</p>
  return <div role="status">
    <p className={styles.reportPeriod}>Período: {report.period.from} al {report.period.to}. Pedidos: {report.totalOrders}.</p>
    <MetricsBarChart label="Pedidos por cumplimiento del plazo" unit="pedidos" items={[
      { label: 'A tiempo', value: report.deliveredOnTime, tone: 'onTime' },
      { label: 'Fuera de plazo', value: report.deliveredLate },
      { label: 'sin fecha definida', value: report.missingDeadline, tone: 'noDeadline' },
    ]} />
  </div>
}

export default function ProductionPerformance({ api, period }) {
  return <PerformanceRequest key={`${getMetricsScope(api)}|${period.from}|${period.to}`} api={api} period={period} />
}

function PerformanceRequest({ api, period }) {
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
    <header className={styles.performanceHeader}>
      <div><h2 id="performance-title">Rendimiento de producción</h2><p>Cumplimiento de los plazos solicitados de los pedidos.</p></div>
      <button type="button" className={styles.generateButton} disabled={loading || !period.from || !period.to || period.from > period.to} onClick={generate} aria-busy={loading}>
        <LoadingAction busy={loading} announce={false} context="Generar reporte">Generar reporte</LoadingAction>
      </button>
    </header>
    <div className={styles.performanceContent}>
      {!report && !loading && !error }
      {loading && <LoadingIndicator context="Procesando pedidos" />}
      {error && <p role="alert">{error}</p>}
      {report && <PerformanceResult report={report} />}
    </div>
  </section>
}

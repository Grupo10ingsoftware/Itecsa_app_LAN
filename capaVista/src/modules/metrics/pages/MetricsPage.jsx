import LoadingIndicator from '../../../shared/components/loading/LoadingIndicator'
import { useEffect, useMemo, useState } from 'react'
import { useMetricsApi } from '../hooks/useMetricsApi'
import ProductionPerformance from '../components/ProductionPerformance'
import MetricsBarChart from '../components/MetricsBarChart'
import SellerTable from '../components/SellerTable'
import {
  createInitialPeriod,
  EMPTY_METRICS_SUMMARY,
  getPeriodQuery,
  subscribeMetricsSummary,
  getMetricsScope,
  getProductTypeColor,
} from '../utils/metricsPage'
import styles from './MetricsPage.module.css'
import PageShell, { PageSurface } from '../../../shared/components/layout/PageShell'
import PageHeader from '../../../shared/components/layout/PageHeader'
import { buildSellerReport } from '../utils/reportFormatting'

function formatDuration(seconds) {
  const totalMinutes = Math.round(Number(seconds ?? 0) / 60)
  if (totalMinutes < 60) return `${totalMinutes} min`
  const hours = totalMinutes / 60
  if (hours < 24) return `${hours.toFixed(1)} h`
  return `${(hours / 24).toFixed(1)} días`
}

export default function MetricsPage() {
  const api = useMetricsApi()
  return <MetricsContent key={getMetricsScope(api)} api={api} />
}

export function MetricsContent({ api }) {
  const [period, setPeriod] = useState(createInitialPeriod)
  const [requestVersion, setRequestVersion] = useState(0)
  const [requestResult, setRequestResult] = useState({
    requestKey: '',
    summary: EMPTY_METRICS_SUMMARY,
    error: '',
  })
  const [isDwellOpen, setIsDwellOpen] = useState(false)
  const [selectedSubprocessProduct, setSelectedSubprocessProduct] = useState('all')
  const [isSellerOpen, setIsSellerOpen] = useState(false)
  const [isExportOpen, setIsExportOpen] = useState(false)
  const periodQuery = useMemo(() => getPeriodQuery(period), [period])
  const {
    from: queryFrom,
    to: queryTo,
    queryKey,
    validationMessage,
  } = periodQuery
  const canQuery = Boolean(queryKey)
  const requestKey = `${queryKey}|${requestVersion}`
  const loading = canQuery && requestResult.requestKey !== requestKey
  const error = requestResult.requestKey === requestKey ? requestResult.error : ''
  const summary = requestResult.requestKey === requestKey
    ? requestResult.summary
    : EMPTY_METRICS_SUMMARY

  useEffect(() => {
    if (!canQuery) return undefined

    return subscribeMetricsSummary({
      api,
      from: queryFrom,
      to: queryTo,
      onSuccess: (result) => setRequestResult({ requestKey, summary: result, error: '' }),
      onError: (requestError) => setRequestResult({
        requestKey,
        summary: EMPTY_METRICS_SUMMARY,
        error: requestError?.payload?.message ?? 'No fue posible cargar las métricas.',
      }),
    })
  }, [api, canQuery, queryFrom, requestKey, queryTo])

  const dwellGroups = [
    { key: 'stages', title: 'Etapas generales', items: summary.dwellTime?.stages ?? [] },
    { key: 'subprocesses', title: 'Subprocesos', items: summary.dwellTime?.subprocesses ?? [] },
  ]
  const subprocessProducts = [...new Set((summary.dwellTime?.subprocesses ?? []).map((item) => item.productType).filter(Boolean))].sort()
  const activeSubprocessProduct = subprocessProducts.includes(selectedSubprocessProduct)
    ? selectedSubprocessProduct
    : 'all'
  const visibleSubprocesses = activeSubprocessProduct === 'all'
    ? summary.dwellTime?.subprocesses ?? []
    : (summary.dwellTime?.subprocesses ?? []).filter((item) => item.productType === activeSubprocessProduct)

  function updatePeriod(name, value) {
    setSelectedSubprocessProduct('all')
    const nextPeriod = { ...period, [name]: value }
    if (getPeriodQuery(nextPeriod).queryKey !== queryKey) setRequestVersion((current) => current + 1)
    setPeriod(nextPeriod)
  }

  function exportReport(format) {
    const rows = summary.sellerCompliance ?? []
    if (format === 'pdf') {
      const reportWindow = window.open('', '_blank')
      if (!reportWindow) return
      reportWindow.document.write(buildSellerReport(rows, format, queryFrom, queryTo))
      reportWindow.document.close()
      reportWindow.print()
      return
    }

    const blob = new Blob([buildSellerReport(rows, format, queryFrom, queryTo)], { type: format === 'excel' ? 'application/vnd.ms-excel' : 'text/csv;charset=utf-8' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `reporte-cumplimiento-${queryFrom}-${queryTo}.${format === 'excel' ? 'xls' : 'csv'}`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  return <PageShell className={styles.page}>
    <PageSurface className={styles.dashboardShell}>
      <PageHeader title="Métricas" />
      <div className={styles.content}>
        <section className={styles.periodFilters} aria-label="Periodo de métricas">
          <div className={styles.periodModes}>
            <button aria-pressed={period.mode === 'month'} className={period.mode === 'month' ? styles.activeMode : ''} onClick={() => updatePeriod('mode', 'month')} type="button">Mes específico</button>
            <button aria-pressed={period.mode === 'range'} className={period.mode === 'range' ? styles.activeMode : ''} onClick={() => updatePeriod('mode', 'range')} type="button">Rango de fechas</button>
          </div>
          {period.mode === 'month' ? <label><span>Mes</span><input onChange={(event) => updatePeriod('month', event.target.value)} type="month" value={period.month} /></label> : <><label><span>Desde</span><input onChange={(event) => updatePeriod('from', event.target.value)} type="date" value={period.from} /></label><label><span>Hasta</span><input min={period.from || undefined} onChange={(event) => updatePeriod('to', event.target.value)} type="date" value={period.to} /></label></>}
        </section>

        {loading ? <LoadingIndicator scope="page" context="Dashboard de métricas" /> : <div className={styles.topGrid}>
          {!canQuery ? <div className={styles.emptyState} role="status">{validationMessage}</div> : error ? <div className={styles.emptyState} role="alert"><p>{error}</p><button className={styles.generateButton} onClick={() => setRequestVersion((current) => current + 1)} type="button">Reintentar</button></div> : <section className={styles.productionSection} aria-labelledby="production-title">
            <header className={styles.productionHeader}><div><h2 id="production-title">Cantidad de producción generada</h2><p>Unidades producidas agrupadas por tipo de producto.</p></div></header>
            <p className={styles.chartTotal}>Total producido <strong>{Number(summary.production.total).toLocaleString('es-CL')}</strong> unidades</p>
            {summary.production.products.length === 0 ? <p className={styles.emptyState} role="status">No hay producción registrada.</p> : <MetricsBarChart
              label="Unidades producidas por producto" unit="unidades"
              items={summary.production.products.map(item => ({ label: item.productType, value: item.quantity, color: getProductTypeColor(item.productType) }))}
            />}
          </section>}
          {canQuery && <ProductionPerformance key={queryKey} api={api} period={{ from: queryFrom, to: queryTo }} />}
        </div>}
        {canQuery && !loading && !error && <>

          <section className={styles.dwellSection} aria-labelledby="dwell-title">
            <button
              aria-controls="dwell-content"
              aria-expanded={isDwellOpen}
              className={styles.dwellToggle}
              onClick={() => setIsDwellOpen((current) => !current)}
              type="button"
            >
              <span>
                <strong id="dwell-title">Estadía por estado o subproceso</strong>
                <small>Promedio de tiempo registrado dentro del periodo seleccionado.</small>
              </span>
              <i className={`bi ${isDwellOpen ? 'bi-chevron-up' : 'bi-chevron-down'}`} aria-hidden="true" />
            </button>
            {isDwellOpen && (
              <div className={styles.dwellPanels} id="dwell-content">
                {dwellGroups.map((group) => {
                  const items = group.key === 'subprocesses' ? visibleSubprocesses : group.items
                  const maxDwell = items.reduce((maximum, item) => Math.max(maximum, Number(item.averageSeconds)), 1)

                  return <article className={styles.dwellPanel} key={group.key}>
                    <header className={styles.dwellPanelHeader}>
                      <h3>{group.title}</h3>
                      {group.key === 'subprocesses' ? <label className={styles.productSelector}><span className={styles.visuallyHidden}>Producto</span><select onChange={(event) => setSelectedSubprocessProduct(event.target.value)} value={activeSubprocessProduct}><option value="all">Todos los productos</option>{subprocessProducts.map((product) => <option key={product} value={product}>{product}</option>)}</select></label> : <span>{items.length} indicadores</span>}
                    </header>
                    {items.length === 0 ? <p className={styles.emptyState}>Sin registros para este producto.</p> : <div className={styles.dwellChart}>{items.map((item) => <div className={styles.dwellRow} key={`${group.key}-${item.productType ?? 'all'}-${item.name}`}><div className={styles.dwellLabel}><span>{item.name}</span><small>{item.productType ? `${item.productType} · ` : ''}{item.sampleSize} registros</small></div><div className={styles.dwellTrack}><span className={styles.dwellBar} style={{ width: `${(item.averageSeconds / maxDwell) * 100}%` }} /></div><strong>{formatDuration(item.averageSeconds)}</strong></div>)}</div>}
                  </article>
                })}
              </div>
            )}
          </section>


          <section className={styles.sellerSection} aria-labelledby="seller-title">
            <button aria-controls="seller-content" aria-expanded={isSellerOpen} className={styles.dwellToggle} onClick={() => setIsSellerOpen((current) => !current)} type="button">
              <span><strong id="seller-title">Cumplimiento por vendedor</strong><small>Consulta y exporta la lista del periodo seleccionado.</small></span>
              <i className={`bi ${isSellerOpen ? 'bi-chevron-up' : 'bi-chevron-down'}`} aria-hidden="true" />
            </button>
            {isSellerOpen && <div className={styles.sellerContent} id="seller-content">
              <SellerTable key={requestKey} rows={summary.sellerCompliance ?? []} exportActions={
                <div className={styles.exportMenu} onKeyDown={event => { if (event.key === 'Escape') setIsExportOpen(false) }}>
                  <button aria-expanded={isExportOpen} aria-controls="seller-export-options" className={styles.generateButton} onClick={() => setIsExportOpen((current) => !current)} type="button"><i className="bi bi-download" aria-hidden="true" />Exportar</button>
                  {isExportOpen && <div id="seller-export-options" className={styles.exportOptions}><button onClick={() => exportReport('csv')} type="button">CSV</button><button onClick={() => exportReport('excel')} type="button">Excel</button><button onClick={() => exportReport('pdf')} type="button">PDF</button></div>}
                </div>
              } />
            </div>}
          </section>

        </>}
      </div>
    </PageSurface>
  </PageShell>
}

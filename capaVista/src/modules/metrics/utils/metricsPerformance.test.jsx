import { StrictMode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { subscribeMetricsSummary, buildProductionChart, getPeriodQuery } from './metricsPage'
import { buildSellerReport, spreadsheetCell } from './reportFormatting'
import { beforeSellerReport } from './fixtures/export.before'
import { buildProductionChart as beforeChart } from './fixtures/chart.before'
import { createMetricsApi } from '../api/metricsApi'
import ProductionPerformance from '../components/ProductionPerformance'
import MetricsPage from '../pages/MetricsPage'

const session = vi.hoisted(() => ({ api: null }))
vi.mock('../hooks/useMetricsApi', () => ({ useMetricsApi: () => session.api }))
afterEach(() => { cleanup(); vi.restoreAllMocks() })
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const summary = (name = 'Lanyard') => ({ production: { total: 2, products: [{ productType: name, quantity: 2 }] }, dwellTime: { stages: [], subprocesses: [] }, sellerCompliance: [{ seller: '=Ana,<script>', salesNotes: 1, deliveredOnTime: 1, deliveredLate: 0, enteredDuringHighLoad: 0 }] })
const period = { from: '2024-09-01', to: '2024-09-30' }

it('forwards AbortSignal on both API reads without putting it in the URL', async () => {
 const get = vi.fn().mockResolvedValue({}), signal = new AbortController().signal
 const api = createMetricsApi({ get })
 await api.getSummary({ ...period, signal }); await api.getProductionPerformance({ ...period, signal })
 expect(get.mock.calls).toEqual([['/metrics/summary?from=2024-09-01&to=2024-09-30', { signal }], ['/metrics/production-performance?from=2024-09-01&to=2024-09-30', { signal }]])
})

it('deduplicates in-flight identical subscriptions, cancels only after last subscriber, and never caches completed results', async () => {
 const request = deferred(), api = { getSummary: vi.fn(() => request.promise) }, a = vi.fn(), b = vi.fn()
 const stopA = subscribeMetricsSummary({ api, ...period, onSuccess: a, onError: vi.fn() })
 const stopB = subscribeMetricsSummary({ api, ...period, onSuccess: b, onError: vi.fn() })
 await Promise.resolve(); expect(api.getSummary).toHaveBeenCalledTimes(1)
 stopA(); await Promise.resolve(); expect(api.getSummary.mock.calls[0][0].signal.aborted).toBe(false)
 request.resolve(summary()); await Promise.resolve(); expect(a).not.toHaveBeenCalled(); expect(b).toHaveBeenCalledTimes(1)
 stopB(); await Promise.resolve()
 const stopC = subscribeMetricsSummary({ api, ...period, onSuccess: vi.fn(), onError: vi.fn() }); await Promise.resolve()
 expect(api.getSummary).toHaveBeenCalledTimes(2); stopC()
})

it('aborts abandoned reads and ignores late success and wrapped abort error', async () => {
 for (const fail of [false, true]) {
  const request = deferred(), api = { getSummary: vi.fn(() => request.promise) }, onSuccess = vi.fn(), onError = vi.fn()
  const stop = subscribeMetricsSummary({ api, ...period, onSuccess, onError }); await Promise.resolve(); stop(); await Promise.resolve()
  expect(api.getSummary.mock.calls[0][0].signal.aborted).toBe(true)
  if (fail) request.reject(Error('wrapped abort')); else request.resolve(summary())
  await Promise.resolve(); expect(onSuccess).not.toHaveBeenCalled(); expect(onError).not.toHaveBeenCalled()
 }
})

it('initial StrictMode mounts issue one summary and local group interactions issue no reads', async () => {
 session.api = { getSummary: vi.fn().mockResolvedValue(summary()), getProductionPerformance: vi.fn() }
 render(<StrictMode><MetricsPage /></StrictMode>)
 await screen.findByText('Lanyard')
 fireEvent.click(screen.getByRole('button', { name: /Estadía por estado/ })); fireEvent.click(screen.getByRole('button', { name: 'Generar lista' }))
 expect(session.api.getSummary).toHaveBeenCalledTimes(1); expect(session.api.getProductionPerformance).not.toHaveBeenCalled()
})

it('rapid periods abort previous reads, reject stale results and keep invalid ranges local', async () => {
 const old = deferred(), next = deferred()
 session.api = { getSummary: vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise) }
 render(<MetricsPage />); await waitFor(() => expect(session.api.getSummary).toHaveBeenCalledTimes(1))
 fireEvent.change(screen.getByLabelText('Mes'), { target: { value: '2024-09' } })
 await waitFor(() => expect(session.api.getSummary).toHaveBeenCalledTimes(2))
 expect(session.api.getSummary.mock.calls[0][0].signal.aborted).toBe(true)
 await act(async () => next.resolve(summary('Septiembre'))); await act(async () => old.resolve(summary('Anterior')))
 expect(screen.queryByText('Anterior')).toBeNull(); expect(screen.getByText('Septiembre')).toBeTruthy()
 fireEvent.click(screen.getByRole('button', { name: 'Rango de fechas' })); expect(screen.queryByText('Septiembre')).toBeNull()
 expect(session.api.getSummary).toHaveBeenCalledTimes(2)
})

it('API/session change removes summary and export data immediately and aborts old reads', async () => {
 const request = deferred(), first = { getSummary: vi.fn().mockResolvedValue(summary('Privado')) }
 session.api = first; const view = render(<MetricsPage />); await screen.findByText('Privado')
 session.api = { getSummary: vi.fn(() => request.promise) }; view.rerender(<MetricsPage />)
 expect(screen.queryByText('Privado')).toBeNull(); expect(screen.queryByRole('button', { name: 'Exportar' })).toBeNull()
 await act(async () => request.resolve(summary('Otra sesión'))); expect(screen.getByText('Otra sesión')).toBeTruthy()
})

it('returning to a loaded period hides its previous data and exports until the fresh read finishes', async () => {
 const next = deferred(), refresh = deferred()
 session.api = { getSummary: vi.fn().mockResolvedValueOnce(summary('Anterior')).mockReturnValueOnce(next.promise).mockReturnValueOnce(refresh.promise) }
 render(<MetricsPage />); await screen.findByText('Anterior')
 const initial = screen.getByLabelText('Mes').value
 fireEvent.click(screen.getByRole('button', { name: 'Generar lista' }))
 expect(screen.getByRole('button', { name: 'Exportar' })).toBeTruthy()
 fireEvent.change(screen.getByLabelText('Mes'), { target: { value: initial === '2024-09' ? '2024-10' : '2024-09' } })
 await waitFor(() => expect(session.api.getSummary).toHaveBeenCalledTimes(2))
 fireEvent.change(screen.getByLabelText('Mes'), { target: { value: initial } })
 expect(screen.queryByText('Anterior')).toBeNull()
 expect(screen.queryByRole('button', { name: 'Exportar' })).toBeNull()
 await waitFor(() => expect(session.api.getSummary).toHaveBeenCalledTimes(3))
 expect(session.api.getSummary.mock.calls[1][0].signal.aborted).toBe(true)
 await act(async () => next.resolve(summary('Otro período obsoleto')))
 expect(screen.queryByText('Otro período obsoleto')).toBeNull()
 await act(async () => refresh.resolve(summary('Actualizado')))
 expect(screen.getByText('Actualizado')).toBeTruthy()
 fireEvent.click(screen.getByRole('button', { name: 'Mes específico' }))
 expect(screen.getByText('Actualizado')).toBeTruthy()
 expect(session.api.getSummary).toHaveBeenCalledTimes(3)
})

it('summary errors stay visible and returning to a period performs a fresh read', async () => {
 session.api = { getSummary: vi.fn().mockRejectedValueOnce({ payload: { message: 'Error de red' } }).mockResolvedValue(summary()) }
 render(<MetricsPage />); expect((await screen.findByRole('alert')).textContent).toContain('Error de red')
 const initial = screen.getByLabelText('Mes').value
 fireEvent.change(screen.getByLabelText('Mes'), { target: { value: '2024-09' } }); await screen.findByText('Lanyard')
 fireEvent.change(screen.getByLabelText('Mes'), { target: { value: initial } }); await waitFor(() => expect(session.api.getSummary).toHaveBeenCalledTimes(3))
})

it('retries a failed summary once without changing period, then ignores it after a period change', async () => {
 const retry = deferred()
 session.api = { getSummary: vi.fn().mockRejectedValueOnce(Error('network')).mockReturnValueOnce(retry.promise).mockResolvedValue(summary('Nuevo período')), getProductionPerformance: vi.fn() }
 render(<StrictMode><MetricsPage /></StrictMode>)
 const button = await screen.findByRole('button', { name: 'Reintentar' })
 const initial = screen.getByLabelText('Mes').value
 fireEvent.click(button); fireEvent.click(button)
 await waitFor(() => expect(session.api.getSummary).toHaveBeenCalledTimes(2))
 expect(screen.getByLabelText('Mes').value).toBe(initial)
 expect(session.api.getSummary.mock.calls[1][0].from).toBe(session.api.getSummary.mock.calls[0][0].from)
 expect(screen.queryByRole('alert')).toBeNull()
 expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull()
 fireEvent.change(screen.getByLabelText('Mes'), { target: { value: initial === '2024-09' ? '2024-10' : '2024-09' } })
 await screen.findByText('Nuevo período')
 expect(session.api.getSummary.mock.calls[1][0].signal.aborted).toBe(true)
 await act(async () => retry.resolve(summary('Reintento obsoleto')))
 expect(screen.queryByText('Reintento obsoleto')).toBeNull()
 expect(session.api.getSummary).toHaveBeenCalledTimes(3)
 expect(session.api.getProductionPerformance).not.toHaveBeenCalled()
})

it('validates the existing inclusive 366-day limit locally and allows its boundary', async () => {
 session.api = { getSummary: vi.fn().mockResolvedValue(summary()) }
 render(<MetricsPage />); await screen.findByText('Lanyard')
 fireEvent.click(screen.getByRole('button', { name: 'Rango de fechas' }))
 fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2023-01-01' } })
 fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2024-01-02' } })
 expect(screen.getByRole('status').textContent).toContain('366 días')
 expect(session.api.getSummary).toHaveBeenCalledTimes(1)
 expect(screen.queryByRole('button', { name: /Rendimiento de producción/ })).toBeNull()
 fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2024-01-01' } })
 await screen.findByText('Lanyard')
 expect(session.api.getSummary).toHaveBeenCalledTimes(2)
 for (const [from, to] of [['2024-01-01', '2024-12-31'], ['2023-01-01', '2024-01-01']]) expect(getPeriodQuery({ mode: 'range', from, to }).queryKey).toBe(`${from}|${to}`)
 expect(getPeriodQuery({ mode: 'range', from: '2024-01-01', to: '2025-01-01' }).queryKey).toBe('')
})

it('manual report stays single-flight, cancels on period/API change, and ignores old data', async () => {
 const request = deferred(), api = { getProductionPerformance: vi.fn(() => request.promise) }
 const view = render(<ProductionPerformance api={api} period={period} />)
 fireEvent.click(screen.getByRole('button', { name: /Rendimiento de producción/ })); const button = screen.getByRole('button', { name: 'Generar reporte' })
 fireEvent.click(button); fireEvent.click(button); expect(api.getProductionPerformance).toHaveBeenCalledTimes(1)
 view.rerender(<ProductionPerformance api={api} period={{ from: '2024-10-01', to: '2024-10-31' }} />)
 expect(api.getProductionPerformance.mock.calls[0][0].signal.aborted).toBe(true)
 await act(async () => request.resolve({ period, totalOrders: 8, deliveredOnTime: 8, deliveredLate: 0 }))
 expect(screen.queryByText(/Pedidos: 8/)).toBeNull()
})

it('manual report permits explicit retry after errors and displays confirmed missing deadlines', async () => {
 const api = { getProductionPerformance: vi.fn().mockRejectedValueOnce(Error()).mockResolvedValue({ period, totalOrders: 2, deliveredOnTime: 1, deliveredLate: 0, missingDeadline: 1 }) }
 render(<ProductionPerformance api={api} period={period} />); fireEvent.click(screen.getByRole('button', { name: /Rendimiento de producción/ }))
 fireEvent.click(screen.getByRole('button', { name: 'Generar reporte' })); await screen.findByRole('alert')
 fireEvent.click(screen.getByRole('button', { name: 'Generar reporte' })); await screen.findByText(/Sin plazo solicitado: 1/)
 expect(api.getProductionPerformance).toHaveBeenCalledTimes(2)
})

it('chart is equivalent for 10000 categories without mutating input or dropping labels', () => {
 const products = Array.from({ length: 10000 }, (_, i) => ({ productType: `Producto ${i}`, quantity: i % 5 }))
 const input = { total: 20000, products }; const before = structuredClone(input)
 const chart = buildProductionChart(input, ['red', 'blue']); expect(input).toEqual(before); expect(chart.segments).toHaveLength(10000)
 expect(chart).toEqual(beforeChart(input, ['red', 'blue']))
 let end = 0
 products.forEach((p, i) => { const percentage = p.quantity / input.total * 100; expect(chart.segments[i]).toEqual({ ...p, percentage, start: end, end: end + percentage, color: i % 2 ? 'blue' : 'red' }); end += percentage })
})

it('periods keep leap year, year changes, invalid dates and reverse ranges', () => {
 expect(getPeriodQuery({ mode: 'month', month: '2024-02' }).to).toBe('2024-02-29')
 expect(getPeriodQuery({ mode: 'month', month: '2025-12' }).to).toBe('2025-12-31')
 for (const p of [{ mode: 'month', month: '2024-13' }, { mode: 'range', from: '2024-02-30', to: '2024-03-01' }, { mode: 'range', from: '2024-03-02', to: '2024-03-01' }]) expect(getPeriodQuery(p).queryKey).toBe('')
})

it('CSV and existing tabulated XLS preserve exact headers, BOM, columns, Unicode, escaping and empty output', () => {
 const rows = [{ seller: '=Ana,"ñ\n@', salesNotes: 2, deliveredOnTime: 1, deliveredLate: 0, enteredDuringHighLoad: 1 }]
 const headers = ['Vendedor', 'Notas de venta', 'Entregados a tiempo', 'Entregados fuera de plazo', 'Ingresados con carga alta']
 expect(buildSellerReport(rows, 'csv')).toBe('\ufeff' + headers.map(x => `"${x}"`).join(',') + '\n"\'=Ana,""ñ @","2","1","0","1"')
 expect(buildSellerReport(rows, 'excel')).toBe('\ufeff' + headers.join('\t') + '\n\'=Ana,"ñ @\t2\t1\t0\t1')
 expect(buildSellerReport([], 'csv')).toBe('\ufeff' + headers.map(x => `"${x}"`).join(','))
 for (const format of ['csv', 'excel', 'pdf']) expect(buildSellerReport(rows, format, '2024-01-01', '2024-01-31')).toBe(beforeSellerReport(rows, format, '2024-01-01', '2024-01-31'))
 for (const prefix of ['=', '+', '-', '@', '\t=', '\n+', '  @']) expect(spreadsheetCell(prefix + 'cmd')).toMatch(/^'/)
})

it('print HTML escapes dynamic content and preserves all rows, dates and headings', () => {
 const html = buildSellerReport(summary().sellerCompliance, 'pdf', '<2024>', '&2025')
 expect(html).toContain('&lt;script&gt;'); expect(html).not.toContain('<script>'); expect(html).toContain('Periodo: &lt;2024&gt; a &amp;2025'); expect(html.match(/<tr>/g)).toHaveLength(2)
})

it('downloads and print use loaded data without new HTTP; blocked popup is safe', async () => {
 session.api = { getSummary: vi.fn().mockResolvedValue(summary()) }
 const create = vi.fn(() => 'blob:fixture'), revoke = vi.fn()
 vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }))
 const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
 const open = vi.spyOn(window, 'open').mockReturnValue(null)
 render(<MetricsPage />); await screen.findByText('Lanyard'); fireEvent.click(screen.getByRole('button', { name: 'Generar lista' })); fireEvent.click(screen.getByRole('button', { name: 'Exportar' }))
 fireEvent.click(screen.getByRole('button', { name: 'CSV' })); expect(click).toHaveBeenCalledTimes(1); expect(revoke).toHaveBeenCalledWith('blob:fixture')
 fireEvent.click(screen.getByRole('button', { name: 'Excel' })); expect(create.mock.calls[1][0].type).toBe('application/vnd.ms-excel')
 fireEvent.click(screen.getByRole('button', { name: 'PDF' })); expect(open).toHaveBeenCalledTimes(1)
 const popup = { document: { write: vi.fn(), close: vi.fn() }, print: vi.fn() }; open.mockReturnValue(popup)
 fireEvent.click(screen.getByRole('button', { name: 'PDF' })); expect(popup.document.write).toHaveBeenCalledWith(expect.stringContaining('&lt;script&gt;')); expect(popup.print).toHaveBeenCalledTimes(1)
 expect(session.api.getSummary).toHaveBeenCalledTimes(1)
})

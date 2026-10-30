import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MetricsContent } from '../pages/MetricsPage'
import { PerformanceResult } from '../components/ProductionPerformance'

afterEach(() => { cleanup(); vi.restoreAllMocks() })
const period = { from: '2024-02-01', to: '2024-02-29' }
const sellers = Array.from({ length: 13 }, (_, index) => ({ seller: index === 12 ? 'Ángela <script>' : `Vendedor ${index + 1}`, salesNotes: index + 1, deliveredOnTime: index, deliveredLate: 0, enteredDuringHighLoad: 0 }))
const summary = {
  production: { total: 15, products: [{ productType: 'Nuevo producto', quantity: 10 }, { productType: 'Otro', quantity: 5 }, { productType: 'Cero', quantity: 0 }] },
  dwellTime: {
    stages: [{ name: 'En producción', averageSeconds: 86400, sampleSize: 3 }, { name: 'En revisión', averageSeconds: 43200, sampleSize: 2 }],
    subprocesses: [{ name: 'Corte', productType: 'Nuevo producto', averageSeconds: 3600, sampleSize: 2 }, { name: 'Armado', productType: 'Otro', averageSeconds: 0, sampleSize: 1 }],
  },
  sellerCompliance: sellers,
}
const apiFor = (value = summary) => ({ getSummary: vi.fn().mockResolvedValue(value), getProductionPerformance: vi.fn().mockResolvedValue({ period, totalOrders: 5, deliveredOnTime: 2, deliveredLate: 1, missingDeadline: 2 }) })

it('shows a single page loading state before any dashboard card and on period changes', async () => {
  let resolve
  const api = apiFor()
  api.getSummary.mockImplementation(() => new Promise(done => { resolve = done }))
  render(<MetricsContent api={api} />)
  await act(async () => {})
  expect(screen.getAllByRole('status')).toHaveLength(1)
  expect(screen.getByRole('status').dataset.scope).toBe('page')
  expect(screen.queryByRole('button', { name: 'Generar reporte' })).toBeNull()
  expect(screen.queryByRole('heading', { name: 'Cantidad de producción generada' })).toBeNull()
  await act(async () => resolve(summary))
  expect(screen.getByRole('button', { name: 'Generar reporte' }).closest('header')).toBeTruthy()
  expect(screen.queryByRole('button', { name: /Rendimiento de producción/ })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Generar lista' })).toBeNull()
  const toggle = screen.getByRole('button', { name: /Cumplimiento por vendedor/ })
  expect(toggle.getAttribute('aria-expanded')).toBe('false')
  fireEvent.click(toggle)
  expect(screen.getByRole('table')).toBeTruthy()
  fireEvent.click(toggle)
  expect(screen.queryByRole('table')).toBeNull()
  fireEvent.change(screen.getByLabelText('Mes'), { target: { value: '2024-02' } })
  expect(screen.getByRole('status').dataset.scope).toBe('page')
  expect(screen.queryByRole('button', { name: 'Generar reporte' })).toBeNull()
  expect(api.getProductionPerformance).not.toHaveBeenCalled()
})

it('renders dynamic production counts including zero and the API total, with four existing sections', async () => {
  const api = apiFor()
  render(<MetricsContent api={api} />)
  const chart = await screen.findByRole('region', { name: 'Unidades producidas por producto' })
  expect(within(chart).getAllByRole('listitem').map(item => item.textContent)).toEqual(['10 unidadesNuevo producto', '5 unidadesOtro', '0 unidadesCero'])
  expect(screen.getByText(/Total producido/).textContent).toBe('Total producido 15 unidades')
  expect(screen.getByRole('heading', { name: 'Cantidad de producción generada' })).toBeTruthy()
  expect(screen.getByRole('heading', { name: /Rendimiento de producción/ })).toBeTruthy()
  expect(screen.getByRole('button', { name: /Estadía por estado/ })).toBeTruthy()
  expect(screen.getByRole('button', { name: /Cumplimiento por vendedor/ })).toBeTruthy()
  expect(api.getProductionPerformance).not.toHaveBeenCalled()
})

it('keeps dwell samples, independent scales and zero duration, and filters subprocesses locally', async () => {
  const api = apiFor()
  render(<MetricsContent api={api} />)
  await screen.findByText('Nuevo producto')
  fireEvent.click(screen.getByRole('button', { name: /Estadía por estado/ }))
  expect(screen.getByText('3 registros')).toBeTruthy()
  expect(screen.getByText('1.0 días')).toBeTruthy()
  expect(screen.getByText('0 min')).toBeTruthy()
  const bar = name => screen.getByText(name).parentElement.parentElement.querySelector('[style]')
  expect(bar('En producción').style.width).toBe('100%')
  expect(bar('En revisión').style.width).toBe('50%')
  expect(bar('Corte').style.width).toBe('100%')
  expect(bar('Armado').style.width).toBe('0%')
  fireEvent.change(screen.getByLabelText('Producto'), { target: { value: 'Otro' } })
  expect(screen.queryByText('Corte')).toBeNull()
  expect(screen.getByText('Armado')).toBeTruthy()
  expect(screen.getByText('En producción')).toBeTruthy()
  expect(api.getSummary).toHaveBeenCalledTimes(1)
})

it('searches without accents, paginates in original order, and exports the entire period despite filtering', async () => {
  const api = apiFor()
  const popup = { document: { write: vi.fn(), close: vi.fn() }, print: vi.fn() }
  vi.spyOn(window, 'open').mockReturnValue(popup)
  render(<MetricsContent api={api} />)
  await screen.findByText('Nuevo producto')
  fireEvent.click(screen.getByRole('button', { name: /Cumplimiento por vendedor/ }))
  const table = screen.getByRole('table')
  expect(within(table).getAllByRole('columnheader').map(cell => cell.textContent)).toEqual(['Vendedor', 'Notas de venta', 'Entregados a tiempo', 'Fuera de plazo', 'Con carga alta'])
  expect(within(table).getAllByRole('row')).toHaveLength(11)
  expect(screen.getByRole('button', { name: 'Página anterior' }).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }))
  expect(within(table).getAllByRole('rowheader').map(cell => cell.textContent)).toEqual(['Vendedor 11', 'Vendedor 12', 'Ángela <script>'])
  expect(screen.getByRole('button', { name: 'Página siguiente' }).disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('Buscar vendedor'), { target: { value: 'angela' } })
  expect(within(table).getAllByRole('row')).toHaveLength(2)
  expect(screen.queryByRole('navigation', { name: 'Paginación de vendedores' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Exportar' }))
  fireEvent.click(screen.getByRole('button', { name: 'PDF' }))
  const html = popup.document.write.mock.calls[0][0]
  expect(html.match(/<tr>/g)).toHaveLength(14)
  expect(html).toContain('Ángela &lt;script&gt;')
  expect(html).toContain('Vendedor 1</td>')
  fireEvent.change(screen.getByLabelText('Buscar vendedor'), { target: { value: 'sin coincidencias' } })
  expect(screen.getByText('No hay vendedores que coincidan con la búsqueda.')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Buscar vendedor'), { target: { value: '' } })
  expect(within(table).getAllByRole('rowheader')[0].textContent).toBe('Vendedor 1')
  expect(api.getSummary).toHaveBeenCalledTimes(1)
})

it('shows three RF70 categories including undefined deadlines without historical series', () => {
  render(<PerformanceResult report={{ period, totalOrders: 6, deliveredOnTime: 3, deliveredLate: 2, missingDeadline: 1 }} />)
  expect(screen.getByText(/Período: 2024-02-01 al 2024-02-29. Pedidos: 6/)).toBeTruthy()
  expect(screen.getAllByRole('listitem').map(item => item.textContent)).toEqual(['3 pedidosA tiempo', '2 pedidosFuera de plazo', '1 pedidossin fecha definida'])
  expect(screen.queryByText('Sin plazo solicitado')).toBeNull()
  expect(screen.queryByText(/Inconsistencia de datos/)).toBeNull()
})

it('preserves empty states in all four sections', async () => {
  const api = apiFor({ production: { total: 0, products: [] }, dwellTime: { stages: [], subprocesses: [] }, sellerCompliance: [] })
  api.getProductionPerformance.mockResolvedValue({ period, totalOrders: 0, deliveredOnTime: 0, deliveredLate: 0, missingDeadline: 0 })
  render(<MetricsContent api={api} />)
  await screen.findByText('No hay producción registrada.')
  fireEvent.click(screen.getByRole('button', { name: /Estadía por estado/ }))
  expect(screen.getAllByText('Sin registros para este producto.')).toHaveLength(2)
  fireEvent.click(screen.getByRole('button', { name: /Cumplimiento por vendedor/ }))
  expect(screen.getByText('No hay vendedores o pedidos en el periodo seleccionado.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Generar reporte' }))
  await screen.findByText('No existen datos disponibles para generar el reporte en el período seleccionado.')
  expect(screen.queryByRole('region', { name: 'Pedidos por cumplimiento del plazo' })).toBeNull()
})

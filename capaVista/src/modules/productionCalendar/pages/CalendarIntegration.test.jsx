import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { render } from '../../../test/renderWithToast'
import ProductionCalendarPage from './ProductionCalendarPage'

const mocks = vi.hoisted(() => ({ api: null, grid: null }))
vi.mock('../hooks/useOrdersCalendarApi', () => ({ useOrdersCalendarApi: () => mocks.api }))
vi.mock('../components/ProductionCalendarGrid', () => ({ default: props => {
  mocks.grid = props
  return <div>{props.toolbar}<span data-testid="calendar-data">{JSON.stringify({ items: props.items, allItems: props.allItems, loading: props.isLoading })}</span>
    <button onClick={() => props.onChangeDeliveryDate(1, '2026-10-29', { pin: '314159' })}>Confirmar fecha sintética</button></div>
} }))
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
const item = date => ({ id: 1, salesNoteNumber: 'SYN-CALENDAR', clientName: 'Cliente sintético', dueDate: date,
  items: [{ product: 'Lanyard', quantity: 10, dueDate: date }], status: 'En producción' })
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-28T12:00:00Z')) })
afterEach(() => { cleanup(); vi.useRealTimers() })

it('applies combined local filters without refetching or reducing the pending and transfer collections', async () => {
  const monthly = [{ ...item('2026-10-28'), generalStepId: 2 }, { ...item('2026-10-28'), generalStepId: 2, id: 2, clientName: 'Otro cliente' }]
  const pending = { ...item(null), id: 3 }
  mocks.api = { getOrders: vi.fn().mockImplementation(query => Promise.resolve({
    items: query.unscheduled ? [pending] : monthly, pageInfo: {},
  })), updateDeliveryDate: vi.fn() }
  render(<ProductionCalendarPage />); await act(async () => {})
  const reads = mocks.api.getOrders.mock.calls.length
  expect(screen.queryByRole('searchbox')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Expandir filtros de calendario' }))
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'sintético' } })
  fireEvent.change(screen.getByRole('combobox', { name: 'Estado' }), { target: { value: 'En producción' } })
  fireEvent.change(screen.getByRole('combobox', { name: 'Producto' }), { target: { value: 'Lanyard' } })
  expect(mocks.grid.items).toHaveLength(2)
  fireEvent.click(screen.getByRole('button', { name: 'Contraer filtros de calendario' }))
  fireEvent.click(screen.getByRole('button', { name: 'Expandir filtros de calendario' }))
  expect(screen.getByRole('searchbox').value).toBe('sintético')
  fireEvent.click(screen.getByRole('button', { name: 'Buscar en el calendario' }))
  expect(mocks.grid.items.map(row => row.id)).toEqual([1])
  expect(mocks.grid.allItems).toHaveLength(3)
  fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
  expect(mocks.grid.items).toHaveLength(2)
  expect(screen.getByRole('searchbox').value).toBe('')
  expect(mocks.api.getOrders).toHaveBeenCalledTimes(reads)
  expect(mocks.api.updateDeliveryDate).not.toHaveBeenCalled()
})

it('a new account cannot reveal the previous month while only the pending tray has finished', async () => {
  mocks.api = { getOrders: vi.fn().mockResolvedValue({ items: [item('2026-10-28')], pageInfo: {} }) }
  const oldApi = mocks.api
  const view = render(<ProductionCalendarPage />); await act(async () => {})
  expect(screen.getByTestId('calendar-data').textContent).toContain('SYN-CALENDAR')
  const month = deferred()
  mocks.api = { getOrders: vi.fn().mockImplementation(q => q.unscheduled ? Promise.resolve({ items: [], pageInfo: {} }) : month.promise) }
  view.rerender(<ProductionCalendarPage />); await act(async () => {})
  expect(oldApi.getOrders.mock.calls.every(call => call[1].signal.aborted)).toBe(true)
  expect(screen.getByTestId('calendar-data').textContent).not.toContain('SYN-CALENDAR')
  expect(mocks.grid.isLoading).toBe(true)
  await act(async () => month.resolve({ items: [], pageInfo: {} }))
})

it('confirmed overrides do not mask a later fresh server read', async () => {
  mocks.api = { getOrders: vi.fn().mockResolvedValue({ items: [], pageInfo: {} }), updateDeliveryDate: vi.fn().mockResolvedValue(item('2026-10-29')) }
  render(<ProductionCalendarPage />); await act(async () => {})
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar fecha sintética' })); await act(async () => {})
  mocks.api.getOrders.mockResolvedValue({ items: [item('2026-10-30')], pageInfo: {} })
  fireEvent.click(screen.getByTitle('Mes siguiente')); await act(async () => {})
  fireEvent.click(screen.getByTitle('Mes anterior')); await act(async () => {})
  expect(mocks.grid.items[0].dueDate).toBe('2026-10-30')
  expect(mocks.api.updateDeliveryDate).toHaveBeenCalledOnce()
})

it('a pending month response cannot restore an old date after the write is confirmed', async () => {
  mocks.api = { getOrders: vi.fn().mockResolvedValue({ items: [], pageInfo: {} }),
    updateDeliveryDate: vi.fn().mockResolvedValue(item('2026-10-29')) }
  render(<ProductionCalendarPage />); await act(async () => {})
  fireEvent.click(screen.getByTitle('Mes siguiente')); await act(async () => {})
  const pendingMonth = deferred()
  mocks.api.getOrders.mockImplementation(q => q.unscheduled ? Promise.resolve({ items: [], pageInfo: {} }) : pendingMonth.promise)
  fireEvent.click(screen.getByTitle('Mes anterior')); await act(async () => {})
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar fecha sintética' })); await act(async () => {})
  await act(async () => pendingMonth.resolve({ items: [item('2026-10-28')], pageInfo: {} }))
  expect(mocks.grid.items[0].dueDate).toBe('2026-10-29')
  expect(mocks.api.updateDeliveryDate).toHaveBeenCalledOnce()
})

it('a late pending-tray response cannot resurrect an order that now has a date', async () => {
  mocks.api = { getOrders: vi.fn().mockResolvedValue({ items: [], pageInfo: {} }),
    updateDeliveryDate: vi.fn().mockResolvedValue(item('2026-10-29')) }
  const view = render(<ProductionCalendarPage />); await act(async () => {})
  const tray = deferred()
  mocks.api = { getOrders: vi.fn().mockImplementation(q => q.unscheduled ? tray.promise : Promise.resolve({ items: [], pageInfo: {} })),
    updateDeliveryDate: vi.fn().mockResolvedValue(item('2026-10-29')) }
  view.rerender(<ProductionCalendarPage />); await act(async () => {})
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar fecha sintética' })); await act(async () => {})
  await act(async () => tray.resolve({ items: [item(null)], pageInfo: {} }))
  expect(mocks.grid.allItems.filter(x => x.id === 1)).toHaveLength(1)
  expect(mocks.grid.allItems[0].dueDate).toBe('2026-10-29')
})

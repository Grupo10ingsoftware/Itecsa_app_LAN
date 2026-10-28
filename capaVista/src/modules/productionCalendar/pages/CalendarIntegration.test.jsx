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
  const pendingMonth = deferred()
  mocks.api = { getOrders: vi.fn().mockImplementation(q => q.unscheduled ? Promise.resolve({ items: [], pageInfo: {} }) : pendingMonth.promise),
    updateDeliveryDate: vi.fn().mockResolvedValue(item('2026-10-29')) }
  render(<ProductionCalendarPage />); await act(async () => {})
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar fecha sintética' })); await act(async () => {})
  await act(async () => pendingMonth.resolve({ items: [item('2026-10-28')], pageInfo: {} }))
  expect(mocks.grid.items[0].dueDate).toBe('2026-10-29')
  expect(mocks.api.updateDeliveryDate).toHaveBeenCalledOnce()
})

it('a late pending-tray response cannot resurrect an order that now has a date', async () => {
  const tray = deferred()
  mocks.api = { getOrders: vi.fn().mockImplementation(q => q.unscheduled ? tray.promise : Promise.resolve({ items: [], pageInfo: {} })),
    updateDeliveryDate: vi.fn().mockResolvedValue(item('2026-10-29')) }
  render(<ProductionCalendarPage />); await act(async () => {})
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar fecha sintética' })); await act(async () => {})
  await act(async () => tray.resolve({ items: [item(null)], pageInfo: {} }))
  expect(mocks.grid.allItems.filter(x => x.id === 1)).toHaveLength(1)
  expect(mocks.grid.allItems[0].dueDate).toBe('2026-10-29')
})

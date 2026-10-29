import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import KanbanBoardPage from './KanbanBoardPage'
const state = vi.hoisted(() => ({ api: null, success: vi.fn(), error: vi.fn() }))
vi.mock('../hooks/useKanbanApi', () => ({ useKanbanApi: () => state.api }))
vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => ({ hasPermission: () => true }) }))
vi.mock('../../../shared/notifications/useToast', () => ({ useToast: () => ({ success: state.success, error: state.error }) }))
vi.mock('../components/KanbanColumn', () => ({ default: props => <output data-testid="refresh">{props.refreshKey}</output> }))
vi.mock('../components/KanbanFilters', () => ({ default: () => null }))
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const load = (dailyQuantity = 100) => ({ date: '2026-10-27', capacity: 1200, percentage: 10, lanyardsInProduction: dailyQuantity,
  details: [{ detailId: 2, salesNoteNumber: 'SYNTHETIC', quantity: 1000, accumulatedQuantity: 300,
    dailyQuantity, remainingQuantity: 700, progressPercentage: 30 }] })
beforeEach(() => { vi.clearAllMocks(); state.api = { getProductionLoad: vi.fn().mockResolvedValue(load()), updateProductionLoad: vi.fn() } })
afterEach(cleanup)
it('saving a daily batch waits for confirmation, then refreshes the board exactly once', async () => {
  const pending = deferred(); state.api.updateProductionLoad.mockReturnValue(pending.promise)
  render(<MemoryRouter><KanbanBoardPage /></MemoryRouter>)
  const button = await screen.findByLabelText('Configurar carga operativa'); await waitFor(() => expect(button.disabled).toBe(false)); fireEvent.click(button)
  fireEvent.change(screen.getByLabelText('Carga diaria para SYNTHETIC'), { target: { value: '200' } })
  fireEvent.submit(screen.getByRole('dialog')); fireEvent.submit(screen.getByRole('dialog'))
  expect(state.api.updateProductionLoad).toHaveBeenCalledTimes(1)
  expect(state.api.updateProductionLoad.mock.calls[0]).toEqual([[{ detailId: 2, quantity: 200 }]])
  expect(screen.getByRole('dialog')).toBeTruthy(); expect(screen.getByTestId('refresh').textContent).toBe('0')
  expect(state.success).not.toHaveBeenCalled()
  await act(async () => { pending.resolve(load(200)) })
  expect(screen.queryByRole('dialog')).toBeNull(); expect(screen.getByTestId('refresh').textContent).toBe('1')
  expect(state.api.getProductionLoad).toHaveBeenCalledTimes(1)
})
it('uncertain write remains in its dialog and does not refresh or retry', async () => {
  state.api.updateProductionLoad.mockRejectedValue({ status: 503, code: 'NETWORK_ERROR' })
  render(<MemoryRouter><KanbanBoardPage /></MemoryRouter>); const button = await screen.findByLabelText('Configurar carga operativa')
  await waitFor(() => expect(button.disabled).toBe(false)); fireEvent.click(button)
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar carga' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Confirmar carga' }).disabled).toBe(false))
  expect(screen.getByRole('dialog')).toBeTruthy(); expect(screen.getByTestId('refresh').textContent).toBe('0')
  expect(state.api.updateProductionLoad).toHaveBeenCalledTimes(1); expect(state.success).not.toHaveBeenCalled()
})
it('session/API change aborts its read, hides old load dialog and ignores old write completion', async () => {
  const pending = deferred(); state.api.updateProductionLoad.mockReturnValue(pending.promise)
  const view = render(<MemoryRouter><KanbanBoardPage /></MemoryRouter>); const button = await screen.findByLabelText('Configurar carga operativa')
  await waitFor(() => expect(button.disabled).toBe(false)); fireEvent.click(button); fireEvent.click(screen.getByRole('button', { name: 'Confirmar carga' }))
  const oldApi = state.api; state.api = { getProductionLoad: vi.fn().mockResolvedValue(load(50)), updateProductionLoad: vi.fn() }
  view.rerender(<MemoryRouter><KanbanBoardPage /></MemoryRouter>); await waitFor(() => expect(state.api.getProductionLoad).toHaveBeenCalledTimes(1))
  expect(oldApi.getProductionLoad.mock.calls[0][0].signal.aborted).toBe(true); expect(screen.queryByRole('dialog')).toBeNull()
  await act(async () => { pending.resolve(load(200)) })
  expect(state.success).not.toHaveBeenCalled(); expect(screen.getByTestId('refresh').textContent).toBe('0')
})

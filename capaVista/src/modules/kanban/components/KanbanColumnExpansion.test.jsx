import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { render } from '../../../test/renderWithToast'
import KanbanColumn from './KanbanColumn'

const state = vi.hoisted(() => ({ api: null, drag: null }))
vi.mock('../hooks/useKanbanApi', () => ({ useKanbanApi: () => state.api }))
vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => ({ hasPermission: () => true }) }))
vi.mock('./MoveToProductionModal.jsx', () => ({ MoveToProductionModal: ({ isOpen, onConfirm }) => isOpen &&
  <button onClick={() => onConfirm({ pin: '123456' })}>Confirmar movimiento</button> }))
vi.mock('@dnd-kit/react', () => ({
  DragDropProvider: ({ children, onDragEnd }) => { state.drag = onDragEnd; return children },
  useDroppable: () => ({ ref: vi.fn() }),
  useDraggable: () => ({ ref: vi.fn() }),
}))
const order = (id, step = 1) => ({ id, salesNoteNumber: `NV-${id}`, clientName: `Cliente ${id}`, generalStepId: step,
  paymentStatus: 'Confirmado', paymentStatusId: 2, items: [{ id: `item-${id}`, product: 'Tarjeta', quantity: 100, subProcesses: [] }], labels: [] })
const page = (items, more = false) => ({ items, pageInfo: { hasMore: more, nextCursor: more ? 'next' : null } })
const expansion = id => screen.getByRole('button', { name: new RegExp(`tarjeta NV-${id}$`) }).getAttribute('aria-expanded')
const columnOf = id => screen.getByRole('button', { name: new RegExp(`tarjeta NV-${id}$`) }).closest('section')
const toggleColumn = id => within(columnOf(id)).getByRole('button', { name: /pedidos de/ })
beforeEach(() => {
  state.api = { getOrders: vi.fn().mockResolvedValue(page([order(1), order(2), order(3, 2)], true)),
    getOrderStatuses: vi.fn().mockResolvedValue([]), getOrderDetail: vi.fn().mockImplementation(id => Promise.resolve(order(id))),
    moveOrder: vi.fn().mockResolvedValue({ id: 1, generalStepId: 2, orderStatus: 'En producción' }) }
})
afterEach(cleanup)
it('collapses mixed cards, then expands only that column, without opening detail', async () => {
  render(<KanbanColumn />)
  await screen.findByRole('button', { name: 'Contraer tarjeta NV-1' })
  fireEvent.click(screen.getByRole('button', { name: 'Contraer tarjeta NV-1' }))
  expect(expansion(1)).toBe('false')
  expect(expansion(2)).toBe('true')
  fireEvent.click(toggleColumn(1))
  expect(expansion(1)).toBe('false')
  expect(expansion(2)).toBe('false')
  expect(expansion(3)).toBe('true')
  expect(toggleColumn(1).getAttribute('aria-label')).toMatch(/^Expandir/)
  fireEvent.click(toggleColumn(1))
  expect(expansion(1)).toBe('true')
  expect(expansion(2)).toBe('true')
  expect(state.api.getOrderDetail).not.toHaveBeenCalled()
})
it('inherits the last column action on load more and preserves existing individual choices on refresh', async () => {
  const view = render(<KanbanColumn />)
  await screen.findByRole('button', { name: 'Contraer tarjeta NV-1' })
  fireEvent.click(toggleColumn(1))
  fireEvent.click(screen.getByRole('button', { name: 'Expandir tarjeta NV-1' }))
  state.api.getOrders.mockResolvedValueOnce(page([order(4), order(5, 2)]))
  fireEvent.click(screen.getByRole('button', { name: 'Cargar más pedidos' }))
  await screen.findByRole('button', { name: 'Expandir tarjeta NV-4' })
  expect(expansion(1)).toBe('true')
  expect(expansion(2)).toBe('false')
  expect(expansion(5)).toBe('true')
  state.api.getOrders.mockResolvedValueOnce(page([order(1), order(2), order(3, 2), order(4)]))
  view.rerender(<KanbanColumn refreshKey={1} />)
  await screen.findByRole('button', { name: 'Expandir tarjeta NV-4' })
  expect(expansion(1)).toBe('true')
  expect(expansion(2)).toBe('false')
})
it('shows the matching tooltip on focus and hover', async () => {
  render(<KanbanColumn />)
  await screen.findByRole('button', { name: 'Contraer tarjeta NV-1' })
  fireEvent.focus(toggleColumn(1))
  expect((await screen.findByRole('tooltip')).textContent).toBe('Contraer')
  fireEvent.blur(toggleColumn(1))
  fireEvent.click(toggleColumn(1))
  fireEvent.mouseOver(toggleColumn(1))
  await waitFor(() => expect(screen.getByRole('tooltip').textContent).toBe('Expandir'))
})
it('retains expansion when a confirmed drag moves a card to another column', async () => {
  render(<KanbanColumn />)
  await screen.findByRole('button', { name: 'Contraer tarjeta NV-1' })
  fireEvent.click(screen.getByRole('button', { name: 'Contraer tarjeta NV-1' }))
  await act(async () => state.drag({ operation: { source: { id: 'NV-1' }, target: { id: 'En produccion' } } }))
  expect(state.api.moveOrder).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar movimiento' }))
  await waitFor(() => expect(columnOf(1)).toBe(columnOf(3)))
  expect(expansion(1)).toBe('false')
  expect(expansion(3)).toBe('true')
  expect(state.api.moveOrder).toHaveBeenCalledTimes(1)
})

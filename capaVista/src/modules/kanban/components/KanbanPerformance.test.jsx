import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import KanbanColumn from './KanbanColumn'
import { createKanbanApi } from '../api/kanbanApi'

const state = vi.hoisted(() => ({ api: null, drag: null, success: vi.fn(), error: vi.fn() }))
vi.mock('../hooks/useKanbanApi', () => ({ useKanbanApi: () => state.api }))
vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => ({ hasPermission: () => true }) }))
vi.mock('../../../shared/notifications/useToast', () => ({ useToast: () => ({ success: state.success, error: state.error, warning: vi.fn() }) }))
vi.mock('@dnd-kit/react', () => ({ DragDropProvider: ({ children, onDragEnd }) => { state.drag = onDragEnd; return children } }))
vi.mock('./DroppableColumn.jsx', () => ({ DroppableColumn: ({ children }) => <section>{children}</section> }))
vi.mock('./KanbanCard', () => ({ default: props => <article data-testid={'card-' + props.id} data-step={props.generalStepId}>
  <button onClick={props.onOpenDetail}>{props.salesNoteNumber}</button>
  <button aria-label={'Urgent ' + props.id} aria-pressed={props.isUrgent} disabled={props.indicatorsBusy}
    onClick={() => props.onToggleIndicator('urgent')}>Urgency</button>
</article> }))
vi.mock('./KanbanOffCanvas', () => ({ default: props => props.isOpen && <aside role="dialog" aria-label="Detail">
  <output>{props.isLoading ? 'Detail loading' : props.order?.clientName}</output>
  <button onClick={props.onClose}>Close</button>
  <button onClick={() => { void props.onCompleteSubprocess(props.order, { id: '2' }, { id: '1' }, { pin: '123456' }).catch(() => {}) }}>Complete</button>
  <button onClick={() => { void props.onCancelProduction(props.order, { pin: '123456', comment: 'reason' }).catch(() => {}) }}>Cancel production</button>
</aside> }))
vi.mock('./MoveToProductionModal.jsx', () => ({ MoveToProductionModal: props => props.isOpen && <button
  onClick={() => { void props.onConfirm({ pin: '123456' }).catch(() => {}) }}>Confirm move</button> }))
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const order = (id, extra = {}) => ({ id, salesNoteNumber: 'NV-' + id, clientName: 'Client ' + id,
  generalStepId: 1, dueDate: null, orderStatus: 'Listo para produccion', createdAt: null, paymentStatusId: 2,
  paymentStatus: 'Confirmado', labels: [], items: [], seller: null, comments: [],
  commentGroups: { all: [], source: [], system: [], subprocesses: [] }, ...extra })
const page = (items = [order(1)], hasMore = false) => ({ items, pageInfo: { hasMore, nextCursor: hasMore ? 'cursor' : null } })
beforeEach(() => {
  vi.clearAllMocks()
  state.api = { getOrders: vi.fn().mockResolvedValue(page()), getOrderStatuses: vi.fn().mockResolvedValue([]),
    getOrderDetail: vi.fn().mockImplementation(id => Promise.resolve(order(id))),
    setLabel: vi.fn().mockResolvedValue({ id: 1, labels: [] }), moveOrder: vi.fn(), completeSubprocess: vi.fn(), cancelProduction: vi.fn() }
})
afterEach(cleanup)

it('renders confirmed cards without waiting for a slow catalog, retaining fallback and catalog error', async () => {
  const statuses = deferred(); state.api.getOrderStatuses.mockReturnValue(statuses.promise)
  render(<KanbanColumn filters={{}} />)
  expect(await screen.findByText('NV-1')).toBeTruthy()
  await act(async () => { statuses.reject(Error('unavailable')) })
  expect(screen.getByText('NV-1')).toBeTruthy(); expect(screen.getByRole('alert').textContent).toContain('estados')
})
it('cancels obsolete list/page requests and discards their late data', async () => {
  const more = deferred(), next = deferred()
  state.api.getOrders.mockResolvedValueOnce(page([order(1)], true)).mockReturnValueOnce(more.promise).mockReturnValueOnce(next.promise)
  const view = render(<KanbanColumn filters={{}} />)
  fireEvent.click(await screen.findByText('Cargar más pedidos'))
  const moreSignal = state.api.getOrders.mock.calls[1][1].signal
  view.rerender(<KanbanColumn filters={{ clientName: 'Client' }} />)
  expect(moreSignal.aborted).toBe(true); expect(state.api.getOrders.mock.calls[0][1].signal.aborted).toBe(true)
  await act(async () => { more.resolve(page([order(9)])); next.resolve(page([order(2)])) })
  expect(screen.queryByText('NV-9')).toBeNull(); expect(screen.getByText('NV-2')).toBeTruthy()
  view.unmount(); expect(state.api.getOrders.mock.calls[2][1].signal.aborted).toBe(true)
})
it('cursor append removes duplicates both across and inside a page, preserving order', async () => {
  state.api.getOrders.mockResolvedValueOnce(page([order(1)], true)).mockResolvedValueOnce(page([order(1), order(2), order(2), order(3)]))
  render(<KanbanColumn filters={{}} />); fireEvent.click(await screen.findByText('Cargar más pedidos'))
  await screen.findByText('NV-3')
  expect(screen.getAllByTestId(/card-/).map(n => n.dataset.testid)).toEqual(['card-1', 'card-2', 'card-3'])
})
it('switching/closing details aborts obsolete reads without reopening a closed panel', async () => {
  const first = deferred(), second = deferred()
  state.api.getOrders.mockResolvedValue(page([order(1), order(2)]))
  state.api.getOrderDetail.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
  render(<KanbanColumn filters={{}} />); fireEvent.click(await screen.findByText('NV-1')); fireEvent.click(screen.getByText('NV-2'))
  expect(state.api.getOrderDetail.mock.calls[0][1].signal.aborted).toBe(true)
  fireEvent.click(screen.getByText('Close')); expect(state.api.getOrderDetail.mock.calls[1][1].signal.aborted).toBe(true)
  await act(async () => { first.resolve(order(1)); second.resolve(order(2)) })
  expect(screen.queryByRole('dialog')).toBeNull()
})
it('precheck uses the reduced endpoint before PIN, and never sends a move without confirmation', async () => {
  state.api.getOrders.mockResolvedValue(page([order(1, { generalStepId: 2 })]))
  state.api.getOrderDetail.mockResolvedValue(order(1, { generalStepId: 2,
    items: [{ id: '2', product: 'Tarjeta', subProcesses: [{ id: '1', status: 'done' }] }] }))
  render(<KanbanColumn filters={{}} />); await screen.findByText('NV-1')
  await act(async () => { await state.drag({ operation: { source: { id: 'NV-1' }, target: { id: 'Listo para entrega' } } }) })
  expect(state.api.getOrderDetail.mock.calls[0][1]).toMatchObject({ precheck: true })
  expect(state.api.moveOrder).not.toHaveBeenCalled(); expect(screen.getByText('Confirm move')).toBeTruthy()
})
it('labels stay unchanged until confirmed; double clicks are blocked, with no list reload', async () => {
  const label = deferred(); state.api.setLabel.mockReturnValue(label.promise)
  render(<KanbanColumn filters={{}} />); await screen.findByText('NV-1')
  const button = screen.getByLabelText('Urgent 1'); fireEvent.click(button); fireEvent.click(button)
  expect(button.getAttribute('aria-pressed')).toBe('false'); expect(button.disabled).toBe(true)
  expect(state.api.setLabel).toHaveBeenCalledTimes(1); expect(state.success).not.toHaveBeenCalled()
  await act(async () => { label.resolve({ id: 1, labels: [{ id: 1, name: 'Urgencia' }] }) })
  expect(button.getAttribute('aria-pressed')).toBe('true'); expect(button.disabled).toBe(false)
  expect(state.api.getOrders).toHaveBeenCalledTimes(1)
})
it('label failure cannot roll back a concurrent confirmed stage change', async () => {
  state.api.getOrderDetail.mockResolvedValue(order(1, { dueDate: '2026-10-29' }))
  const label = deferred(); state.api.setLabel.mockReturnValue(label.promise)
  state.api.moveOrder.mockResolvedValue({ id: 1, generalStepId: 2, orderStatus: 'En producción' })
  render(<KanbanColumn filters={{}} />); await screen.findByText('NV-1')
  fireEvent.click(screen.getByLabelText('Urgent 1'))
  await act(async () => { await state.drag({ operation: { source: { id: 'NV-1' }, target: { id: 'En produccion' } } }) })
  fireEvent.click(screen.getByText('Confirm move'))
  await waitFor(() => expect(screen.getByTestId('card-1').dataset.step).toBe('2'))
  await act(async () => { label.reject(Error('rejected')) })
  expect(screen.getByTestId('card-1').dataset.step).toBe('2')
})
it('completion waits for confirmed result and does not reopen a panel closed during the write', async () => {
  const complete = deferred(); state.api.completeSubprocess.mockReturnValue(complete.promise)
  render(<KanbanColumn filters={{}} />); fireEvent.click(await screen.findByText('NV-1'))
  await screen.findByText('Client 1'); fireEvent.click(screen.getByText('Complete')); fireEvent.click(screen.getByText('Close'))
  expect(state.success).not.toHaveBeenCalled(); expect(state.api.getOrders).toHaveBeenCalledTimes(1)
  await act(async () => { complete.resolve(order(1, { clientName: 'Confirmed' })) })
  expect(screen.queryByRole('dialog')).toBeNull(); expect(state.api.getOrders).toHaveBeenCalledTimes(1)
})
it('API/session change hides old detail and ignores an in-flight old-session cancellation', async () => {
  const cancel = deferred(); state.api.cancelProduction.mockReturnValue(cancel.promise)
  const view = render(<KanbanColumn filters={{}} />); fireEvent.click(await screen.findByText('NV-1'))
  await screen.findByText('Client 1'); fireEvent.click(screen.getByText('Cancel production'))
  state.api = { ...state.api, getOrders: vi.fn().mockResolvedValue(page([order(2)])) }
  view.rerender(<KanbanColumn filters={{}} />); await screen.findByText('NV-2')
  expect(screen.queryByRole('dialog')).toBeNull()
  await act(async () => { cancel.resolve({}) })
  expect(screen.getByText('NV-2')).toBeTruthy(); expect(state.success).not.toHaveBeenCalled()
})
it('catalog TTL dedupes simultaneous readers, expires, retries failure, and stays scoped to the API instance', async () => {
  let time = 0; const pending = deferred(), client = { get: vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue([{ id_estado_pedido: 2 }]) }
  const api = createKanbanApi(client, { now: () => time, statusTtlMs: 30000 })
  const first = api.getOrderStatuses(), second = api.getOrderStatuses(); expect(first).toBe(second)
  pending.resolve([]); await first; await api.getOrderStatuses(); expect(client.get).toHaveBeenCalledTimes(1)
  time = 30001; await api.getOrderStatuses(); expect(client.get).toHaveBeenCalledTimes(2)
  await createKanbanApi(client).getOrderStatuses(); expect(client.get).toHaveBeenCalledTimes(3)
  client.get.mockRejectedValueOnce({ status: 403 }); await expect(api.getOrderStatuses({ force: true })).rejects.toMatchObject({ status: 403 })
  await api.getOrderStatuses(); expect(client.get).toHaveBeenCalledTimes(5)
})
it('API routes prechecks separately and applies AbortSignal only to reads', async () => {
  const client = { get: vi.fn().mockResolvedValue(order(1)), patch: vi.fn().mockResolvedValue(order(1)) }, api = createKanbanApi(client)
  const controller = new AbortController(); await api.getOrderDetail(1, { precheck: true, signal: controller.signal })
  expect(client.get.mock.calls[0][0]).toBe('/orders/1/kanban-precheck')
  expect(client.get.mock.calls[0][1]).toEqual({ signal: controller.signal })
  await api.completeSubprocess(1, 2, 3, { pin: '123456', signal: controller.signal })
  expect(client.patch.mock.calls[0]).toHaveLength(2); expect(client.patch.mock.calls[0][1]).toEqual({ pin: '123456', comment: undefined })
})

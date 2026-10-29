import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { render } from '../../../test/renderWithToast'
import KanbanColumn from './KanbanColumn'
import { PERMISSIONS } from '../../../config/permissions'
import { PRODUCTION_SCHEDULE_REQUIRED_MESSAGE as message } from '../../../../../shared/productionScheduling.js'
const state = vi.hoisted(() => ({ api: {}, drag: null, denied: [] }))
vi.mock('../hooks/useKanbanApi', () => ({ useKanbanApi: () => state.api }))
vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => ({ hasPermission: permission => !state.denied.includes(permission) }) }))
vi.mock('@dnd-kit/react', () => ({ DragDropProvider: ({ children, onDragEnd }) => { state.drag = onDragEnd; return children } }))
vi.mock('./DroppableColumn.jsx', () => ({ DroppableColumn: ({ children, title }) => <section aria-label={title}>{children}</section> }))
vi.mock('./KanbanCard', () => ({ default: ({ salesNoteNumber }) => <span>{salesNoteNumber}</span> }))
const order = { id: 1, salesNoteNumber: 'NV-test', generalStepId: 1, paymentStatus: 'Confirmado', dueDate: null, items: [] }
async function mount(extra = {}) {
 state.api.getOrders.mockResolvedValue({ items: [{ ...order, ...extra }], pageInfo: {} })
 render(<KanbanColumn filters={{}} />); await screen.findByText('NV-test')
}
async function drag() { await act(async () => state.drag({ operation: { source: { id: 'NV-test' }, target: { id: 'En produccion' } } })) }
beforeEach(() => {
 state.denied = []
 state.api = { getOrders: vi.fn(), getOrderStatuses: vi.fn().mockResolvedValue([]),
 getOrderDetail: vi.fn().mockResolvedValue({ ...order, dueDate: '2026-10-29' }), moveOrder: vi.fn() }
})
afterEach(cleanup)
it.each([null, '', 'invalid', '2026-02-30', '2026-10-31'])('sin programación válida (%s) bloquea antes del modal con Toast y conserva la tarjeta', async dueDate => {
 state.api.getOrderDetail.mockResolvedValue({ ...order, dueDate }); await mount(); await drag()
 const error = screen.getByText(message)
 expect(error.closest('[data-toast-viewport]')).toBeTruthy()
 expect(screen.queryByRole('dialog')).toBeNull()
 expect(screen.getByText('NV-test')).toBeTruthy()
 expect(state.api.moveOrder).not.toHaveBeenCalled()
})
it('una fecha en los detalles no reemplaza la programación del pedido', async () => {
 state.api.getOrderDetail.mockResolvedValue({ ...order, items: [{ id: 2, product: 'Tarjeta', dueDate: '2026-10-29' }] })
 await mount(); await drag(); expect(screen.getByText(message)).toBeTruthy(); expect(state.api.moveOrder).not.toHaveBeenCalled()
})
it('consulta fecha actualizada y permite continuar con PIN sin mover antes de confirmar', async () => {
 await mount(); await drag()
 expect(state.api.getOrderDetail).toHaveBeenCalledExactlyOnceWith(1, { precheck: true, signal: expect.any(AbortSignal) })
 expect(screen.getByRole('dialog', { name: 'Mover pedido' })).toBeTruthy()
 expect(screen.getByLabelText('PIN personal')).toBeTruthy()
 expect(state.api.moveOrder).not.toHaveBeenCalled()
})
it('fecha borrada después del precheck recibe Toast del backend sin cambiar la tarjeta', async () => {
 state.api.moveOrder.mockRejectedValue({ status: 409, payload: { code: 'PRODUCTION_SCHEDULE_REQUIRED', message } })
 await mount(); await drag()
 fireEvent.change(screen.getByLabelText('PIN personal'), { target: { value: '123456' } })
 fireEvent.submit(screen.getByRole('dialog', { name: 'Mover pedido' }))
 const error = await screen.findByText(message)
 expect(error.closest('[data-toast-viewport]')).toBeTruthy()
 expect(screen.getByRole('dialog').textContent).not.toContain(message)
 expect(screen.getByText('NV-test')).toBeTruthy()
})
it('pago pendiente mantiene el bloqueo sin consultar programación', async () => {
 await mount({ paymentStatus: 'Pendiente' }); await drag()
 expect(screen.getByText('Debes confirmar el pago antes de mover esta orden.')).toBeTruthy()
 expect(state.api.getOrderDetail).not.toHaveBeenCalled(); expect(state.api.moveOrder).not.toHaveBeenCalled()
})
it.each([PERMISSIONS.MOVE_ORDERS, PERMISSIONS.START_PRODUCTION])('sin permiso %s no abre modal ni consulta programación', async permission => {
 state.denied = [permission]; await mount(); await drag()
 expect(screen.queryByRole('dialog')).toBeNull(); expect(state.api.getOrderDetail).not.toHaveBeenCalled()
})
it('no duplica prechecks y descarta la consulta cancelada por un cambio de filtros', async () => {
 let resolve; state.api.getOrderDetail.mockReturnValue(new Promise(yes => { resolve = yes }))
 state.api.getOrders.mockResolvedValue({ items: [order], pageInfo: {} })
 const view = render(<KanbanColumn filters={{}} />); await screen.findByText('NV-test')
 act(() => { void state.drag({ operation: { source: { id: 'NV-test' }, target: { id: 'En produccion' } } }) })
 await drag(); expect(state.api.getOrderDetail).toHaveBeenCalledTimes(1)
 const signal = state.api.getOrderDetail.mock.calls[0][1].signal
 view.rerender(<KanbanColumn filters={{ clientName: 'Otro' }} />)
 await act(async () => resolve({ ...order, dueDate: '2026-10-29' }))
 expect(signal.aborted).toBe(true); expect(screen.queryByRole('dialog')).toBeNull()
})

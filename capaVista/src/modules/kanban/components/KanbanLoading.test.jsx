import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { render } from '../../../test/renderWithToast'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import KanbanColumn from './KanbanColumn'
import KanbanOffCanvas from './KanbanOffCanvas'

const { api, drag } = vi.hoisted(() => ({ api: {}, drag: {} }))
vi.mock('../hooks/useKanbanApi', () => ({ useKanbanApi: () => api }))
vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => ({ hasPermission: () => true, user: { rolUsuario: drag.role ?? 'Operario Produccion' } }) }))
vi.mock('@dnd-kit/react', () => ({ DragDropProvider: ({ children, onDragEnd }) => { drag.end = onDragEnd; return <>{children}</> } }))
vi.mock('./DroppableColumn.jsx', () => ({ DroppableColumn: ({ children }) => <section>{children}</section> }))
vi.mock('./KanbanCard', () => ({ default: ({ salesNoteNumber, onOpenDetail }) => <button onClick={onOpenDetail}>{salesNoteNumber}</button> }))
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const order = id => ({ id, salesNoteNumber: `NV-${id}`, clientName: 'anterior actual nuevo', generalStepId: 1, items: [], comments: [] })
const result = (id, hasMore = false) => ({ items: [order(id)], pageInfo: { hasMore, nextCursor: hasMore ? `cursor-${id}` : null } })
beforeEach(() => { drag.role = 'Operario Produccion'; api.getOrders = vi.fn(); api.getOrderStatuses = vi.fn().mockResolvedValue([]) })
afterEach(cleanup)

describe('carga de Kanban y acciones locales', () => {
  it.each(['Operario Produccion', 'Administrador Produccion', 'Desarrollador'])('%s: Finalizar pedido pide PIN, cambia a Terminado y retira la tarjeta', async role => {
    drag.role = role
    const detail = { ...order(5), generalStepId: 3, orderStatus: 'Listo para entrega', paymentStatus: 'Confirmado',
      items: [{ id: 7, product: 'Tarjeta', subProcesses: [{ id: 1, name: 'Corte', status: 'done' }] }] }
    const patch = { id: 5, generalStepId: 4, orderStatus: 'Terminado' }
    api.getOrders.mockResolvedValue({ items: [detail], pageInfo: {} })
    api.getOrderDetail = vi.fn().mockResolvedValueOnce(detail).mockResolvedValue({ ...detail, ...patch })
    api.moveOrder = vi.fn().mockResolvedValue(patch)
    render(<KanbanColumn filters={{}} />)
    fireEvent.click(await screen.findByRole('button', { name: 'NV-5' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Finalizar pedido' }))
    expect(api.moveOrder).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('PIN personal'), { target: { value: '123456' } })
    fireEvent.submit(screen.getByRole('dialog', { name: 'Finalizar pedido' }))
    await waitFor(() => expect(api.moveOrder).toHaveBeenCalledWith(5, 4, { pin: '123456' }))
    await screen.findByText('Pedido terminado')
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar detalle' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.queryByRole('button', { name: 'NV-5' })).toBeNull()
  })
  it('mantiene Listo para entrega en el tablero y excluye Terminado', async () => {
    api.getOrders.mockResolvedValue({ items: [
      { ...order(3), generalStepId: 3, orderStatus: 'Listo para entrega' },
      { ...order(4), generalStepId: 4, orderStatus: 'Terminado' },
    ], pageInfo: {} })
    render(<KanbanColumn filters={{}} />)
    expect(await screen.findByText('NV-3')).toBeTruthy()
    expect(screen.queryByText('NV-4')).toBeNull()
  })
  it('finalizar producción mantiene la tarjeta en Listo para entrega', async () => {
    const detail = { ...order(5), generalStepId: 2, paymentStatus: 'Confirmado',
      items: [{ id: 7, product: 'Tarjeta', subProcesses: [{ id: 1, name: 'Corte', status: 'done' }] }] }
    const patch = { id: 5, generalStepId: 3, orderStatus: 'Listo para entrega' }
    api.getOrders.mockResolvedValue({ items: [detail], pageInfo: {} })
    api.getOrderDetail = vi.fn().mockResolvedValueOnce(detail).mockResolvedValue({ ...detail, ...patch })
    api.moveOrder = vi.fn().mockResolvedValue(patch)
    render(<KanbanColumn filters={{}} />)
    fireEvent.click(await screen.findByRole('button', { name: 'NV-5' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Finalizar producción' }))
    fireEvent.change(screen.getByLabelText('PIN personal'), { target: { value: '123456' } })
    fireEvent.submit(screen.getByRole('dialog', { name: 'Finalizar producción' }))
    await waitFor(() => expect(api.moveOrder).toHaveBeenCalledWith(5, 3, { pin: '123456' }))
    await screen.findByText('Producción finalizada')
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar detalle' }))
    expect(await screen.findByRole('button', { name: 'NV-5' })).toBeTruthy()
  })
  it('reactiva la carga y descarta respuestas y finally de filtros anteriores', async () => {
    const first = deferred(), second = deferred()
    api.getOrders.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const view = render(<KanbanColumn filters={{ clientName: 'anterior' }} />)
    view.rerender(<KanbanColumn filters={{ clientName: 'actual' }} />)
    await act(async () => first.resolve(result(1)))
    expect(screen.queryByText('NV-1')).toBeNull()
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0)
    await act(async () => second.resolve(result(2)))
    expect(screen.getByText('NV-2')).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })
  it('una página adicional pendiente no se mezcla con otro filtro ni apaga su carga', async () => {
    const more = deferred(), filtered = deferred()
    api.getOrders.mockResolvedValueOnce(result(1, true)).mockReturnValueOnce(more.promise).mockReturnValueOnce(filtered.promise)
    const view = render(<KanbanColumn filters={{}} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Cargar más pedidos' }))
    view.rerender(<KanbanColumn filters={{ clientName: 'nuevo' }} />)
    await act(async () => more.resolve(result(2)))
    expect(screen.queryByText('NV-2')).toBeNull()
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0)
    await act(async () => filtered.resolve(result(3)))
    expect(screen.getByText('NV-3')).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })
  it('un fallo libera el indicador y muestra el error', async () => {
    api.getOrders.mockRejectedValue(Error('fixture'))
    render(<KanbanColumn filters={{}} />)
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
    expect(screen.getByText('No fue posible cargar las órdenes.').closest('[data-toast-viewport]')).toBeTruthy()
  })
  it('muestra la validación previa al traslado e impide duplicarla mientras espera', async () => {
    const validation = deferred()
    api.getOrders.mockResolvedValue({ items: [{ ...order(5), generalStepId: 2 }], pageInfo: {} })
    api.getOrderDetail = vi.fn(() => validation.promise)
    render(<KanbanColumn filters={{}} />)
    await screen.findByText('NV-5')
    const event = { operation: { source: { id: 'NV-5' }, target: { id: 'Listo para entrega' } } }
    act(() => { void drag.end(event); void drag.end(event) })
    expect(api.getOrderDetail).toHaveBeenCalledOnce()
    expect(screen.getByRole('status').textContent).toContain('Validación del pedido antes del traslado')
    await act(async () => validation.reject(Error('fixture')))
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByText('No fue posible validar el detalle del pedido.')).toBeTruthy()
  })
  it('bloquea doble corrección y cierre mientras envía; libera el panel ante un error', async () => {
    const pending = deferred(), onClose = vi.fn(), onSendToReview = vi.fn(() => pending.promise)
    render(<KanbanOffCanvas isOpen order={order(1)} canReview onClose={onClose} onSendToReview={onSendToReview} />)
    fireEvent.click(screen.getByRole('button', { name: 'Solicita correccion' }))
    fireEvent.change(screen.getByLabelText('Especifique la correccion necesaria'), { target: { value: 'Corregir ubicación' } })
    const submit = screen.getByRole('button', { name: 'Confirmar correccion' })
    fireEvent.submit(submit.closest('form')); fireEvent.submit(submit.closest('form'))
    expect(onSendToReview).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Cerrar detalle' }).disabled).toBe(true)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    await act(async () => pending.reject(Error('fixture')))
    expect(screen.queryByRole('status')).toBeNull()
    const issue = screen.getByText(/No fue posible enviar el pedido a revisión\./)
    expect(issue.closest('[role="dialog"]')).toBeTruthy()
    expect(issue.textContent).toContain('Comprueba el resultado antes de repetir')
    expect(screen.getByRole('button', { name: 'Confirmar correccion' }).disabled).toBe(false)
  })
})

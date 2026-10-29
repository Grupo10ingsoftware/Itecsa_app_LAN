import { StrictMode } from 'react'
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { render } from '../../../test/renderWithToast'
import KanbanBoardPage from './KanbanBoardPage'
import MessageDetailPage from '../../messages/pages/MessageDetailPage'
const state = vi.hoisted(() => ({ api: {}, messages: {}, allowed: true }))
vi.mock('../hooks/useKanbanApi', () => ({ useKanbanApi: () => state.api }))
vi.mock('../../messages/hooks/useMessagesApi', () => ({ useMessagesApi: () => state.messages }))
vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => ({ hasPermission: () => state.allowed }) }))
vi.mock('@dnd-kit/react', () => ({ DragDropProvider: ({ children }) => children }))
vi.mock('../components/DroppableColumn.jsx', () => ({ DroppableColumn: ({ children }) => <section>{children}</section> }))
vi.mock('../components/KanbanFilters', () => ({ default: () => null }))
const order = (id, extra = {}) => ({ id, salesNoteNumber: `NV-${id}`, generalStepId: 1, items: [], ...extra })
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes }); return { promise, resolve } }
function Navigation() {
 const location = useLocation(), navigate = useNavigate()
 return <><output data-testid="url">{location.pathname + location.search}</output>
 <button onClick={() => navigate('/kanban?pedido=86&other=yes')}>Otro pedido</button>
 <button onClick={() => navigate('/kanban')}>Tablero</button>
 <button onClick={() => navigate(-1)}>Atrás</button><button onClick={() => navigate(1)}>Adelante</button></>
}
function mount(url = '/kanban?pedido=85&other=yes') {
 return render(<StrictMode><MemoryRouter initialEntries={[url]}><Navigation /><Routes>
 <Route path="/kanban" element={<KanbanBoardPage />} />
 <Route path="/mensajes/:messageId" element={<MessageDetailPage />} />
 <Route path="/historial-pedidos/:orderId" element={<h1>Historial</h1>} />
 </Routes></MemoryRouter></StrictMode>)
}
beforeEach(() => {
 state.allowed = true
 state.api = { getOrders: vi.fn().mockResolvedValue({ items: [], pageInfo: { hasMore: true, nextCursor: 'next' } }),
 getOrderStatuses: vi.fn().mockResolvedValue([]), getProductionLoad: vi.fn().mockResolvedValue({}),
 getOrderDetail: vi.fn().mockImplementation(id => Promise.resolve(order(id))) }
 state.messages = { scopeId: 1, openMessage: vi.fn().mockResolvedValue({ message: { id_mensaje: 1, Asunto: 'Aviso', contenido: 'Texto', id_pedido: 85, pedido: { numero_nota_venta: '29049' } } }) }
})
afterEach(cleanup)
it('navega desde el mensaje, consulta un pedido fuera de la página y abre el OffCanvas real', async () => {
 mount('/mensajes/1')
 expect(await screen.findByText('Nota de Venta 29049')).toBeTruthy()
 fireEvent.click(screen.getByRole('link', { name: /Ver pedido en Kanban/ }))
 await screen.findByRole('dialog', { name: 'Detalle del pedido' })
 await screen.findByText('NV-85')
 expect(state.api.getOrderDetail).toHaveBeenCalledExactlyOnceWith(85, { signal: expect.any(AbortSignal) })
 expect(state.api.getOrders.mock.calls.every(([query]) => !query.cursor)).toBe(true)
 expect(screen.getByRole('button', { name: 'Solicita correccion' })).toBeTruthy()
})
it('URL directa y recarga abren; cerrar preserva otros parámetros y no reabre', async () => {
 const view = mount(); await screen.findByText('NV-85'); view.unmount()
 mount(); await screen.findByText('NV-85')
 fireEvent.click(screen.getByRole('button', { name: 'Cerrar detalle' }))
 await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
 await waitFor(() => expect(screen.getByTestId('url').textContent).toBe('/kanban?other=yes'))
 expect(state.api.getOrderDetail).toHaveBeenCalledTimes(2)
})
it('atrás y adelante sincronizan el panel sin ciclos', async () => {
 mount(); await screen.findByText('NV-85')
 fireEvent.click(screen.getByText('Tablero')); await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
 fireEvent.click(screen.getByText('Atrás')); await screen.findByText('NV-85')
 fireEvent.click(screen.getByText('Adelante')); await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
 expect(state.api.getOrderDetail).toHaveBeenCalledTimes(2)
})
it.each(['0', '-1', '1.2', 'abc', '1e2', '9007199254740992', '', '85&pedido=86'])('rechaza ID inválido %s sin consultar', async value => {
 mount(`/kanban?pedido=${value}&other=yes`)
 await screen.findByText('El identificador del pedido no es válido.')
 expect(state.api.getOrderDetail).not.toHaveBeenCalled()
 await waitFor(() => expect(screen.getByTestId('url').textContent).toBe('/kanban?other=yes'))
})
it.each([{ generalStepId: 4, orderStatus: 'Terminado' }, { generalStepId: 5, orderStatus: 'Cancelado' }])('abre históricos en el OffCanvas sin redirigir ni habilitar operaciones: %j', async status => {
 const pending = deferred(); state.api.getOrderDetail.mockReturnValueOnce(pending.promise); mount()
 await waitFor(() => expect(state.api.getOrderDetail).toHaveBeenCalledTimes(1))
 expect(screen.queryByRole('dialog')).toBeNull()
 expect(screen.getByText(/Consulta del pedido relacionado/)).toBeTruthy()
 await act(async () => pending.resolve(order(85, { ...status, items: [
   { id: 1, product: 'Tarjeta', subProcesses: [{ id: 1, name: 'Corte', status: 'done' }, { id: 2, name: 'Impresión', status: 'pending' }] },
 ] })))
 await screen.findByRole('dialog', { name: 'Detalle del pedido' })
 expect(screen.getByText('NV-85')).toBeTruthy()
 expect(screen.queryByRole('heading', { name: 'Historial' })).toBeNull()
 expect(screen.getByTestId('url').textContent).toBe('/kanban?pedido=85&other=yes')
 expect(screen.queryByRole('button', { name: /Cancelar pedido|Finalizar|Solicita correccion|Reevaluar/ })).toBeNull()
 expect(screen.getByRole('button', { name: 'Completado: Corte' }).disabled).toBe(true)
 expect(screen.getByRole('button', { name: 'Marcar como completo: Impresión' }).disabled).toBe(true)
 fireEvent.click(screen.getByRole('button', { name: 'Cerrar detalle' }))
 await waitFor(() => expect(screen.getByTestId('url').textContent).toBe('/kanban?other=yes'))
 expect(screen.queryByRole('dialog')).toBeNull()
})
it.each([[403, 'No tienes permiso para consultar este pedido.'], [404, 'El pedido no existe o ya no está disponible.'], [503, 'No fue posible cargar el detalle del pedido. Intenta nuevamente.']])('error %s usa Toast y limpia URL', async (status, message) => {
 state.api.getOrderDetail.mockRejectedValue({ status }); mount()
 expect(await screen.findByText(message)).toBeTruthy()
 expect(screen.queryByRole('dialog')).toBeNull()
 await waitFor(() => expect(screen.getByTestId('url').textContent).toBe('/kanban?other=yes'))
})
it('sin permisos no consulta el detalle solicitado', async () => {
 state.allowed = false; mount(); await screen.findByText('No tienes permiso para consultar pedidos.')
 expect(state.api.getOrderDetail).not.toHaveBeenCalled()
})
it('cancela solicitudes anteriores y descarta respuestas fuera de orden', async () => {
 const old = deferred(); state.api.getOrderDetail.mockReturnValueOnce(old.promise); mount()
 await waitFor(() => expect(state.api.getOrderDetail).toHaveBeenCalledTimes(1))
 const signal = state.api.getOrderDetail.mock.calls[0][1].signal
 fireEvent.click(screen.getByText('Otro pedido')); await screen.findByText('NV-86')
 expect(signal.aborted).toBe(true)
 await act(async () => old.resolve(order(85)))
 expect(screen.queryByText('NV-85')).toBeNull()
 expect(screen.getByText('NV-86')).toBeTruthy()
})
it('salir durante la consulta cancela y no permite una apertura tardía', async () => {
 const pending = deferred(); state.api.getOrderDetail.mockReturnValueOnce(pending.promise); mount()
 await waitFor(() => expect(state.api.getOrderDetail).toHaveBeenCalledTimes(1))
 expect(screen.queryByRole('dialog')).toBeNull()
 const signal = state.api.getOrderDetail.mock.calls[0][1].signal
 fireEvent.click(screen.getByText('Tablero'))
 await act(async () => pending.resolve(order(85)))
 expect(signal.aborted).toBe(true); expect(screen.queryByRole('dialog')).toBeNull()
})

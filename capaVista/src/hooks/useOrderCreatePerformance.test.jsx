import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ToastProvider from '../shared/notifications/ToastProvider'
import { useOrderCreateFlow } from './useOrderCreateFlow'
import OrderCreatePage from '../modules/orders/pages/OrderCreatePage'
import { createOrdersApi } from '../modules/orders/api/ordersApi'

const session = vi.hoisted(() => ({ api: null }))
vi.mock('../modules/orders/hooks/useOrdersApi', () => ({ useOrdersApi: () => session.api }))
vi.mock('./useAuth', () => ({ useAuth: () => ({ user: { nombreUsuario: 'Actor sintético' } }) }))
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
const note = (numeroNota = 'A') => ({ numeroNota, cliente: { nombre: `Cliente ${numeroNota}`, rut: '11111111-1' }, items: [{ codigo: 'P', producto: 'Lanyard sintético', cantidad: 3, tipoProducto: 'Lanyard' }], itemsSinSeguimientoProductivo: [{ codigo: 'ACC', producto: 'Accesorio sintético', cantidad: 2 }] })
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
afterEach(cleanup)
beforeEach(() => { session.api = { getSalesNote: vi.fn().mockResolvedValue(note()), createOrder: vi.fn().mockResolvedValue({ id: 1, salesNoteNumber: 'A' }) } })
const hook = () => renderHook(() => useOrderCreateFlow({ navigate: vi.fn() }), { wrapper: ToastProvider })
async function prepare(h) {
 act(() => h.result.current.actions.updateDraftField('salesNoteCode', 'A'))
 await act(() => h.result.current.actions.handleSearchSalesNote())
 act(() => h.result.current.actions.handleOpenConfirmModal())
 act(() => h.result.current.actions.handleConfirmRegister())
}

it('GET is single-flight even for synchronous repeated clicks; edits abort and ignore late results', async () => {
 const a = deferred(), b = deferred(); session.api.getSalesNote.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise)
 const h = hook(); act(() => h.result.current.actions.updateDraftField('salesNoteCode', 'A'))
 let first
 act(() => { first = h.result.current.actions.handleSearchSalesNote(); h.result.current.actions.handleSearchSalesNote() })
 expect(session.api.getSalesNote).toHaveBeenCalledTimes(1)
 const signal = session.api.getSalesNote.mock.calls[0][1].signal
 act(() => h.result.current.actions.updateDraftField('salesNoteCode', 'B')); expect(signal.aborted).toBe(true)
 let second; act(() => { second = h.result.current.actions.handleSearchSalesNote() })
 await act(async () => { b.resolve(note('B')); await second; a.resolve(note('A')); await first })
 expect(h.result.current.draft.managerRecord.numeroNota).toBe('B'); expect(h.result.current.errors).toEqual({ salesNoteCode: null })
})

it('reset aborts a read and prevents its error from restoring data or replacing the empty form', async () => {
 const request = deferred(); session.api.getSalesNote.mockReturnValue(request.promise)
 const h = hook(); act(() => h.result.current.actions.updateDraftField('salesNoteCode', 'A'))
 let pending; act(() => { pending = h.result.current.actions.handleSearchSalesNote() })
 act(() => h.result.current.actions.resetFlow()); expect(session.api.getSalesNote.mock.calls[0][1].signal.aborted).toBe(true)
 await act(async () => { request.reject(Error('network')); await pending })
 expect(h.result.current.draft.salesNoteCode).toBe(''); expect(h.result.current.errors).toEqual({}); expect(h.result.current.isSearching).toBe(false)
})

it('unmount aborts GET, never sends a POST for preparation or cancellation', async () => {
 const request = deferred(); session.api.getSalesNote.mockReturnValue(request.promise)
 const h = hook(); act(() => h.result.current.actions.updateDraftField('salesNoteCode', 'A'))
 let pending; act(() => { pending = h.result.current.actions.handleSearchSalesNote() }); h.unmount()
 expect(session.api.getSalesNote.mock.calls[0][1].signal.aborted).toBe(true)
 await act(async () => { request.resolve(note()); await pending }); expect(session.api.createOrder).not.toHaveBeenCalled()
})

it('editing priority or comments invalidates the old confirmation and rebuilds the correct frozen payload', async () => {
 const h = hook(); await prepare(h)
 act(() => h.result.current.actions.closeConfirmModal()); act(() => h.result.current.actions.updatePriority('contract'))
 act(() => h.result.current.actions.updateDraftField('comments', '  Cambio ñ  '))
 await act(() => h.result.current.actions.authorizeRegister({ pin: '123456' })); expect(session.api.createOrder).not.toHaveBeenCalled()
 act(() => h.result.current.actions.handleOpenConfirmModal()); act(() => h.result.current.actions.handleConfirmRegister())
 await act(() => h.result.current.actions.authorizeRegister({ pin: '123456' }))
 expect(session.api.createOrder).toHaveBeenCalledWith({ numeroNota: 'A', priority: 'contract', observacionInterna: 'Cambio ñ', pin: '123456' })
})

it('unknown POST result keeps the draft, blocks re-submit and requires an explicit fresh lookup', async () => {
 const h = hook(); await prepare(h); const draft = h.result.current.draft
 session.api.createOrder.mockRejectedValueOnce({ code: 'NETWORK_ERROR' })
 await act(async () => { await expect(h.result.current.actions.authorizeRegister({ pin: '123456' })).rejects.toEqual({ code: 'NETWORK_ERROR' }) })
 expect(h.result.current.needsReconciliation).toBe(true); expect(h.result.current.draft).toEqual(draft); expect(h.result.current.showPinModal).toBe(true)
 act(() => h.result.current.actions.handleOpenConfirmModal()); await act(async () => { await expect(h.result.current.actions.authorizeRegister({ pin: '123456' })).rejects.toMatchObject({ status: 409 }) })
 expect(session.api.createOrder).toHaveBeenCalledTimes(1); expect(session.api.getSalesNote).toHaveBeenCalledTimes(1)
 act(() => h.result.current.actions.closeConfirmModal())
 await act(() => h.result.current.actions.handleSearchSalesNote()); expect(h.result.current.needsReconciliation).toBe(false)
 expect(session.api.getSalesNote).toHaveBeenCalledTimes(2); expect(session.api.createOrder).toHaveBeenCalledTimes(1)
})

it('reconciliation duplicate preserves the draft, blocks a new POST and exposes the 409 message', async () => {
 const h = hook(); await prepare(h); session.api.createOrder.mockRejectedValueOnce({ status: 503 })
 await act(async () => { try { await h.result.current.actions.authorizeRegister({ pin: '123456' }) } catch { /* expected */ } })
 session.api.getSalesNote.mockRejectedValueOnce({ status: 409, payload: { message: 'Esta Nota de Venta ya fue registrada.' } })
 await act(() => h.result.current.actions.handleSearchSalesNote())
 expect(h.result.current.needsReconciliation).toBe(true); expect(h.result.current.draft.managerRecord.numeroNota).toBe('A')
 expect(h.result.current.errors.salesNoteCode).toBe('Esta Nota de Venta ya fue registrada.'); expect(session.api.createOrder).toHaveBeenCalledTimes(1)
})

it('in-flight POST ignores reset/edit/double submit and never forwards a cancellation signal', async () => {
 const request = deferred(), h = hook(); await prepare(h); session.api.createOrder.mockReturnValue(request.promise)
 let pending; act(() => { pending = h.result.current.actions.authorizeRegister({ pin: '123456' }) })
 act(() => { h.result.current.actions.resetFlow(); h.result.current.actions.updateDraftField('salesNoteCode', 'B'); h.result.current.actions.authorizeRegister({ pin: '123456' }) })
 expect(h.result.current.draft.salesNoteCode).toBe('A'); expect(session.api.createOrder).toHaveBeenCalledTimes(1)
 expect(session.api.createOrder.mock.calls[0]).toHaveLength(1)
 await act(async () => { request.resolve({ id: 1 }); await pending }); expect(h.result.current.draft.salesNoteCode).toBe('')
})

it('session/API change clears displayed products, accessories and PIN/confirmation state', async () => {
 const view = render(<ToastProvider><OrderCreatePage /></ToastProvider>)
 fireEvent.change(screen.getByLabelText(/Codigo de Nota de Venta/), { target: { value: 'A' } }); fireEvent.click(screen.getByRole('button', { name: 'Buscar informacion' }))
 await screen.findAllByText('Lanyard sintético'); expect(screen.getByText('Accesorio sintético')).toBeTruthy()
 fireEvent.click(screen.getByRole('button', { name: 'Registrar pedido' })); expect(screen.getByRole('dialog')).toBeTruthy()
 session.api = { getSalesNote: vi.fn(), createOrder: vi.fn() }; view.rerender(<ToastProvider><OrderCreatePage /></ToastProvider>)
 expect(screen.queryAllByText('Lanyard sintético')).toHaveLength(0); expect(screen.queryByRole('dialog')).toBeNull(); expect(screen.getByLabelText(/Codigo de Nota de Venta/).value).toBe('')
})

it('a late POST response from the previous session cannot clear or toast in the new session', async () => {
 const request = deferred(), oldApi = session.api; oldApi.createOrder.mockReturnValue(request.promise)
 const view = render(<ToastProvider><OrderCreatePage /></ToastProvider>)
 fireEvent.change(screen.getByLabelText(/Codigo de Nota de Venta/), { target: { value: 'A' } }); fireEvent.click(screen.getByRole('button', { name: 'Buscar informacion' })); await screen.findAllByText('Lanyard sintético')
 // Hook-level pending operation is also protected by its unmount cleanup.
 const h = hook(); await prepare(h); let pending; act(() => { pending = h.result.current.actions.authorizeRegister({ pin: '123456' }) }); h.unmount()
 session.api = { getSalesNote: vi.fn(), createOrder: vi.fn() }; view.rerender(<ToastProvider><OrderCreatePage /></ToastProvider>)
 await act(async () => { request.resolve({ id: 1 }); await pending })
 expect(screen.queryByText('Pedido registrado correctamente.')).toBeNull(); expect(screen.getByLabelText(/Codigo de Nota de Venta/).value).toBe('')
})

it('API forwards read signal and encoded number, and never retries a rejected POST', async () => {
 const get = vi.fn().mockResolvedValue(note()), post = vi.fn().mockRejectedValue({ code: 'NETWORK_ERROR' }), api = createOrdersApi({ get, post }), signal = new AbortController().signal
 await api.getSalesNote('ñ/A', { signal }); expect(get).toHaveBeenCalledWith('/orders/sales-notes/%C3%B1%2FA', { signal })
 await expect(api.createOrder({ numeroNota: 'A' })).rejects.toEqual({ code: 'NETWORK_ERROR' }); expect(post).toHaveBeenCalledTimes(1)
})

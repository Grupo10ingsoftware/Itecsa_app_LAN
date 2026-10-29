import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import PaymentConfirmationPage from './PaymentConfirmationPage'

const state = vi.hoisted(() => ({ api: null, allowed: true, canRevise: true, success: vi.fn(), error: vi.fn(), warning: vi.fn() }))
vi.mock('../hooks/usePaymentsApi', () => ({ usePaymentsApi: () => state.api }))
vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => ({ hasPermission: permission => state.allowed && (permission !== 'revise:payment-status' || state.canRevise) }) }))
vi.mock('../../../shared/notifications/useToast', () => ({ useToast: () => ({ success: state.success, error: state.error, warning: state.warning }) }))
vi.mock('../components/PaymentFilters', () => ({ default: p => <div>
  <output data-testid="counts">{JSON.stringify({ pending: p.getFilterCount('Pendiente'), confirmed: p.getFilterCount('Confirmado'), rejected: p.getFilterCount('Rechazado') })}</output>
  <input aria-label="Search" value={p.value.search} onChange={e => p.onChange({ search: e.target.value })} />
  <input aria-label="From" value={p.value.from} onChange={e => p.onChange({ from: e.target.value })} />
  <input aria-label="To" value={p.value.to} onChange={e => p.onChange({ to: e.target.value })} />
  {['Pendiente', 'Confirmado', 'Rechazado'].map(name => <button key={name} onClick={() => p.onChange({ status: name })}>{name}</button>)}
  <button onClick={p.onApply}>Apply</button><button onClick={p.onClear}>Clear filters</button>
</div> }))
vi.mock('../components/PaymentOrdersTable', () => ({ default: p => <section>{p.orders.map(o => <article key={o.id} data-testid={'row-' + o.id}>
  <span>{o.nvNumber}:{o.paymentStatus}</span>
  <button onMouseEnter={() => p.onPrefetchDetails(o)} onClick={() => p.onViewDetail(o)}>Detail {o.id}</button>
  <button disabled={p.isUpdatingPaymentStatus} onClick={() => p.onSelectStatus(o, 'Confirmado')}>Confirm {o.id}</button>
  <button disabled={p.isUpdatingPaymentStatus} onClick={() => p.onSelectStatus(o, 'Rechazado')}>Reject {o.id}</button>
</article>)}</section> }))
vi.mock('../components/PaymentOrderMobileList', () => ({ default: () => null }))
vi.mock('../components/PaymentActionConfirmModal', () => ({ default: p => p.order && <aside role="dialog" aria-label={p.mode === 'detail' ? 'Detail' : 'Action'}>
  <output>{p.order.nvNumber}:{p.order.trackedProducts?.[0]?.product}</output>
  {p.detailsError && <div role="alert">{p.detailsError}</div>}
  <button onClick={p.onCancel}>Close {p.mode === 'detail' ? 'detail' : 'action'}</button>
  {p.onValidate && <button disabled={p.isLoadingDetails || !!p.detailsError} onClick={p.onValidate}>PIN</button>}
</aside> }))
vi.mock('../components/PaymentCredentialsModal', () => ({ default: p => <aside role="dialog" aria-label="Credentials">
  <span>{p.isSubmitting ? 'Saving' : 'Ready'}</span><div>{p.errorMessage}</div>
  <button onClick={p.onCancel}>Close credentials</button>
  <button disabled={p.isSubmitting} onClick={() => { void p.onConfirm({ pin: '123456', comment: 'reason' }); void p.onConfirm({ pin: '123456', comment: 'reason' }) }}>Submit</button>
</aside> }))
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const dto = (id, paymentStatus = 'Pendiente') => ({ id, salesNoteNumber: 'NV-' + id, clientName: 'Client', clientBusinessName: null,
  clientRut: null, createdAt: '2026-01-01', paymentStatusId: paymentStatus === 'Confirmado' ? 2 : paymentStatus === 'Rechazado' ? 3 : 1, paymentStatus })
const page = (items = [dto(1)], hasMore = false) => ({ items, pageInfo: { hasMore, nextCursor: hasMore ? 'next' : null },
  counts: { pending: 10, confirmed: 5, rejected: 3 }, paymentStatuses: [{ id: 1, name: 'Pendiente' }, { id: 2, name: 'Confirmado' }, { id: 3, name: 'Rechazado' }] })
let scope = 0
beforeEach(() => {
  vi.clearAllMocks(); state.allowed = true; state.canRevise = true
  state.api = { scopeId: ++scope, getPaymentWorkspace: vi.fn().mockResolvedValue(page()),
    getPaymentPreview: vi.fn().mockResolvedValue({ nvNumber: 'NV-1', products: [{ id: 1, product: 'Synthetic product' }] }),
    updatePaymentStatus: vi.fn().mockResolvedValue(dto(1, 'Confirmado')) }
})
afterEach(() => { cleanup(); vi.useRealTimers() })
async function openCredentials(action = 'Confirm 1') {
  fireEvent.click(await screen.findByText(action));
  await waitFor(() => expect(screen.getByText('PIN').disabled).toBe(false))
  fireEvent.click(screen.getByText('PIN')); expect(screen.getByRole('dialog', { name: 'Credentials' })).toBeTruthy()
}

function usePagedRecords(count) {
  const records = Array.from({ length: count }, (_, index) => dto(index + 1))
  state.api.getPaymentWorkspace.mockImplementation(async params => ({
    ...page(records.slice((params.page - 1) * params.limit, params.page * params.limit)),
    counts: { pending: records.length, confirmed: 0, rejected: 0 },
  }))
  return records
}

it('always shows the footer with 10 selected, exact range and only the requested size options', async () => {
  usePagedRecords(7)
  render(<PaymentConfirmationPage />); await screen.findByTestId('row-7')
  expect(screen.getByText('Mostrando 1 a 7 de 7 resultados')).toBeTruthy()
  const select = screen.getByRole('combobox', { name: 'Filas por página' })
  expect(select.value).toBe('10')
  expect([...select.options].map(option => option.value)).toEqual(['10', '20', '30', '40', '50'])
  expect(screen.getByRole('button', { name: 'Página anterior' }).disabled).toBe(true)
  expect(screen.getByRole('button', { name: 'Página siguiente' }).disabled).toBe(true)
  expect(state.api.getPaymentWorkspace.mock.calls[0][0]).toMatchObject({ page: 1, limit: 10 })
})

it('shows a usable footer and zero range when there are no results', async () => {
  usePagedRecords(0)
  render(<PaymentConfirmationPage />)
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Filas por página' }).disabled).toBe(false))
  expect(screen.getByText('Mostrando 0 a 0 de 0 resultados')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Página siguiente' }).disabled).toBe(true)
})

it('navigates directly to numbered pages and back without accumulating rows or losing the total', async () => {
  usePagedRecords(67)
  render(<PaymentConfirmationPage />); await screen.findByTestId('row-10')
  fireEvent.click(screen.getByRole('button', { name: 'Página 5' }))
  await screen.findByTestId('row-41')
  expect(screen.getAllByTestId(/row-/)).toHaveLength(10)
  expect(screen.getByText('Mostrando 41 a 50 de 67 resultados')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Página anterior' }))
  await screen.findByTestId('row-31')
  expect(screen.queryByTestId('row-41')).toBeNull()
  expect(state.api.getPaymentWorkspace.mock.calls.map(([params]) => params.page)).toEqual([1, 5, 4])
})

it.each([20, 30, 40, 50])('requests and displays %s rows, resetting to the first page', async size => {
  usePagedRecords(67)
  render(<PaymentConfirmationPage />); await screen.findByTestId('row-10')
  fireEvent.click(screen.getByRole('button', { name: 'Página 2' })); await screen.findByTestId('row-11')
  fireEvent.change(screen.getByRole('combobox', { name: 'Filas por página' }), { target: { value: String(size) } })
  await screen.findByTestId('row-1')
  expect(screen.getAllByTestId(/row-/)).toHaveLength(size)
  expect(screen.getByText(`Mostrando 1 a ${size} de 67 resultados`)).toBeTruthy()
  expect(state.api.getPaymentWorkspace.mock.calls.at(-1)[0]).toMatchObject({ page: 1, limit: size })
})

it('keeps the selected size while filtering and returns to 10 after remounting the page', async () => {
  usePagedRecords(67)
  const view = render(<PaymentConfirmationPage />); await screen.findByTestId('row-10')
  fireEvent.change(screen.getByRole('combobox', { name: 'Filas por página' }), { target: { value: '20' } })
  await screen.findByTestId('row-20')
  fireEvent.click(screen.getByRole('button', { name: 'Página 2' })); await screen.findByTestId('row-21')
  fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'Cliente' } })
  fireEvent.click(screen.getByText('Apply')); await screen.findByTestId('row-1')
  expect(state.api.getPaymentWorkspace.mock.calls.at(-1)[0]).toMatchObject({ page: 1, limit: 20, search: 'Cliente' })
  view.unmount(); render(<PaymentConfirmationPage />); await screen.findByTestId('row-10')
  expect(screen.getByRole('combobox', { name: 'Filas por página' }).value).toBe('10')
  expect(state.api.getPaymentWorkspace.mock.calls.at(-1)[0]).toMatchObject({ page: 1, limit: 10 })
})

it('refills the current page after a committed decision and backs up if the last page becomes empty', async () => {
  const records = usePagedRecords(21)
  state.api.updatePaymentStatus.mockImplementation(async id => {
    records.splice(records.findIndex(record => record.id === id), 1)
    return dto(id, 'Confirmado')
  })
  render(<PaymentConfirmationPage />); await screen.findByTestId('row-10')
  fireEvent.click(screen.getByRole('button', { name: 'Página 3' })); await screen.findByTestId('row-21')
  await openCredentials('Confirm 21'); fireEvent.click(screen.getByText('Submit'))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  await screen.findByTestId('row-11')
  expect(screen.getByText('Mostrando 11 a 20 de 20 resultados')).toBeTruthy()
  expect(screen.getAllByTestId(/row-/)).toHaveLength(10)
  expect(state.api.updatePaymentStatus).toHaveBeenCalledTimes(1)
  expect(state.api.getPaymentWorkspace.mock.calls.map(([params]) => params.page)).toEqual([1, 3, 3, 2])
})

it('changes state using page-only mode, preserving counters and catalog; dates refresh affected summary', async () => {
  render(<PaymentConfirmationPage />); await screen.findByTestId('row-1')
  fireEvent.click(screen.getByText('Confirmado'))
  expect(state.api.getPaymentWorkspace).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByText('Apply'))
  await waitFor(() => expect(state.api.getPaymentWorkspace).toHaveBeenCalledTimes(2))
  expect(state.api.getPaymentWorkspace.mock.calls[1][0]).toMatchObject({ status: 'Confirmado', includeSummary: false })
  expect(screen.getByTestId('counts').textContent).toContain('10')
  fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-09-06' } })
  expect(state.api.getPaymentWorkspace).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByText('Apply'))
  await waitFor(() => expect(state.api.getPaymentWorkspace).toHaveBeenCalledTimes(3))
  expect(state.api.getPaymentWorkspace.mock.calls[2][0].includeSummary).toBeUndefined()
})
it('applies draft typing and clearing explicitly and resets the page', async () => {
  render(<PaymentConfirmationPage />); await screen.findByTestId('row-1')
  for (const value of ['a', 'ab', 'abc']) fireEvent.change(screen.getByLabelText('Search'), { target: { value } })
  expect(state.api.getPaymentWorkspace).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByText('Apply'))
  await waitFor(() => expect(state.api.getPaymentWorkspace).toHaveBeenCalledTimes(2))
  expect(state.api.getPaymentWorkspace.mock.calls[1][0]).toMatchObject({ search: 'abc', page: 1, limit: 10 })
  fireEvent.change(screen.getByLabelText('Search'), { target: { value: '' } })
  fireEvent.click(screen.getByText('Apply'))
  await waitFor(() => expect(state.api.getPaymentWorkspace).toHaveBeenCalledTimes(3))
  expect(state.api.getPaymentWorkspace.mock.calls[2][0].search).toBe('')
})
it('pagination replaces the page, blocks duplicate requests and skips the cached summary', async () => {
  const hold = deferred()
  state.api.getPaymentWorkspace.mockResolvedValueOnce({ ...page([dto(1)]), counts: { pending: 23, confirmed: 0, rejected: 0 } }).mockReturnValueOnce(hold.promise)
  render(<PaymentConfirmationPage />); await screen.findByTestId('row-1')
  fireEvent.click(screen.getByRole('button', { name: 'Página 2' }))
  fireEvent.click(screen.getByRole('button', { name: 'Página 2' }))
  await waitFor(() => expect(state.api.getPaymentWorkspace).toHaveBeenCalledTimes(2))
  expect(state.api.getPaymentWorkspace.mock.calls[1][0]).toMatchObject({ page: 2, limit: 10, includeSummary: false })
  await act(async () => hold.resolve(page([dto(11), dto(12)])))
  expect(screen.getAllByTestId(/row-/).map(n => n.dataset.testid)).toEqual(['row-11', 'row-12'])
  expect(screen.getByText('Mostrando 11 a 12 de 23 resultados')).toBeTruthy()
})
it('aborts obsolete pagination and ignores its late response after filters change', async () => {
  const old = deferred()
  state.api.getPaymentWorkspace.mockResolvedValueOnce({ ...page([dto(1)]), counts: { pending: 23, confirmed: 5, rejected: 3 } }).mockReturnValueOnce(old.promise).mockResolvedValue(page([dto(2)]))
  render(<PaymentConfirmationPage />); await screen.findByTestId('row-1')
  fireEvent.click(screen.getByRole('button', { name: 'Página 2' }))
  await waitFor(() => expect(state.api.getPaymentWorkspace).toHaveBeenCalledTimes(2))
  const signal = state.api.getPaymentWorkspace.mock.calls[1][1].signal
  fireEvent.click(screen.getByText('Rechazado')); fireEvent.click(screen.getByText('Apply')); await screen.findByTestId('row-2')
  expect(signal.aborted).toBe(true); await act(async () => old.resolve(page([dto(99)])))
  expect(screen.queryByTestId('row-99')).toBeNull()
})
it('prefetch is shared with opening and closing never reopens a late preview', async () => {
  const hold = deferred(); state.api.getPaymentPreview.mockReturnValue(hold.promise)
  render(<PaymentConfirmationPage />)
  const detail = await screen.findByText('Detail 1'); fireEvent.mouseEnter(detail); fireEvent.click(detail)
  await waitFor(() => expect(state.api.getPaymentPreview).toHaveBeenCalledTimes(1))
  fireEvent.click(screen.getByText('Close detail')); await act(async () => hold.resolve({ products: [] }))
  expect(screen.queryByRole('dialog')).toBeNull()
})
for (const target of ['Confirmado', 'Rechazado']) it(`waits for ${target} commit, sends one PATCH and reconciles the page and counters`, async () => {
  const hold = deferred(); state.api.updatePaymentStatus.mockReturnValue(hold.promise)
  state.api.getPaymentWorkspace.mockResolvedValueOnce(page()).mockResolvedValue(page([]))
  render(<PaymentConfirmationPage />); await openCredentials(target === 'Confirmado' ? 'Confirm 1' : 'Reject 1')
  fireEvent.click(screen.getByText('Submit'))
  expect(state.api.updatePaymentStatus).toHaveBeenCalledTimes(1)
  expect(screen.getByTestId('row-1').textContent).toContain('Pendiente')
  expect(screen.getByText('Saving')).toBeTruthy(); expect(state.success).not.toHaveBeenCalled()
  await act(async () => hold.resolve(dto(1, target)))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(screen.queryByTestId('row-1')).toBeNull(); expect(state.api.getPaymentWorkspace).toHaveBeenCalledTimes(2)
  expect(state.api.getPaymentWorkspace.mock.calls[1][0]).toMatchObject({ status: 'Pendiente', page: 1, limit: 10 })
  expect(state.success).toHaveBeenCalledTimes(1)
})
it('summary read failure after commit reports reconciliation failure without resending the mutation', async () => {
  state.api.getPaymentWorkspace.mockResolvedValueOnce(page()).mockRejectedValueOnce(Error('Summary unavailable'))
  render(<PaymentConfirmationPage />); await openCredentials(); fireEvent.click(screen.getByText('Submit'))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(screen.getByRole('alert').textContent).toContain('reconciliar')
  expect(state.api.updatePaymentStatus).toHaveBeenCalledTimes(1); expect(state.success).toHaveBeenCalledTimes(1)
})
it('revises a resolved decision using the existing reason/PIN flow and reconciles exact counters', async () => {
  state.api.getPaymentWorkspace.mockResolvedValue(page([dto(1, 'Confirmado')]))
  state.api.updatePaymentStatus.mockResolvedValue(dto(1, 'Rechazado'))
  render(<PaymentConfirmationPage />); await openCredentials('Reject 1')
  fireEvent.click(screen.getByText('Submit'))
  await waitFor(() => expect(state.success).toHaveBeenCalledTimes(1))
  expect(state.api.updatePaymentStatus).toHaveBeenCalledExactlyOnceWith(1, { pin: '123456', paymentStatusId: 3, observacion: 'reason' })
  expect(state.api.getPaymentWorkspace.mock.calls[1][0]).toMatchObject({ page: 1, limit: 10 })
})
it('PIN failures preserve the decision dialog and do not update rows, counters or read the workspace', async () => {
  state.api.updatePaymentStatus.mockRejectedValue({ status: 423, payload: { code: 'PIN_LOCKED', message: 'PIN bloqueado.' } })
  render(<PaymentConfirmationPage />); await openCredentials(); fireEvent.click(screen.getByText('Submit'))
  await screen.findByText('PIN bloqueado.')
  expect(screen.getByTestId('row-1').textContent).toContain('Pendiente')
  expect(screen.getByRole('dialog', { name: 'Credentials' })).toBeTruthy()
  expect(state.api.getPaymentWorkspace).toHaveBeenCalledTimes(1); expect(state.success).not.toHaveBeenCalled()
})
it('resolved decisions cannot open revision without the special capability', async () => {
  state.canRevise = false
  state.api.getPaymentWorkspace.mockResolvedValue(page([dto(1, 'Confirmado')]))
  render(<PaymentConfirmationPage />); fireEvent.click(await screen.findByText('Reject 1'))
  expect(state.warning).toHaveBeenCalledTimes(1); expect(screen.queryByRole('dialog')).toBeNull()
  expect(state.api.getPaymentPreview).not.toHaveBeenCalled(); expect(state.api.updatePaymentStatus).not.toHaveBeenCalled()
})
it('uncertain PATCH performs a read reconciliation and never silently retries or reports success', async () => {
  state.api.updatePaymentStatus.mockRejectedValue({ code: 'NETWORK_ERROR' })
  state.api.getPaymentWorkspace.mockResolvedValueOnce(page()).mockResolvedValue(page([dto(1, 'Confirmado')]))
  render(<PaymentConfirmationPage />); await openCredentials(); fireEvent.click(screen.getByText('Submit'))
  await waitFor(() => expect(state.api.getPaymentWorkspace).toHaveBeenCalledTimes(2))
  expect(state.api.getPaymentWorkspace.mock.calls[1][0].summaryOnly).toBeUndefined()
  expect(state.api.updatePaymentStatus).toHaveBeenCalledTimes(1); expect(state.success).not.toHaveBeenCalled()
  expect(screen.getByRole('dialog', { name: 'Credentials' }).textContent).toContain('Comprueba')
})
it('conflicts reload current data and require a new decision instead of showing a confirmed state', async () => {
  state.api.updatePaymentStatus.mockRejectedValue({ status: 409, payload: { message: 'El estado cambió.' } })
  render(<PaymentConfirmationPage />); await openCredentials(); fireEvent.click(screen.getByText('Submit'))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(state.api.getPaymentWorkspace).toHaveBeenCalledTimes(2); expect(state.success).not.toHaveBeenCalled()
  expect(screen.getByRole('alert').textContent).toContain('cambió')
})
it('a failed write after filter changes reconciles the current filter instead of restoring the captured one', async () => {
  const hold = deferred(); state.api.updatePaymentStatus.mockReturnValue(hold.promise)
  state.api.getPaymentWorkspace.mockImplementation(async params => page(params.status === 'Confirmado' ? [dto(2, 'Confirmado')] : [dto(1)]))
  render(<PaymentConfirmationPage />); await openCredentials(); fireEvent.click(screen.getByText('Submit'))
  fireEvent.click(screen.getByText('Confirmado')); fireEvent.click(screen.getByText('Apply')); await screen.findByTestId('row-2')
  await act(async () => hold.reject({ code: 'NETWORK_ERROR' }))
  await waitFor(() => expect(state.api.getPaymentWorkspace).toHaveBeenCalledTimes(3))
  expect(state.api.getPaymentWorkspace.mock.calls.slice(1).map(([params]) => params.status)).toEqual(['Confirmado', 'Confirmado'])
  expect(state.api.updatePaymentStatus).toHaveBeenCalledTimes(1); expect(state.success).not.toHaveBeenCalled()
})
it('session changes abort reads, discard previews and ignore a late successful write from the old account', async () => {
  const hold = deferred(); const old = state.api
  old.updatePaymentStatus.mockReturnValue(hold.promise)
  const view = render(<PaymentConfirmationPage />); await openCredentials(); fireEvent.click(screen.getByText('Submit'))
  state.api = { ...old, scopeId: ++scope, getPaymentWorkspace: vi.fn().mockResolvedValue(page([dto(2)])) }
  view.rerender(<PaymentConfirmationPage />); await screen.findByTestId('row-2')
  expect(old.getPaymentWorkspace.mock.calls[0][1].signal.aborted).toBe(true)
  await act(async () => hold.resolve(dto(1, 'Confirmado')))
  expect(screen.queryByTestId('row-1')).toBeNull(); expect(screen.queryByRole('dialog')).toBeNull(); expect(state.success).not.toHaveBeenCalled()
})
it('permission loss clears visible financial data and prevents reads', async () => {
  const view = render(<PaymentConfirmationPage />); await screen.findByTestId('row-1')
  state.allowed = false; view.rerender(<PaymentConfirmationPage />)
  await waitFor(() => expect(screen.queryByTestId('row-1')).toBeNull())
  expect(state.api.getPaymentWorkspace).toHaveBeenCalledTimes(1)
})
it('focus reconciles a remote decision and invalidates a previously warm preview', async () => {
  render(<PaymentConfirmationPage />); fireEvent.click(await screen.findByText('Detail 1'))
  await screen.findByText('NV-1:Synthetic product'); fireEvent.click(screen.getByText('Close detail'))
  fireEvent(window, new Event('focus'))
  await waitFor(() => expect(state.api.getPaymentWorkspace).toHaveBeenCalledTimes(2))
  fireEvent.click(await screen.findByText('Detail 1'))
  await waitFor(() => expect(state.api.getPaymentPreview).toHaveBeenCalledTimes(2))
})

import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import UserMovementsModal from './UserMovementsModal'
import { createAdminUsersApi } from '../api/adminUsersApi'
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const user = { idUsuarioAutenticacionExterna: 'a', nombreCompleto: 'Ana Soto' }
beforeEach(() => {
  if (!HTMLDialogElement.prototype.showModal) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, writable: true, value() {} })
  if (!HTMLDialogElement.prototype.close) Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, writable: true, value() {} })
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function () { this.open = true })
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function () { this.open = false })
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })
it('aborts history on target change and unmount; late history cannot appear for another user', async () => {
  const old = deferred(), next = deferred(), api = { getMovements: vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise) }
  const view = render(<UserMovementsModal user={user} api={api} onClose={() => {}} />)
  view.rerender(<UserMovementsModal user={{ ...user, idUsuarioAutenticacionExterna: 'b' }} api={api} onClose={() => {}} />)
  expect(api.getMovements.mock.calls[0][2].signal.aborted).toBe(true)
  await act(async () => { old.resolve({ records: [{ id: 1, detail: 'FOREIGN HISTORY' }], total: 1 }) })
  expect(screen.queryByText('FOREIGN HISTORY')).toBeNull()
  view.unmount(); expect(api.getMovements.mock.calls[1][2].signal.aborted).toBe(true)
})
it('search is explicit and each query owns cancellation; clearing resets search and page', async () => {
  const api = { getMovements: vi.fn().mockResolvedValue({ records: [], total: 21 }) }
  render(<UserMovementsModal user={user} api={api} onClose={() => {}} />)
  await act(async () => {})
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: ' diseño ' } })
  expect(api.getMovements).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'Buscar', exact: true })); await act(async () => {})
  expect(api.getMovements.mock.calls.at(-1)[1]).toMatchObject({ page: 1, search: 'diseño' })
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' })); await act(async () => {})
  expect(api.getMovements.mock.calls.at(-1)[1].page).toBe(2)
  fireEvent.click(screen.getByRole('button', { name: /Limpiar filtros/ })); await act(async () => {})
  expect(api.getMovements.mock.calls.at(-1)[1]).toMatchObject({ page: 1, search: '' })
})
it('aborting a signaled reader cannot poison a shared unsignaled reader', async () => {
  const pending = deferred(), apiClient = { get: vi.fn().mockReturnValue(pending.promise) }, api = createAdminUsersApi(apiClient)
  const shared = api.getMovements('a'), sharedAgain = api.getMovements('a')
  const controller = new AbortController(); const owned = api.getMovements('a', {}, { signal: controller.signal })
  expect(shared).toBe(sharedAgain); expect(owned).not.toBe(shared); expect(apiClient.get).toHaveBeenCalledTimes(2)
  controller.abort(); pending.resolve({ records: [], total: 0 }); expect((await shared).total).toBe(0); await owned
})

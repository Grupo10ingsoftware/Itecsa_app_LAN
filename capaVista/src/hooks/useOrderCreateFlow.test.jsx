import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ToastProvider from '../shared/notifications/ToastProvider'
import { useOrderCreateFlow } from './useOrderCreateFlow'

const api = vi.hoisted(() => ({ getSalesNote: vi.fn(), createOrder: vi.fn() }))
vi.mock('../modules/orders/hooks/useOrdersApi', () => ({ useOrdersApi: () => api }))
afterEach(cleanup)
beforeEach(() => {
  api.getSalesNote.mockReset().mockResolvedValue({ numeroNota: 'NV-1', items: [] })
  api.createOrder.mockReset().mockResolvedValue({ id: 1 })
})
async function prepare() {
  const hook = renderHook(() => useOrderCreateFlow({ navigate: vi.fn() }), { wrapper: ToastProvider })
  act(() => hook.result.current.actions.updateDraftField('salesNoteCode', 'NV-1'))
  act(() => hook.result.current.actions.updateDraftField('comments', 'Conservar esta observación'))
  await act(() => hook.result.current.actions.handleSearchSalesNote())
  act(() => hook.result.current.actions.handleOpenConfirmModal())
  act(() => hook.result.current.actions.handleConfirmRegister())
  return hook
}
it('does not persist before PIN and cancellation preserves all entered data', async () => {
  const hook = await prepare()
  const draft = hook.result.current.draft
  expect(hook.result.current.showPinModal).toBe(true)
  expect(api.createOrder).not.toHaveBeenCalled()
  act(() => hook.result.current.actions.closeConfirmModal())
  expect(hook.result.current.showPinModal).toBe(false)
  expect(hook.result.current.draft).toEqual(draft)
  expect(api.createOrder).not.toHaveBeenCalled()
})
it('failed PIN preserves draft and frozen payload for a fresh successful retry', async () => {
  const hook = await prepare()
  const draft = hook.result.current.draft
  api.createOrder.mockRejectedValueOnce({ payload: { code: 'PIN_INVALID' } })
  await act(async () => {
    await expect(hook.result.current.actions.authorizeRegister({ pin: '000000' })).rejects.toEqual({ payload: { code: 'PIN_INVALID' } })
  })
  expect(hook.result.current.draft).toEqual(draft)
  expect(hook.result.current.showPinModal).toBe(true)
  await act(() => hook.result.current.actions.authorizeRegister({ pin: '123456' }))
  expect(api.createOrder.mock.calls[1][0]).toEqual({ ...api.createOrder.mock.calls[0][0], pin: '123456' })
  expect(hook.result.current.showPinModal).toBe(false)
  expect(hook.result.current.draft.salesNoteCode).toBe('')
})
it('repeated submissions cannot register twice', async () => {
  const hook = await prepare()
  let resolve
  api.createOrder.mockImplementation(() => new Promise(done => { resolve = done }))
  let first
  act(() => { first = hook.result.current.actions.authorizeRegister({ pin: '123456' }) })
  await act(() => hook.result.current.actions.authorizeRegister({ pin: '123456' }))
  expect(api.createOrder).toHaveBeenCalledTimes(1)
  await act(async () => { resolve({ id: 1 }); await first })
})

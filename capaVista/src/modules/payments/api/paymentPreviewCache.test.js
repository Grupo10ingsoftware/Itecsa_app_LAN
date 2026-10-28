import { expect, it, vi } from 'vitest'
import { createPaymentPreviewCache } from './paymentPreviewCache'
import { createPaymentsApi } from './paymentsApi'
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }

it('shares prefetch/open promises, expires at 15 seconds and retries rejected reads', async () => {
  let time = 0
  const hold = deferred()
  const api = { getPaymentPreview: vi.fn().mockReturnValueOnce(hold.promise).mockResolvedValue({ products: [] }) }
  const cache = createPaymentPreviewCache(api, { now: () => time })
  const prefetched = cache.get(1, { prefetch: true })
  expect(cache.get(1)).toBe(prefetched)
  hold.resolve({ products: [{ id: 1 }] }); await prefetched
  expect(await cache.get(1)).toEqual({ products: [{ id: 1 }] }); expect(api.getPaymentPreview).toHaveBeenCalledTimes(1)
  time = 15000; await cache.get(1); expect(api.getPaymentPreview).toHaveBeenCalledTimes(2)
  cache.invalidate(1); api.getPaymentPreview.mockRejectedValueOnce(Error('Transient'))
  await expect(cache.get(1)).rejects.toThrow('Transient')
  await cache.get(1); expect(api.getPaymentPreview).toHaveBeenCalledTimes(4)
})
it('invalidation aborts old reads and a late response cannot replace a fresh result', async () => {
  const old = deferred()
  const api = { getPaymentPreview: vi.fn().mockReturnValueOnce(old.promise).mockResolvedValue({ version: 'fresh' }) }
  const cache = createPaymentPreviewCache(api)
  const promise = cache.get(1); const rejected = expect(promise).rejects.toMatchObject({ name: 'AbortError' })
  await Promise.resolve(); const signal = api.getPaymentPreview.mock.calls[0][1].signal
  cache.invalidate(1); expect(signal.aborted).toBe(true)
  await cache.get(1); old.resolve({ version: 'old' }); await rejected
  expect(await cache.get(1)).toEqual({ version: 'fresh' })
})
it('limits speculative reads to two, bounds entries and allows explicit user reads', async () => {
  const holds = [deferred(), deferred(), deferred()]
  const api = { getPaymentPreview: vi.fn().mockImplementation(id => holds[id - 1].promise) }
  const cache = createPaymentPreviewCache(api, { maxEntries: 3 })
  const a = cache.get(1, { prefetch: true }), b = cache.get(2, { prefetch: true })
  expect(await cache.get(3, { prefetch: true })).toBeNull()
  const c = cache.get(3); await Promise.resolve(); expect(api.getPaymentPreview).toHaveBeenCalledTimes(3)
  holds.forEach(h => h.resolve({ products: [] })); await Promise.all([a, b, c]); cache.clear()
  for (const call of api.getPaymentPreview.mock.calls) expect(call[1].signal.aborted).toBe(true)
})
it('never reuses another workspace cache and clears cached results on permission errors', async () => {
  const api = { getPaymentPreview: vi.fn().mockResolvedValue({ products: [] }) }
  const first = createPaymentPreviewCache(api), second = createPaymentPreviewCache(api)
  await first.get(1); await second.get(1); expect(api.getPaymentPreview).toHaveBeenCalledTimes(2)
  api.getPaymentPreview.mockRejectedValueOnce({ status: 403 })
  await expect(first.get(2)).rejects.toEqual({ status: 403 })
  await first.get(1); expect(api.getPaymentPreview).toHaveBeenCalledTimes(4)
})
it('API instances isolate session scopes and forward cancellation exclusively to GET', async () => {
  const workspace = { items: [], pageInfo: { nextCursor: null, hasMore: false }, counts: null, paymentStatuses: [] }
  const dto = { id: 1, salesNoteNumber: null, createdAt: null, clientName: null, clientBusinessName: null,
    clientRut: null, paymentStatusId: 2, paymentStatus: 'Confirmado' }
  const client = { get: vi.fn().mockResolvedValue(workspace), patch: vi.fn().mockResolvedValue(dto) }
  const api = createPaymentsApi(client), other = createPaymentsApi(client)
  expect(api.scopeId).not.toBe(other.scopeId)
  const signal = new AbortController().signal
  await api.getPaymentWorkspace({ includeSummary: false, search: 'A&B' }, { signal })
  expect(client.get).toHaveBeenLastCalledWith('/orders/payments?includeSummary=false&search=A%26B', { signal })
  await api.getPaymentPreview(1, { signal }); expect(client.get).toHaveBeenLastCalledWith('/orders/1/payment-records/preview', { signal })
  const payload = { pin: '123456', paymentStatusId: 2 }
  await api.updatePaymentStatus(1, payload)
  expect(client.patch).toHaveBeenCalledExactlyOnceWith('/orders/1/payment-status', payload)
})

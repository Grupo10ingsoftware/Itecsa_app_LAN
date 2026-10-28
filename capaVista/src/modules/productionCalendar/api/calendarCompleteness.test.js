import { expect, it, vi } from 'vitest'
import { createOrdersCalendarApi, loadCalendarMonth } from './ordersCalendarApi'

it('calendar completeness traverses every page and carries the same read cancellation signal', async () => {
  let page = 0
  const api = { getOrders: vi.fn().mockImplementation(async () => {
    page++
    return { items: Array.from({ length: 100 }, (_, i) => ({ id: page * 100 + i })), pageInfo: { hasMore: page < 3, nextCursor: page < 3 ? String(page) : null } }
  }) }
  const controller = new AbortController()
  const result = await loadCalendarMonth(api, { from: '2026-10-01', to: '2026-10-31' }, () => true, { signal: controller.signal })
  expect(result).toHaveLength(300); expect(new Set(result.map(x => x.id)).size).toBe(300)
  expect(api.getOrders.mock.calls.map(x => x[0].cursor)).toEqual([null, '1', '2'])
  expect(api.getOrders.mock.calls.every(x => x[1].signal === controller.signal)).toBe(true)
})
it('leaving a calendar load stops page traversal; repeated cursors fail instead of looping forever', async () => {
  const api = { getOrders: vi.fn().mockResolvedValue({ items: [{ id: 1 }], pageInfo: { hasMore: true, nextCursor: 'repeat' } }) }
  expect(await loadCalendarMonth(api, {}, () => false)).toEqual([]); expect(api.getOrders).toHaveBeenCalledOnce()
  api.getOrders.mockClear()
  await expect(loadCalendarMonth(api, {})).rejects.toThrow('repitió un cursor')
  expect(api.getOrders).toHaveBeenCalledTimes(2)
})
it('calendar API forwards AbortSignal without changing endpoint/query semantics', async () => {
  const controller = new AbortController(), client = { get: vi.fn().mockResolvedValue({ items: [], pageInfo: { hasMore: false, nextCursor: null } }) }
  const api = createOrdersCalendarApi(client)
  await api.getOrders({ from: '2026-10-01', to: '2026-10-31', cursor: 'next', limit: 100 }, { signal: controller.signal })
  expect(client.get).toHaveBeenCalledWith('/orders/calendar-summary?limit=100&from=2026-10-01&to=2026-10-31&cursor=next', { signal: controller.signal })
})

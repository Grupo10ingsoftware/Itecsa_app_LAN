import { parseCalendarOrderDetailDTO, parseCalendarPageDTO } from '../../orders/utils/orderDto'

export function createOrdersCalendarApi(apiClient) {
  return {
    getOrders: ({ from, to, cursor, limit = 100, unscheduled = false } = {}, { signal } = {}) => {
      const query = new URLSearchParams({ limit: String(limit) })
      if (from) query.set('from', from)
      if (to) query.set('to', to)
      if (cursor) query.set('cursor', cursor)
      if (unscheduled) query.set('unscheduled', 'true')
      return apiClient.get(`/orders/calendar-summary?${query.toString()}`, { signal }).then(parseCalendarPageDTO)
    },
    getOrderDetail: (orderId) => apiClient.get(`/orders/${orderId}/calendar-detail`).then(parseCalendarOrderDetailDTO),
    updateDeliveryDate: (orderId, dueDate, payload = {}) =>
      apiClient.patch(`/orders/${orderId}/delivery-date`, {
        dueDate,
        pin: payload.pin,
      }).then(parseCalendarOrderDetailDTO),
  }
}

export const loadUnscheduledOrders = (api, isActive = () => true, options) =>
  loadCalendarMonth(api, { unscheduled: true }, isActive, options)

export async function loadCalendarMonth(api, range, isActive = () => true, options) {
  const orders = []
  const seenCursors = new Set()
  let cursor = null
  do {
    const result = await api.getOrders({ ...range, cursor }, options)
    if (!isActive()) return []
    orders.push(...(result.items ?? []))
    cursor = result.pageInfo?.hasMore ? result.pageInfo.nextCursor : null
    if (cursor && seenCursors.has(cursor)) throw new Error('El servidor repitió un cursor de calendario.')
    if (cursor) seenCursors.add(cursor)
  } while (cursor)
  return orders
}

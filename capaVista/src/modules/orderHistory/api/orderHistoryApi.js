function queryString(params = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value))
  })
  const value = query.toString()
  return value ? `?${value}` : ''
}

export function createOrderHistoryApi(apiClient) {
  const read = (path, { signal, ...params } = {}) => apiClient.get(`${path}${queryString(params)}`, { signal })
  return {
    listOrders: (params) => read('/history/orders', params),
    getOrderHistory: (orderId, params = {}) =>
      read(`/history/orders/${orderId}`, params),
    listOrderEvents: (orderId, params = {}) =>
      read(`/history/orders/${orderId}/events`, params),
  }
}

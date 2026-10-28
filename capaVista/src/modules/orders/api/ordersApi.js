import { parseOrderCreatedDTO } from '../utils/orderDto'

const scopes = new WeakMap()
let nextScope = 0
export function getOrderApiScope(api) {
  if (!scopes.has(api)) scopes.set(api, ++nextScope)
  return scopes.get(api)
}

export function createOrdersApi(apiClient) {
  return {
    getSalesNote: (numeroNota, { signal } = {}) =>
      apiClient.get(`/orders/sales-notes/${encodeURIComponent(numeroNota)}`, { signal }),
    createOrder: (payload) => apiClient.post('/orders', payload).then(parseOrderCreatedDTO),
  }
}

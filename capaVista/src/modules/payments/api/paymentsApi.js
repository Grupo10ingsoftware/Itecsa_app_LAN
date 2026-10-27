import { parsePaymentOrderDTO, parsePaymentWorkspaceDTO } from '../../orders/utils/orderDto'

let nextScopeId = 0
export function createPaymentsApi(apiClient) {
  return {
    scopeId: ++nextScopeId,
    getPaymentWorkspace: (params = {}, options = {}) => {
      const query = new URLSearchParams()
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') query.set(key, String(value))
      })
      return apiClient.get(`/orders/payments?${query.toString()}`, options).then(parsePaymentWorkspaceDTO)
    },
    getPaymentPreview: (orderId, options = {}) =>
      apiClient.get(`/orders/${orderId}/payment-records/preview`, options),
    updatePaymentStatus: (orderId, payload) =>
      apiClient.patch(`/orders/${orderId}/payment-status`, payload).then(parsePaymentOrderDTO),
  }
}

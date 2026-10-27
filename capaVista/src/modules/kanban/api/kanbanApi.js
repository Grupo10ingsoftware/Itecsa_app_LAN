import {
  parseKanbanOrderDetailDTO,
  parseKanbanPageDTO,
  parseOrderLabelsPatchDTO,
  parseOrderStagePatchDTO,
} from '../../orders/utils/orderDto'

export function createKanbanApi(apiClient, { now = Date.now, statusTtlMs = 30_000 } = {}) {
  let statuses, statusesExpireAt = 0, statusFlight
  function getOrderStatuses({ force = false } = {}) {
    if (!force && statuses && now() < statusesExpireAt) return Promise.resolve(statuses)
    if (!statusFlight) statusFlight = apiClient.get('/order-status').then(result => {
      if (Array.isArray(result)) { statuses = result; statusesExpireAt = now() + statusTtlMs }
      return result
    }).catch(error => {
      statuses = undefined
      statusesExpireAt = 0
      throw error
    }).finally(() => { statusFlight = null })
    return statusFlight
  }
  const queryString = (params = {}) => {
    const query = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') query.set(key, String(value))
    })
    return query.size ? `?${query.toString()}` : ''
  }
  return {
    getOrders: (params, options) => apiClient.get(`/orders/kanban-summary${queryString(params)}`, options).then(parseKanbanPageDTO),
    getOrderDetail: (orderId, { precheck = false, ...options } = {}) =>
      apiClient.get(`/orders/${orderId}/${precheck ? 'kanban-precheck' : 'kanban-detail'}`, options).then(parseKanbanOrderDetailDTO),
    getOrderStatuses,
    moveOrder: (orderId, generalStepId, audit = {}) =>
      apiClient.request(`/orders/${orderId}/move`, {
        method: 'PATCH',
        body: {
          generalStepId,
          pin: audit.pin,
          comment: audit.comment,
        },
      }).then(parseOrderStagePatchDTO),
    completeSubprocess: (orderId, detailId, subprocessId, payload = {}) =>
      apiClient.patch(`/orders/${orderId}/details/${detailId}/subprocesses/${subprocessId}/complete`, {
        pin: payload.pin,
        comment: payload.comment,
      }).then(parseKanbanOrderDetailDTO),
    sendToReview: (orderId, comment) =>
      apiClient.patch(`/orders/${orderId}/review`, { comment }).then(parseKanbanOrderDetailDTO),
    cancelProduction: (orderId, payload = {}) =>
      apiClient.patch(`/orders/${orderId}/cancel-production`, {
        pin: payload.pin,
        comment: payload.comment,
      }),
    rollbackSubprocess: (orderId, detailId, subprocessId, payload = {}) =>
      apiClient.patch(`/orders/${orderId}/details/${detailId}/subprocesses/${subprocessId}/rollback`, payload).then(parseKanbanOrderDetailDTO),
    reevaluate: (orderId) => apiClient.patch(`/orders/${orderId}/reevaluate`, {}).then(parseKanbanOrderDetailDTO),
    setLabel: (orderId, label, active) => apiClient.patch(`/orders/${orderId}/labels`, { label, active }).then(parseOrderLabelsPatchDTO),
    getCapacities: () => apiClient.get('/production-capacity'),
    updateCapacities: (capacities) => apiClient.patch('/production-capacity', { capacities }),
    getProductionLoad: options => apiClient.get('/production-load/today', options),
    updateProductionLoad: (entries) => apiClient.patch('/production-load/today', { entries }),
  }
}

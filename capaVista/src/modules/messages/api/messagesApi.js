function toQueryString(params = {}) {
  const query = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value))
    }
  })

  const serialized = query.toString()
  return serialized ? `?${serialized}` : ''
}

let nextScope = 0
export function createMessagesApi(apiClient) {
  return {
    scopeId: ++nextScope,
    getInbox: (params, options = {}) => apiClient.get(`/messages${toQueryString(params)}`, options),
    getMessage: (messageId, options = {}) => apiClient.get(`/messages/${messageId}`, options),
    openMessage: (messageId) => apiClient.post(`/messages/${messageId}/open`, {}),
    getNotifications: (limit = 10, { signal, revision, compact = false } = {}) =>
      apiClient.get(`/messages/notifications${toQueryString({ limit, ...(compact ? { view: 'bell', revision } : {}) })}`, { signal }),
    markAsRead: (messageId) => apiClient.patch(`/messages/${messageId}/read`, {}),
    hideNotification: (messageId) =>
      apiClient.patch(`/messages/notifications/${messageId}`),
    clearNotifications: () => apiClient.patch('/messages/notifications'),
  }
}

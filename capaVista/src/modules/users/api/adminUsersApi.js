function buildQueryString(params) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && String(value).trim() !== '') query.set(key, String(value))
  }
  return query.size ? '?' + query.toString() : ''
}

export function createAdminUsersApi(apiClient) {
  const base = '/admin/identity/users'
  const unavailable = async () => { throw Object.assign(new Error('Operacion no habilitada'), {
    status: 503, payload: { code: 'IDENTITY_OPERATION_NOT_IMPLEMENTED', message: 'Esta operacion todavia no esta habilitada para Keycloak.' },
  }) }
  const movementsInFlight = new Map()
  function getMovements(subject, { page = 1, perPage = 10, search = '' } = {}) {
    const key = JSON.stringify([subject, page, perPage, search])
    const current = movementsInFlight.get(key)
    if (current) return current
    const request = apiClient.get(base + '/' + encodeURIComponent(subject) + '/movements' +
      buildQueryString({ page, perPage, search })).finally(() => {
      if (movementsInFlight.get(key) === request) movementsInFlight.delete(key)
    })
    movementsInFlight.set(key, request)
    return request
  }
  return {
    listUsers: ({ page = 1, perPage = 10, search = '', estadoUsuario = '', rolUsuario = '' } = {}) =>
      apiClient.get(base + buildQueryString({ page, perPage, search, estadoUsuario, rolUsuario })),
    getMovements,
    getSummary: () => apiClient.get(base + '/summary'),
    inspectUser: subject => apiClient.get('/admin/identity/identities/' + encodeURIComponent(subject)),
    reconcile: ({ operationId, pin }) => apiClient.post('/admin/identity/operations/' + encodeURIComponent(operationId) + '/reconcile', { pin }),
    createUser: ({ username, nombreUsuario, apellidoUsuario, correoUsuario, rutUsuario, rolUsuario, pin }) =>
      apiClient.post('/admin/identity/identities/prepare', { pin, identity: {
        username, firstName: nombreUsuario, lastName: apellidoUsuario, email: correoUsuario, rut: rutUsuario, role: rolUsuario,
      } }),
    setTemporaryPassword: unavailable,
    updateUser: unavailable,
    unlinkUser: unavailable,
  }
}

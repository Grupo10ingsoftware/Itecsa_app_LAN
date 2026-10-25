import { USER_STATUS } from '../../../config/userLifecycle.js'

function buildQueryString(params) {
  const searchParams = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      searchParams.set(key, String(value))
    }
  })

  const queryString = searchParams.toString()
  return queryString ? `?${queryString}` : ''
}

export function createAdminUsersApi(apiClient, { provider = 'auth0' } = {}) {
  const keycloak = provider === 'keycloak'
  const base = keycloak ? '/admin/identity/users' : '/admin/users'
  const unavailable = async () => { throw Object.assign(new Error('Operacion no habilitada'), { status: 503,
    payload: { code: 'IDENTITY_OPERATION_NOT_IMPLEMENTED', message: 'Esta operacion todavia no esta habilitada para Keycloak.' } }) }
  // Deduplicate only simultaneous reads. Completed activity is never retained:
  // each deliberate reopen must be authorized by the backend again.
  const movementsInFlight = new Map()
  function getMovements(userId, { page = 1, perPage = 10, search = '' } = {}) {
    const key = JSON.stringify([userId, page, perPage, search])
    const inFlight = movementsInFlight.get(key)
    if (inFlight) return inFlight

    const request = apiClient.get(
      `${base}/${encodeURIComponent(userId)}/movements${buildQueryString({ page, perPage, search })}`,
    ).finally(() => {
      if (movementsInFlight.get(key) === request) movementsInFlight.delete(key)
    })
    movementsInFlight.set(key, request)
    return request
  }

  return {
    listUsers: ({ page = 1, perPage = 10, search = '', estadoUsuario = '', rolUsuario = '' } = {}) =>
      apiClient.get(
        `${base}${buildQueryString({
          page,
          perPage,
          search,
          estadoUsuario,
          rolUsuario,
        })}`,
    ),
    getMovements,
    inspectUser: userId => apiClient.get(`/admin/identity/identities/${encodeURIComponent(userId)}`),
    reconcile: ({ operationId, pin }) => apiClient.post(`/admin/identity/operations/${encodeURIComponent(operationId)}/reconcile`, { pin }),
    setTemporaryPassword: keycloak ? unavailable : ({ userId, pin, identityVerified }) => apiClient.post(
      `/admin/users/${encodeURIComponent(userId)}/temporary-password`, { pin, identityVerified }),
    getSummary: () => apiClient.get(`${base}/summary`),
    createUser: keycloak ? ({ username, nombreUsuario, apellidoUsuario, correoUsuario, rolUsuario, pin }) =>
      apiClient.post('/admin/identity/identities/prepare', { pin, identity: { username, firstName: nombreUsuario,
        lastName: apellidoUsuario, email: correoUsuario || null, role: rolUsuario } }) : ({ nombreUsuario, apellidoUsuario, rutUsuario, correoUsuario, rolUsuario }) =>
      apiClient.post('/admin/users', {
        nombreUsuario,
        apellidoUsuario,
        rutUsuario,
        correoUsuario,
        rolUsuario,
      }),
    updateUser: keycloak ? unavailable : ({
      idUsuarioAutenticacionExterna,
      nombreUsuario,
      apellidoUsuario,
      correoUsuario,
      rolUsuario,
      pin,
    }) =>
      apiClient.patch(`/admin/users/${encodeURIComponent(idUsuarioAutenticacionExterna)}`, {
        nombreUsuario,
        apellidoUsuario,
        correoUsuario,
        rolUsuario,
        pin,
      }),
    unlinkUser: keycloak ? unavailable : ({ idUsuarioAutenticacionExterna, pin }) =>
      apiClient.patch(`/admin/users/${encodeURIComponent(idUsuarioAutenticacionExterna)}/status`, {
        estadoUsuario: USER_STATUS.UNLINKED,
        pin,
      }),
    requestPasswordSetupEmail: keycloak ? unavailable : ({ correoUsuario }) =>
      apiClient.post('/admin/users/password-setup-email', { correoUsuario }),
  }
}

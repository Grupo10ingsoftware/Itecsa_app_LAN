import { runtimeConfig } from '../../../config/runtimeConfig.js'

export async function resumePinRecoverySession(state) {
  const base = runtimeConfig.apiBaseUrl.replace(/\/$/, '')
  const response = await fetch(base + '/auth/pin/recovery/resume', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state }),
  })
  if (!response.ok) throw Error('No fue posible restaurar la sesión original. Vuelve a iniciar sesión con tu cuenta.')
  return response.json()
}

export function createAuthApi(apiClient, { subject, getRecoveryRefreshToken } = {}) {
  // Share only simultaneous profile reads (e.g. StrictMode mount effects).
  // Settled personal data is never cached; every later visit is authorized again.
  let profileInFlight
  function getProfile() {
    if (profileInFlight && profileInFlight.subject === subject) return profileInFlight.request
    const request = apiClient.get('/auth/profile').finally(() => {
      if (profileInFlight?.request === request) profileInFlight = null
    })
    profileInFlight = { subject, request }
    return request
  }
  return {
    getProfile,
    getProfileMovements: ({ page = 1, perPage = 10, search = '' } = {}) =>
      apiClient.get(`/auth/profile/movements?${new URLSearchParams({ page, perPage, ...(search ? { search } : {}) })}`),
    verify: () => apiClient.get('/auth/verify'),
    revealPin: () => apiClient.post('/auth/pin/reveal', {}),
    acknowledgePin: () => apiClient.post('/auth/pin/acknowledge', {}),
    startPinRecovery: async () => apiClient.post('/auth/pin/recovery/start', {
      refreshToken: await getRecoveryRefreshToken(),
    }, { credentials: 'include' }),
    finishPinRecovery: (response) => apiClient.post('/auth/pin/recovery/finish', response),
    cancelPinRecovery: (state) => apiClient.post('/auth/pin/recovery/cancel', { state }, { credentials: 'include' }),
  }
}

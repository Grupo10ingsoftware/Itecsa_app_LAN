import { createApiClient } from '../../services/api/apiClient.js'
import { createAuthApi, resumePinRecoverySession } from './api/authApi.js'

export const PIN_RECOVERY_CALLBACK = '/auth/pin-recovery/callback'
export const PIN_RECOVERY_CONTEXT = 'itecsa.pin-recovery.navigation'
const returns = new WeakMap()
let outcome = null
export const getPinRecoveryOutcome = subject => outcome?.subject === subject ? outcome : null
export const clearPinRecoveryOutcome = () => { outcome = null }
export function hasPinRecoveryContext(browser = window) {
  try { return Boolean(browser.sessionStorage.getItem(PIN_RECOVERY_CONTEXT)) } catch { return false }
}

export function beginPinRecovery(api, browser = window) {
  let state, cancelled = false, departing = false, rejectResult
  const clearContext = () => { try { browser.sessionStorage.removeItem(PIN_RECOVERY_CONTEXT) } catch { /* Storage can be disabled. */ } }
  const result = new Promise((_, reject) => { rejectResult = reject })
  const cancel = () => {
    if (departing || cancelled) return
    cancelled = true
    if (state) void api.cancelPinRecovery(state).catch(() => {})
    clearContext()
    rejectResult(Error('Recuperación cancelada.'))
  }
  void api.startPinRecovery().then(response => {
    state = response.state
    if (cancelled) { void api.cancelPinRecovery(state).catch(() => {}); return }
    // Only public correlation metadata survives the navigation, never tokens or credentials.
    browser.sessionStorage.setItem(PIN_RECOVERY_CONTEXT, JSON.stringify({ state, expiresAt: Date.now() + 300_000 }))
    // Back from Keycloak through BFCache must resume/cancel through the same protected bridge.
    browser.addEventListener('pageshow', event => { if (event.persisted) browser.location.reload() }, { once: true })
    browser.location.assign(response.authorizationUrl)
    departing = true
  }).catch(error => {
    if (state) void api.cancelPinRecovery(state).catch(() => {})
    clearContext()
    rejectResult(error)
  })
  return { result, cancel }
}

// One execution per document (including StrictMode). All tokens remain only in this document's memory.
export function continuePinRecovery(browser = window, {
  resume = resumePinRecoverySession,
  apiForSession = session => createAuthApi(createApiClient({ getAccessToken: async () => session.token })),
} = {}) {
  if (returns.has(browser)) return returns.get(browser)
  const work = (async () => {
    const params = new URLSearchParams(browser.location.search)
    browser.history.replaceState(null, '', browser.location.pathname)
    let context, session
    try {
      context = JSON.parse(browser.sessionStorage.getItem(PIN_RECOVERY_CONTEXT) || 'null')
      browser.sessionStorage.removeItem(PIN_RECOVERY_CONTEXT)
      if (!context || typeof context.state !== 'string') throw Error('No hay una recuperación pendiente en esta pestaña.')
      session = await resume(context.state)
      const api = apiForSession(session)
      if (!Number.isFinite(context.expiresAt) || context.expiresAt <= Date.now() || params.get('state') !== context.state || params.get('error') || !params.get('code')) {
        await api.cancelPinRecovery(context.state).catch(() => {})
        outcome = { subject: session.subject, recovered: false, message: 'La recuperación fue cancelada, expiró o no es válida.' }
      } else {
        try {
          await api.finishPinRecovery({ state: context.state, code: params.get('code') })
          outcome = { subject: session.subject, recovered: true, message: '' }
        } catch {
          outcome = { subject: session.subject, recovered: false, message: 'No fue posible validar la recuperación. Tu sesión original se ha conservado.' }
        }
      }
      return { session }
    } catch (error) {
      return { error: error.message || 'No fue posible restaurar la sesión original.' }
    }
  })()
  returns.set(browser, work)
  return work
}

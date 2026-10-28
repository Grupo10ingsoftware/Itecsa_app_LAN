import { expect, it, vi } from 'vitest'
import { beginPinRecovery, continuePinRecovery, PIN_RECOVERY_CONTEXT, getPinRecoveryOutcome } from './pinRecoveryBrowser'

function fixture() {
  const store = new Map()
  const browser = { location: { assign: vi.fn(), reload: vi.fn(), pathname: '/auth/pin-recovery/callback',
    search: '?state=state&code=code' }, history: { replaceState: vi.fn() }, addEventListener: vi.fn(),
    sessionStorage: { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) } }
  const api = { startPinRecovery: vi.fn().mockResolvedValue({ state: 'state', authorizationUrl: 'https://keycloak/auth' }),
    finishPinRecovery: vi.fn().mockResolvedValue({ pinStatus: 'pending_acknowledgement' }), cancelPinRecovery: vi.fn().mockResolvedValue(null) }
  const session = { token: 'original-access', refreshToken: 'original-refresh', subject: 'original', sid: 'session' }
  const options = { resume: vi.fn().mockResolvedValue(session), apiForSession: vi.fn(() => api) }
  browser.sessionStorage.setItem(PIN_RECOVERY_CONTEXT, JSON.stringify({ state: 'state', expiresAt: Date.now() + 300000 }))
  return { browser, api, store, options, session }
}
it('redirects current tab, preserving only public operation metadata', async () => {
  const f = fixture(); beginPinRecovery(f.api, f.browser)
  await Promise.resolve()
  expect(f.browser.location.assign).toHaveBeenCalledWith('https://keycloak/auth')
  const saved = JSON.parse(f.store.get(PIN_RECOVERY_CONTEXT))
  expect(Object.keys(saved).sort()).toEqual(['expiresAt', 'state'])
  expect(JSON.stringify(saved)).not.toContain('token')
})
it('restores original session before finishing; callback replay executes only once', async () => {
  const f = fixture()
  const first = continuePinRecovery(f.browser, f.options), second = continuePinRecovery(f.browser, f.options)
  expect(first).toBe(second)
  expect(await first).toEqual({ session: f.session })
  expect(f.options.resume).toHaveBeenCalledOnce()
  expect(f.options.apiForSession).toHaveBeenCalledWith(f.session)
  expect(f.api.finishPinRecovery).toHaveBeenCalledWith({ state: 'state', code: 'code' })
  expect(f.store.size).toBe(0)
  expect(getPinRecoveryOutcome('original').recovered).toBe(true)
})
for (const query of ['?state=forged&code=code', '?state=state&error=access_denied', '', '?state=state']) {
  it(`cancellation, Back or invalid response returns original session without rotation: ${query}`, async () => {
    const f = fixture(); f.browser.location.search = query
    expect(await continuePinRecovery(f.browser, f.options)).toEqual({ session: f.session })
    expect(f.api.cancelPinRecovery).toHaveBeenCalledWith('state')
    expect(f.api.finishPinRecovery).not.toHaveBeenCalled()
    expect(getPinRecoveryOutcome('original').recovered).toBe(false)
  })
}
it('expired operation restores session but never enables recovery', async () => {
  const f = fixture(); f.browser.sessionStorage.setItem(PIN_RECOVERY_CONTEXT, JSON.stringify({ state: 'state', expiresAt: 1 }))
  await continuePinRecovery(f.browser, f.options)
  expect(f.api.finishPinRecovery).not.toHaveBeenCalled()
})
it('server rejection of another account preserves original session without enabling recovery', async () => {
  const f = fixture(); f.api.finishPinRecovery.mockRejectedValue(Error('different account'))
  expect(await continuePinRecovery(f.browser, f.options)).toEqual({ session: f.session })
  expect(getPinRecoveryOutcome('original').recovered).toBe(false)
})
it('lost context or unavailable original session fails closed without normal SSO fallback', async () => {
  const f = fixture(); f.store.clear()
  expect((await continuePinRecovery(f.browser, f.options)).error).toBeTruthy()
  expect(f.options.resume).not.toHaveBeenCalled()
  const g = fixture(); g.options.resume.mockRejectedValue(Error('Original session revoked'))
  expect((await continuePinRecovery(g.browser, g.options)).error).toBe('Original session revoked')
  expect(g.api.finishPinRecovery).not.toHaveBeenCalled()
})
it('cancellation before start response cancels the late operation and does not navigate', async () => {
  const f = fixture(); let resolve
  f.api.startPinRecovery.mockReturnValue(new Promise(r => { resolve = r }))
  const task = beginPinRecovery(f.api, f.browser), check = expect(task.result).rejects.toThrow('cancelada')
  task.cancel(); resolve({ state: 'late' }); await check; await Promise.resolve()
  expect(f.api.cancelPinRecovery).toHaveBeenCalledWith('late')
  expect(f.browser.location.assign).not.toHaveBeenCalled()
})

it('disabled web storage cancels preparation and leaves original page/session intact', async () => {
  const f = fixture()
  f.browser.sessionStorage.setItem = () => { throw Error('Storage unavailable') }
  f.browser.sessionStorage.removeItem = () => { throw Error('Storage unavailable') }
  const task = beginPinRecovery(f.api, f.browser)
  await expect(task.result).rejects.toThrow('Storage unavailable')
  expect(f.api.cancelPinRecovery).toHaveBeenCalledWith('state')
  expect(f.browser.location.assign).not.toHaveBeenCalled()
})

it('BFCache return forces protected session restoration; cancellation after departure cannot race navigation', async () => {
  const f = fixture(), task = beginPinRecovery(f.api, f.browser)
  await Promise.resolve()
  const [event, listener, options] = f.browser.addEventListener.mock.calls[0]
  expect(event).toBe('pageshow'); expect(options).toEqual({ once: true })
  listener({ persisted: false }); expect(f.browser.location.reload).not.toHaveBeenCalled()
  listener({ persisted: true }); expect(f.browser.location.reload).toHaveBeenCalledOnce()
  task.cancel(); expect(f.api.cancelPinRecovery).not.toHaveBeenCalled()
  expect(f.browser.sessionStorage.getItem(PIN_RECOVERY_CONTEXT)).toBeTruthy()
})

it('a failed finish never retries rotation automatically and removes callback secrets from URL', async () => {
  const f = fixture(); f.api.finishPinRecovery.mockRejectedValue(Error('uncertain commit'))
  await continuePinRecovery(f.browser, f.options); await continuePinRecovery(f.browser, f.options)
  expect(f.api.finishPinRecovery).toHaveBeenCalledOnce()
  expect(f.browser.history.replaceState).toHaveBeenCalledWith(null, '', '/auth/pin-recovery/callback')
  expect(getPinRecoveryOutcome('original').recovered).toBe(false)
})

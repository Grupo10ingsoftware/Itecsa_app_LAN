import { afterEach, expect, it, vi } from 'vitest'
import { resumePinRecoverySession } from './authApi'

vi.mock('../../../config/runtimeConfig.js', () => ({ runtimeConfig: { apiBaseUrl: 'https://app.test/api' } }))
afterEach(() => vi.unstubAllGlobals())

it('preserves rate-limit status and delay without retrying the protected resume', async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: false, status: 429,
    json: async () => ({ retryAfterSeconds: 47 }) })
  vi.stubGlobal('fetch', fetch)
  await expect(resumePinRecoverySession('public-state')).rejects.toMatchObject({
    status: 429, payload: { retryAfterSeconds: 47 }, message: expect.stringContaining('Demasiadas solicitudes'),
  })
  expect(fetch).toHaveBeenCalledOnce()
  expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'POST', credentials: 'include' })
})

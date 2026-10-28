import { expect, it, vi } from 'vitest'
import { createAuthApi } from '../../auth/api/authApi'
import { formatProfileDate } from './profileFormatters'
import { formatProfileDate as before } from './fixtures/profileFormatters.before'

it('dates retain exact UTC-to-Santiago output, invalid values, and both sides of DST changes', () => {
  for (const value of [null, undefined, '', 'invalid', '2024-09-08T03:59:59Z', '2024-09-08T04:00:00Z', '2025-04-06T02:59:59Z', '2025-04-06T03:00:00Z', 1]) {
    for (const includeTime of [true, false]) expect(formatProfileDate(value, { includeTime })).toBe(before(value, { includeTime }))
  }
})
it('profile dedupe is pending only and isolated by API/session; errors permit fresh reads', async () => {
  const resolves = []
  const client = { get: vi.fn().mockImplementation(() => new Promise(done => { resolves.push(done) })) }
  const a = createAuthApi(client, { subject: 'a' }), b = createAuthApi(client, { subject: 'b' })
  const first = a.getProfile(); expect(a.getProfile()).toBe(first); const other = b.getProfile(); expect(other).not.toBe(first)
  resolves[0]({ email: 'a@example.invalid' }); resolves[1]({ email: 'b@example.invalid' }); await Promise.all([first, other])
  const later = a.getProfile(); expect(later).not.toBe(first); resolves[2]({ email: null }); await later
  expect(client.get).toHaveBeenCalledTimes(3)
  // Separate rejection fixture, so no unresolved work is retained in the settled cache.
  const failingClient = { get: vi.fn().mockRejectedValueOnce(Error('offline')).mockResolvedValue({ email: null }) }
  const retry = createAuthApi(failingClient)
  await expect(retry.getProfile()).rejects.toThrow('offline'); await retry.getProfile(); await retry.getProfile()
  expect(failingClient.get).toHaveBeenCalledTimes(3)
})
it('own movements pass abort options outside URL and never accept a target identity', async () => {
  const client = { get: vi.fn().mockResolvedValue({ records: [] }) }, api = createAuthApi(client)
  const controller = new AbortController()
  await api.getProfileMovements({ page: 2, perPage: 10, search: 'Ñ & _', userId: 'other' }, { signal: controller.signal })
  const [url, options] = client.get.mock.calls[0]
  expect(url).toBe('/auth/profile/movements?page=2&perPage=10&search=%C3%91+%26+_'); expect(options.signal).toBe(controller.signal)
  expect(url).not.toContain('other')
})

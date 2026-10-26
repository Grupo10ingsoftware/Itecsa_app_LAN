import { afterEach, describe, expect, it, vi } from 'vitest'
import { API_ERROR_CODES, createApiClient } from './apiClient'

const pending = () => new Promise(() => {})
const client = (options = {}) => createApiClient({ baseUrl: 'https://fixture.invalid/api', getAccessToken: async () => 'fixture-token', ...options })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('ciclo de solicitudes y esperas', () => {
  it('conserva cookies de recuperacion junto con la cancelacion y el timeout', async () => {
    vi.useFakeTimers()
    const fetch = vi.fn(pending)
    vi.stubGlobal('fetch', fetch)
    const check = expect(client({ timeoutMs: 100 }).post('auth/pin/recovery/start', {}, {
      credentials: 'include',
    })).rejects.toMatchObject({ code: API_ERROR_CODES.NETWORK_ERROR })
    await vi.advanceTimersByTimeAsync(100)
    await check
    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch.mock.calls[0][1].credentials).toBe('include')
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('finaliza y aborta una espera de red sin repetir una mutación', async () => {
    vi.useFakeTimers()
    const fetch = vi.fn(pending)
    vi.stubGlobal('fetch', fetch)
    const operation = client({ timeoutMs: 100 }).post('orders', { id: 1 })
    const check = expect(operation).rejects.toMatchObject({ code: API_ERROR_CODES.NETWORK_ERROR, status: undefined })
    await vi.advanceTimersByTimeAsync(100)
    await check
    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('también limita un cuerpo de respuesta que nunca termina', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(async () => ({ status: 200, ok: true, headers: new Headers({ 'content-type': 'application/json' }), json: pending })))
    const check = expect(client({ timeoutMs: 100 }).get('metrics')).rejects.toMatchObject({ code: API_ERROR_CODES.NETWORK_ERROR })
    await vi.advanceTimersByTimeAsync(100)
    await check
  })
  it('libera la carga si la obtención del token queda pendiente, sin reintentar el login', async () => {
    vi.useFakeTimers()
    const getAccessToken = vi.fn(pending), fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const check = expect(client({ getAccessToken, timeoutMs: 100 }).get('orders')).rejects.toMatchObject({ code: API_ERROR_CODES.NETWORK_ERROR })
    await vi.advanceTimersByTimeAsync(100)
    await check
    expect(fetch).not.toHaveBeenCalled()
    expect(getAccessToken).toHaveBeenCalledOnce()
  })
  it('permite cancelar una lectura y elimina el temporizador', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(pending))
    const controller = new AbortController()
    const check = expect(client().get('orders', { signal: controller.signal })).rejects.toMatchObject({ code: API_ERROR_CODES.NETWORK_ERROR })
    controller.abort()
    await check
    expect(vi.getTimerCount()).toBe(0)
  })
  it('no inicia llamadas ya canceladas', async () => {
    const fetch = vi.fn(), controller = new AbortController()
    vi.stubGlobal('fetch', fetch)
    controller.abort()
    await expect(client().get('orders', { signal: controller.signal })).rejects.toMatchObject({ code: API_ERROR_CODES.NETWORK_ERROR })
    expect(fetch).not.toHaveBeenCalled()
  })
  it('conserva las respuestas 401 y sus datos de sesión', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: 'EXPIRED' }), { status: 401, headers: { 'content-type': 'application/json' } })))
    await expect(client().get('auth')).rejects.toMatchObject({ code: API_ERROR_CODES.SESSION_INVALID, status: 401, payload: { code: 'EXPIRED' } })
  })
  it('mantiene independientes dos consultas simultáneas', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(async url => url.endsWith('/slow') ? pending() : new Response('{"ready":true}', { headers: { 'content-type': 'application/json' } })))
    const api = client({ timeoutMs: 100 })
    const check = expect(api.get('slow')).rejects.toMatchObject({ code: API_ERROR_CODES.NETWORK_ERROR })
    await expect(api.get('fast')).resolves.toEqual({ ready: true })
    await vi.advanceTimersByTimeAsync(100)
    await check
  })
})

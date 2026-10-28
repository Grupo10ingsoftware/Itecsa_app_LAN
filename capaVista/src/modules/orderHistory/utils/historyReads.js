const scopes = new WeakMap()
let nextScope = 0
export function historyScope(api) {
  if (!scopes.has(api)) scopes.set(api, ++nextScope)
  return scopes.get(api)
}

// Pending reads only, isolated by API/session; completed results are never cached.
const pending = new WeakMap()
export function subscribeHistoryRead({ api, method, orderId, params, onSuccess, onError }) {
  let requests = pending.get(api)
  if (!requests) { requests = new Map(); pending.set(api, requests) }
  const key = JSON.stringify([method, orderId, params])
  let entry = requests.get(key)
  if (!entry) {
    entry = { controller: new AbortController(), listeners: new Set() }
    requests.set(key, entry)
    queueMicrotask(async () => {
      if (!entry.listeners.size) return
      try {
        const options = { ...params, signal: entry.controller.signal }
        const result = await (method === 'listOrders' ? api[method](options) : api[method](orderId, options))
        for (const listener of entry.listeners) listener.onSuccess(result)
      } catch (error) {
        if (!entry.controller.signal.aborted) for (const listener of entry.listeners) listener.onError(error)
      } finally {
        if (requests.get(key) === entry) requests.delete(key)
      }
    })
  }
  const listener = { onSuccess, onError }
  entry.listeners.add(listener)
  return () => {
    entry.listeners.delete(listener)
    queueMicrotask(() => {
      if (!entry.listeners.size) {
        entry.controller.abort()
        if (requests.get(key) === entry) requests.delete(key)
      }
    })
  }
}

export function historyDateError({ from, to }) {
  for (const value of [from, to]) {
    if (!value) continue
    const date = new Date(`${value}T00:00:00.000Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return 'El rango de fechas no es válido.'
  }
  return from && to && from > to ? 'La fecha Desde no puede ser posterior a la fecha Hasta.' : ''
}

export function appendHistoryEvents(current, incoming) {
  const ids = new Set(current.map(event => event.id))
  const additions = []
  for (const event of incoming) {
    if (ids.has(event.id)) continue
    ids.add(event.id)
    additions.push(event)
  }
  return additions.length ? [...current, ...additions] : current
}

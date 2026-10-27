// One bounded cache per mounted payment workspace. Never stores PIN or writes.
export function createPaymentPreviewCache(api, { ttlMs = 15000, maxEntries = 30, now = Date.now } = {}) {
  const entries = new Map()
  let speculative = 0
  function invalidate(id) {
    const entry = entries.get(id)
    entries.delete(id)
    entry?.controller.abort()
  }
  function clear() { for (const id of entries.keys()) invalidate(id) }
  function get(id, { prefetch = false } = {}) {
    const cached = entries.get(id)
    if (cached && (cached.pending || now() < cached.expires)) return cached.promise
    invalidate(id)
    if (prefetch && speculative >= 2) return Promise.resolve(null)
    if (entries.size >= maxEntries) invalidate(entries.keys().next().value)
    const controller = new AbortController()
    const entry = { controller, pending: true, expires: 0 }
    if (prefetch) speculative++
    entry.promise = Promise.resolve().then(() => {
      if (controller.signal.aborted) throw new DOMException('Preview invalidado', 'AbortError')
      return api.getPaymentPreview(id, { signal: controller.signal })
    }).then(result => {
      if (controller.signal.aborted || entries.get(id) !== entry) throw new DOMException('Preview invalidado', 'AbortError')
      entry.expires = now() + ttlMs
      return result
    }).catch(error => {
      if (entries.get(id) === entry) entries.delete(id)
      if ([401, 403].includes(error?.status)) clear()
      throw error
    }).finally(() => { entry.pending = false; if (prefetch) speculative-- })
    entries.set(id, entry)
    return entry.promise
  }
  return { get, invalidate, clear }
}

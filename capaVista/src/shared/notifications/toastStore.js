export const TOAST_DEFAULTS = Object.freeze({ success: 5000, info: 5000, warning: 7000, error: 8000 })

// The store owns timers. Queued entries do not spend their reading time off screen.
export function createToastStore({ limit = 3, now = () => Date.now(), exitMs = 140 } = {}) {
  let entries = [], snapshot = [], sequence = 0, enabled = true
  const listeners = new Set(), timers = new Map()
  function publish() {
    snapshot = entries.slice(0, limit).map(entry => entry.toast)
    listeners.forEach(listener => listener())
    schedule()
  }
  function stop(entry) {
    if (!timers.has(entry.toast.id)) return
    clearTimeout(timers.get(entry.toast.id))
    timers.delete(entry.toast.id)
    entry.remaining = Math.max(0, entry.remaining - (now() - entry.started))
  }
  function schedule() {
    entries.forEach((entry, index) => {
      if (entry.toast.closing) return
      if (index >= limit || entry.pauses.size) { stop(entry); return }
      if (timers.has(entry.toast.id)) return
      entry.started = now()
      timers.set(entry.toast.id, setTimeout(() => dismiss(entry.toast.id), entry.remaining))
    })
  }
  function dismiss(id) {
    const entry = entries.find(item => item.toast.id === id)
    if (!entry || entry.toast.closing) return
    stop(entry)
    const remove = () => {
      timers.delete(id)
      entries = entries.filter(item => item !== entry)
      publish()
    }
    if (exitMs <= 0 || entries.indexOf(entry) >= limit) { remove(); return }
    entry.toast = { ...entry.toast, closing: true }
    entry.started = now()
    timers.set(id, setTimeout(remove, exitMs))
    publish()
  }
  function emit(severity, message, options = {}) {
    if (!enabled || !Object.hasOwn(TOAST_DEFAULTS, severity) || typeof message !== 'string' || !message.trim()) return null
    // Only an explicit source + operation pair deduplicates. Identical text from
    // independent operations remains independently readable.
    const key = options.source && options.operation ? JSON.stringify([options.source, options.operation]) : null
    const existing = key && entries.find(entry => entry.key === key)
    if (existing) return existing.toast.id
    const id = `itecsa-toast-${++sequence}`
    const duration = Number.isFinite(options.duration) && options.duration > 0 ? options.duration : TOAST_DEFAULTS[severity]
    entries.push({ key, remaining: duration, pauses: new Set(), toast: {
      id, severity, message, title: options.title, action: options.action,
    } })
    publish()
    return id
  }
  function pause(id, reason, paused) {
    const entry = entries.find(item => item.toast.id === id)
    if (!entry || entry.toast.closing) return
    if (paused) { stop(entry); entry.pauses.add(reason) }
    else entry.pauses.delete(reason)
    schedule()
  }
  function clear() {
    entries.forEach(stop)
    entries = []
    publish()
  }
  const api = Object.fromEntries(Object.keys(TOAST_DEFAULTS).map(type => [type, (message, options) => emit(type, message, options)]))
  return {
    api: Object.freeze({ ...api, dismiss, clear, endSession() { enabled = false; clear() } }), pause,
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    setLimit(value) {
      if (limit === value) return
      limit = value
      // A card moved back into the queue cannot retain a hover/focus that no
      // longer exists in the DOM. Its remaining reading time is preserved.
      entries.slice(limit).forEach(entry => { entry.pauses.delete('pointer'); entry.pauses.delete('focus') })
      publish()
    },
    activate() { enabled = true },
    dispose() { enabled = false; clear() },
  }
}

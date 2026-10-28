// One read in flight, a coalesced dirty bit, unchanged 5-second polling cadence.
// No shared messages, tokens, permissions or cross-tab storage.
export function createNotificationRefresh({ load, onData, onError, onLoading, visible = () => true, now = Date.now }) {
  let active = true, busy = false, dirty = false, running = null, controller = null, epoch = 0, lastStart = -Infinity
  function request({ invalidate = false, quiet = true } = {}) {
    if (!active) return Promise.resolve()
    dirty ||= invalidate
    if (!visible() || busy) return Promise.resolve()
    if (running) return running
    if (!dirty && now() - lastStart < 500) return Promise.resolve()
    dirty = false
    lastStart = now()
    const version = epoch
    controller = new AbortController()
    const signal = controller.signal
    if (!quiet) onLoading?.(true)
    running = Promise.resolve().then(() => load({ signal })).then(result => {
      if (active && version === epoch && !signal.aborted) onData(result)
    }).catch(error => {
      if (active && version === epoch && !signal.aborted) onError(error)
    }).finally(() => {
      running = null
      if (active && version === epoch && !quiet) onLoading?.(false)
      if (active && dirty && !busy && visible()) return request()
    })
    return running
  }
  return {
    request,
    beginAction() { busy = true; dirty = true; epoch++; controller?.abort() },
    endAction() { busy = false; dirty = true; return running ? running.then(() => request()) : request() },
    dispose() { active = false; epoch++; controller?.abort(); dirty = false },
  }
}

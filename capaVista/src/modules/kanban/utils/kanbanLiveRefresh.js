const EMPTY_PAGE = { items: [], pageInfo: { nextCursor: null, hasMore: false } }
export const DEFAULT_KANBAN_REFRESH_MS = 30_000

export function resolveKanbanRefreshMs(value) {
  const number = typeof value === 'string' && value.trim() ? Number(value) : value
  return Number.isInteger(number) && number >= 10_000 && number <= 300_000
    ? number : DEFAULT_KANBAN_REFRESH_MS
}

// Keep references for unchanged cards. Detail DTOs and form drafts are owned by
// the detail panel, never replaced with these summary DTOs.
export function reconcileKanbanOrders(current, next) {
  const previous = new Map(current.map(order => [order.id, order]))
  return next.map(order => {
    const old = previous.get(order.id)
    return old && JSON.stringify(old) === JSON.stringify(order) ? old : order
  })
}

function oldestOrderId(items) {
  return items.reduce((oldest, item) => Math.min(oldest, Number(item.id)), Infinity)
}

function uniqueOrders(items) {
  return [...new Map(items.map(item => [item.id, item])).values()]
}

// Re-read from the newest ID to the oldest loaded ID using NEW cursors. A new
// first page alone cannot establish that cards on subsequent pages disappeared.
// Publish only after the complete window is read. This is an eventually
// consistent view: independent HTTP pages are not a database snapshot.
export async function readKanbanWindow(readPage, previous = EMPTY_PAGE, options = {}) {
  const { signal } = options
  const oldestId = previous.items.length ? oldestOrderId(previous.items) : null
  const maxPages = options.maxPages ?? Math.ceil(previous.items.length / 50) + 20
  const items = []
  const cursors = new Set()
  let cursor
  for (let page = 0; page < maxPages; page++) {
    signal?.throwIfAborted()
    const result = await readPage({ limit: page === 0 ? 100 : 50, ...(cursor ? { cursor } : {}) }, { signal })
    signal?.throwIfAborted()
    items.push(...result.items)
    const pageInfo = result.pageInfo ?? EMPTY_PAGE.pageInfo
    const lastId = result.items.length ? oldestOrderId(result.items) : null
    if (!pageInfo.hasMore || oldestId === null || (lastId !== null && lastId <= oldestId)) {
      return { items: uniqueOrders(items), pageInfo }
    }
    if (!pageInfo.nextCursor || cursors.has(pageInfo.nextCursor)) break
    cursor = pageInfo.nextCursor
    cursors.add(cursor)
  }
  // A bounded traversal must not remove cards it did not actually revisit.
  const error = new Error('La ventana del Kanban cambió demasiado durante la consulta. Se conserva la vista anterior; vuelve a intentar.')
  error.code = 'KANBAN_WINDOW_CHANGED'
  throw error
}

// One flight for initial load, pagination, local invalidation and background
// refresh. Abort + generation protect against transports that resolve late.
export function createKanbanLiveRefresh({
  readPage, onPage, onError, onState, onRefresh,
  intervalMs = DEFAULT_KANBAN_REFRESH_MS,
  now = Date.now, random = Math.random,
  setTimer = setTimeout, clearTimer = clearTimeout,
}) {
  intervalMs = resolveKanbanRefreshMs(intervalMs)
  let active = true
  let available = false
  let halted = false
  let holds = 0
  let generation = 0
  let running = null
  let timer = null
  let queued = false
  let dirty = true
  let more = false
  let loaded = false
  let failures = 0
  let lastSuccess = null
  let snapshot = EMPTY_PAGE

  function cancelTimer() {
    if (timer !== null) clearTimer(timer)
    timer = null
  }
  function current(request) {
    return active && available && !halted && !holds && request.generation === generation && !request.controller.signal.aborted
  }
  function invalidate() {
    generation++
    dirty = true
    cancelTimer()
    running?.controller.abort()
  }
  function schedule(delay = 0) {
    if (!active || !available || halted || holds || running || queued) return
    cancelTimer()
    if (delay > 0) {
      timer = setTimer(() => { timer = null; dirty = true; schedule() }, delay)
      return
    }
    queued = true
    queueMicrotask(() => {
      queued = false
      if (!active || !available || halted || holds || running) return
      if (!dirty && !more) { schedule(intervalMs); return }
      const mode = dirty ? 'refresh' : 'more'
      dirty = false
      if (mode === 'more') more = false
      const request = { mode, generation, controller: new AbortController() }
      running = request
      void run(request).catch(() => {})
    })
  }
  async function run(request) {
    try {
      onState?.({ busy: true, initial: !loaded, more: request.mode === 'more' })
      let next
      if (request.mode === 'more') {
        if (!snapshot.pageInfo.hasMore || !snapshot.pageInfo.nextCursor) return
        const page = await readPage({ limit: 50, cursor: snapshot.pageInfo.nextCursor }, { signal: request.controller.signal })
        next = { items: uniqueOrders([...snapshot.items, ...page.items]), pageInfo: page.pageInfo }
      } else {
        next = await readKanbanWindow(readPage, snapshot, { signal: request.controller.signal })
      }
      if (!current(request)) return
      snapshot = next
      loaded = true
      failures = 0
      lastSuccess = now()
      onPage?.(next)
      onError?.(null)
      if (request.mode === 'refresh') onRefresh?.()
    } catch (error) {
      if (!current(request)) return
      failures++
      if ([401, 403].includes(error.status) || error.code === 'SESSION_INVALID') halted = true
      onError?.(error)
    } finally {
      running = null
      if (active) onState?.({ busy: false, initial: false, more: false })
      if (dirty || more) schedule()
      else {
        const delay = failures
          ? Math.min(300_000, intervalMs * (2 ** Math.min(failures, 5)) * (1 + random() * 0.2))
          : intervalMs
        schedule(delay)
      }
    }
  }
  return {
    refresh() { if (active && !halted) { invalidate(); schedule() } },
    loadMore() { if (active && !halted && !more && running?.mode !== 'more') { more = true; schedule() } },
    suspend() {
      if (!active) return () => {}
      holds++
      invalidate()
      let released = false
      return () => {
        if (!active || released) return
        released = true
        holds--
        schedule()
      }
    },
    setAvailable(value) {
      if (!active || available === value) return
      available = value
      if (!value) {
        if (running) invalidate()
        else cancelTimer()
        return
      }
      const age = lastSuccess === null ? intervalMs : now() - lastSuccess
      if (dirty || age >= intervalMs) schedule()
      else schedule(intervalMs - age)
    },
    dispose() {
      active = false
      invalidate()
    },
  }
}

export function connectKanbanRefresh(controller, page, browser) {
  const update = () => controller.setAvailable(page.visibilityState !== 'hidden' && browser.navigator.onLine !== false)
  page.addEventListener('visibilitychange', update)
  browser.addEventListener('online', update)
  browser.addEventListener('offline', update)
  update()
  return () => {
    page.removeEventListener('visibilitychange', update)
    browser.removeEventListener('online', update)
    browser.removeEventListener('offline', update)
    controller.dispose()
  }
}

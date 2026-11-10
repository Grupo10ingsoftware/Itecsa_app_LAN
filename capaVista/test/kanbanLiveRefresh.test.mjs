import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createKanbanLiveRefresh, connectKanbanRefresh, readKanbanWindow,
  reconcileKanbanOrders, resolveKanbanRefreshMs,
} from '../src/modules/kanban/utils/kanbanLiveRefresh.js'
import { resolveRuntimeConfig } from '../src/config/runtimeConfig.js'

const flush = () => new Promise(resolve => setImmediate(resolve))
const ids = items => items.map(item => item.id)
const row = id => ({ id, salesNoteNumber: `NV-${id}`, generalStepId: 1 })
const rows = (top, count) => Array.from({ length: count }, (_, index) => row(top - index))
const page = (items, nextCursor = null) => ({ items, pageInfo: { nextCursor, hasMore: Boolean(nextCursor) } })
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function setup() {
  const requests = [], pages = [], errors = [], states = [], timers = new Map()
  let time = 0, timerId = 0, loadRefreshes = 0
  const controller = createKanbanLiveRefresh({
    readPage(params, { signal }) {
      const request = { ...deferred(), params, signal }
      requests.push(request)
      return request.promise
    },
    onPage: value => pages.push(value), onError: error => errors.push(error),
    onState: value => states.push(value), onRefresh: () => { loadRefreshes++ },
    now: () => time, random: () => 0,
    setTimer: (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay }); return id },
    clearTimer: id => timers.delete(id),
  })
  function tick() {
    assert.equal(timers.size, 1)
    const [id, timer] = [...timers.entries()][0]
    timers.delete(id)
    time += timer.delay
    timer.callback()
    return timer.delay
  }
  return { controller, requests, pages, errors, states, timers, tick, get loadRefreshes() { return loadRefreshes } }
}
async function initial(s, result = page(rows(200, 100), 'cursor-101')) {
  s.controller.setAvailable(true)
  await flush()
  s.requests[0].resolve(result)
  await flush()
}

test('runtime interval is configurable, bounded and rejects malformed values', () => {
  for (const value of [undefined, null, '', 0, '0', 'NaN', '1e999', 9999, 300001, -10000, 10000.5]) {
    assert.equal(resolveKanbanRefreshMs(value), 30000)
  }
  for (const value of [10000, '25000', '300000']) assert.equal(resolveKanbanRefreshMs(value), Number(value))
  const config = resolveRuntimeConfig({ kanbanRefreshMs: ' 10000 ' }, { VITE_KANBAN_REFRESH_MS: '50000' })
  assert.equal(resolveKanbanRefreshMs(config.kanbanRefreshMs), 10000)
  assert.equal(resolveKanbanRefreshMs(resolveRuntimeConfig({}, { VITE_KANBAN_REFRESH_MS: '60000' }).kanbanRefreshMs), 60000)
})

test('initial window reads 100, then revalidates all loaded pages with fresh 50-item cursors', async () => {
  const previous = page(rows(300, 200), 'old-101')
  const source = rows(310, 310).filter(item => ![245, 155, 105].includes(item.id))
    .map(item => item.id === 120 ? { ...item, generalStepId: 3 } : item)
  const calls = []
  const result = await readKanbanWindow(async params => {
    calls.push(params)
    const from = params.cursor ? source.findIndex(item => String(item.id) === params.cursor) + 1 : 0
    const slice = source.slice(from, from + params.limit)
    return page(slice, from + params.limit < source.length ? String(slice.at(-1).id) : null)
  }, previous)
  assert.equal(calls.length, 4)
  assert.deepEqual(calls.map(call => call.limit), [100, 50, 50, 50])
  assert.ok(calls.every(call => call.cursor !== 'old-101'))
  for (const id of [310, 300, 200, 150, 101]) assert.ok(ids(result.items).includes(id))
  for (const id of [245, 155, 105]) assert.ok(!ids(result.items).includes(id))
  assert.equal(result.items.find(item => item.id === 120).generalStepId, 3)
  assert.equal(new Set(ids(result.items)).size, result.items.length)
  assert.ok(result.items.every(item => item.id >= 101), 'do not silently load older rows while refreshing')
  assert.equal(result.pageInfo.nextCursor, 'old-101', 'retain the signed ID boundary for subsequent pagination')
})

test('partial traversal failures never publish missing cards or a half-refreshed window', async () => {
  const s = setup()
  await initial(s)
  s.controller.loadMore()
  await flush()
  s.requests[1].resolve(page(rows(100, 50), 'old-51'))
  await flush()
  s.tick()
  await flush()
  s.requests[2].resolve(page(rows(205, 100), 'new-106'))
  await flush()
  assert.equal(s.pages.length, 2)
  s.requests[3].reject(new Error('page two offline'))
  await flush()
  assert.equal(s.pages.length, 2)
  assert.deepEqual(ids(s.pages.at(-1).items), ids(rows(200, 150)))
  assert.equal(s.loadRefreshes, 1, 'failed partial reads must not present a new load snapshot')
  assert.equal([...s.timers.values()][0].delay, 60000)
  s.controller.dispose()
})

test('bounded traversal and repeated cursors reject instead of deleting unvisited cards', async () => {
  await assert.rejects(readKanbanWindow(async () => page(rows(1000, 50), 'repeat'), page([row(1)])), /ventana/)
  let requests = 0
  await assert.rejects(readKanbanWindow(async () => page([row(1000 - requests++)], String(requests)), page([row(1)]), { maxPages: 3 }), /ventana/)
  assert.equal(requests, 3)
})

test('refresh covers deletion of oldest loaded row and an empty result', async () => {
  const previous = page([row(105), row(101)], 'old')
  const result = await readKanbanWindow(async () => page([row(104), row(100)], 'fresh'), previous)
  assert.deepEqual(ids(result.items), [104])
  assert.equal(result.windowBoundaryId, 101, 'retain the deleted boundary for the next refresh')
  assert.deepEqual((await readKanbanWindow(async () => page([]), previous)).items, [])
})

test('pagination and timer reads never overlap or truncate a loaded second page', async () => {
  const s = setup()
  await initial(s)
  assert.equal(s.tick(), 30000)
  await flush()
  s.controller.loadMore()
  s.controller.loadMore()
  assert.equal(s.requests.length, 2)
  s.requests[1].resolve(page(rows(201, 100), 'fresh-102'))
  await flush()
  assert.equal(s.requests[2].params.limit, 50, 'refresh continues to its old lower boundary first')
  s.requests[2].resolve(page(rows(101, 50), 'fresh-52'))
  await flush()
  assert.deepEqual(s.requests[3].params, { limit: 50, cursor: 'cursor-101' })
  s.requests[3].resolve(page(rows(100, 50), 'fresh-51'))
  await flush()
  assert.equal(s.pages.at(-1).items.length, 151)
  assert.equal(s.loadRefreshes, 2)
  s.controller.dispose()
})

test('repeated new arrivals do not expand the loaded historical window by extra pages', async () => {
  let snapshot = page(rows(200, 100), '101')
  for (let newest = 201; newest <= 210; newest++) {
    const source = rows(newest, newest)
    snapshot = await readKanbanWindow(async ({ limit, cursor }) => {
      const start = cursor ? source.findIndex(item => item.id === Number(cursor)) + 1 : 0
      const items = source.slice(start, start + limit)
      return page(items, start + limit < source.length ? String(items.at(-1).id) : null)
    }, snapshot)
    assert.equal(snapshot.items.length, 100 + newest - 200)
    assert.equal(snapshot.items.at(-1).id, 101)
    assert.equal(snapshot.pageInfo.nextCursor, '101')
  }
})

test('multiple synchronous invalidations coalesce, and a 45-second response cannot overlap the next poll', async () => {
  const s = setup()
  s.controller.setAvailable(true)
  s.controller.refresh()
  s.controller.refresh()
  await flush()
  assert.equal(s.requests.length, 1)
  assert.equal(s.timers.size, 0)
  s.controller.refresh()
  s.controller.refresh()
  assert.equal(s.requests[0].signal.aborted, true)
  await flush()
  assert.equal(s.requests.length, 1, 'wait even when the transport ignores cancellation')
  s.requests[0].resolve(page([row(1)]))
  await flush()
  assert.equal(s.pages.length, 0)
  assert.equal(s.requests.length, 2)
  s.requests[1].resolve(page([row(2)]))
  await flush()
  assert.deepEqual(ids(s.pages[0].items), [2])
  assert.equal(s.timers.size, 1)
  s.controller.dispose()
})

test('drag, transition modal and concurrent mutations hold the snapshot until the last release', async () => {
  const s = setup()
  await initial(s, page([row(1)]))
  s.tick()
  await flush()
  const releaseDrag = s.controller.suspend()
  assert.equal(s.requests[1].signal.aborted, true)
  const releaseModal = s.controller.suspend()
  releaseDrag()
  s.requests[1].resolve(page([{ ...row(1), generalStepId: 1 }]))
  await flush()
  const releaseWrite = s.controller.suspend()
  s.controller.refresh()
  releaseModal()
  await flush()
  assert.equal(s.requests.length, 2)
  assert.equal(s.pages.length, 1)
  releaseWrite()
  releaseWrite()
  await flush()
  assert.equal(s.requests.length, 3)
  s.requests[2].resolve(page([{ ...row(1), generalStepId: 2 }]))
  await flush()
  assert.equal(s.pages.at(-1).items[0].generalStepId, 2)
  s.controller.dispose()
})

test('drag cancellation resumes immediately without applying an old read', async () => {
  const s = setup()
  await initial(s, page([row(2)]))
  const release = s.controller.suspend()
  assert.equal(s.timers.size, 0)
  release()
  await flush()
  s.requests[1].resolve(page([row(3), row(2)]))
  await flush()
  assert.deepEqual(ids(s.pages.at(-1).items), [3, 2])
  s.controller.dispose()
})

test('hidden/offline pages abort, discard late responses and coalesce a single recovery', async () => {
  const s = setup()
  await initial(s, page([row(1)]))
  s.tick()
  await flush()
  s.controller.setAvailable(false)
  assert.equal(s.requests[1].signal.aborted, true)
  s.requests[1].resolve(page([row(2)]))
  await flush()
  assert.equal(s.pages.length, 1)
  assert.equal(s.timers.size, 0)
  s.controller.setAvailable(true)
  s.controller.setAvailable(true)
  await flush()
  assert.equal(s.requests.length, 3)
  s.requests[2].resolve(page([row(3)]))
  await flush()
  assert.deepEqual(ids(s.pages.at(-1).items), [3])
  s.controller.dispose()
})

test('brief visibility changes keep the remaining interval when the snapshot is still fresh', async () => {
  const s = setup()
  await initial(s, page([row(1)]))
  s.controller.setAvailable(false)
  assert.equal(s.timers.size, 0)
  s.controller.setAvailable(true)
  await flush()
  assert.equal(s.requests.length, 1)
  assert.equal([...s.timers.values()][0].delay, 30000)
  s.controller.dispose()
})

test('visibility/online listeners clean up on unmount', () => {
  const document = new EventTarget(), browser = new EventTarget()
  document.visibilityState = 'hidden'
  browser.navigator = { onLine: true }
  const changes = []
  const disconnect = connectKanbanRefresh({ setAvailable: value => changes.push(value), dispose: () => changes.push('disposed') }, document, browser)
  document.visibilityState = 'visible'
  document.dispatchEvent(new Event('visibilitychange'))
  browser.navigator.onLine = false
  browser.dispatchEvent(new Event('offline'))
  browser.navigator.onLine = true
  browser.dispatchEvent(new Event('online'))
  disconnect()
  document.dispatchEvent(new Event('visibilitychange'))
  assert.deepEqual(changes, [false, true, false, true, 'disposed'])
})

for (const failure of [Object.assign(new Error('401'), { status: 401 }), Object.assign(new Error('403'), { status: 403 }), Object.assign(new Error('session'), { code: 'SESSION_INVALID' })]) {
  test(`authorization ${failure.message} halts all retries until a new identity creates its own reader`, async () => {
    const s = setup()
    s.controller.setAvailable(true)
    await flush()
    s.requests[0].reject(failure)
    await flush()
    s.controller.refresh()
    s.controller.loadMore()
    s.controller.setAvailable(false)
    s.controller.setAvailable(true)
    await flush()
    assert.equal(s.requests.length, 1)
    assert.equal(s.timers.size, 0)
    assert.deepEqual(s.errors, [failure])
    s.controller.dispose()
  })
}

test('errors retain the snapshot, back off without toasts and reset the delay after recovery', async () => {
  const s = setup()
  await initial(s, page([row(1)]))
  for (const delay of [60000, 120000, 240000, 300000]) {
    s.tick()
    await flush()
    s.requests.at(-1).reject(new Error('network timeout'))
    await flush()
    assert.equal([...s.timers.values()][0].delay, delay)
    assert.equal(s.pages.length, 1)
  }
  s.tick()
  await flush()
  s.requests.at(-1).resolve(page([row(2)]))
  await flush()
  assert.equal([...s.timers.values()][0].delay, 30000)
  assert.equal(s.errors.at(-1), null)
  s.controller.dispose()
})

for (const outcome of ['resolve', 'reject']) {
  test(`filter/session change or unmount rejects a late ${outcome} and removes timers`, async () => {
    const s = setup()
    s.controller.setAvailable(true)
    await flush()
    const release = s.controller.suspend()
    s.controller.dispose()
    release()
    s.controller.refresh()
    s.controller.setAvailable(true)
    s.requests[0][outcome](outcome === 'resolve' ? page([row(1)]) : new Error('old identity'))
    await flush()
    assert.equal(s.requests[0].signal.aborted, true)
    assert.equal(s.pages.length, 0)
    assert.equal(s.errors.length, 0)
    assert.equal(s.timers.size, 0)
  })
}

test('reconciliation retains unchanged card references and does not mutate detail drafts', () => {
  const original = [row(2), row(1)]
  const next = reconcileKanbanOrders(original, [row(3), row(2), { ...row(1), generalStepId: 2 }])
  assert.equal(next[1], original[0])
  assert.notEqual(next[2], original[1])
  assert.deepEqual(original, [row(2), row(1)])
  const detail = { ...row(1), items: [{ id: 9, manufacturingDetails: 'full detail' }], draft: 'keep me' }
  reconcileKanbanOrders([detail], [row(1)])
  assert.equal(detail.items[0].manufacturingDetails, 'full detail')
  assert.equal(detail.draft, 'keep me')
})

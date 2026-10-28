import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { mergeCalendarCollections } from '../capaVista/src/modules/productionCalendar/utils/calendarReads.js'
import { createNotificationRefresh } from '../capaVista/src/modules/messages/utils/notificationRefresh.js'

const output = { reference: '1e7bddd', methodology: 'CPU-only calendar collection merge, 5 warm samples; virtual notification time, no real HTTP/SQL, server capacity or production p95.', merges: [], polling: [] }
const oldMerge = (month, pending) => [...month, ...pending.filter(item => !month.some(row => String(row.id) === String(item.id)))]
for (const n of [100, 1000, 5000]) {
  const month = Array.from({ length: n }, (_, id) => ({ id })), pending = Array.from({ length: n }, (_, i) => ({ id: String(n / 2 + i) }))
  assert.deepEqual(mergeCalendarCollections(month, pending), oldMerge(month, pending))
  const comparison = { monthRows: n, pendingRows: n, equal: true }
  for (const [version, fn] of [['before', oldMerge], ['after', mergeCalendarCollections]]) {
    fn(month, pending); const samples = []
    for (let i = 0; i < 5; i++) { const start = performance.now(); fn(month, pending); samples.push(performance.now() - start) }
    const sorted = [...samples].sort((a, b) => a - b)
    comparison[version] = { n: 5, minMs: sorted[0], meanMs: samples.reduce((a, b) => a + b) / 5, medianMs: sorted[2], maxMs: sorted[4], samples }
  }
  output.merges.push(comparison)
}
for (const [tabs, hidden] of [[1, false], [3, false], [1, true]]) {
  let now = 0, gets = 0
  const feeds = Array.from({ length: tabs }, () => createNotificationRefresh({ load: async () => { gets++; return { unreadCount: 1 } },
    onData() {}, onError(error) { throw error }, visible: () => !hidden, now: () => now }))
  for (now = 0; now < 60000; now += 5000) for (const feed of feeds) await feed.request()
  feeds.forEach(feed => feed.dispose())
  output.polling.push({ tabs, hidden, simulatedHttpPerMinute: gets, observationWindow: '[0,60000)', detectionDelayNominalMs: hidden ? null : 5000,
    note: 'Detection also includes actual request latency; no shared multi-tab leader is implemented.' })
}
assert.equal(output.polling[0].simulatedHttpPerMinute, 12)
assert.equal(output.polling[1].simulatedHttpPerMinute, 36)
await writeFile('docs/FASE3_VOLUMEN_Y_POLLING.json', JSON.stringify(output, null, 2) + '\n')

import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { formatProfileDate as before } from '../capaVista/src/modules/profile/utils/fixtures/profileFormatters.before.js'
import { formatProfileDate as after } from '../capaVista/src/modules/profile/utils/profileFormatters.js'

const values = ['2024-09-08T03:59:59Z', '2024-09-08T04:00:00Z', '2025-04-06T02:59:59Z', '2025-04-06T03:00:00Z', null, '', 'invalid']
for (const v of values) for (const includeTime of [true, false]) assert.equal(after(v, { includeTime }), before(v, { includeTime }))
const output = { reference: 'b71fd33', capturedAt: new Date().toISOString(), methodology: 'CPU-only formatting, 5 warm batches. 10 rows represents a page; 1000 repeated calls is synthetic, not SQL or E2E.', equivalence: true, samples: {} }
for (const count of [10, 1000]) for (const includeTime of [false, true]) for (const [version, format] of [['before', before], ['after', after]]) {
  const run = () => { for (let i = 0; i < count; i++) format(values[i % 4], { includeTime }) }
  run(); const samples = []
  for (let i = 0; i < 5; i++) { const t = performance.now(); run(); samples.push(+(performance.now() - t).toFixed(3)) }
  const sorted = [...samples].sort((a, b) => a - b)
  output.samples[[count, includeTime ? 'datetime' : 'date', version].join('_')] = { n: 5, minMs: sorted[0], meanMs: samples.reduce((a, b) => a + b) / 5, medianMs: sorted[2], maxMs: sorted[4], samples }
}
await writeFile('docs/OPT-08_FORMATO_SINTETICO.json', JSON.stringify(output, null, 2) + '\n')
console.log('Date formatting equivalent, including Chile DST boundaries.')

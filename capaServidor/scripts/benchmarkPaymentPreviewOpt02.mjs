// Cache-only synthetic diagnostic, not API or browser latency. No DB or writes.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createPaymentPreviewCache } from '../../capaVista/src/modules/payments/api/paymentPreviewCache.js';
const output = { reference: 'b8e8a94', node: process.version, capturedAt: new Date().toISOString(),
  methodology: '10 fresh fixtures per series; mocked preview resolves after 5ms. Existing Map/promise cache reproduced for baseline; no real HTTP, token, DB or PIN.', samples: {} };
for (const scenario of ['cold', 'prefetched', 'reopen']) {
  for (const version of ['before', 'after']) {
    const values = [];
    for (let i = 0; i < 10; i++) {
      let calls = 0;
      const api = { getPaymentPreview: async () => { calls++; await new Promise(r => setTimeout(r, 5)); return { id: 1, products: [] }; } };
      const map = new Map();
      const current = createPaymentPreviewCache(api);
      const get = version === 'after' ? () => current.get(1) : () => {
        if (!map.has(1)) map.set(1, api.getPaymentPreview(1).catch(error => { map.delete(1); throw error; }));
        return map.get(1);
      };
      if (scenario !== 'cold') await get();
      const beforeCalls = calls, started = performance.now();
      assert.deepEqual(await get(), { id: 1, products: [] });
      values.push({ ms: +(performance.now() - started).toFixed(4), mockedReads: calls - beforeCalls });
      current.clear();
    }
    const sorted = values.map(v => v.ms).sort((a, b) => a - b);
    output.samples[scenario + '_' + version] = { n: 10, minMs: sorted[0], medianMs: +((sorted[4] + sorted[5]) / 2).toFixed(4),
      meanMs: +(sorted.reduce((a, b) => a + b, 0) / 10).toFixed(4), maxMs: sorted.at(-1), values };
  }
}
const destination = process.argv.find(v => v.startsWith('--output='))?.slice(9);
if (!destination) throw Error('Requires --output');
await writeFile(destination, JSON.stringify(output, null, 2) + '\n');

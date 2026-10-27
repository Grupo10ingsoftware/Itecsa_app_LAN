// No environment/network/DB/PIN. Real services/repos with a serial transactional double.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { paymentWorkflowFixture } from './fixtures/paymentWorkflowFixture.mjs';
import { PERMISSIONS as P, ROLES } from '../../shared/authorization.js';
import { toPaymentOrderDTO } from '../src/modules/orders/dto/order.dto.js';
const arg = name => process.argv.find(v => v.startsWith(`--${name}=`))?.slice(name.length + 3);
if (!arg('reference-root')) throw Error('Requires --reference-root');
const classes = {};
for (const [name, file] of Object.entries({ OrderService: 'orders/service/order.service.js', OrderRepository: 'orders/repo/orders.repo.js',
  PaymentRecordService: 'payments/service/paymentRecord.service.js', PaymentRecordRepo: 'payments/repo/paymentRecord.repo.js', PaymentStatusRepo: 'payments/repo/paymentStatus.repo.js' })) {
  classes[name] = (await import(pathToFileURL(resolve(arg('reference-root'), 'capaServidor/src/modules', file)).href)).default;
}
const output = { reference: 'b8e8a94', capturedAt: new Date().toISOString(), node: process.version,
  methodology: '10 fresh serial transactional fixtures per series; 5ms per logical I/O. Not physical SQL, HTTP, crypto or real DB writes.', samples: {}, errors: 0 };
const options = { actor: { idUsuario: 9 }, identityProvider: 'keycloak', role: ROLES.ADMIN_COBRANZAS,
  permissions: [P.UPDATE_PAYMENT_STATUS, P.REVISE_PAYMENT_STATUS], observacion: 'Synthetic reason' };
for (const [name, initial, target] of [['confirm', {}, 2], ['reject', {}, 3],
  ['revise_ready', { payment: 2, stage: 1 }, 3], ['revise_production', { payment: 2, stage: 2 }, 3]]) {
  let expected;
  for (const version of ['before', 'after']) {
    const values = [];
    for (let i = 0; i < 10; i++) {
      const f = paymentWorkflowFixture({ ...initial, delayMs: 5, ...(version === 'before' ? { classes } : {}) });
      const started = performance.now(); const result = toPaymentOrderDTO(await f.service.updPaymentState(1, target, options));
      const ms = +(performance.now() - started).toFixed(3);
      if (version === 'before') expected = result; else assert.deepEqual(result, expected);
      assert.equal(f.state.records.length, 1); assert.equal(f.state.decisions.length, 1); assert.equal(f.events.at(-1), 'commit');
      values.push({ ms, bytes: Buffer.byteLength(JSON.stringify(result)), events: f.events,
        decisions: f.state.decisions.length, messages: f.state.messages.length, recipients: f.state.recipients.length });
    }
    const sorted = values.map(v => v.ms).sort((a, b) => a - b);
    output.samples[name + '_' + version] = { n: 10, minMs: sorted[0], medianMs: +((sorted[4] + sorted[5]) / 2).toFixed(3),
      meanMs: +(sorted.reduce((a, b) => a + b, 0) / 10).toFixed(3), maxMs: sorted.at(-1), values };
  }
}
const json = JSON.stringify(output, null, 2) + '\n';
if (arg('output')) await writeFile(arg('output'), json); else process.stdout.write(json);

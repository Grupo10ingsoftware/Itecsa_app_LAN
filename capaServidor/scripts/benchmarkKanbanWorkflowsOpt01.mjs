// No dotenv, sockets, real database or PIN attempts. Logical-call timing only.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { productionFixture } from './fixtures/kanbanProductionFixture.mjs';
import OrderService from '../src/modules/orders/service/order.service.js';
import OrderRepository from '../src/modules/orders/repo/orders.repo.js';
import { toKanbanOrderDetailDTO } from '../src/modules/orders/dto/order.dto.js';
const arg = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
if (!arg('reference-root')) throw Error('--reference-root is required');
const baseline = file => import(pathToFileURL(resolve(arg('reference-root'), 'capaServidor/src/modules/orders', file)).href);
const { default: BeforeService } = await baseline('service/order.service.js');
const { default: BeforeRepository } = await baseline('repo/orders.repo.js');
const result = { reference: 'e7c65e3', capturedAt: new Date().toISOString(), node: process.version,
  environment: 'SYNTHETIC: real service/repository orchestration, serial transactional double, programmed 5ms/logical IO',
  exclusions: ['real MySQL', 'physical SQL/Prisma relation hydration', 'JWT and PIN hashing', 'HTTP/network', 'browser/render'], samples: {} };
for (const scenario of ['complete-first', 'complete-last', 'complete-lanyard-repeat', 'rollback-previous', 'rollback-finished']) {
  for (const [version, Service, Repository] of [['before', BeforeService, BeforeRepository], ['after', OrderService, OrderRepository]]) {
    const values = [];
    for (let i = 0; i < 10; i++) {
      const current = scenario === 'complete-last' || scenario === 'rollback-finished' ? 3 : scenario.includes('repeat') || scenario.includes('previous') ? 2 : 1;
      const fixture = productionFixture({ Service, current, finished: scenario === 'rollback-finished', latency: 5,
        ...(scenario.includes('lanyard') ? { product: 'Lanyard', progress: 50 } : {}) });
      const started = performance.now();
      const options = { actor: { idUsuario: 9 }, comment: 'Synthetic observation', response: 'receipt' };
      if (scenario.startsWith('complete')) await fixture.service.completeSubprocess(1, 2, current, options);
      else await fixture.service.rollbackSubprocess(1, 2, scenario === 'rollback-finished' ? 3 : 1, options);
      assert.equal(fixture.events.at(-1), 'commit');
      const state = fixture.state(); assert.equal(state.records.length, 1); assert.equal(state.subprocessRecords.length, 1);
      assert.equal(state.current, scenario === 'complete-first' ? 2 : scenario === 'complete-last' || scenario === 'rollback-finished' ? 3 : 1);
      const dto = toKanbanOrderDetailDTO(await new Repository({ prisma: fixture.tx }).getOrderView(1, 'kanban'));
      assert.equal(dto.items[0].subProcesses.length, 3); assert.equal(dto.comments.length, 1);
      values.push({ ms: +(performance.now() - started).toFixed(3), logicalCalls: { ...fixture.calls },
        publicBytes: Buffer.byteLength(JSON.stringify(dto)), confirmedRecords: state.records.length });
    }
    const sorted = values.map(value => value.ms).sort((a, b) => a - b);
    result.samples[scenario + '_' + version] = { n: 10, minMs: sorted[0], medianMs: +((sorted[4] + sorted[5]) / 2).toFixed(3),
      meanMs: +(sorted.reduce((a, b) => a + b, 0) / 10).toFixed(3), maxMs: sorted.at(-1), values };
  }
}
const json = JSON.stringify(result, null, 2) + '\n';
if (arg('output')) await writeFile(arg('output'), json); else process.stdout.write(json);

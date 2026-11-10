import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { normalizeProductionDate } from '../src/modules/productionLoad/service/productionDate.js';
import ProductionLoadService from '../src/modules/productionLoad/service/productionLoad.service.js';

const cases = [
  ['reported UTC day mismatch', '2026-11-10T01:40:03Z', '2026-11-09'],
  ['summer before midnight', '2026-01-01T02:59:59Z', '2025-12-31'],
  ['summer midnight', '2026-01-01T03:00:00Z', '2026-01-01'],
  ['winter before midnight', '2026-07-01T03:59:59Z', '2026-06-30'],
  ['winter midnight', '2026-07-01T04:00:00Z', '2026-07-01'],
  ['fall transition before repeated hour', '2026-04-05T02:59:59Z', '2026-04-04'],
  ['fall transition repeats prior date', '2026-04-05T03:00:00Z', '2026-04-04'],
  ['fall transition midnight', '2026-04-05T04:00:00Z', '2026-04-05'],
  ['spring transition before missing hour', '2026-09-06T03:59:59Z', '2026-09-05'],
  ['spring transition after missing hour', '2026-09-06T04:00:00Z', '2026-09-06'],
];
for (const [name, instant, expected] of cases) {
  test(name, () => assert.equal(normalizeProductionDate(undefined, () => new Date(instant)), expected));
}

test('date-only requests retain their calendar day without reading the clock', () => {
  const clock = () => { throw Error('Clock must not be used'); };
  for (const date of ['2026-11-10', '2024-02-29', '2026-09-06']) {
    assert.equal(normalizeProductionDate(date, clock), date);
  }
});
for (const value of ['2026-02-29', '2026-04-31', '2026-13-01', '2026-00-10', '2026-11-00', '2026-1-01', '2026-11-09T12:00:00Z']) {
  test(`reject invalid date ${value}`, () => assert.throws(() => normalizeProductionDate(value), error => error.status === 400 || error.statusCode === 400));
}

test('service reads and writes the same business date even if a write crosses midnight', async () => {
  const reads = [], writes = [];
  let clockReads = 0;
  const service = new ProductionLoadService({
    now: () => new Date(clockReads++ === 0 ? '2026-11-10T01:40:03Z' : '2026-11-10T04:00:00Z'),
    repo: { getCapacity: async () => 1500, listLanyardDetails: async date => { reads.push(date); return []; },
      updateDailyLoads: async args => writes.push(args) },
    userRepo: { findBySubject: async () => ({ idUsuario: 7 }) },
  });
  const result = await service.saveDailyLoad({ entries: [{ detailId: 1, quantity: 4 }], identitySubject: 'test-subject' });
  assert.equal(result.date, '2026-11-09');
  assert.equal(writes[0].dateKey, '2026-11-09');
  assert.deepEqual(reads, ['2026-11-09']);
  assert.equal(clockReads, 1);
  assert.equal((await service.getDailyLoad()).date, '2026-11-10');
});

test('defaults missing date values and preserves explicit dates in the service', async () => {
  const reads = [];
  const service = new ProductionLoadService({
    now: () => new Date('2026-11-10T01:40:03Z'),
    repo: { getCapacity: async () => 1500, listLanyardDetails: async date => { reads.push(date); return []; } }, userRepo: {},
  });
  for (const date of [undefined, null, '']) assert.equal((await service.getDailyLoad({ date })).date, '2026-11-09');
  assert.equal((await service.getDailyLoad({ date: '2026-11-10' })).date, '2026-11-10');
  assert.deepEqual(reads, ['2026-11-09', '2026-11-09', '2026-11-09', '2026-11-10']);
});

test('same instants produce the same business days under different process timezones', () => {
  const moduleUrl = new URL('../src/modules/productionLoad/service/productionDate.js', import.meta.url).href;
  const script = `import {normalizeProductionDate} from ${JSON.stringify(moduleUrl)};
    console.log(JSON.stringify(${JSON.stringify(cases)}.map(([,instant]) => normalizeProductionDate(null, () => new Date(instant)))));`;
  for (const TZ of ['UTC', 'America/Santiago', 'Pacific/Honolulu', 'Asia/Tokyo']) {
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], { env: { ...process.env, TZ }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), cases.map(item => item[2]));
  }
});

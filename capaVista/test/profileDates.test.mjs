import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { formatProfileDate } from '../src/modules/profile/utils/profileFormatters.js';

// The API supplies an ISO UTC timestamp or null. Display always uses Santiago,
// including its daylight-saving offset, regardless of the browser's local zone.
test('registration time uses Santiago summer time', () => {
  assert.equal(formatProfileDate('2026-01-15T12:30:00.000Z', { includeTime: true }), '15-01-2026 09:30');
});

test('registration time uses Santiago winter time', () => {
  assert.equal(formatProfileDate('2026-07-15T12:30:00.000Z', { includeTime: true }), '15-07-2026 08:30');
});

test('UTC timestamps can belong to the previous calendar year in Santiago', () => {
  assert.equal(formatProfileDate('2026-01-01T01:05:00.000Z', { includeTime: true }), '31-12-2025 22:05');
});

test('date-only display retains the Santiago calendar date', () => {
  const value = '2026-01-01T01:05:00.000Z';
  assert.equal(formatProfileDate(value), '31-12-2025');
  assert.equal(formatProfileDate(value, { includeTime: false }), '31-12-2025');
});

for (const [label, value] of [
  ['null', null],
  ['undefined', undefined],
  ['empty string', ''],
  ['invalid timestamp', 'not-a-date'],
]) {
  test(`${label} does not manufacture a registration date`, () => {
    assert.equal(formatProfileDate(value), 'Fecha no disponible');
    assert.equal(formatProfileDate(value, { includeTime: true }), 'Fecha no disponible');
  });
}

test('profile display does not depend on the runtime timezone', () => {
  const formatterUrl = new URL('../src/modules/profile/utils/profileFormatters.js', import.meta.url).href;
  const script = `
    import { formatProfileDate } from ${JSON.stringify(formatterUrl)};
    console.log(JSON.stringify([
      formatProfileDate('2026-01-15T12:30:00.000Z', { includeTime: true }),
      formatProfileDate('2026-07-15T12:30:00.000Z', { includeTime: true }),
      formatProfileDate('2026-01-01T01:05:00.000Z', { includeTime: true }),
    ]));
  `;
  for (const timezone of ['UTC', 'Pacific/Honolulu']) {
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
      env: { ...process.env, TZ: timezone }, encoding: 'utf8', timeout: 10000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), [
      '15-01-2026 09:30', '15-07-2026 08:30', '31-12-2025 22:05',
    ]);
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { createProductionLoadRefresh } from '../src/modules/kanban/utils/productionLoadRefresh.js';

const flush = () => new Promise(resolve => setImmediate(resolve));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function setup() {
  const requests = [];
  const events = [];
  const refresh = createProductionLoadRefresh({
    read({ signal }) {
      const request = { ...deferred(), signal };
      requests.push(request);
      return request.promise;
    },
    onPending: () => events.push(['pending']),
    onLoad: value => events.push(['load', value]),
    onError: error => events.push(['error', error]),
    onSettled: () => events.push(['settled']),
  });
  return { refresh, requests, events };
}

test('coalesces synchronous refreshes into one read after the current turn', async () => {
  const { refresh, requests, events } = setup();
  assert.equal(refresh.refresh(), undefined);
  refresh.refresh();
  refresh.refresh();
  assert.equal(requests.length, 0);
  await flush();
  assert.equal(requests.length, 1);
  assert.deepEqual(events, [['pending']]);
  requests[0].resolve({ total: 12 });
  await flush();
  assert.deepEqual(events, [['pending'], ['load', { total: 12 }], ['settled']]);
});

test('discards an invalidated response and runs just one fresh read without overlap', async () => {
  const { refresh, requests, events } = setup();
  refresh.refresh();
  await flush();
  refresh.refresh();
  refresh.refresh();
  assert.equal(requests[0].signal.aborted, true);
  await flush();
  assert.equal(requests.length, 1, 'even a read ignoring abort must finish before the next starts');
  requests[0].resolve({ total: 'old' });
  await flush();
  assert.equal(requests.length, 2);
  assert.deepEqual(events, [['pending'], ['pending']]);
  requests[1].resolve({ total: 'fresh' });
  await flush();
  assert.deepEqual(events, [['pending'], ['pending'], ['load', { total: 'fresh' }], ['settled']]);
});

test('reports read failure and settles; a later manual refresh can recover', async () => {
  const { refresh, requests, events } = setup();
  refresh.refresh();
  await flush();
  const failure = new Error('GET failed after a successful write');
  requests[0].reject(failure);
  await flush();
  assert.deepEqual(events, [['pending'], ['error', failure], ['settled']]);
  refresh.refresh();
  await flush();
  requests[1].resolve({ total: 4 });
  await flush();
  assert.deepEqual(events.slice(3), [['pending'], ['load', { total: 4 }], ['settled']]);
});

test('handles a synchronous read failure without rejecting refresh', async () => {
  const events = [];
  const failure = new Error('synchronous read failure');
  const refresh = createProductionLoadRefresh({
    read() { throw failure; },
    onError: error => events.push(error),
    onSettled: () => events.push('settled'),
  });
  assert.equal(refresh.refresh(), undefined);
  await flush();
  assert.deepEqual(events, [failure, 'settled']);
});

test('ignores errors from obsolete requests and continues the pending refresh', async () => {
  const { refresh, requests, events } = setup();
  refresh.refresh();
  await flush();
  refresh.refresh();
  requests[0].reject(new Error('aborted or stale read'));
  await flush();
  assert.equal(requests.length, 2);
  assert.deepEqual(events, [['pending'], ['pending']]);
  requests[1].resolve('fresh');
  await flush();
  assert.deepEqual(events, [['pending'], ['pending'], ['load', 'fresh'], ['settled']]);
});

test('suspend invalidates a running read and holds all refreshes until release', async () => {
  const { refresh, requests, events } = setup();
  refresh.refresh();
  await flush();
  const release = refresh.suspend();
  assert.equal(requests[0].signal.aborted, true);
  refresh.refresh();
  requests[0].resolve('before write');
  await flush();
  assert.equal(requests.length, 1);
  assert.deepEqual(events, [['pending']], 'loading stays pending while the write is held');
  release();
  release();
  await flush();
  assert.equal(requests.length, 2, 'release is idempotent');
  requests[1].resolve('after write');
  await flush();
  assert.deepEqual(events, [['pending'], ['pending'], ['load', 'after write'], ['settled']]);
});

test('release waits for an aborted read that has not completed', async () => {
  const { refresh, requests, events } = setup();
  refresh.refresh();
  await flush();
  const release = refresh.suspend();
  release();
  await flush();
  assert.equal(requests.length, 1);
  requests[0].resolve('stale');
  await flush();
  assert.equal(requests.length, 2);
  assert.deepEqual(events, [['pending'], ['pending']]);
  requests[1].resolve('fresh');
  await flush();
  assert.deepEqual(events.at(-1), ['settled']);
});

test('concurrent suspensions preserve invalidations and wait for the last writer', async () => {
  const { refresh, requests, events } = setup();
  const releaseFirst = refresh.suspend();
  const releaseSecond = refresh.suspend();
  refresh.refresh();
  refresh.refresh();
  await flush();
  assert.equal(requests.length, 0);
  assert.deepEqual(events, []);
  releaseFirst();
  releaseFirst();
  refresh.refresh();
  await flush();
  assert.equal(requests.length, 0);
  releaseSecond();
  await flush();
  assert.equal(requests.length, 1);
  requests[0].resolve('both writes completed');
  await flush();
  assert.deepEqual(events, [['pending'], ['load', 'both writes completed'], ['settled']]);
});

test('a suspension before the queued read starts prevents that read', async () => {
  const { refresh, requests } = setup();
  refresh.refresh();
  const release = refresh.suspend();
  await flush();
  assert.equal(requests.length, 0);
  release();
  await flush();
  assert.equal(requests.length, 1);
  requests[0].resolve('fresh');
  await flush();
});

for (const outcome of ['resolve', 'reject']) {
  test(`dispose aborts and ignores late ${outcome}, refreshes, and releases`, async () => {
    const { refresh, requests, events } = setup();
    refresh.refresh();
    await flush();
    const release = refresh.suspend();
    refresh.dispose();
    refresh.dispose();
    assert.equal(requests[0].signal.aborted, true);
    release();
    refresh.refresh();
    refresh.suspend()();
    requests[0][outcome](outcome === 'resolve' ? 'late data' : new Error('late error'));
    await flush();
    assert.equal(requests.length, 1);
    assert.deepEqual(events, [['pending']]);
  });
}

test('dispose before the microtask prevents the read and every callback', async () => {
  const { refresh, requests, events } = setup();
  refresh.refresh();
  refresh.dispose();
  await flush();
  assert.equal(requests.length, 0);
  assert.deepEqual(events, []);
});

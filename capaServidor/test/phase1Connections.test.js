import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { UserRepository } from '../src/modules/users/repo/users.repo.js';

// Public adapter API + pool double: no connections, credentials or server writes.
function poolFixture() {
  const events = [], pool = { ended: 0 };
  pool.query = async () => [['8.4.8']];
  pool.execute = async (_query, values) => { events.push(['pool-execute', values]); return { affectedRows: 1 }; };
  pool.end = async () => { pool.ended++; };
  pool.getConnection = async () => {
    const conn = new EventEmitter();
    conn.query = async ({ sql }) => { events.push(['tx', sql]); if (pool.failBegin && sql === 'BEGIN') throw Error('begin failed'); return []; };
    conn.execute = async (_query, values) => { events.push(['tx-execute', values]); return { affectedRows: 1 }; };
    conn.release = async () => { events.push(['release']); assert.equal(conn.listenerCount('error'), 0); };
    return conn;
  };
  return { pool, events };
}
const read = { sql: 'SELECT 1', args: [], argTypes: [] };
test('adapter reuses its supplied pool and retains the binary protocol under sequential/concurrent reads', async () => {
  const { pool, events } = poolFixture();
  const adapter = await new PrismaMariaDb(pool, { disposeExternalPool: true }).connect();
  assert.equal(adapter.underlyingDriver(), pool);
  await adapter.executeRaw(read);
  await adapter.executeRaw(read);
  await Promise.all(Array.from({ length: 4 }, () => adapter.executeRaw(read)));
  assert.equal(events.filter(x => x[0] === 'pool-execute').length, 6);
  await adapter.dispose(); assert.equal(pool.ended, 1);
});
test('transactions keep the reserved connection, commit/rollback and release without leaking listeners', async () => {
  const { pool, events } = poolFixture();
  const adapter = await new PrismaMariaDb(pool).connect();
  for (const end of ['commit', 'rollback']) {
    const tx = await adapter.startTransaction();
    await tx.executeRaw(read);
    await tx[end]();
  }
  assert.equal(events.filter(x => x[0] === 'pool-execute').length, 0);
  assert.equal(events.filter(x => x[0] === 'tx-execute').length, 2);
  assert.equal(events.filter(x => x[0] === 'release').length, 2);
  assert.ok(events.some(x => x[1] === 'COMMIT'));
  assert.ok(events.some(x => x[1] === 'ROLLBACK'));
  pool.failBegin = true;
  await assert.rejects(adapter.startTransaction(), /begin failed/);
  assert.equal(events.filter(x => x[0] === 'release').length, 3);
  await adapter.dispose(); assert.equal(pool.ended, 0); // External ownership is explicit.
});
test('pool acquisition and socket failures surface, and subsequent reads can recover', async () => {
  const { pool } = poolFixture();
  const adapter = await new PrismaMariaDb(pool).connect();
  const acquire = pool.getConnection, execute = pool.execute;
  pool.getConnection = async () => { throw Error('acquire timeout'); };
  await assert.rejects(adapter.startTransaction(), /acquire timeout/);
  pool.getConnection = acquire;
  pool.execute = async () => { throw Error('socket disconnected'); };
  await assert.rejects(adapter.executeRaw(read), /socket disconnected/);
  pool.execute = execute;
  assert.equal(await adapter.executeRaw(read), 1);
  await (await adapter.startTransaction()).rollback();
  await adapter.dispose();
});
test('identity query uses the injected transaction client without acquiring a second pool', async t => {
  const previous = process.env.KEYCLOAK_ISSUER; process.env.KEYCLOAK_ISSUER = 'https://test.invalid';
  t.after(() => { if (previous === undefined) delete process.env.KEYCLOAK_ISSUER; else process.env.KEYCLOAK_ISSUER = previous; });
  const expected = { idUsuario: 1, identitySubject: 'alice' }; let calls = 0;
  const tx = { $queryRaw: async () => { calls++; return [expected]; } };
  assert.deepEqual(await new UserRepository({ prisma: tx }).findBySubject('alice'), expected);
  assert.equal(calls, 1);
});

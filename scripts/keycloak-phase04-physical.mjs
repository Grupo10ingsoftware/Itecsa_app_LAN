import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import net from 'node:net';
import getPrismaClient, { disconnectPrismaClient } from '../capaServidor/src/database/prisma.js';

// Invoked only inside the owned MySQL container's network namespace by the lab.
assert.equal(process.cwd(), '/app/capaServidor');
assert.equal(process.env.LAB_STAGE, 'phase04-physical');
assert.equal(process.env.APP_ENV, 'test');
assert.equal(process.env.NODE_ENV, 'test');
assert.equal(process.env.DB_HOST, '127.0.0.1');
assert.equal(process.env.DB_PORT, '33307');
assert.equal(process.env.DB_NAME, 'itecsa_physical_test');
assert.equal(process.env.DB_USER, 'itecsa_test');
assert.equal(process.env.DB_SSL_MODE, 'disabled');
assert.equal(process.env.SALES_NOTE_SOURCE, 'fixture');
const target = new URL(process.env.DATABASE_URL);
assert.equal(target.hostname, process.env.DB_HOST);
assert.equal(target.port, process.env.DB_PORT);
assert.equal(target.pathname, '/' + process.env.DB_NAME);
assert.equal(target.username, process.env.DB_USER);
assert.equal(decodeURIComponent(target.password), process.env.DB_PASSWORD);
const cli = '/app/tooling/prisma/node_modules/prisma/build/index.js', config = '/app/capaServidor/prisma.config.ts';
let ready = false;
for (let i = 0; i < 100; i++) {
  ready = await new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port: 33307 });
    const finish = result => { socket.destroy(); resolve(result); };
    socket.setTimeout(500, () => finish(false));
    socket.once('error', () => finish(false));
    socket.once('data', data => finish(data.subarray(4).toString().includes('8.4.13')));
  });
  if (ready) break;
  await new Promise(resolve => setTimeout(resolve, 200));
}
assert.ok(ready, 'Disposable physical MySQL must be available');
// Use the same CLI initialization order as the identity lab. A first direct
// MariaDB-adapter login on a cold MySQL caching_sha2_password cache requires an
// RSA key; the CLI negotiates it without changing application driver security.
execFileSync(process.execPath, [cli, 'db', 'execute', '--config', config, '--stdin'], { input: 'SELECT 1;', encoding: 'utf8' });
const db = getPrismaClient();
try {
  assert.equal((await db.$queryRaw`SELECT DATABASE() AS name`)[0].name, 'itecsa_physical_test');
  const existing = await db.$queryRaw`SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema = DATABASE()`;
  assert.equal(Number(existing[0].total), 0, 'Never create schema on a nonempty target');
  const ddl = execFileSync(process.execPath, [cli, 'migrate', 'diff', '--config', config, '--from-empty', '--to-schema', '/app/capaServidor/prisma/schema.prisma', '--script'], { encoding: 'utf8' });
  execFileSync(process.execPath, [cli, 'db', 'execute', '--config', config, '--stdin'], { input: ddl, encoding: 'utf8' });
} finally { await disconnectPrismaClient(); }
for (const file of ['test/mysql.regressions.integration.test.js', 'test/mysql.security.integration.test.js']) {
  const result = spawnSync(process.execPath, ['--import', './test/setup.mjs', '--test', file], { stdio: 'inherit', timeout: 120000 });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `Original physical regression must pass: ${file}`);
}
console.log('PHASE04_PHYSICAL:PASS original-regression=1 original-security=2');

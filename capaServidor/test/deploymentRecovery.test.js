import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { installationState } from '../scripts/mysqlInstallState.mjs';
import { bootstrapKeycloakDatabase } from '../scripts/keycloakMysqlBootstrap.mjs';

function temporary(t) {
  const root = fs.mkdtempSync(path.join(tmpdir(), 'itecsa-recovery-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
test('an interrupted install binds retries to version and credentials without storing plaintext secrets', t => {
  const root = temporary(t);
  const env = { APP_VERSION: 'one', COMPOSE_PROJECT_NAME: 'test', MYSQL_PASSWORD: 'synthetic-secret' };
  assert.equal(installationState('begin', env, root), 'pending');
  assert.throws(() => installationState('begin', env, root), /ya existe/);
  assert.throws(() => installationState('resume', { ...env, APP_VERSION: 'two' }, root), /misma version/);
  assert.throws(() => installationState('resume', { ...env, MYSQL_PASSWORD: 'changed' }, root), /misma version/);
  assert.equal(installationState('resume', env, root), 'pending');
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'installation.json'), 'utf8'), /synthetic-secret/);
  assert.throws(() => installationState('complete', env, root), /identidad/);
  fs.writeFileSync(path.join(root, 'instance.env'), 'identity');
  assert.equal(installationState('complete', env, root), 'complete');
  assert.throws(() => installationState('resume', env, root), /pendiente/);
});

function keycloakFixture(t, { wrongPassword = false, extraGrant = false } = {}) {
  const root = temporary(t);
  const uuid = '12345678-1234-1234-1234-123456789abc';
  fs.writeFileSync(path.join(root, 'instance.env'), `MYSQL_COMPOSE_PROJECT=test\nMYSQL_DATABASE=itecsa\nMYSQL_SERVER_UUID=${uuid}\nMYSQL_SERVER_HOSTNAME=itecsa-mysql\nMYSQL_SERVER_PORT=3306\n`);
  fs.writeFileSync(path.join(root, 'ca.pem'), 'synthetic-ca');
  const env = { MYSQL_INSTANCE_FILE: path.join(root, 'instance.env'), COMPOSE_PROJECT_NAME: 'test', MYSQL_DATABASE: 'itecsa', MYSQL_ROOT_PASSWORD: 'root',
    MYSQL_USER: 'app', MYSQL_MIGRATION_USER: 'migrator', KEYCLOAK_DB_NAME: 'keycloak', KEYCLOAK_DB_USER: 'keycloak', KEYCLOAK_DB_PASSWORD: 'keycloak-secret',
    DB_SSL_CA_PATH: path.join(root, 'ca.pem'), KEYCLOAK_BOOTSTRAP_RESUME: '1' };
  const calls = [];
  const connector = { async createConnection(options) {
    if (options.user === 'keycloak') {
      assert.equal(options.host, 'mysql'); assert.equal(options.ssl.rejectUnauthorized, true);
      if (wrongPassword) throw Error('denied');
      return { async query() { return [{ account: 'keycloak@%' }]; }, async end() {} };
    }
    return { escapeId: v => '`' + v + '`', async end() {}, async query(sql) {
      calls.push(sql);
      if (sql.startsWith('SELECT @@hostname')) return [{ hostname: 'itecsa-mysql', uuid, version: '8.4.1', tls: 1 }];
      if (sql.includes('SCHEMATA')) return [{ SCHEMA_NAME: 'keycloak' }];
      if (sql.includes('TABLES')) return [{ TABLE_NAME: 'REALM' }];
      if (sql.startsWith('SELECT User')) return [{ User: 'keycloak' }];
      if (sql.startsWith('SELECT ssl_type')) return [{ ssl_type: 'ANY' }];
      if (sql.startsWith('SHOW GRANTS')) return [{ grant: 'GRANT USAGE ON *.* TO `keycloak`@`%`' },
        { grant: extraGrant ? 'GRANT ALL PRIVILEGES ON *.* TO `keycloak`@`%`' : 'GRANT ALL PRIVILEGES ON `keycloak`.* TO `keycloak`@`%`' }];
      return [];
    } };
  } };
  return { env, connector, calls };
}
test('Keycloak DB retry preserves existing tables and password', async t => {
  const f = keycloakFixture(t); await bootstrapKeycloakDatabase(f.env, f.connector);
  assert.ok(f.calls.some(sql => sql.startsWith('GRANT')));
  assert.ok(f.calls.every(sql => !/CREATE|ALTER|DROP|DELETE|TRUNCATE/.test(sql)));
});
for (const option of ['wrongPassword', 'extraGrant']) {
  test(`Keycloak DB retry refuses ${option} without changing an account`, async t => {
    const f = keycloakFixture(t, { [option]: true });
    await assert.rejects(bootstrapKeycloakDatabase(f.env, f.connector));
    assert.ok(f.calls.every(sql => !/^(CREATE|ALTER|DROP|GRANT)/.test(sql)));
  });
}

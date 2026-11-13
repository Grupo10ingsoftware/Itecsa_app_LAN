import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { readEnvironment } from './environment.mjs';
import { validateInitialAdministrators } from '../../shared/deploymentValidation.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const manager = readFileSync(path.join(root, 'deploy/mysql/manage.sh'), 'utf8').replace(/\r\n/g, '\n');
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
const definition = name => {
  const match = new RegExp('^' + name + '\\(\\) \\{\\n[\\s\\S]*?^\\}', 'm').exec(manager);
  assert.ok(match, name + ' is defined');
  return match[0];
};

function install(t, { action = 'install', status = 'pending', fail = false } = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), 'itecsa-initial-admins-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const trace = path.join(directory, 'trace');
  const script = `set -euo pipefail
record() { printf '%s\\n' "$*" >> "$TRACE"; }
compose() { record "compose:$*"; if [[ "$FAIL_ADMINS" == 1 && "$*" == *keycloak-initial-admins* ]]; then return 17; fi; }
installation_state() { record "state:$1"; if [[ "$1" == status ]]; then printf '%s\\n' "$INSTALL_STATUS"; fi; }
state_exists() { return 0; }
${['prepare_images', 'prepare_runtime', 'start_mysql', 'bootstrap_accounts', 'bootstrap_keycloak_database', 'deploy_database',
  'verify_database', 'start_application', 'verify_public_issuer', 'post_bootstrap', 'verify_application']
  .map(name => name + '() { record ' + name + '; }').join('\n')}
${definition('bootstrap_initial_administrators')}
${definition('install_database')}
PROJECT=fixture
install_database
`;
  const result = spawnSync(bash, ['-s'], { input: script, cwd: root, encoding: 'utf8',
    env: { ...process.env, TRACE: trace.replaceAll('\\', '/'), ACTION: action, INSTALL_STATUS: status, FAIL_ADMINS: fail ? '1' : '0' } });
  assert.ifError(result.error);
  return { result, events: readFileSync(trace, 'utf8').trim().split(/\r?\n/) };
}

test('a new install automatically provisions administrators after Keycloak and before declaring success', t => {
  const { result, events } = install(t);
  assert.equal(result.status, 0, result.stderr);
  const provision = events.indexOf('compose:--profile tools run --rm --no-deps keycloak-initial-admins');
  assert.ok(provision > events.indexOf('post_bootstrap'));
  assert.ok(events.indexOf('verify_application') > provision);
  assert.ok(events.indexOf('state:complete') > provision);
  assert.equal(events.filter(event => event.includes('keycloak-initial-admins')).length, 1);
});

test('failed administrator provisioning keeps the installation pending for resume', t => {
  const { result, events } = install(t, { fail: true });
  assert.equal(result.status, 17);
  assert.ok(!events.includes('verify_application'));
  assert.ok(!events.includes('state:complete'));
});

test('resume retries pending provisioning but does not bootstrap an existing legacy installation', t => {
  const pending = install(t, { action: 'resume' });
  assert.equal(pending.result.status, 0, pending.result.stderr);
  assert.ok(pending.events.includes('state:resume'));
  assert.ok(pending.events.some(event => event.includes('keycloak-initial-admins')));
  const legacy = install(t, { action: 'resume', status: 'legacy' });
  assert.equal(legacy.result.status, 0, legacy.result.stderr);
  assert.ok(!legacy.events.some(event => event.includes('keycloak-initial-admins')));
});

test('the deployment example creates the requested accounts without requiring invented personal data', () => {
  const accounts = validateInitialAdministrators(readEnvironment(path.join(root, 'deploy/mysql.env.example')));
  assert.deepEqual(accounts.map(account => account.username), ['ad.produccion', 'ad.cobranzas', 'ad.ventas']);
  assert.ok(accounts.every(account => account.firstName === 'Administrador' && account.temporaryPassword === 'Admin12345.'));
  assert.ok(accounts.every(account => account.email === null && account.rut === null));
});

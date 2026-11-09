import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const repo = path.resolve(import.meta.dirname, '../..');
const serviceNames = ['mysql', 'keycloak', 'api', 'web'];
const healthyServices = () => Object.fromEntries(serviceNames.map(name => [name, { running: true, health: 'healthy' }]));

// This executable never invokes Docker. Unknown commands fail instead of silently
// succeeding, so orchestration changes must still obey the fake service contract.
const fakeRuntime = String.raw`
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root = process.env.FIXTURE_ROOT;
const stateFile = path.join(root, 'state.json');
const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
const args = process.argv.slice(2);
const save = () => fs.writeFileSync(stateFile, JSON.stringify(state));
function record(phase, detail = {}) {
  state.counts[phase] = (state.counts[phase] ?? 0) + 1;
  state.events.push({ phase, ...detail });
  save();
  return state.faults.find(f => f.phase === phase && (f.fromOccurrence
    ? state.counts[phase] >= f.fromOccurrence : (f.occurrence ?? 1) === state.counts[phase]));
}
function finish(code = 0, stdout = '') { save(); if (stdout) process.stdout.write(stdout); process.exit(code); }
function error(message, code = 89) { console.error('FAKE: ' + message); finish(code); }
function action(phase, effect = () => {}, detail = {}) {
  const fault = record(phase, detail);
  if (fault?.signal) {
    // The parent is the Bash process executing this temporary fixture, never Docker.
    process.kill(process.ppid, fault.signal);
    finish();
  }
  if (fault && !fault.partial) error('injected ' + phase, fault.code ?? 73);
  effect(fault);
  if (fault) error('injected partial ' + phase, fault.code ?? 73);
}
function delegateNode(argv) {
  save();
  const result = spawnSync(process.env.REAL_NODE, argv, { encoding: 'utf8', env: process.env });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.status ?? 90);
}
if (path.basename(process.argv[1]) === 'node') {
  if (args[0]?.endsWith('/environment.mjs')) delegateNode(args);
  if (args[0] === '-e') {
    const code = args[1];
    if (code.includes('process.versions.node')) delegateNode(args);
    if (code.includes('node:dns')) { record('host:dns'); finish(); }
    if (code.includes('fetch(')) { action('verify:issuer'); finish(); }
    const destination = args.at(-1);
    if (destination.includes('/data/backups/')) {
      action('probe:host:' + path.basename(destination));
      delegateNode(args);
    }
    error('unrecognized host node expression');
  }
  if (args[0]?.endsWith('/render-realm.mjs')) { record('runtime:realm'); finish(); }
  if (args[0]?.endsWith('/post-bootstrap.mjs')) { action('verify:bootstrap'); finish(); }
  if (args[0]?.endsWith('/verify-service-client.mjs')) { action('verify:application'); finish(); }
  error('unrecognized host node command');
}
if (args[0] === 'info') { record('docker:info'); finish(); }
if (args[0] === 'image' && args[1] === 'inspect') {
  record('image:inspect'); finish(0, args.includes('--format') ? 'release-test\n' : '');
}
if (args[0] === 'inspect') {
  const id = args.at(-1).replace(/^fixture-/, '');
  if (!state.services[id]) error('unknown container');
  record('health:' + id); finish(0, state.services[id].health + '\n');
}
if (args[0] === 'run' && args.includes('mysql:generate-tls')) { record('runtime:tls'); finish(); }
if (args[0] !== 'compose') error('unrecognized docker command');
let at = 1;
while (['--project-name', '--env-file', '-f', '--profile'].includes(args[at])) at += 2;
const command = args[at++], rest = args.slice(at);
if (['version', 'config'].includes(command)) { record('compose:' + command); finish(); }
if (command === 'ps') {
  const service = rest.at(-1);
  if (!state.services[service]) error('unknown service in ps');
  record('running:' + service); finish(0, state.services[service].running ? 'fixture-' + service + '\n' : '');
}
if (['stop', 'start', 'up'].includes(command)) {
  const services = rest.filter(arg => Object.hasOwn(state.services, arg));
  if (!services.length) error('no known services for ' + command);
  action(command, fault => {
    for (const service of fault?.partial ? services.slice(0, 1) : services) state.services[service].running = command !== 'stop';
  }, { services });
  finish();
}
if (command === 'exec') { action('verify:container'); finish(); }
if (command !== 'run') error('unrecognized compose command ' + command);
const known = ['database-tools', 'install-state', 'db-backup', 'keycloak-db-backup', 'db-verify', 'maintenance', 'db-deploy', 'cert-install', 'runtime-install', 'keycloak-trust-bootstrap', 'api'];
let ri = 0;
while (ri < rest.length && rest[ri].startsWith('-')) ri += ['--pull', '--entrypoint'].includes(rest[ri]) ? 2 : 1;
const service = rest[ri], tail = rest.slice(ri + 1);
if (!known.includes(service)) error('unknown run service ' + service);
if (service === 'database-tools') { record('state:identity'); finish(0, 'present\n'); }
if (service === 'install-state') { record('state:installation'); finish(0, 'complete\n'); }
if (service === 'maintenance') {
  const mode = process.env.MYSQL_MAINTENANCE_ACTION;
  if (!['lock', 'migrate', 'unlock'].includes(mode)) error('unknown maintenance operation');
  action('grants:' + mode, fault => {
    if (mode === 'lock') { state.grants.api = false; if (!fault?.partial) state.grants.migrator = false; }
    else if (mode === 'migrate') state.grants.migrator = true;
    else state.grants.api = true;
  });
  finish();
}
if (service === 'db-verify') {
  const readonly = process.env.MYSQL_EXPECT_API_READ_ONLY === '1';
  action(readonly ? 'verify:readonly' : 'verify:full');
  if (state.grants.api !== !readonly || !state.grants.migrator) error('grants verification rejected', 66);
  finish();
}
if (service === 'db-backup' || service === 'keycloak-db-backup') {
  const kind = service === 'db-backup' ? 'mysql' : 'keycloak';
  if (tail.includes('-e')) {
    action('probe:container:' + kind);
    const code = tail[tail.indexOf('-e') + 1];
    delegateNode(['-e', code, path.join(root, 'data/backups', kind)]);
  }
  action('dump:' + kind);
  fs.writeFileSync(path.join(root, 'data/backups', kind, 'completed.sql'), '-- completed synthetic dump\n');
  finish();
}
if (service === 'db-deploy') { action('migration'); finish(); }
record('runtime:' + service); finish();
`;

function fixture(t, { services = healthyServices(), grants = { api: true, migrator: true }, faults = [] } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'itecsa-backup-regression-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const folder of ['deploy/mysql/private', 'deploy/keycloak/private', 'shared', 'bin', 'certs', 'data/backups']) {
    mkdirSync(path.join(root, folder), { recursive: true });
  }
  for (const file of ['deploy/mysql/manage.sh', 'deploy/mysql/backup.sh', 'deploy/mysql/environment.mjs', 'deploy/mysql.env.example', 'shared/deploymentValidation.mjs']) {
    writeFileSync(path.join(root, file), readFileSync(path.join(repo, file)));
  }
  writeFileSync(path.join(root, 'compose.mysql.yaml'), 'services: {}\n');
  writeFileSync(path.join(root, 'api.env'), ['PIN_SECRET', 'RATE_LIMIT_SECRET', 'SECURITY_LOG_HMAC_KEY', 'CURSOR_SECRET'].map((key, i) => `${key}=${Buffer.alloc(32, i + 1).toString('base64')}`).join('\n') + '\n');
  writeFileSync(path.join(root, 'web.env'), 'VITE_AUTH_PROVIDER=keycloak\n');
  for (const file of ['ca.pem', 'tls.crt', 'tls.key', 'certs/ca.pem', 'certs/server-cert.pem', 'certs/server-key.pem']) writeFileSync(path.join(root, file), 'fixture\n');
  writeFileSync(path.join(root, 'deploy/keycloak/private/itecsa-realm.json'), '{}\n');
  const env = {
    COMPOSE_PROJECT_NAME: 'itecsa-test', APP_VERSION: 'release-test', DEPLOY_IMAGE_MODE: 'preloaded',
    MYSQL_IMAGE: 'mysql:test', API_IMAGE: 'api:test', WEB_IMAGE: 'web:test', DB_TOOLS_IMAGE: 'tools:test', KEYCLOAK_IMAGE: 'keycloak:test',
    API_ENV_FILE: './api.env', WEB_ENV_FILE: './web.env', MYSQL_CERTS_DIR: './certs', MYSQL_PRIVATE_DIR: './private',
    MYSQL_DATABASE: 'itecsa', MYSQL_USER: 'app', MYSQL_MIGRATION_USER: 'migrator',
    MYSQL_ROOT_PASSWORD: 'root-password-for-testing', MYSQL_PASSWORD: 'api-password-for-testing', MYSQL_MIGRATION_PASSWORD: 'migrator-password-for-testing',
    KEYCLOAK_DB_NAME: 'keycloak', KEYCLOAK_DB_USER: 'keycloak', KEYCLOAK_DB_PASSWORD: 'keycloak-password-for-testing',
    KEYCLOAK_ADMIN_CLIENT_SECRET: 'client-secret-for-testing-at-least-32', KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME: 'temporary',
    KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD: 'temporary-password-for-testing', KEYCLOAK_OPERATOR_USERNAME: 'operator', KEYCLOAK_OPERATOR_PASSWORD: 'operator-password-for-testing',
    LAN_CA_FILE: './ca.pem', LAN_TLS_CERT_FILE: './tls.crt', LAN_TLS_KEY_FILE: './tls.key', PUBLIC_ORIGIN: 'https://itecsa.test',
  };
  writeFileSync(path.join(root, 'deploy/mysql.env'), Object.entries(env).map(([key, value]) => `${key}='${value}'`).join('\n') + '\n');
  writeFileSync(path.join(root, 'state.json'), JSON.stringify({ services, grants, faults, counts: {}, events: [] }));
  for (const name of ['docker', 'node']) writeFileSync(path.join(root, 'bin', name), `#!${process.execPath}\n${fakeRuntime}`, { mode: 0o755 });
  writeFileSync(path.join(root, 'bin/openssl'), '#!/usr/bin/env bash\nif [[ "$*" == *"-pubin"* ]]; then cat >/dev/null; fi\necho "does match"\n', { mode: 0o755 });
  const executionEnv = { ...process.env, PATH: `${root}/bin:${process.env.PATH}`, FIXTURE_ROOT: root, REAL_NODE: process.execPath, MYSQL_DEPLOY_ENV_FILE: path.join(root, 'deploy/mysql.env') };
  let lastResult;
  const run = action => {
    lastResult = spawnSync('bash', [path.join(root, 'deploy/mysql/manage.sh'), action], { cwd: root, encoding: 'utf8', timeout: 15000, env: executionEnv });
    assert.doesNotMatch(lastResult.stderr ?? '', /FAKE: (unrecognized|unknown|no known)/, 'test double must recognize every command');
    return lastResult;
  };
  const state = () => JSON.parse(readFileSync(path.join(root, 'state.json')));
  return { root, run, state, executionEnv, diagnostic: () => JSON.stringify(state().events) + '\n' + lastResult?.stderr, phases: () => state().events.map(event => event.phase) };
}
const assertSuccess = result => assert.equal(result.status, 0, result.stderr || result.error?.message);
const assertFailure = result => { assert.notEqual(result.status, 0, result.stdout); assert.equal(result.signal, null, result.error?.message); };
const assertUntouched = (f, services, grants) => {
  assert.deepEqual(f.state().services, services);
  assert.deepEqual(f.state().grants, grants);
  assert.ok(!f.phases().some(phase => /^(stop|start|up|grants:)/.test(phase)), JSON.stringify(f.state().events));
};
const assertRecovered = f => {
  assert.deepEqual(f.state().services, healthyServices(), f.diagnostic());
  assert.deepEqual(f.state().grants, { api: true, migrator: true });
};
const assertClosed = f => {
  assert.equal(f.state().services.api.running, false);
  assert.equal(f.state().services.keycloak.running, false);
  assert.equal(f.state().services.mysql.running, true);
  assert.equal(f.state().services.web.running, true);
  assert.deepEqual(f.state().grants, { api: false, migrator: false });
};

for (const destination of ['mysql', 'keycloak']) {
  test(`backup rejects an unusable host ${destination} destination before interruption`, t => {
    const f = fixture(t);
    writeFileSync(path.join(f.root, 'data/backups', destination), 'occupied by a regular file');
    assertFailure(f.run('backup'));
    assertUntouched(f, healthyServices(), { api: true, migrator: true });
  });
  test(`backup rejects an unwritable container ${destination} destination before interruption`, t => {
    const f = fixture(t, { faults: [{ phase: 'probe:container:' + destination }] });
    assertFailure(f.run('backup'));
    assert.ok(f.phases().includes('probe:container:' + destination));
    assertUntouched(f, healthyServices(), { api: true, migrator: true });
  });
}
test('backup probes both host and container destinations, then restores a healthy deployment', t => {
  const f = fixture(t);
  assertSuccess(f.run('backup'));
  assertRecovered(f);
  const phases = f.phases(), firstStop = phases.indexOf('stop');
  for (const phase of ['probe:host:mysql', 'probe:host:keycloak', 'probe:container:mysql', 'probe:container:keycloak', 'verify:full', 'verify:application']) {
    assert.ok(phases.indexOf(phase) >= 0 && phases.indexOf(phase) < firstStop, phase + ' must precede interruption');
  }
  for (const kind of ['mysql', 'keycloak']) assert.ok(existsSync(path.join(f.root, 'data/backups', kind, 'completed.sql')));
  assert.ok(!phases.includes('up'), 'backups must not create or recreate services');
});
for (const failed of ['mysql', 'keycloak']) {
  test(`failed ${failed} dump returns failure and restores service/grant availability`, t => {
    const f = fixture(t, { faults: [{ phase: 'dump:' + failed }] });
    const result = f.run('backup');
    assert.equal(result.status, 73, result.stderr);
    assertRecovered(f);
    assert.ok(!f.phases().includes('up'));
    assert.equal(existsSync(path.join(f.root, 'data/backups/mysql/completed.sql')), failed === 'keycloak');
  });
}
test('partially applied lock failure is recovered without starting against revoked grants', t => {
  const f = fixture(t, { faults: [{ phase: 'grants:lock', partial: true }] });
  assert.equal(f.run('backup').status, 73);
  assertRecovered(f);
  assert.ok(!f.phases().some(phase => phase.startsWith('dump:')));
  const phases = f.phases();
  assert.ok(phases.lastIndexOf('verify:full') < phases.indexOf('start'));
});
test('partially completed stop is recovered without granting permissions', t => {
  const f = fixture(t, { faults: [{ phase: 'stop', partial: true }] });
  assert.equal(f.run('backup').status, 73);
  assertRecovered(f);
  assert.ok(!f.phases().some(phase => phase.startsWith('grants:')));
});
for (const fault of [
  { phase: 'grants:lock', occurrence: 2 }, { phase: 'grants:migrate' },
  { phase: 'verify:readonly' }, { phase: 'grants:unlock' },
  { phase: 'verify:full', occurrence: 2 }, { phase: 'start', partial: true },
  { phase: 'verify:application', occurrence: 2 },
]) {
  test(`recovery failure at ${fault.phase} leaves the full stack safely blocked`, t => {
    const f = fixture(t, { faults: [{ phase: 'dump:keycloak', code: 71 }, fault] });
    const result = f.run('backup');
    assert.equal(result.status, 71, result.stderr);
    assertClosed(f);
    assert.ok((f.state().counts[fault.phase] ?? 0) >= (fault.occurrence ?? 1), 'injected recovery phase was not reached: ' + f.diagnostic());
    if (!['start', 'verify:application'].includes(fault.phase)) assert.ok(!f.phases().includes('start'));
  });
}
for (const action of ['backup', 'keycloak-backup']) {
  for (const mode of ['stopped', 'partial', 'unhealthy', 'maintenance']) {
    test(`${action} rejects prior ${mode} state without starting services or granting writes`, t => {
      const services = healthyServices(), grants = { api: true, migrator: true };
      if (mode === 'stopped') for (const service of Object.values(services)) service.running = false;
      if (mode === 'partial') services.api.running = false;
      if (mode === 'unhealthy') services.keycloak.health = 'unhealthy';
      if (mode === 'maintenance') { grants.api = false; grants.migrator = false; }
      const f = fixture(t, { services, grants });
      assertFailure(f.run(action));
      assertUntouched(f, services, grants);
    });
  }
}
for (const failDump of [false, true]) {
  test(`keycloak-backup ${failDump ? 'failure' : 'success'} restores only Keycloak without changing grants`, t => {
    const f = fixture(t, { faults: failDump ? [{ phase: 'dump:keycloak' }] : [] });
    const result = f.run('keycloak-backup');
    if (failDump) assert.equal(result.status, 73, result.stderr); else assertSuccess(result);
    assertRecovered(f);
    assert.ok(!f.phases().some(phase => /^(grants:|dump:mysql|up$)/.test(phase)));
    assert.ok(f.state().events.filter(event => ['stop', 'start'].includes(event.phase)).every(event => JSON.stringify(event.services) === '["keycloak"]'));
  });
}
test('failed Keycloak restart leaves Keycloak stopped and never affects API grants', t => {
  const f = fixture(t, { faults: [{ phase: 'dump:keycloak', code: 71 }, { phase: 'start', partial: true }] });
  assert.equal(f.run('keycloak-backup').status, 71);
  assert.equal(f.state().services.keycloak.running, false);
  for (const service of ['api', 'mysql', 'web']) assert.equal(f.state().services[service].running, true);
  assert.deepEqual(f.state().grants, { api: true, migrator: true });
  assert.ok(!f.phases().some(phase => phase.startsWith('grants:')));
});
test('update migration failure retains the existing fail-closed policy', t => {
  const f = fixture(t, { faults: [{ phase: 'migration' }] });
  assertFailure(f.run('update'));
  assert.ok(f.phases().includes('migration'), f.diagnostic());
  assert.equal(f.state().services.api.running, false);
  assert.deepEqual(f.state().grants, { api: false, migrator: false });
  assert.ok(!f.phases().includes('grants:unlock'));
  assert.ok(!f.state().events.some(event => ['start', 'up'].includes(event.phase) && event.services.includes('api')));
});

test('successful dumps still report failure when restoring service availability fails', t => {
  const f = fixture(t, { faults: [{ phase: 'grants:unlock' }] });
  assert.equal(f.run('backup').status, 73);
  for (const kind of ['mysql', 'keycloak']) assert.ok(existsSync(path.join(f.root, 'data/backups', kind, 'completed.sql')));
  assertClosed(f);
});
for (const action of ['backup', 'keycloak-backup']) {
  test(`${action} rejects failed application verification before changing availability`, t => {
    const f = fixture(t, { faults: [{ phase: 'verify:application' }] });
    assertFailure(f.run(action));
    assertUntouched(f, healthyServices(), { api: true, migrator: true });
    assert.equal(f.state().counts['verify:application'], 1);
  });
}
test('an existing deployment lock rejects backup without invoking Docker', t => {
  const f = fixture(t);
  const result = spawnSync('bash', ['-c', 'exec 8>"$FIXTURE_ROOT/deploy/mysql/private/operation.lock"; flock -n 8 || exit 90; bash "$FIXTURE_ROOT/deploy/mysql/manage.sh" backup'], {
    cwd: f.root, encoding: 'utf8', timeout: 15000, env: f.executionEnv,
  });
  assertFailure(result);
  assert.match(result.stderr, /otra operacion|en curso/);
  assert.deepEqual(f.state().events, []);
});

test('SIGTERM during a dump returns 143 and restores services and grants', t => {
  const f = fixture(t, { faults: [{ phase: 'dump:mysql', signal: 'SIGTERM' }] });
  const result = f.run('backup');
  assert.equal(result.status, 143, result.stderr);
  assert.equal(result.signal, null);
  assertRecovered(f);
  assert.equal(f.state().counts['dump:mysql'], 1);
  assert.ok(!f.phases().includes('dump:keycloak'));
  assert.doesNotMatch(result.stdout, /respaldo .* completado y servicio verificado/);
});
for (const protection of ['stop', 'lock']) {
  test(`persistent ${protection} failure during protection reports an unconfirmed state`, t => {
    const faults = [{ phase: 'dump:keycloak', code: 71 }];
    if (protection === 'stop') {
      faults.push({ phase: 'start', partial: true }, { phase: 'stop', fromOccurrence: 2, code: 74 });
    } else {
      faults.push({ phase: 'verify:full', occurrence: 2 }, { phase: 'grants:lock', fromOccurrence: 3, code: 74 });
    }
    const f = fixture(t, { faults });
    const result = f.run('backup');
    assert.equal(result.status, 71, result.stderr);
    assert.match(result.stderr, /no se pudo confirmar la proteccion/);
    assert.doesNotMatch(result.stderr, /Proteccion confirmada/);
    assert.doesNotMatch(result.stdout, /respaldo .* completado y servicio verificado/);
    if (protection === 'stop') {
      assert.equal(f.state().counts.stop, 2);
      assert.equal(f.state().services.keycloak.running, true, 'failed stop must remain observable');
      assert.deepEqual(f.state().grants, { api: false, migrator: false });
    } else {
      assert.equal(f.state().counts['grants:lock'], 3);
      assert.equal(f.state().services.api.running, false);
      assert.equal(f.state().services.keycloak.running, false);
      assert.deepEqual(f.state().grants, { api: true, migrator: true }, 'failed grant revocation must remain observable');
    }
  });
}

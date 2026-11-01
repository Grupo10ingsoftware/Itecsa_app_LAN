import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const repo = path.resolve(import.meta.dirname, '../..');
function fixture(overrides = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'itecsa-manage-'));
  for (const folder of ['deploy/mysql', 'deploy/keycloak/private', 'shared', 'bin', 'state', 'certs']) mkdirSync(path.join(root, folder), { recursive: true });
  for (const file of ['deploy/mysql/manage.sh', 'deploy/mysql/environment.mjs', 'deploy/mysql.env.example', 'shared/deploymentValidation.mjs']) {
    writeFileSync(path.join(root, file), readFileSync(path.join(repo, file)));
  }
  writeFileSync(path.join(root, 'compose.mysql.yaml'), 'services: {}\n');
  writeFileSync(path.join(root, 'api.env'), ['PIN_SECRET', 'RATE_LIMIT_SECRET', 'SECURITY_LOG_HMAC_KEY', 'CURSOR_SECRET'].map((k, i) => `${k}=${Buffer.alloc(32, i + 1).toString('base64')}\n`).join(''));
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
    FIRST_USER_USERNAME: 'soporte', FIRST_USER_EMAIL: 'soporte@example.invalid', FIRST_USER_FIRST_NAME: 'Nombre', FIRST_USER_LAST_NAME: 'Apellido',
    FIRST_USER_RUT: '12.345.678-5', FIRST_USER_TEMP_PASSWORD: 'Temporary-Fixture-1234!', ...overrides,
  };
  const save = ({ crlf = false } = {}) => writeFileSync(path.join(root, 'deploy/mysql.env'), Object.entries(env).map(([k,v]) => `${k}='${v}'`).join(crlf ? '\r\n' : '\n') + '\n');
  save();
  // Docker is simulated, while the persistent receipt uses the real implementation.
  writeFileSync(path.join(root, 'bin/docker'), `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$FIXTURE_ROOT/calls"
if [[ "$1 $2" == 'image inspect' ]]; then
  if [[ "$3" == '--format' ]]; then printf 'release-test\\n'; exit 0; fi
  [[ "$3" != "$MISSING_IMAGE" ]]; exit
fi
if [[ "$*" == *'install-state node scripts/mysqlInstallState.mjs'* ]]; then
  exec "$REAL_NODE" "$STATE_RUNNER" "\${@: -1}"
fi
if [[ "$*" == *'database-tools sh -c'* ]]; then
  if [[ -s "$FIXTURE_ROOT/state/instance.env" ]]; then echo present; else echo absent; fi
  exit 0
fi
if [[ "$*" == *'account-bootstrap'* ]]; then echo 'identity' > "$FIXTURE_ROOT/state/instance.env"; fi
if [[ "$*" == *'db-deploy'* && -f "$FIXTURE_ROOT/fail-migration" ]]; then rm "$FIXTURE_ROOT/fail-migration"; exit 1; fi
if [[ "$*" == *' ps --status running '* && ! -f "$FIXTURE_ROOT/stopped" ]]; then echo 'container-fixture'; fi
exit 0
`, { mode: 0o755 });
  writeFileSync(path.join(root, 'state-runner.mjs'), `import {installationState} from ${JSON.stringify(path.join(repo, 'capaServidor/scripts/mysqlInstallState.mjs'))};\ntry { console.log(installationState(process.argv[2],process.env,process.env.FIXTURE_ROOT+'/state')); } catch(e) {console.error(e.message);process.exitCode=1;}\n`);
  writeFileSync(path.join(root, 'bin/node'), `#!/usr/bin/env bash
if [[ "$1" == *environment.mjs ]]; then exec "$REAL_NODE" "$@"; fi
if [[ "$1" == *post-bootstrap.mjs ]]; then
  if [[ -f "$FIXTURE_ROOT/fail-bootstrap" ]]; then rm "$FIXTURE_ROOT/fail-bootstrap"; exit 1; fi
fi
exit 0
`, { mode: 0o755 });
  writeFileSync(path.join(root, 'bin/openssl'), '#!/usr/bin/env bash\nif [[ "$*" == *"-pubin"* ]]; then cat >/dev/null; fi\necho "does match"\n', { mode: 0o755 });
  const run = (action, extra = {}) => spawnSync('bash', [path.join(root, 'deploy/mysql/manage.sh'), action], {
    cwd: root, encoding: 'utf8', env: { ...process.env, PATH: `${root}/bin:${process.env.PATH}`, FIXTURE_ROOT: root,
      REAL_NODE: process.execPath, STATE_RUNNER: path.join(root, 'state-runner.mjs'), ...extra },
  });
  const calls = () => existsSync(path.join(root, 'calls')) ? readFileSync(path.join(root, 'calls'), 'utf8').trim().split('\n') : [];
  return { root, env, save, run, calls, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

for (const missing of ['mysql:test', 'api:test', 'web:test', 'tools:test', 'keycloak:test']) {
  test(`preloaded rejects missing ${missing} before mutation`, () => {
    const f = fixture(); try {
      const result = f.run('install', { MISSING_IMAGE: missing });
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /imagen no cargada/);
      assert.ok(f.calls().every(c => c.startsWith('image inspect') || c.includes(' version') || c.includes(' config --quiet') || c === 'info'));
    } finally { f.cleanup(); }
  });
}
test('check accepts quoted CRLF and uses file values instead of an ambient project', () => {
  const f = fixture(); try {
    f.save({ crlf: true });
    const result = f.run('check', { COMPOSE_PROJECT_NAME: 'wrong-project', MYSQL_PASSWORD: 'wrong' });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(f.calls().every(c => !/\s(up|run|build|pull|stop)\s/.test(c)));
    assert.ok(f.calls().some(c => c.includes('--project-name itecsa-test')));
  } finally { f.cleanup(); }
});
test('rejects inherited DB configuration without revealing credentials or calling Docker', () => {
  const f = fixture(); try {
    writeFileSync(path.join(f.root, 'api.env'), 'DB_HOST=private.example.invalid\nDB_PASSWORD=private-test-secret\n');
    const result = f.run('install');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /variables de conexion MySQL heredadas/);
    assert.doesNotMatch(result.stderr, /private-test-secret|private.example/);
    assert.deepEqual(f.calls(), []);
  } finally { f.cleanup(); }
});
test('invalid first-user fields fail before any Docker call', () => {
  const f = fixture({ FIRST_USER_TEMP_PASSWORD: 'too-short-secret' }); try {
    const result = f.run('first-user');
    assert.equal(result.status, 1); assert.match(result.stderr, /FIRST_USER_TEMP_PASSWORD/);
    assert.doesNotMatch(result.stderr, /too-short-secret/); assert.deepEqual(f.calls(), []);
  } finally { f.cleanup(); }
});
for (const failure of ['fail-migration', 'fail-bootstrap']) {
  test(`resume after ${failure} keeps accounts and requires original config`, () => {
    const f = fixture(); try {
      writeFileSync(path.join(f.root, failure), '1');
      assert.equal(f.run('install').status, 1);
      const secondInstall = f.run('install');
      assert.equal(secondInstall.status, 1); assert.match(secondInstall.stderr, /ya existe/);
      f.env.APP_VERSION = 'other-release'; f.save();
      assert.equal(f.run('resume').status, 1);
      f.env.APP_VERSION = 'release-test'; f.save();
      const result = f.run('resume'); assert.equal(result.status, 0, result.stderr);
      assert.equal(f.calls().filter(c => /--no-deps account-bootstrap$/.test(c)).length, 1);
      assert.ok(f.calls().filter(c => c.includes(' up ')).every(c => c.includes('--pull never --no-build')));
      assert.ok(f.calls().every(c => !/\s(pull|build|down)\s/.test(c)));
      assert.equal(JSON.parse(readFileSync(path.join(f.root, 'state/installation.json'))).status, 'complete');
    } finally { f.cleanup(); }
  });
}
test('verify does not start services, prepare certificates, build or bootstrap', () => {
  const f = fixture(); try {
    const install = f.run('install'); assert.equal(install.status, 0, install.stderr);
    writeFileSync(path.join(f.root, 'calls'), '');
    const result = f.run('verify'); assert.equal(result.status, 0, result.stderr);
    assert.ok(f.calls().every(c => !/\s(up|stop|build|pull)\s/.test(c) && !/runtime-install|cert-install|bootstrap|db-deploy/.test(c)));
    writeFileSync(path.join(f.root, 'stopped'), '1');
    assert.equal(f.run('verify').status, 1);
  } finally { f.cleanup(); }
});

test('build update prepares the new tools image before reading installation state', () => {
  const f = fixture(); try {
    const install = f.run('install'); assert.equal(install.status, 0, install.stderr);
    f.env.DEPLOY_IMAGE_MODE = 'build'; f.save();
    writeFileSync(path.join(f.root, 'calls'), '');
    const result = f.run('update'); assert.equal(result.status, 0, result.stderr);
    const calls = f.calls();
    const built = calls.findIndex(c => c.includes(' build api web database-tools keycloak'));
    const state = calls.findIndex(c => c.includes('install-state node scripts/mysqlInstallState.mjs status'));
    assert.ok(built >= 0 && state > built);
  } finally { f.cleanup(); }
});

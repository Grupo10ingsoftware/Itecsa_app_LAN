import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const imageNames = ['mysql:test', 'api:test', 'web:test', 'tools:test', 'keycloak:test'];
const actions = ['install', 'update', 'start', 'verify', 'backup', 'keycloak-backup',
  'restore', 'keycloak-restore', 'first-user'];

function fixture(missingImage) {
  const root = mkdtempSync(path.join(tmpdir(), 'itecsa-preloaded-'));
  mkdirSync(path.join(root, 'deploy/mysql'), { recursive: true });
  mkdirSync(path.join(root, 'deploy/keycloak/private'), { recursive: true });
  mkdirSync(path.join(root, 'bin'));
  writeFileSync(path.join(root, 'deploy/mysql/manage.sh'), readFileSync(new URL('./manage.sh', import.meta.url)));
  writeFileSync(path.join(root, 'compose.mysql.yaml'), 'services: {}\n');
  writeFileSync(path.join(root, 'api.env'), 'APP_ENV=production\n');
  writeFileSync(path.join(root, 'web.env'), 'VITE_AUTH_PROVIDER=keycloak\n');
  writeFileSync(path.join(root, 'ca.pem'), 'fixture\n');
  writeFileSync(path.join(root, 'tls.crt'), 'fixture\n');
  writeFileSync(path.join(root, 'tls.key'), 'fixture\n');
  writeFileSync(path.join(root, 'deploy/keycloak/private/itecsa-realm.json'), '{}\n');
  writeFileSync(path.join(root, 'deploy/mysql.env'), [
    'COMPOSE_PROJECT_NAME=itecsa-test', 'APP_VERSION=release-test', 'DEPLOY_IMAGE_MODE=preloaded',
    'MYSQL_IMAGE=mysql:test', 'API_IMAGE=api:test', 'WEB_IMAGE=web:test',
    'DB_TOOLS_IMAGE=tools:test', 'KEYCLOAK_IMAGE=keycloak:test',
    'API_ENV_FILE=./api.env', 'WEB_ENV_FILE=./web.env',
    'KEYCLOAK_DB_NAME=keycloak', 'KEYCLOAK_DB_USER=keycloak', 'KEYCLOAK_DB_PASSWORD=fixture',
    'KEYCLOAK_ADMIN_CLIENT_SECRET=fixture', 'KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME=fixture',
    'KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD=fixture', 'KEYCLOAK_OPERATOR_USERNAME=fixture',
    'KEYCLOAK_OPERATOR_PASSWORD=fixture', 'LAN_CA_FILE=./ca.pem',
    'LAN_TLS_CERT_FILE=./tls.crt', 'LAN_TLS_KEY_FILE=./tls.key',
    'PUBLIC_ORIGIN=https://itecsa.test', '',
  ].join('\n'));
  writeFileSync(path.join(root, 'bin/docker'), `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$DOCKER_CALLS"
if [[ "$1 $2" == 'image inspect' ]]; then
  if [[ "$3" == '--format' ]]; then printf 'release-test\\n'; exit 0; fi
  [[ "$3" != "$MISSING_IMAGE" ]]
fi
`, { mode: 0o755 });
  writeFileSync(path.join(root, 'bin/node'), '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 });
  const callsFile = path.join(root, 'docker-calls.txt');
  const run = action => spawnSync('bash', [path.join(root, 'deploy/mysql/manage.sh'), action], {
    cwd: root, encoding: 'utf8', env: {
      ...process.env, PATH: `${path.join(root, 'bin')}:${process.env.PATH}`,
      DOCKER_CALLS: callsFile, MISSING_IMAGE: missingImage ?? '',
    },
  });
  const calls = () => readFileSync(callsFile, 'utf8').trim().split('\n').filter(Boolean);
  return { root, run, calls };
}

test('preloaded verifica cada imagen antes de modificar una instalacion nueva', () => {
  for (const missing of imageNames) {
    const f = fixture(missing);
    try {
      const result = f.run('install');
      assert.equal(result.error, undefined);
      assert.equal(result.status, 1);
      assert.match(result.stderr, new RegExp(`imagen no cargada: ${missing}`));
      assert.ok(f.calls().every(call => call.startsWith('image inspect ')));
      assert.ok(f.calls().some(call => call === `image inspect ${missing}`));
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  }
});

test('preloaded bloquea todas las acciones que pueden iniciar o alterar el despliegue', () => {
  for (const action of actions) {
    const f = fixture('web:test');
    try {
      const result = f.run(action);
      assert.equal(result.error, undefined);
      assert.equal(result.status, 1, action);
      assert.match(result.stderr, /imagen no cargada: web:test/, action);
      assert.ok(f.calls().every(call => call.startsWith('image inspect ')), action);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  }
});

test('preloaded inicia con imagenes presentes sin solicitar pull ni build', () => {
  const f = fixture();
  try {
    const result = f.run('start');
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    const calls = f.calls();
    assert.equal(calls.filter(call => call.startsWith('image inspect ')).length, 9);
    assert.equal(calls.filter(call => call.includes(' up --pull never --no-build ')).length, 2);
    assert.equal(calls.some(call => /\s(pull|build)\s/.test(call)), false);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('rechaza un .env heredado antes de llamar a Docker y sin revelar credenciales', () => {
  const f = fixture();
  try {
    writeFileSync(path.join(f.root, 'api.env'), [
      'APP_ENV=production', 'DB_TARGET=aiven', 'DB_HOST=external.example.invalid',
      'DB_PASSWORD=private-test-secret', '',
    ].join('\n'));
    const result = f.run('install');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /variables de conexion MySQL heredadas/);
    assert.doesNotMatch(result.stderr, /private-test-secret|external\.example\.invalid/);
    assert.equal(existsSync(path.join(f.root, 'docker-calls.txt')), false);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

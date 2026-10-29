import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const bash = process.env.BASH_TEST_BINARY ?? (process.platform === 'win32'
  ? 'C:/Program Files/Git/bin/bash.exe' : 'bash');
const images = ['mysql:test', 'api:test', 'web:test', 'tools:test', 'keycloak:test'];
const inventory = images.map(image => `${image} sha256:fixture release-test\n`).join('');

function run(action, manifest, { corrupt = false, changed = false } = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), 'itecsa-offline-test-'));
  try {
    mkdirSync(path.join(directory, 'bin'));
    mkdirSync(path.join(directory, 'pack'));
    writeFileSync(path.join(directory, 'offline.sh'), readFileSync(new URL('./offline-images.sh', import.meta.url)));
    writeFileSync(path.join(directory, 'images.env'), ['MYSQL_IMAGE', 'API_IMAGE', 'WEB_IMAGE', 'DB_TOOLS_IMAGE', 'KEYCLOAK_IMAGE']
      .map((key, index) => `${key}=${images[index]}\n`).join(''));
    writeFileSync(path.join(directory, 'pack/itecsa-images.tar'), 'fixture archive');
    const checksum = createHash('sha256').update(corrupt ? 'other archive' : 'fixture archive').digest('hex');
    writeFileSync(path.join(directory, 'pack/itecsa-images.sha256'), `${checksum}  itecsa-images.tar\n`);
    writeFileSync(path.join(directory, 'pack/itecsa-images.txt'), manifest);
    // No Docker daemon or real image is used by this regression test.
    writeFileSync(path.join(directory, 'bin/docker'), `#!/usr/bin/env bash
if [[ "$1 $2" == "image load" ]]; then exit 0; fi
[[ "$1 $2" == "image inspect" ]] || exit 90
if [[ "$4" == '{{.Id}}' ]]; then echo '${changed ? 'sha256:changed' : 'sha256:fixture'}'; else echo release-test; fi
`, { mode: 0o755 });
    return spawnSync(bash, ['-c', 'export PATH="$PWD/bin:$PATH"; bash ./offline.sh "$1" ./images.env ./pack', '--', action],
      { cwd: directory, encoding: 'utf8' });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

for (const action of ['verify', 'load']) {
  test(`${action} accepts exactly the configured five images`, () => {
    const result = run(action, inventory);
    assert.equal(result.status, 0, result.error?.message ?? result.stderr);
  });
  for (const [name, manifest, options] of [
    ['empty inventory', ''],
    ['missing image', inventory.split('\n').slice(0, 4).join('\n') + '\n'],
    ['duplicate image', inventory.replace('keycloak:test', 'mysql:test')],
    ['unconfigured image', inventory.replace('keycloak:test', 'other:test')],
    ['changed identity', inventory, { changed: true }],
    ['invalid checksum', inventory, { corrupt: true }],
  ]) {
    test(`${action} rejects ${name}`, () => {
      const result = run(action, manifest, options);
      assert.equal(result.error, undefined);
      assert.notEqual(result.status, 0, result.stdout);
    });
  }
}

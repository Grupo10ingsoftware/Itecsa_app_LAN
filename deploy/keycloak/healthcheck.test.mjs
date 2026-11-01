import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('el healthcheck de Keycloak envia una peticion HTTP con CRLF reales', () => {
  const compose = readFileSync(new URL('../../compose.mysql.yaml', import.meta.url), 'utf8');
  const line = compose.split('\n').find(value => value.includes('GET /health/ready HTTP/1.1'));
  assert.ok(line);
  const [, encoded] = line.match(/test:\s*(\[.*\])$/) ?? [];
  assert.ok(encoded);
  const [command, shell, option, script] = JSON.parse(encoded);
  assert.deepEqual([command, shell, option], ['CMD', 'bash', '-ec']);
  const [, format] = script.match(/printf '([^']+)' >&3/) ?? [];
  assert.ok(format);
  const result = spawnSync('bash', ['-c', 'printf "$1"', '--', format]);
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0);
  assert.deepEqual(result.stdout, Buffer.from(
    'GET /health/ready HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n',
  ));
});

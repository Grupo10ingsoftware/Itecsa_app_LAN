import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { readEnvironment } from './environment.mjs';
import { validateFirstUser } from '../../shared/deploymentValidation.mjs';

test('env parser accepts CRLF, quoted dollars and spaces, but rejects ambiguous lines without printing values', t => {
  const root = fs.mkdtempSync(path.join(tmpdir(), 'itecsa-env-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'test.env');
  fs.writeFileSync(file, "# comment\r\nA='literal$with#symbols'\r\nB=\"two words\"\r\nC=with#hash\r\n");
  assert.deepEqual(readEnvironment(file), { A: 'literal$with#symbols', B: 'two words', C: 'with#hash' });
  for (const value of ['A=private\nA=other', 'A="private', 'private broken line']) {
    fs.writeFileSync(file, value);
    assert.throws(() => readEnvironment(file), error => !error.message.includes('private'));
  }
});
test('first-user rejects a long password that still violates the realm policy', () => {
  const env = { FIRST_USER_USERNAME: 'soporte', FIRST_USER_EMAIL: 'test@example.invalid', FIRST_USER_FIRST_NAME: 'Nombre', FIRST_USER_LAST_NAME: 'Apellido',
    FIRST_USER_RUT: '12.345.678-5', FIRST_USER_TEMP_PASSWORD: 'a'.repeat(30) };
  assert.throws(() => validateFirstUser(env), /FIRST_USER_TEMP_PASSWORD/);
  validateFirstUser({ ...env, FIRST_USER_TEMP_PASSWORD: 'Temporary-Password-123!' });
});

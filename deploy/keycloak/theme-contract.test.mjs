import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile, readdir, rm, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { prepareTheme } from '../../scripts/prepare-keycloak-theme.mjs';
import { buildRealm } from './render-realm.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const source = path.join(root, 'deploy/keycloak/themes/itecsa');
const read = file => readFile(file, 'utf8');
const catalog = text => new Map(text.split(/\r?\n/).filter(line => line && !line.startsWith('#'))
  .map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
async function temporary(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'itecsa-theme-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
async function filesIn(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory()
    ? filesIn(path.join(directory, entry.name), prefix + entry.name + '/')
    : prefix + entry.name))).flat().sort();
}

test('packaged Spanish and disabled-i18n fallback cover every custom static key and policy variant', async t => {
  const output = path.join(await temporary(t), 'itecsa');
  await prepareTheme({ version: '26.8.1', output });
  const spanish = catalog(await read(path.join(output, 'login/messages/messages_es.properties')));
  const fallback = catalog(await read(path.join(output, 'login/messages/messages_en.properties')));
  assert.deepEqual(fallback, spanish);
  // Source-directory installations must resolve the same labels as the image.
  const sourceFallback = catalog(await read(path.join(source, 'login/messages/messages_en.properties')));
  assert.deepEqual(sourceFallback, spanish);
  const keys = new Set();
  for (const name of (await readdir(path.join(source, 'login'))).filter(name => name.endsWith('.ftl'))) {
    const template = await read(path.join(source, 'login', name));
    for (const match of template.matchAll(/msg\(["'](itecsa\.[\w.-]+)["']/g)) {
      if (!match[1].endsWith('.')) keys.add(match[1]);
    }
  }
  for (const rule of ['length', 'maxLength', 'upperCase', 'lowerCase', 'digits', 'specialChars']) {
    for (const suffix of ['One', 'Many']) keys.add('itecsa.rule.' + rule + suffix);
  }
  for (const field of ['username', 'password', 'password-new', 'password-confirm']) keys.add('itecsa.required.' + field);
  assert.ok(keys.size >= 24, 'static messages, dynamic fields and all twelve policy variants are exercised');
  for (const key of keys) {
    for (const messages of [spanish, fallback]) {
      assert.ok(messages.get(key)?.trim(), `missing translation: ${key}`);
      assert.ok(!messages.get(key).startsWith('itecsa.'), `unresolved message: ${key}`);
    }
  }
  assert.equal(fallback.get('itecsa.rule.lengthMany').replace('{0}', '8'), 'Mínimo 8 caracteres');
  assert.equal(fallback.get('itecsa.rule.upperCaseOne'), 'Al menos una letra mayúscula');
  assert.equal(fallback.get('notMatchPasswordMessage'), 'Las contraseñas no coinciden');
  for (const messages of [spanish, fallback, sourceFallback]) {
    assert.equal(messages.get('doLogIn'), 'Iniciar sesión');
    assert.equal(messages.get('updatePasswordTitle'), 'Actualizar contraseña');
    assert.equal(messages.get('passwordNew'), 'Nueva contraseña');
    assert.equal(messages.get('passwordConfirm'), 'Confirmar contraseña');
    assert.equal(messages.get('itecsa.requirementsTitle'), 'La contraseña debe cumplir con:');
  }
});

test('manifest identifies every deployed file and is deterministic across packaging runs', async t => {
  const directory = await temporary(t);
  const output = path.join(directory, 'itecsa');
  await prepareTheme({ version: '26.8.1', output });
  const manifestText = await read(path.join(output, 'itecsa-build.json'));
  const manifest = JSON.parse(manifestText);
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.keycloakVersion, '26.8.1');
  assert.equal(manifest.defaultLocale, 'es');
  assert.equal(manifest.fallbackLocale, 'en');
  assert.deepEqual(Object.keys(manifest.files).sort(), (await filesIn(output)).filter(file => file !== 'itecsa-build.json'));
  for (const [file, expected] of Object.entries(manifest.files)) {
    assert.equal(createHash('sha256').update(await readFile(path.join(output, file))).digest('hex'), expected, file);
  }
  assert.equal(await read(path.join(output, 'login/resources/css/loading.css')),
    await read(path.join(root, 'shared/loading/indicator.css')));
  await prepareTheme({ version: '26.8.1', output });
  assert.equal(await read(path.join(output, 'itecsa-build.json')), manifestText);
});

test('repackaging removes a previous optional font and stale files', async t => {
  const directory = await temporary(t);
  const output = path.join(directory, 'itecsa');
  const font = path.join(directory, 'test.woff2');
  await writeFile(font, 'synthetic font bytes for packaging only');
  await prepareTheme({ version: '26.8.1', output, font });
  assert.match(await read(path.join(output, 'login/theme.properties')), /itecsaFont=true/);
  await writeFile(path.join(output, 'obsolete.ftl'), 'stale');
  await prepareTheme({ version: '26.8.1', output });
  await assert.rejects(access(path.join(output, 'login/resources/fonts/Inter.woff2')), { code: 'ENOENT' });
  await assert.rejects(access(path.join(output, 'obsolete.ftl')), { code: 'ENOENT' });
  assert.doesNotMatch(await read(path.join(output, 'login/theme.properties')), /itecsaFont=true/);
});

test('template loads each declared stylesheet, including the shared action indicator', async () => {
  const properties = catalog(await read(path.join(source, 'login/theme.properties')));
  const template = await read(path.join(source, 'login/template.ftl'));
  assert.match(template, /<#list properties\.styles\?split\(' '\) as style>/);
  assert.match(template, /href="\$\{url\.resourcesPath\}\/\$\{style\}"/);
  assert.deepEqual(properties.get('styles').split(' '), ['css/itecsa.css', 'css/loading.css']);
  for (const style of properties.get('styles').split(' ')) await access(path.join(source, 'login/resources', style));
});

test('PIN recovery inherits the ITECSA theme selected by its separate OIDC client', async () => {
  const pinSource = path.join(root, 'deploy/keycloak/themes/itecsa-pin-recovery/login');
  const properties = catalog(await read(path.join(pinSource, 'theme.properties')));
  assert.equal(properties.get('parent'), 'itecsa', 'inheriting keycloak directly restores the gray/blue stock login');
  assert.equal(properties.get('itecsaLoginTitle'), 'loginAccountTitle');
  const parent = catalog(await read(path.join(source, 'login/theme.properties')));
  const effective = new Map([...parent, ...properties]);
  assert.equal(effective.get('styles'), 'css/itecsa.css css/loading.css');
  assert.equal(effective.get('itecsaLogo'), 'img/itecsa-logo.avif');
  const login = await read(path.join(source, 'login/login.ftl'));
  assert.match(login, /msg\(properties\.itecsaLoginTitle!"doLogIn"\)/);
  const realm = buildRealm({ origin: 'https://itecsa.example.test', adminClientSecret: 'fixture-'.repeat(5) });
  const client = realm.clients.find(value => value.clientId === 'itecsa-pin-recovery');
  assert.equal(client.attributes.login_theme, 'itecsa-pin-recovery');
  const dockerfile = await read(path.join(root, 'deploy/keycloak/Dockerfile'));
  assert.match(dockerfile, /COPY --from=theme \/prepared\/itecsa \/opt\/keycloak\/themes\/itecsa/);
  assert.match(dockerfile, /COPY deploy\/keycloak\/themes\/itecsa-pin-recovery \/opt\/keycloak\/themes\/itecsa-pin-recovery/);
});

test('PIN recovery keeps its own Spanish instructions in both supported message bundles', async () => {
  const messages = path.join(root, 'deploy/keycloak/themes/itecsa-pin-recovery/login/messages');
  const spanish = catalog(await read(path.join(messages, 'messages_es.properties')));
  const fallback = catalog(await read(path.join(messages, 'messages_en.properties')));
  assert.deepEqual(fallback, spanish);
  assert.equal(spanish.get('loginAccountTitle'), 'Ingresa tus credenciales para recuperar tu PIN');
  assert.equal(spanish.get('doLogIn'), 'Confirmar identidad');
  assert.equal(spanish.get('reauthenticate'), 'Confirma tu contraseña para recuperar tu PIN.');
});

test('unsupported versions or unsafe output paths fail before modifying the source', async t => {
  const output = path.join(await temporary(t), 'itecsa');
  await assert.rejects(prepareTheme({ version: '26.0.0', output }), /26.8.1/);
  await assert.rejects(prepareTheme({ version: '26.8.1', output: source }), /directorio de salida/);
  await assert.rejects(prepareTheme({ version: '26.8.1', output: path.join(source, 'generated') }), /directorio de salida/);
  await assert.rejects(prepareTheme({ version: '26.8.1', output: root }), /directorio de salida/);
});

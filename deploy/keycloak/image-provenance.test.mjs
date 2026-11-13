import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, writeFile, mkdtemp, mkdir, rm, cp } from 'node:fs/promises';
import { cpSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { configuredImages, imageFacts, verifyOfflineInventory, compareImages, verifyThemeDirectory,
  verifyActiveImages, verifyHttp, runProvenance, verifyMysqlBase } from './image-provenance.mjs';
import { prepareTheme } from '../../scripts/prepare-keycloak-theme.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const bases = JSON.parse(await readFile(path.join(root, 'deploy/image-bases.json')));
const sha = value => createHash('sha256').update(value).digest('hex');
const id = number => 'sha256:' + String(number).repeat(64);
const env = { APP_VERSION: 'fixture-release', MYSQL_IMAGE: 'mysql:fixture', API_IMAGE: 'api:fixture',
  WEB_IMAGE: 'web:fixture', DB_TOOLS_IMAGE: 'tools:fixture', KEYCLOAK_IMAGE: 'keycloak:fixture',
  COMPOSE_PROJECT_NAME: 'itecsa-fixture', PUBLIC_ORIGIN: 'https://itecsa.example.test' };
const images = configuredImages(env).map((image, index) => imageFacts(image, {
  id: id(index + 1), revision: image.service === 'mysql' ? null : env.APP_VERSION,
  repoDigests: [], platform: 'linux/amd64', buildBase: bases.node,
  runtimeBase: image.service === 'web' ? bases.nginx : image.service === 'keycloak' ? bases.keycloak : bases.node,
}, bases, env.APP_VERSION));
async function temporary(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'itecsa-provenance-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('every application Dockerfile pins and records its expected runtime and build bases', async () => {
  for (const [file, runtime] of [['capaServidor/Dockerfile', 'node'], ['capaVista/Dockerfile', 'nginx'], ['deploy/keycloak/Dockerfile', 'keycloak']]) {
    const text = await readFile(path.join(root, file), 'utf8');
    assert.ok(text.includes('ARG NODE_BASE=' + bases.node));
    if (runtime !== 'node') assert.ok(text.includes('ARG ' + runtime.toUpperCase() + '_BASE=' + bases[runtime]));
    assert.doesNotMatch(text, /^FROM (node:|nginxinc\/|quay\.io\/)/m, 'FROM must consume the immutable base declaration');
    assert.ok(text.includes('io.itecsa.base.runtime=$' + runtime.toUpperCase() + '_BASE'));
    assert.ok(text.includes('io.itecsa.base.build=$NODE_BASE'));
  }
});

test('the original offline inventory is reused and a wrong ID, revision, duplicate or missing row fails', () => {
  const text = images.map(image => `${image.reference} ${image.id} ${image.revision}`).join('\n');
  verifyOfflineInventory(text, images);
  for (const invalid of [text.replace(images[1].id, id(9)), text.replace('fixture-release', 'other'),
    text + '\n' + text.split('\n')[0], text.split('\n').slice(1).join('\n')]) {
    assert.throws(() => verifyOfflineInventory(invalid, images), /inventario offline/);
  }
});

test('the immutable ID detects a different image even when its tag and revision are unchanged', () => {
  const actual = structuredClone(images);
  actual[1].id = id(9);
  assert.throws(() => compareImages(images, actual), /imagen discordante: api/);
  actual[1] = { ...images[1], reference: 'registry.example/api:release', repoDigests: [] };
  compareImages(images, actual); // Safe retagging and docker load preserve image content.
});

test('unknown bases and claimed revisions are rejected when recording a delivery', () => {
  const image = { service: 'api', reference: 'api:fixture' };
  const facts = { id: id(1), revision: env.APP_VERSION, runtimeBase: bases.node, buildBase: bases.node };
  assert.throws(() => imageFacts(image, { ...facts, revision: 'old' }, bases, env.APP_VERSION), /revision discordante/);
  assert.throws(() => imageFacts(image, { ...facts, runtimeBase: 'node:22' }, bases, env.APP_VERSION), /bases discordantes/);
  assert.throws(() => imageFacts(image, { ...facts, buildBase: null }, bases, env.APP_VERSION), /bases discordantes/);
});

test('a MySQL receipt proves the pinned base using its registry digest or a locally resolved immutable ID', () => {
  const mysql = images.find(image => image.service === 'mysql');
  verifyMysqlBase({ ...mysql, repoDigests: [bases.mysql] }, bases.mysql, () => {
    assert.fail('a matching registry digest needs no additional Docker lookup');
  });
  const calls = [];
  verifyMysqlBase(mysql, bases.mysql, args => { calls.push(args); return mysql.id; });
  assert.deepEqual(calls, [['image', 'inspect', '--format', '{{.Id}}', bases.mysql]]);
  assert.throws(() => verifyMysqlBase({ ...mysql, repoDigests: ['mysql@' + id(9)] }, bases.mysql,
    () => id(9)), /MySQL no corresponde/);
  assert.throws(() => verifyMysqlBase(mysql, bases.mysql, () => { throw Error('local image absent'); }),
    /no se pudo demostrar la base MySQL/);
});

test('record rejects an unrelated cached MySQL tag before extracting resources or writing a receipt', async t => {
  const directory = await temporary(t);
  const calls = [];
  const run = args => {
    calls.push(args);
    assert.equal(args[0], 'image', 'record must reject the base before creating inspection containers');
    if (args.at(-1) === bases.mysql) return id(9);
    return JSON.stringify(images.find(image => image.reference === args.at(-1)));
  };
  const output = path.join(directory, 'rejected-release.json');
  await assert.rejects(runProvenance({ action: 'record', env, output }, { docker: run }), /MySQL no corresponde/);
  await assert.rejects(readFile(output), { code: 'ENOENT' });
  assert.equal(calls.length, images.length + 1);
});

test('theme verification detects modified CSS even if its embedded manifest was also modified', async t => {
  const directory = await temporary(t);
  const expected = path.join(directory, 'expected');
  const actual = path.join(directory, 'actual');
  await prepareTheme({ version: '26.8.1', output: expected });
  await cp(expected, actual, { recursive: true });
  const result = await verifyThemeDirectory(actual, expected);
  assert.ok(result.requiredResources.includes('css/loading.css'));
  assert.ok(result.requiredResources.includes('js/itecsa.js'));
  await writeFile(path.join(actual, 'login/resources/css/loading.css'), 'body { color: red }');
  await assert.rejects(verifyThemeDirectory(actual, expected), /manifiesto del tema/);
  const manifestFile = path.join(actual, 'itecsa-build.json');
  const manifest = JSON.parse(await readFile(manifestFile));
  manifest.files['login/resources/css/loading.css'] = sha('body { color: red }');
  await writeFile(manifestFile, JSON.stringify(manifest));
  await assert.rejects(verifyThemeDirectory(actual, expected), /tema esperado/);
});

test('active containers are compared by image ID, not Config.Image tags or labels', () => {
  const run = args => args[0] === 'ps' ? 'fixture-container' : id(9);
  assert.throws(() => verifyActiveImages({ images }, env.COMPOSE_PROJECT_NAME, run), /contenedor de otra entrega/);
  assert.throws(() => verifyActiveImages({ images }, env.COMPOSE_PROJECT_NAME, () => ''), /contenedor activo/);
});

function httpFixture({ missingCss = false, wrongCss = false, wrongWeb = false, redirect = false,
  pinStockTheme = false, pinMissingCss = false, pinWrongCss = false } = {}) {
  const css = '.itecsa-loading__ring { width: 1rem; height: 1rem }';
  const js = 'export const theme = true;';
  const index = '<html><script src="/assets/app.js"></script></html>';
  const themePaths = ['css/loading.css', 'js/itecsa.js'];
  const manifest = { resources: { web: { 'index.html': sha(index), 'assets/app.js': sha(js) },
    theme: { requiredResources: themePaths,
      files: { 'login/resources/css/loading.css': sha(css), 'login/resources/js/itecsa.js': sha(js) } } } };
  const requests = [];
  const clients = [];
  const fetch = async (input, options) => {
    const url = new URL(input);
    requests.push(url.pathname);
    assert.equal(options.redirect, 'error');
    assert.equal(url.origin, env.PUBLIC_ORIGIN);
    if (url.pathname.endsWith('/auth')) {
      assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
      assert.equal(options.method ?? 'GET', 'GET');
      const client = url.searchParams.get('client_id');
      clients.push(client);
      const pin = client === 'itecsa-pin-recovery';
      assert.equal(url.searchParams.get('redirect_uri'), env.PUBLIC_ORIGIN + (pin ? '/auth/pin-recovery/callback' : '/'));
      if (redirect) return new Response(null, { status: 302 });
      const theme = pin ? (pinStockTheme ? 'keycloak' : 'itecsa-pin-recovery') : 'itecsa';
      return new Response('<form id="kc-form-login" action="/login" method="post"></form>'
        + (missingCss || (pin && pinMissingCss) ? '' : '<link rel="stylesheet" href="/resources/cache/login/' + theme + '/css/loading.css">')
        + '<script src="/resources/cache/login/' + theme + '/js/itecsa.js"></script>');
    }
    if (url.pathname === '/index.html') return new Response(index);
    if (url.pathname === '/assets/app.js') return new Response(wrongWeb ? index : js);
    if (url.pathname.endsWith('loading.css')) return new Response(wrongCss || (pinWrongCss && url.pathname.includes('/itecsa-pin-recovery/')) ? index : css);
    if (url.pathname.endsWith('itecsa.js')) return new Response(js);
    return new Response('', { status: 404 });
  };
  return { manifest, fetch, requests, clients };
}

test('HTTP check validates public bundles and the CSS/module linked by the native login without signing in', async () => {
  const fixture = httpFixture();
  assert.deepEqual(await verifyHttp(fixture.manifest, env.PUBLIC_ORIGIN, fixture.fetch), { webResources: 2, themeResources: 4 });
  assert.equal(fixture.requests.length, 8);
  assert.deepEqual(fixture.clients, ['itecsa-web', 'itecsa-pin-recovery']);
});
for (const [options, message] of [
  [{ missingCss: true }, /recurso no enlazado/], [{ wrongCss: true }, /contenido HTTP discordante: tema/],
  [{ wrongWeb: true }, /contenido HTTP discordante: web/], [{ redirect: true }, /HTTP 302/],
  [{ pinStockTheme: true }, /recurso no enlazado por login itecsa-pin-recovery/],
  [{ pinMissingCss: true }, /recurso no enlazado por login itecsa-pin-recovery/],
  [{ pinWrongCss: true }, /contenido HTTP discordante: tema.*itecsa-pin-recovery/],
]) {
  test(`HTTP negative check: ${JSON.stringify(options)}`, async () => {
    const fixture = httpFixture(options);
    await assert.rejects(verifyHttp(fixture.manifest, env.PUBLIC_ORIGIN, fixture.fetch), message);
  });
}

test('HTTP checks reject external resource URLs and non-HTTPS origins', async () => {
  const fixture = httpFixture();
  await assert.rejects(verifyHttp(fixture.manifest, 'http://itecsa.example.test', fixture.fetch), /HTTPS invalido/);
  const fetch = async (url, options) => {
    const response = await fixture.fetch(url, options);
    if (!new URL(url).pathname.endsWith('/auth')) return response;
    return new Response((await response.text()).replace('/resources/cache/login/itecsa/css/loading.css', 'https://elsewhere.example/resources/cache/login/itecsa/css/loading.css'));
  };
  await assert.rejects(verifyHttp(fixture.manifest, env.PUBLIC_ORIGIN, fetch), /fuera del origen/);
});

test('record and verify use extracted resources; an existing receipt is never silently overwritten', async t => {
  const directory = await temporary(t);
  const theme = path.join(directory, 'image-theme');
  const web = path.join(directory, 'image-web');
  await prepareTheme({ version: '26.8.1', output: theme });
  await mkdir(path.join(web, 'assets'), { recursive: true });
  await writeFile(path.join(web, 'index.html'), '<html>bundle fixture</html>');
  await writeFile(path.join(web, 'assets/app.js'), 'const fixture = 1;');
  await writeFile(path.join(web, 'version.json'), JSON.stringify({ version: env.APP_VERSION }));
  const calls = [];
  let loadedOffline = false;
  const run = args => {
    calls.push(args);
    if (args[0] === 'image') {
      const image = images.find(image => image.reference === args.at(-1));
      assert.ok(image, 'offline verification must not require the original registry digest alias');
      return JSON.stringify(image.service === 'mysql' && !loadedOffline
        ? { ...image, repoDigests: [bases.mysql] } : image);
    }
    if (args[0] === 'create') return args.at(-1).replace('sha256:', '');
    if (args[0] === 'rm') return '';
    if (args[0] === 'cp') {
      const source = args[1].split(':').slice(1).join(':');
      cpSync(source === '/opt/keycloak/themes/itecsa' ? theme : source === '/usr/share/nginx/html' ? web
        : path.join(root, 'shared/loading/indicator.css'), args[2], { recursive: true });
      return '';
    }
    throw Error('Unexpected Docker command');
  };
  const output = path.join(directory, 'release.json');
  assert.deepEqual(await runProvenance({ action: 'record', env, output }, { docker: run }), { images: 5, recorded: true });
  const receipt = await readFile(output, 'utf8');
  assert.ok(!receipt.includes('PASSWORD'));
  await assert.rejects(runProvenance({ action: 'record', env, output }, { docker: run }), { code: 'EEXIST' });
  assert.equal(await readFile(output, 'utf8'), receipt);
  loadedOffline = true; // The recorded ID survives docker load even when its registry metadata does not.
  assert.deepEqual(await runProvenance({ action: 'verify', env, output }, { docker: run }), { images: 5, active: false });
  await writeFile(path.join(web, 'assets/app.js'), 'changed asset with the same version');
  await assert.rejects(runProvenance({ action: 'verify', env, output }, { docker: run }), /web de la entrega/);
  assert.equal(calls.filter(args => args[0] === 'create').length, calls.filter(args => args[0] === 'rm').length);
  assert.ok(calls.every(args => !['run', 'start', 'stop', 'exec'].includes(args[0])), 'inspection never starts image code or changes services');
});

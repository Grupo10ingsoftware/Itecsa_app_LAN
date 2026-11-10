import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { readFile, writeFile, readdir, mkdtemp, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { readEnvironment } from '../mysql/environment.mjs';
import { prepareTheme } from '../../scripts/prepare-keycloak-theme.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const fail = message => { throw Error('IMAGE_PROVENANCE: ' + message); };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = /^sha256:[a-f0-9]{64}$/;
const services = { mysql: 'MYSQL_IMAGE', api: 'API_IMAGE', web: 'WEB_IMAGE', 'database-tools': 'DB_TOOLS_IMAGE', keycloak: 'KEYCLOAK_IMAGE' };
const baseKeys = { api: ['node', 'node'], web: ['nginx', 'node'], 'database-tools': ['node', 'node'], keycloak: ['keycloak', 'node'] };
const readJson = async file => JSON.parse(await readFile(file, 'utf8'));
function docker(args) {
  try { return execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 4 * 1024 * 1024 }).trim(); }
  catch { fail(`fallo Docker en ${args.slice(0, 2).join(' ')}; comprobar daemon, imagenes y permisos`); }
}
export function configuredImages(env) {
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(env.APP_VERSION ?? '')) fail('APP_VERSION invalido');
  return Object.entries(services).map(([service, key]) => {
    const reference = env[key];
    if (!/^[A-Za-z0-9][A-Za-z0-9._:/@-]*$/.test(reference ?? '')) fail(`referencia invalida: ${key}`);
    return { service, reference };
  });
}
export function imageFacts(image, data, bases, version) {
  if (!digest.test(data.id ?? '')) fail(`image ID invalido: ${image.service}`);
  if (image.service !== 'mysql' && data.revision !== version) fail(`revision discordante: ${image.service}`);
  if (baseKeys[image.service]) {
    const [runtime, build] = baseKeys[image.service].map(key => bases[key]);
    if (data.runtimeBase !== runtime || data.buildBase !== build) fail(`bases discordantes o sin registrar: ${image.service}`);
  }
  return { ...image, id: data.id, revision: data.revision || '-', repoDigests: data.repoDigests ?? [],
    platform: data.platform, runtimeBase: image.service === 'mysql' ? bases.mysql : data.runtimeBase,
    ...(image.service === 'mysql' ? {} : { buildBase: data.buildBase }) };
}
const label = key => '{{if index .Config "Labels"}}{{json (index .Config.Labels "' + key + '")}}{{else}}null{{end}}';
const imageFormat = '{"id":{{json .Id}},"revision":' + label('org.opencontainers.image.revision')
  + ',"repoDigests":{{json .RepoDigests}},"platform":"{{.Os}}/{{.Architecture}}","runtimeBase":' + label('io.itecsa.base.runtime')
  + ',"buildBase":' + label('io.itecsa.base.build') + '}';
// Prove the MySQL base before issuing a receipt. A local tag may already point
// at another version; unlike application images, MySQL carries no build label.
// Verification of an existing offline receipt uses its immutable ID instead,
// because docker load can discard RepoDigests and the original digest alias.
export function verifyMysqlBase(image, reference, run = docker) {
  const expectedDigest = reference.slice(reference.lastIndexOf('@') + 1);
  if (!digest.test(expectedDigest)) fail('base MySQL fijada invalida');
  if (image.repoDigests.some(value => value.slice(value.lastIndexOf('@') + 1) === expectedDigest)) return;
  let resolvedId;
  try { resolvedId = run(['image', 'inspect', '--format', '{{.Id}}', reference]); }
  catch { fail('no se pudo demostrar la base MySQL; cargar la referencia fijada antes de registrar'); }
  if (resolvedId !== image.id) fail('la imagen MySQL no corresponde a la base fijada');
}
export async function inspectImages(env, run = docker) {
  const bases = await readJson(path.join(root, 'deploy/image-bases.json'));
  const images = configuredImages(env).map(image => imageFacts(image,
    JSON.parse(run(['image', 'inspect', '--format', imageFormat, image.reference])), bases, env.APP_VERSION));
  return { bases, images };
}
// Reuse the existing offline inventory, whose IDs and revisions are already
// checked by offline-images.sh. It remains the transport contract for docker load.
export function verifyOfflineInventory(text, images) {
  const rows = text.trim().split(/\r?\n/).map(line => line.trim().split(/\s+/));
  if (rows.length !== images.length || new Set(rows.map(row => row[0])).size !== images.length) fail('inventario offline incompleto o duplicado');
  for (const [reference, id, revision, extra] of rows) {
    const image = images.find(item => item.reference === reference);
    if (extra || !image || image.id !== id || image.revision !== revision) fail('inventario offline discordante');
  }
}
export function compareImages(expected, actual) {
  if (!Array.isArray(expected) || expected.length !== actual.length
      || new Set(expected.map(image => image.service)).size !== actual.length) fail('entrega con inventario incompleto o duplicado');
  for (const image of actual) {
    const recorded = expected.find(value => value.service === image.service);
    if (!recorded || ['id', 'revision', 'runtimeBase', 'buildBase', 'platform']
      .some(key => recorded[key] !== image[key])) fail(`imagen discordante: ${image.service}`);
    // docker load can omit RepoDigests. The immutable image ID is the primary
    // comparison; keep the registry digests as provenance, never invent one.
  }
}
async function fileHashes(directory, prefix = '') {
  const result = {};
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const relative = prefix + entry.name;
    const filename = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) fail('recurso simbolico inesperado');
    if (entry.isDirectory()) Object.assign(result, await fileHashes(filename, relative + '/'));
    else if (entry.isFile()) result[relative] = sha256(await readFile(filename));
  }
  return result;
}
export function compareFiles(expected, actual, label) {
  const keys = Object.keys(expected).sort();
  if (JSON.stringify(keys) !== JSON.stringify(Object.keys(actual).sort())
    || keys.some(key => expected[key] !== actual[key])) fail(`recursos discordantes: ${label}`);
}
export async function verifyThemeDirectory(directory, expectedDirectory) {
  const manifest = await readJson(path.join(directory, 'itecsa-build.json'));
  if (manifest.schemaVersion !== 1 || manifest.theme !== 'itecsa' || manifest.keycloakVersion !== '26.8.1'
    || manifest.defaultLocale !== 'es' || manifest.fallbackLocale !== 'en') fail('contrato de tema incompatible');
  const actual = await fileHashes(directory);
  const withoutManifest = { ...actual };
  delete withoutManifest['itecsa-build.json'];
  compareFiles(manifest.files, withoutManifest, 'manifiesto del tema');
  compareFiles(await fileHashes(expectedDirectory), actual, 'tema esperado para esta revision');
  const properties = Object.fromEntries((await readFile(path.join(directory, 'login/theme.properties'), 'utf8'))
    .split(/\r?\n/).filter(line => line.includes('=')).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
  const template = await readFile(path.join(directory, 'login/template.ftl'), 'utf8');
  const literals = [...template.matchAll(/\$\{url\.resourcesPath\}\/([^"$]+)/g)].map(match => match[1]);
  const requiredResources = [...new Set([...properties.styles.split(/\s+/), properties.itecsaLogo, ...literals])]
    .filter(resource => manifest.files['login/resources/' + resource]).sort();
  return { files: actual, requiredResources };
}
async function copyImagePaths(image, copies, run) {
  const container = run(['create', '--network', 'none', '--entrypoint', '/bin/true', image.id]);
  if (!/^[a-f0-9]{12,64}$/.test(container)) fail('identificador del contenedor de inspeccion invalido');
  try {
    for (const [source, destination] of copies) run(['cp', container + ':' + source, destination]);
  } finally { run(['rm', '-v', container]); }
}
export async function captureResources(images, run = docker) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'itecsa-provenance-'));
  try {
    const expected = path.join(temporary, 'expected-theme');
    await prepareTheme({ version: '26.8.1', output: expected });
    await copyImagePaths(images.find(image => image.service === 'keycloak'), [['/opt/keycloak/themes/itecsa', path.join(temporary, 'theme')]], run);
    await copyImagePaths(images.find(image => image.service === 'web'), [
      ['/usr/share/nginx/html', path.join(temporary, 'web')], ['/usr/share/itecsa/loading.css', path.join(temporary, 'web-loading.css')],
    ], run);
    const theme = await verifyThemeDirectory(path.join(temporary, 'theme'), expected);
    const sharedLoadingSha256 = sha256(await readFile(path.join(root, 'shared/loading/indicator.css')));
    if (sha256(await readFile(path.join(temporary, 'web-loading.css'))) !== sharedLoadingSha256
      || theme.files['login/resources/css/loading.css'] !== sharedLoadingSha256) fail('CSS compartido discordante');
    const web = await fileHashes(path.join(temporary, 'web'));
    delete web['runtime-config.js']; // Generated per installation, intentionally not a release artifact.
    if (!web['index.html'] || !web['version.json'] || !Object.keys(web).some(file => /^assets\/.+\.js$/.test(file))) fail('bundle web incompleto');
    const webVersion = await readJson(path.join(temporary, 'web/version.json'));
    if (webVersion.version !== images.find(image => image.service === 'web').revision) fail('version.json discordante');
    return { theme, web, sharedLoadingSha256 };
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
export function verifyActiveImages(manifest, project, run = docker) {
  if (!/^[a-z0-9][a-z0-9_-]{2,62}$/.test(project ?? '')) fail('COMPOSE_PROJECT_NAME invalido');
  for (const service of ['mysql', 'api', 'web', 'keycloak']) {
    const ids = run(['ps', '--filter', 'label=com.docker.compose.project=' + project,
      '--filter', 'label=com.docker.compose.service=' + service, '--format', '{{.ID}}']).split(/\s+/).filter(Boolean);
    if (ids.length !== 1) fail(`se requiere un contenedor activo: ${service}`);
    const actual = run(['inspect', '--format', '{{.Image}}', ids[0]]);
    if (actual !== manifest.images.find(image => image.service === service)?.id) fail(`contenedor de otra entrega: ${service}`);
  }
}
const decodeAttribute = value => value.replace(/&amp;/g, '&');
export async function verifyHttp(manifest, origin, fetcher = fetch) {
  const base = new URL(origin);
  if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash) fail('origen HTTPS invalido');
  async function get(url) {
    if (new URL(url).origin !== base.origin) fail('recurso fuera del origen');
    const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!response.ok) fail(`HTTP ${response.status} en recurso publico`);
    return Buffer.from(await response.arrayBuffer());
  }
  // Complete static bundle checks also catch a proxy returning index.html with
  // HTTP 200 for a missing CSS or JavaScript asset.
  for (const [file, expected] of Object.entries(manifest.resources.web)) {
    if (!/^[A-Za-z0-9_./-]+$/.test(file) || file.split('/').includes('..')) fail('ruta de recurso invalida');
    if (sha256(await get(new URL('/' + file, base))) !== expected) fail(`contenido HTTP discordante: web/${file}`);
  }
  const auth = new URL('/realms/itecsa/protocol/openid-connect/auth', base);
  auth.search = new URLSearchParams({ client_id: 'itecsa-web', redirect_uri: base.origin + '/', response_type: 'code',
    scope: 'openid', prompt: 'login', state: randomBytes(16).toString('hex'), nonce: randomBytes(16).toString('hex'),
    code_challenge: randomBytes(32).toString('base64url'), code_challenge_method: 'S256' });
  const html = (await get(auth)).toString('utf8');
  if (!/<form\b[^>]*\bid=["']kc-form-login["'][^>]*\bmethod=["']post["']/i.test(html)) fail('login nativo ausente');
  const resources = [...html.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)].map(match => new URL(decodeAttribute(match[1]), base));
  for (const resource of manifest.resources.theme.requiredResources) {
    const matches = resources.filter(url => url.pathname.endsWith('/login/itecsa/' + resource));
    if (!matches.length) fail(`recurso no enlazado por login: ${resource}`);
    const expected = manifest.resources.theme.files['login/resources/' + resource];
    if (sha256(await get(matches[0])) !== expected) fail(`contenido HTTP discordante: tema/${resource}`);
  }
  return { webResources: Object.keys(manifest.resources.web).length, themeResources: manifest.resources.theme.requiredResources.length };
}
export async function runProvenance({ action, env, output, inventory, active = false, http = false }, dependencies = {}) {
  const run = dependencies.docker ?? docker;
  const current = await inspectImages(env, run);
  if (inventory) verifyOfflineInventory(await readFile(inventory, 'utf8'), current.images);
  if (action === 'record') {
    verifyMysqlBase(current.images.find(image => image.service === 'mysql'), current.bases.mysql, run);
    const resources = await captureResources(current.images, run);
    const manifest = { schemaVersion: 1, appVersion: env.APP_VERSION, ...current, resources };
    await mkdir(path.dirname(output), { recursive: true });
    // A release receipt must not silently change after a mutable tag is replaced.
    await writeFile(output, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    return { images: current.images.length, recorded: true };
  }
  if (action !== 'verify') fail('accion invalida');
  const manifest = await readJson(output);
  if (manifest.schemaVersion !== 1 || manifest.appVersion !== env.APP_VERSION
    || JSON.stringify(manifest.bases) !== JSON.stringify(current.bases)) fail('entrega de otra revision o bases');
  compareImages(manifest.images, current.images);
  const resources = await captureResources(current.images, run);
  compareFiles(manifest.resources.theme.files, resources.theme.files, 'tema de la entrega');
  compareFiles(manifest.resources.web, resources.web, 'web de la entrega');
  if (manifest.resources.sharedLoadingSha256 !== resources.sharedLoadingSha256
    || JSON.stringify(manifest.resources.theme.requiredResources) !== JSON.stringify(resources.theme.requiredResources)) fail('contrato de recursos discordante');
  if (active) verifyActiveImages(manifest, env.COMPOSE_PROJECT_NAME, run);
  const httpResult = http ? await verifyHttp(manifest, env.PUBLIC_ORIGIN, dependencies.fetch ?? fetch) : {};
  return { images: current.images.length, active, ...httpResult };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { values, positionals } = parseArgs({ allowPositionals: true, options: {
      'env-file': { type: 'string', default: path.join(root, 'deploy/mysql.env') },
      output: { type: 'string', default: path.join(root, 'data/offline/itecsa-release.json') },
      inventory: { type: 'string' }, active: { type: 'boolean' }, http: { type: 'boolean' },
    } });
    const env = readEnvironment(values['env-file']);
    console.log('IMAGE_PROVENANCE: ' + JSON.stringify(await runProvenance({ action: positionals[0], env,
      output: path.resolve(values.output), inventory: values.inventory, active: values.active, http: values.http })));
  } catch (error) {
    console.error(error.message?.startsWith('IMAGE_PROVENANCE:') ? error.message
      : `IMAGE_PROVENANCE: no se pudo completar (${error.code ?? 'datos invalidos'}); conservar la entrega anterior`);
    process.exitCode = 1;
  }
}

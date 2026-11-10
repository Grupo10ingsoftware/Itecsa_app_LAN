import { cp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseArgs } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
export const KEYCLOAK_THEME_VERSION = '26.8.1';

// The Docker image and an externally installed theme use this exact artifact.
// Native Spanish messages come from the pinned parent theme. The custom catalog
// is also installed as English, Keycloak's fallback when i18n is disabled.
export async function prepareTheme({ version, output = path.join(root, 'dist/keycloak-26.8.1/itecsa'), font } = {}) {
  if (version !== KEYCLOAK_THEME_VERSION) throw Error('El tema requiere Keycloak 26.8.1.');
  const source = path.join(root, 'deploy/keycloak/themes/itecsa');
  output = path.resolve(output);
  if (source === output || output.startsWith(source + path.sep) || source.startsWith(output + path.sep) || output === path.parse(output).root) {
    throw Error('El directorio de salida debe ser exclusivo para el tema generado.');
  }
  if (font && path.extname(font).toLowerCase() !== '.woff2') throw Error('La fuente local debe ser Inter en formato WOFF2.');
  // Avoid retaining an old optional font, deleted template or message catalog.
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  await cp(source, output, { recursive: true });
  const messages = await readFile(path.join(source, 'login/messages/messages_es.properties'), 'utf8');
  await writeFile(path.join(output, 'login/messages/messages_en.properties'), messages);
  await cp(path.join(root, 'shared/loading/indicator.css'), path.join(output, 'login/resources/css/loading.css'));
  if (font) {
    await mkdir(path.join(output, 'login/resources/fonts'), { recursive: true });
    await cp(font, path.join(output, 'login/resources/fonts/Inter.woff2'));
    await writeFile(path.join(output, 'login/resources/css/font.css'), '@font-face { font-family: Inter; src: url("../fonts/Inter.woff2") format("woff2"); font-display: swap; font-weight: 100 900; }\n');
    const propertiesFile = path.join(output, 'login/theme.properties');
    await writeFile(propertiesFile, `${await readFile(propertiesFile, 'utf8')}\nitecsaFont=true\n`);
  }
  const files = {};
  async function digest(directory, prefix = '') {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const relative = prefix + entry.name;
      if (entry.isDirectory()) await digest(path.join(directory, entry.name), relative + '/');
      else files[relative] = createHash('sha256').update(await readFile(path.join(directory, entry.name))).digest('hex');
    }
  }
  await digest(output);
  const manifest = {
    schemaVersion: 1, keycloakVersion: version, theme: 'itecsa',
    defaultLocale: 'es', fallbackLocale: 'en',
    font: font ? 'local Inter WOFF2' : 'system font stack, same as SPA',
    files,
  };
  await writeFile(path.join(output, 'itecsa-build.json'), JSON.stringify(manifest, null, 2) + '\n');
  return output;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: {
    version: { type: 'string' }, output: { type: 'string' }, font: { type: 'string' },
  } });
  console.log(`Tema preparado: ${await prepareTheme(values)}`);
}

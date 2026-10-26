import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseArgs } from 'node:util';

// Packaging only. No credentials, network, realm mutations or server restart.
const { values } = parseArgs({ options: {
  version: { type: 'string' }, 'messages-es': { type: 'string' }, font: { type: 'string' },
} });
if (values.version !== '26.8.1' || !values['messages-es']) {
  throw Error('Uso: node scripts/prepare-keycloak-theme.mjs --version 26.8.1 --messages-es <messages_es.properties nativo de 26.8.1> [--font <Inter.woff2>]');
}
const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(root, 'deploy/keycloak/themes/itecsa');
const output = path.join(root, 'dist/keycloak-26.8.1/itecsa');
const nativeMessages = await readFile(values['messages-es'], 'utf8');
if (!nativeMessages.includes('invalidUserMessage=') || !nativeMessages.includes('emailSentMessage=')) {
  throw Error('El archivo debe ser el bundle español nativo de login de Keycloak 26.8.1.');
}
await mkdir(output, { recursive: true });
await cp(source, output, { recursive: true });
const customMessages = await readFile(path.join(source, 'login/messages/messages_es.properties'), 'utf8');
const messages = `${nativeMessages}\n# ITECSA overrides\n${customMessages}\n`;
// Spanish also when the realm's internationalization is disabled (default locale en).
await writeFile(path.join(output, 'login/messages/messages_es.properties'), messages);
await writeFile(path.join(output, 'login/messages/messages_en.properties'), messages);
if (values.font) {
  if (path.extname(values.font).toLowerCase() !== '.woff2') throw Error('La fuente local debe ser Inter en formato WOFF2.');
  await mkdir(path.join(output, 'login/resources/fonts'), { recursive: true });
  await cp(values.font, path.join(output, 'login/resources/fonts/Inter.woff2'));
  await writeFile(path.join(output, 'login/resources/css/font.css'), '@font-face { font-family: Inter; src: url("../fonts/Inter.woff2") format("woff2"); font-display: swap; font-weight: 100 900; }\n');
  const propertiesFile = path.join(output, 'login/theme.properties');
  await writeFile(propertiesFile, `${await readFile(propertiesFile, 'utf8')}\nitecsaFont=true\n`);
}
await writeFile(path.join(output, 'itecsa-build.json'), JSON.stringify({ keycloakVersion: values.version, theme: 'itecsa', font: values.font ? 'local Inter WOFF2' : 'system font stack, same as SPA' }, null, 2));
console.log(`Tema preparado: ${output}`);

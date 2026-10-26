import { parseArgs } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { readOperatorPassword } from './keycloak-ubuntu-configure.mjs';

const { values } = parseArgs({ options: {
  action: { type: 'string', default: 'inspect' }, 'base-url': { type: 'string' },
  realm: { type: 'string', default: 'itecsa' }, username: { type: 'string', default: 'admin' },
  'client-id': { type: 'string', default: 'itecsa-web' },
  snapshot: { type: 'string' },
} });
if (!['inspect', 'apply', 'restore'].includes(values.action) || !values['base-url']) throw Error('Indicar --action inspect|apply|restore --base-url <URL de Keycloak> [--realm itecsa] [--snapshot <archivo>]');
const base = new URL(values['base-url']);
if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw Error('URL Keycloak no válida.');
const endpoint = suffix => base.href.replace(/\/$/, '') + suffix;
let auth;
let password = await readOperatorPassword();
const tokenResponse = await fetch(endpoint('/realms/master/protocol/openid-connect/token'), {
  method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
  body: new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli', username: values.username, password }),
});
password = undefined;
if (!tokenResponse.ok) throw Error(`Autenticación administrativa HTTP ${tokenResponse.status}.`);
auth = await tokenResponse.json();
const request = async (suffix, method = 'GET', body) => {
  const response = await fetch(endpoint(suffix), { method, redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { authorization: 'Bearer ' + auth.access_token, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw Error(`${method} administrativo HTTP ${response.status}; no se reintentan escrituras.`);
  return response.status === 204 ? undefined : response.json();
};
const realmPath = '/admin/realms/' + encodeURIComponent(values.realm);
try {
  const [server, realm, clients] = await Promise.all([
    request('/admin/serverinfo'), request(realmPath), request(realmPath + '/clients?clientId=' + encodeURIComponent(values['client-id'])),
  ]);
  if (server.systemInfo?.version !== '26.8.1' || !realm.id || typeof realm.enabled !== 'boolean') throw Error('Se requiere versión 26.8.1 y representación administrativa completa del realm.');
  const settings = { realm: realm.realm, keycloakVersion: server.systemInfo.version, loginTheme: realm.loginTheme ?? null,
    clientLoginTheme: clients[0]?.attributes?.login_theme ?? null, passwordPolicy: realm.passwordPolicy ?? '',
    resetPasswordAllowed: realm.resetPasswordAllowed, smtpConfigured: Boolean(realm.smtpServer?.host),
    internationalizationEnabled: realm.internationalizationEnabled, defaultLocale: realm.defaultLocale ?? null };
  console.log(JSON.stringify(settings, null, 2));
  if (values.action === 'apply') {
    if (!server.themes?.login?.some(theme => theme.name === 'itecsa')) throw Error('El tema debe estar instalado antes de activarlo.');
    if (settings.clientLoginTheme) throw Error('Existe un tema específico del cliente; revisar antes de cambiar el realm.');
    const snapshot = values.snapshot || fileURLToPath(new URL('../dist/keycloak-26.8.1/realm-before.json', import.meta.url));
    await mkdir(new URL('../dist/keycloak-26.8.1/', import.meta.url), { recursive: true });
    await writeFile(snapshot, JSON.stringify({ realm: realm.realm, baseUrl: base.href, loginTheme: realm.loginTheme ?? null }, null, 2), { flag: 'wx' });
    await request(realmPath, 'PUT', { loginTheme: 'itecsa' });
    const verified = await request(realmPath);
    if (verified.loginTheme !== 'itecsa' || verified.passwordPolicy !== realm.passwordPolicy) throw Error('No se confirmó el cambio mínimo de tema. Revisar el snapshot.');
    console.log('Tema activado. Política y usuarios sin cambios. Reversión: ' + snapshot);
  } else if (values.action === 'restore') {
    if (!values.snapshot) throw Error('Indicar --snapshot para restaurar el tema anterior.');
    const snapshot = JSON.parse(await readFile(values.snapshot, 'utf8'));
    if (snapshot.realm !== realm.realm || snapshot.baseUrl !== base.href || (snapshot.loginTheme !== null && typeof snapshot.loginTheme !== 'string')) throw Error('Snapshot de otro entorno o inválido.');
    await request(realmPath, 'PUT', { loginTheme: snapshot.loginTheme });
    if (((await request(realmPath)).loginTheme ?? null) !== snapshot.loginTheme) throw Error('No se confirmó la restauración del tema.');
    console.log('Tema anterior restaurado.');
  }
} finally {
  if (auth?.refresh_token) await fetch(endpoint('/realms/master/protocol/openid-connect/logout'), {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
    body: new URLSearchParams({ client_id: 'admin-cli', refresh_token: auth.refresh_token }),
  }).catch(() => {});
  auth = undefined;
}

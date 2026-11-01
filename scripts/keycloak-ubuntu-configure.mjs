import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildUbuntuContract } from './keycloak-ubuntu-contract.mjs';

// Updates the team's existing clients. No import, DB copy, new users or password resets.
// Authentication stays in memory; the service secret goes directly into the existing .env.
const contract = buildUbuntuContract(), base = 'http://127.0.0.1:18080';
const root = new URL('../', import.meta.url);
const bindings = [
  ['4a32aa57-6639-4a32-aa61-8eb6f5c45008', 'Soporte'],
  ['ae9d71cb-77f1-4c8f-989c-a606be9e7742', 'Administrador Produccion'],
  ['852ea39b-009a-4ece-919f-2d73d6c068e0', 'Operario Produccion'],
]; // Explicit UUID links verified in the existing Usuario.id_keycloak column.
const initialUsers = new Set(bindings.map(([id]) => id));
const labNames = new Set([...Array.from({ length: 9 }, (_, i) => `p065-role-${i}`),
  ...Array.from({ length: 6 }, (_, i) => `p065-prepared-ordinary-${i}`), 'p065-prepared-visible']);
let auth, expires = 0;

export function readOperatorPassword(label = 'Keycloak admin password: ') {
  assert.ok(process.stdin.isTTY, 'Use an interactive terminal');
  process.stdout.write(label);
  process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding('utf8');
  return new Promise((resolve, reject) => {
    let value = '';
    const read = chunk => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          process.stdin.off('data', read); process.stdin.setRawMode(false); process.stdin.pause();
          process.stdout.write('\n'); resolve(value); return;
        }
        if (ch === '\u0003') { process.stdin.setRawMode(false); reject(Error('Cancelled')); return; }
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1); else value += ch;
      }
    };
    process.stdin.on('data', read);
  });
}
async function token(data) {
  const response = await fetch(base + '/realms/master/protocol/openid-connect/token', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000), body: new URLSearchParams(data),
  });
  assert.ok(response.ok, `Admin authentication HTTP ${response.status}`);
  auth = await response.json(); expires = Date.now() + (auth.expires_in - 15) * 1000;
}
export async function request(path, method = 'GET', body) {
  if (Date.now() >= expires) await token({ grant_type: 'refresh_token', client_id: 'admin-cli', refresh_token: auth.refresh_token });
  const response = await fetch(base + '/admin/realms/itecsa' + path, {
    method, redirect: 'error', signal: AbortSignal.timeout(20000),
    headers: { Authorization: 'Bearer ' + auth.access_token, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  assert.ok(response.ok, `${method} ${path.split('?')[0]} HTTP ${response.status}; writes are not retried`);
  const raw = await response.text();
  return raw ? JSON.parse(raw) : null;
}
export async function client(name) {
  const found = await request('/clients?clientId=' + encodeURIComponent(name));
  assert.equal(found.length, 1, `Existing client required: ${name}`);
  return request('/clients/' + found[0].id);
}
async function mappings(path, desired) {
  const current = await request(path), ids = new Set(desired.map(role => role.id));
  const excess = current.filter(role => !ids.has(role.id));
  if (excess.length) await request(path, 'DELETE', excess);
  const existing = new Set(current.map(role => role.id));
  const missing = desired.filter(role => !existing.has(role.id));
  if (missing.length) await request(path, 'POST', missing);
}
export function patchEnv(relative, changes) {
  const path = fileURLToPath(new URL(relative, root));
  let content = readFileSync(path, 'utf8');
  for (const [key, value] of Object.entries(changes)) {
    assert.ok(!/[\r\n]/.test(value));
    const line = key + '=' + JSON.stringify(value), pattern = new RegExp('^' + key + '=.*$', 'm');
    content = pattern.test(content) ? content.replace(pattern, () => line) : content.replace(/\s*$/, '\n') + line + '\n';
  }
  writeFileSync(path, content, { mode: 0o600 });
}

export async function startAdmin() {
  await token({ grant_type: 'password', client_id: 'admin-cli', username: 'admin', password: await readOperatorPassword() });
}
export async function closeAdmin() {
  if (auth?.refresh_token) await fetch(base + '/realms/master/protocol/openid-connect/logout', {
    method: 'POST', signal: AbortSignal.timeout(10000),
    body: new URLSearchParams({ client_id: 'admin-cli', refresh_token: auth.refresh_token }),
  }).catch(() => {});
}
async function main() {
  assert.deepEqual(process.argv.slice(2), ['--apply']);
  await startAdmin();
  const [spa, service, rolesClient, capabilitiesClient, management] = await Promise.all([
    client(contract.clientId), client(contract.adminClientId), client(contract.roleClientId),
    client(contract.capabilityClientId), client('realm-management'),
  ]);
  const roles = await request(`/clients/${rolesClient.id}/roles?max=1000`);
  const capabilities = await request(`/clients/${capabilitiesClient.id}/roles?max=1000`);
  assert.deepEqual(roles.map(r => r.name).sort(), [...contract.roles].sort());
  assert.deepEqual(capabilities.map(r => r.name).sort(), [...contract.capabilities].sort());
  for (const role of roles) {
    const actual = await request(`/clients/${rolesClient.id}/roles/${encodeURIComponent(role.name)}/composites`);
    assert.deepEqual(actual.map(r => r.name).sort(), [...contract.rolePermissions[role.name]].sort());
    assert.ok(actual.every(r => r.containerId === capabilitiesClient.id));
  }
  const users = await request('/users?max=1000&briefRepresentation=false');
  assert.ok(users.length < 1000);
  for (const id of initialUsers) assert.ok(users.some(user => user.id === id));
  const labUsers = users.filter(user => labNames.has(user.username));
  assert.ok(labUsers.every(user => !initialUsers.has(user.id)));
  const { protocolMappers, ...settings } = contract.spa;
  await request('/clients/' + spa.id, 'PUT', { ...spa, ...settings,
    attributes: { ...spa.attributes, ...settings.attributes } });
  for (const mapper of spa.protocolMappers ?? []) {
    if (['permissions', 'resource_access.itecsa-api-v1.roles'].includes(mapper.config?.['claim.name'])
      || ['itecsa-api-audience', ...protocolMappers.map(m => m.name)].includes(mapper.name)) {
      await request(`/clients/${spa.id}/protocol-mappers/models/${mapper.id}`, 'DELETE');
    }
  }
  for (const mapper of protocolMappers) await request(`/clients/${spa.id}/protocol-mappers/models`, 'POST', mapper);
  const scopes = await request('/client-scopes');
  for (const type of ['default', 'optional']) {
    const current = await request(`/clients/${spa.id}/${type}-client-scopes`);
    for (const scope of current) if (!(type === 'default' && scope.name === 'basic')) {
      await request(`/clients/${spa.id}/${type}-client-scopes/${scope.id}`, 'DELETE');
    }
  }
  const basic = scopes.find(scope => scope.name === 'basic'); assert.ok(basic);
  await request(`/clients/${spa.id}/default-client-scopes/${basic.id}`, 'PUT');
  await mappings(`/clients/${spa.id}/scope-mappings/clients/${rolesClient.id}`, roles);
  await mappings(`/clients/${spa.id}/scope-mappings/clients/${capabilitiesClient.id}`, capabilities);

  await request('/clients/' + service.id, 'PUT', { ...service, enabled: true, publicClient: false,
    bearerOnly: false, serviceAccountsEnabled: true, standardFlowEnabled: false,
    directAccessGrantsEnabled: false, implicitFlowEnabled: false, fullScopeAllowed: false });
  const serviceUser = await request(`/clients/${service.id}/service-account-user`);
  const adminRoles = await request(`/clients/${management.id}/roles?max=1000`);
  const allowed = adminRoles.filter(role => contract.administrativeRoles.includes(role.name));
  assert.equal(allowed.length, 4);
  await mappings(`/users/${serviceUser.id}/role-mappings/clients/${management.id}`, allowed);
  await mappings(`/clients/${service.id}/scope-mappings/clients/${management.id}`, allowed);
  for (const path of [`/users/${serviceUser.id}/role-mappings`, `/clients/${service.id}/scope-mappings`]) {
    const grants = await request(path);
    if (grants.realmMappings?.length) await request(path + '/realm', 'DELETE', grants.realmMappings);
    for (const mapping of Object.values(grants.clientMappings ?? {})) {
      if (mapping.id !== management.id) await request(path + '/clients/' + mapping.id, 'DELETE', mapping.mappings);
    }
  }
  for (const type of ['default', 'optional']) {
    const current = await request(`/clients/${service.id}/${type}-client-scopes`);
    for (const scope of current) if (!(type === 'default' && scope.name === 'roles')) {
      await request(`/clients/${service.id}/${type}-client-scopes/${scope.id}`, 'DELETE');
    }
  }
  const roleScope = scopes.find(scope => scope.name === 'roles'); assert.ok(roleScope);
  await request(`/clients/${service.id}/default-client-scopes/${roleScope.id}`, 'PUT');
  const profile = await request('/users/profile');
  assert.ok(profile.attributes.some(a => a.name === contract.marker.name), 'Existing preparation marker required');
  for (const [id, role] of bindings) await mappings(`/users/${id}/role-mappings/clients/${rolesClient.id}`, roles.filter(r => r.name === role));
  const secret = await request(`/clients/${service.id}/client-secret`);
  assert.ok(typeof secret.value === 'string' && secret.value.length >= 16);
  patchEnv('capaServidor/.env', { AUTH_PROVIDER: 'keycloak', KEYCLOAK_ALLOW_HTTP: 'true',
    KEYCLOAK_ISSUER: contract.issuer, KEYCLOAK_AUDIENCE: contract.audience,
    KEYCLOAK_CLIENT_ID: contract.clientId, KEYCLOAK_ROLE_CLIENT_ID: contract.roleClientId,
    KEYCLOAK_JWKS_URI: contract.issuer + '/protocol/openid-connect/certs',
    KEYCLOAK_ADMIN_TRANSPORT_ORIGIN: new URL(contract.issuer).origin,
    KEYCLOAK_ADMIN_CLIENT_ID: contract.adminClientId, KEYCLOAK_ADMIN_CLIENT_SECRET: secret.value,
    IDENTITY_PREPARATION_ENABLED: 'true', FRONTEND_ORIGIN: contract.origin });
  patchEnv('capaVista/.env', { VITE_AUTH_PROVIDER: 'keycloak', VITE_KEYCLOAK_URL: base,
    VITE_KEYCLOAK_REALM: contract.realm, VITE_KEYCLOAK_CLIENT_ID: contract.clientId,
    VITE_KEYCLOAK_AUDIENCE: contract.audience, VITE_API_BASE_URL: 'http://127.0.0.1:3000/api',
    VITE_IDENTITY_PREPARATION: 'true' });
  console.log('Existing SPA, administrative client and .env configured.');
  for (const user of labUsers) await request('/users/' + user.id, 'DELETE');
  for (const name of ['itecsa-web-integration-065', 'itecsa-integration-065-admin']) {
    const found = await request('/clients?clientId=' + encodeURIComponent(name));
    if (!found.length) continue;
    assert.equal(found.length, 1);
    const lab = await request('/clients/' + found[0].id);
    assert.equal(lab.attributes?.['itecsa.integration.owner'], 'itecsa-phase065');
    await request('/clients/' + lab.id, 'DELETE');
  }
  const remaining = await request('/users?max=1000&briefRepresentation=false');
  for (const id of initialUsers) {
    const before = users.find(u => u.id === id), after = remaining.find(u => u.id === id);
    assert.ok(after && before.enabled === after.enabled && before.username === after.username);
  }
  assert.ok(!remaining.some(u => labNames.has(u.username)));
  console.log(`Removed ${labUsers.length} synthetic users and both laboratory clients; original users preserved.`);
  console.log('Development URL: ' + contract.origin);
}
async function applyDeveloperUsers() {
  await startAdmin();
  const [spa, roleClient, capabilityClient] = await Promise.all([
    client(contract.clientId), client(contract.roleClientId), client(contract.capabilityClientId),
  ]);
  const capabilities = await request(`/clients/${capabilityClient.id}/roles?max=1000`);
  const temporaryRead = capabilities.find(role=>role.name==='read:users');
  if(temporaryRead)assert.equal(temporaryRead.description,'Consulta de usuarios sin administracion de cuentas', 'Refuse to remove an unowned role');
  assert.deepEqual(capabilities.filter(role=>role.name!=='read:users').map(role=>role.name).sort(),[...contract.capabilities].sort());
  const before={};
  for(const role of contract.roles) {
    before[role]=await request(`/clients/${roleClient.id}/roles/${encodeURIComponent(role)}/composites`);
    assert.ok(before[role].every(value=>value.containerId===capabilityClient.id));
    assert.deepEqual(before[role].filter(value=>role!=='Desarrollador'||!['read:users','manage:users'].includes(value.name)).map(value=>value.name).sort(),
      contract.rolePermissions[role].filter(value=>role!=='Desarrollador'||value!=='manage:users').sort());
  }
  const developerPath=`/clients/${roleClient.id}/roles/Desarrollador/composites`;
  const scopePath=`/clients/${spa.id}/scope-mappings/clients/${capabilityClient.id}`;
  if(temporaryRead) {
    if(before.Desarrollador.some(role=>role.id===temporaryRead.id))await request(developerPath,'DELETE',[temporaryRead]);
    if((await request(scopePath)).some(role=>role.id===temporaryRead.id))await request(scopePath,'DELETE',[temporaryRead]);
    await request(`/clients/${capabilityClient.id}/roles/${encodeURIComponent(temporaryRead.name)}`,'DELETE');
  }
  const manage=capabilities.find(role=>role.name==='manage:users');assert.ok(manage);
  if(!before.Desarrollador.some(role=>role.id===manage.id))await request(developerPath,'POST',[manage]);
  if(!(await request(scopePath)).some(role=>role.id===manage.id))await request(scopePath,'POST',[manage]);
  for(const role of contract.roles) {
    const actual=await request(`/clients/${roleClient.id}/roles/${encodeURIComponent(role)}/composites`);
    assert.deepEqual(actual.map(value=>value.name).sort(),[...contract.rolePermissions[role]].sort());
  }
  assert.deepEqual((await request(`/clients/${capabilityClient.id}/roles?max=1000`)).map(role=>role.name).sort(),[...contract.capabilities].sort());
  console.log('Desarrollador: 25 capabilities including manage:users. Soporte unchanged: 5. Catalog remains 25; no user or password changes.');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    if(process.argv.slice(2).length===1&&process.argv[2]==='--developer-users')await applyDeveloperUsers();
    else await main();
  }
  catch (error) { console.error('Configuration stopped: ' + error.message); process.exitCode = 1; }
  finally { await closeAdmin(); }
}

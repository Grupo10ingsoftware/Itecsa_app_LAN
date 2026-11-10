import { fileURLToPath } from 'node:url';
import { RECOGNIZED_ROLES, BUSINESS_PERMISSIONS, ROLE_PERMISSIONS } from '../../shared/keycloakAuthorization.js';
import { validateOrigin, managementRoles, usernameMapper, registrationDateMapper } from './render-realm.mjs';

import { inspectThemeLocale, applyThemeLocale } from './theme-contract.mjs';

const fail = message => { throw Error('KEYCLOAK_BOOTSTRAP: ' + message); };
const sameUser = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const equal = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

export async function bootstrap(env = process.env, fetcher = fetch, { readOnly = false } = {}) {
  const origin = validateOrigin(env.PUBLIC_ORIGIN);
  if (!env.KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME ||
      !env.KEYCLOAK_OPERATOR_USERNAME || !env.KEYCLOAK_OPERATOR_PASSWORD ||
      sameUser(env.KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME, env.KEYCLOAK_OPERATOR_USERNAME) ||
      env.KEYCLOAK_OPERATOR_PASSWORD.length < 20) fail('credenciales administrativas incompletas');
  async function getToken(username, password) {
    const response = await fetcher(origin + '/realms/master/protocol/openid-connect/token', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
      body: new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli', username, password }),
    });
    if (!response.ok) return null;
    return (await response.json()).access_token ?? null;
  }
  let token = readOnly || !env.KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD ? null : await getToken(env.KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME, env.KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD);
  let temporaryActive = Boolean(token);
  if (!token) token = await getToken(env.KEYCLOAK_OPERATOR_USERNAME, env.KEYCLOAK_OPERATOR_PASSWORD);
  if (!token) fail('no se pudo autenticar a un administrador');
  const base = origin + '/admin/realms/itecsa';
  async function request(path, method = 'GET', body) {
    const response = await fetcher(base + path, {
      method, redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { authorization: 'Bearer ' + token, accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) fail(`${method} ${path.split('?')[0]}: HTTP ${response.status}`);
    if (response.status === 204) return null;
    const raw = await response.text();
    return raw ? JSON.parse(raw) : null;
  }
  async function client(clientId) {
    const result = await request('/clients?clientId=' + encodeURIComponent(clientId));
    const matches = result.filter(value => value.clientId === clientId);
    if (matches.length !== 1) fail('client ausente: ' + clientId);
    return matches[0].id;
  }
  async function assigned(path) {
    const values = await request(path);
    return Array.isArray(values) ? values : values?.mappings ?? [];
  }
  async function ensureRoles(path, desired) {
    const current = await assigned(path);
    const missing = desired.filter(role => !current.some(existing => existing.id === role.id));
    if (missing.length && readOnly) fail('bootstrap pendiente: faltan roles o scopes; usar manage.sh resume');
    if (missing.length) await request(path, 'POST', missing);
    const actual = await assigned(path);
    if (!equal(actual.map(role => role.name), desired.map(role => role.name))) fail('scope o cuenta con roles inesperados');
  }

  const realm = await request('');
  const requiredActions = await request('/authentication/required-actions');
  const updatePassword = requiredActions.find(action => action.alias === 'UPDATE_PASSWORD');
  if (updatePassword?.providerId !== 'UPDATE_PASSWORD' || updatePassword.enabled !== true) {
    fail('UPDATE_PASSWORD sin proveedor habilitado; requiere reparacion administrativa antes del primer acceso');
  }
  if (realm.realm !== 'itecsa' || realm.sslRequired !== 'all' ||
      realm.registrationAllowed !== false || realm.resetPasswordAllowed !== false ||
      realm.bruteForceProtected !== true || realm.loginTheme !== 'itecsa' ||
      realm.passwordPolicy !== 'length(8) and upperCase(1) and lowerCase(1) and digits(1) and specialChars(1)') {
    fail('politica o seguridad del realm inesperada');
  }
  const localePending = inspectThemeLocale(realm);
  if (localePending && readOnly) fail('idioma del tema pendiente; aplicar manage.sh keycloak-configure');
  const [web, rolesClient, capabilitiesClient, adminClient, managementClient] = await Promise.all([
    client('itecsa-web'), client('itecsa-api-v1'), client('itecsa-api'),
    client('itecsa-backend-admin'), client('realm-management'),
  ]);
  const [webConfig, pinConfig, adminConfig, webMappers, webScopes] = await Promise.all([
    request('/clients/' + web),
    client('itecsa-pin-recovery').then(id => request('/clients/' + id)),
    request('/clients/' + adminClient),
    request('/clients/' + web + '/protocol-mappers/models'),
    request('/clients/' + web + '/default-client-scopes'),
  ]);
  const expectedProfileMappers = [usernameMapper(), registrationDateMapper()];
  const matchesProfileMapper = (value, expected) => value?.protocol === expected.protocol
    && value.protocolMapper === expected.protocolMapper
    && value.consentRequired === false
    && equal(Object.keys(value.config ?? {}), Object.keys(expected.config))
    && Object.entries(expected.config).every(([key, setting]) => value.config[key] === setting);
  for (const expected of expectedProfileMappers) {
    const current = webMappers.filter(value => value.name === expected.name);
    if (current.length > 1 || (current.length === 1 && !matchesProfileMapper(current[0], expected))) {
      fail(`mapper ${expected.name} incompatible; revisar su propiedad, claim y destinos antes de continuar`);
    }
  }
  const missingProfileMappers = expectedProfileMappers.filter(expected => !webMappers.some(value => value.name === expected.name));
  const callback = origin + '/auth/pin-recovery/callback';
  const mapper = name => webMappers.find(value => value.name === name);
  if (!equal(webConfig.redirectUris ?? [], [origin, origin + '/*']) ||
      webConfig.attributes?.['pkce.code.challenge.method'] !== 'S256' ||
      webConfig.publicClient !== true || webConfig.directAccessGrantsEnabled !== false ||
      !webScopes.some(scope => scope.name === 'basic') ||
      !equal(webMappers.map(value => value.name), ['Application roles', 'ITECSA permissions', 'API audience',
        ...expectedProfileMappers.filter(expected => !missingProfileMappers.includes(expected)).map(expected => expected.name)]) ||
      mapper('Application roles')?.config?.['claim.name'] !== 'resource_access.itecsa-api-v1.roles' ||
      mapper('ITECSA permissions')?.config?.['claim.name'] !== 'permissions' ||
      mapper('API audience')?.config?.['included.custom.audience'] !== 'https://api.itecsa.local' ||
      !equal(pinConfig.redirectUris ?? [], [callback]) ||
      pinConfig.attributes?.login_theme !== 'itecsa-pin-recovery' ||
      pinConfig.attributes?.['pkce.code.challenge.method'] !== 'S256' ||
      adminConfig.serviceAccountsEnabled !== true || adminConfig.publicClient !== false) {
    fail('clients, scopes, mappers o callback inesperados');
  }
  if (missingProfileMappers.length && readOnly) {
    fail(`faltan mappers ${missingProfileMappers.map(value => value.name).join(', ')}; aplicar manage.sh keycloak-configure y volver a iniciar sesion`);
  }
  const [roles, capabilities, management] = await Promise.all([
    request('/clients/' + rolesClient + '/roles?max=1000'),
    request('/clients/' + capabilitiesClient + '/roles?max=1000'),
    request('/clients/' + managementClient + '/roles?max=1000'),
  ]);
  if (!equal(roles.map(role => role.name), RECOGNIZED_ROLES) ||
      !equal(capabilities.map(role => role.name), BUSINESS_PERMISSIONS)) fail('catalogo de roles incompleto');
  for (const role of roles) {
    const actual = await request('/clients/' + rolesClient + '/roles/' + encodeURIComponent(role.name) + '/composites');
    if (!equal(actual.map(value => value.name), ROLE_PERMISSIONS[role.name]) ||
        actual.some(value => value.containerId !== capabilitiesClient)) fail('composicion invalida: ' + role.name);
  }
  const allowed = management.filter(role => managementRoles.includes(role.name));
  if (allowed.length !== managementRoles.length) fail('permisos de administracion incompletos');
  if (localePending) Object.assign(realm, await applyThemeLocale(request));
  const confirmedMapperNames = webMappers.map(value => value.name);
  for (const expected of missingProfileMappers) {
    // Extend the known profile contract without replacing clients, scopes or users.
    await request('/clients/' + web + '/protocol-mappers/models', 'POST', expected);
    confirmedMapperNames.push(expected.name);
    const actual = await request('/clients/' + web + '/protocol-mappers/models');
    if (!equal(actual.map(value => value.name), confirmedMapperNames)
        || expectedProfileMappers.filter(value => confirmedMapperNames.includes(value.name))
          .some(value => !matchesProfileMapper(actual.find(mapper => mapper.name === value.name), value))) {
      fail(`no se pudo verificar el mapper ${expected.name} aplicado`);
    }
  }
  await ensureRoles('/clients/' + web + '/scope-mappings/clients/' + rolesClient, roles);
  await ensureRoles('/clients/' + web + '/scope-mappings/clients/' + capabilitiesClient, capabilities);
  const service = await request('/clients/' + adminClient + '/service-account-user');
  if (!service?.id) fail('cuenta tecnica ausente');
  await ensureRoles('/users/' + service.id + '/role-mappings/clients/' + managementClient, allowed);
  await ensureRoles('/clients/' + adminClient + '/scope-mappings/clients/' + managementClient, allowed);

  const profile = await request('/users/profile');
  const marker = { name: 'itecsa_provision_id', multivalued: false,
    permissions: { view: ['admin'], edit: ['admin'] }, validations: { length: { max: 36 } } };
  const currentMarker = profile.attributes?.find(attribute => attribute.name === marker.name);
  if (!currentMarker) {
    if (readOnly) fail('bootstrap pendiente: falta atributo tecnico');
    await request('/users/profile', 'PUT', { ...profile, attributes: [...profile.attributes, marker] });
  } else if (!equal(currentMarker.permissions?.view ?? [], ['admin']) ||
      !equal(currentMarker.permissions?.edit ?? [], ['admin']) ||
      Number(currentMarker.validations?.length?.max) !== 36) {
    fail('atributo tecnico incompatible');
  }
  if (realm.attributes?.itecsaBootstrapVersion && realm.attributes.itecsaBootstrapVersion !== '1') fail('version de bootstrap incompatible');
  if (!realm.attributes?.itecsaBootstrapVersion) {
    if (readOnly) fail('bootstrap pendiente: falta marca de configuracion');
    await request('', 'PUT', { ...realm, attributes: { ...realm.attributes, itecsaBootstrapVersion: '1' } });
  }
  async function master(path, method = 'GET', body) {
    const response = await fetcher(origin + '/admin/realms/master' + path, {
      method, redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { authorization: 'Bearer ' + token, accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) fail('administrador permanente: HTTP ' + response.status);
    if (response.status === 204) return null;
    const raw = await response.text();
    return raw ? JSON.parse(raw) : null;
  }
  const operatorName = encodeURIComponent(env.KEYCLOAK_OPERATOR_USERNAME);
  let operators = await master('/users?username=' + operatorName + '&exact=true');
  operators = operators.filter(user => sameUser(user.username, env.KEYCLOAK_OPERATOR_USERNAME));
  if (operators.length > 1) fail('administrador permanente ambiguo');
  if (!operators.length) {
    if (!temporaryActive) fail('administrador permanente ausente');
    await master('/users', 'POST', { username: env.KEYCLOAK_OPERATOR_USERNAME, enabled: true,
      credentials: [{ type: 'password', value: env.KEYCLOAK_OPERATOR_PASSWORD, temporary: false }] });
    operators = (await master('/users?username=' + operatorName + '&exact=true'))
      .filter(user => sameUser(user.username, env.KEYCLOAK_OPERATOR_USERNAME));
    if (operators.length !== 1) fail('no se creo el administrador permanente');
  }
  // Resume safely if a previous run created the operator but failed before
  // assigning its role. Authenticate it before granting any missing privilege.
  let permanentToken = await getToken(env.KEYCLOAK_OPERATOR_USERNAME, env.KEYCLOAK_OPERATOR_PASSWORD);
  if (!permanentToken) fail('el administrador permanente no puede iniciar sesion');
  const operatorRolesPath = '/users/' + operators[0].id + '/role-mappings/realm';
  const operatorRoles = await master(operatorRolesPath);
  if (!operatorRoles.some(role => role.name === 'admin')) {
    if (!temporaryActive) fail('administrador permanente sin rol admin');
    const adminRole = await master('/roles/admin');
    await master(operatorRolesPath, 'POST', [adminRole]);
    permanentToken = await getToken(env.KEYCLOAK_OPERATOR_USERNAME, env.KEYCLOAK_OPERATOR_PASSWORD);
    if (!permanentToken) fail('el administrador permanente no puede iniciar sesion');
  }
  token = permanentToken;
  await master('/users/' + operators[0].id);
  {
    const temporary = (await master('/users?username=' + encodeURIComponent(env.KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME) + '&exact=true'))
      .filter(user => sameUser(user.username, env.KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME));
    if (temporary.length > 1) fail('administrador temporal ambiguo');
    if (temporary.length && readOnly) fail('bootstrap pendiente: administrador temporal activo');
    if (temporary.length) await master('/users/' + temporary[0].id, 'DELETE');
  }
  console.log('KEYCLOAK_BOOTSTRAP: roles, scopes y cuenta tecnica verificados');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  bootstrap(process.env, fetch, { readOnly: process.argv.includes('--check') }).catch(error => { console.error(error.message); process.exitCode = 1; });
}

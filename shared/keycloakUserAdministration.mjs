import { BUSINESS_ADMIN_ROLES, ROLE_PERMISSIONS, ROLES } from './authorization.js';
import { DELEGATED_QUERY_ROLES } from './keycloakSupportDelegation.mjs';

const equal = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const fail = message => { throw Error('KEYCLOAK_USER_ADMINISTRATION: ' + message); };

// Accept only the previous policy (the three administrators lack manage:users)
// or the current one. Validate every composition before granting any capability.
export async function configureUserAdministration({ request, rolesClient, capabilitiesClient, managementClient,
  roles, capabilities, readOnly = false }) {
  const pending = [];
  for (const role of roles) {
    const path = '/clients/' + rolesClient + '/roles/' + encodeURIComponent(role.name) + '/composites';
    const actual = await request(path);
    const business = actual.filter(value => value.containerId === capabilitiesClient);
    const administrative = actual.filter(value => value.containerId !== capabilitiesClient);
    const desired = ROLE_PERMISSIONS[role.name];
    const previous = BUSINESS_ADMIN_ROLES.includes(role.name) ? desired.filter(value => value !== 'manage:users') : desired;
    if ((!equal(business.map(value => value.name), desired) && !equal(business.map(value => value.name), previous))
      || administrative.some(value => ![...BUSINESS_ADMIN_ROLES, ROLES.SOPORTE].includes(role.name)
        || value.containerId !== managementClient || !DELEGATED_QUERY_ROLES.includes(value.name))) {
      fail('composicion invalida: ' + role.name);
    }
    if (!equal(business.map(value => value.name), desired)) pending.push({ path, role: role.name });
  }
  if (pending.length && readOnly) fail('permisos administrativos pendientes; aplicar manage.sh keycloak-configure y renovar sesion');
  const capability = capabilities.find(value => value.name === 'manage:users');
  if (pending.length && !capability) fail('capacidad manage:users ausente');
  for (const { path, role } of pending) {
    await request(path, 'POST', [capability]);
    const actual = await request(path);
    if (!equal(actual.filter(value => value.containerId === capabilitiesClient).map(value => value.name), ROLE_PERMISSIONS[role])) {
      fail('no se pudo verificar la composicion: ' + role);
    }
  }
}

// Preserve accounts and identity bindings, but prevent new Keycloak logins.
// Fetch all pages before mutations so disabling accounts cannot shift pagination.
export async function disableSupportAccounts({ request, rolesClient, readOnly = false }) {
  const users = [];
  for (let first = 0; ; first += 100) {
    const page = await request('/clients/' + rolesClient + '/roles/' + encodeURIComponent(ROLES.SOPORTE)
      + '/users?first=' + first + '&max=100');
    if (!Array.isArray(page)) fail('listado de Soporte invalido');
    users.push(...page);
    if (page.length < 100) break;
  }
  const enabled = users.filter(user => user.enabled !== false);
  if (enabled.length && readOnly) fail('cuentas Soporte habilitadas; aplicar manage.sh keycloak-configure');
  for (const user of enabled) {
    if (!user.id) fail('cuenta Soporte sin identificador');
    const path = '/users/' + encodeURIComponent(user.id);
    await request(path, 'PUT', { enabled: false });
    await request(path + '/logout', 'POST');
    if ((await request(path)).enabled !== false) fail('no se pudo deshabilitar Soporte');
  }
}

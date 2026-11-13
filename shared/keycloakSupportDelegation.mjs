import { ASSIGNABLE_ROLES, BUSINESS_ADMIN_ROLES, RECOGNIZED_ROLES, ROLES, ROLE_PERMISSIONS } from './keycloakAuthorization.js';

export const DELEGATED_QUERY_ROLES = Object.freeze(['query-users', 'query-clients']);
export const DELEGATED_BUSINESS_ROLES = Object.freeze([...ASSIGNABLE_ROLES, ROLES.GERENCIA]);
const prefix = 'itecsa-support-';
const fail = message => { throw Error('KEYCLOAK_SUPPORT_DELEGATION: ' + message); };
const equal = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

// The authenticated deployment operator owns this configuration. Business users
// receive only role-mapping scopes; they cannot modify these policies or clients.
export async function configureSupportDelegation({ request, readOnly = false, verifyInactive = false }) {
  let realm = await request('');
  const client = async clientId => {
    const matches = (await request('/clients?clientId=' + encodeURIComponent(clientId))).filter(value => value.clientId === clientId);
    if (matches.length !== 1 || !matches[0].id) fail('client ausente o ambiguo: ' + clientId);
    return matches[0].id;
  };
  const [business, management, capabilities] = await Promise.all([
    client('itecsa-api-v1'), client('realm-management'), client('itecsa-api'),
  ]);
  const [roles, adminRoles] = await Promise.all([
    request('/clients/' + business + '/roles?max=1000'), request('/clients/' + management + '/roles?max=1000'),
  ]);
  if (!equal(roles.map(role => role.name), RECOGNIZED_ROLES)) fail('catalogo de roles de negocio incompatible');
  const supportRole = roles.find(role => role.name === ROLES.SOPORTE);

  const queryRoles = adminRoles.filter(role => DELEGATED_QUERY_ROLES.includes(role.name));
  if (queryRoles.length !== DELEGATED_QUERY_ROLES.length || queryRoles.some(role => role.composite !== false)) fail('roles de consulta ausentes');
  const missingQuery = [];
  let supportQuery = [];
  const supportPath = '/clients/' + business + '/roles/' + encodeURIComponent(ROLES.SOPORTE) + '/composites';
  for (const name of [...BUSINESS_ADMIN_ROLES, ROLES.SOPORTE]) {
    const path = '/clients/' + business + '/roles/' + encodeURIComponent(name) + '/composites';
    const composites = await request(path);
    const businessComposites = composites.filter(role => role.containerId === capabilities);
    const adminComposites = composites.filter(role => role.containerId === management);
    if (!equal(businessComposites.map(role => role.name), ROLE_PERMISSIONS[name])
      || adminComposites.some(role => !DELEGATED_QUERY_ROLES.includes(role.name))
      || composites.length !== businessComposites.length + adminComposites.length) fail('composites administrativos incompatibles: ' + name);
    if (name === ROLES.SOPORTE) supportQuery = adminComposites;
    else {
      const missing = queryRoles.filter(role => !adminComposites.some(value => value.id === role.id));
      if (missing.length) missingQuery.push({ path, roles: missing });
    }
  }
  let activateAfterValidation = false;
  if (realm.adminPermissionsEnabled !== true) {
    if (readOnly && !verifyInactive) fail('delegacion pendiente; ejecutar keycloak-configure');
    // Keycloak retains the authorization client when FGAP is disabled. Never
    // reactivate a retained policy graph before validating all its permissions.
    const retained = (await request('/clients?clientId=admin-permissions')).filter(value => value.clientId === 'admin-permissions');
    if (retained.length > 1) fail('client de permisos ambiguo');
    if (retained.length) activateAfterValidation = true;
    else {
      await request('', 'PUT', { adminPermissionsEnabled: true });
      realm = await request('');
      if (realm.adminPermissionsEnabled !== true) fail('FGAP v2 no disponible');
    }
  }
  const authz = '/clients/' + await client('admin-permissions') + '/authz/resource-server';
  const protectedUsers = [];
  for (let first = 0; ; first += 100) {
    const clients = await request('/clients?first=' + first + '&max=100');
    for (const value of clients.filter(value => value.serviceAccountsEnabled)) {
      const service = await request('/clients/' + value.id + '/service-account-user');
      if (!service?.id) fail('cuenta tecnica invalida');
      protectedUsers.push(service.id);
    }
    if (clients.length < 100) break;
  }
  if (!protectedUsers.length) fail('cuenta tecnica administrativa ausente');
  const policies = [
    { name: prefix + 'role', type: 'role', logic: 'POSITIVE', roles: roles.filter(role => BUSINESS_ADMIN_ROLES.includes(role.name)).map(role => ({ id: role.id, required: false })) },
    { name: prefix + 'deny-technical', type: 'role', logic: 'NEGATIVE', roles: roles.filter(role => BUSINESS_ADMIN_ROLES.includes(role.name)).map(role => ({ id: role.id, required: false })) },
  ];
  const allowed = [prefix + 'role'];
  const permissions = [
    { name: prefix + 'protected-users', resourceType: 'Users', scopes: ['map-roles'], resources: protectedUsers, policies: [prefix + 'deny-technical'] },
    { name: prefix + 'business-roles', resourceType: 'Roles', scopes: ['map-role'],
      resources: roles.filter(role => DELEGATED_BUSINESS_ROLES.includes(role.name)).map(role => role.id), policies: allowed },
    { name: prefix + 'business-client', resourceType: 'Clients', scopes: ['view'], resources: [business], policies: allowed },
    { name: prefix + 'users', resourceType: 'Users', scopes: ['view', 'map-roles'], policies: allowed },
  ];
  // Refuse unknown policy graphs instead of silently overwriting customer rules.
  const known = [...policies, ...permissions];
  const existing = await request(authz + '/policy?first=0&max=1000');
  if (existing.length >= 1000 || existing.some(value => !known.some(item => item.name === value.name))) fail('permisos FGAP ajenos al contrato; revisar configuracion');
  const pending = [];
  for (const expected of policies) {
    const found = existing.filter(value => value.name === expected.name);
    if (found.length > 1 || (found[0] && found[0].type !== expected.type)) fail('politica incompatible: ' + expected.name);
    if (!found.length) { pending.push(expected); continue; }
    const current = await request(authz + '/policy/' + expected.type + '/' + found[0].id);
    if (current.logic !== expected.logic || current.decisionStrategy !== 'UNANIMOUS') fail('politica incompatible: ' + expected.name);
    const matches = current.roles?.length === expected.roles.length
      && current.roles.every(role => role.required === false && expected.roles.some(value => value.id === role.id));
    const legacy = current.roles?.length === 1 && current.roles[0].id === supportRole.id && current.roles[0].required === true;
    if (!matches && !legacy) fail('politica incompatible: ' + expected.name);
    if (!matches) pending.push({ ...expected, id: found[0].id });
  }
  for (const expected of permissions) {
    const found = existing.filter(value => value.name === expected.name);
    if (found.length > 1 || (found[0] && found[0].type !== 'scope')) fail('permiso incompatible: ' + expected.name);
    if (!found.length) { pending.push(expected); continue; }
    const id = found[0].id;
    const [current, resources, scopes, associated] = await Promise.all([
      request(authz + '/permission/scope/' + id), request(authz + '/policy/' + id + '/resources'),
      request(authz + '/policy/' + id + '/scopes'), request(authz + '/policy/' + id + '/associatedPolicies'),
    ]);
    if (current.resourceType !== expected.resourceType || current.logic !== 'POSITIVE' || current.decisionStrategy !== 'UNANIMOUS'
      || !equal(scopes.map(value => value.name), expected.scopes) || !equal(associated.map(value => value.name), expected.policies)) fail('permiso incompatible: ' + expected.name);
    const matches = equal(resources.map(value => value.name), expected.resources ?? [expected.resourceType]);
    const legacy = expected.name === prefix + 'business-roles'
      && equal(resources.map(value => value.name), [...expected.resources, supportRole.id]);
    if (!matches && !legacy) fail('permiso incompatible: ' + expected.name);
    if (!matches) pending.push({ ...expected, id });
  }
  const missingSettings = realm.attributes?.itecsaSupportDelegationVersion !== '2' || realm.adminEventsEnabled !== true || realm.adminEventsDetailsEnabled !== false;
  if (realm.attributes?.itecsaSupportDelegationVersion && !['1', '2'].includes(realm.attributes.itecsaSupportDelegationVersion)) fail('version de delegacion incompatible');
  if (readOnly && (pending.length || missingQuery.length || supportQuery.length || missingSettings)) fail('delegacion pendiente; ejecutar keycloak-configure');
  // Suspend the validated legacy graph while replacing both allow and technical
  // denial policies. A partial migration must never expose technical accounts.
  if (pending.some(value => value.id) && realm.adminPermissionsEnabled === true) {
    await request('', 'PUT', { adminPermissionsEnabled: false });
    activateAfterValidation = true;
  }
  // Validate all existing rules before adding privileges. Create the technical
  // denial before the all-users permission and expose console navigation last.
  if (missingSettings) await request('', 'PUT', { attributes: { ...realm.attributes, itecsaSupportDelegationVersion: '2' },
    adminEventsEnabled: true, adminEventsDetailsEnabled: false });
  for (const expected of pending) {
    await request(authz + (expected.type ? '/policy/' + expected.type : '/permission/scope')
      + (expected.id ? '/' + expected.id : ''), expected.id ? 'PUT' : 'POST', {
      ...expected, decisionStrategy: 'UNANIMOUS', logic: expected.logic ?? 'POSITIVE',
    });
  }
  if (supportQuery.length) await request(supportPath, 'DELETE', supportQuery);
  for (const missing of missingQuery) await request(missing.path, 'POST', missing.roles);
  if (activateAfterValidation && !readOnly) {
    // Confirm the entire persisted graph before restoring delegated access.
    await configureSupportDelegation({ request, readOnly: true, verifyInactive: true });
    await request('', 'PUT', { adminPermissionsEnabled: true });
  }
  if (!readOnly) await configureSupportDelegation({ request, readOnly: true });
  return { configured: true };
}

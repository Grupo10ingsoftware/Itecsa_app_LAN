import { createHash, randomUUID } from 'node:crypto';
import { INITIAL_ADMINISTRATORS, validateInitialAdministrators } from '../../../../../shared/deploymentValidation.mjs';

export class InitialAdministratorsError extends Error {
  constructor(code) { super('KEYCLOAK_INITIAL_ADMINS: ' + code); this.code = code; }
}
const fail = code => { throw new InitialAdministratorsError(code); };
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const subjectPath = subject => '/users/' + encodeURIComponent(subject);
const matches = (user, account, operationId) => user?.username === account.username
  && (user.email?.toLowerCase() || null) === account.email && user.firstName === account.firstName && user.lastName === account.lastName
  && user.attributes?.itecsa_provision_id?.length === 1 && user.attributes.itecsa_provision_id[0] === operationId;

function validateReceipt(receipt, issuer) {
  if (!receipt) return;
  if (receipt.schemaVersion !== 1 || receipt.issuer !== issuer || !['pending', 'complete'].includes(receipt.state)
    || !/^[a-f0-9]{64}$/.test(receipt.configurationDigest ?? '') || receipt.accounts?.length !== 3) fail('INVALID_RECEIPT');
  for (const [index, entry] of receipt.accounts.entries()) {
    if (entry.prefix !== INITIAL_ADMINISTRATORS[index].prefix || !uuid(entry.operationId)
      || !['pending', 'prepared', 'complete'].includes(entry.state)
      || (entry.subject !== null && !uuid(entry.subject))
      || (entry.localUserId !== null && (!Number.isSafeInteger(entry.localUserId) || entry.localUserId <= 0))
      || (entry.state !== 'pending' && (!entry.subject || !entry.localUserId))
      || (receipt.state === 'complete' && entry.state !== 'complete')) fail('INVALID_RECEIPT');
  }
  const subjects = receipt.accounts.map(entry => entry.subject).filter(Boolean);
  if (new Set(subjects).size !== subjects.length) fail('INVALID_RECEIPT');
}

async function requireInitialScope(prisma, receipt) {
  const [users, identities] = await Promise.all([
    prisma.usuario.findMany({ select: { id_usuario: true, id_keycloak: true } }),
    prisma.externalIdentity.findMany({ select: { provider: true, issuer: true, subject: true, user_id: true } }),
  ]);
  const subjects = new Set(receipt?.accounts.map(entry => entry.subject).filter(Boolean) ?? []);
  if (users.some(user => !subjects.has(user.id_keycloak)) || identities.some(identity =>
    identity.provider !== 'keycloak' || identity.issuer !== receipt?.issuer || !subjects.has(identity.subject)
    || !users.some(user => user.id_usuario === identity.user_id && user.id_keycloak === identity.subject))) {
    fail('INITIAL_INSTALLATION_REQUIRED');
  }
}

// request is the operator-authenticated Keycloak Admin API for the itecsa realm.
// The durable receipt contains identifiers and a digest, never passwords or PINs.
export async function bootstrapInitialAdministrators({ environment, prisma, request, receiptStore }) {
  let origin;
  try { origin = new URL(environment.PUBLIC_ORIGIN); } catch { fail('INVALID_ORIGIN'); }
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) fail('INVALID_ORIGIN');
  const issuer = origin.origin + '/realms/itecsa';
  let receipt = await receiptStore.read();
  validateReceipt(receipt, issuer);
  // A completed installation never changes roles, passwords or account states.
  // Temporary credentials can be removed from the environment after success.
  if (receipt?.state === 'complete') return { created: 0, existing: 3 };
  const accounts = validateInitialAdministrators(environment);
  const configurationDigest = createHash('sha256').update(JSON.stringify({ issuer, accounts })).digest('hex');
  if (receipt && receipt.configurationDigest !== configurationDigest) fail('RESUME_REQUIRES_ORIGINAL_CONFIGURATION');
  await requireInitialScope(prisma, receipt);
  const clients = await request('/clients?clientId=itecsa-api-v1');
  const matchingClients = clients.filter(client => client.clientId === 'itecsa-api-v1');
  if (matchingClients.length !== 1 || !matchingClients[0].id) fail('ROLE_CLIENT_MISSING');
  const roleClient = encodeURIComponent(matchingClients[0].id);
  const roles = new Map();
  for (const account of accounts) {
    const role = await request('/clients/' + roleClient + '/roles/' + encodeURIComponent(account.role));
    if (role?.name !== account.role || !role.id) fail('ROLE_MISSING');
    roles.set(account.role, role);
  }
  if (!receipt) {
    // Check all usernames and emails before creating the first account. Never
    // adopt an existing user just because its name matches the deployment file.
    for (const account of accounts) {
      for (const [field, value] of [['username', account.username], ['email', account.email]]) {
        if (!value) continue;
        if ((await request('/users?' + field + '=' + encodeURIComponent(value) + '&exact=true')).length) fail('ACCOUNT_ALREADY_EXISTS');
      }
    }
    receipt = { schemaVersion: 1, issuer, configurationDigest, state: 'pending', accounts: accounts.map(account => ({
      prefix: account.prefix, operationId: randomUUID(), subject: null, localUserId: null, state: 'pending',
    })) };
    await receiptStore.write(receipt);
  }
  for (const [index, account] of accounts.entries()) {
    const entry = receipt.accounts[index];
    if (entry.state !== 'pending') continue;
    await requireInitialScope(prisma, receipt);
    const found = await request('/users?username=' + encodeURIComponent(account.username) + '&exact=true');
    if (!Array.isArray(found) || found.length > 1) fail('IDENTITY_CONFLICT');
    let external = found[0];
    if (!external) {
      if (entry.subject) fail('IDENTITY_MISSING');
      // Persist the operation marker before POST. If its response is lost, a
      // retry can prove ownership without issuing another password or account.
      const subject = await request('/users', 'POST', { username: account.username, ...(account.email ? { email: account.email } : {}),
        firstName: account.firstName, lastName: account.lastName, enabled: false, emailVerified: false,
        requiredActions: ['UPDATE_PASSWORD'], attributes: { itecsa_provision_id: [entry.operationId] },
        credentials: [{ type: 'password', value: account.temporaryPassword, temporary: true }] });
      if (!uuid(subject)) fail('INVALID_SUBJECT');
      entry.subject = subject;
      await receiptStore.write(receipt);
      external = await request(subjectPath(subject));
    }
    if (!uuid(external?.id) || !matches(external, account, entry.operationId) || external.enabled !== false
      || !external.requiredActions?.includes('UPDATE_PASSWORD') || (entry.subject && entry.subject !== external.id)) fail('IDENTITY_CONFLICT');
    entry.subject = external.id;
    await receiptStore.write(receipt);
    const mapping = subjectPath(entry.subject) + '/role-mappings/clients/' + roleClient;
    const assigned = await request(mapping + '/composite');
    if (!Array.isArray(assigned) || assigned.length > 1 || (assigned.length && assigned[0].id !== roles.get(account.role).id)) fail('ROLE_CONFLICT');
    if (!assigned.length) await request(mapping, 'POST', [roles.get(account.role)]);
    const verifiedRoles = await request(mapping + '/composite');
    if (verifiedRoles.length !== 1 || verifiedRoles[0].id !== roles.get(account.role).id) fail('ROLE_NOT_CONFIRMED');
    const local = await prisma.$transaction(async tx => {
      await requireInitialScope(tx, receipt);
      const data = { id_keycloak: entry.subject, correo_usuario: account.email, rut_usuario: account.rut,
        nombre_usuario: account.firstName, apellido_usuario: account.lastName, rol_usuario: account.role, estado_usuario: 'Pendiente' };
      let user = await tx.usuario.findUnique({ where: { id_keycloak: entry.subject } });
      if (user && !Object.entries(data).every(([key, value]) => user[key] === value)) fail('LOCAL_IDENTITY_CONFLICT');
      if (!user) user = await tx.usuario.create({ data });
      let binding = await tx.externalIdentity.findUnique({ where: { user_id: user.id_usuario } });
      const identity = { provider: 'keycloak', issuer, subject: entry.subject, username: account.username, user_id: user.id_usuario };
      if (binding && !Object.entries(identity).every(([key, value]) => binding[key] === value)) fail('LOCAL_IDENTITY_CONFLICT');
      if (!binding) binding = await tx.externalIdentity.create({ data: identity });
      return user.id_usuario;
    });
    entry.localUserId = local;
    entry.state = 'prepared';
    await receiptStore.write(receipt);
  }
  // Expose no account until all three roles and local identity bindings exist.
  for (const [index, account] of accounts.entries()) {
    const entry = receipt.accounts[index];
    if (entry.state === 'complete') continue;
    const path = subjectPath(entry.subject);
    const external = await request(path);
    const assigned = await request(path + '/role-mappings/clients/' + roleClient + '/composite');
    // An activation response can be lost after login becomes possible. Preserve
    // any password/profile changes made since then; ownership uses stable keys.
    const ownsActivated = external.enabled === true && external.username === account.username
      && external.attributes?.itecsa_provision_id?.length === 1 && external.attributes.itecsa_provision_id[0] === entry.operationId;
    if ((!ownsActivated && !matches(external, account, entry.operationId)) || assigned.length !== 1
      || assigned[0].id !== roles.get(account.role).id) fail('IDENTITY_CONFLICT');
    const user = await prisma.usuario.findUnique({ where: { id_keycloak: entry.subject } });
    const binding = user ? await prisma.externalIdentity.findUnique({ where: { user_id: user.id_usuario } }) : null;
    if (!user || user.id_usuario !== entry.localUserId || user.rol_usuario !== account.role
      || !['Pendiente', 'Activo', 'Vinculado'].includes(user.estado_usuario)
      || !binding || binding.provider !== 'keycloak' || binding.issuer !== issuer || binding.subject !== entry.subject
      || binding.username !== account.username || binding.user_id !== user.id_usuario) fail('LOCAL_IDENTITY_CONFLICT');
    if (external.enabled !== true) await request(path, 'PUT', { enabled: true });
    if ((await request(path)).enabled !== true) fail('ACTIVATION_NOT_CONFIRMED');
    entry.state = 'complete';
    await receiptStore.write(receipt);
  }
  receipt.state = 'complete';
  await receiptStore.write(receipt);
  return { created: 3, existing: 0 };
}

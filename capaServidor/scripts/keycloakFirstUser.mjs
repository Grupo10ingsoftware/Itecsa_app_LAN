import { randomUUID } from 'node:crypto';
import getPrismaClient, { disconnectPrismaClient } from '../src/database/prisma.js';

const env = process.env;
const fail = message => { throw Error('KEYCLOAK_FIRST_USER: ' + message); };
const origin = new URL(env.PUBLIC_ORIGIN ?? '');
if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash ||
    !env.KEYCLOAK_OPERATOR_USERNAME || !env.KEYCLOAK_OPERATOR_PASSWORD ||
    !env.FIRST_USER_USERNAME || !/^[a-z0-9._-]{3,80}$/.test(env.FIRST_USER_USERNAME) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.FIRST_USER_EMAIL ?? '') ||
    !env.FIRST_USER_FIRST_NAME || !env.FIRST_USER_LAST_NAME ||
    !/^(\d{1,2}\.?\d{3}\.?\d{3}-[\dkK])$/.test(env.FIRST_USER_RUT ?? '') ||
    !env.FIRST_USER_TEMP_PASSWORD || env.FIRST_USER_TEMP_PASSWORD.length < 20) fail('datos iniciales incompletos');
const prisma = getPrismaClient();
let createdId;
let adminToken;
const base = '/admin/realms/itecsa';
async function request(path, token, method = 'GET', body) {
  const response = await fetch(origin.origin + path, {
    method, redirect: 'error', signal: AbortSignal.timeout(10000),
    headers: { authorization: 'Bearer ' + token, accept: 'application/json',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) fail(method + ' ' + path.split('?')[0] + ': HTTP ' + response.status);
  if (method === 'POST' && path.endsWith('/users')) return response.headers.get('location');
  if (response.status === 204) return null;
  const raw = await response.text();
  return raw ? JSON.parse(raw) : null;
}
try {
  const [users, links] = await Promise.all([prisma.usuario.count(), prisma.externalIdentity.count()]);
  if (users || links) fail('el primer usuario solo se admite con tablas de usuarios vacias');
  const tokenResponse = await fetch(origin.origin + '/realms/master/protocol/openid-connect/token', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
    body: new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli',
      username: env.KEYCLOAK_OPERATOR_USERNAME, password: env.KEYCLOAK_OPERATOR_PASSWORD }),
  });
  if (!tokenResponse.ok) fail('administrador permanente no disponible');
  const token = (await tokenResponse.json()).access_token;
  if (!token) fail('token administrativo invalido');
  adminToken = token;
  const existing = await request(base + '/users?username=' + encodeURIComponent(env.FIRST_USER_USERNAME) + '&exact=true', token);
  if (existing.length) fail('usuario inicial ya existe en Keycloak');
  const roleClients = await request(base + '/clients?clientId=itecsa-api-v1', token);
  const roleClient = roleClients.find(value => value.clientId === 'itecsa-api-v1');
  if (!roleClient) fail('client de roles ausente');
  const role = await request(base + '/clients/' + roleClient.id + '/roles/Soporte', token);
  const marker = randomUUID();
  const location = await request(base + '/users', token, 'POST', {
    username: env.FIRST_USER_USERNAME, email: env.FIRST_USER_EMAIL.toLowerCase(),
    firstName: env.FIRST_USER_FIRST_NAME, lastName: env.FIRST_USER_LAST_NAME,
    enabled: true, emailVerified: false, requiredActions: ['UPDATE_PASSWORD'],
    attributes: { itecsa_provision_id: [marker] },
    credentials: [{ type: 'password', value: env.FIRST_USER_TEMP_PASSWORD, temporary: true }],
  });
  createdId = location?.split('/').at(-1);
  if (!/^[0-9a-f-]{36}$/i.test(createdId ?? '')) fail('identificador de usuario inicial invalido');
  await request(base + '/users/' + createdId + '/role-mappings/clients/' + roleClient.id, token, 'POST', [role]);
  await prisma.$transaction(async tx => {
    const count = await tx.usuario.count();
    if (count) fail('usuarios locales creados durante el bootstrap');
    const user = await tx.usuario.create({ data: {
      id_keycloak: createdId, correo_usuario: env.FIRST_USER_EMAIL.toLowerCase(),
      rut_usuario: env.FIRST_USER_RUT.replaceAll('.', '').toUpperCase(),
      nombre_usuario: env.FIRST_USER_FIRST_NAME, apellido_usuario: env.FIRST_USER_LAST_NAME,
      rol_usuario: 'Soporte', estado_usuario: 'Pendiente',
    } });
    await tx.externalIdentity.create({ data: {
      provider: 'keycloak', issuer: origin.origin + '/realms/itecsa',
      subject: createdId, username: env.FIRST_USER_USERNAME, user_id: user.id_usuario,
    } });
  });
  createdId = null;
  console.log('KEYCLOAK_FIRST_USER: Soporte inicial preparado; cambio de contraseña obligatorio');
} catch (error) {
  if (createdId && adminToken) {
    try { await request(base + '/users/' + createdId, adminToken, 'DELETE'); }
    catch { console.error('KEYCLOAK_FIRST_USER: cuenta remota creada; revisar y conciliar antes de reintentar'); }
  }
  throw error;
} finally {
  await disconnectPrismaClient();
}

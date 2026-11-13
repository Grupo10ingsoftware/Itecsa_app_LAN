import { readFile, writeFile, mkdir, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import getPrismaClient, { disconnectPrismaClient } from '../src/database/prisma.js';
import { bootstrapInitialAdministrators, InitialAdministratorsError } from '../src/modules/users/service/initialAdministrators.service.js';

const receiptFile = '/run/mysql-state/initial-administrators.json';

export async function runInitialAdministrators(environment = process.env) {
  const fail = code => { throw new InitialAdministratorsError(code); };
  let token;
  async function accessToken() {
    if (token) return token;
    if (!environment.KEYCLOAK_OPERATOR_USERNAME || !environment.KEYCLOAK_OPERATOR_PASSWORD) fail('OPERATOR_CONFIGURATION_REQUIRED');
    const response = await fetch(new URL('/realms/master/protocol/openid-connect/token', environment.PUBLIC_ORIGIN), {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
      body: new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli',
        username: environment.KEYCLOAK_OPERATOR_USERNAME, password: environment.KEYCLOAK_OPERATOR_PASSWORD }),
    });
    if (!response.ok) fail('OPERATOR_AUTHENTICATION_FAILED');
    token = (await response.json()).access_token;
    if (!token) fail('OPERATOR_AUTHENTICATION_FAILED');
    return token;
  }
  async function request(resource, method = 'GET', body) {
    const authorization = 'Bearer ' + await accessToken();
    const response = await fetch(new URL('/admin/realms/itecsa' + resource, environment.PUBLIC_ORIGIN), {
      method, redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { authorization, accept: 'application/json', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) fail('KEYCLOAK_HTTP_' + response.status);
    if (method === 'POST' && resource === '/users') return response.headers.get('location')?.split('/').at(-1);
    if (response.status === 204) return null;
    const raw = await response.text();
    return raw ? JSON.parse(raw) : null;
  }
  const receiptStore = {
    async read() {
      try { return JSON.parse(await readFile(receiptFile, 'utf8')); }
      catch (error) { if (error.code === 'ENOENT') return null; fail('RECEIPT_NOT_READABLE'); }
    },
    async write(receipt) {
      await mkdir(path.dirname(receiptFile), { recursive: true, mode: 0o700 });
      const temporary = receiptFile + '.' + randomUUID() + '.tmp';
      try {
        await writeFile(temporary, JSON.stringify(receipt) + '\n', { flag: 'wx', mode: 0o600 });
        await rename(temporary, receiptFile);
      } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
    },
  };
  try {
    const result = await bootstrapInitialAdministrators({ environment, prisma: getPrismaClient(), request, receiptStore });
    console.log(result.created ? 'KEYCLOAK_INITIAL_ADMINS: tres administradores preparados; cambio de contrasena obligatorio.'
      : 'KEYCLOAK_INITIAL_ADMINS: alta inicial ya completada; no se modificaron cuentas ni credenciales.');
    return result;
  } catch (error) {
    console.error(error instanceof InitialAdministratorsError || /^INITIAL_ADMIN/.test(error.message ?? '')
      ? error.message : 'KEYCLOAK_INITIAL_ADMINS: alta incompleta; revisar disponibilidad y ejecutar resume con la misma configuracion.');
    process.exitCode = 1;
  } finally { await disconnectPrismaClient(); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await runInitialAdministrators();

import { fileURLToPath } from 'node:url';
import { validateOrigin } from './render-realm.mjs';

export async function verifyServiceClient(env = process.env, fetcher = fetch) {
  const origin = validateOrigin(env.PUBLIC_ORIGIN);
  const options = { redirect: 'error', signal: AbortSignal.timeout(10000) };
  const response = await fetcher(origin + '/realms/itecsa/protocol/openid-connect/token', {
    ...options, method: 'POST', body: new URLSearchParams({ grant_type: 'client_credentials',
      client_id: 'itecsa-backend-admin', client_secret: env.KEYCLOAK_ADMIN_CLIENT_SECRET ?? '' }),
  });
  if (!response.ok) throw Error('KEYCLOAK_VERIFY: el secreto de la cuenta tecnica no coincide con el realm');
  const token = (await response.json()).access_token;
  if (!token) throw Error('KEYCLOAK_VERIFY: token tecnico ausente');
  const users = await fetcher(origin + '/admin/realms/itecsa/users?max=1', {
    redirect: 'error', signal: AbortSignal.timeout(10000), headers: { authorization: 'Bearer ' + token },
  });
  if (!users.ok) throw Error('KEYCLOAK_VERIFY: la cuenta tecnica no puede consultar usuarios');
  await users.arrayBuffer(); // Discard personal data; never print the response.
  console.log('KEYCLOAK_VERIFY: credenciales y acceso de la cuenta tecnica verificados');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  verifyServiceClient().catch(error => { console.error(error.message); process.exitCode = 1; });
}

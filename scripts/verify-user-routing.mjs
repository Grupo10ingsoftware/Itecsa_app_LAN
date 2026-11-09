#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { request } from 'node:https';
import { parseArgs } from 'node:util';

const usage = `Uso: node scripts/verify-user-routing.mjs --origin https://servidor [--ca ruta/ca.pem]

Comprueba el enrutamiento de Gestión de usuarios y Keycloak en un despliegue real.
Solo realiza GET y HEAD sin credenciales. No modifica datos ni omite la validación TLS.
--ca permite confiar en la CA del despliegue para esta ejecución.
`;

function options() {
  const { values } = parseArgs({ options: {
    origin: { type: 'string' },
    ca: { type: 'string' },
    help: { type: 'boolean' },
  } });
  if (values.help) {
    console.log(usage);
    process.exit(0);
  }
  const origin = new URL(values.origin);
  if (origin.protocol !== 'https:' || origin.username || origin.password
    || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('Invalid origin');
  }
  return { origin: origin.origin, ca: values.ca ? readFileSync(values.ca) : undefined };
}

let config;
try {
  config = options();
} catch {
  console.error('Se requiere --origin con un origen HTTPS válido y una CA legible si se indica.');
  console.error(usage);
  process.exit(1);
}

function get(path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = request(new URL(path, config.origin), {
      method,
      ca: config.ca,
      signal: AbortSignal.timeout(15000),
      headers: { Accept: '*/*' },
    }, response => {
      const chunks = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) {
          response.destroy(new Error('Response too large'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('error', reject);
    req.end();
  });
}

function expect(condition, expectation) {
  if (!condition) throw new Error(expectation);
}

function html(response) {
  expect(response.status === 200, 'HTTP 200');
  expect(/^text\/html\b/i.test(response.headers['content-type'] ?? ''), 'Content-Type text/html');
}

function noStore(response) {
  expect(/(?:^|,)\s*no-store\s*(?:,|$)/i.test(response.headers['cache-control'] ?? ''), 'Cache-Control no-store');
}

let passed = 0;
let failed = 0;
async function check(path, validate, method = 'GET') {
  let response;
  try {
    response = await get(path, method);
  } catch {
    failed++;
    console.error(`FAIL ${method} ${path}: se esperaba una respuesta HTTPS válida en 15 segundos.`);
    return;
  }
  try {
    validate(response);
    passed++;
    console.log(`PASS ${method} ${path}`);
  } catch (error) {
    failed++;
    console.error(`FAIL ${method} ${path}: se esperaba ${error.message}.`);
  }
}

let index;
await check('/index.html', response => {
  html(response);
  noStore(response);
  expect(response.body.includes('id="root"'), 'la página raíz de la aplicación React');
  index = response.body;
});

const routes = ['/admin/usuarios', '/admin/usuarios/', '/admin/usuarios/nuevo', '/admin/usuarios/nuevo?origen=integridad'];
for (const path of routes) {
  await check(path, response => {
    html(response);
    noStore(response);
    expect(index !== undefined && response.body === index, 'el mismo contenido de /index.html');
  });
}
await check('/admin/usuarios', response => {
  html(response);
  noStore(response);
  expect(response.body === '', 'un cuerpo vacío para HEAD');
}, 'HEAD');

await check('/realms/itecsa/.well-known/openid-configuration', response => {
  expect(response.status === 200, 'HTTP 200');
  let metadata;
  try { metadata = JSON.parse(response.body); } catch { throw new Error('metadatos OIDC JSON'); }
  expect(metadata.issuer === `${config.origin}/realms/itecsa`, 'el issuer OIDC del origen indicado');
});
await check('/admin/usuarios-extra', response => {
  expect(response.status === 405, 'HTTP 405 de Keycloak para una ruta fuera del segmento /admin/usuarios');
  expect(response.body !== index, 'una respuesta distinta de la aplicación React');
});
await check('/admin/realms', response => {
  expect(response.status === 401, 'HTTP 401 sin autenticación en la API de Keycloak');
});
await check('/admin/master/console/', response => {
  html(response);
  expect(response.body !== index && /\/resources\/[^/"'\s]+\/admin\//.test(response.body), 'la consola administrativa de Keycloak');
});
await check('/api/admin/identity/users', response => {
  expect(response.status === 401, 'HTTP 401 sin autenticación en la API de usuarios');
});

console.log(`${passed} comprobaciones correctas; ${failed} fallidas.`);
process.exitCode = failed ? 1 : 0;

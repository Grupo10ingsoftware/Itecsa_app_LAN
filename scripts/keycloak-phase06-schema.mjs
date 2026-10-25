import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function preparePhase06Schema() {
  assert.equal(process.env.RUN_KEYCLOAK_ADMIN_INTEGRATION, 'true');
  assert.equal(process.env.APP_ENV, 'test');
  assert.equal(process.env.NODE_ENV, 'test');
  assert.equal(process.env.DB_HOST, 'phase02-mysql');
  assert.equal(process.env.DB_NAME, 'itecsa_identity_phase02_test');
  assert.equal(process.env.DB_USER, 'phase02_test');
  assert.equal(process.env.DB_PORT, '3306');
  assert.equal(process.env.DB_SSL_MODE, 'disabled');
  const target = new URL(process.env.DATABASE_URL);
  assert.equal(target.protocol, 'mysql:');
  assert.equal(target.hostname, process.env.DB_HOST);
  assert.equal(target.port, process.env.DB_PORT);
  assert.equal(target.pathname, '/' + process.env.DB_NAME);
  assert.equal(target.username, process.env.DB_USER);
  assert.equal(decodeURIComponent(target.password), process.env.DB_PASSWORD);
  const cli = '/app/tooling/prisma/node_modules/prisma/build/index.js';
  const config = '/app/capaServidor/prisma.config.ts';
  const run = (args, input) => execFileSync(process.execPath, [cli, ...args, '--config', config], { encoding: 'utf8', input });
  if (process.env.LAB_STAGE !== 'restart') {
    const sql = run(['migrate', 'diff', '--from-empty', '--to-schema', '/app/phase06-baseline.prisma', '--script']);
    run(['db', 'execute', '--stdin'], sql);
    run(['db', 'execute', '--stdin'],
      "INSERT INTO Usuario (id_usuario,id_auth0,correo_usuario,nombre_usuario,rol_usuario,estado_usuario,pin_hash,pin_salt) VALUES (88501,'legacy|phase06-preserved','phase06-history@example.invalid','Historical','Soporte','Activo','synthetic-existing-hash','synthetic-existing-salt'); INSERT INTO Registros (ID_REGISTRO,FECHA_HORA,id_usuario,observacion) VALUES (88501,NOW(),88501,'phase06-existing-history');");
    const migration = readFileSync('/app/capaServidor/prisma/migrations/202610250001_keycloak_identity_preparation/migration.sql', 'utf8');
    run(['db', 'execute', '--stdin'], migration);
    console.log('PHASE06_SCHEMA: baseline 9e44010 + additive migration executed on disposable SQL only');
  }
  // Generated client is written only into the runner image's writable layer.
  console.log(run(['generate']).trim());
}

// Generate before loading ANY application module: some import Prisma eagerly.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assert.equal(process.env.KEYCLOAK_ISSUER, 'http://phase02-keycloak:8080/realms/itecsa-phase02');
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch(process.env.KEYCLOAK_ISSUER + '/.well-known/openid-configuration', { signal: AbortSignal.timeout(1000) });
      if (response.ok) { assert.equal((await response.json()).issuer, process.env.KEYCLOAK_ISSUER); ready = true; break; }
    } catch { /* fixed disposable IdP only */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready, 'Keycloak temporal no disponible antes de preparar el schema.');
  preparePhase06Schema();
  const result = spawnSync(process.execPath, ['--test', 'test/keycloak.real.integration.test.js'], {
    stdio: 'inherit', env: { ...process.env, PHASE06_SCHEMA_PREPARED: 'true' },
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

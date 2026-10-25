import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPhase02Realm, LAB } from './keycloak-phase02-realm.mjs';
import { buildPhase06Realm, ADMIN_LAB } from './keycloak-phase06-realm.mjs';

// --run is deliberately required. This script never reads .env, Docker Compose,
// existing containers, corporate endpoints, users or credentials.
const root = fileURLToPath(new URL('../', import.meta.url));
const images = {
  keycloak: 'quay.io/keycloak/keycloak@sha256:a78d6b79572168cb25886b80a8b5b8d4ed4390743e3eecb810538683e209dd6b',
  mysql: 'mysql@sha256:76f0358884cb92d9a086d24e5671c38048d3fef40f2588703d73eb55392d6b69',
  api: 'sha256:fe522729fe459fd368741d2a54261c39b32438d70470cdffee70e792e4e6bbdb',
};
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();

async function main() {
  const production = process.argv.slice(2).includes('--production');
  const business = process.argv.slice(2).includes('--business');
  const administration = process.argv.slice(2).includes('--administration');
  assert.deepEqual(process.argv.slice(2), administration ? ['--run', '--production', '--business', '--administration']
    : business ? ['--run', '--production', '--business'] : production ? ['--run', '--production'] : ['--run'],
    'Uso: node scripts/keycloak-phase02-lab.mjs --run [--production [--business [--administration]]]');
  for (const image of Object.values(images)) docker('image', 'inspect', image);
  const suffix = randomUUID().slice(0, 8);
  const label = `itecsa.phase02.lab=${suffix}`;
  const network = `itecsa-phase02-${suffix}`;
  const keycloak = `${network}-keycloak`;
  const mysql = `${network}-mysql`;
  const temporary = mkdtempSync(join(tmpdir(), 'itecsa-phase02-lab-'));
  const containers = [];
  let networkCreated = false;
  function removeOwnedContainer(name) {
    assert.ok(containers.includes(name) && name.startsWith(network + '-'));
    if (!docker('ps', '-aq', '--filter', `name=^/${name}$`)) return;
    const info = JSON.parse(docker('inspect', name))[0];
    assert.equal(info.Config.Labels['itecsa.phase02.lab'], suffix);
    docker('rm', '-f', name);
  }
  try {
    writeFileSync(join(temporary, LAB.realm + '-realm.json'), JSON.stringify(administration ? buildPhase06Realm() : buildPhase02Realm()));
    if (administration) {
      const baseline = execFileSync('git', ['show', '9e44010:capaServidor/prisma/schema.prisma'], { cwd: root, encoding: 'utf8' });
      writeFileSync(join(temporary, 'phase06-baseline.prisma'), baseline);
    }
    docker('network', 'create', '--internal', '--label', label, network);
    networkCreated = true;
    assert.equal(JSON.parse(docker('network', 'inspect', network))[0].Internal, true);
    docker('run', '-d', '--name', mysql, '--label', label, '--network', network,
      '--network-alias', 'phase02-mysql', '--mount', 'type=tmpfs,target=/var/lib/mysql',
      '--env', 'MYSQL_ROOT_PASSWORD=Synthetic-Root-Phase02-Only', '--env', 'MYSQL_DATABASE=itecsa_identity_phase02_test',
      '--env', 'MYSQL_USER=phase02_test', '--env', 'MYSQL_PASSWORD=Synthetic-DB-Phase02-Only', images.mysql);
    containers.push(mysql);
    docker('run', '-d', '--name', keycloak, '--label', label, '--network', network,
      '--network-alias', 'phase02-keycloak', '--mount', `type=bind,source=${temporary},target=/opt/keycloak/data/import,readonly`,
      '--env', 'KC_HOSTNAME=http://phase02-keycloak:8080', '--env', 'KC_HEALTH_ENABLED=true',
      images.keycloak, 'start-dev', '--import-realm');
    containers.push(keycloak);
    const version = docker('exec', keycloak, '/opt/keycloak/bin/kc.sh', '--version');
    console.log(version);
    assert.match(version, /26\.8\.1/);
    const environment = {
      APP_ENV: 'test', NODE_ENV: 'test', AUTH_PROVIDER: 'keycloak', KEYCLOAK_ALLOW_HTTP: 'true',
      KEYCLOAK_ISSUER: LAB.issuer, KEYCLOAK_CLIENT_ID: LAB.clientId, KEYCLOAK_ROLE_CLIENT_ID: LAB.roleClientId,
      KEYCLOAK_AUDIENCE: LAB.audience, KEYCLOAK_JWKS_URI: LAB.issuer + '/protocol/openid-connect/certs',
      RUN_KEYCLOAK_REAL_INTEGRATION: 'true', DB_HOST: 'phase02-mysql', DB_PORT: '3306',
      RUN_KEYCLOAK_PRODUCTION_INTEGRATION: String(production),
      RUN_KEYCLOAK_BUSINESS_INTEGRATION: String(business),
      RUN_KEYCLOAK_ADMIN_INTEGRATION: String(administration),
      ...(administration ? { KEYCLOAK_ADMIN_CLIENT_ID: ADMIN_LAB.clientId, KEYCLOAK_ADMIN_CLIENT_SECRET: ADMIN_LAB.secret } : {}),
      CURSOR_SECRET: 'Synthetic-Cursor-Phase04-Only-Not-Corporate',
      DB_USER: 'phase02_test', DB_PASSWORD: 'Synthetic-DB-Phase02-Only', DB_NAME: 'itecsa_identity_phase02_test',
      DB_SSL_MODE: 'disabled', DATABASE_URL: 'mysql://phase02_test:Synthetic-DB-Phase02-Only@phase02-mysql:3306/itecsa_identity_phase02_test',
    };
    const mounts = ['capaServidor/src', 'capaServidor/test', 'shared', 'scripts'].flatMap(path =>
      ['--mount', `type=bind,source=${resolve(root, path)},target=/app/${path},readonly`]);
    if (administration) mounts.push('--mount', `type=bind,source=${join(root, 'capaServidor/prisma')},target=/app/capaServidor/prisma,readonly`,
      '--mount', `type=bind,source=${join(temporary, 'phase06-baseline.prisma')},target=/app/phase06-baseline.prisma,readonly`);
    for (const stage of ['initial', 'restart']) {
      if (stage === 'restart') { console.log('Reiniciando solo el Keycloak de laboratorio...'); docker('restart', keycloak); }
      console.log(`Prueba real (${stage}): red interna, sin puertos publicados ni .env...`);
      const runner = `${network}-runner-${stage}`;
      containers.push(runner);
      const args = ['run', '--rm', '--name', runner, '--label', label, '--network', network,
        '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--pids-limit', '256',
        ...Object.entries({ ...environment, LAB_STAGE: stage }).flatMap(([key, value]) => ['--env', `${key}=${value}`]),
        ...mounts, images.api, 'node',
        ...(administration ? ['/app/scripts/keycloak-phase06-schema.mjs'] : ['--test', 'test/keycloak.real.integration.test.js'])];
      const result = spawnSync('docker', args, { stdio: 'inherit', timeout: 180000 });
      if (result.error) throw result.error;
      if (result.status !== 0) {
        // Only startup diagnostics of the owned synthetic IdP, never corporate logs.
        console.error(docker('logs', '--tail', '60', keycloak));
      }
      assert.equal(result.status, 0, 'La prueba real debe finalizar sin fallos.');
    }
    if (production) {
      // Preserve the strict original 127.0.0.1:33307 guards without publishing a host port.
      const physicalMysql = `${network}-physical-mysql`;
      containers.push(physicalMysql);
      docker('run', '-d', '--name', physicalMysql, '--label', label, '--network', network,
        '--mount', 'type=tmpfs,target=/var/lib/mysql', '--env', 'MYSQL_ROOT_PASSWORD=Synthetic-Physical-Root-Only',
        '--env', 'MYSQL_DATABASE=itecsa_physical_test', '--env', 'MYSQL_USER=itecsa_test',
        '--env', 'MYSQL_PASSWORD=Synthetic-Physical-Phase04-Only', images.mysql, '--port=33307');
      const physical = {
        APP_ENV: 'test', NODE_ENV: 'test', AUTH_PROVIDER: 'auth0', SALES_NOTE_SOURCE: 'fixture',
        RUN_PHYSICAL_REGRESSIONS: 'true', RUN_MYSQL_INTEGRATION: 'true', LAB_STAGE: 'phase04-physical',
        DB_HOST: '127.0.0.1', DB_PORT: '33307', DB_NAME: 'itecsa_physical_test', DB_USER: 'itecsa_test',
        DB_PASSWORD: 'Synthetic-Physical-Phase04-Only', DB_SSL_MODE: 'disabled',
        DATABASE_URL: 'mysql://itecsa_test:Synthetic-Physical-Phase04-Only@127.0.0.1:33307/itecsa_physical_test',
      };
      const runner = `${network}-physical-runner`;
      containers.push(runner);
      console.log('Regresiones físicas originales: MySQL separado, sin puertos del host...');
      const result = spawnSync('docker', ['run', '--rm', '--name', runner, '--label', label,
        '--network', `container:${physicalMysql}`, '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--pids-limit', '256',
        ...Object.entries(physical).flatMap(([key, value]) => ['--env', `${key}=${value}`]),
        ...mounts, images.api, 'node', '/app/scripts/keycloak-phase04-physical.mjs'], { stdio: 'inherit', timeout: 180000 });
      if (result.error) throw result.error;
      assert.equal(result.status, 0, 'Las regresiones físicas originales deben finalizar sin fallos.');
    }
    console.log('Laboratorio completo: inicial + reinicio aprobados.' + (production ? ' Producción y regresiones físicas aprobadas.' : ''));
  } finally {
    for (const name of containers.reverse()) {
      try { removeOwnedContainer(name); } catch { console.error(`Revisar limpieza del recurso propio ${name}`); }
    }
    if (networkCreated) {
      const info = JSON.parse(docker('network', 'inspect', network))[0];
      assert.equal(info.Labels['itecsa.phase02.lab'], suffix);
      docker('network', 'rm', network);
    }
    // Verify the resolved Windows target is the newly created temporary directory.
    const temporaryRoot = realpathSync(tmpdir());
    const actual = realpathSync(temporary);
    const child = relative(temporaryRoot, actual);
    assert.ok(child && !child.startsWith('..') && !isAbsolute(child) && basename(actual).startsWith('itecsa-phase02-lab-'));
    rmSync(actual, { recursive: true, force: true });
  }
}

main().catch(error => {
  // Never dump request bodies, passwords, authorization codes or tokens.
  console.error(error.code || error.name, error.message);
  process.exitCode = 1;
});

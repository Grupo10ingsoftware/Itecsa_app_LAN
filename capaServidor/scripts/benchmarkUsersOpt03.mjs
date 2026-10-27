// Opt-in bounded SELECT-only benchmark; no rows, parameters, tokens or credentials in artifacts.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { resolveDatabaseConnection, createStrictTlsOptions } from '../src/database/connectionConfig.js';
import { KeycloakIdentityRepository } from '../src/modules/users/repo/keycloakIdentity.repo.js';
import { KeycloakIdentityAdministrationService } from '../src/modules/users/service/keycloakIdentityAdministration.service.js';
import { createKeycloakIdentityPreparationRouter } from '../src/modules/users/routes/keycloakIdentityPreparation.routes.js';
import { ASSIGNABLE_ROLES } from '../../shared/keycloakAuthorization.js';
import { measureUsersHttp } from './usersHttpProbeOpt03.mjs';

const arg = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
if (process.env.APP_ENV !== 'development' || !process.argv.includes('--allow-development-reads') || !arg('reference-root')) {
  throw Error('Requires APP_ENV=development, --allow-development-reads, --reference-root=/isolated/copy/of/c0eef72');
}
const loadReference = path => import(pathToFileURL(resolve(arg('reference-root'), 'capaServidor', path)).href);
const { KeycloakIdentityRepository: BeforeRepository } = await loadReference('src/modules/users/repo/keycloakIdentity.repo.js');
const { KeycloakIdentityAdministrationService: BeforeService } = await loadReference('src/modules/users/service/keycloakIdentityAdministration.service.js');
const { createKeycloakIdentityPreparationRouter: beforeRouter } = await loadReference('src/modules/users/routes/keycloakIdentityPreparation.routes.js');
const c = resolveDatabaseConnection();
const db = new PrismaClient({ adapter: new PrismaMariaDb({ host: c.host, port: c.port, user: c.user, password: c.password,
  database: c.database, connectionLimit: 10, connectTimeout: 8000, socketTimeout: 15000,
  ...(c.sslMode === 'required' ? { ssl: createStrictTlsOptions(c.host, c.ca) } : {}) }), log: [{ emit: 'event', level: 'query' }] });
let selects = 0; const shapes = new Set();
db.$on('query', event => { if (/^\s*SELECT/i.test(event.query)) { selects++; shapes.add(event.query); } });
const output = { run: 'OPT-03 reimplementation', reference: 'c0eef72', capturedAt: new Date().toISOString(), node: process.version,
  environment: 'isolated diagnostic process / existing development database / strict TLS / pool 10 / warm reads',
  methodology: '10 samples per series, 250ms pause outside clock, median not a production SLO; no p95 with n=10',
  samples: {}, sql: {}, equivalence: [], errors: 0 };
const pause = () => new Promise(resolve => setTimeout(resolve, 250));
async function sample(name, work) {
  await work(); shapes.clear(); const values = [];
  for (let i = 0; i < 10; i++) {
    selects = 0; const start = performance.now(); await work();
    values.push({ ms: +(performance.now() - start).toFixed(3), selects }); await pause();
  }
  const sorted = values.map(value => value.ms).sort((a, b) => a - b);
  output.samples[name] = { n: 10, minMs: sorted[0], medianMs: +((sorted[4] + sorted[5]) / 2).toFixed(3),
    meanMs: +(sorted.reduce((a, b) => a + b, 0) / 10).toFixed(3), maxMs: sorted.at(-1), values };
  output.sql[name] = [...shapes];
  console.error(JSON.stringify({ series: name, medianMs: output.samples[name].medianMs }));
}
let stage = 'fixture';
try {
  const historyOnly = process.argv.includes('--history-only');
  const issuer = process.env.KEYCLOAK_ISSUER.trim();
  const bindings = await db.externalIdentity.findMany({ where: { provider: 'keycloak', issuer,
    Usuario: { is: { rol_usuario: { in: [...ASSIGNABLE_ROLES] } } } }, orderBy: { user_id: 'asc' }, take: 2,
    select: { user_id: true, subject: true } });
  if (!bindings.length) throw Error('NO_ASSIGNABLE_FIXTURE');
  const before = new BeforeRepository({ prisma: db }), after = new KeycloakIdentityRepository({ prisma: db });
  const history = await db.registros.groupBy({ by: ['id_usuario'], where: { Usuario: { is: before.userScope(issuer) } },
    _count: { _all: true }, orderBy: { _count: { id_usuario: 'desc' } }, take: 1 });
  const userId = history[0]?.id_usuario ?? bindings[0].user_id;
  if (!process.argv.includes('--http-only')) {
    stage = 'equivalence';
    const filters = [{}, { page: 2 }, { page: 500 }, { search: 'a' }, { search: '%' }, { search: '_' }, { search: '\\' },
      { search: "' OR 1=1 --" }, { estadoUsuario: 'Activo' }, { estadoUsuario: 'Vinculado' },
      { estadoUsuario: 'Desvinculado' }, { rolUsuario: ASSIGNABLE_ROLES[0] }, { search: 'o', estadoUsuario: 'Activo', rolUsuario: ASSIGNABLE_ROLES[0] }];
    for (let i = 0; !historyOnly && i < filters.length; i++) {
      const input = { page: 1, perPage: 10, ...filters[i] };
      assert.deepEqual(await after.list(issuer, input), await before.list(issuer, input)); output.equivalence.push(`list_${i}`);
    }
    for (const [i, search] of ['', '1', 'a', '%', '_', '\\', "' OR 1=1 --", 'Estado de pago: Pagado', 'Etapa del pedido: Diseño', 'Subproceso: Diseño', '999999999999999999999'].entries()) {
      const query = { page: i === 0 ? 2 : 1, perPage: 10, search };
      assert.deepEqual(await after.movements(userId, query), await before.movements(userId, query)); output.equivalence.push(`history_${i}`);
    }
    for (let i = 0; !historyOnly && i < bindings.length; i++) {
      assert.deepEqual(await after.binding(issuer, bindings[i].subject), await before.binding(issuer, bindings[i].subject)); output.equivalence.push(`binding_${i}`);
    }
    if (!historyOnly) {
      assert.deepEqual(await after.summary(issuer), await before.summary(issuer)); output.equivalence.push('summary');
    }
    stage = 'repository samples';
    for (const [name, method, args] of [['list', 'list', [issuer, { page: 1, perPage: 10 }]], ['summary', 'summary', [issuer]],
      ['binding', 'binding', [issuer, bindings[0].subject]], ['movements', 'movements', [userId, { page: 1, perPage: 10 }]]]) {
      if (historyOnly && name !== 'movements') continue;
      const expected = await before[method](...args);
      if (name === 'movements') output.fixture = { historyRecordCount: expected.total, selection: 'largest history among assignable users of configured issuer' };
      for (const [label, repo] of [['before', before], ['after', after]]) await sample(`${name}_${label}`, async () => {
        assert.deepEqual(await repo[method](...args), expected);
      });
    }
    stage = 'metadata';
    output.indexes = await db.$queryRaw`SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME
      FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('Registros','ExternalIdentity')
      ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`;
    output.explainHistory = await db.$queryRaw`EXPLAIN SELECT r.ID_REGISTRO, r.FECHA_HORA, r.observacion,
      p.id_registro, ep.nombre_estado_pago, e.id_registro, et.nombre_etapa, s.id_registro, es.nombre_estado FROM Registros r
      LEFT JOIN Registro_Pago p ON p.id_registro=r.ID_REGISTRO
      LEFT JOIN Estado_Pago ep ON ep.id_estado_pago=p.id_estado_pago_nuevo
      LEFT JOIN Registro_Etapas e ON e.id_registro=r.ID_REGISTRO
      LEFT JOIN Estado_Pedido et ON et.id_estado_pedido=e.id_estado_pedido
      LEFT JOIN registro_subprocesos s ON s.id_registro=r.ID_REGISTRO
      LEFT JOIN Estado_Subprocesos es ON es.id_estado_subproceso=s.id_estado_subproceso
      WHERE r.id_usuario=${userId} ORDER BY r.FECHA_HORA DESC, r.ID_REGISTRO DESC LIMIT 10`;
  }
  if (process.argv.includes('--http-only') || process.argv.includes('--with-http')) {
    stage = 'http';
    await measureUsersHttp({ db, issuer, output, sample, versions: {
      before: { Repository: BeforeRepository, Service: BeforeService, router: beforeRouter },
      after: { Repository: KeycloakIdentityRepository, Service: KeycloakIdentityAdministrationService, router: createKeycloakIdentityPreparationRouter },
    } });
  }
} catch (error) {
  output.errors++; output.failure = { stage, type: error.name, code: error.code ?? 'DIAGNOSTIC_FAILED' }; process.exitCode = 1;
} finally {
  try { await db.$disconnect(); } catch { output.errors++; process.exitCode = 1; }
  const json = JSON.stringify(output, (_key, value) => typeof value === 'bigint' ? value.toString() : value, 2) + '\n';
  if (arg('output')) await writeFile(arg('output'), json); else process.stdout.write(json);
}

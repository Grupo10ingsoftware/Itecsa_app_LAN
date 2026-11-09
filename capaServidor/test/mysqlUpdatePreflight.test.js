import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertSafeMigrationState } from '../src/database/mysqlLabSafety.js';
import { initializeMysqlLab, preflightMysqlLab } from '../src/database/mysqlLabInitializer.js';
import { MYSQL_LAB_CATALOG } from '../src/database/mysqlLabCatalog.js';

const env = {
  DB_TARGET: 'mysql-docker', DB_HOST: 'mysql', DB_PORT: '3306', DB_NAME: 'itecsa',
  DB_USER: 'app', DB_PASSWORD: 'fixture-'.repeat(4),
  DB_MIGRATION_USER: 'migrator', DB_MIGRATION_PASSWORD: 'fixture-'.repeat(5),
  // All connections/runners are injected; no network or production CA is used.
  APP_ENV: 'test', DB_SSL_MODE: 'disabled',
};
const succeededMigration = name => ({ migration_name: name, finished_at: new Date('2026-11-01T00:00:00Z'), rolled_back_at: null });
const currentCatalog = () => structuredClone({
  Estado_Pago: MYSQL_LAB_CATALOG.paymentStatuses,
  Estado_Pedido: MYSQL_LAB_CATALOG.orderStatuses,
  Tipo_Producto: MYSQL_LAB_CATALOG.productTypes,
  etiqueta: MYSQL_LAB_CATALOG.labels,
  Estado_Subprocesos: MYSQL_LAB_CATALOG.subprocesses,
  Producto_Subproceso: MYSQL_LAB_CATALOG.productSubprocesses,
});

// Original persisted IDs/flows from 4f4d4c1, before functional catalog v1.
// This is data for the validator, not an executable historical seed.
function legacyCatalog() {
  const tables = currentCatalog();
  const names = ['Confirmacion de pago', 'Listo para produccion', 'En produccion', 'Listo para entrega', 'Entregado', 'Cancelado', 'En revisión'];
  tables.Estado_Pedido.forEach((row, i) => { row.nombre_etapa = names[i]; });
  tables.Tipo_Producto = [
    { id_tipo_producto: 1, nombre_producto: 'Yoyo', capacidad_diaria: null },
    { id_tipo_producto: 2, nombre_producto: 'Lanyard', capacidad_diaria: 1200 },
    { id_tipo_producto: 3, nombre_producto: 'Tarjeta', capacidad_diaria: null },
  ];
  tables.Estado_Subprocesos = [
    { id_estado_subproceso: 1, nombre_estado: 'Impresión' },
    { id_estado_subproceso: 2, nombre_estado: 'Corte' },
    { id_estado_subproceso: 3, nombre_estado: 'Empaquetado' },
  ];
  tables.Producto_Subproceso = [2, 3].flatMap(id_tipo_producto => [1, 2, 3].map((id_estado_subproceso, index) => ({
    id_tipo_producto, id_estado_subproceso, orden_flujo: index + 1,
  })));
  return tables;
}

function fixture({ tables = currentCatalog(), history = [succeededMigration('0_init')], queryFailure, requireTransaction = false } = {}) {
  const events = [];
  const before = structuredClone({ tables, history });
  const state = structuredClone(before);
  let transaction = false;
  const connection = {
    async query(sql, params) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      events.push(normalized);
      if (queryFailure?.(normalized)) throw new Error('injected query failure');
      if (normalized === 'START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY') {
        assert.equal(transaction, false, 'only one read-only transaction may be opened');
        transaction = true;
        return [];
      }
      if (normalized === 'ROLLBACK') {
        transaction = false;
        return [];
      }
      if (requireTransaction) assert.equal(transaction, true, 'all inspection reads must be inside the read-only snapshot');
      if (normalized === 'SELECT TABLE_NAME AS tableName FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?') {
        assert.deepEqual(params, [env.DB_NAME]);
        return [...Object.keys(state.tables), ...(state.history === null ? [] : ['_prisma_migrations'])].map(tableName => ({ tableName }));
      }
      if (/^SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at$/.test(normalized)) {
        assert.notEqual(state.history, null, 'history cannot be read when its table does not exist');
        return structuredClone(state.history);
      }
      const catalogRead = /^SELECT \* FROM `([^`]+)`$/.exec(normalized);
      if (catalogRead && Object.hasOwn(state.tables, catalogRead[1])) return structuredClone(state.tables[catalogRead[1]]);
      assert.fail('Unrecognized or mutating SQL in preflight: ' + normalized);
    },
    async end() { events.push('END'); },
  };
  return {
    connection, events, state,
    openConnection: async actualEnv => { assert.equal(actualEnv, env); events.push('OPEN'); return connection; },
    assertUnchanged: () => assert.deepEqual(state, before, 'preflight must not modify catalog/history rows'),
  };
}

async function rejectState(f, pattern, options = { requireExisting: true }) {
  await assert.rejects(assertSafeMigrationState(f.connection, env.DB_NAME, options), pattern);
  f.assertUnchanged();
}

test('an existing functional catalog is accepted without requiring every target migration to be applied', async () => {
  const f = fixture();
  const result = await assertSafeMigrationState(f.connection, env.DB_NAME, { requireExisting: true });
  assert.equal(result.fresh, false);
  f.assertUnchanged();
});

test('editable production capacity and additional labels stay compatible', async () => {
  const tables = currentCatalog();
  tables.Tipo_Producto[0].capacidad_diaria = 750;
  tables.etiqueta.push({ id_etiqueta: 99, nombre_etiqueta: 'Fixture adicional', esta_activa: 1 });
  const f = fixture({ tables });
  await assertSafeMigrationState(f.connection, env.DB_NAME, { requireExisting: true });
  f.assertUnchanged();
});

test('legacy product IDs and subprocess flows are rejected, never converted', async () => {
  await rejectState(fixture({ tables: legacyCatalog() }), /catalogo.*incompatible/i);
});

test('catalog rejection identifies conflicting and missing entries', async () => {
  const tables = currentCatalog();
  tables.Tipo_Producto[0].nombre_producto = 'Producto anterior';
  tables.Estado_Subprocesos.pop();
  const f = fixture({ tables });
  await assert.rejects(assertSafeMigrationState(f.connection, env.DB_NAME, { requireExisting: true }), error => {
    assert.match(error.message, /tipo_Producto/i);
    assert.match(error.message, /id_tipo_producto=1/);
    assert.match(error.message, /estado_Subprocesos/i);
    assert.match(error.message, /id_estado_subproceso=10/);
    return true;
  });
  f.assertUnchanged();
});

test('a partially populated catalog is rejected before migration', async () => {
  const tables = currentCatalog();
  tables.Estado_Pago.pop();
  await rejectState(fixture({ tables }), /catalogo.*incompatible/i);
});

test('all empty catalog tables are rejected for update', async () => {
  const tables = Object.fromEntries(Object.keys(currentCatalog()).map(name => [name, []]));
  await rejectState(fixture({ tables }), /catalogo.*incompatible/i);
});

test('missing catalog tables are rejected for update', async () => {
  await rejectState(fixture({ tables: {} }), /catalogo.*incompatible/i);
});

test('a brand new empty database is still allowed during installation', async () => {
  const f = fixture({ tables: {}, history: null });
  const result = await assertSafeMigrationState(f.connection, env.DB_NAME);
  assert.equal(result.fresh, true);
  assert.equal(result.tableCount, 0);
  f.assertUnchanged();
});

test('update rejects a brand new empty database without migration history', async () => {
  await rejectState(fixture({ tables: {}, history: null }), /historial|instalacion/i);
});

test('update rejects an empty migration history', async () => {
  await rejectState(fixture({ history: [] }), /historial|migracion/i);
});

test('application tables without Prisma history stay rejected even for installation', async () => {
  await rejectState(fixture({ history: null }), /tablas sin historial Prisma/i, {});
});

for (const [name, record] of [
  ['failed', { ...succeededMigration('failed_fixture'), finished_at: null }],
  ['rolled back', { ...succeededMigration('rolled_back_fixture'), rolled_back_at: new Date('2026-11-02T00:00:00Z') }],
]) {
  test(`${name} migrations are rejected for update and initial deployment`, async () => {
    for (const options of [{ requireExisting: true }, {}]) {
      await rejectState(fixture({ history: [record] }), /fallidas|revertidas/i, options);
    }
  });
}

test('preflight reads one consistent read-only snapshot and always rolls it back', async () => {
  const f = fixture({ requireTransaction: true });
  await preflightMysqlLab(env, { openConnection: f.openConnection, requireExisting: true });
  assert.deepEqual(f.events.slice(0, 2), ['OPEN', 'START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY']);
  assert.deepEqual(f.events.slice(-2), ['ROLLBACK', 'END']);
  assert.ok(!f.events.some(event => /^(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE|COMMIT)\b/.test(event)));
  f.assertUnchanged();
});

test('incompatible preflight closes its read-only transaction and connection', async () => {
  const f = fixture({ tables: legacyCatalog(), requireTransaction: true });
  await assert.rejects(preflightMysqlLab(env, { openConnection: f.openConnection, requireExisting: true }), /catalogo.*incompatible/i);
  assert.deepEqual(f.events.slice(-2), ['ROLLBACK', 'END']);
  f.assertUnchanged();
});

test('SQL read failure aborts preflight and still cleans up', async () => {
  const f = fixture({ queryFailure: sql => sql.includes('information_schema.TABLES') });
  await assert.rejects(preflightMysqlLab(env, { openConnection: f.openConnection, requireExisting: true }), /injected query failure/);
  assert.deepEqual(f.events.slice(-2), ['ROLLBACK', 'END']);
  f.assertUnchanged();
});

test('an unverified connection aborts before any migration subprocess', async () => {
  const calls = [];
  await assert.rejects(initializeMysqlLab(env, {
    openConnection: async () => { throw new Error('identity mismatch'); },
    runner: (...args) => calls.push(args),
  }), /identity mismatch/);
  assert.equal(calls.length, 0);
});

test('initializer repeats compatibility validation, so a change after preflight cannot bypass the guard', async () => {
  const f = fixture({ requireTransaction: true });
  await preflightMysqlLab(env, { openConnection: f.openConnection, requireExisting: true });
  f.state.tables.Tipo_Producto[0].nombre_producto = 'Changed after preflight';
  const calls = [];
  await assert.rejects(initializeMysqlLab(env, {
    openConnection: f.openConnection, runner: (...args) => calls.push(args),
  }), /catalogo.*incompatible/i);
  assert.equal(calls.length, 0, 'migrate/seed/catalog subprocesses must not start');
  assert.equal(f.events.filter(event => event === 'OPEN').length, 2);
  assert.deepEqual(f.events.slice(-2), ['ROLLBACK', 'END']);
});

test('compatible deployment closes its snapshot before migrate, seed and final catalog verification', async () => {
  const f = fixture({ requireTransaction: true });
  const calls = [];
  const result = await initializeMysqlLab(env, {
    openConnection: f.openConnection,
    runner: (command, args, options) => {
      assert.equal(f.events.at(-1), 'END', 'connection and read-only transaction end before applying migrations');
      calls.push({ command, args, options });
    },
  });
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[0].args.slice(1, 3), ['migrate', 'deploy']);
  assert.deepEqual(calls[1].args.slice(1, 3), ['db', 'seed']);
  assert.match(calls[2].args[0], /mysqlLabCatalogCheck\.mjs$/);
  assert.deepEqual(result.steps, ['migrate deploy', 'db seed', 'catalog check']);
  assert.equal(calls[0].options.env.DB_USER, env.DB_MIGRATION_USER);
  f.assertUnchanged();
});

test('installation still supports empty fresh databases through the shared preflight', async () => {
  const f = fixture({ tables: {}, history: null, requireTransaction: true });
  const calls = [];
  await initializeMysqlLab(env, { openConnection: f.openConnection, runner: (...args) => calls.push(args) });
  assert.equal(calls.length, 3);
  assert.deepEqual(f.events.slice(-2), ['ROLLBACK', 'END']);
  f.assertUnchanged();
});

for (const args of [['--chekc'], ['--check', '--force'], ['--check', '--check']]) {
  test(`unknown CLI arguments ${args.join(' ')} fail before inspecting a database`, () => {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/mysqlDeploy.mjs', import.meta.url)), ...args], {
      encoding: 'utf8', env: { PATH: process.env.PATH }, timeout: 5000,
    });
    assert.notEqual(result.status, 0);
    assert.equal(result.signal, null);
    assert.match(result.stderr, /argumento desconocido, no se ejecutaron migraciones/);
    assert.doesNotMatch(result.stderr, /Configuracion de base de datos|ECONNREFUSED/);
    assert.doesNotMatch(result.stdout, /MYSQL_UPDATE_CHECK|MYSQL_DEPLOY/);
  });
}

test('read-only transaction startup failure still closes the connection and never reaches Prisma', async () => {
  const f = fixture({ queryFailure: sql => sql.startsWith('START TRANSACTION') });
  const calls = [];
  await assert.rejects(initializeMysqlLab(env, {
    openConnection: f.openConnection, runner: (...args) => calls.push(args),
  }), /injected query failure/);
  assert.deepEqual(f.events.slice(-2), ['ROLLBACK', 'END']);
  assert.equal(calls.length, 0);
  f.assertUnchanged();
});

test('rollback failure still closes the connection and prevents migration', async () => {
  const f = fixture({ queryFailure: sql => sql === 'ROLLBACK' });
  const calls = [];
  await assert.rejects(initializeMysqlLab(env, {
    openConnection: f.openConnection, runner: (...args) => calls.push(args),
  }), /injected query failure/);
  assert.equal(f.events.at(-1), 'END');
  assert.equal(calls.length, 0);
  f.assertUnchanged();
});

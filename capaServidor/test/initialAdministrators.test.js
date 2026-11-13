import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { bootstrapInitialAdministrators } from '../src/modules/users/service/initialAdministrators.service.js';
import { INITIAL_ADMINISTRATORS, validateInitialAdministrators } from '../../shared/deploymentValidation.mjs';

const environment = { PUBLIC_ORIGIN: 'https://itecsa.example.test' };
const clone = value => structuredClone(value);

function fixture() {
  const state = { users: [], identities: [], external: [], mappings: new Map(), receipt: null,
    writes: [], passwordWrites: [], calls: [], faults: {} };
  const fault = name => {
    if (!state.faults[name]) return;
    state.faults[name] = false;
    throw Error('Simulated failure: ' + name);
  };
  const prisma = {
    usuario: {
      async findMany() { return clone(state.users); },
      async findUnique({ where }) { return clone(state.users.find(user => user.id_keycloak === where.id_keycloak) ?? null); },
      async create({ data }) { const user = { id_usuario: state.users.length + 1, ...data }; state.users.push(user); return clone(user); },
    },
    externalIdentity: {
      async findMany() { return clone(state.identities); },
      async findUnique({ where }) { return clone(state.identities.find(identity => identity.user_id === where.user_id) ?? null); },
      async create({ data }) { state.identities.push(data); return clone(data); },
    },
    async $transaction(run) {
      const snapshot = clone({ users: state.users, identities: state.identities });
      let result;
      try { result = await run(prisma); }
      catch (error) { Object.assign(state, snapshot); throw error; }
      fault('afterLocalCommit');
      return result;
    },
  };
  const request = async (resource, method = 'GET', body) => {
    const url = new URL(resource, environment.PUBLIC_ORIGIN);
    const path = url.pathname;
    state.calls.push({ method, path });
    if (method !== 'GET') state.writes.push({ method, path });
    if (path === '/clients') return [{ id: 'business', clientId: 'itecsa-api-v1' }];
    const role = /^\/clients\/business\/roles\/(.+)$/.exec(path);
    if (role) return { id: decodeURIComponent(role[1]), name: decodeURIComponent(role[1]) };
    if (path === '/users' && method === 'GET') {
      const field = url.searchParams.has('username') ? 'username' : 'email';
      return clone(state.external.filter(user => user[field] === url.searchParams.get(field)));
    }
    if (path === '/users' && method === 'POST') {
      assert.equal(body.enabled, false, 'accounts must be created disabled');
      const { credentials, ...user } = clone(body);
      const id = randomUUID();
      state.external.push({ id, ...user });
      state.mappings.set(id, []);
      state.passwordWrites.push({ id, credentials });
      if (state.external.length === 2) fault('secondUserResponse');
      fault('userResponse');
      return id;
    }
    const match = /^\/users\/([^/]+)(.*)$/.exec(path);
    assert.ok(match, method + ' ' + resource);
    const [, subject, tail] = match;
    const user = state.external.find(value => value.id === subject);
    assert.ok(user, 'known external subject');
    if (!tail && method === 'GET') return clone(user);
    if (!tail && method === 'PUT') {
      assert.deepEqual(body, { enabled: true }, 'bootstrap never rewrites passwords or identity data');
      assert.equal(state.users.length, 3, 'all three local users exist before any activation');
      assert.equal(state.identities.length, 3, 'all three bindings exist before any activation');
      if (state.faults.activationNotPersisted) { state.faults.activationNotPersisted = false; return; }
      user.enabled = true;
      fault('activationResponse');
      return;
    }
    if (tail === '/role-mappings/clients/business/composite') return clone(state.mappings.get(subject));
    if (tail === '/role-mappings/clients/business' && method === 'POST') {
      state.mappings.set(subject, clone(body));
      fault('roleResponse');
      return;
    }
    throw Error('Unexpected request: ' + method + ' ' + resource);
  };
  const receiptStore = {
    async read() { return clone(state.receipt); },
    async write(receipt) {
      if (receipt.accounts.some(account => account.state === 'prepared')) fault('preparedReceipt');
      state.receipt = clone(receipt);
    },
  };
  return { state, prisma, request, receiptStore, run: (env = environment) => bootstrapInitialAdministrators({ environment: env, prisma, request, receiptStore }) };
}

test('requested usernames, department names and shared temporary password are installation defaults', () => {
  const accounts = validateInitialAdministrators(environment);
  assert.deepEqual(accounts.map(account => account.username), ['ad.produccion', 'ad.cobranzas', 'ad.ventas']);
  assert.ok(accounts.every(account => account.firstName === 'Administrador' && account.temporaryPassword === 'Admin12345.'));
  assert.deepEqual(accounts.map(account => account.lastName), ['Producción', 'Cobranzas', 'Ventas']);
  assert.ok(accounts.every(account => account.email === null && account.rut === null));
  assert.deepEqual(accounts.map(account => account.role), INITIAL_ADMINISTRATORS.map(account => account.role));
});

test('invalid overrides, duplicate usernames and duplicate nonempty personal identifiers fail before creation', async () => {
  for (const overrides of [
    { INITIAL_ADMIN_PRODUCTION_USERNAME: 'invalid username' },
    { INITIAL_ADMIN_PRODUCTION_TEMP_PASSWORD: 'weak' },
    { INITIAL_ADMIN_PRODUCTION_EMAIL: 'invalid-email' },
    { INITIAL_ADMIN_PRODUCTION_RUT: 'invalid-rut' },
    { INITIAL_ADMIN_PRODUCTION_USERNAME: 'ad.ventas' },
    { INITIAL_ADMIN_PRODUCTION_EMAIL: 'same@example.test', INITIAL_ADMIN_SALES_EMAIL: 'SAME@example.test' },
    { INITIAL_ADMIN_PRODUCTION_RUT: '11.111.111-1', INITIAL_ADMIN_SALES_RUT: '11111111-1' },
  ]) {
    const f = fixture();
    await assert.rejects(f.run({ ...environment, ...overrides }), /INITIAL_ADMIN/);
    assert.deepEqual(f.state.writes, []);
    assert.equal(f.state.receipt, null);
  }
});

test('bootstrap prepares exactly three administrators, binds local identities, and requires a new password', async () => {
  const f = fixture();
  assert.deepEqual(await f.run(), { created: 3, existing: 0 });
  assert.equal(f.state.external.length, 3);
  assert.equal(f.state.users.length, 3);
  assert.equal(f.state.identities.length, 3);
  assert.ok(f.state.external.every(user => user.enabled && user.requiredActions.includes('UPDATE_PASSWORD')));
  assert.ok(f.state.users.every(user => user.estado_usuario === 'Pendiente' && user.correo_usuario === null && user.rut_usuario === null));
  assert.deepEqual(f.state.users.map(user => user.rol_usuario), INITIAL_ADMINISTRATORS.map(account => account.role));
  for (const [index, entry] of f.state.receipt.accounts.entries()) {
    assert.equal(entry.state, 'complete');
    assert.deepEqual(f.state.mappings.get(entry.subject).map(role => role.name), [INITIAL_ADMINISTRATORS[index].role]);
    assert.equal(f.state.identities[index].subject, entry.subject);
    assert.equal(f.state.identities[index].user_id, entry.localUserId);
  }
  assert.equal(f.state.receipt.state, 'complete');
  assert.equal(f.state.passwordWrites.length, 3);
  assert.ok(f.state.passwordWrites.every(write => write.credentials.length === 1 && write.credentials[0].temporary === true
    && write.credentials[0].value === 'Admin12345.'));
  assert.doesNotMatch(JSON.stringify(f.state.receipt), /Admin12345\.|temporaryPassword|credentials|pin/i);
});

test('completed bootstrap is a no-op after credentials, profile, roles and states have changed', async () => {
  const f = fixture();
  await f.run();
  f.state.users[0].estado_usuario = 'Desvinculado';
  f.state.users[1].rol_usuario = 'Operario Ventas';
  f.state.external[0].enabled = false;
  const writes = f.state.writes.length;
  const calls = f.state.calls.length;
  const before = clone({ users: f.state.users, external: f.state.external });
  assert.deepEqual(await f.run({ ...environment, INITIAL_ADMIN_PRODUCTION_TEMP_PASSWORD: 'Changed12345!' }), { created: 0, existing: 3 });
  assert.equal(f.state.writes.length, writes);
  assert.equal(f.state.calls.length, calls);
  assert.deepEqual({ users: f.state.users, external: f.state.external }, before);
});

for (const point of ['userResponse', 'secondUserResponse', 'roleResponse', 'afterLocalCommit', 'preparedReceipt', 'activationResponse', 'activationNotPersisted']) {
  test('resume recovers ' + point + ' without duplicating users, bindings, roles or passwords', async () => {
    const f = fixture();
    f.state.faults[point] = true;
    await assert.rejects(f.run());
    if (!point.startsWith('activation')) assert.ok(f.state.external.every(user => user.enabled === false));
    await f.run();
    assert.equal(f.state.external.length, 3);
    assert.equal(f.state.users.length, 3);
    assert.equal(f.state.identities.length, 3);
    assert.equal(f.state.passwordWrites.length, 3);
    assert.equal(f.state.receipt.state, 'complete');
    assert.ok(f.state.external.every(user => user.enabled));
  });
}

test('an existing installation or lost receipt is never treated as an empty initial installation', async () => {
  const f = fixture();
  f.state.users.push({ id_usuario: 9, id_keycloak: randomUUID() });
  await assert.rejects(f.run(), { code: 'INITIAL_INSTALLATION_REQUIRED' });
  assert.deepEqual(f.state.writes, []);
  const completed = fixture();
  await completed.run();
  completed.state.receipt = null;
  const writes = completed.state.writes.length;
  await assert.rejects(completed.run(), { code: 'INITIAL_INSTALLATION_REQUIRED' });
  assert.equal(completed.state.writes.length, writes);
});

test('resume preserves a first login and profile update after losing an activation response', async () => {
  const f = fixture();
  f.state.faults.activationResponse = true;
  await assert.rejects(f.run());
  f.state.external[0].email = 'real-user@example.test';
  f.state.external[0].requiredActions = [];
  f.state.users[0].estado_usuario = 'Activo';
  await f.run();
  assert.equal(f.state.receipt.state, 'complete');
  assert.equal(f.state.external[0].email, 'real-user@example.test');
  assert.deepEqual(f.state.external[0].requiredActions, []);
  assert.equal(f.state.users[0].estado_usuario, 'Activo');
  assert.equal(f.state.passwordWrites.length, 3);
});

test('existing remote users are not adopted, overwritten or granted roles', async () => {
  const f = fixture();
  f.state.external.push({ id: randomUUID(), username: 'ad.produccion', enabled: true });
  await assert.rejects(f.run(), { code: 'ACCOUNT_ALREADY_EXISTS' });
  assert.deepEqual(f.state.writes, []);
  assert.equal(f.state.receipt, null);
});

test('changed pending configuration and foreign provisioning markers stop resume without overwrites', async () => {
  const f = fixture();
  f.state.faults.userResponse = true;
  await assert.rejects(f.run());
  const writes = f.state.writes.length;
  await assert.rejects(f.run({ ...environment, INITIAL_ADMIN_PRODUCTION_TEMP_PASSWORD: 'Different123!' }), { code: 'RESUME_REQUIRES_ORIGINAL_CONFIGURATION' });
  assert.equal(f.state.writes.length, writes);
  f.state.external[0].attributes.itecsa_provision_id = [randomUUID()];
  await assert.rejects(f.run(), { code: 'IDENTITY_CONFLICT' });
  assert.equal(f.state.writes.length, writes);
});

test('a conflicting remote role is rejected instead of replaced', async () => {
  const f = fixture();
  f.state.faults.userResponse = true;
  await assert.rejects(f.run());
  f.state.mappings.set(f.state.external[0].id, [{ id: 'Soporte', name: 'Soporte' }]);
  const writes = f.state.writes.length;
  await assert.rejects(f.run(), { code: 'ROLE_CONFLICT' });
  assert.equal(f.state.writes.length, writes);
  assert.equal(f.state.external[0].enabled, false);
});

test('a missing local binding prevents activation of a previously prepared account', async () => {
  const f = fixture();
  f.state.faults.activationNotPersisted = true;
  await assert.rejects(f.run(), { code: 'ACTIVATION_NOT_CONFIRMED' });
  f.state.identities.shift();
  await assert.rejects(f.run(), { code: 'LOCAL_IDENTITY_CONFLICT' });
  assert.ok(f.state.external.every(user => !user.enabled));
});

test('an invalid receipt is not accepted as proof that the installation is complete', async () => {
  const f = fixture();
  f.state.receipt = { state: 'complete', accounts: [] };
  await assert.rejects(f.run(), { code: 'INVALID_RECEIPT' });
  assert.deepEqual(f.state.writes, []);
});

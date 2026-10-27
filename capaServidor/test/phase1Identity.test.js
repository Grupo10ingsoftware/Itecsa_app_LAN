import test from 'node:test';
import assert from 'node:assert/strict';
import { UserRepository } from '../src/modules/users/repo/users.repo.js';
import { createRequireActiveIdentity } from '../src/middlewares/requireActiveIdentity.js';
import MessageService from '../src/modules/messages/service/message.service.js';
import MessageController from '../src/modules/messages/controller/message.controller.js';
import { ROLES, ROLES_CLAIM } from '../../shared/authorization.js';

const issuer = 'https://identity.example/realms/test';
const actor = (sub = 'alice', id = 1) => ({ idUsuario: id, identitySubject: sub,
  correoUsuario: null, rutUsuario: null, nombreUsuario: 'María 漢字', apellidoUsuario: 'Muñoz',
  rolUsuario: ROLES.PRODUCCION, estadoUsuario: 'Activo' });
function request(sub = 'alice') {
  return { identityProvider: 'keycloak', auth: { payload: { sub, [ROLES_CLAIM]: [ROLES.PRODUCCION], permissions: [] } } };
}
function response() {
  return { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(value) { this.body = value; return this; } };
}

test('identity JOIN binds provider/issuer/subject, preserves nulls, Unicode and numeric IDs', async t => {
  const previous = process.env.KEYCLOAK_ISSUER;
  process.env.KEYCLOAK_ISSUER = issuer;
  t.after(() => { if (previous === undefined) delete process.env.KEYCLOAK_ISSUER; else process.env.KEYCLOAK_ISSUER = previous; });
  const subject = "x' OR 1=1 --";
  let calls = 0;
  const user = actor(subject);
  const repo = new UserRepository({ prisma: { $queryRaw: async (sql, ...values) => {
    calls++;
    assert.deepEqual(values, ['keycloak', issuer, subject]);
    assert.ok(sql.raw);
    assert.ok(!sql.join('?').includes(subject));
    assert.match(sql.join('?'), /INNER JOIN Usuario u ON u.id_usuario = e.user_id/);
    return [user];
  } } });
  assert.deepEqual(await repo.findBySubject(subject), user);
  assert.equal(calls, 1);
  for (const invalid of ['', null, 'x'.repeat(129)]) {
    await assert.rejects(repo.findBySubject(invalid), { code: 'USER_REPOSITORY_ERROR' });
  }
  assert.equal(calls, 1);
  assert.equal(await new UserRepository({ prisma: { $queryRaw: async () => [] } }).findBySubject('missing'), null);
  for (const code of ['P1001', 'P1002', 'P2010']) {
    await assert.rejects(new UserRepository({ prisma: { $queryRaw: async () => { throw { code }; } } }).findBySubject('alice'),
      { code: 'USER_REPOSITORY_ERROR' });
  }
});

for (const [name, user] of [
  ['removed or missing binding', null], ['inconsistent subject', actor('other')],
  ['disabled', { ...actor(), estadoUsuario: 'Desvinculado' }],
  ['updating', { ...actor(), estadoUsuario: 'Actualizando:test' }],
  ['changed role', { ...actor(), rolUsuario: ROLES.VENTAS }],
]) {
  test(`middleware refuses ${name}`, async () => {
    const req = request(), res = response();
    await createRequireActiveIdentity({ repository: { findBySubject: async () => user } })(req, res, () => assert.fail());
    assert.equal(res.statusCode, 403);
    assert.equal(req.currentUser, undefined);
  });
}
test('middleware preserves first-access revalidation and rejects revocation during activation', async () => {
  for (const active of [actor(), null, { ...actor(), estadoUsuario: 'Desvinculado' }, actor('other')]) {
    const events = [], req = request(), res = response();
    await createRequireActiveIdentity({ repository: {
      findBySubject: async () => { events.push('lookup'); return { ...actor(), estadoUsuario: 'Pendiente' }; },
      activateOnFirstAccess: async (sub, role) => { assert.equal(sub, 'alice'); assert.equal(role, ROLES.PRODUCCION); events.push('activate/recheck'); return active; },
    } })(req, res, () => events.push('next'));
    assert.deepEqual(events.slice(0, 2), ['lookup', 'activate/recheck']);
    assert.equal(res.statusCode, active?.estadoUsuario === 'Activo' && active.identitySubject === 'alice' ? 200 : 403);
  }
});
test('middleware validates provider, roles, permissions and missing sessions before lookup', async () => {
  for (const change of [r => { r.identityProvider = 'other'; }, r => { r.auth.payload.permissions = [1]; },
    r => { r.auth.payload[ROLES_CLAIM] = []; }, r => { delete r.auth; }]) {
    const req = request(), res = response(); change(req);
    await createRequireActiveIdentity({ repository: { findBySubject: () => assert.fail() } })(req, res, () => assert.fail());
    assert.ok([401, 403].includes(res.statusCode));
  }
  const res = response();
  await createRequireActiveIdentity({ repository: { findBySubject: async () => { throw Error('sensitive'); } } })(request(), res, () => assert.fail());
  assert.equal(res.statusCode, 503);
  assert.ok(!JSON.stringify(res.body).includes('sensitive'));
});

test('all six message operations reuse only the separately supplied current request actor', async () => {
  const ids = [];
  const record = { leido: false, oculto: false };
  const repo = Object.fromEntries(['listNotifications', 'countUnreadNotifications', 'findUserMessage', 'markAsRead',
    'hideNotification', 'hideAllNotifications'].map(name => [name, async id => { ids.push(id); return name === 'hideAllNotifications' ? { count: 1 } : record; }]));
  repo.listInbox = async options => { ids.push(options.userId); return record; };
  const service = new MessageService({ repo, userRepo: { findBySubject: () => assert.fail('duplicate lookup') } });
  const context = { currentUser: actor() };
  await service.getInbox('alice', {}, context);
  await service.getNotifications('alice', {}, context);
  await service.getMessage('alice', 10, context);
  await service.markAsRead('alice', 10, context);
  await service.hideNotification('alice', 10, context);
  await service.clearNotifications('alice', context);
  assert.ok(ids.length >= 6 && ids.every(id => id === 1));
  for (const currentUser of [actor('bob', 2), null, { ...actor(), idUsuario: -1 }, { ...actor(), estadoUsuario: 'Desvinculado' }]) {
    await assert.rejects(service.getInbox('alice', {}, { currentUser }), { statusCode: 403 });
  }
  await assert.rejects(service.getInbox(null, {}, context), { statusCode: 401 });
});
test('non-HTTP message callers still resolve identity and preserve missing user errors', async () => {
  let lookups = 0;
  const service = new MessageService({ repo: { listInbox: async ({ userId }) => userId },
    userRepo: { findBySubject: async sub => { lookups++; return sub === 'alice' ? actor() : null; } } });
  assert.equal(await service.getInbox('alice'), 1);
  await assert.rejects(service.getInbox('missing'), { statusCode: 404 });
  assert.equal(lookups, 2);
});
test('controller uses req.currentUser and never actor fields from body or query', async () => {
  const operations = ['getInbox', 'getNotifications', 'getMessage', 'markAsRead', 'hideNotification', 'clearNotifications'];
  const service = Object.fromEntries(operations.map(name => [name, async (...args) => {
    assert.equal(args[0], 'alice');
    assert.equal(args.at(-1).currentUser.idUsuario, 1);
    return {};
  }]));
  const controller = new MessageController({ service });
  for (const name of operations) {
    await controller[name]({ ...request(), currentUser: actor(), params: { messageId: 10 },
      body: { currentUser: actor('bob', 2) }, query: { currentUser: actor('bob', 2) } }, response());
  }
});
test('message ownership remains enforced with a reused actor', async () => {
  const service = new MessageService({ repo: { findUserMessage: async (id, message) => {
    assert.equal(id, 1); assert.equal(message, 20); return null;
  }, markAsRead: () => assert.fail(), hideNotification: () => assert.fail() }, userRepo: {} });
  for (const name of ['getMessage', 'markAsRead', 'hideNotification']) {
    await assert.rejects(service[name]('alice', 20, { currentUser: actor() }), { statusCode: 404 });
  }
});
test('parallel and subsequent requests resolve separately; revocation and role changes cannot use an earlier actor', async () => {
  let lookups = 0;
  const states = new Map([['alice', actor()], ['bob', actor('bob', 2)]]);
  const middleware = createRequireActiveIdentity({ repository: { findBySubject: async sub => {
    lookups++; await new Promise(resolve => setImmediate(resolve)); return states.get(sub);
  } } });
  const service = new MessageService({ repo: { listInbox: async ({ userId }) => userId }, userRepo: { findBySubject: () => assert.fail() } });
  async function run(sub) {
    const req = request(sub), res = response();
    await middleware(req, res, async () => {});
    return res.statusCode === 200 ? service.getInbox(sub, {}, { currentUser: req.currentUser }) : res.statusCode;
  }
  assert.deepEqual(await Promise.all(['alice', 'bob', 'alice', 'bob'].map(run)), [1, 2, 1, 2]);
  states.set('alice', { ...actor(), estadoUsuario: 'Desvinculado' });
  assert.equal(await run('alice'), 403);
  states.set('bob', { ...actor('bob', 2), rolUsuario: ROLES.VENTAS });
  assert.equal(await run('bob'), 403);
  assert.equal(lookups, 6);
});

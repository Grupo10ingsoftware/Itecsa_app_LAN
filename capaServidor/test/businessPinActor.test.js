import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';

import { PinService } from '../src/modules/auth/service/pin.service.js';
import { createRequirePin } from '../src/middlewares/requirePin.js';
import { createOrderRouter } from '../src/modules/orders/routes/order.routes.js';
import OrderController from '../src/modules/orders/controller/orders.controller.js';
import { MemoryThrottleService } from '../src/modules/security/service/securityThrottle.service.js';
import { PERMISSIONS as P, ROLES, ROLE_PERMISSIONS, ROLES_CLAIM } from '../../shared/authorization.js';

const ISSUER = 'https://pin-test.invalid';

async function fixture(t) {
  const previous = process.env.KEYCLOAK_ISSUER;
  process.env.KEYCLOAK_ISSUER = ISSUER;
  t.after(() => { if (previous === undefined) delete process.env.KEYCLOAK_ISSUER; else process.env.KEYCLOAK_ISSUER = previous; });

  const users = [];
  const tx = {
    $queryRaw: async (sql, ...values) => {
      const query = sql.join('?');
      if (query.includes('u.pin_fingerprint')) {
        const [fingerprint, provider, issuer] = values;
        return users.filter(user => user.pin_fingerprint === fingerprint && user.provider === provider && user.issuer === issuer);
      }
      const [provider, issuer, subject] = values;
      return users.filter(user => user.provider === provider && user.issuer === issuer && user.subject === subject);
    },
    usuario: { update: async ({ where, data }) => {
      Object.assign(users.find(user => user.id_usuario === where.id_usuario), data);
    } },
  };
  const pins = new PinService({ secret: Buffer.alloc(32, 23).toString('base64'), prisma: { $transaction: callback => callback(tx) } });
  async function add(id, subject, role) {
    let credential;
    do { credential = await pins.buildCredential(); }
    while (users.some(user => user.pin_fingerprint === credential.data.pin_fingerprint));
    users.push({ id_usuario: id, subject, provider: 'keycloak', issuer: ISSUER,
      nombre_usuario: subject, rol_usuario: role, estado_usuario: 'Activo',
      ...credential.data, pin_accepted_at: new Date() });
    return credential.pin;
  }
  const aPin = await add(1, 'alfa', ROLES.PRODUCCION);
  const bPin = await add(2, 'beta', ROLES.PRODUCCION);
  const cPin = await add(3, 'cobranzas', ROLES.COBRANZAS);
  return { pins, users, aPin, bPin, cPin };
}

test('business PIN resolves its owner independently of the session and checks the owner role', async t => {
  const f = await fixture(t);
  const actor = await f.pins.validateForPermission('alfa', f.bPin, P.UPDATE_SUBPROCESSES);
  assert.equal(actor.idUsuario, 2);
  assert.equal(actor.rolUsuario, ROLES.PRODUCCION);
  assert.ok(actor.permissions.includes(P.UPDATE_SUBPROCESSES));
  assert.equal((await f.pins.validateForPermission('alfa', f.aPin, P.UPDATE_SUBPROCESSES)).idUsuario, 1);
  await assert.rejects(f.pins.validateForPermission('cobranzas', f.bPin, P.UPDATE_PAYMENT_STATUS), { code: 'PIN_ACTOR_FORBIDDEN' });
  assert.equal((await f.pins.validateForPermission('cobranzas', f.cPin, P.UPDATE_PAYMENT_STATUS)).idUsuario, 3);
  assert.equal(f.users.find(user => user.id_usuario === 2).pin_failed_attempts, 0);
});

test('business PIN rejects inactive, unacknowledged and locked owners', async t => {
  const f = await fixture(t);
  const owner = f.users.find(user => user.id_usuario === 2);
  owner.estado_usuario = 'Desvinculado';
  await assert.rejects(f.pins.validateForPermission('alfa', f.bPin, P.UPDATE_SUBPROCESSES), { code: 'PIN_USER_UNAVAILABLE' });
  owner.estado_usuario = 'Activo'; owner.pin_accepted_at = null;
  await assert.rejects(f.pins.validateForPermission('alfa', f.bPin, P.UPDATE_SUBPROCESSES), { code: 'PIN_NOT_ACKNOWLEDGED' });
  owner.pin_accepted_at = new Date(); owner.pin_locked_until = new Date(Date.now() + 60_000);
  await assert.rejects(f.pins.validateForPermission('alfa', f.bPin, P.UPDATE_SUBPROCESSES), { code: 'PIN_LOCKED' });
});

test('HTTP business actions use the PIN owner; session and owner capabilities both gate the write', async t => {
  const f = await fixture(t);
  const throttle = new MemoryThrottleService();
  const writes = [];
  const app = express();
  app.locals.errorLogger = { error() {} };
  app.use(express.json());
  const authenticate = (req, _res, next) => {
    const role = req.get('authorization') === 'collections' ? ROLES.COBRANZAS : ROLES.PRODUCCION;
    req.identityProvider = 'keycloak';
    req.auth = { payload: { sub: role === ROLES.COBRANZAS ? 'cobranzas' : 'alfa',
      [ROLES_CLAIM]: [role], permissions: ROLE_PERMISSIONS[role] } };
    next();
  };
  const controller = {
    completeSubprocess: (req, res) => {
      writes.push({ action: 'subprocess', actor: req.pinActor.idUsuario, role: req.pinActor.rolUsuario, pinRemoved: req.body.pin === undefined });
      res.json({ ok: true });
    },
    updatePaymentStatus: (req, res) => {
      writes.push({ action: 'payment', actor: req.pinActor.idUsuario, role: req.pinActor.rolUsuario, pinRemoved: req.body.pin === undefined });
      res.json({ ok: true });
    },
  };
  app.use('/orders', createOrderRouter({ authenticate, controller,
    validateBusinessPin: permission => createRequirePin({ pins: f.pins, permission, throttle }) }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const send = (path, session, pin) => fetch(`http://127.0.0.1:${server.address().port}/orders${path}`, {
    method: 'PATCH', headers: { authorization: session, 'content-type': 'application/json' }, body: JSON.stringify({ pin }),
  });
  const subprocess = '/1/details/1/subprocesses/1/complete';
  assert.equal((await send(subprocess, 'production', f.bPin)).status, 200);
  assert.deepEqual(writes.at(-1), { action: 'subprocess', actor: 2, role: ROLES.PRODUCCION, pinRemoved: true });
  assert.equal((await send('/1/payment-status', 'collections', f.bPin)).status, 403);
  assert.equal(writes.length, 1);
  assert.equal((await send('/1/payment-status', 'collections', f.cPin)).status, 200);
  assert.deepEqual(writes.at(-1), { action: 'payment', actor: 3, role: ROLES.COBRANZAS, pinRemoved: true });
  assert.equal((await send('/1/payment-status', 'production', f.cPin)).status, 403);
  assert.equal(writes.length, 2);

  let invalid = '999999';
  while ([f.aPin, f.bPin, f.cPin].includes(invalid)) invalid = String(Number(invalid) - 1).padStart(6, '0');
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await send(subprocess, 'production', invalid);
    assert.equal(response.status, 403);
  }
  assert.equal((await send(subprocess, 'production', f.bPin)).status, 429);
  assert.equal(writes.length, 2);
});

test('payment revision and production transition checks receive the PIN owner role, not the session role', async () => {
  const options = [];
  const controller = new OrderController({ service: {
    updPaymentState: async (_id, _state, context) => { options.push(context); return { id_pedido: 1 }; },
    updGeneralStep: async (_id, _step, context) => { options.push(context); return { id_pedido: 1 }; },
  } });
  const actor = { idUsuario: 3, rolUsuario: ROLES.COBRANZAS, permissions: ROLE_PERMISSIONS[ROLES.COBRANZAS] };
  const req = { params: { orderId: '1' }, body: { paymentStatusId: 2, generalStepId: 2 },
    identityProvider: 'keycloak', pinActor: actor,
    auth: { payload: { sub: 'administrator', [ROLES_CLAIM]: [ROLES.ADMIN_COBRANZAS],
      permissions: ROLE_PERMISSIONS[ROLES.ADMIN_COBRANZAS] } } };
  const res = { status() { return this; }, json() { return this; } };
  await controller.updatePaymentStatus(req, res);
  await controller.updateGeneralStep(req, res);
  assert.equal(options.length, 2);
  for (const context of options) {
    assert.equal(context.actor.idUsuario, 3);
    assert.equal(context.role, ROLES.COBRANZAS);
    assert.deepEqual(context.permissions, ROLE_PERMISSIONS[ROLES.COBRANZAS]);
  }
  assert.ok(!options[0].permissions.includes(P.REVISE_PAYMENT_STATUS));
  assert.ok(!options[1].permissions.includes(P.START_PRODUCTION));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { hasValidProductionSchedule, PRODUCTION_SCHEDULE_REQUIRED_MESSAGE as message } from '../../shared/productionScheduling.js';
import { updGeneralStepOperation } from '../src/modules/orders/service/orderProduction.service.js';
import { updateGeneralStepOperation, transitionGeneralStageOperation } from '../src/modules/orders/repo/orderStageOperations.js';
import { getTransitionStateOperation } from '../src/modules/orders/repo/orderReadOperations.js';
import OrderController from '../src/modules/orders/controller/orders.controller.js';
import { createOrderRouter } from '../src/modules/orders/routes/order.routes.js';
import { createRequirePin } from '../src/middlewares/requirePin.js';
import { AppError } from '../src/errors/AppError.js';
import { ROLES, ROLES_CLAIM, PERMISSIONS as P } from '../../shared/authorization.js';
const options = { actor: { idUsuario: 9 }, role: ROLES.ADMINISTRADOR, identityProvider: 'keycloak', permissions: [P.MOVE_ORDERS, P.START_PRODUCTION] };
const validDate = new Date('2026-10-29T00:00:00Z');
function fixture(date = validDate) {
 const state = { id_pedido: 1, id_estado_pedido: 2, id_estado_pago: 2, id_etapa_general: 1, estado_pago: 'Confirmado', fecha_estimada_termino: date };
 const events = []; let locked = false;
 const repo = {
  getTransitionState: async () => { events.push(locked ? 'locked-read' : 'read'); return { ...state }; },
  lockProductionOrder: async () => { locked = true; events.push('lock'); },
  client: {
   estado_Pedido: { findFirst: async () => ({ id_estado_pedido: 3, orden_kanban: 2, nombre_etapa: 'En produccion' }) },
   pedidos: { updateMany: async ({ where, data }) => {
    assert.equal(locked, true);
    if (where.id_estado_pedido !== state.id_estado_pedido || where.id_estado_pago !== state.id_estado_pago) return { count: 0 };
    state.id_estado_pedido = data.id_estado_pedido; state.id_etapa_general = 2; events.push('write'); return { count: 1 };
   } },
   registros: { create: async () => { events.push('audit'); return { ID_REGISTRO: 1 }; } },
   registro_Etapas: { updateMany: async () => events.push('close-stage'), create: async () => events.push('stage') },
  },
 };
 repo.transitionGeneralStage = input => transitionGeneralStageOperation(repo, input);
 repo.updateGeneralStep = (...args) => updateGeneralStepOperation(repo, ...args);
 const service = { repo, runInTransaction: async callback => { events.push('transaction'); return callback({ repo }); } };
 service.updGeneralStep = (...args) => updGeneralStepOperation(service, ...args);
 return { repo, service, state, events };
}
for (const value of [null, undefined, '', 'invalid', '2026-02-30', '2026-10-31', new Date('invalid')]) test(`missing/invalid calendar date blocks without stage, audit or transaction writes: ${value}`, async () => {
 const f = fixture(value); f.state.fecha_estimada_termino = value;
 await assert.rejects(f.service.updGeneralStep(1, 2, options), { statusCode: 409, code: 'PRODUCTION_SCHEDULE_REQUIRED', message });
 assert.equal(f.state.id_etapa_general, 1); assert.deepEqual(f.events, ['read']);
});
test('estimated line delivery does not schedule the order', async () => {
 const f = fixture(null); f.state.Detalle_pedido = [{ fecha_estimada_termino: validDate }];
 await assert.rejects(f.service.updGeneralStep(1, 2, options), { code: 'PRODUCTION_SCHEDULE_REQUIRED' });
 assert.deepEqual(f.events, ['read']);
});
test('valid calendar date follows the locked transition and existing audit flow', async () => {
 const f = fixture(); await f.service.updGeneralStep(1, 2, options);
 assert.equal(f.state.id_etapa_general, 2);
 assert.deepEqual(f.events, ['read', 'transaction', 'lock', 'locked-read', 'write', 'close-stage', 'audit', 'stage']);
});
test('revalidates date inside transaction before any writes if schedule changed after service read', async () => {
 const f = fixture(); f.service.runInTransaction = callback => { f.state.fecha_estimada_termino = null; return callback({ repo: f.repo }); };
 await assert.rejects(f.service.updGeneralStep(1, 2, options), { code: 'PRODUCTION_SCHEDULE_REQUIRED' });
 assert.deepEqual(f.events, ['read', 'lock', 'locked-read']); assert.equal(f.state.id_etapa_general, 1);
});
test('repository rejects an unscheduled start even without the service precheck', async () => {
 const f = fixture(null);
 await assert.rejects(f.repo.updateGeneralStep(1, 2, { userId: 9 }), { code: 'PRODUCTION_SCHEDULE_REQUIRED' });
 assert.deepEqual(f.events, ['lock', 'locked-read']); assert.equal(f.state.id_etapa_general, 1);
});
test('payment, start permission and PIN actor guards retain priority', async () => {
 const f = fixture(null);
 await assert.rejects(f.service.updGeneralStep(1, 2, { ...options, permissions: [] }), { statusCode: 403 });
 await assert.rejects(f.service.updGeneralStep(1, 2, { ...options, actor: null }), { statusCode: 403 });
 f.state.estado_pago = 'Pendiente';
 await assert.rejects(f.service.updGeneralStep(1, 2, options), { code: 'PAYMENT_CONFIRMATION_REQUIRED' });
 assert.equal(f.events.every(event => event === 'read'), true);
});
test('transition read exposes the actual order-level calendar date', async () => {
 const result = await getTransitionStateOperation({ client: { $queryRaw: async query => {
  assert.match(query.join(''), /p.fecha_estimada_termino/);
  return [{ id_pedido: 1, orden_kanban: 1, fecha_estimada_termino: validDate }];
 } } }, 1);
 assert.equal(result.fecha_estimada_termino, validDate);
});
test('shared date validation accepts persisted dates and ISO DTOs, rejects impossible dates and weekends', () => {
 for (const date of [validDate, '2026-10-29', '2026-10-29T00:00:00.000Z']) assert.equal(hasValidProductionSchedule(date), true);
 for (const date of ['2026-02-30', '2026-10-31', '2026-11-01', '2026-10-29T99:00:00Z', 1, {}, '2026-10-29junk']) assert.equal(hasValidProductionSchedule(date), false);
});
test('direct HTTP move cannot bypass programming, permissions or PIN, and never writes on rejection', async t => {
 const f = fixture(null); const app = express(); app.use(express.json()); app.locals.errorLogger = { error() {} };
 const authenticate = (req, _res, next) => {
  req.identityProvider = 'keycloak'; req.auth = { payload: { sub: 'synthetic', [ROLES_CLAIM]: [ROLES.ADMINISTRADOR],
   permissions: req.get('authorization') === 'denied' ? [] : [P.MOVE_ORDERS, P.START_PRODUCTION] } }; next();
 };
 app.use(createOrderRouter({ authenticate, controller: new OrderController({ service: f.service }),
  validatePin: createRequirePin({ pins: { validate: async (_sub, pin) => { if (pin !== '123456') throw new AppError(403, 'PIN inválido', 'PIN_INVALID'); return options.actor; } } }) }));
 const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
 t.after(() => { server.closeAllConnections(); server.close(); });
 const move = (authorization = 'allowed', pin = '123456') => fetch(`http://127.0.0.1:${server.address().port}/1/move`, {
  method: 'PATCH', headers: { authorization, 'content-type': 'application/json' }, body: JSON.stringify({ generalStepId: 2, pin, dueDate: '2026-10-29' }),
 });
 const response = await move(); assert.equal(response.status, 409); assert.equal((await response.json()).message, message);
 assert.equal((await move('denied')).status, 403); assert.equal((await move('allowed', '')).status, 403);
 assert.deepEqual(f.events, ['read']); assert.equal(f.state.id_etapa_general, 1);
});

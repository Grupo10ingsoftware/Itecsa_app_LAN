import assert from 'node:assert/strict';
import { test } from 'node:test';
import ClientService from '../src/modules/clients/service/clients.service.js';
import SalesOrderCreationService from '../src/modules/orders/service/salesOrderCreation.service.js';
import { createVerifyAuthSessionHandler } from '../src/modules/auth/controller/auth.controller.js';
import { isUniqueConstraint } from '../src/database/uniqueConstraint.js';

const adapterError = (modelName, index) => Object.assign(Error('private SQL details'), { code: 'P2002',
  meta: { modelName, driverAdapterError: { cause: { constraint: { index } } } } });
const source = { numeroNota: '42', cliente: { rut: '11111111-1', nombre: 'Synthetic' }, origen: {},
  items: [{ tipoProducto: 'Tarjeta', cantidad: 1, producto: 'Synthetic Card' }], itemsSinSeguimientoProductivo: [] };

test('concurrent client RUT creation is a controlled conflict; unrelated SQL errors retain their identity', async () => {
  const conflict = adapterError('Cliente', 'rut_cliente_UNIQUE');
  const make = error => new ClientService({ repo: { async getByRut() { return null; }, async create() { throw error; } } });
  await assert.rejects(make(conflict).findOrCreateClient({ rut_cliente: '11111111-1' }),
    error => error.statusCode === 409 && error.code === 'CLIENT_CREATE_CONFLICT' && !error.message.includes('private SQL'));
  const other = adapterError('Cliente', 'unrelated_UNIQUE');
  await assert.rejects(make(other).findOrCreateClient({ rut_cliente: '11111111-1' }), error => error === other);
});

test('Prisma adapter index metadata preserves the duplicate sales-note 409 contract', async () => {
  const error = adapterError('Pedidos', 'Pedidos_numero_nota_venta_UNIQUE');
  const service = new SalesOrderCreationService({ source: { async getByNumber() { return source; } },
    runInTransaction: async () => { throw error; } });
  await assert.rejects(service.create({ numeroNota: '42' }, { actorId: 1 }), failure => failure.statusCode === 409);
  const unknown = adapterError('Pedidos', 'unrelated_UNIQUE');
  const failing = new SalesOrderCreationService({ source: { async getByNumber() { return source; } },
    runInTransaction: async () => { throw unknown; } });
  await assert.rejects(failing.create({ numeroNota: '42' }, { actorId: 1 }), failure => failure === unknown);
});

test('constraint matching accepts historical formats and rejects other models, multi-column and nonunique errors', () => {
  const expected = { model: 'Pedidos', index: 'Pedidos_numero_nota_venta_UNIQUE', field: 'numero_nota_venta' };
  for (const target of [expected.index, expected.field, [expected.field]]) {
    assert.equal(isUniqueConstraint({ code: 'P2002', meta: { target } }, expected), true);
  }
  for (const error of [
    { code: 'P2002', meta: { target: [expected.field, 'another'] } },
    { code: 'P2002', meta: { modelName: 'OtherModel', target: expected.index } },
    { code: 'P2034', meta: { target: expected.index } },
    { code: 'P2002' },
  ]) assert.equal(isUniqueConstraint(error, expected), false);
});

test('verify uses validated local contact for Keycloak and preserves the Auth0 claim contract', async () => {
  const handler = createVerifyAuthSessionHandler();
  for (const [provider, expected] of [['keycloak', 'local@example.invalid'], ['auth0', 'claim@example.invalid']]) {
    const response = { status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await handler({ identityProvider: provider, currentUser: { correoUsuario: 'local@example.invalid' },
      auth: { payload: { sub: 'synthetic', 'https://itecsa.local/roles': ['Operario Ventas'],
        'https://itecsa.local/email': 'claim@example.invalid', permissions: ['read:own-profile'] } } }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.email, expected);
  }
});

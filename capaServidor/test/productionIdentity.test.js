import assert from 'node:assert/strict';
import { test } from 'node:test';
import OrderRepository from '../src/modules/orders/repo/orders.repo.js';

test('revisión obtiene destinatario de persistencia cuando el DTO público omite id_usuario', async () => {
  const events = [];
  const repository = new OrderRepository({ prisma: {
    pedidos: { async findUnique(query) {
      assert.deepEqual(query, { where: { id_pedido: 101 }, select: { id_usuario: true } });
      return { id_usuario: 77 };
    } },
    mensaje: { async create({ data }) { events.push(['message', data]); return { id_mensaje: 42 }; } },
    mENSAJE_USUARIO: { async create({ data }) { events.push(['recipient', data]); } },
  } });
  repository.transitionGeneralStage = async options => {
    assert.equal(options.userId, 23, 'Actor auditado conserva su identidad');
    return { id_pedido: 101, numero_nota_venta: 'NV-101' };
  };
  const result = await repository.sendToReview(101, { userId: 23, comment: 'Revisar datos' });
  assert.equal(events.length, 2);
  assert.equal(events[0][1].id_pedido, 101);
  assert.match(events[0][1].contenido, /Revisar datos/);
  assert.deepEqual(events[1][1], { id_usuario: 77, id_mensaje: 42, leido_: false, oculto_: false });
  assert.equal(Object.hasOwn(result, 'id_usuario'), false, 'El DTO público no se amplía');
});

test('revisión sin transición no consulta ni envía un destinatario', async () => {
  const repository = new OrderRepository({ prisma: { pedidos: { findUnique() { assert.fail('Sin transición no se notifica'); } } } });
  repository.transitionGeneralStage = async () => null;
  assert.equal(await repository.sendToReview(101, { userId: 23 }), null);
});

test('revisión sin responsable persistido no crea mensaje huérfano', async () => {
  const repository = new OrderRepository({ prisma: {
    pedidos: { async findUnique() { return { id_usuario: null }; } },
    mensaje: { create() { assert.fail('No se genera un mensaje sin destinatario'); } },
  } });
  repository.transitionGeneralStage = async () => ({ id_pedido: 101 });
  assert.deepEqual(await repository.sendToReview(101, { userId: 23 }), { id_pedido: 101 });
});

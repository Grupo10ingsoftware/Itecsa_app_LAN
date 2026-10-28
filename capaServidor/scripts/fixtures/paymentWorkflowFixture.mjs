import OrderService from '../../src/modules/orders/service/order.service.js';
import OrderRepository from '../../src/modules/orders/repo/orders.repo.js';
import PaymentRecordService from '../../src/modules/payments/service/paymentRecord.service.js';
import PaymentRecordRepo from '../../src/modules/payments/repo/paymentRecord.repo.js';
import PaymentStatusRepo from '../../src/modules/payments/repo/paymentStatus.repo.js';

// Serial transactional double, not a MySQL emulator. Never opens a DB connection.
export function paymentWorkflowFixture({ payment = 1, stage = 0, delayMs = 0, fail,
  classes = { OrderService, OrderRepository, PaymentRecordService, PaymentRecordRepo, PaymentStatusRepo } } = {}) {
  let state = { payment, stage, records: [], decisions: [], messages: [], recipients: [] };
  const events = [];
  const statuses = ['Pendiente', 'Confirmado', 'Rechazado'];
  const stages = ['Confirmación de pago', 'Listo para producción', 'En producción', 'Listo para entrega', 'Terminado', 'Cancelado'];
  async function io(name) {
    events.push(name);
    if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
    if (fail === name) throw new Error('Synthetic database failure');
  }
  const row = () => ({ id_pedido: 1, numero_nota_venta: 'TEST-001', fecha_creacion: new Date('2026-01-01'),
    id_estado_pago: state.payment, id_estado_pedido: state.stage + 10, nombre_cliente: 'Synthetic',
    razon_social: null, rut_cliente: null, id_etapa_general: state.stage,
    nombre_etapa_general: stages[state.stage], estado_pago: statuses[state.payment - 1] });
  const client = {
    $queryRaw: async query => {
      const sql = Array.isArray(query) ? query.join('?') : query.sql;
      if (sql.includes('FOR UPDATE')) { await io('lock'); return [{ id_pedido: 1 }]; }
      await io('payment-read'); return [row()];
    },
    estado_Pago: { findUnique: async ({ where }) => { await io('status-read');
      const name = statuses[where.id_estado_pago - 1]; return name ? { id_estado_pago: where.id_estado_pago, nombre_estado_pago: name } : null; } },
    estado_Pedido: { findFirst: async ({ where }) => { await io('stage-read');
      return { id_estado_pedido: where.orden_kanban + 10, orden_kanban: where.orden_kanban, nombre_etapa: stages[where.orden_kanban] }; } },
    pedidos: { update: async ({ data, select }) => {
      await io('order-update'); state.payment = data.id_estado_pago;
      if (data.id_estado_pedido !== undefined) state.stage = data.id_estado_pedido - 10;
      return select ? { id_pedido: 1 } : row();
    } },
    registros: { create: async ({ data }) => { await io('audit-insert');
      const record = { ...data, ID_REGISTRO: state.records.length + 1 }; state.records.push(record); return record; } },
    registro_Pago: { create: async ({ data, include }) => { await io('decision-insert'); state.decisions.push(data);
      if (include) { await io('discarded-audit-hydration'); return { ...data, Registros: state.records.at(-1) }; }
      return { id_registro: data.id_registro };
    } },
    usuario: { findMany: async () => { await io('recipient-read'); return [{ id_usuario: 5 }, { id_usuario: 6 }]; } },
    mensaje: { create: async ({ data }) => { await io('message-insert'); const message = { ...data, id_mensaje: state.messages.length + 1 };
      state.messages.push(message); return message; } },
    mENSAJE_USUARIO: { createMany: async ({ data }) => { await io('recipient-insert'); state.recipients.push(...data); return { count: data.length }; } },
  };
  const repo = new classes.OrderRepository({ prisma: client });
  const paymentRecordService = new classes.PaymentRecordService({ repo: new classes.PaymentRecordRepo({ prisma: client }) });
  const service = new classes.OrderService({ repo, paymentRepo: new classes.PaymentStatusRepo({ prisma: client }), paymentRecordService });
  let tail = Promise.resolve();
  service.runInTransaction = callback => {
    const work = tail.then(async () => {
      const snapshot = structuredClone(state);
      events.push('begin');
      try { const result = await callback({ repo, paymentRecordService }); events.push('commit'); return result; }
      catch (error) { state = snapshot; events.push('rollback'); throw error; }
    });
    tail = work.catch(() => {});
    return work;
  };
  return { service, repo, client, events, get state() { return state; } };
}

import Orders from '../../src/modules/orders/repo/orders.repo.js';
import OrderService from '../../src/modules/orders/service/order.service.js';

export function calendarTransactionFixture({ initial, failHistory = false, commitGate } = {}) {
    let state = initial ?? { orders: [{ id_pedido: 1, fecha_estimada_termino: null }],
        details: [{ id_pedido: 1, id_detalle_pedido: 1, cantidad: 7, fecha_estimada_termino: null }], records: [] };
    let tail = Promise.resolve(); const calls = [];
    function models(s) {
        return { pedidos: { update: async ({ where, data }) => {
            calls.push('update'); const order = s.orders.find(o => o.id_pedido === where.id_pedido);
            if (!order) throw Object.assign(Error(), { code: 'P2025' });
            order.fecha_estimada_termino = data.fecha_estimada_termino;
            s.details.filter(d => d.id_pedido === where.id_pedido).forEach(d => { d.fecha_estimada_termino = data.fecha_estimada_termino; });
            return { ...order };
        } }, registros: { create: async ({ data }) => {
            calls.push('history'); if (failHistory) throw Error('Synthetic history failure');
            const record = { ...data, ID_REGISTRO: s.records.length + 1 }; s.records.push(record); return record;
        } } };
    }
    const db = { ...models(state), $transaction(fn) {
        const work = tail.then(async () => {
            const local = structuredClone(state); calls.push('begin');
            try { const result = await fn(models(local)); if (commitGate) await commitGate;
                state = local; calls.push('commit'); return result;
            } catch (error) { calls.push('rollback'); throw error; }
        }); tail = work.catch(() => {}); return work;
    } };
    const service = new OrderService({ prisma: db });
    service.repo = new Orders({ prisma: db });
    service.repo.get = async () => { calls.push('discarded hydration'); return { id_pedido: 1 }; };
    return { service, calls, state: () => structuredClone(state) };
}

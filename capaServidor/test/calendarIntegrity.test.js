import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarTransactionFixture } from '../scripts/fixtures/calendarTransactionFixture.mjs';
import { updateDeliveryDateOperation } from '../src/modules/orders/repo/orderWriteOperations.js';
import { listOrderViewsOperation } from '../src/modules/orders/repo/orderViewOperations.js';

test('calendar: an audit failure rolls back both order and detail delivery dates', async () => {
    const f = calendarTransactionFixture({ failHistory: true }), before = f.state();
    await assert.rejects(f.service.updateDeliveryDate(1, '2026-10-29', { actor: { idUsuario: 9 }, response: 'receipt' }));
    assert.deepEqual(f.state(), before);
    assert.equal(f.calls.at(-1), 'rollback');
});

test('calendar: impossible dates cannot normalize into valid weekdays and write history', async () => {
    for (const date of ['2026-02-30', '2026-2-02', '2026-10-31', '2026-11-01']) {
        const f = calendarTransactionFixture();
        await assert.rejects(f.service.updateDeliveryDate(1, date, { actor: { idUsuario: 9 }, response: 'receipt' }), { statusCode: 400 });
        assert.deepEqual(f.calls, []);
    }
});

test('calendar: successful receipt waits for commit and does not hydrate the discarded graph', async () => {
    let release; const gate = new Promise(r => { release = r });
    const f = calendarTransactionFixture({ commitGate: gate }); let settled = false;
    const work = f.service.updateDeliveryDate(1, '2026-10-29', { actor: { idUsuario: 9 }, response: 'receipt' }).then(r => { settled = true; return r; });
    while (!f.calls.includes('history')) await new Promise(r => setImmediate(r));
    assert.equal(settled, false); assert.equal(f.state().orders[0].fecha_estimada_termino, null);
    release(); assert.deepEqual(await work, { id_pedido: 1 });
    const state = f.state(); assert.equal(state.orders[0].fecha_estimada_termino.toISOString().slice(0, 10), '2026-10-29');
    assert.equal(state.details[0].fecha_estimada_termino.toISOString().slice(0, 10), '2026-10-29');
    assert.equal(state.records.length, 1); assert.equal(state.records[0].id_usuario, 9);
    assert(!f.calls.includes('discarded hydration')); assert.equal(f.calls.at(-1), 'commit');
});

test('calendar: competing changes retain a whole last-committed date and both historical events', async () => {
    const f = calendarTransactionFixture();
    await Promise.all(['2026-10-29', '2026-10-30'].map(date => f.service.updateDeliveryDate(1, date, { actor: { idUsuario: 9 }, response: 'receipt' })));
    const state = f.state(); assert.equal(state.orders[0].fecha_estimada_termino.toISOString().slice(0, 10), '2026-10-30');
    assert.equal(+state.orders[0].fecha_estimada_termino, +state.details[0].fecha_estimada_termino);
    assert.equal(state.records.length, 2); assert(state.records[0].observacion.includes('29-10-2026'));
    assert(state.records[1].observacion.includes('30-10-2026'));
});

test('calendar repository preserves default full return and uses a receipt only when explicitly requested', async () => {
    let hydrations = 0, records = 0;
    const full = { id_pedido: 1, detalles: [{ cantidad: 7 }] }, repo = {
        client: { pedidos: { update: async () => ({ id_pedido: 1 }) }, registros: { create: async () => { records++; } } },
        get: async () => { hydrations++; return full; },
    };
    assert.equal(await updateDeliveryDateOperation(repo, 1, new Date(), { userId: 9 }), full);
    assert.deepEqual(await updateDeliveryDateOperation(repo, 1, new Date(), { userId: 9, hydrate: false }), { id_pedido: 1 });
    assert.equal(hydrations, 1); assert.equal(records, 2);
});

test('calendar read uses the shared page query without excluding terminal or unscheduled orders', async () => {
    let query;
    const result = await listOrderViewsOperation({ client: { $queryRaw: async q => { query = q; return [{
        id_pedido: 1, numero_nota_venta: 'SYN-1', fecha_estimada_termino: null, nombre_cliente: null, razon_social: 'Razón',
        orden_kanban: 4, nombre_etapa: 'Terminado', labels: [], id_detalle_pedido: null,
    }]; } } }, { view: 'calendar', limit: 100, unscheduled: true, search: "x%' OR 1=1 --" });
    assert(!query.sql.includes("NOT IN ('Terminado'")); assert.match(query.sql, /IS NULL/);
    assert(query.values.includes("%x%' OR 1=1 --%")); assert(!query.sql.includes('OR 1=1 --'));
    assert.equal(result[0].nombre_etapa_general, 'Terminado'); assert.equal(result[0].nombre_cliente, 'Razón');
    assert.deepEqual(result[0].detalles, []); assert.equal(result[0].fecha_estimada_termino, null);
});

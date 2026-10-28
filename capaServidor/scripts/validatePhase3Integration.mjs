// Real services + synthetic serialized write models + SELECT-only SQL CTE read models.
// This is not a real MySQL transaction/Keycloak E2E certification.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { resolveDatabaseConnection, createStrictTlsOptions } from '../src/database/connectionConfig.js';
import { creationHarness, sourceNote } from '../test/fixtures/opt04/creationHarness.js';
import { calendarTransactionFixture } from './fixtures/calendarTransactionFixture.mjs';
import { paymentWorkflowFixture } from './fixtures/paymentWorkflowFixture.mjs';
import Creation from '../src/modules/orders/service/salesOrderCreation.service.js';
import Orders from '../src/modules/orders/repo/orders.repo.js';
import OrderService from '../src/modules/orders/service/order.service.js';
import History from '../src/modules/history/repo/orderHistory.repo.js';
import HistoryService from '../src/modules/history/service/orderHistory.service.js';
import Metrics from '../src/modules/metrics/repo/metrics.repo.js';
import MetricsService from '../src/modules/metrics/service/metrics.service.js';
import Messages from '../src/modules/messages/repo/message.repo.js';
import MessageService from '../src/modules/messages/service/message.service.js';
import { UserRepository } from '../src/modules/users/repo/users.repo.js';
import { toCalendarOrderSummaryDTO, toKanbanOrderSummaryDTO } from '../src/modules/orders/dto/order.dto.js';
import { ROLES, PERMISSIONS as P } from '../../shared/authorization.js';

if (process.env.APP_ENV !== 'development' || !process.argv.includes('--allow-development-reads')) throw Error('Explicit development opt-in required');
const c = resolveDatabaseConnection(), db = new PrismaClient({ adapter: new PrismaMariaDb({ host: c.host, port: c.port, user: c.user,
    password: c.password, database: c.database, connectionLimit: 10, connectTimeout: 8000, socketTimeout: 15000,
    ...(c.sslMode === 'required' ? { ssl: createStrictTlsOptions(c.host, c.ca) } : {}) }) });
const output = { reference: '1e7bddd + Fase3 corrections', capturedAt: new Date().toISOString(),
    methodology: 'Shared synthetic order created by real Creation service/model transaction, then payment and calendar services; common persisted model state is exposed to actual SQL read queries via CTEs, including calendar. No real DB writes, accounts or realm.', checkpoints: [], checks: [], sqlReads: 0 };
const dateValue = v => v == null ? null : new Date(v).toISOString().slice(0, 19).replace('T', ' ');
function table(name, columns, rows) {
    const select = row => Prisma.sql`SELECT ${Prisma.join(columns.map(([key, type]) => {
        const value = type === 'DATETIME' || type === 'DATE' ? dateValue(row[key]) : row[key] ?? null;
        return Prisma.sql`CAST(${value} AS ${Prisma.raw(type)}) AS ${Prisma.raw('`' + key + '`')}`;
    }))}`;
    return Prisma.sql`${Prisma.raw('`' + name + '`')} AS (${rows.length ? Prisma.join(rows.map(select), ' UNION ALL ') : Prisma.sql`${select({})} WHERE 1=0`})`;
}
function readClient(s) {
    const cols = (ints, dates = '', strings = '') => [...ints.split(' ').filter(Boolean).map(k => [k, 'SIGNED']), ...dates.split(' ').filter(Boolean).map(k => [k, 'DATETIME']), ...strings.split(' ').filter(Boolean).map(k => [k, 'CHAR(2000)'])];
    const stages = ['Confirmación de pago', 'Listo para producción', 'En producción', 'Listo para entrega', 'Terminado', 'Cancelado'];
    const users = [2, 3, 5, 6, 9].map(id => ({ id_usuario: id, nombre_usuario: 'Sintético', apellido_usuario: String(id) }));
    const definitions = [
        table('Pedidos', cols('id_pedido id_usuario id_cliente id_estado_pedido id_estado_pago', 'fecha_creacion fecha_estimada_termino', 'numero_nota_venta usuario_manager_origen observacion_origen observacion_interna'), s.orders),
        table('Cliente', cols('id_cliente', '', 'nombre_cliente razon_social rut_cliente'), s.clients),
        table('Estado_Pedido', cols('id_estado_pedido orden_kanban', '', 'nombre_etapa'), [{ id_estado_pedido: 1, orden_kanban: 0, nombre_etapa: stages[0] }, ...stages.map((nombre_etapa, i) => ({ id_estado_pedido: i + 10, orden_kanban: i, nombre_etapa }))]),
        table('Estado_Pago', cols('id_estado_pago', '', 'nombre_estado_pago'), ['Pendiente', 'Confirmado', 'Rechazado'].map((nombre_estado_pago, i) => ({ id_estado_pago: i + 1, nombre_estado_pago }))),
        table('Usuario', cols('id_usuario', '', 'nombre_usuario apellido_usuario'), users),
        table('Detalle_pedido', cols('id_detalle_pedido id_pedido cantidad id_tipo_producto id_estado_subproceso', 'fecha_estimada_termino fecha_real_termino'), s.details),
        table('Tipo_Producto', cols('id_tipo_producto', '', 'nombre_producto'), [{ id_tipo_producto: 1, nombre_producto: 'Lanyard' }]),
        table('Estado_Subprocesos', cols('id_estado_subproceso', '', 'nombre_estado'), [{ id_estado_subproceso: 10, nombre_estado: 'Inicio' }]),
        table('Pedido_Item_Sin_Seguimiento', cols('id_item_sin_seguimiento id_pedido cantidad', '', 'producto'), s.accessories.map((a, i) => ({ ...a, id_item_sin_seguimiento: i + 1 }))),
        table('Pedido_Etiqueta', cols('id_pedido id_etiqueta'), s.labels),
        table('etiqueta', cols('id_etiqueta', '', 'nombre_etiqueta'), [{ id_etiqueta: 1, nombre_etiqueta: 'Urgencia' }]),
        table('Registros', cols('ID_REGISTRO id_pedido id_usuario', 'FECHA_HORA', 'observacion'), s.records),
        table('Registro_Etapas', cols('id_registro id_estado_pedido', 'fecha_hora_entrada fecha_hora_salida'), s.stages),
        table('Registro_Pago', cols('id_registro id_estado_pago_anterior id_estado_pago_nuevo', '', 'observacion'), s.decisions ?? []),
        table('registro_subprocesos', cols('id_registro id_detalle_pedido id_estado_subproceso', 'fecha_hora_entrada fecha_hora_salida'), []),
        table('Mensaje', cols('id_mensaje id_pedido', 'fecha_publicacion', 'Asunto contenido'), s.messages),
        table('MENSAJE_USUARIO', cols('id_usuario id_mensaje leido? oculto?'), s.assignments.map(a => ({ ...a, 'leido?': Number(a.leido_ ?? false), 'oculto?': Number(a.oculto_ ?? false) }))),
    ];
    const source = Prisma.sql`WITH ${Prisma.join(definitions)}`;
    const read = async (query, ...values) => {
        let q = Array.isArray(query) ? Prisma.sql(query, ...values) : query;
        if (/^\s*WITH\b/i.test(q.sql)) { const strings = [...q.strings]; strings[0] = strings[0].replace(/^\s*WITH\b/i, ','); q = Prisma.sql(strings, ...q.values); }
        output.sqlReads++;
        const rows = await db.$queryRaw(Prisma.sql`${source} ${q}`);
        // CTE integer CASTs are BIGINT; physical application tables use INT.
        return rows.map(row => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v])));
    };
    return { $queryRaw: read, $queryRawUnsafe: (sql, ...values) => read(Prisma.sql(sql.split('?'), ...values)) };
}
async function check(name, s) {
    const client = readClient(s), service = new OrderService({ repo: new Orders({ prisma: client }) });
    const kanban = (await service.getAllOrders({ limit: 50 })).items.map(toKanbanOrderSummaryDTO);
    const history = await new HistoryService({ repo: new History({ prisma: client }) }).getOrderHistory(1, { limit: 50 }, { includePaymentDetails: false });
    const metrics = await new MetricsService({ repo: new Metrics({ prisma: client }) }).summary({ from: '2026-01-01', to: '2026-12-31' });
    const activity = await new UserRepository({ prisma: client }).listRecentRecords(9);
    const row = s.orders[0];
    const calendar = (await service.getOrderViews({ limit: 50 }, 'calendar')).items.map(toCalendarOrderSummaryDTO)[0];
    assert.equal(kanban[0].id, 1); assert.equal(calendar.id, 1); assert.equal(history.id, 1);
    assert.equal(kanban[0].salesNoteNumber, row.numero_nota_venta); assert.equal(history.salesNoteNumber, row.numero_nota_venta);
    assert.equal(kanban[0].items.reduce((a, d) => a + Number(d.quantity), 0), s.details.reduce((a, d) => a + Number(d.cantidad), 0));
    assert.equal(calendar.items.length, s.details.length); assert.equal(history.items.length, s.details.length + s.accessories.length);
    assert.equal(metrics.flowTime.length, 1); assert.equal(activity.length, s.records.filter(r => r.id_usuario === 9).length);
    if (row.fecha_estimada_termino) {
        assert.equal(calendar.dueDate.toISOString().slice(0, 10), '2026-10-29');
        assert(history.events.some(e => e.type === 'calendar')); assert(calendar.items.every(d => +d.dueDate === +row.fecha_estimada_termino));
    }
    const notifications = await new MessageService({ repo: new Messages({ prisma: client }) }).getNotifications('synthetic', { limit: 50 }, { currentUser: { idUsuario: 2, identitySubject: 'synthetic', estadoUsuario: 'Activo' } });
    assert.equal(notifications.unreadCount, s.assignments.filter(a => a.id_usuario === 2).length);
    const visiblePayments = history.events.filter(e => e.type === 'payment');
    if (s.decisions?.length) assert.equal(visiblePayments.length, s.decisions.length);
    assert(visiblePayments.every(e => !Object.hasOwn(e, 'responsible') && !Object.hasOwn(e, 'description')));
    output.checkpoints.push({ name, sameOrder: true, quantities: true, productsAndAccessories: true, calendarDates: true,
        historyEvents: history.events.length, personalActivity: activity.length, notifications: notifications.unreadCount, reports: true, financialRedaction: true });
}
try {
    const h = creationHarness(), source = sourceNote({ lines: 2, accessories: 1, numeroNota: 'SYN-FASE3' });
    const creation = new Creation({ source: { getByNumber: async () => source }, runInTransaction: h.runInTransaction, userRepo: {} });
    await creation.create({ numeroNota: 'SYN-FASE3', priority: 'urgent' }, { actorId: 9, response: 'receipt' });
    let state = h.state();
    await check('creation → kanban/calendar/history/metrics/activity/notifications', state);
    const pay = paymentWorkflowFixture({ payment: state.orders[0].id_estado_pago, stage: 0 });
    await pay.service.updPaymentState(1, 2, { actor: { idUsuario: 9 }, identityProvider: 'keycloak', role: ROLES.ADMIN_COBRANZAS, permissions: [P.UPDATE_PAYMENT_STATUS] });
    state.orders[0].id_estado_pago = pay.state.payment; state.orders[0].id_estado_pedido = pay.state.stage + 10;
    const recordOffset = state.records.length;
    state.records.push(...pay.state.records.map(r => ({ ...r, ID_REGISTRO: r.ID_REGISTRO + recordOffset })));
    state.decisions = pay.state.decisions.map(d => ({ ...d, id_registro: d.id_registro + recordOffset }));
    const messageOffset = state.messages.length;
    state.messages.push(...pay.state.messages.map(m => ({ ...m, id_mensaje: m.id_mensaje + messageOffset })));
    state.assignments.push(...pay.state.recipients.map(r => ({ ...r, id_mensaje: r.id_mensaje + messageOffset })));
    await check('confirmed payment → kanban/history/activity/notifications', state);
    const calendar = calendarTransactionFixture({ initial: state });
    await calendar.service.updateDeliveryDate(1, '2026-10-29', { actor: { idUsuario: 9 }, response: 'receipt' });
    state = calendar.state();
    await check('calendar date → order/details/kanban/history/metrics', state);
    output.checks.push({ kind: 'cross-module shared synthetic state', pass: true, realWrites: 0 });
} catch (error) { output.failure = { name: error.name, code: error.code ?? 'INTEGRATION_ASSERTION' }; process.exitCode = 1; }
finally { await db.$disconnect(); await writeFile('../docs/FASE3_INTEGRACION_SINTETICA_SQL.json', JSON.stringify(output, null, 2) + '\n'); }

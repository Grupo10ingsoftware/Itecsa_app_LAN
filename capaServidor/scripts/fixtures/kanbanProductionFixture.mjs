import OrderService from '../../src/modules/orders/service/order.service.js';

// Transactional state double, not a MySQL emulator. Used for rollback/order-of-
// operations checks and explicitly synthetic orchestration timings only.
export function productionFixture({ Service = OrderService, current = 1, finished = false,
  stage = 2, payment = 'Confirmado', product = 'Tarjeta', progress = 100, latency = 0, failAt } = {}) {
  const date = new Date('2026-01-01T00:00:00Z');
  let state = { stage, payment, current, finished, records: [], subprocessRecords: [] };
  let queue = Promise.resolve(), nextRecord = 1;
  const events = [], calls = {};
  const flow = [1, 2, 3].map((id, index) => ({ id_estado_subproceso: id, orden_flujo: index + 1,
    Estado_Subprocesos: { nombre_estado: id === 3 ? 'Empaquetado' : `Proceso ${id}` } }));
  const io = async (name, work) => {
    events.push(name); calls[name] = (calls[name] ?? 0) + 1;
    if (latency) await new Promise(resolve => setTimeout(resolve, latency));
    if (name === failAt) throw Error('SYNTHETIC_STORAGE_FAILURE');
    return work();
  };
  const detail = () => ({ id_detalle_pedido: 2, id_pedido: 1, id_tipo_producto: 1, cantidad: 100,
    fecha_estimada_termino: date, fecha_real_termino: state.finished ? date : null,
    id_estado_subproceso: state.current,
    Tipo_Producto: { nombre_producto: product, Producto_Subproceso: flow },
    Avance_Lanyard: [{ cantidad_acumulada: progress, porcentaje_acumulado: progress, fecha_actualizacion: date, fecha_produccion: date }],
    Comentario_Produccion: [] });
  const order = () => ({ id_pedido: 1, id_estado_pedido: state.stage, id_estado_pago: 2, fecha_creacion: date,
    numero_nota_venta: 'SYNTHETIC-1', fecha_estimada_termino: date,
    Cliente: { nombre_cliente: 'Synthetic', razon_social: null }, Estado_Pedido: { orden_kanban: state.stage, nombre_etapa: 'En producción' },
    Estado_Pago: { nombre_estado_pago: state.payment }, Detalle_pedido: [detail()], Pedido_Etiqueta: [], Pedido_Item_Sin_Seguimiento: [],
    Registros: state.records.map(record => ({ ...record, registro_subprocesos: {
      id_detalle_pedido: 2, Estado_Subprocesos: { nombre_estado: 'Proceso' },
    } })), usuario_manager_origen: null, observacion_origen: null, observacion_interna: null });
  const tx = {
    $queryRaw: (input, ...values) => {
      const sql = Array.isArray(input) ? input.join('?') : input.sql;
      if (sql.includes('FOR UPDATE')) return io('lock', () => []);
      if (sql.includes('FROM Comentario_Produccion')) return io('projection.comments', () => []);
      if (sql.includes('FROM Registros r JOIN registro_subprocesos')) return io('projection.history', () => state.records.map(record => ({
        ...record, id_detalle_pedido: 2, nombre_estado: 'Proceso',
      })));
      if (sql.includes('flowId')) return io('projection.details', () => flow.map(f => ({
        id_detalle_pedido: 2, cantidad: 100, fecha_estimada_termino: date, fecha_real_termino: state.finished ? date : null,
        id_estado_subproceso: state.current, nombre_producto: product, flowId: f.id_estado_subproceso,
        orden_flujo: f.orden_flujo, nombre_estado: f.Estado_Subprocesos.nombre_estado,
        id_avance_lanyard: 1, cantidad_acumulada: progress, porcentaje_acumulado: progress, fecha_actualizacion: date, fecha_produccion: date,
      })));
      return io(sql.includes('JSON_ARRAYAGG') ? 'projection.root' : 'transitionState', () => [{
        id_pedido: 1, id_estado_pedido: state.stage, id_estado_pago: 2, fecha_creacion: date,
        numero_nota_venta: 'SYNTHETIC-1', fecha_estimada_termino: date, nombre_cliente: 'Synthetic', razon_social: null,
        orden_kanban: state.stage, nombre_etapa: 'En producción', nombre_estado_pago: state.payment, labels: [],
        usuario_manager_origen: null, observacion_origen: null, observacion_interna: null,
      }]);
    },
    pedidos: { findUnique: () => io('orm.order', () => structuredClone(order())) },
    detalle_pedido: {
      findFirst: ({ where }) => io('detail', () => where.id_pedido === 1 && where.id_detalle_pedido === 2 ? structuredClone(detail()) : null),
      updateMany: ({ where, data }) => io('conditionalUpdate', () => {
        if (where.id_estado_subproceso !== state.current || (where.fecha_real_termino === null && state.finished)) return { count: 0 };
        state.current = data.id_estado_subproceso; state.finished = Boolean(data.fecha_real_termino); return { count: 1 };
      }),
    },
    avance_Lanyard: { findFirst: () => io('progress', () => ({ porcentaje_acumulado: progress })) },
    registro_subprocesos: {
      findFirst: () => io('latestRecord', () => state.subprocessRecords.at(-1) ?? null),
      create: ({ data }) => io('subprocessRecord', () => { state.subprocessRecords.push(data); return data; }),
    },
    registro_Etapas: { findFirst: () => io('stageRecord', () => ({ fecha_hora_entrada: date })) },
    registros: { create: ({ data }) => io('record', () => { const row = { ...data, ID_REGISTRO: nextRecord++ }; state.records.push(row); return row; }) },
  };
  const prisma = { $transaction: callback => {
    const result = queue.then(async () => {
      const snapshot = structuredClone(state); events.push('begin');
      try { const result = await callback(tx); events.push('commit'); return result; }
      catch (error) { state = snapshot; events.push('rollback'); throw error; }
    });
    queue = result.catch(() => {}); return result;
  } };
  return { service: new Service({ prisma }), tx, events, calls, state: () => structuredClone(state) };
}

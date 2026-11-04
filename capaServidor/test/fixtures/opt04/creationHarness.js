// Isolated transactional model. No database/network; model calls are not SQL counts.
import { createSalesOrderTransaction } from '../../../src/modules/orders/service/salesOrder.transaction.js';
import { ROLES } from '../../../src/config/roles.js';

export function sourceNote({ lines = 5, accessories = 2, types = ['Lanyard'], numeroNota = 'SYN-OPT04' } = {}) {
  return { numeroNota, cliente: { rut: '11111111-1', nombre: 'Cliente sintético ñ' }, origen: { usuarioManager: 'Origen sintético' }, observaciones: 'Origen',
    items: Array.from({ length: lines }, (_, i) => ({ codigo: i % 2 ? 'REPETIDO' : null, producto: `Producto ñ ${i}`, cantidad: i + 1, familia: 'LANYARD', subfamilia: 'LANYARD', tipoProducto: types[i % types.length] })),
    itemsSinSeguimientoProductivo: Array.from({ length: accessories }, (_, i) => ({ codigo: 'ACC', producto: 'Accesorio', cantidad: i + 1, subfamilia: 'Accesorio' })),
  };
}

export function creationHarness({ existingClient = true, failAt, snapshots = true, noSubprocess = false, noRecipients = false, duplicate = false, missingType = false, missingLabel = false, shortBatch = false, commitGate } = {}) {
  let state = { orders: [], clients: existingClient ? [{ id_cliente: 1, rut_cliente: '11111111-1', nombre_cliente: 'Cliente sintético ñ', razon_social: 'Cliente sintético ñ', estado_cliente: 'ACTIVO' }] : [], details: [], accessories: [], records: [], stages: [], labels: [], messages: [], assignments: [], audits: [] };
  const calls = [], transactions = [];
  let tail = Promise.resolve();
  const invoke = (name, work) => async (...args) => {
    calls.push(name);
    if (name === failAt) throw Object.assign(Error('Synthetic fault'), { code: 'SYNTHETIC_FAILURE' });
    return work(...args);
  };
  const types = ['Lanyard', 'Tarjeta', 'Yoyo'].map((nombre_producto, i) => ({ id_tipo_producto: i + 1, nombre_producto }));
  const flow = id => noSubprocess ? [] : ({1:[1,2,3,4,5],2:[6,7,8,9,5],3:[10,5]})[id].map((step,index)=>({id_tipo_producto:id,id_estado_subproceso:step,orden_flujo:index+1,Estado_Subprocesos:{nombre_estado:'Paso '+step}}));
  const users = noRecipients ? [] : [{ id_usuario: 2, rol_usuario: ROLES.ADMIN_COBRANZAS }, { id_usuario: 3, rol_usuario: ROLES.ADMINISTRADOR }];
  const insert = (s, table, key, data) => {
    const row = { ...(key ? { [key]: s[table].length + 1 } : {}), ...data };
    s[table].push(row); return { ...row };
  };
  function transactionClient(s) {
    const model = (table, key, label = table) => ({
      create: invoke(label + '.create', ({ data }) => insert(s, table, key, data)),
      createMany: invoke(label + '.createMany', ({ data, skipDuplicates }) => {
        for (const row of data) {
          if (row.id_pedido && !s.orders.some(o => o.id_pedido === row.id_pedido)) throw Error('orphan');
          if (skipDuplicates && table === 'assignments' && s.assignments.some(a => a.id_usuario === row.id_usuario && a.id_mensaje === row.id_mensaje)) continue;
          insert(s, table, key, row);
        }
        return { count: shortBatch ? data.length - 1 : data.length };
      }),
    });
    const tx = {
      cliente: { ...model('clients', 'id_cliente', 'client'), findUnique: invoke('client.findUnique', ({ where }) => s.clients.find(c => c.rut_cliente === where.rut_cliente) ?? null) },
      pedidos: {
        findFirst: invoke('order.findFirst', ({ where }) => duplicate ? { id_pedido: 99 } : s.orders.find(o => o.numero_nota_venta === where.numero_nota_venta) ?? null),
        create: invoke('order.create', ({ data }) => {
          if (s.orders.some(o => o.numero_nota_venta === data.numero_nota_venta)) throw Object.assign(Error(), { code: 'P2002', meta: { modelName: 'Pedidos', target: ['numero_nota_venta'] } });
          return insert(s, 'orders', 'id_pedido', data);
        }),
      },
      etiqueta: { findMany: invoke('label.findMany', () => missingLabel ? [] : [{ id_etiqueta: 1, nombre_etiqueta: 'Urgencia', esta_activa: 1 }]) },
      pedido_Etiqueta: model('labels', null, 'label'), registros: model('records', 'ID_REGISTRO', 'record'), registro_Etapas: model('stages', null, 'stage'),
      detalle_pedido: model('details', 'id_detalle_pedido', 'detail'), pedido_Item_Sin_Seguimiento: model('accessories', 'id_item', 'accessory'),
      tipo_Producto: { findFirst: invoke('product.findFirst', ({ where }) => missingType ? null : types.find(t => t.nombre_producto === (where.nombre_producto.equals ?? where.nombre_producto))) },
      producto_Subproceso: { findMany: invoke('flow.findMany', ({ where }) => flow(where.id_tipo_producto)) },
      usuario: { findMany: invoke('recipients.findMany', ({ where }) => users.filter(u => u.rol_usuario === where.rol_usuario)) },
      mensaje: model('messages', 'id_mensaje', 'message'), mENSAJE_USUARIO: model('assignments', null, 'assignment'), securityAuditEvent: model('audits', 'id', 'audit'),
      $queryRawUnsafe() { throw Error('Unsafe SQL forbidden'); },
      $queryRaw: invoke('raw.read', (input, ...values) => {
        const sql = input.sql ?? input.join('?');
        if (sql.includes('information_schema')) return snapshots ? ['linea_origen', 'codigo_origen', 'producto_origen', 'familia_origen', 'subfamilia_origen'].map(name => ({ name })) : [];
        if (sql.includes('FROM Usuario')) return users.map(u => ({ id_usuario: u.id_usuario, collections: u.rol_usuario === ROLES.ADMIN_COBRANZAS ? 1 : 0, production: u.rol_usuario === ROLES.ADMINISTRADOR ? 1 : 0 }));
        const name = input.values?.[0] ?? values[0];
        const type = missingType ? null : types.find(t => t.nombre_producto === name);
        return type ? [{ id_tipo_producto: type.id_tipo_producto, firstSubprocessId: flow(type.id_tipo_producto)[0]?.id_estado_subproceso ?? null }] : [];
      }),
    };
    return tx;
  }
  let current;
  const db = { $transaction(callback, options) {
    transactions.push(options);
    const pending = tail.then(async () => {
      const local = structuredClone(state);
      current = local;
      const result = await callback(transactionClient(local));
      if (failAt === 'commit') throw Object.assign(Error('Synthetic commit failure'), { code: 'SYNTHETIC_FAILURE' });
      if (commitGate) await commitGate;
      state = local;
      return result;
    });
    tail = pending.catch(() => {});
    return pending;
  } };
  const run = createSalesOrderTransaction(() => db);
  return {
    calls, transactions, state: () => structuredClone(state),
    source: { getByNumber: async () => sourceNote() },
    runInTransaction: operation => run(uow => {
      // The reference's heavy hydration is represented by one model call here.
      // Its real SQL cost is measured separately by benchmarkOrderReadsOpt04.
      uow.repo.get = invoke('fullOrder.read', id => ({ ...current.orders.find(o => o.id_pedido === id), detalles: current.details, itemsSinSeguimientoProductivo: current.accessories }));
      return operation(uow);
    }),
  };
}

export function normalizedState(state) {
  return JSON.parse(JSON.stringify(state, (key, value) => ['FECHA_HORA','fecha_hora_entrada','fecha_publicacion','occurred_at','fecha_creacion'].includes(key) && value ? 'GENERATED_TIMESTAMP' : value));
}

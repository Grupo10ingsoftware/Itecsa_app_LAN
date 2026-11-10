import { MYSQL_LAB_CATALOG } from '../../src/database/mysqlLabCatalog.js';
import { toOrderSummaryDTO } from '../../src/modules/orders/repo/orderMapping.js';
import { toKanbanOrderDetailDTO } from '../../src/modules/orders/dto/order.dto.js';

// Synthetic product/order data. The test storage double does not connect to MySQL.
export function yoyoDetail() {
  const product = MYSQL_LAB_CATALOG.productTypes.find(type => type.nombre_producto === 'Yoyo');
  const flow = MYSQL_LAB_CATALOG.productSubprocesses
    .filter(step => step.id_tipo_producto === product.id_tipo_producto)
    .map(step => ({ ...step, Estado_Subprocesos: MYSQL_LAB_CATALOG.subprocesses.find(process => process.id_estado_subproceso === step.id_estado_subproceso) }));
  return {
    id_pedido: 47, id_detalle_pedido: 470, id_tipo_producto: product.id_tipo_producto,
    cantidad: 12, fecha_real_termino: null, fecha_estimada_termino: new Date('2026-11-10T00:00:00Z'),
    id_estado_subproceso: flow[0].id_estado_subproceso,
    Tipo_Producto: { ...product, Producto_Subproceso: flow }, Avance_Lanyard: [],
  };
}

export function yoyoRepository() {
  const detail = yoyoDetail();
  const order = {
    id_pedido: 47, id_etapa_general: 2, id_estado_pedido: 3,
    estado_pago: 'Confirmado', id_estado_pago: 2,
    fecha_creacion: new Date('2026-11-09T15:00:00Z'),
    fecha_estimada_termino: new Date('2026-11-10T00:00:00Z'),
  };
  const writes = [], audit = [], subprocessAudit = [], transitions = [], locks = [];
  const repo = {
    async lockProductionOrder(id) { locks.push(id); },
    async getTransitionState() { return structuredClone(order); },
    async get() { return { id_pedido: order.id_pedido }; },
    async transitionGeneralStage(args) {
      transitions.push(args);
      order.id_etapa_general = args.ordenKanban;
      order.id_estado_pedido = args.ordenKanban + 1;
      return { id_pedido: order.id_pedido, id_etapa_general: args.ordenKanban };
    },
    client: {
      detalle_pedido: {
        async findFirst({ where }) { return where.id_pedido === order.id_pedido && where.id_detalle_pedido === detail.id_detalle_pedido ? structuredClone(detail) : null; },
        async findMany() { return [structuredClone(detail)]; },
        async updateMany({ where, data }) {
          if (!Object.entries(where).every(([key, value]) => detail[key] === value)) return { count: 0 };
          writes.push({ where, data });
          Object.assign(detail, data);
          return { count: 1 };
        },
      },
      avance_Lanyard: { async findFirst() { throw new Error('A Yoyo must not require a Lanyard progress query'); } },
      registro_subprocesos: {
        async findFirst() { return subprocessAudit.at(-1) ?? null; },
        async create({ data }) { subprocessAudit.push(data); return data; },
      },
      registro_Etapas: { async findFirst() { return { fecha_hora_entrada: order.fecha_creacion }; } },
      registros: { async create({ data }) { const result = { ID_REGISTRO: audit.length + 1, ...data }; audit.push(result); return result; } },
    },
  };
  function dto() {
    const row = {
      ...order, numero_nota_venta: 'QA-47-YOYO',
      Cliente: { nombre_cliente: 'Cliente sintético QA' },
      Estado_Pedido: { orden_kanban: order.id_etapa_general, nombre_etapa: order.id_etapa_general === 2 ? 'En producción' : 'Listo para Entrega' },
      Estado_Pago: { nombre_estado_pago: order.estado_pago },
      Detalle_pedido: [structuredClone(detail)], Pedido_Etiqueta: [],
    };
    return toKanbanOrderDetailDTO(toOrderSummaryDTO(row));
  }
  return { repo, detail, order, writes, audit, subprocessAudit, transitions, locks, dto };
}

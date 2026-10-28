import {listKanbanRows} from '../../../src/modules/orders/repo/kanbanRead.repo.js';
import {mapCalendarSummary,mapKanbanSummary} from '../../../src/modules/orders/repo/orderViewOperations.js';
const client = { select: { nombre_cliente: true, razon_social: true } };
const product = { select: { nombre_producto: true } };
const item = { select: { id_detalle_pedido: true, cantidad: true, fecha_estimada_termino: true, Tipo_Producto: product } };
const base = {
  id_pedido: true, numero_nota_venta: true, fecha_estimada_termino: true,
  Cliente: client,
  Estado_Pedido: { select: { orden_kanban: true, nombre_etapa: true } },
  Detalle_pedido: item,
};
const labels = { select: { etiqueta: { select: { id_etiqueta: true, nombre_etiqueta: true } } } };
const kanbanSelect = {
  ...base, id_estado_pago: true, fecha_creacion: true,
  Estado_Pago: { select: { nombre_estado_pago: true } },
  Pedido_Etiqueta: labels,
};
const calendarSelect = { ...base, Pedido_Etiqueta: labels };
const calendarDetailSelect = { ...calendarSelect, usuario_manager_origen: true };

export async function listOrderViewsOperation(repository, { view, limit, cursor, status, search, productType, from, to, unscheduled = false }) {
  if (view === 'kanban') return (await listKanbanRows(repository.client,
    { limit, cursor, status, search, productType, from, to })).map(mapKanbanSummary);
  const where = {
    ...(cursor ? { id_pedido: { lt: cursor.id } } : {}),
    ...(view === 'kanban'
      ? { Estado_Pedido: { is: {
        orden_kanban: { not: 4 },
        nombre_etapa: { notIn: ['Terminado', 'Cancelado'], ...(status ? { equals: status } : {}) },
      } } }
      : status ? { Estado_Pedido: { is: { nombre_etapa: status } } } : {}),
    ...(search ? { OR: [
      { numero_nota_venta: { contains: search } },
      { Cliente: { is: { nombre_cliente: { contains: search } } } },
      { Cliente: { is: { razon_social: { contains: search } } } },
    ] } : {}),
    ...(productType ? { Detalle_pedido: { some: { Tipo_Producto: { is: { nombre_producto: { contains: productType } } } } } } : {}),
    ...(unscheduled
      ? { fecha_estimada_termino: null }
      : (from || to) ? { fecha_estimada_termino: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}),
  };
  const rows = await repository.client.pedidos.findMany({
    where, select: view === 'calendar' ? calendarSelect : kanbanSelect,
    orderBy: { id_pedido: 'desc' }, take: limit + 1,
  });
  return rows.map(view === 'calendar' ? mapCalendarSummary : mapKanbanSummary);
}

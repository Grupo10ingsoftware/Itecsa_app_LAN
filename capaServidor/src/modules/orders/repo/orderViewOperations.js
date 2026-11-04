import { ORDER_STATUS_ID } from "../../../config/status.js";
﻿import { readPaymentPage, readPaymentCounts } from './paymentWorkspaceRead.repo.js';
import { listKanbanRows, getKanbanRow } from './kanbanRead.repo.js';
import { toOrderSummaryDTO } from './orderMapping.js';
import { stripLanyardProgressObservation } from './orderProductionRules.js';

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

function products(row) {
  return (row.Detalle_pedido ?? []).map((detail) => ({
    id_detalle_pedido: detail.id_detalle_pedido,
    product: detail.Tipo_Producto?.nombre_producto ?? null,
    quantity: detail.cantidad ?? null,
    dueDate: detail.fecha_estimada_termino ?? null,
  }));
}

export function mapKanbanSummary(row) {
  return {
    id_pedido: row.id_pedido,
    numero_nota_venta: row.numero_nota_venta,
    nombre_cliente: row.Cliente?.nombre_cliente ?? row.Cliente?.razon_social ?? null,
    fecha_creacion: row.fecha_creacion,
    fecha_estimada_termino: row.fecha_estimada_termino,
    id_etapa_general: row.Estado_Pedido?.orden_kanban ?? null,
    nombre_etapa_general: row.Estado_Pedido?.nombre_etapa ?? null,
    id_estado_pago: row.id_estado_pago,
    estado_pago: row.Estado_Pago?.nombre_estado_pago ?? null,
    etiquetas: (row.Pedido_Etiqueta ?? []).map((entry) => entry.etiqueta).filter(Boolean),
    detalles: products(row),
  };
}

export function mapCalendarSummary(row) {
  return {
    id_pedido: row.id_pedido,
    numero_nota_venta: row.numero_nota_venta,
    nombre_cliente: row.Cliente?.nombre_cliente ?? row.Cliente?.razon_social ?? null,
    fecha_estimada_termino: row.fecha_estimada_termino,
    id_etapa_general: row.Estado_Pedido?.orden_kanban ?? null,
    nombre_etapa_general: row.Estado_Pedido?.nombre_etapa ?? null,
    etiquetas: (row.Pedido_Etiqueta ?? []).map((entry) => entry.etiqueta).filter(Boolean),
    detalles: products(row),
  };
}

function commentEntry({ id, text, createdAt, subprocessName }) {
  const normalizedText = typeof text === 'string' ? text.trim() : '';
  if (!normalizedText) return null;
  return {
    id,
    text: normalizedText,
    createdAt: createdAt ?? null,
    ...(subprocessName ? { subprocessName } : {}),
  };
}

function mapKanbanCommentGroups(row) {
  const source = [commentEntry({
    id: `source-${row.id_pedido}`,
    text: row.observacion_origen,
    createdAt: row.fecha_creacion,
  })].filter(Boolean);
  const system = [commentEntry({
    id: `internal-${row.id_pedido}`,
    text: row.observacion_interna,
    createdAt: row.fecha_creacion,
  })].filter(Boolean);
  const subprocesses = [];

  for (const record of row.Registros ?? []) {
    const subprocess = record.registro_subprocesos;
    const entry = commentEntry({
      id: `record-${record.ID_REGISTRO}`,
      text: stripLanyardProgressObservation(record.observacion),
      createdAt: record.FECHA_HORA,
      subprocessName: subprocess?.Estado_Subprocesos?.nombre_estado ?? null,
    });
    if (!entry) continue;
    if (subprocess) subprocesses.push(entry);
  }

  for (const detail of row.Detalle_pedido ?? []) {
    for (const productionComment of detail.Comentario_Produccion ?? []) {
      const productName = detail.Tipo_Producto?.nombre_producto;
      const entry = commentEntry({
        id: `production-${productionComment.id_comentario_produccion}`,
        text: productionComment.comentario,
        createdAt: productionComment.fecha_comentario,
        subprocessName: productName ? `Produccion - ${productName}` : 'Produccion',
      });
      if (entry) subprocesses.push(entry);
    }
  }

  return { source, system, subprocesses, all: [...source, ...system, ...subprocesses] };
}

export async function listOrderViewsOperation(repository, { view, limit, cursor, status, search, productType, from, to, unscheduled = false }) {
  if (view === 'kanban') return (await listKanbanRows(repository.client,
    { limit, cursor, status, search, productType, from, to })).map(mapKanbanSummary);
  if (view === 'calendar') return (await listKanbanRows(repository.client,
    { limit, cursor, status, search, productType, from, to, calendar: true, unscheduled })).map(mapCalendarSummary);
  const where = {
    ...(cursor ? { id_pedido: { lt: cursor.id } } : {}),
    ...(view === 'kanban'
      ? { Estado_Pedido: { is: {
        orden_kanban: { not: 4 },
        id_estado_pedido: { notIn: [ORDER_STATUS_ID.TERMINADO, ORDER_STATUS_ID.CANCELADO] },
        ...(status ? { nombre_etapa: status } : {}),
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

export async function getOrderViewOperation(repository, id, view) {
  const row = view === 'calendar' ? await repository.client.pedidos.findUnique({
    where: { id_pedido: Number(id) },
    select: calendarDetailSelect,
  }) : await getKanbanRow(repository.client, id, { precheck: view === 'kanban-precheck' });
  if (!row) return null;
  if (view === 'calendar') return { ...mapCalendarSummary(row), seller: row.usuario_manager_origen ?? null };
  const completion = [3, 4].includes(Number(row.Estado_Pedido?.orden_kanban))
    ? await repository.client.registros.findFirst({
      where: { id_pedido: Number(id), Registro_Etapas: { is: { Estado_Pedido: { is: { orden_kanban: Number(row.Estado_Pedido.orden_kanban) } } } } },
      orderBy: [{ FECHA_HORA: "desc" }, { ID_REGISTRO: "desc" }],
      select: { FECHA_HORA: true, Usuario: { select: { nombre_usuario: true, apellido_usuario: true } } },
    }) : null;
  const full = toOrderSummaryDTO(row);
  const summary = mapKanbanSummary(row);
  const commentGroups = mapKanbanCommentGroups(row);
  return {
    ...summary,
    productionCompletion: completion ? { completedAt: completion.FECHA_HORA, responsible: [completion.Usuario?.nombre_usuario, completion.Usuario?.apellido_usuario].filter(Boolean).join(" ") || null } : null,
    seller: row.usuario_manager_origen ?? null,
    comments: commentGroups.all,
    commentGroups,
    detalles: full.detalles.map(({ id_detalle_pedido, nombre_producto, cantidad, fecha_estimada_termino, lanyardProgress, subProcesses }) => ({
      id_detalle_pedido, nombre_producto, cantidad, fecha_estimada_termino, lanyardProgress, subProcesses,
    })),
  };
}

export async function listPaymentViewsOperation(repository, filters) {
  const [rows, counts] = await Promise.all([
    filters.summaryOnly ? [] : readPaymentPage(repository.client, filters),
    filters.includeSummary === false ? null : readPaymentCounts(repository.client, filters),
  ]);
  return { rows, counts };
}

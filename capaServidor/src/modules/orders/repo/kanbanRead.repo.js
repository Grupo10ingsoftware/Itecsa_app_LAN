import { Prisma } from '@prisma/client';

// Each query has at most one expanding relation. Histories and product flows
// never join each other, so neither comments nor subprocesses multiply rows.
const rootColumns = Prisma.sql`p.id_pedido, p.numero_nota_venta, p.fecha_creacion, p.fecha_estimada_termino,
  p.id_estado_pago, c.nombre_cliente, c.razon_social, ep.orden_kanban, ep.nombre_etapa,
  pay.nombre_estado_pago,
  COALESCE((SELECT JSON_ARRAYAGG(JSON_OBJECT('id_etiqueta', t.id_etiqueta, 'nombre_etiqueta', t.nombre_etiqueta))
    FROM Pedido_Etiqueta pe JOIN etiqueta t ON t.id_etiqueta=pe.id_etiqueta
    WHERE pe.id_pedido=p.id_pedido), JSON_ARRAY()) AS labels`;
const rootJoins = Prisma.sql`LEFT JOIN Cliente c ON c.id_cliente=p.id_cliente
  LEFT JOIN Estado_Pedido ep ON ep.id_estado_pedido=p.id_estado_pedido
  LEFT JOIN Estado_Pago pay ON pay.id_estado_pago=p.id_estado_pago`;

function root(row) {
  const labels = typeof row.labels === 'string' ? JSON.parse(row.labels) : row.labels;
  return { id_pedido: row.id_pedido, numero_nota_venta: row.numero_nota_venta,
    fecha_creacion: row.fecha_creacion, fecha_estimada_termino: row.fecha_estimada_termino,
    id_estado_pago: row.id_estado_pago, Cliente: { nombre_cliente: row.nombre_cliente, razon_social: row.razon_social },
    Estado_Pedido: { orden_kanban: row.orden_kanban, nombre_etapa: row.nombre_etapa },
    Estado_Pago: { nombre_estado_pago: row.nombre_estado_pago },
    Pedido_Etiqueta: [...(labels ?? [])].sort((a, b) => a.id_etiqueta - b.id_etiqueta).map(etiqueta => ({ etiqueta })),
    Detalle_pedido: [], Registros: [], usuario_manager_origen: row.usuario_manager_origen,
    observacion_origen: row.observacion_origen, observacion_interna: row.observacion_interna };
}

export async function listKanbanRows(client, { limit, cursor, status, search, productType, from, to, calendar = false, unscheduled = false }) {
  const conditions = [calendar ? Prisma.sql`1=1` : Prisma.sql`ep.orden_kanban <> 4 AND ep.nombre_etapa NOT IN ('Terminado', 'Cancelado')`];
  if (calendar && unscheduled) conditions.push(Prisma.sql`p.fecha_estimada_termino IS NULL`);
  if (cursor) conditions.push(Prisma.sql`p.id_pedido < ${cursor.id}`);
  if (status) conditions.push(Prisma.sql`ep.nombre_etapa = ${status}`);
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(Prisma.sql`(p.numero_nota_venta LIKE ${pattern} OR c.nombre_cliente LIKE ${pattern} OR c.razon_social LIKE ${pattern})`);
  }
  if (productType) conditions.push(Prisma.sql`EXISTS (SELECT 1 FROM Detalle_pedido fd
    JOIN Tipo_Producto ft ON ft.id_tipo_producto=fd.id_tipo_producto
    WHERE fd.id_pedido=p.id_pedido AND ft.nombre_producto LIKE ${`%${productType}%`})`);
  if (from) conditions.push(Prisma.sql`p.fecha_estimada_termino >= ${from}`);
  if (to) conditions.push(Prisma.sql`p.fecha_estimada_termino < ${to}`);
  const rows = await client.$queryRaw(Prisma.sql`WITH page AS (
    SELECT ${rootColumns} FROM Pedidos p ${rootJoins}
    WHERE ${Prisma.join(conditions, ' AND ')} ORDER BY p.id_pedido DESC LIMIT ${limit + 1}
  ) SELECT page.*, d.id_detalle_pedido, d.cantidad, d.fecha_estimada_termino AS detailDueDate, t.nombre_producto
    FROM page LEFT JOIN Detalle_pedido d ON d.id_pedido=page.id_pedido
    LEFT JOIN Tipo_Producto t ON t.id_tipo_producto=d.id_tipo_producto
    ORDER BY page.id_pedido DESC, d.id_detalle_pedido ASC`);
  const orders = new Map();
  for (const row of rows) {
    if (!orders.has(row.id_pedido)) orders.set(row.id_pedido, root(row));
    if (row.id_detalle_pedido !== null) orders.get(row.id_pedido).Detalle_pedido.push({
      id_detalle_pedido: row.id_detalle_pedido, cantidad: row.cantidad, fecha_estimada_termino: row.detailDueDate,
      Tipo_Producto: { nombre_producto: row.nombre_producto },
    });
  }
  return [...orders.values()];
}

export async function getKanbanRow(client, id, { precheck = false } = {}) {
  const orderId = Number(id);
  const [roots, rows, records, comments] = await Promise.all([
    client.$queryRaw(Prisma.sql`SELECT ${rootColumns}, p.usuario_manager_origen, p.observacion_origen, p.observacion_interna
      FROM Pedidos p ${rootJoins} WHERE p.id_pedido=${orderId} LIMIT 1`),
    client.$queryRaw`SELECT d.id_detalle_pedido, d.cantidad, d.fecha_estimada_termino, d.fecha_real_termino,
      d.id_estado_subproceso, t.nombre_producto, f.id_estado_subproceso AS flowId, f.orden_flujo, s.nombre_estado,
      a.id_avance_lanyard, a.cantidad_acumulada, a.porcentaje_acumulado, a.fecha_actualizacion, a.fecha_produccion
      FROM Detalle_pedido d LEFT JOIN Tipo_Producto t ON t.id_tipo_producto=d.id_tipo_producto
      LEFT JOIN Producto_Subproceso f ON f.id_tipo_producto=t.id_tipo_producto
      LEFT JOIN Estado_Subprocesos s ON s.id_estado_subproceso=f.id_estado_subproceso
      LEFT JOIN Avance_Lanyard a ON a.id_avance_lanyard=(SELECT latest.id_avance_lanyard FROM Avance_Lanyard latest
        WHERE latest.id_detalle_pedido=d.id_detalle_pedido ORDER BY latest.fecha_produccion DESC, latest.id_avance_lanyard DESC LIMIT 1)
      WHERE d.id_pedido=${orderId} ORDER BY d.id_detalle_pedido ASC, f.orden_flujo ASC`,
    precheck ? [] : client.$queryRaw`SELECT r.ID_REGISTRO, r.FECHA_HORA, r.observacion, s.id_detalle_pedido, es.nombre_estado
      FROM Registros r JOIN registro_subprocesos s ON s.id_registro=r.ID_REGISTRO
      LEFT JOIN Estado_Subprocesos es ON es.id_estado_subproceso=s.id_estado_subproceso
      WHERE r.id_pedido=${orderId} ORDER BY r.FECHA_HORA ASC, r.ID_REGISTRO ASC`,
    precheck ? [] : client.$queryRaw`SELECT cp.id_comentario_produccion, cp.comentario, cp.fecha_comentario, cp.id_detalle_pedido
      FROM Comentario_Produccion cp JOIN Detalle_pedido d ON d.id_detalle_pedido=cp.id_detalle_pedido
      WHERE d.id_pedido=${orderId} ORDER BY cp.id_detalle_pedido ASC, cp.fecha_comentario ASC, cp.id_comentario_produccion ASC`,
  ]);
  if (!roots.length) return null;
  const order = root(roots[0]), details = new Map();
  for (const row of rows) {
    if (!details.has(row.id_detalle_pedido)) details.set(row.id_detalle_pedido, {
      id_detalle_pedido: row.id_detalle_pedido, cantidad: row.cantidad, fecha_estimada_termino: row.fecha_estimada_termino,
      fecha_real_termino: row.fecha_real_termino, id_estado_subproceso: row.id_estado_subproceso,
      Tipo_Producto: { nombre_producto: row.nombre_producto, Producto_Subproceso: [] },
      Avance_Lanyard: row.id_avance_lanyard === null ? [] : [{ cantidad_acumulada: row.cantidad_acumulada,
        porcentaje_acumulado: row.porcentaje_acumulado, fecha_actualizacion: row.fecha_actualizacion, fecha_produccion: row.fecha_produccion }],
      Comentario_Produccion: [],
    });
    if (row.flowId !== null) details.get(row.id_detalle_pedido).Tipo_Producto.Producto_Subproceso.push({
      id_estado_subproceso: row.flowId, orden_flujo: row.orden_flujo, Estado_Subprocesos: { nombre_estado: row.nombre_estado },
    });
  }
  for (const comment of comments) details.get(comment.id_detalle_pedido)?.Comentario_Produccion.push(comment);
  order.Detalle_pedido = [...details.values()];
  order.Registros = records.map(row => ({ ...row, registro_subprocesos: {
    id_detalle_pedido: row.id_detalle_pedido, Estado_Subprocesos: { nombre_estado: row.nombre_estado },
  } }));
  return order;
}

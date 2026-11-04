import { readProductFlow } from './productFlow.js';
import { supportsOrderSnapshots, snapshotOmit, snapshotData } from './orderSnapshotSchema.js';
import { createLineSnapshots, salesNoteLineIdentity } from '../service/salesOrder.snapshot.js';
import { AppError } from '../../../errors/AppError.js';
import { ROLES } from '../../../config/roles.js';

export async function reevaluateFromSalesNoteOperation(repository, { orderId, salesNote, userId, compact = false }) {
  const snapshotsSupported = await supportsOrderSnapshots(repository.client);
  const order = await repository.client.pedidos.findUnique({
    where: { id_pedido: Number(orderId) },
    include: {
      Detalle_pedido: {
        orderBy: { id_detalle_pedido: "asc" },
        include: {
          Avance_Lanyard: { orderBy: { id_avance_lanyard: "desc" }, take: 1 },
          _count: { select: { Comentario_Produccion: true, registro_subprocesos: true, Avance_Lanyard: true } },
        },
        ...snapshotOmit(snapshotsSupported),
      },
    },
  });
  if (!order) return null;

  await repository.client.cliente.update({
    where: { id_cliente: order.id_cliente },
    data: {
      rut_cliente: salesNote.cliente?.rut,
      nombre_cliente: salesNote.cliente?.nombre,
      razon_social: salesNote.cliente?.nombre,
    },
  });
  await repository.client.pedidos.update({
    where: { id_pedido: Number(orderId) },
    data: {
      usuario_manager_origen: salesNote.origen?.usuarioManager ?? null,
      observacion_origen: salesNote.observaciones ?? null,
    },
  });

  const snapshots = createLineSnapshots(salesNote.items ?? []);
  const incomingByIdentity = new Map();
  for (const [index, item] of (salesNote.items ?? []).entries()) {
    const identity = salesNoteLineIdentity(item);
    if (incomingByIdentity.has(identity)) {
      const error = new AppError(409, "La Nota de Venta contiene lineas productivas ambiguas o duplicadas.");
      throw error;
    }
    incomingByIdentity.set(identity, { item, index });
  }
  const existingByIdentity = new Map();
  for (const detail of order.Detalle_pedido) {
    const identity = salesNoteLineIdentity(detail);
    if (existingByIdentity.has(identity)) {
      const error = new AppError(409, "El pedido contiene lineas de origen ambiguas y requiere revision manual.");
      throw error;
    }
    existingByIdentity.set(identity, detail);
  }

  const removed = [...existingByIdentity.entries()].filter(([identity]) => !incomingByIdentity.has(identity));
  for (const [, detail] of removed) {
    const activityCount = Number(detail._count?.Comentario_Produccion ?? 0) +
      Number(detail._count?.registro_subprocesos ?? 0) + Number(detail._count?.Avance_Lanyard ?? 0);
    if (activityCount > 0 || detail.fecha_real_termino) {
      const error = new AppError(409, "No se puede eliminar una linea con progreso o historial productivo.");
      throw error;
    }
  }

  // Preserve the database's equality/collation semantics: one lookup per distinct
  // requested name inside this transaction, including a cached missing result.
  const types = new Map();
  const firstSubprocesses = new Map();
  for (const [index, item] of (salesNote.items ?? []).entries()) {
    if (!types.has(item.tipoProducto)) types.set(item.tipoProducto, await repository.client.tipo_Producto.findFirst({
      where: { nombre_producto: item.tipoProducto },
    }));
    const type = types.get(item.tipoProducto);
    if (!type) throw new AppError(500, "Configuracion inconsistente: tipo de producto ausente.", "INVALID_PRODUCT_FLOW");
    if (!firstSubprocesses.has(type.id_tipo_producto)) {
      firstSubprocesses.set(type.id_tipo_producto, (await readProductFlow(repository.client, type.id_tipo_producto))[0]);
    }
    const first = firstSubprocesses.get(type.id_tipo_producto);
    const existing = existingByIdentity.get(salesNoteLineIdentity(item));
    if (existing) {
      const accumulated = Number(existing.Avance_Lanyard?.[0]?.cantidad_acumulada ?? 0);
      if (Number(item.cantidad) < accumulated ||
        (existing.id_tipo_producto && Number(existing.id_tipo_producto) !== Number(type.id_tipo_producto) &&
          (Number(existing._count?.registro_subprocesos ?? 0) > 0 || accumulated > 0))) {
        const error = new AppError(409, "La reevaluacion es incompatible con el progreso productivo existente.");
        throw error;
      }
      await repository.client.detalle_pedido.update({
        where: { id_detalle_pedido: existing.id_detalle_pedido },
        data: snapshotData({ ...snapshots[index], cantidad: Number(item.cantidad), id_tipo_producto: type.id_tipo_producto,
          ...(existing.id_tipo_producto !== type.id_tipo_producto ? { id_estado_subproceso: first.id_estado_subproceso, fecha_real_termino: null } : {}),
        }, snapshotsSupported),
        ...snapshotOmit(snapshotsSupported),
      });
    } else {
      await repository.client.detalle_pedido.create({ data: {
        ...snapshotData(snapshots[index], snapshotsSupported),
        id_pedido: Number(orderId), id_tipo_producto: type.id_tipo_producto,
        cantidad: Number(item.cantidad), fecha_estimada_termino: order.fecha_estimada_termino ?? null,
        id_estado_subproceso: first.id_estado_subproceso,
      }, ...snapshotOmit(snapshotsSupported) });
    }
  }

  if (removed.length > 0) {
    await repository.client.detalle_pedido.deleteMany({
      where: { id_detalle_pedido: { in: removed.map(([, detail]) => detail.id_detalle_pedido) } },
    });
  }

  const updated = await repository.transitionGeneralStage({
    id: orderId, ordenKanban: 1, userId, compact,
    comment: "Pedido reevaluado desde la Nota de Venta y enviado a Listo para Produccion.",
  });

  const administrators = await repository.client.usuario.findMany({
    where: { rol_usuario: ROLES.ADMINISTRADOR, NOT: { estado_usuario: "Desvinculado" } },
    select: { id_usuario: true },
  });
  if (administrators.length > 0) {
    const message = await repository.client.mensaje.create({ data: {
      id_pedido: Number(orderId), fecha_publicacion: new Date(),
      Asunto: "Revision de pedido resuelta",
      contenido: `La revision del pedido ${salesNote.numeroNota} fue resuelta por Ventas.`,
    } });
    await repository.client.mENSAJE_USUARIO.createMany({
      data: administrators.map(({ id_usuario }) => ({ id_usuario, id_mensaje: message.id_mensaje, leido_: false, oculto_: false })),
      skipDuplicates: true,
    });
  }
  return updated;
}

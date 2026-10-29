import { AppError } from '../../../errors/AppError.js';
import { isLanyardProduct } from './orderProductionRules.js';
import { hasValidProductionSchedule, PRODUCTION_SCHEDULE_REQUIRED_MESSAGE } from '../../../../../shared/productionScheduling.js';

export async function transitionGeneralStageOperation(repository, { id, ordenKanban, statusName, userId, comment, now = new Date(), compact = false, expectedState }) {
  const status = await repository.client.estado_Pedido.findFirst({
    where: statusName
      ? { nombre_etapa: statusName }
      : { orden_kanban: Number(ordenKanban) },
    select: { id_estado_pedido: true, orden_kanban: true, nombre_etapa: true },
  });

  if (!status) return null;

  try {
    const transition = await repository.client.pedidos.updateMany({
      where: {
        id_pedido: Number(id),
        NOT: { id_estado_pedido: status.id_estado_pedido },
        ...(expectedState ? {
          id_estado_pedido: expectedState.id_estado_pedido,
          id_estado_pago: expectedState.id_estado_pago,
        } : {}),
      },
      data: {
        id_estado_pedido: status?.id_estado_pedido ?? null,
      },
    });

    // Evita duplicar registros si la misma transición llega más de una vez.
    if (transition.count !== 1) {
      if (expectedState) {
        const error = new AppError(409, "El pedido cambio mientras se procesaba la solicitud. Actualiza el tablero e intenta nuevamente.");
        throw error;
      }
      return null;
    }

    await repository.client.registro_Etapas.updateMany({
      where: {
        fecha_hora_salida: null,
        Registros: { id_pedido: Number(id) },
      },
      data: { fecha_hora_salida: now },
    });

    const registry = await repository.client.registros.create({
      data: {
        FECHA_HORA: now,
        id_pedido: Number(id),
        id_usuario: Number(userId),
        observacion: comment?.trim() || null,
      },
    });

    await repository.client.registro_Etapas.create({
      data: {
        id_registro: registry.ID_REGISTRO,
        fecha_hora_entrada: now,
        fecha_hora_salida: null,
        id_estado_pedido: status.id_estado_pedido,
      },
    });
  } catch (error) {
    if (error?.code === "P2025") return null;
    throw error;
  }

  if (Number(status.orden_kanban) === 3) {
    const responsibleOrder = await repository.client.pedidos.findUnique({
      where: { id_pedido: Number(id) },
      select: { id_pedido: true, id_usuario: true, numero_nota_venta: true },
    });
    await repository.notifyOrderReady(responsibleOrder, now);
  }
  if (compact) {
    return {
      id_pedido: Number(id),
      id_estado_pedido: status.id_estado_pedido,
      id_etapa_general: status.orden_kanban,
      generalStepId: status.orden_kanban,
      nombre_etapa_general: status.nombre_etapa,
    };
  }

  return repository.get(id);
}

export async function updateGeneralStepOperation(repository, id, ordenKanban, audit = {}) {
  if (Number(ordenKanban) === 2) {
    await repository.lockProductionOrder(id);
    const current = await repository.getTransitionState(id);
    if (!current || Number(current.id_etapa_general) !== 1 || current.estado_pago !== 'Confirmado') {
      throw new AppError(409, 'El pedido no esta en la etapa requerida o no tiene el pago confirmado.');
    }
    if (!hasValidProductionSchedule(current.fecha_estimada_termino)) {
      throw new AppError(409, PRODUCTION_SCHEDULE_REQUIRED_MESSAGE, 'PRODUCTION_SCHEDULE_REQUIRED');
    }
  }
  if ([3, 4].includes(Number(ordenKanban))) {
    await repository.lockProductionOrder(id);
    const current = await repository.getTransitionState(id);
    if (!current || Number(current.id_etapa_general) !== Number(ordenKanban) - 1 || current.estado_pago !== "Confirmado") {
      throw new AppError(409, "El pedido no esta en la etapa requerida o no tiene el pago confirmado.");
    }
    const details = await repository.client.detalle_pedido.findMany({
      where: { id_pedido: Number(id) },
      select: {
        fecha_real_termino: true,
        id_estado_subproceso: true,
        Tipo_Producto: { select: {
          nombre_producto: true,
          Producto_Subproceso: {
            orderBy: { orden_flujo: "asc" },
            select: { id_estado_subproceso: true },
          },
        } },
        Avance_Lanyard: {
          orderBy: [{ fecha_produccion: "desc" }, { id_avance_lanyard: "desc" }],
          take: 1,
          select: { porcentaje_acumulado: true },
        },
      },
    });
    if (details.length === 0 || details.some((detail) => {
      const processes = detail.Tipo_Producto?.Producto_Subproceso ?? [];
      return !detail.fecha_real_termino || !processes.length
        || Number(processes.at(-1).id_estado_subproceso) !== Number(detail.id_estado_subproceso)
        || (isLanyardProduct(detail.Tipo_Producto?.nombre_producto) && Number(detail.Avance_Lanyard?.[0]?.porcentaje_acumulado ?? 0) < 100);
    })) {
      const error = new AppError(409, "Todos los detalles deben completar sus subprocesos antes de pasar a Listo para Entrega.");
      throw error;
    }
  }
  return repository.transitionGeneralStage({
    id,
    ordenKanban,
    ...(Number(ordenKanban) === 4 ? { statusName: "Terminado" } : {}),
    userId: audit.userId,
    comment: audit.comment,
    now: audit.now,
    compact: true,
    expectedState: audit.expectedState,
  });
}

export async function sendToReviewOperation(repository, id, audit = {}) {
  const updatedOrder = await repository.transitionGeneralStage({
    id,
    statusName: "En revisión",
    userId: audit.userId,
    comment: audit.comment,
    now: audit.now,
    compact: audit.compact,
  });

  if (!updatedOrder) return updatedOrder;
  // Read the persisted owner inside the current transaction. Public order DTOs
  // intentionally omit internal user IDs and cannot identify the recipient.
  const responsibleOrder = await repository.client.pedidos.findUnique({
    where: { id_pedido: Number(id) },
    select: { id_usuario: true, numero_nota_venta: true },
  });
  const responsibleUserId = Number(responsibleOrder?.id_usuario);
  if (!updatedOrder || !Number.isInteger(responsibleUserId) || responsibleUserId <= 0) {
    return updatedOrder;
  }

  const message = await repository.client.mensaje.create({
    data: {
      id_pedido: Number(id),
      fecha_publicacion: audit.now ?? new Date(),
      Asunto: "Pedido enviado a revisión",
      contenido: [
        `El pedido ${responsibleOrder?.numero_nota_venta ?? updatedOrder.numero_nota_venta ?? `#${id}`} fue enviado a revisión por Producción.`,
        audit.comment ? `Observación: ${audit.comment}` : null,
      ].filter(Boolean).join("\n"),
    },
  });

  await repository.client.mENSAJE_USUARIO.create({
    data: {
      id_usuario: responsibleUserId,
      id_mensaje: message.id_mensaje,
      leido_: false,
      oculto_: false,
    },
  });

  return updatedOrder;
}

export async function cancelProductionOperation(repository, id, audit = {}) {
  return repository.transitionGeneralStage({
    id,
    statusName: "Cancelado",
    userId: audit.userId,
    comment: audit.comment,
    now: audit.now,
    compact: audit.compact,
  });
}

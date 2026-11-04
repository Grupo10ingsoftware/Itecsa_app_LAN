import { AppError } from "../../../errors/AppError.js";
import getPrismaClient from "../../../database/prisma.js";
import { Prisma } from "@prisma/client";
import { snapshotOmit, supportsOrderSnapshots } from "../../orders/repo/orderSnapshotSchema.js";

import { PRODUCT_ID, isValidLanyardCapacity } from "../../../../../shared/businessCatalog.js";
const KANBAN_EN_PRODUCCION_STEP = 2;

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isLanyardName(value) {
  return normalizeText(value).includes("lanyard");
}

function toDateOnly(dateKey) {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

function deduplicateEntries(entries = []) {
  const byDetailId = new Map();

  for (const entry of entries) {
    byDetailId.set(Number(entry.detailId), {
      detailId: Number(entry.detailId),
      quantity: Number(entry.quantity),
      observation: entry.observation,
    });
  }

  return [...byDetailId.values()];
}

function firstProgressByDetail(records = []) {
  const progressByDetail = new Map();

  for (const record of records) {
    const detailId = Number(record.id_detalle_pedido);

    if (!progressByDetail.has(detailId)) {
      progressByDetail.set(detailId, record);
    }
  }

  return progressByDetail;
}

export default class ProductionLoadRepository {
  constructor({ prisma } = {}) {
    this.prisma = prisma;
  }

  get client() {
    if (!this.prisma) this.prisma = getPrismaClient();
    return this.prisma;
  }

  async getCapacity() {
    const product = await this.client.tipo_Producto.findUnique({ where: { id_tipo_producto: PRODUCT_ID.LANYARD }, select: { capacidad_diaria: true } });
    if (!isValidLanyardCapacity(product?.capacidad_diaria)) {
      throw new AppError(500, "Configuracion inconsistente: falta una capacidad valida para Lanyard.", "INVALID_PRODUCTION_CAPACITY");
    }
    return product.capacidad_diaria;
  }

  async listLanyardDetails(dateKey) {
    const date = toDateOnly(dateKey);
    const rows = await this.client.$queryRaw`SELECT d.id_detalle_pedido, d.id_pedido, d.cantidad,
      COALESCE(d.fecha_estimada_termino,p.fecha_estimada_termino) AS dueDate,
      p.numero_nota_venta, c.nombre_cliente, c.razon_social, t.nombre_producto, ep.nombre_etapa, ep.orden_kanban,
      latest.id_avance_lanyard AS latestId, latest.cantidad_acumulada, latest.porcentaje_acumulado,
      today.id_avance_lanyard AS todayId, today.cantidad_dia
      FROM Detalle_pedido d JOIN Tipo_Producto t ON t.id_tipo_producto=d.id_tipo_producto
      JOIN Pedidos p ON p.id_pedido=d.id_pedido JOIN Estado_Pedido ep ON ep.id_estado_pedido=p.id_estado_pedido
      LEFT JOIN Cliente c ON c.id_cliente=p.id_cliente
      LEFT JOIN Avance_Lanyard latest ON latest.id_avance_lanyard=(SELECT a.id_avance_lanyard FROM Avance_Lanyard a
        WHERE a.id_detalle_pedido=d.id_detalle_pedido AND a.fecha_produccion<=${date}
        ORDER BY a.fecha_produccion DESC,a.id_avance_lanyard DESC LIMIT 1)
      LEFT JOIN Avance_Lanyard today ON today.id_detalle_pedido=d.id_detalle_pedido AND today.fecha_produccion=${date}
      WHERE t.nombre_producto LIKE ${'%Lanyard%'} AND ep.orden_kanban=${KANBAN_EN_PRODUCCION_STEP}
      ORDER BY d.id_pedido ASC,d.id_detalle_pedido ASC`;
    return rows.map(row => ({ detailId: row.id_detalle_pedido, orderId: row.id_pedido,
      salesNoteNumber: row.numero_nota_venta ?? null, clientName: row.nombre_cliente ?? row.razon_social ?? null,
      productType: row.nombre_producto ?? null, quantity: Number(row.cantidad ?? 0), dueDate: row.dueDate ?? null,
      orderStatus: row.nombre_etapa ?? null, generalStepId: row.orden_kanban ?? null,
      dailyQuantity: Number(row.cantidad_dia ?? 0), accumulatedQuantity: Number(row.cantidad_acumulada ?? 0),
      remainingQuantity: Math.max(0, Number(row.cantidad ?? 0) - Number(row.cantidad_acumulada ?? 0)),
      progressPercentage: Number(row.porcentaje_acumulado ?? 0), todayProgressId: row.todayId ?? null, latestProgressId: row.latestId ?? null,
    }));
  }

  async updateDailyLoads({ dateKey, entries, userId }) {
    const date = toDateOnly(dateKey);
    const normalizedEntries = deduplicateEntries(entries);

    if (normalizedEntries.length === 0) {
      return undefined;
    }

    return this.client.$transaction(async (tx) => {
      const capacity = await new ProductionLoadRepository({ prisma: tx }).getCapacity();
      const detailIds = normalizedEntries.map((entry) => entry.detailId);
      const details = await tx.detalle_pedido.findMany({
        ...snapshotOmit(await supportsOrderSnapshots(tx)),
        where: { id_detalle_pedido: { in: detailIds } },
        include: {
          Tipo_Producto: true,
          Pedidos: { include: { Estado_Pedido: true } },
        },
      });
      const detailsById = new Map(details.map((detail) => [Number(detail.id_detalle_pedido), detail]));

      if (detailsById.size !== detailIds.length) {
        const error = new AppError(404, "Detalle de pedido no encontrado.");
        throw error;
      }

      const previousProgress = firstProgressByDetail(await tx.avance_Lanyard.findMany({
        where: {
          id_detalle_pedido: { in: detailIds },
          fecha_produccion: { lt: date },
        },
        orderBy: [
          { id_detalle_pedido: "asc" },
          { fecha_produccion: "desc" },
          { id_avance_lanyard: "desc" },
        ],
      }));
      const rows = normalizedEntries.map((entry) => {
        const detail = detailsById.get(entry.detailId);
        const dailyQuantity = Number(entry.quantity);

        if (!isLanyardName(detail.Tipo_Producto?.nombre_producto)) {
          const error = new AppError(400, "Solo se puede registrar carga para detalles Lanyard.");
          throw error;
        }

        if (Number(detail.Pedidos?.Estado_Pedido?.orden_kanban) !== KANBAN_EN_PRODUCCION_STEP) {
          const error = new AppError(409, "La carga operativa solo considera pedidos En produccion.");
          throw error;
        }

        const totalQuantity = Number(detail.cantidad ?? 0);
        if (!Number.isInteger(totalQuantity) || totalQuantity <= 0) {
          const error = new AppError(409, "El detalle Lanyard no tiene una cantidad valida.");
          throw error;
        }

        const previous = previousProgress.get(entry.detailId);
        const accumulated = Number(previous?.cantidad_acumulada ?? 0) + dailyQuantity;

        if (accumulated > totalQuantity) {
          const error = new AppError(400, "La carga diaria supera la cantidad pendiente del detalle Lanyard.");
          throw error;
        }

        return {
          detailId: entry.detailId,
          dailyQuantity,
          accumulated,
          percentage: Math.round((accumulated / totalQuantity) * 10000) / 100,
          observation: entry.observation?.trim() || null,
        };
      });

      const values = Prisma.join(rows.map((row) => Prisma.sql`(
        ${row.detailId},
        ${date},
        ${row.dailyQuantity},
        ${row.accumulated},
        ${row.percentage},
        ${capacity},
        ${Number(userId)},
        ${row.observation}
      )`));

      await tx.$executeRaw`
        INSERT INTO Avance_Lanyard (
          id_detalle_pedido,
          fecha_produccion,
          cantidad_dia,
          cantidad_acumulada,
          porcentaje_acumulado,
          capacidad_diaria_referencia,
          id_usuario_registra,
          observacion
        )
        VALUES ${values}
        ON DUPLICATE KEY UPDATE
          cantidad_dia = VALUES(cantidad_dia),
          cantidad_acumulada = VALUES(cantidad_acumulada),
          porcentaje_acumulado = VALUES(porcentaje_acumulado),
          capacidad_diaria_referencia = VALUES(capacidad_diaria_referencia),
          id_usuario_registra = VALUES(id_usuario_registra),
          observacion = VALUES(observacion)
      `;
    }, { timeout: 15000 });
  }
}

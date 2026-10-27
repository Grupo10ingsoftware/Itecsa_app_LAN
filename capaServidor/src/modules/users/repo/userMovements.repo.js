import { Prisma } from '@prisma/client';
import { UserRepository } from './users.repo.js';

// Administrative projection only. Profile keeps its existing repository contract.
export class UserMovementsRepository {
  constructor({ prisma }) { this.client = prisma; }

  async list(userId, { page = 1, perPage = 10, search = '' } = {}) {
    const where = new UserRepository({ prisma: this.client }).buildRecordsWhere(userId, { search });
    const conditions = [Prisma.sql`r.id_usuario = ${userId}`];
    if (search) {
      const term = search.replace(/^(Estado de pago|Etapa del pedido|Subproceso):\s*/i, '').trim() || search;
      const id = /^\d+$/.test(search) ? Number(search) : null;
      const pattern = `%${term}%`;
      const matches = [Prisma.sql`r.observacion LIKE ${pattern}`, Prisma.sql`ep.nombre_estado_pago LIKE ${pattern}`,
        Prisma.sql`et.nombre_etapa LIKE ${pattern}`, Prisma.sql`es.nombre_estado LIKE ${pattern}`];
      if (Number.isSafeInteger(id)) matches.unshift(Prisma.sql`r.ID_REGISTRO = ${id}`);
      conditions.push(Prisma.sql`(${Prisma.join(matches, ' OR ')})`);
    }
    // Each child has a unique id_registro: joins cannot duplicate a historical row.
    const [rows, total] = await Promise.all([
      this.client.$queryRaw(Prisma.sql`SELECT r.ID_REGISTRO, r.FECHA_HORA, r.observacion,
        p.id_registro AS paymentId, ep.nombre_estado_pago AS paymentName,
        e.id_registro AS stageId, et.nombre_etapa AS stageName,
        s.id_registro AS subprocessId, es.nombre_estado AS subprocessName
        FROM Registros r
        LEFT JOIN Registro_Pago p ON p.id_registro = r.ID_REGISTRO
        LEFT JOIN Estado_Pago ep ON ep.id_estado_pago = p.id_estado_pago_nuevo
        LEFT JOIN Registro_Etapas e ON e.id_registro = r.ID_REGISTRO
        LEFT JOIN Estado_Pedido et ON et.id_estado_pedido = e.id_estado_pedido
        LEFT JOIN registro_subprocesos s ON s.id_registro = r.ID_REGISTRO
        LEFT JOIN Estado_Subprocesos es ON es.id_estado_subproceso = s.id_estado_subproceso
        WHERE ${Prisma.join(conditions, ' AND ')}
        ORDER BY r.FECHA_HORA DESC, r.ID_REGISTRO DESC LIMIT ${perPage} OFFSET ${(page - 1) * perPage}`),
      this.client.registros.count({ where }),
    ]);
    const records = rows.map(row => ({ id: row.ID_REGISTRO, dateTime: row.FECHA_HORA,
      detail: row.paymentId !== null ? `Estado de pago: ${row.paymentName ?? 'No informado'}`
        : row.stageId !== null ? `Etapa del pedido: ${row.stageName ?? 'No informada'}`
          : row.subprocessId !== null ? `Subproceso: ${row.subprocessName ?? 'No informado'}`
            : row.observacion?.trim() || 'Actividad del pedido' }));
    return { records, total, page, perPage };
  }
}

import { Prisma } from '@prisma/client';

// Every child is keyed by id_registro: LEFT JOIN preserves untyped records and
// cannot multiply rows. Presence (not the nullable state name) determines detail.
const joins = Prisma.sql`
    LEFT JOIN Registro_Pago rp ON rp.id_registro = r.ID_REGISTRO
    LEFT JOIN Estado_Pago ep ON ep.id_estado_pago = rp.id_estado_pago_nuevo
    LEFT JOIN Registro_Etapas re ON re.id_registro = r.ID_REGISTRO
    LEFT JOIN Estado_Pedido ee ON ee.id_estado_pedido = re.id_estado_pedido
    LEFT JOIN registro_subprocesos rs ON rs.id_registro = r.ID_REGISTRO
    LEFT JOIN Estado_Subprocesos es ON es.id_estado_subproceso = rs.id_estado_subproceso`;

function predicate(idUsuario, search) {
    if (!search) return Prisma.sql`r.id_usuario = ${idUsuario}`;
    const term = search.replace(/^(Estado de pago|Etapa del pedido|Subproceso):\s*/i, '').trim() || search;
    const id = /^\d+$/.test(search) ? Number(search) : null;
    // Match Prisma contains, including MySQL collation and LIKE wildcards.
    const pattern = `%${term}%`;
    return Prisma.sql`r.id_usuario = ${idUsuario} AND (
        ${Number.isSafeInteger(id) ? Prisma.sql`r.ID_REGISTRO = ${id} OR` : Prisma.empty}
        r.observacion LIKE ${pattern} OR ep.nombre_estado_pago LIKE ${pattern}
        OR ee.nombre_etapa LIKE ${pattern} OR es.nombre_estado LIKE ${pattern})`;
}

export function movementsQuery(idUsuario, { page = 1, perPage = 10, search = '' } = {}) {
    return Prisma.sql`SELECT r.ID_REGISTRO AS id, r.FECHA_HORA AS dateTime, r.observacion,
        rp.id_registro AS paymentId, ep.nombre_estado_pago AS paymentName,
        re.id_registro AS stageId, ee.nombre_etapa AS stageName,
        rs.id_registro AS subprocessId, es.nombre_estado AS subprocessName
        FROM Registros r ${joins} WHERE ${predicate(idUsuario, search)}
        ORDER BY r.FECHA_HORA DESC, r.ID_REGISTRO DESC
        LIMIT ${perPage} OFFSET ${(page - 1) * perPage}`;
}

export function movementsCountQuery(idUsuario, { search = '' } = {}) {
    return Prisma.sql`SELECT COUNT(*) AS total FROM Registros r
        ${search ? joins : Prisma.empty} WHERE ${predicate(idUsuario, search)}`;
}

export function mapMovement(row) {
    return {
        id: Number(row.id), dateTime: row.dateTime,
        detail: row.paymentId != null ? `Estado de pago: ${row.paymentName ?? 'No informado'}`
            : row.stageId != null ? `Etapa del pedido: ${row.stageName ?? 'No informada'}`
                : row.subprocessId != null ? `Subproceso: ${row.subprocessName ?? 'No informado'}`
                    : row.observacion?.trim() || 'Actividad del pedido',
    };
}

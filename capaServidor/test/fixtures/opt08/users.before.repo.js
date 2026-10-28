import { identityKey, identityUserWhere } from '../../../src/database/identityBinding.js';
import getPrismaClient from "../../../src/database/prisma.js";
import {
    USER_STATUS,
} from "../../../src/config/userLifecycle.js";

export const USER_RESPONSE_SELECT = Object.freeze({
    id_usuario: true,
    ExternalIdentity: { select: { provider: true, issuer: true, subject: true } },
    correo_usuario: true,
    rut_usuario: true,
    nombre_usuario: true,
    apellido_usuario: true,
    rol_usuario: true,
    estado_usuario: true,
});

export class UserRepositoryError extends Error {
    constructor(code, message) {
        super(message);
        this.name = "UserRepositoryError";
        this.code = code;
    }
}

function mapRepositoryError(error) {
    if (error?.code === "P2025") {
        return new UserRepositoryError(
            "USER_NOT_FOUND",
            "No existe un usuario interno con ese identificador.",
        );
    }

    if (error?.code === "P2002") {
        return new UserRepositoryError(
            "USER_ALREADY_EXISTS",
            "Ya existe un usuario interno con ese correo o identificador externo.",
        );
    }

    return new UserRepositoryError(
        "USER_REPOSITORY_ERROR",
        "No fue posible operar sobre el usuario interno.",
    );
}

export class UserRepository {
    constructor({ prisma } = {}) {
        this.prisma = prisma;
    }

    get client() {
        if (!this.prisma) {
            this.prisma = getPrismaClient();
        }

        return this.prisma;
    }

    async findBySubject(identitySubject) {
        try {
            const { provider, issuer, subject } = identityKey(identitySubject);
            // A single indexed lookup preserves the binding scope and DTO without
            // Prisma's separate relation SELECT. Interpolations remain parameters.
            const users = await this.client.$queryRaw`
                SELECT u.id_usuario AS idUsuario, e.subject AS identitySubject,
                    u.correo_usuario AS correoUsuario, u.rut_usuario AS rutUsuario,
                    u.nombre_usuario AS nombreUsuario, u.apellido_usuario AS apellidoUsuario,
                    u.rol_usuario AS rolUsuario, u.estado_usuario AS estadoUsuario
                FROM ExternalIdentity e
                INNER JOIN Usuario u ON u.id_usuario = e.user_id
                WHERE e.provider = ${provider} AND e.issuer = ${issuer} AND e.subject = ${subject}
                LIMIT 1
            `;
            return users[0] ?? null;
        } catch (error) {
            throw mapRepositoryError(error);
        }
    }

    buildRecordsWhere(idUsuario, { search = '' } = {}) {
        if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
            throw new UserRepositoryError("USER_NOT_FOUND", "Usuario no válido.");
        }
        const where = { id_usuario: idUsuario };
        if (search) {
            const term = search.replace(/^(Estado de pago|Etapa del pedido|Subproceso):\s*/i, '').trim() || search;
            const id = /^\d+$/.test(search) ? Number(search) : null;
            where.OR = [
                ...(Number.isSafeInteger(id) ? [{ ID_REGISTRO: id }] : []),
                { observacion: { contains: term } },
                { Registro_Pago: { is: { Estado_Pago_Registro_Pago_id_estado_pago_nuevoToEstado_Pago: { is: { nombre_estado_pago: { contains: term } } } } } },
                { Registro_Etapas: { is: { Estado_Pedido: { is: { nombre_etapa: { contains: term } } } } } },
                { registro_subprocesos: { is: { Estado_Subprocesos: { is: { nombre_estado: { contains: term } } } } } },
            ];
        }
        return where;
    }

    async listRecentRecords(idUsuario, { page = 1, perPage = 10, search = '' } = {}) {
        const records = await this.client.registros.findMany({
            where: this.buildRecordsWhere(idUsuario, { search }),
            orderBy: [{ FECHA_HORA: "desc" }, { ID_REGISTRO: "desc" }],
            skip: (page - 1) * perPage,
            take: perPage,
            select: {
                ID_REGISTRO: true,
                FECHA_HORA: true,
                observacion: true,
                Registro_Pago: { select: {
                    Estado_Pago_Registro_Pago_id_estado_pago_nuevoToEstado_Pago: {
                        select: { nombre_estado_pago: true },
                    },
                } },
                Registro_Etapas: { select: {
                    Estado_Pedido: { select: { nombre_etapa: true } },
                } },
                registro_subprocesos: { select: {
                    Estado_Subprocesos: { select: { nombre_estado: true } },
                } },
            },
        });
        return records.map((record) => ({
            id: record.ID_REGISTRO,
            dateTime: record.FECHA_HORA,
            detail: record.Registro_Pago
                ? `Estado de pago: ${record.Registro_Pago.Estado_Pago_Registro_Pago_id_estado_pago_nuevoToEstado_Pago?.nombre_estado_pago ?? 'No informado'}`
                : record.Registro_Etapas
                    ? `Etapa del pedido: ${record.Registro_Etapas.Estado_Pedido?.nombre_etapa ?? 'No informada'}`
                    : record.registro_subprocesos
                        ? `Subproceso: ${record.registro_subprocesos.Estado_Subprocesos?.nombre_estado ?? 'No informado'}`
                        : record.observacion?.trim() || 'Actividad del pedido',
        }));
    }

    async listMovements(idUsuario, { page, perPage, search = '' }) {
        const [records, total] = await Promise.all([
            this.listRecentRecords(idUsuario, { page, perPage, search }),
            this.client.registros.count({ where: this.buildRecordsWhere(idUsuario, { search }) }),
        ]);
        return { records, total, page, perPage };
    }

    async activateOnFirstAccess(identitySubject, role) {
        try {
            await this.client.usuario.updateMany({
                where: {
                    ...identityUserWhere(identitySubject),
                    rol_usuario: role,
                    estado_usuario: USER_STATUS.PENDING_FIRST_LOGIN,
                },
                data: { estado_usuario: USER_STATUS.ACTIVE },
            });
            // La lectura posterior resuelve accesos concurrentes y revocaciones simultaneas.
            return this.findBySubject(identitySubject);
        } catch (error) {
            throw mapRepositoryError(error);
        }
    }
}

export default new UserRepository();

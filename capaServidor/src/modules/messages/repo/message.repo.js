import { inboxQuery, detailQuery, notificationsQuery, mapJoinedMessage } from './messageRead.repo.js';
import getPrismaClient from "../../../database/prisma.js";

class MessageRepository {
    constructor({ prisma } = {}) {
        this.prisma = prisma;
    }

    get client() {
        if (!this.prisma) {
            this.prisma = getPrismaClient();
        }

        return this.prisma;
    }

    buildInboxWhere({ userId, status = "all", from, to }) {
        const where = {
            id_usuario: Number(userId),
        };

        if (status === "read") {
            where.leido_ = true;
        }

        if (status === "unread") {
            where.leido_ = false;
        }

        if (from || to) {
            where.Mensaje = {
                fecha_publicacion: {
                    ...(from ? { gte: from } : {}),
                    ...(to ? { lte: to } : {}),
                },
            };
        }

        return where;
    }

    async listInbox({ userId, status, sort, from, to, page, perPage }) {
        const where = this.buildInboxWhere({
            userId,
            status,
            from,
            to,
        });

        const [rows, total] = await this.client.$transaction([
            this.client.$queryRaw(inboxQuery({ userId, status, sort, from, to, page, perPage })),
            this.client.mENSAJE_USUARIO.count({ where }),
        ]);

        return {
            messages: rows.map(mapJoinedMessage),
            total,
            page,
            perPage,
            totalPages: Math.ceil(total / perPage),
        };
    }

    async listNotifications(userId, limit) {
        return (await this.client.$queryRaw(notificationsQuery(userId, limit))).map(mapJoinedMessage);
    }

    async getNotificationSnapshot(userId, limit) {
        const rows = await this.client.$queryRaw(notificationsQuery(userId, limit, true));
        return { notifications: rows.filter(row => row.id_mensaje != null).map(mapJoinedMessage), unreadCount: Number(rows[0]?.unreadCount ?? 0) };
    }

    async countUnreadNotifications(userId) {
        return this.client.mENSAJE_USUARIO.count({
            where: {
                id_usuario: Number(userId),
                leido_: false,
                oculto_: false,
            },
        });
    }

    async findUserMessage(userId, messageId) {
        const rows = await this.client.$queryRaw(detailQuery(userId, messageId));
        return mapJoinedMessage(rows[0]);
    }

    async updateAssignment(userId, messageId, data) {
        await this.client.mENSAJE_USUARIO.updateMany({
            where: { id_usuario: Number(userId), id_mensaje: Number(messageId) }, data,
        });
        return this.findUserMessage(userId, messageId);
    }

    async markAsRead(userId, messageId) {
        return this.updateAssignment(userId, messageId, { leido_: true });
    }

    async hideNotification(userId, messageId) {
        return this.updateAssignment(userId, messageId, { oculto_: true });
    }

    async hideAllNotifications(userId) {
        return this.client.mENSAJE_USUARIO.updateMany({
            where: {
                id_usuario: Number(userId),
                oculto_: false,
            },
            data: {
                oculto_: true,
            },
        });
    }

    async create({
        orderId = null,
        contenido,
        asunto,
        recipientUserIds,
        fechaPublicacion = new Date(),
    }) {
        return this.client.$transaction(async (transaction) => {
            const message = await transaction.mensaje.create({
                data: {
                    contenido,
                    Asunto: asunto,
                    fecha_publicacion: fechaPublicacion,
                    id_pedido: orderId,
                },
            });

            await transaction.mENSAJE_USUARIO.createMany({
                data: recipientUserIds.map((userId) => ({
                    id_usuario: userId,
                    id_mensaje: message.id_mensaje,
                    leido_: false,
                    oculto_: false,
                })),
                skipDuplicates: true,
            });

            return transaction.mensaje.findUnique({
                where: {
                    id_mensaje: message.id_mensaje,
                },
                include: {
                    Pedidos: {
                        select: {
                            id_pedido: true,
                            numero_nota_venta: true,
                            fecha_creacion: true,
                            fecha_estimada_termino: true,
                        },
                    },
                    MENSAJE_USUARIO: {
                        select: {
                            id_usuario: true,
                            leido_: true,
                            oculto_: true,
                        },
                    },
                },
            });
        });
    }
}

export default MessageRepository;

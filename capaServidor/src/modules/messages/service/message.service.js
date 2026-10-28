import { AppError } from "../../../errors/AppError.js";
import MessageRepository from "../repo/message.repo.js";
import { UserRepository } from "../../users/repo/users.repo.js";
import { isActiveUserStatus } from '../../../config/userLifecycle.js';
import { createHash } from 'node:crypto';

const VALID_STATUSES = new Set(["all", "read", "unread"]);
const VALID_SORTS = new Set(["latest", "oldest"]);

function createHttpError(statusCode, message) {
    const error = new AppError(statusCode, message);
    return error;
}

function parsePositiveInteger(value, fieldName) {
    const parsed = Number(value);

    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw createHttpError(400, `${fieldName} debe ser un entero positivo.`);
    }

    return parsed;
}

function parseDate(value, fieldName, endOfDay = false) {
    if (!value) return undefined;

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        throw createHttpError(400, `${fieldName} no contiene una fecha valida.`);
    }

    if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        date.setUTCHours(23, 59, 59, 999);
    }

    return date;
}

class MessageService {
    constructor({ repo, userRepo } = {}) {
        this.repo = repo ?? new MessageRepository();
        this.userRepo = userRepo ?? new UserRepository();
    }

    async resolveUser(identitySubject, { currentUser } = {}) {
        if (!identitySubject) {
            throw createHttpError(401, "No se pudo identificar al usuario.");
        }

        // Only controllers may supply the current request's middleware-validated
        // actor, separately from body/query. Calls without HTTP context still resolve.
        if (currentUser !== undefined) {
            if (!Number.isSafeInteger(currentUser?.idUsuario) || currentUser.idUsuario <= 0 ||
                currentUser.identitySubject !== identitySubject || !isActiveUserStatus(currentUser.estadoUsuario)) {
                throw createHttpError(403, "No existe una identidad activa para esta sesion.");
            }
            return currentUser;
        }
        const user = await this.userRepo.findBySubject(identitySubject);

        if (!user) {
            throw createHttpError(404, "Usuario interno no encontrado.");
        }

        return user;
    }

    async getInbox(identitySubject, query = {}, context) {
        const user = await this.resolveUser(identitySubject, context);
        const status = query.status ?? "all";
        const sort = query.sort ?? "latest";

        if (!VALID_STATUSES.has(status)) {
            throw createHttpError(400, "status debe ser all, read o unread.");
        }

        if (!VALID_SORTS.has(sort)) {
            throw createHttpError(400, "sort debe ser latest u oldest.");
        }

        const page = query.page ? parsePositiveInteger(query.page, "page") : 1;
        const requestedPerPage = query.perPage
            ? parsePositiveInteger(query.perPage, "perPage")
            : 20;
        const perPage = Math.min(requestedPerPage, 100);
        const from = parseDate(query.from, "from");
        const to = parseDate(query.to, "to", true);

        if (from && to && from > to) {
            throw createHttpError(400, "La fecha inicial no puede ser posterior a la final.");
        }

        return this.repo.listInbox({
            userId: user.idUsuario,
            status,
            sort,
            from,
            to,
            page,
            perPage,
        });
    }

    async getNotifications(identitySubject, query = {}, context) {
        const user = await this.resolveUser(identitySubject, context);
        const requestedLimit = query.limit
            ? parsePositiveInteger(query.limit, "limit")
            : 10;
        const limit = Math.min(requestedLimit, 50);

        const snapshot = typeof this.repo.getNotificationSnapshot === 'function'
            ? await this.repo.getNotificationSnapshot(user.idUsuario, limit)
            : await Promise.all([
            this.repo.listNotifications(user.idUsuario, limit),
            this.repo.countUnreadNotifications(user.idUsuario),
        ]).then(([notifications, unreadCount]) => ({ notifications, unreadCount }));
        if (query.view === 'bell') {
            const notifications = snapshot.notifications.map(message => {
                const text = String(message.contenido ?? '').replace(/\s+/g, ' ').trim();
                return { id_mensaje: message.id_mensaje, Asunto: message.Asunto, fecha_publicacion: message.fecha_publicacion,
                    leido: message.leido, oculto: message.oculto, preview: text.slice(0, 82).trim(), truncated: text.length > 82 };
            });
            const revision = createHash('sha256').update(JSON.stringify([user.idUsuario, notifications, snapshot.unreadCount])).digest('hex');
            return query.revision === revision ? { unchanged: true, revision, unreadCount: snapshot.unreadCount }
                : { notifications, unreadCount: snapshot.unreadCount, revision };
        }

        return snapshot;
    }

    async getMessage(identitySubject, messageId, context) {
        const user = await this.resolveUser(identitySubject, context);
        const parsedMessageId = parsePositiveInteger(messageId, "messageId");
        const message = await this.repo.findUserMessage(user.idUsuario, parsedMessageId);

        if (!message) {
            throw createHttpError(404, "Mensaje no encontrado.");
        }

        return message;
    }

    async openMessage(identitySubject, messageId, context) {
        const user = await this.resolveUser(identitySubject, context);
        const id = parsePositiveInteger(messageId, 'messageId');
        const current = await this.repo.findUserMessage(user.idUsuario, id);
        if (!current) throw createHttpError(404, 'Mensaje no encontrado.');
        const markedAsRead = context?.canMarkRead === true && !current.leido;
        const message = markedAsRead ? await this.repo.markAsRead(user.idUsuario, id) : current;
        if (!message) throw createHttpError(404, 'Mensaje no encontrado.');
        return { message, markedAsRead };
    }

    async markAsRead(identitySubject, messageId, context) {
        const user = await this.resolveUser(identitySubject, context);
        const parsedMessageId = parsePositiveInteger(messageId, "messageId");
        const current = await this.repo.findUserMessage(user.idUsuario, parsedMessageId);

        if (!current) {
            throw createHttpError(404, "Mensaje no encontrado.");
        }

        if (current.leido) {
            return current;
        }

        const updated = await this.repo.markAsRead(user.idUsuario, parsedMessageId);
        if (!updated) throw createHttpError(404, 'Mensaje no encontrado.');
        return updated;
    }

    async hideNotification(identitySubject, messageId, context) {
        const user = await this.resolveUser(identitySubject, context);
        const parsedMessageId = parsePositiveInteger(messageId, "messageId");
        const current = await this.repo.findUserMessage(user.idUsuario, parsedMessageId);

        if (!current) {
            throw createHttpError(404, "Notificacion no encontrada.");
        }

        if (current.oculto) {
            return current;
        }

        const updated = await this.repo.hideNotification(user.idUsuario, parsedMessageId);
        if (!updated) throw createHttpError(404, 'Notificacion no encontrada.');
        return updated;
    }

    async clearNotifications(identitySubject, context) {
        const user = await this.resolveUser(identitySubject, context);
        const result = await this.repo.hideAllNotifications(user.idUsuario);

        return {
            hiddenCount: result.count,
        };
    }

    async createMessage({ orderId = null, contenido, asunto, recipientUserIds, fechaPublicacion }) {
        if (typeof contenido !== "string" || !contenido.trim()) {
            throw createHttpError(400, "El contenido del mensaje es obligatorio.");
        }

        if (typeof asunto !== "string" || !asunto.trim()) {
            throw createHttpError(400, "El asunto del mensaje es obligatorio.");
        }

        if (!Array.isArray(recipientUserIds) || recipientUserIds.length === 0) {
            throw createHttpError(400, "El mensaje debe tener al menos un destinatario.");
        }

        const normalizedUserIds = [
            ...new Set(
                recipientUserIds.map((userId) => parsePositiveInteger(userId, "recipientUserId")),
            ),
        ];
        const normalizedOrderId =
            orderId === null || orderId === undefined
                ? null
                : parsePositiveInteger(orderId, "orderId");
        const normalizedDate = fechaPublicacion
            ? parseDate(fechaPublicacion, "fechaPublicacion")
            : new Date();

        return this.repo.create({
            orderId: normalizedOrderId,
            contenido: contenido.trim(),
            asunto: asunto.trim(),
            recipientUserIds: normalizedUserIds,
            fechaPublicacion: normalizedDate,
        });
    }
}

export default MessageService;

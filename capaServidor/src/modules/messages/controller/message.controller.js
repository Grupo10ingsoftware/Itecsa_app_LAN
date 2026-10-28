import { respondError } from "../../../errors/httpErrors.js";
import { request, response } from "express";
import MessageService from "../service/message.service.js";
import { authorizationForProvider } from '../../../../../shared/identityAuthorization.js';
import { PERMISSIONS as P } from '../../../../../shared/authorization.js';

class MessageController {
    constructor({ service } = {}) {
        this.service = service ?? new MessageService();
    }

    getInbox = async (req = request, res = response) => {
        try {
            const result = await this.service.getInbox(req.auth?.payload?.sub, req.query, { currentUser: req.currentUser });

            return res.status(200).json(result);
        } catch (error) {
            return respondError(error, req, res);
        }
    };

    getNotifications = async (req = request, res = response) => {
        try {
            const result = await this.service.getNotifications(req.auth?.payload?.sub, req.query, { currentUser: req.currentUser });

            return res.status(200).json(result);
        } catch (error) {
            return respondError(error, req, res);
        }
    };

    getMessage = async (req = request, res = response) => {
        try {
            const result = await this.service.getMessage(
                req.auth?.payload?.sub,
                req.params.messageId,
                { currentUser: req.currentUser },
            );

            return res.status(200).json(result);
        } catch (error) {
            return respondError(error, req, res);
        }
    };

    openMessage = async (req = request, res = response) => {
        try {
            const policy = authorizationForProvider(req.identityProvider);
            const canMarkRead = policy?.can(policy.roleFromPayload(req.auth?.payload), req.auth?.payload?.permissions, P.UPDATE_MESSAGES) === true;
            return res.status(200).json(await this.service.openMessage(req.auth?.payload?.sub, req.params.messageId,
                { currentUser: req.currentUser, canMarkRead }));
        } catch (error) { return respondError(error, req, res); }
    };

    markAsRead = async (req = request, res = response) => {
        try {
            const result = await this.service.markAsRead(
                req.auth?.payload?.sub,
                req.params.messageId,
                { currentUser: req.currentUser },
            );

            return res.status(200).json(result);
        } catch (error) {
            return respondError(error, req, res);
        }
    };

    hideNotification = async (req = request, res = response) => {
        try {
            const result = await this.service.hideNotification(
                req.auth?.payload?.sub,
                req.params.messageId,
                { currentUser: req.currentUser },
            );

            return res.status(200).json(result);
        } catch (error) {
            return respondError(error, req, res);
        }
    };

    clearNotifications = async (req = request, res = response) => {
        try {
            const result = await this.service.clearNotifications(req.auth?.payload?.sub, { currentUser: req.currentUser });

            return res.status(200).json(result);
        } catch (error) {
            return respondError(error, req, res);
        }
    };
}

export default MessageController;

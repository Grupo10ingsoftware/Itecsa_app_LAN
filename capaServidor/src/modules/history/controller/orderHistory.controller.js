import { respondError } from "../../../errors/httpErrors.js";
import OrderHistoryService from "../service/orderHistory.service.js";
import { PERMISSIONS } from "../../../../../shared/authorization.js";
import { authorizationForProvider } from '../../../../../shared/identityAuthorization.js';

function mayReadPayments(req) {
    const payload = req.auth?.payload;
    const policy = authorizationForProvider(req.identityProvider);
    return policy?.can(policy.roleFromPayload(payload), payload?.permissions, PERMISSIONS.READ_PAYMENTS) === true;
}

export default class OrderHistoryController {
    constructor({ service } = {}) {
        this.service = service ?? new OrderHistoryService();
    }

    listOrders = async (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        try {
            return res.status(200).json(await this.service.listOrders(req.query));
        } catch (error) {
            return respondError(error, req, res);
        }
    };

    getOrderHistory = async (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        try {
            return res.status(200).json(
                await this.service.getOrderHistory(req.params.orderId, req.query, {
                    includePaymentDetails: mayReadPayments(req),
                }),
            );
        } catch (error) {
            return respondError(error, req, res);
        }
    };

    listOrderEvents = async (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        try {
            return res.status(200).json(
                await this.service.listOrderEvents(req.params.orderId, req.query, {
                    includePaymentDetails: mayReadPayments(req),
                }),
            );
        } catch (error) {
            return respondError(error, req, res);
        }
    };
}

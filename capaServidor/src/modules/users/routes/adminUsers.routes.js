import { Router } from "express";
import checkJwt from "../../../middlewares/checkJwt.js";
import requireAdministrativeRole from "../../../middlewares/requireAdministrativeRole.js";
import requirePin from "../../../middlewares/requirePin.js";
import pinService from "../../auth/service/pin.service.js";
import {
    createAdminUserHandler,
    createAdminUserMovementsHandler,
    createAdminUsersSummaryHandler,
    createListAdminUsersHandler,
    createPasswordSetupEmailHandler,
    createUpdateAdminUserHandler,
    createUpdateAdminUserStatusHandler,
} from "../controller/adminUsers.controller.js";

export function createAdminUsersRouter({
    authenticate = checkJwt,
    authorize = requireAdministrativeRole,
    createUser,
    requestPasswordEmail,
    updateUser,
    updateStatus,
    users,
    pins = pinService,
    validatePin = requirePin,
} = {}) {
    const router = Router();
    const requireAvailableAdministration = (req, res, next) => req.identityProvider === 'keycloak' || process.env.AUTH_PROVIDER === 'keycloak'
        ? res.status(503).json({ code: 'IDENTITY_PROVIDER_NOT_IMPLEMENTED', message: 'Gestion de usuarios no disponible en el piloto Keycloak.' })
        : next();
    router.get(
        "/users",
        authenticate,
        authorize,
        requireAvailableAdministration,
        createListAdminUsersHandler({ users }),
    );
    router.get(
        "/users/summary",
        authenticate,
        authorize,
        requireAvailableAdministration,
        createAdminUsersSummaryHandler({ users }),
    );
    router.get(
        "/users/:userId/movements",
        authenticate,
        authorize,
        requireAvailableAdministration,
        createAdminUserMovementsHandler({ users }),
    );
    router.post(
        "/users",
        authenticate,
        authorize,
        requireAvailableAdministration,
        createAdminUserHandler({ createUser, requestPasswordEmail, users, pins }),
    );
    router.post(
        "/users/password-setup-email",
        authenticate,
        authorize,
        requireAvailableAdministration,
        createPasswordSetupEmailHandler({ requestPasswordEmail, users }),
    );
    router.patch(
        "/users/:userId",
        authenticate,
        authorize,
        requireAvailableAdministration,
        validatePin,
        createUpdateAdminUserHandler({ updateUser, users }),
    );
    router.patch(
        "/users/:userId/status",
        authenticate,
        authorize,
        requireAvailableAdministration,
        validatePin,
        createUpdateAdminUserStatusHandler({ updateStatus, users, pins }),
    );
    return router;
}

export default createAdminUsersRouter();

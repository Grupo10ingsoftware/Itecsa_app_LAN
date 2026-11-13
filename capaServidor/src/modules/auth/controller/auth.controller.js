import { respondError } from "../../../errors/httpErrors.js";
import userRepository from "../../users/repo/users.repo.js";
import { ROLES } from "../../../config/roles.js";
import pinService from "../service/pin.service.js";
import { safeLogger } from "../../../shared/safeLogger.js";
import { validateUserMovementsQuery } from "../../users/validators/adminUsers.validator.js";
import { authorizationForProvider } from '../../../../../shared/identityAuthorization.js';

import { registrationDateFromClaims } from '../../../../../shared/identityProfile.js';

const ROLES_CLAIM = "https://itecsa.local/roles";
const PERMISSIONS_CLAIM = "permissions";

export function createVerifyAuthSessionHandler({
    pins = { async ensureProvisioned() { return "active"; } },
    logger = safeLogger,
} = {}) {
    return async function verifyAuthSessionHandler(req, res) {
        const payload = req.auth?.payload;
        const roles = payload?.[ROLES_CLAIM];
        const permissionsClaim = payload?.[PERMISSIONS_CLAIM];
        const policy = authorizationForProvider(req.identityProvider);

        const hasValidIdentity =
            typeof payload?.sub === "string" &&
            payload.sub.length > 0 &&
            req.identityProvider === 'keycloak';
        // Un rol singular evita escoger arbitrariamente entre asignaciones RBAC incompatibles.
        const hasSingleOfficialRole =
            Array.isArray(roles) &&
            roles.length === 1 &&
            policy?.isEnabledRole(roles[0]);
        const hasValidPermissions =
            permissionsClaim === undefined || Array.isArray(permissionsClaim);

        if (!hasValidIdentity || !hasSingleOfficialRole || !hasValidPermissions) {
            return res.status(403).json({
                message: "La sesion autenticada no tiene un rol valido para ITECSA.",
            });
        }

        // El contrato publico expone rolUsuario como proyeccion del claim RBAC namespaced.
        const rolUsuario = roles[0];
        const permissions = (permissionsClaim ?? []).filter(
            (permission) =>
                typeof permission === "string" && permission.trim().length > 0,
        );

        try {
            const pinStatus = await pins.ensureProvisioned(payload.sub);

            return res.status(200).json({
                sub: payload.sub,
                identityProvider: 'keycloak', authorizationPolicy: policy.POLICY_ID,
                ...(req.currentUser ? {
                    primerNombre: req.currentUser.nombreUsuario,
                    apellidoPaterno: req.currentUser.apellidoUsuario,
                    rutUsuario: req.currentUser.rutUsuario,
                    estadoUsuario: req.currentUser.estadoUsuario,
                } : {}),
                email: req.currentUser?.correoUsuario?.trim() || null,
                rolUsuario,
                isAdministrador: rolUsuario === ROLES.ADMINISTRADOR,
                permissions,
                pinStatus,
            });
        } catch (error) {
            return respondError(error, req, res, { logger });
        }
    };
}

export function createRevealPinHandler({ pins = pinService } = {}) {
    return async function revealPinHandler(req, res) {
        res.set("Cache-Control", "no-store");
        try {
            return res.status(200).json({
                pin: await pins.reveal(req.auth?.payload?.sub),
            });
        } catch (error) {
            return respondError(error, req, res);
        }
    };
}

export function createAcknowledgePinHandler({ pins = pinService } = {}) {
    return async function acknowledgePinHandler(req, res) {
        try {
            await pins.acknowledge(req.auth?.payload?.sub);
            safeLogger.info('pin_acknowledged', { actorId: req.auth?.payload?.sub, outcome: 'success' });
            return res.status(204).end();
        } catch (error) {
            return respondError(error, req, res);
        }
    };
}

export function createPinRecoveryHandler({ recovery, navigation, action, pins = pinService } = {}) {
    return async function recoverPinHandler(req, res) {
        res.set('Cache-Control', 'no-store');
        try {
            const actor = req.auth?.payload;
            const input = req.body ?? {};
            const allowed = action === 'start' ? ['refreshToken'] : action === 'cancel' ? ['state'] : ['state', 'code', 'error'];
            if (Object.keys(input).some(key => !allowed.includes(key))) {
                return res.status(400).json({ message: 'Solicitud de recuperacion no valida.' });
            }
            if (action === 'start') {
                navigation.assertOrigin(req);
                const started = recovery.start(actor);
                try { navigation.hold(actor, started.state, input.refreshToken, res); }
                catch (error) { recovery.cancel(actor, started.state); throw error; }
                return res.status(200).json(started);
            }
            if (action === 'cancel') {
                recovery.cancel(actor, input.state);
                navigation.discard(actor, input.state, res);
                return res.status(204).end();
            }
            return res.status(200).json(await recovery.finish(actor, input, pins));
        } catch (error) {
            return respondError(error, req, res);
        }
    };
}

export function createResumePinSessionHandler({ navigation }) {
    return async (req, res) => {
        res.set('Cache-Control', 'no-store');
        try { return res.status(200).json(await navigation.resume(req, res)); }
        catch (error) { return respondError(error, req, res); }
    };
}

export function createGetProfileHandler({ users = userRepository } = {}) {
    return async function getProfileHandler(req, res) {
        res.set('Cache-Control', 'no-store');
        const user = req.currentUser;
        if (!user || user.identitySubject !== req.auth?.payload?.sub) {
            return res.status(401).json({ message: "Sesión no válida." });
        }
        try {
            const records = await users.listRecentRecords(user.idUsuario);
            return res.status(200).json({
                primerNombre: user.nombreUsuario,
                apellidoPaterno: user.apellidoUsuario,
                email: user.correoUsuario,
                rolUsuario: user.rolUsuario,
                rutUsuario: user.rutUsuario,
                estadoUsuario: user.estadoUsuario,
                fechaRegistro: registrationDateFromClaims(req.auth.payload),
                records,
            });
        } catch (error) {
            return respondError(error, req, res);
        }
    };
}

export function createGetProfileMovementsHandler({ users = userRepository } = {}) {
    return async function getProfileMovementsHandler(req, res) {
        res.set('Cache-Control', 'no-store');
        const user = req.currentUser;
        if (!user || typeof req.auth?.payload?.sub !== 'string' || user.identitySubject !== req.auth.payload.sub) {
            return res.status(401).json({ message: "Sesión no válida." });
        }
        const query = validateUserMovementsQuery(req.query ?? {});
        if (!query.valid) return res.status(400).json({ message: query.message });
        try {
            return res.status(200).json(await users.listMovements(user.idUsuario, query.filters));
        } catch (error) {
            return respondError(error, req, res);
        }
    };
}

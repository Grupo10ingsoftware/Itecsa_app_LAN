import { respondError } from "../errors/httpErrors.js";
import pinService from "../modules/auth/service/pin.service.js";
import securityThrottle from "../modules/security/service/securityThrottle.service.js";

const FAILURE_WINDOW_MS = 15 * 60_000;

function failureRules(req) {
    return [
        { scope: 'business-pin-fail-session', subject: req.auth?.payload?.sub, limit: 5, windowMs: FAILURE_WINDOW_MS },
        { scope: 'business-pin-fail-ip', subject: req.ip || req.socket?.remoteAddress || 'unknown', limit: 20, windowMs: FAILURE_WINDOW_MS },
    ];
}

export function createRequirePin({ pins = pinService, permission, throttle = securityThrottle } = {}) {
    return async function requirePin(req, res, next) {
        try {
            if (permission) {
                const rules = failureRules(req);
                for (const rule of rules) await throttle.check(rule);
                try {
                    req.pinActor = await pins.validateForPermission(req.auth?.payload?.sub, req.body?.pin, permission);
                } catch (error) {
                    if (error?.code === 'PIN_INVALID' || error?.code === 'PIN_FORMAT_INVALID') {
                        for (const rule of rules) await throttle.consume(rule);
                    }
                    throw error;
                }
            } else {
                req.pinActor = await pins.validate(req.auth?.payload?.sub, req.body?.pin);
            }

            if (req.body && Object.prototype.hasOwnProperty.call(req.body, "pin")) {
                delete req.body.pin;
            }

            return next();
        } catch (error) {
            return respondError(error, req, res);
        }
    };
}

export default createRequirePin();

import securityThrottle, { RateLimitExceededError } from "../modules/security/service/securityThrottle.service.js";

function clientAddress(req) {
    return req.ip || req.socket?.remoteAddress || "unknown";
}

function respondRateLimit(req, res, error) {
    res.set("Retry-After", String(error.retryAfterSeconds));
    return res.status(429).json({
        code: error.code,
        message: error.message,
        retryAfterSeconds: error.retryAfterSeconds,
        requestId: req.requestId,
    });
}

export function createThrottleMiddleware({ throttle = securityThrottle, rules }) {
    return async function throttleMiddleware(req, res, next) {
        try {
            for (const rule of rules(req)) {
                await throttle.consume(rule);
            }
            return next();
        } catch (error) {
            if (error instanceof RateLimitExceededError) return respondRateLimit(req, res, error);
            return next(error);
        }
    };
}

export const authenticatedRateLimit = createThrottleMiddleware({
    rules(req) {
        const isRead = req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS";
        return [{
            scope: isRead ? "authenticated-read" : "authenticated-write",
            subject: req.currentUser?.idUsuario ?? req.auth?.payload?.sub ?? clientAddress(req),
            limit: isRead ? 120 : 30,
            windowMs: 60_000,
        }];
    },
});

export function createPinRecoveryRateLimit({ throttle = securityThrottle } = {}) {
    return createThrottleMiddleware({
        throttle,
        rules(req) {
            const subject = req.auth?.payload?.sub;
            if (!subject) throw new Error('La cuota PIN requiere una identidad autenticada.');
            const phase = req.path?.endsWith('/finish') ? '-finish' : '';
            return [
                { scope: 'pin-recovery-ip' + phase, subject: clientAddress(req), limit: 20, windowMs: 15 * 60_000 },
                { scope: 'pin-recovery-account' + phase, subject, limit: 5, windowMs: 15 * 60_000 },
            ];
        },
    });
}

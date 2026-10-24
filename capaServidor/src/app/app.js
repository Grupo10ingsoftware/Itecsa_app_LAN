import "dotenv/config";
import Server from "../server.js";
import { disconnectPrismaClient } from "../database/prisma.js";
import { registerShutdown } from './shutdown.js';
import pinService from "../modules/auth/service/pin.service.js";
import { resolveEnvironmentConfig } from "../config/environment.js";
import { currentAppEnvironment } from "../config/environment.js";
import { safeLogger } from "../shared/safeLogger.js";
import { startTemporaryDataCleanup } from "../modules/security/service/temporaryDataCleanup.service.js";

const requiredEnvironmentVariables = [
    "FRONTEND_ORIGIN",
    "PIN_SECRET",
    "APP_ENV",
    "RATE_LIMIT_SECRET",
    "SECURITY_LOG_HMAC_KEY",
];

function validateEnvironment() {
    resolveEnvironmentConfig(process.env);

    const appEnvironment = currentAppEnvironment({ required: true });
    const provider = process.env.AUTH_PROVIDER || 'auth0';
    if (!['auth0', 'keycloak'].includes(provider)) throw new Error('AUTH_PROVIDER invalido.');
    const identityVariables = provider === 'keycloak'
        ? ['KEYCLOAK_ISSUER', 'KEYCLOAK_AUDIENCE', 'KEYCLOAK_CLIENT_ID', 'KEYCLOAK_JWKS_URI']
        : ['AUTH0_DOMAIN', 'AUTH0_AUDIENCE'];
    const missingVariables = [...requiredEnvironmentVariables, ...identityVariables].filter(
        (variable) => !process.env[variable]?.trim(),
    );

    if (missingVariables.length > 0) {
        throw new Error(
            `Faltan variables de entorno obligatorias: ${missingVariables.join(", ")}`,
        );
    }
    if (provider === 'keycloak') {
        const issuer = new URL(process.env.KEYCLOAK_ISSUER);
        const jwks = new URL(process.env.KEYCLOAK_JWKS_URI);
        if ((issuer.protocol !== 'https:' || jwks.protocol !== 'https:') &&
            (appEnvironment === 'production' || process.env.KEYCLOAK_ALLOW_HTTP !== 'true')) {
            throw new Error('Keycloak requiere HTTPS fuera del piloto local.');
        }
    }

    if (appEnvironment === "production" && process.env.ENABLE_INTERNAL_READINESS === "true" && !process.env.INTERNAL_HEALTH_TOKEN?.trim()) {
        throw new Error("INTERNAL_HEALTH_TOKEN es obligatorio al habilitar readiness.");
    }
}

(async () => {
    try {
        void pinService.delivery;
        validateEnvironment();
        const appEnvironment = currentAppEnvironment({ required: true });
        const server = new Server({ appEnvironment });
        const httpServer = await server.listen();
        const stopCleanup = appEnvironment === "production" ? startTemporaryDataCleanup() : () => {};
        registerShutdown(httpServer, async () => {
            stopCleanup();
            await disconnectPrismaClient();
        });
    } catch ( err ){
        safeLogger.error("server.start_failed", { code: err?.code ?? "START_FAILED", outcome: "error" });
        process.exit(1);
        
    }
})();

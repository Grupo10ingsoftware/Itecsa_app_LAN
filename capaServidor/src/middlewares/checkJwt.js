import { auth } from "express-oauth2-jwt-bearer";

import requireActiveIdentity from "./requireActiveIdentity.js";
import { authenticatedRateLimit } from "./rateLimit.js";
import { normalizeKeycloakClaims } from './keycloakClaims.js';
import { resolveIdentityConfiguration } from '../config/identity.js';

export function createCheckJwt({ environment = process.env,
    requireIdentity = requireActiveIdentity, rateLimit = authenticatedRateLimit } = {}) {
    let jwtValidator;
    let validatorConfiguration;
    return function checkJwt(req, res, next) {
        let configuration;
        try {
            configuration = resolveIdentityConfiguration(environment);
            const key = JSON.stringify(configuration);
            if (!jwtValidator || validatorConfiguration !== key) {
                jwtValidator = configuration.provider === 'keycloak'
                    ? auth({ audience: configuration.audience, issuer: configuration.issuer,
                        jwksUri: configuration.jwksUri, tokenSigningAlg: 'RS256' })
                    : auth({ audience: configuration.audience, issuerBaseURL: configuration.issuerBaseURL });
                validatorConfiguration = key;
            }
        } catch {
            return res.status(503).json({ code: 'IDENTITY_CONFIGURATION_ERROR', message: 'No fue posible verificar el acceso.' });
        }

        return jwtValidator(req, res, (error) => {
            if (error) return next(error);
            if (configuration.provider === 'keycloak') {
                const normalized = normalizeKeycloakClaims(req.auth?.payload, configuration.clientId, configuration.roleClientId);
                if (!normalized) return res.status(403).json({ message: 'La sesion no tiene un cliente, rol o permisos validos.' });
                req.auth.payload = normalized;
            }
            req.identityProvider = configuration.provider;
            return requireIdentity(req, res,
                (identityError) => identityError ? next(identityError) : rateLimit(req, res, next));
        });
    };
}

export default createCheckJwt();

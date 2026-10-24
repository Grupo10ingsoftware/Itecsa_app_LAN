import { auth } from "express-oauth2-jwt-bearer";

import requireActiveIdentity from "./requireActiveIdentity.js";
import { authenticatedRateLimit } from "./rateLimit.js";
import { normalizeKeycloakClaims } from './keycloakClaims.js';
let jwtValidator;
let validatorProvider;

export default function checkJwt(req, res, next) {
    const provider = process.env.AUTH_PROVIDER || 'auth0';
    if (!jwtValidator || validatorProvider !== provider) {
        // Valida solo access tokens emitidos por el tenant para esta API.
        jwtValidator = provider === 'keycloak'
            ? auth({ audience: process.env.KEYCLOAK_AUDIENCE, issuer: process.env.KEYCLOAK_ISSUER,
                jwksUri: process.env.KEYCLOAK_JWKS_URI })
            : auth({ audience: process.env.AUTH0_AUDIENCE, issuerBaseURL: `https://${process.env.AUTH0_DOMAIN}/` });
        validatorProvider = provider;
    }

    return jwtValidator(req, res, (error) => {
        if (error) return next(error);
        if (provider === 'keycloak') {
            const normalized = normalizeKeycloakClaims(req.auth?.payload, process.env.KEYCLOAK_CLIENT_ID);
            if (!normalized) return res.status(403).json({ message: 'La sesion no tiene un cliente, rol o permisos validos.' });
            req.auth.payload = normalized;
        }
        req.identityProvider = provider;
        return requireActiveIdentity(
        req,
        res,
        (identityError) => identityError ? next(identityError) : authenticatedRateLimit(req, res, next),
        );
    });
}

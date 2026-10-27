import { resolveIdentityConfiguration } from './identity.js';

export function pinRecoveryConfiguration(env = process.env) {
    const identity = resolveIdentityConfiguration(env);
    const clientId = env.KEYCLOAK_PIN_RECOVERY_CLIENT_ID?.trim() || 'itecsa-pin-recovery';
    if ([identity.clientId, identity.roleClientId, identity.audience].includes(clientId)) throw Error('Invalid recovery client');
    const redirect = new URL(env.KEYCLOAK_PIN_RECOVERY_REDIRECT_URI);
    const frontend = new URL(env.FRONTEND_ORIGIN);
    if (redirect.origin !== frontend.origin || redirect.pathname !== '/auth/pin-recovery/callback' ||
        redirect.search || redirect.hash || redirect.username || redirect.password ||
        !['http:', 'https:'].includes(redirect.protocol) ||
        (redirect.protocol !== 'https:' && (env.APP_ENV === 'production' || !['127.0.0.1', 'localhost'].includes(redirect.hostname)))) {
        throw Error('Invalid recovery callback');
    }
    const transport = new URL(identity.issuer);
    if (env.KEYCLOAK_PIN_RECOVERY_TRANSPORT_ORIGIN) {
        const origin = new URL(env.KEYCLOAK_PIN_RECOVERY_TRANSPORT_ORIGIN);
        if (origin.origin !== env.KEYCLOAK_PIN_RECOVERY_TRANSPORT_ORIGIN ||
            origin.username || origin.password || !['https:', 'http:'].includes(origin.protocol) ||
            (origin.protocol !== 'https:' && (env.APP_ENV === 'production' || env.KEYCLOAK_ALLOW_HTTP !== 'true'))) {
            throw Error('Invalid recovery transport');
        }
        transport.protocol = origin.protocol;
        transport.host = origin.host;
    }
    return { ...identity, clientId, redirectUri: redirect.href,
        authorizationEndpoint: identity.issuer.replace(/\/$/, '') + '/protocol/openid-connect/auth',
        tokenEndpoint: transport.href.replace(/\/$/, '') + '/protocol/openid-connect/token' };
}

import { authorizationForProvider } from '../../../../shared/identityAuthorization.js';
import { isActiveUserStatus } from '../../../../shared/userLifecycle.js';

export function isValidVerifiedIdentity(verified, { provider = 'auth0', subject } = {}) {
  const policy = authorizationForProvider(provider);
  return Boolean(policy && subject && verified?.sub === subject &&
    policy.RECOGNIZED_ROLES.includes(verified.rolUsuario) && Array.isArray(verified.permissions) &&
    verified.permissions.every(permission => typeof permission === 'string') &&
    (provider !== 'keycloak' || (verified.identityProvider === 'keycloak' &&
      verified.authorizationPolicy === policy.POLICY_ID && isActiveUserStatus(verified.estadoUsuario))));
}

export function isCurrentVerification(verified, current) {
  return verified.subject === (current.subject ?? null) && verified.provider === current.provider &&
    verified.sessionKey === current.sessionKey && verified.verificationKey === current.verificationKey;
}

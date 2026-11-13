import { isEnabledRole, ROLES_CLAIM, ROLE_PERMISSIONS } from '../../../shared/keycloakAuthorization.js';

export function normalizeKeycloakClaims(payload, clientId, roleClientId) {
  if (typeof clientId !== 'string' || !clientId || typeof roleClientId !== 'string' || !roleClientId || roleClientId === clientId ||
      payload?.typ !== 'Bearer' || payload?.azp !== clientId || typeof payload?.sub !== 'string' || !payload.sub.trim() || payload.sub.length > 128) return null;
  // A new, explicit namespace prevents legacy realm Soporte from becoming new Soporte.
  const roles = payload.resource_access?.[roleClientId]?.roles;
  if (!Array.isArray(roles) || roles.length !== 1 || !isEnabledRole(roles[0]) || !Array.isArray(payload.permissions) ||
      payload.permissions.some(permission => typeof permission !== 'string' || !permission.trim())) return null;
  const permissions = ROLE_PERMISSIONS[roles[0]].filter(permission => payload.permissions.includes(permission));
  return { ...payload, [ROLES_CLAIM]: [...roles], permissions };
}

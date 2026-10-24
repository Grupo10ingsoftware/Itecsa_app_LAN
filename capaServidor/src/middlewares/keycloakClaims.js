import { RECOGNIZED_ROLES, ROLES_CLAIM } from '../../../shared/authorization.js';

export function normalizeKeycloakClaims(payload, clientId) {
  if (payload?.typ !== 'Bearer' || payload?.azp !== clientId || typeof payload?.sub !== 'string' || !payload.sub) return null;
  const roles = payload.realm_access?.roles;
  const selected = Array.isArray(roles) ? roles.filter(role => RECOGNIZED_ROLES.includes(role)) : [];
  if (selected.length !== 1 || !Array.isArray(payload.permissions) ||
      payload.permissions.some(permission => typeof permission !== 'string' || !permission.trim())) return null;
  return { ...payload, [ROLES_CLAIM]: selected, permissions: payload.permissions };
}

// Phase 01 policy only. No runtime provider, route or identity migration imports it.
// Derive the approved changes from the existing catalog; do not copy business rules.
import {
  ROLES as LEGACY_ROLES, FUNCTIONAL_ROLES, ROLE_PERMISSIONS as LEGACY_ROLE_PERMISSIONS,
  PERMISSIONS, roleFromPayload as legacyRoleFromPayload, can as legacyCan,
} from './authorization.js';

export { PERMISSIONS, BUSINESS_PERMISSIONS, ROLES_CLAIM, FUNCTIONAL_ROLES } from './authorization.js';

export const ROLES = Object.freeze({
  ...Object.fromEntries(Object.entries(LEGACY_ROLES).filter(([key]) => key !== 'SOPORTE')),
  DESARROLLADOR: 'Desarrollador',
  SOPORTE: 'Soporte',
});
export const RECOGNIZED_ROLES = Object.freeze(Object.values(ROLES));
export const ADMIN_ROLES = Object.freeze([ROLES.SOPORTE]);
export const PRIVILEGED_ROLES = Object.freeze([ROLES.GERENCIA, ROLES.DESARROLLADOR, ROLES.SOPORTE]);
export const ASSIGNABLE_ROLES = Object.freeze(FUNCTIONAL_ROLES.filter(role => !PRIVILEGED_ROLES.includes(role)));

const withoutUserManagement = permissions => Object.freeze(permissions.filter(p => p !== PERMISSIONS.MANAGE_USERS));
export const ROLE_PERMISSIONS = Object.freeze({
  ...Object.fromEntries(FUNCTIONAL_ROLES.map(role => [role, withoutUserManagement(LEGACY_ROLE_PERMISSIONS[role])])),
  [ROLES.DESARROLLADOR]: withoutUserManagement(LEGACY_ROLE_PERMISSIONS[LEGACY_ROLES.SOPORTE]),
  [ROLES.SOPORTE]: Object.freeze([
    PERMISSIONS.READ_PROFILE, PERMISSIONS.MANAGE_PIN,
    PERMISSIONS.READ_MESSAGES, PERMISSIONS.UPDATE_MESSAGES, PERMISSIONS.MANAGE_USERS,
  ]),
});

// A migration requirement, not a mapping of claims or persisted identities.
// The old and new Soporte labels collide: phase 02+ must resolve subjects explicitly.
export const LEGACY_TECHNICAL_ROLE_MIGRATION = Object.freeze({
  from: LEGACY_ROLES.SOPORTE,
  to: ROLES.DESARROLLADOR,
  requiresExplicitIdentityMapping: true,
});

export function roleFromPayload(payload) {
  return legacyRoleFromPayload(payload, RECOGNIZED_ROLES);
}

export function can(role, permissions, permission) {
  return RECOGNIZED_ROLES.includes(role) && legacyCan(role, permissions, permission, ROLE_PERMISSIONS);
}

const NO_ROLES = Object.freeze([]);
export function manageableRoles(role) {
  return role === ROLES.SOPORTE ? ASSIGNABLE_ROLES : NO_ROLES;
}

// Role scope only. A future administrative endpoint must ALSO validate actor/target
// identity, existing and requested target roles, local state, capability and PIN.
export function canManageUser(actorRole, targetRole) {
  return manageableRoles(actorRole).includes(targetRole);
}

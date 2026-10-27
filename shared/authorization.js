// Canonical application policy. Identity roles come from the configured client.
export const POLICY_ID = 'itecsa-keycloak-v1';
export const ROLES = Object.freeze({
  "ADMINISTRADOR": "Administrador Produccion",
  "ADMIN_VENTAS": "Administrador Ventas",
  "ADMIN_COBRANZAS": "Administrador Cobranzas",
  "PRODUCCION": "Operario Produccion",
  "VENTAS": "Operario Ventas",
  "COBRANZAS": "Operario Cobranzas",
  "GERENCIA": "Gerencia",
  "DESARROLLADOR": "Desarrollador",
  "SOPORTE": "Soporte"
});
export const RECOGNIZED_ROLES = Object.freeze(Object.values(ROLES));
export const FUNCTIONAL_ROLES = Object.freeze(RECOGNIZED_ROLES.filter(role => ![ROLES.DESARROLLADOR, ROLES.SOPORTE].includes(role)));
export const ADMIN_ROLES = Object.freeze([ROLES.SOPORTE, ROLES.DESARROLLADOR]);
export const PRIVILEGED_ROLES = Object.freeze([ROLES.GERENCIA, ROLES.DESARROLLADOR, ROLES.SOPORTE]);
export const ASSIGNABLE_ROLES = Object.freeze(FUNCTIONAL_ROLES.filter(role => !PRIVILEGED_ROLES.includes(role)));
export const PERMISSIONS = Object.freeze({
  "READ_PROFILE": "read:own-profile",
  "MANAGE_PIN": "manage:own-pin",
  "READ_ORDERS": "read:orders",
  "READ_CAPACITY": "read:production-capacity",
  "READ_MESSAGES": "read:own-messages",
  "UPDATE_MESSAGES": "update:own-messages",
  "MANAGE_USERS": "manage:users",
  "READ_SALES_NOTES": "read:sales-notes",
  "CREATE_ORDERS": "create:orders",
  "REEVALUATE_ORDERS": "reevaluate:orders",
  "READ_PAYMENTS": "read:payments",
  "UPDATE_PAYMENT_STATUS": "update:payment-status",
  "REVISE_PAYMENT_STATUS": "revise:payment-status",
  "MOVE_ORDERS": "move:orders",
  "START_PRODUCTION": "start:production",
  "UPDATE_SUBPROCESSES": "update:production-subprocesses",
  "ROLLBACK_SUBPROCESSES": "rollback:production-subprocesses",
  "MANAGE_CAPACITY": "manage:production-capacity",
  "MANAGE_PRODUCTION_LOAD": "manage:production-load",
  "MANAGE_TAGS": "manage:order-tags",
  "REVIEW_ORDERS": "review:orders",
  "CANCEL_ORDERS": "cancel:orders",
  "READ_CALENDAR": "read:production-calendar",
  "UPDATE_DELIVERY_DATE": "update:order-delivery-date",
  "VIEW_METRICS": "view:metrics"
});
export const BUSINESS_PERMISSIONS = Object.freeze(Object.values(PERMISSIONS));
export const ROLE_PERMISSIONS = Object.freeze(Object.fromEntries(Object.entries({
  "Administrador Produccion": [
    "read:own-profile",
    "manage:own-pin",
    "read:orders",
    "read:production-capacity",
    "read:own-messages",
    "update:own-messages",
    "move:orders",
    "update:production-subprocesses",
    "start:production",
    "rollback:production-subprocesses",
    "manage:production-capacity",
    "manage:production-load",
    "manage:order-tags",
    "review:orders",
    "cancel:orders",
    "read:production-calendar",
    "update:order-delivery-date",
    "view:metrics"
  ],
  "Administrador Ventas": [
    "read:own-profile",
    "manage:own-pin",
    "read:orders",
    "read:production-capacity",
    "read:own-messages",
    "update:own-messages",
    "read:sales-notes",
    "create:orders",
    "reevaluate:orders",
    "read:production-calendar"
  ],
  "Administrador Cobranzas": [
    "read:own-profile",
    "manage:own-pin",
    "read:orders",
    "read:production-capacity",
    "read:own-messages",
    "update:own-messages",
    "read:payments",
    "update:payment-status",
    "revise:payment-status"
  ],
  "Operario Produccion": [
    "read:own-profile",
    "manage:own-pin",
    "read:orders",
    "read:production-capacity",
    "read:own-messages",
    "update:own-messages",
    "move:orders",
    "update:production-subprocesses"
  ],
  "Operario Ventas": [
    "read:own-profile",
    "manage:own-pin",
    "read:orders",
    "read:production-capacity",
    "read:own-messages",
    "update:own-messages",
    "read:sales-notes",
    "create:orders",
    "reevaluate:orders",
    "read:production-calendar"
  ],
  "Operario Cobranzas": [
    "read:own-profile",
    "manage:own-pin",
    "read:orders",
    "read:production-capacity",
    "read:own-messages",
    "update:own-messages",
    "read:payments",
    "update:payment-status"
  ],
  "Gerencia": [
    "read:own-profile",
    "manage:own-pin",
    "read:orders",
    "read:production-capacity",
    "read:own-messages",
    "update:own-messages",
    "view:metrics"
  ],
  "Desarrollador": [
    "read:own-profile",
    "manage:own-pin",
    "read:orders",
    "read:production-capacity",
    "read:own-messages",
    "update:own-messages",
    "manage:users",
    "read:sales-notes",
    "create:orders",
    "reevaluate:orders",
    "read:payments",
    "update:payment-status",
    "revise:payment-status",
    "move:orders",
    "start:production",
    "update:production-subprocesses",
    "rollback:production-subprocesses",
    "manage:production-capacity",
    "manage:production-load",
    "manage:order-tags",
    "review:orders",
    "cancel:orders",
    "read:production-calendar",
    "update:order-delivery-date",
    "view:metrics"
  ],
  "Soporte": [
    "read:own-profile",
    "manage:own-pin",
    "read:own-messages",
    "update:own-messages",
    "manage:users"
  ]
}).map(([role, permissions]) => [role, Object.freeze(permissions)])));
export const ROLES_CLAIM = 'https://itecsa.local/roles';
export function roleFromPayload(payload) {
  const roles = payload?.[ROLES_CLAIM];
  return Array.isArray(roles) && roles.length === 1 && RECOGNIZED_ROLES.includes(roles[0]) ? roles[0] : null;
}
export function can(role, permissions, permission) {
  return RECOGNIZED_ROLES.includes(role) && ROLE_PERMISSIONS[role]?.includes(permission) === true && Array.isArray(permissions) && permissions.includes(permission);
}
const NO_ROLES = Object.freeze([]);
export function manageableRoles(role) { return ADMIN_ROLES.includes(role) ? ASSIGNABLE_ROLES : NO_ROLES; }
export function canManageUser(actorRole, targetRole) { return manageableRoles(actorRole).includes(targetRole); }

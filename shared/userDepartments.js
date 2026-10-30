import { ROLES } from './authorization.js';

export const USER_DEPARTMENTS = Object.freeze([
  { value: 'production', label: 'Producción', roles: [ROLES.ADMINISTRADOR, ROLES.PRODUCCION] },
  { value: 'collections', label: 'Cobranzas', roles: [ROLES.ADMIN_COBRANZAS, ROLES.COBRANZAS] },
  { value: 'sales', label: 'Ventas', roles: [ROLES.ADMIN_VENTAS, ROLES.VENTAS] },
].map(department => Object.freeze({ ...department, roles: Object.freeze(department.roles) })));

export function departmentRoles(department) {
  return USER_DEPARTMENTS.find(item => item.value === department)?.roles ?? [];
}

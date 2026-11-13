import { ROLES } from './authorization.js';

export const INITIAL_ADMINISTRATORS = Object.freeze([
  Object.freeze({ prefix: 'INITIAL_ADMIN_PRODUCTION', role: ROLES.ADMINISTRADOR, username: 'ad.produccion', lastName: 'Producción' }),
  Object.freeze({ prefix: 'INITIAL_ADMIN_COLLECTIONS', role: ROLES.ADMIN_COBRANZAS, username: 'ad.cobranzas', lastName: 'Cobranzas' }),
  Object.freeze({ prefix: 'INITIAL_ADMIN_SALES', role: ROLES.ADMIN_VENTAS, username: 'ad.ventas', lastName: 'Ventas' }),
]);

// Shared by the host preflight and the database-tools image. Never include values in errors.
export function validateInitialAdministrators(env) {
  const accounts = INITIAL_ADMINISTRATORS.map(defaults => {
    const { prefix, role } = defaults;
    const value = (field, fallback = '') => env[prefix + '_' + field] || fallback;
    const require = (field, valid) => { if (!valid) throw Error(`${prefix}: revisar ${prefix}_${field}`); };
    const username = value('USERNAME', defaults.username);
    const firstName = value('FIRST_NAME', 'Administrador').trim();
    const lastName = value('LAST_NAME', defaults.lastName).trim();
    const email = value('EMAIL').trim().toLowerCase() || null;
    const rut = value('RUT').replaceAll('.', '').toUpperCase() || null;
    // This shared temporary password is the explicitly requested installation
    // default. Each account must replace it on its first Keycloak login.
    const temporaryPassword = value('TEMP_PASSWORD', 'Admin12345.');
    require('USERNAME', /^[a-z0-9._-]{3,80}$/.test(username));
    require('FIRST_NAME', firstName.length > 0 && firstName.length <= 100 && !/[\r\n<>]/.test(firstName));
    require('LAST_NAME', lastName.length > 0 && lastName.length <= 100 && !/[\r\n<>]/.test(lastName));
    require('EMAIL', email === null || (email.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !/[<>]/.test(email)));
    require('RUT', rut === null || /^\d{7,8}-[\dK]$/.test(rut));
    require('TEMP_PASSWORD (minimo 8 caracteres, mayuscula, minuscula, numero y simbolo)', temporaryPassword.length >= 8
      && /[A-Z]/.test(temporaryPassword) && /[a-z]/.test(temporaryPassword) && /[0-9]/.test(temporaryPassword)
      && /[^A-Za-z0-9\s]/.test(temporaryPassword) && !/[\r\n]/.test(temporaryPassword));
    return { prefix, role, username, email, firstName, lastName, rut, temporaryPassword };
  });
  for (const field of ['username', 'email', 'rut']) {
    const values = accounts.map(account => account[field]).filter(Boolean);
    if (new Set(values).size !== values.length) {
      throw Error(`INITIAL_ADMINISTRATORS: los tres valores de ${field} deben ser distintos`);
    }
  }
  const operatorPasswords = [env.KEYCLOAK_OPERATOR_PASSWORD, env.KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD].filter(Boolean);
  if (accounts.some(account => operatorPasswords.includes(account.temporaryPassword))) {
    throw Error('INITIAL_ADMINISTRATORS: usar claves distintas de los administradores tecnicos');
  }
  return accounts;
}

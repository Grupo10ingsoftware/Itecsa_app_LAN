// Shared by the host preflight and the database-tools image. Never include values in errors.
export function validateFirstUser(env) {
  const require = (key, valid) => {
    if (!valid) throw Error(`FIRST_USER: revisar ${key}`);
  };
  require('FIRST_USER_USERNAME', /^[a-z0-9._-]{3,80}$/.test(env.FIRST_USER_USERNAME ?? ''));
  require('FIRST_USER_EMAIL', /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.FIRST_USER_EMAIL ?? ''));
  for (const key of ['FIRST_USER_FIRST_NAME', 'FIRST_USER_LAST_NAME']) {
    require(key, Boolean(env[key]?.trim()) && !/[\r\n]/.test(env[key]));
  }
  require('FIRST_USER_RUT', /^(\d{1,2}\.?\d{3}\.?\d{3}-[\dkK])$/.test(env.FIRST_USER_RUT ?? ''));
  const password = env.FIRST_USER_TEMP_PASSWORD ?? '';
  require('FIRST_USER_TEMP_PASSWORD (20 caracteres, mayuscula, minuscula, numero y simbolo)',
    password.length >= 20 && /[A-Z]/.test(password) && /[a-z]/.test(password) &&
    /[0-9]/.test(password) && /[^A-Za-z0-9\s]/.test(password) && !/[\r\n]/.test(password));
}

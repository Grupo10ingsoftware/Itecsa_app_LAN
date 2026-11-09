// Keycloak account creation time, in epoch milliseconds. Informational only.
export const ACCOUNT_CREATED_AT_CLAIM = 'itecsa_account_created_at_ms';

export function registrationDateFromClaims(payload) {
  const timestamp = payload?.[ACCOUNT_CREATED_AT_CLAIM];
  // Missing/invalid data remains unknown. In particular, iat is never a fallback.
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0 || timestamp > 253402300799999
      || !Number.isSafeInteger(payload?.iat) || payload.iat < 0
      || Math.floor(timestamp / 1000) > payload.iat) return null;
  return new Date(timestamp).toISOString();
}

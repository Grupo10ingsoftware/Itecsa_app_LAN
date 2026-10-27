// The external binding, not a display name or email, identifies the local actor.
export function identityKey(subject, issuer = process.env.KEYCLOAK_ISSUER) {
  if (typeof subject !== 'string' || !subject || subject.length > 128 ||
      typeof issuer !== 'string' || !issuer.trim()) {
    throw Error('La identidad externa no esta configurada.');
  }
  return { provider: 'keycloak', issuer: issuer.trim(), subject };
}

export function identityUserWhere(subject, issuer) {
  return { ExternalIdentity: { is: identityKey(subject, issuer) } };
}

import assert from 'node:assert/strict';
import { isValidVerifiedIdentity, isCurrentVerification } from '../src/app/providers/verifiedIdentity.js';
import { authorizationForProvider } from '../../shared/identityAuthorization.js';

export function run() {
  const policy = authorizationForProvider('keycloak');
  const valid = { sub: 'subject-A', rolUsuario: 'Desarrollador', permissions: policy.ROLE_PERMISSIONS.Desarrollador,
    identityProvider: 'keycloak', authorizationPolicy: 'itecsa-keycloak-v1', estadoUsuario: 'Activo' };
  let checks = 0;
  for (const role of policy.RECOGNIZED_ROLES) {
    assert.equal(isValidVerifiedIdentity({ ...valid, rolUsuario: role, permissions: policy.ROLE_PERMISSIONS[role] },
      { provider: 'keycloak', subject: 'subject-A' }), true); checks++;
  }
  for (const patch of [{ sub: 'subject-B' }, { sub: '' }, { rolUsuario: 'root' }, { permissions: undefined },
    { permissions: ['read:orders', 7] }, { identityProvider: 'auth0' }, { authorizationPolicy: undefined },
    { authorizationPolicy: 'old-policy' }, { estadoUsuario: 'Desvinculado' }]) {
    assert.equal(isValidVerifiedIdentity({ ...valid, ...patch }, { provider: 'keycloak', subject: 'subject-A' }), false); checks++;
  }
  assert.equal(isValidVerifiedIdentity(valid, { provider: 'typo', subject: 'subject-A' }), false); checks++;
  assert.equal(isValidVerifiedIdentity(valid, { provider: 'auth0', subject: 'subject-A' }), false); checks++;
  assert.equal(isValidVerifiedIdentity({ sub: 'legacy', rolUsuario: 'Soporte', permissions: ['manage:users'] },
    { provider: 'auth0', subject: 'legacy' }), true); checks++;
  const current = { subject: 'subject-A', provider: 'keycloak', sessionKey: 3, verificationKey: 9 };
  assert.equal(isCurrentVerification(current, current), true); checks++;
  for (const patch of [{ subject: 'subject-B' }, { provider: 'auth0' }, { sessionKey: 4 }, { verificationKey: 10 }]) {
    assert.equal(isCurrentVerification(current, { ...current, ...patch }), false); checks++;
  }
  for (const role of policy.RECOGNIZED_ROLES) for (const permission of policy.BUSINESS_PERMISSIONS) {
    assert.equal(policy.can(role, policy.BUSINESS_PERMISSIONS, permission), policy.ROLE_PERMISSIONS[role].includes(permission)); checks++;
  }
  console.log(checks + ' verificaciones frontend: contrato Keycloak, politica, proveedor y sesion aislados OK');
}

import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as legacy from '../../shared/authorization.js';
import * as policy from '../../shared/keycloakAuthorization.js';
import requireCapability from '../src/middlewares/requireCapability.js';
import { normalizeKeycloakClaims } from '../src/middlewares/keycloakClaims.js';

const roles = [
  'Administrador Produccion', 'Administrador Ventas', 'Administrador Cobranzas',
  'Operario Produccion', 'Operario Ventas', 'Operario Cobranzas',
  'Gerencia', 'Desarrollador', 'Soporte',
];
// Literal acceptance matrix, independent of the policy's derivation algorithm.
// Columns: AP, AV, AC, OP, OV, OC, G, D, new S. 1 grants, 0 denies.
const expected = [
  ['read:own-profile',              '111111111'],
  ['manage:own-pin',                '111111111'],
  ['read:orders',                   '111111110'],
  ['read:production-capacity',      '111111110'],
  ['read:own-messages',             '111111111'],
  ['update:own-messages',           '111111111'],
  ['manage:users',                  '000000001'],
  ['read:sales-notes',              '010010010'],
  ['create:orders',                 '010010010'],
  ['reevaluate:orders',             '010010010'],
  ['read:payments',                 '001001010'],
  ['update:payment-status',         '001001010'],
  ['revise:payment-status',         '001000010'],
  ['move:orders',                   '100100010'],
  ['start:production',              '100000010'],
  ['update:production-subprocesses','100100010'],
  ['rollback:production-subprocesses','100000010'],
  ['manage:production-capacity',    '100000010'],
  ['manage:production-load',        '100000010'],
  ['manage:order-tags',             '100000010'],
  ['review:orders',                 '100000010'],
  ['cancel:orders',                 '100000010'],
  ['read:production-calendar',      '110010010'],
  ['update:order-delivery-date',    '100000010'],
  ['view:metrics',                  '100000110'],
];
const payloadFor = role => ({ [policy.ROLES_CLAIM]: [role] });

test('Keycloak policy: exact nine-role and 25-capability contract', () => {
  assert.deepEqual(policy.RECOGNIZED_ROLES, roles);
  assert.deepEqual(Object.keys(policy.ROLE_PERMISSIONS), roles);
  assert.deepEqual(policy.BUSINESS_PERMISSIONS, expected.map(([permission]) => permission));
  assert.equal(policy.PERMISSIONS, legacy.PERMISSIONS, 'one shared capability catalog');
  assert.equal(policy.BUSINESS_PERMISSIONS, legacy.BUSINESS_PERMISSIONS);
  assert.equal(policy.ROLES_CLAIM, legacy.ROLES_CLAIM);
  for (const role of roles) assert.equal(policy.roleFromPayload(payloadFor(role)), role);
});

test('Keycloak policy: 225 positive and negative capability decisions', async t => {
  for (const [permission, bits] of expected) {
    for (const [column, role] of roles.entries()) {
      await t.test(`${role}: ${permission} => ${bits[column]}`, () => {
        const allowed = bits[column] === '1';
        assert.equal(policy.ROLE_PERMISSIONS[role].includes(permission), allowed);
        assert.equal(policy.can(role, policy.BUSINESS_PERMISSIONS, permission), allowed,
          'excessive token permissions must not bypass the local role');
        assert.equal(policy.can(role, [permission], permission), allowed);
        assert.equal(policy.can(role, [], permission), false, 'token must also grant capability');
        assert.equal(policy.can(role, policy.BUSINESS_PERMISSIONS.filter(p => p !== permission), permission), false);
      });
    }
  }
});

test('Keycloak policy: preserves all seven functional roles except user administration', () => {
  assert.equal(policy.FUNCTIONAL_ROLES, legacy.FUNCTIONAL_ROLES);
  for (const role of legacy.FUNCTIONAL_ROLES) {
    assert.deepEqual(policy.ROLE_PERMISSIONS[role],
      legacy.ROLE_PERMISSIONS[role].filter(p => p !== 'manage:users'));
  }
  assert.deepEqual(roles.map(role => policy.ROLE_PERMISSIONS[role].length), [18, 10, 9, 8, 10, 8, 7, 24, 5]);
});

test('Keycloak policy: Desarrollador retains exactly the old technical 24 capabilities', () => {
  assert.deepEqual(policy.ROLE_PERMISSIONS.Desarrollador,
    legacy.ROLE_PERMISSIONS.Soporte.filter(p => p !== 'manage:users'));
  assert.equal(policy.can('Desarrollador', ['manage:users'], 'manage:users'), false);
  assert.deepEqual(policy.LEGACY_TECHNICAL_ROLE_MIGRATION, {
    from: 'Soporte', to: 'Desarrollador', requiresExplicitIdentityMapping: true,
  });
  assert.equal(policy.roleFromPayload(payloadFor('Soporte')), 'Soporte', 'never infer an identity migration');
});

test('Keycloak policy: new Soporte has only account management and own profile/PIN/messages', () => {
  assert.deepEqual(policy.ROLE_PERMISSIONS.Soporte, [
    'read:own-profile', 'manage:own-pin', 'read:own-messages', 'update:own-messages', 'manage:users',
  ]);
  for (const [permission] of expected) {
    if (!policy.ROLE_PERMISSIONS.Soporte.includes(permission)) {
      assert.equal(policy.can('Soporte', [permission], permission), false);
    }
  }
  assert.deepEqual(policy.ADMIN_ROLES, ['Soporte']);
});

test('Keycloak policy: unknown, missing and multiple roles fail closed', () => {
  for (const payload of [undefined, null, {},
    ...[undefined, null, '', 'Soporte', [], [''], ['Administrador'], ['root'],
      ['__proto__'], ['constructor'], [null], [7], [['Soporte']]]
      .map(value => ({ [policy.ROLES_CLAIM]: value })),
  ]) assert.equal(policy.roleFromPayload(payload), null);
  for (const first of roles) for (const second of roles) {
    assert.equal(policy.roleFromPayload({ [policy.ROLES_CLAIM]: [first, second] }), null,
      'do not union roles, including duplicate or composite-derived application roles');
  }
  assert.equal(policy.roleFromPayload({ realm_access: { roles: ['Soporte'] } }), null,
    'this policy consumes normalized claims; it is not the OIDC adapter');
});

test('Keycloak policy: unrecognized roles, invalid permissions and administrative scopes cannot grant access', () => {
  for (const role of [undefined, null, '', 'root', '__proto__', 'constructor', {}, ['Soporte']]) {
    assert.equal(policy.can(role, policy.BUSINESS_PERMISSIONS, 'read:orders'), false);
  }
  for (const role of roles) {
    for (const permissions of [undefined, null, '', 'read:own-profile', {}, 1]) {
      assert.equal(policy.can(role, permissions, 'read:own-profile'), false);
    }
    for (const permission of [undefined, null, '', 'delete:users', 'manage:realm', 'realm-admin',
      'create:clients', 'view:kanban-module', 'read:orders ', '__proto__']) {
      assert.equal(policy.can(role, [...policy.BUSINESS_PERMISSIONS, permission], permission), false);
    }
  }
});

test('Keycloak policy: stale JWT grants cannot restore revoked user management', () => {
  for (const role of roles.filter(role => role !== 'Soporte')) {
    const payload = { ...payloadFor(role), permissions: legacy.BUSINESS_PERMISSIONS };
    assert.equal(policy.can(policy.roleFromPayload(payload), payload.permissions, 'manage:users'), false);
  }
});

test('Keycloak policy: ordinary assignment permits only six departmental targets', () => {
  const assignable = roles.slice(0, 6);
  assert.deepEqual(policy.ASSIGNABLE_ROLES, assignable);
  assert.deepEqual(policy.PRIVILEGED_ROLES, ['Gerencia', 'Desarrollador', 'Soporte']);
  for (const actor of roles) {
    assert.deepEqual(policy.manageableRoles(actor), actor === 'Soporte' ? assignable : []);
    for (const target of roles) {
      assert.equal(policy.canManageUser(actor, target), actor === 'Soporte' && assignable.includes(target));
    }
    assert.equal(policy.canManageUser(actor, actor), false, 'no ordinary self role elevation');
  }
  for (const invalid of [undefined, null, '', 'root', '__proto__', 'constructor', ['Soporte']]) {
    assert.deepEqual(policy.manageableRoles(invalid), []);
    assert.equal(policy.canManageUser(invalid, 'Operario Ventas'), false);
    assert.equal(policy.canManageUser('Soporte', invalid), false);
  }
});

test('Keycloak policy: consumers cannot mutate capability or assignment catalogs', () => {
  for (const catalog of [policy.ROLES, policy.RECOGNIZED_ROLES, policy.ADMIN_ROLES,
    policy.ROLE_PERMISSIONS, policy.ASSIGNABLE_ROLES, policy.PRIVILEGED_ROLES,
    policy.LEGACY_TECHNICAL_ROLE_MIGRATION, ...Object.values(policy.ROLE_PERMISSIONS)]) {
    assert.equal(Object.isFrozen(catalog), true);
  }
  assert.throws(() => policy.ROLE_PERMISSIONS.Soporte.push('read:orders'), TypeError);
  assert.throws(() => policy.ASSIGNABLE_ROLES.push('Desarrollador'), TypeError);
  assert.throws(() => { policy.ROLES.SOPORTE = 'Desarrollador'; }, TypeError);
});

test('isolation: importing the new policy preserves the active legacy matrix and middleware', () => {
  assert.equal(legacy.RECOGNIZED_ROLES.length, 8);
  assert.equal(legacy.roleFromPayload(payloadFor('Desarrollador')), null);
  assert.deepEqual(legacy.ROLE_PERMISSIONS.Soporte, legacy.BUSINESS_PERMISSIONS);
  assert.deepEqual(legacy.manageableRoles('Soporte'), legacy.FUNCTIONAL_ROLES);
  for (const role of ['Administrador Produccion', 'Administrador Ventas', 'Administrador Cobranzas', 'Soporte']) {
    assert.equal(legacy.can(role, ['manage:users'], 'manage:users'), true);
    let status;
    requireCapability('manage:users')({ auth: { payload: {
      ...payloadFor(role), permissions: ['manage:users'],
    } } }, { status(code) { status = code; return this; }, json() {} }, () => { status = 204; });
    assert.equal(status, 204, 'the existing middleware still uses the complete legacy policy');
  }
  const raw = { typ: 'Bearer', azp: 'itecsa-web', sub: 'synthetic-subject',
    realm_access: { roles: ['Desarrollador'] }, permissions: ['read:orders'] };
  assert.equal(normalizeKeycloakClaims(raw, 'itecsa-web'), null, 'do not activate phase 02 claims');
  assert.deepEqual(normalizeKeycloakClaims({ ...raw, realm_access: { roles: ['Soporte'] } }, 'itecsa-web')
    [legacy.ROLES_CLAIM], ['Soporte']);
});

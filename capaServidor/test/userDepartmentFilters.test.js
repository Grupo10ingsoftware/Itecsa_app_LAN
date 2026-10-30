import test from 'node:test';
import assert from 'node:assert/strict';
import { validateListUsersQuery } from '../src/modules/users/validators/adminUsers.validator.js';
import { KeycloakIdentityRepository } from '../src/modules/users/repo/keycloakIdentity.repo.js';
import { KeycloakIdentityAdministrationService } from '../src/modules/users/service/keycloakIdentityAdministration.service.js';
import { ASSIGNABLE_ROLES, ROLES, PERMISSIONS } from '../../shared/authorization.js';
import { USER_DEPARTMENTS } from '../../shared/userDepartments.js';

test('department is optional and accepts only the three public keys', () => {
  const legacy = validateListUsersQuery({ rolUsuario: ROLES.VENTAS });
  assert.equal(legacy.valid, true);
  assert.equal(Object.hasOwn(legacy.filters, 'department'), false);
  for (const { value } of USER_DEPARTMENTS) {
    assert.equal(validateListUsersQuery({ department: value }).filters.department, value);
  }
  for (const department of ['support', 'Gerencia', 'production,sales', ['sales'], {}, 1, null]) {
    assert.equal(validateListUsersQuery({ department }).valid, false);
  }
});

for (const department of USER_DEPARTMENTS) {
  test(department.label + ' uses both actual roles in SQL and count before pagination', async () => {
    let sql, where;
    const repository = new KeycloakIdentityRepository({ prisma: {
      $queryRaw: async query => { sql = query; return []; },
      usuario: { count: async query => { where = query.where; return 31; } },
    } });
    const filters = validateListUsersQuery({ department: department.value, search: 'Ana', estadoUsuario: 'Vinculado', page: '3' }).filters;
    const result = await repository.list('issuer-only', filters);
    assert.deepEqual(where.rol_usuario.in, ASSIGNABLE_ROLES.filter(role => department.roles.includes(role)));
    assert.equal(where.ExternalIdentity.is.issuer, 'issuer-only');
    assert.equal(where.ExternalIdentity.is.provider, 'keycloak');
    assert.ok(where.estado_usuario.in.includes('Activo'));
    for (const role of department.roles) assert.equal(sql.values.filter(value => value === role).length, 2);
    assert.ok(sql.values.includes('%Ana%'));
    assert.deepEqual(sql.values.slice(-2), [10, 20]);
    assert.equal(result.total, 31);
    assert.equal(result.page, 3);
    const combined = repository.userScope('issuer-only', { department: department.value, rolUsuario: ROLES.VENTAS });
    assert.equal(combined.rol_usuario.equals, ROLES.VENTAS);
    assert.deepEqual(combined.rol_usuario.in, where.rol_usuario.in);
    assert.ok(!combined.rol_usuario.in.includes(ROLES.GERENCIA));
  });
}

test('department never bypasses existing administrative authorization', async () => {
  let queries = 0;
  const service = new KeycloakIdentityAdministrationService({
    management: { config: { issuer: 'issuer-only' } },
    repository: { list: async (_issuer, filters) => { queries++; return filters; } },
  });
  const currentUser = { identitySubject: 'actor', idUsuario: 1, rolUsuario: ROLES.SOPORTE, estadoUsuario: 'Activo' };
  const context = { provider: 'keycloak', subject: 'actor', role: ROLES.SOPORTE,
    permissions: [PERMISSIONS.MANAGE_USERS], currentUser };
  for (const role of [ROLES.SOPORTE, ROLES.DESARROLLADOR]) {
    assert.equal((await service.list({ ...context, role, currentUser: { ...currentUser, rolUsuario: role } }, { department: 'sales' })).department, 'sales');
  }
  for (const invalid of [
    { ...context, permissions: [] },
    { ...context, role: ROLES.VENTAS },
    { ...context, role: ROLES.GERENCIA },
    { ...context, currentUser: { ...currentUser, estadoUsuario: 'Desvinculado' } },
  ]) await assert.rejects(service.list(invalid, { department: 'sales' }), { code: 'IDENTITY_ADMIN_FORBIDDEN' });
  await assert.rejects(service.list(context, { department: 'sales', rolUsuario: ROLES.SOPORTE }), { code: 'IDENTITY_TARGET_FORBIDDEN' });
  assert.equal(queries, 2);
});

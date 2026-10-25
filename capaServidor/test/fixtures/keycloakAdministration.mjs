import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import express from 'express';
import { KeycloakManagementService } from '../../src/modules/users/service/keycloakManagement.service.js';
import { KeycloakIdentityAdministrationService } from '../../src/modules/users/service/keycloakIdentityAdministration.service.js';
import { KeycloakIdentityRepository } from '../../src/modules/users/repo/keycloakIdentity.repo.js';
import { ROLE_PERMISSIONS, ASSIGNABLE_ROLES } from '../../../shared/keycloakAuthorization.js';
import { ADMIN_LAB } from '../../../scripts/keycloak-phase06-realm.mjs';
import { LAB } from '../../../scripts/keycloak-phase02-realm.mjs';
import { createKeycloakIdentityPreparationRouter } from '../../src/modules/users/routes/keycloakIdentityPreparation.routes.js';

export async function runAdministrationRegression(t, { db, actors, pins, login, users, authenticate }) {
  assert.equal(process.env.APP_ENV, 'test');
  assert.equal(process.env.RUN_KEYCLOAK_ADMIN_INTEGRATION, 'true');
  assert.equal(process.env.DB_HOST, 'phase02-mysql');
  assert.equal(process.env.DB_NAME, 'itecsa_identity_phase02_test');
  assert.equal(process.env.KEYCLOAK_ISSUER, LAB.issuer);
  assert.equal(typeof db.identityProvisionOperation?.create, 'function', 'fresh generated Prisma client must load after bootstrap');
  const management = new KeycloakManagementService();
  const repository = new KeycloakIdentityRepository({ prisma: db });
  const service = new KeycloakIdentityAdministrationService({ management, repository, pins });
  const app = express(); app.use(express.json());
  app.use('/phase06', createKeycloakIdentityPreparationRouter({ authenticate, service }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = 'http://127.0.0.1:' + server.address().port + '/phase06';
  const support = { provider: 'keycloak', subject: actors.get('Soporte').sub, role: 'Soporte',
    permissions: ROLE_PERMISSIONS.Soporte, pin: actors.get('Soporte').pin };
  const input = username => ({ username, firstName: 'Synthetic', lastName: 'Administration', email: null, role: 'Operario Ventas' });
  const existing = async () => management.findByUsername('phase06-ordinary-0');
  const posts = [];
  const monitored = async (url, options) => {
    if (options.method === 'POST' && url === management.config.adminUrl + '/users') posts.push(url);
    return fetch(url, options);
  };

  await t.test('phase06 additive migration preserves historical PK/FK, legacy subject, email and PIN; nullable email retains uniqueness', async () => {
    const old = await db.usuario.findUnique({ where: { id_usuario: 88501 } });
    assert.equal(old.id_auth0, 'legacy|phase06-preserved'); assert.equal(old.correo_usuario, 'phase06-history@example.invalid');
    assert.equal(old.pin_hash, 'synthetic-existing-hash'); assert.equal(old.pin_salt, 'synthetic-existing-salt');
    const record = await db.registros.findUnique({ where: { ID_REGISTRO: 88501 } });
    assert.equal(record.id_usuario, 88501); assert.equal(record.observacion, 'phase06-existing-history');
    await assert.rejects(db.usuario.create({ data: { id_auth0: 'phase06-duplicate-email', correo_usuario: old.correo_usuario } }), error => error.code === 'P2002');
    const columns = await db.$queryRaw`SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Usuario' AND COLUMN_NAME='correo_usuario'`;
    assert.equal(columns[0].IS_NULLABLE, 'YES');
    const collations = await db.$queryRaw`SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ExternalIdentity' AND COLUMN_NAME IN ('issuer','subject','username')`;
    assert.equal(collations.length, 3); assert.ok(collations.every(column => column.COLLATION_NAME === 'utf8mb4_bin'));
  });
  await t.test('phase06 backend authorization: only new Soporte can prepare identities; all nine roles retain their own limits', async () => {
    for (const { role } of users) {
      const actor = actors.get(role);
      const context = { provider: 'keycloak', subject: actor.sub, role, permissions: ROLE_PERMISSIONS[role], pin: actor.pin };
      if (role !== 'Soporte') await assert.rejects(service.prepare(context, input('phase06-denied-' + users.findIndex(user => user.role === role))),
        error => error.code === 'IDENTITY_ADMIN_FORBIDDEN' && error.status === 403);
      else {
        const result = await service.prepare(context, input('phase06-support-preparation'));
        assert.equal(result.outcome, 'identity_prepared'); assert.equal(result.fullyProvisioned, false);
        assert.equal((await management.getUser(result.externalSubject)).enabled, false);
      }
    }
    assert.equal(await db.identityProvisionOperation.count(), 1);
    for (const role of ['Gerencia', 'Desarrollador', 'Soporte', 'unknown']) {
      await assert.rejects(service.prepare(support, { ...input('phase06-forbidden'), role }), error => error.code === 'IDENTITY_ROLE_FORBIDDEN');
    }
    await assert.rejects(service.prepare({ ...support, provider: 'auth0' }, input('phase06-provider-confusion')), error => error.status === 403);
    await assert.rejects(service.prepare({ ...support, permissions: [] }, input('phase06-no-capability')), error => error.status === 403);
    await assert.rejects(service.prepare({ ...support, pin: actors.get('Operario Ventas').pin }, input('phase06-foreign-pin')));
    await assert.rejects(service.inspect(support, support.subject), error => error.code === 'IDENTITY_SELF_TARGET_FORBIDDEN');
  });
  await t.test('phase06 six ordinary roles, nullable contact and stable local mapping; idempotency never activates an incomplete account', async () => {
    for (const [index, role] of ASSIGNABLE_ROLES.entries()) {
      const data = { ...input('phase06-ordinary-' + index), role };
      const result = await service.prepare(support, data);
      assert.equal(result.outcome, 'identity_prepared'); assert.equal(result.credentialsConfigured, false);
      const again = await service.prepare(support, data);
      assert.equal(again.operationId, result.operationId); assert.equal(again.localUserId, result.localUserId);
      const local = await db.usuario.findUnique({ where: { id_usuario: result.localUserId } });
      assert.equal(local.id_auth0, result.externalSubject); assert.equal(local.correo_usuario, null);
      assert.equal(local.estado_usuario, 'Pendiente'); assert.equal(local.rol_usuario, role); assert.equal(local.pin_hash, null);
      const detail = await service.findByUsername(support, data.username);
      assert.equal(detail.localUserId, local.id_usuario); assert.equal(detail.enabled, false); assert.equal(detail.email, null);
      await assert.rejects(service.prepare(support, { ...data, firstName: 'Changed' }), error => error.code === 'IDENTITY_OPERATION_PAYLOAD_CONFLICT');
    }
    assert.equal(await db.externalIdentity.count(), 7);
  });
  await t.test('phase06 duplicate username and existing identities never get adopted by email or name', async () => {
    const target = await existing();
    await assert.rejects(management.createDisabled({ ...input(target.username), operationId: randomUUID() }),
      error => error.code === 'KEYCLOAK_USER_EXISTS' && !error.ambiguous);
    const failed = await service.prepare(support, input(users[0].username));
    assert.equal(failed.outcome, 'failed');
    const unchanged = await management.findByUsername(users[0].username);
    assert.equal(unchanged.enabled, true); assert.equal((await management.roles(unchanged.id))[0].name, users[0].role);
  });
  await t.test('phase06 future router factory uses real JWT/PIN and refuses forged context; public application gate is preserved', async () => {
    const target = await existing();
    for (const { role } of users) {
      const actor = actors.get(role), headers = { authorization: 'Bearer ' + actor.token, 'content-type': 'application/json' };
      const read = await fetch(base + '/identities/' + target.id, { headers });
      assert.equal(read.status, role === 'Soporte' ? 200 : 403);
      const prepare = await fetch(base + '/identities/prepare', { method: 'POST', headers,
        body: JSON.stringify({ identity: { ...input(target.username), role: ASSIGNABLE_ROLES[0] }, pin: actor.pin }) });
      assert.equal(prepare.status, role === 'Soporte' ? 202 : 403);
      if (role === 'Soporte') { const result = await prepare.json(); assert.equal(result.fullyProvisioned, false); }
    }
    assert.equal((await fetch(base + '/identities/' + target.id)).status, 401);
    assert.equal((await fetch(base + '/identities/' + target.id, { headers: { authorization: 'Bearer malformed' } })).status, 401);
    const forged = await fetch(base + '/identities/prepare', { method: 'POST',
      headers: { authorization: 'Bearer ' + actors.get('Soporte').token, 'content-type': 'application/json' },
      body: JSON.stringify({ identity: input('phase06-forged'), pin: support.pin, actorId: 88501 }) });
    assert.equal(forged.status, 400);
    assert.equal(await management.findByUsername('phase06-forged'), null);
  });
  await t.test('phase06 simultaneous preparation uses SQL uniqueness and CAS across independent services', async () => {
    const before = await db.externalIdentity.count();
    const watched = new KeycloakManagementService({ fetcher: monitored });
    const a = new KeycloakIdentityAdministrationService({ management: watched, repository, pins });
    const b = new KeycloakIdentityAdministrationService({ management: watched, repository: new KeycloakIdentityRepository({ prisma: db }), pins });
    const beforePosts = posts.length;
    const results = await Promise.all([a, b].map(worker => worker.prepare(support, input('phase06-concurrent'))));
    assert.ok(results.some(result => result.outcome === 'identity_prepared'));
    assert.equal(results[0].operationId, results[1].operationId);
    assert.equal(posts.length - beforePosts, 1);
    assert.equal(await db.externalIdentity.count(), before + 1);
    assert.equal((await management.listUsers({ username: 'phase06-concurrent', max: 2 })).length, 1);
  });
  await t.test('phase06 timeout after committed Keycloak POST reconciles using an admin-only marker without repeating creation', async () => {
    let creates = 0;
    const interrupted = new KeycloakManagementService({ fetcher: async (url, options) => {
      const response = await fetch(url, options);
      if (options.method === 'POST' && url === management.config.adminUrl + '/users') {
        creates++; assert.equal(response.status, 201); await response.body?.cancel();
        throw new DOMException('Synthetic lost response after real write', 'TimeoutError');
      }
      return response;
    } });
    const worker = new KeycloakIdentityAdministrationService({ management: interrupted, repository, pins });
    const pending = await worker.prepare(support, input('phase06-lost-response'));
    assert.equal(pending.outcome, 'needs_reconciliation'); assert.equal(pending.localUserId, null); assert.equal(creates, 1);
    const prepared = await service.reconcile(support, pending.operationId);
    assert.equal(prepared.outcome, 'identity_prepared'); assert.equal(creates, 1);
    assert.equal((await management.getUser(prepared.externalSubject)).enabled, false);
    assert.equal((await db.identityProvisionOperation.findUnique({ where: { id: pending.operationId } })).state, 'prepared');
  });
  await t.test('phase06 MySQL failure after external creation remains denied and resumes with a new service instance', async () => {
    // Fail after Usuario was inserted inside the SQL transaction, before binding.
    const broken = db.$extends({ query: { externalIdentity: { create() { throw Error('Synthetic SQL failure, not a provider error'); } } } });
    const worker = new KeycloakIdentityAdministrationService({ management,
      repository: new KeycloakIdentityRepository({ prisma: broken }), pins });
    const pending = await worker.prepare(support, input('phase06-sql-failure'));
    assert.equal(pending.outcome, 'needs_reconciliation');
    const external = await management.findByUsername('phase06-sql-failure');
    assert.equal(external.enabled, false);
    assert.equal(await db.usuario.count({ where: { id_auth0: external.id } }), 0);
    const fresh = new KeycloakIdentityAdministrationService({ management: new KeycloakManagementService(), repository, pins });
    const recovered = await fresh.reconcile(support, pending.operationId);
    assert.equal(recovered.externalSubject, external.id); assert.equal(recovered.outcome, 'identity_prepared');
  });
  await t.test('phase06 unknown external outcome and orphaned running operations never retry a create', async () => {
    let creates = 0;
    const noWrite = new KeycloakManagementService({ fetcher: async (url, options) => {
      if (options.method === 'POST' && url === management.config.adminUrl + '/users') {
        creates++; throw new DOMException('Synthetic pre-dispatch timeout', 'TimeoutError');
      }
      return fetch(url, options);
    } });
    const worker = new KeycloakIdentityAdministrationService({ management: noWrite, repository, pins });
    const pending = await worker.prepare(support, input('phase06-unknown-outcome'));
    assert.equal(pending.outcome, 'needs_reconciliation');
    assert.equal((await service.reconcile(support, pending.operationId)).outcome, 'needs_reconciliation');
    assert.equal((await worker.prepare(support, input('phase06-unknown-outcome'))).outcome, 'needs_reconciliation');
    assert.equal(creates, 1); assert.equal(await management.findByUsername('phase06-unknown-outcome'), null);
    // Persist the canonical input order used at the service boundary.
    const data = { username: 'phase06-crashed-process', email: null,
      firstName: 'Synthetic', lastName: 'Administration', role: 'Operario Ventas' };
    const operation = await repository.claim({ issuer: LAB.issuer, input: data,
      digest: createHash('sha256').update(JSON.stringify(data)).digest('hex'), actorId: actors.get('Soporte').id });
    await repository.acquire(operation, false);
    assert.equal((await worker.prepare(support, data)).outcome, 'running');
    await assert.rejects(service.reconcile(support, operation.id), error => error.code === 'IDENTITY_OPERATION_NOT_RECONCILABLE');
    assert.equal(creates, 1);
  });
  await t.test('phase06 insufficient service token, missing account, invalid role and protected existing target are denied', async () => {
    const limited = new KeycloakManagementService({ env: { ...process.env, KEYCLOAK_ADMIN_CLIENT_ID: ADMIN_LAB.insufficientClientId } });
    await assert.rejects(limited.listUsers(), error => error.code === 'KEYCLOAK_INSUFFICIENT_SCOPE' && error.status === 503);
    await assert.rejects(management.getUser(randomUUID()), error => error.code === 'KEYCLOAK_USER_NOT_FOUND');
    await assert.rejects(management.replaceRole((await existing()).id, 'Desarrollador'), error => error.code === 'KEYCLOAK_ROLE_FORBIDDEN');
    const privileged = await management.findByUsername('phase06-privileged-target');
    await assert.rejects(management.replaceRole(privileged.id, 'Operario Ventas'), error => error.code === 'KEYCLOAK_TARGET_FORBIDDEN');
    assert.equal((await management.roles(privileged.id))[0].name, 'Soporte');
    await assert.rejects(service.inspect(support, privileged.id), error => error.code === 'IDENTITY_TARGET_FORBIDDEN');
    const tokenBody = JSON.parse(Buffer.from((await management.token()).split('.')[1], 'base64url'));
    assert.equal(tokenBody.resource_access['realm-management'].roles.includes('realm-admin'), false);
    const supportBody = JSON.parse(Buffer.from(actors.get('Soporte').token.split('.')[1], 'base64url'));
    assert.equal(supportBody.resource_access?.['realm-management'], undefined);
  });
  await t.test('phase06 adapter attributes, enabled status, direct/effective role replacement and removal are real', async () => {
    const target = await existing();
    await management.updateAttributes(target.id, { firstName: 'Updated Synthetic', email: 'phase06-updated@example.invalid' });
    assert.equal((await management.getUser(target.id)).firstName, 'Updated Synthetic');
    await assert.rejects(service.prepare(support, { ...input(target.username), role: ASSIGNABLE_ROLES[0] }),
      error => error.code === 'IDENTITY_PREPARATION_CHANGED');
    await management.updateAttributes(target.id, { email: null });
    assert.equal((await management.getUser(target.id)).email ?? null, null);
    await management.setEnabled(target.id, true);
    assert.equal((await management.getUser(target.id)).enabled, true);
    await assert.rejects(management.replaceRole(target.id, 'Operario Ventas'), error => error.code === 'KEYCLOAK_ROLE_CHANGE_REQUIRES_DISABLED');
    await management.setEnabled(target.id, false);
    await management.replaceRole(target.id, 'Operario Cobranzas');
    assert.deepEqual((await management.roles(target.id)).map(role => role.name), ['Operario Cobranzas']);
    await management.removeRole(target.id, 'Operario Cobranzas');
    assert.deepEqual(await management.roles(target.id), []);
    await management.replaceRole(target.id, ASSIGNABLE_ROLES[0]);
    const page = await management.listUsers({ first: 0, max: 1 });
    assert.equal(page.length, 1);
  });
  await t.test('phase06 logout closes real sessions and invalidates refresh; local history never changes', async () => {
    const { tokens } = await login(users[4].username);
    await management.logout(actors.get(users[4].role).sub);
    const refresh = await fetch(LAB.issuer + '/protocol/openid-connect/token', { method: 'POST',
      body: new URLSearchParams({ client_id: LAB.clientId, grant_type: 'refresh_token', refresh_token: tokens.refresh_token }) });
    assert.equal(refresh.status, 400); assert.equal((await refresh.json()).error, 'invalid_grant');
    assert.equal((await db.registros.findUnique({ where: { ID_REGISTRO: 88501 } })).id_usuario, 88501);
  });
  await t.test('phase06 journal unavailable fails before creation and revocation during preparation prevents local activation', async () => {
    const broken = db.$extends({ query: { identityProvisionOperation: { create() { throw Error('Synthetic journal outage'); } } } });
    const worker = new KeycloakIdentityAdministrationService({ management, repository: new KeycloakIdentityRepository({ prisma: broken }), pins });
    await assert.rejects(worker.prepare(support, input('phase06-no-journal')), error => error.code === 'IDENTITY_JOURNAL_UNAVAILABLE');
    assert.equal(await management.findByUsername('phase06-no-journal'), null);
    const interrupted = new KeycloakManagementService({ fetcher: async (url, options) => {
      const response = await fetch(url, options);
      if (options.method === 'POST' && url === management.config.adminUrl + '/users') {
        await db.usuario.update({ where: { id_auth0: support.subject }, data: { estado_usuario: 'Desvinculado' } });
      }
      return response;
    } });
    try {
      const revoked = new KeycloakIdentityAdministrationService({ management: interrupted, repository, pins });
      const pending = await revoked.prepare(support, input('phase06-revoked-actor'));
      assert.equal(pending.outcome, 'needs_reconciliation'); assert.equal(pending.localUserId, null);
      assert.equal((await management.findByUsername('phase06-revoked-actor')).enabled, false);
    } finally { await db.usuario.update({ where: { id_auth0: support.subject }, data: { estado_usuario: 'Activo' } }); }
    let replacementId;
    const rebound = new KeycloakManagementService({ fetcher: async (url, options) => {
      const response = await fetch(url, options);
      if (options.method === 'POST' && url === management.config.adminUrl + '/users') {
        await db.$transaction(async tx => {
          await tx.usuario.update({ where: { id_usuario: actors.get('Soporte').id }, data: { id_auth0: support.subject + '-retired' } });
          const replacement = await tx.usuario.create({ data: { id_auth0: support.subject, correo_usuario: null,
            rol_usuario: 'Soporte', estado_usuario: 'Activo' } });
          replacementId = replacement.id_usuario;
        });
      }
      return response;
    } });
    try {
      const worker = new KeycloakIdentityAdministrationService({ management: rebound, repository, pins });
      const pending = await worker.prepare(support, input('phase06-rebound-actor'));
      assert.equal(pending.outcome, 'needs_reconciliation'); assert.equal(pending.localUserId, null);
      assert.equal((await management.findByUsername('phase06-rebound-actor')).enabled, false);
    } finally {
      if (replacementId) await db.usuario.delete({ where: { id_usuario: replacementId } });
      await db.usuario.update({ where: { id_usuario: actors.get('Soporte').id }, data: { id_auth0: support.subject } });
    }
    const audit = await db.securityAuditEvent.findMany({ where: { event_type: 'identity.preparation' } });
    assert.ok(audit.length > 0); assert.ok(audit.every(event => event.actor_user_id === actors.get('Soporte').id));
    const operations = await db.identityProvisionOperation.findMany(), journal = JSON.stringify(operations);
    for (const forbidden of [ADMIN_LAB.secret, actors.get('Soporte').token]) assert.equal(journal.includes(forbidden), false);
    // PIN must not enter input; random IDs/digests can coincidentally contain six digits.
    assert.equal(JSON.stringify(operations.map(operation => operation.input)).includes(actors.get('Soporte').pin), false);
  });
  console.log('PHASE06_ADMINISTRATION:EXECUTED realServiceAccount=true realSQL=true sixOrdinaryRoles=true publicRoutesGated=true; check TAP');
}

import { departmentRoles } from '../../../../../shared/userDepartments.js';
import { identityUserWhere } from '../../../database/identityBinding.js';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import getPrismaClient from '../../../database/prisma.js';
import { isActiveUserStatus, ACTIVE_USER_STATUSES, USER_STATUS } from '../../../config/userLifecycle.js';
import { ADMIN_ROLES, ASSIGNABLE_ROLES } from '../../../../../shared/keycloakAuthorization.js';
import { UserMovementsRepository } from './userMovements.repo.js';

function listPredicate(issuer, { search = '', estadoUsuario = '', rolUsuario = '', department = '' } = {}) {
  const conditions = [Prisma.sql`e.provider = 'keycloak'`, Prisma.sql`e.issuer = ${issuer}`,
    Prisma.sql`u.rol_usuario IN (${Prisma.join([...ASSIGNABLE_ROLES])})`];
  if (department) conditions.push(Prisma.sql`u.rol_usuario IN (${Prisma.join([...departmentRoles(department)])})`);
  if (rolUsuario) conditions.push(Prisma.sql`u.rol_usuario = ${rolUsuario}`);
  if (estadoUsuario) conditions.push(ACTIVE_USER_STATUSES.includes(estadoUsuario)
    ? Prisma.sql`u.estado_usuario IN (${Prisma.join([...ACTIVE_USER_STATUSES])})`
    : Prisma.sql`u.estado_usuario = ${estadoUsuario}`);
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(Prisma.sql`(u.nombre_usuario LIKE ${pattern} OR u.apellido_usuario LIKE ${pattern}
      OR u.correo_usuario LIKE ${pattern} OR u.rut_usuario LIKE ${pattern} OR e.username LIKE ${pattern})`);
  }
  return Prisma.join(conditions, ' AND ');
}

function mapBinding(row) {
  if (!row) return null;
  const { id_usuario, rol_usuario, estado_usuario, correo_usuario, nombre_usuario, apellido_usuario, ...binding } = row;
  return { ...binding, Usuario: { id_usuario, rol_usuario, estado_usuario, correo_usuario, nombre_usuario, apellido_usuario } };
}

async function insertOne(model, data) {
  // These writes have no generated fields consumed by this workflow. Keep
  // constraints and transaction ownership, without hydrating the inserted row.
  const inserted = await model.createMany({ data: [data] });
  if (inserted.count !== 1) throw Error('IDENTITY_STORAGE_NOT_CONFIRMED');
}

// Explicit external bindings preserve local keys and actor ownership.
export class KeycloakIdentityRepository {
  constructor({ prisma } = {}) { this.prisma = prisma; }
  get client() { return this.prisma ?? getPrismaClient(); }
  userScope(issuer, { search = '', estadoUsuario = '', rolUsuario = '', department = '' } = {}) {
    const where = { rol_usuario: { in: [...ASSIGNABLE_ROLES] }, ExternalIdentity: { is: { provider: 'keycloak', issuer } } };
    if (department) where.rol_usuario.in = ASSIGNABLE_ROLES.filter(role => departmentRoles(department).includes(role));
    if (rolUsuario) where.rol_usuario.equals = rolUsuario;
    if (estadoUsuario) where.estado_usuario = ACTIVE_USER_STATUSES.includes(estadoUsuario)
      ? { in: [...ACTIVE_USER_STATUSES] } : estadoUsuario;
    if (search) where.OR = ['nombre_usuario', 'apellido_usuario', 'correo_usuario', 'rut_usuario'].map(field => ({ [field]: { contains: search } }))
      .concat({ ExternalIdentity: { is: { username: { contains: search } } } });
    return where;
  }
  async list(issuer, { page, perPage, ...filters }) {
    const where = this.userScope(issuer, filters);
    const [rows, total] = await Promise.all([
      this.client.$queryRaw(Prisma.sql`SELECT u.id_usuario, u.correo_usuario, u.rut_usuario,
        u.nombre_usuario, u.apellido_usuario, u.rol_usuario, u.estado_usuario, e.subject, e.username
        FROM Usuario u JOIN ExternalIdentity e ON e.user_id = u.id_usuario
        WHERE ${listPredicate(issuer, filters)} ORDER BY u.id_usuario DESC
        LIMIT ${perPage} OFFSET ${(page - 1) * perPage}`),
      this.client.usuario.count({ where }),
    ]);
    return { usuarios: rows.map(row => {
      const identityBindingConflict = typeof row.subject !== 'string' || !row.subject;
      return { idUsuario: row.id_usuario, idUsuarioAutenticacionExterna: identityBindingConflict ? null : row.subject,
        identityBindingConflict,
        username: row.username, nombreUsuario: row.nombre_usuario, apellidoUsuario: row.apellido_usuario,
        rutUsuario: row.rut_usuario, correoUsuario: row.correo_usuario, rolUsuario: row.rol_usuario,
        estadoUsuario: row.estado_usuario?.startsWith('Actualizando:') ? 'Actualizando' : row.estado_usuario };
    }), total, page, perPage };
  }
  async summary(issuer) {
    const groups = await this.client.usuario.groupBy({ by: ['estado_usuario'], where: this.userScope(issuer), _count: { _all: true } });
    const counts = new Map(groups.map(group => [group.estado_usuario, group._count._all]));
    return { totalUsuarios: groups.reduce((sum, group) => sum + group._count._all, 0),
      vinculados: ACTIVE_USER_STATUSES.reduce((sum, status) => sum + (counts.get(status) ?? 0), 0),
      desvinculados: counts.get(USER_STATUS.UNLINKED) ?? 0, pendientes: counts.get(USER_STATUS.PENDING_FIRST_LOGIN) ?? 0,
      pendientesRol: counts.get(USER_STATUS.PENDING_ROLE) ?? 0 };
  }
  movements(userId, filters) { return new UserMovementsRepository({ prisma: this.client }).list(userId, filters); }
  actor(subject) {
    return this.client.usuario.findFirst({ where: identityUserWhere(subject),
      select: { id_usuario: true, rol_usuario: true, estado_usuario: true } });
  }
  async claim({ issuer, input, digest, actorId }) {
    const operation = { id: randomUUID(), issuer, username: input.username, input,
      payload_digest: digest, state: 'pending', revision: 0, actor_user_id: actorId,
      external_subject: null, local_user_id: null, last_error: null };
    try {
      await insertOne(this.client.identityProvisionOperation, operation);
      return operation;
    } catch (error) {
      if (error?.code !== 'P2002') throw error;
      const existing = await this.client.identityProvisionOperation.findUnique({ where: { issuer_username: { issuer, username: input.username } } });
      if (!existing) throw error;
      return existing;
    }
  }
  operation(id) { return this.client.identityProvisionOperation.findUnique({ where: { id } }); }
  async acquire(operation, reconcile) {
    const result = await this.client.identityProvisionOperation.updateMany({
      where: { id: operation.id, revision: operation.revision, state: reconcile ? 'needs_reconciliation' : 'pending' },
      data: { state: 'running', revision: { increment: 1 }, last_error: null },
    });
    // The conditional write owns this revision. All returned business fields
    // are already known; rereading the same row adds a round trip, not a guard.
    return result.count === 1 ? { ...operation, state: 'running', revision: operation.revision + 1, last_error: null } : null;
  }
  async checkpoint(operation, subject) {
    const result = await this.client.identityProvisionOperation.updateMany({
      where: { id: operation.id, state: 'running', revision: operation.revision },
      data: { external_subject: subject },
    });
    if (result.count !== 1) throw Error('IDENTITY_OPERATION_CONFLICT');
  }
  async fail(operation, code, { terminal = false, actorId } = {}) {
    return this.client.$transaction(async tx => {
      const result = await tx.identityProvisionOperation.updateMany({
        where: { id: operation.id, state: 'running', revision: operation.revision },
        data: { state: terminal ? 'failed' : 'needs_reconciliation', last_error: code },
      });
      if (result.count !== 1) throw Error('IDENTITY_OPERATION_CONFLICT');
      await insertOne(tx.securityAuditEvent, { event_type: 'identity.preparation', actor_user_id: actorId,
        action: 'prepare', resource_type: 'identity_operation', resource_id: operation.id, request_id: operation.id,
        outcome: terminal ? 'rejected' : 'pending', reason_code: code });
    });
  }
  async complete(operation, subject, actorId, actorSubject, actorRole) {
    return this.client.$transaction(async tx => {
      const actors = await tx.$queryRaw`SELECT u.rol_usuario, u.estado_usuario, e.subject, e.issuer, e.provider FROM Usuario u JOIN ExternalIdentity e ON e.user_id = u.id_usuario WHERE u.id_usuario=${actorId} FOR UPDATE`;
      if (actors[0]?.subject !== actorSubject || actors[0]?.provider !== 'keycloak' || actors[0]?.issuer !== operation.issuer || actors[0]?.rol_usuario !== actorRole
        || !ADMIN_ROLES.includes(actorRole) || !isActiveUserStatus(actors[0]?.estado_usuario)) {
        throw Object.assign(Error('El actor cambio durante la preparacion.'), { code: 'IDENTITY_ACTOR_CHANGED' });
      }
      const input = operation.input;
      if (operation.local_user_id) await tx.$queryRaw`SELECT id_usuario FROM Usuario WHERE id_usuario=${operation.local_user_id} FOR UPDATE`;
      const user = operation.local_user_id
        ? await tx.usuario.findFirst({ where: { id_usuario: operation.local_user_id, id_keycloak: subject,
          ExternalIdentity: { is: { provider: 'keycloak', issuer: operation.issuer, subject, username: operation.username } } },
        select: { id_usuario: true, rol_usuario: true, estado_usuario: true, correo_usuario: true,
          rut_usuario: true, nombre_usuario: true, apellido_usuario: true } })
        : await tx.usuario.create({ data: { id_keycloak: subject, correo_usuario: input.email, rut_usuario: input.rut ?? null,
        nombre_usuario: input.firstName, apellido_usuario: input.lastName, rol_usuario: input.role, estado_usuario: 'Pendiente' },
        select: { id_usuario: true } });
      if (!user) throw Error('IDENTITY_BINDING_CONFLICT');
      // A partially provisioned account may have been edited since the failure.
      // Reconciliation must never activate it using stale journal privileges.
      if (operation.local_user_id && (user.estado_usuario !== 'Pendiente' || user.rol_usuario !== input.role
        || user.correo_usuario !== input.email || user.rut_usuario !== (input.rut ?? null)
        || user.nombre_usuario !== input.firstName || user.apellido_usuario !== input.lastName)) throw Error('IDENTITY_BINDING_CONFLICT');
      if (!operation.local_user_id) await insertOne(tx.externalIdentity, { provider: 'keycloak', issuer: operation.issuer, subject,
        username: input.username, user_id: user.id_usuario });
      await insertOne(tx.securityAuditEvent, { event_type: 'identity.preparation', actor_user_id: actorId,
        action: 'prepare', resource_type: 'identity_operation', resource_id: operation.id, request_id: operation.id,
        outcome: 'prepared' });
      const result = await tx.identityProvisionOperation.updateMany({
        where: { id: operation.id, revision: operation.revision, state: 'running' },
        data: { external_subject: subject, local_user_id: user.id_usuario },
      });
      if (result.count !== 1) throw Error('IDENTITY_OPERATION_CONFLICT');
      return { ...operation, state: 'running', external_subject: subject, local_user_id: user.id_usuario };
    });
  }
  async finish(operation) {
    return this.client.$transaction(async tx => {
      const updated = await tx.identityProvisionOperation.updateMany({
        where: { id: operation.id, state: 'running', revision: operation.revision,
          external_subject: operation.external_subject, local_user_id: operation.local_user_id },
        data: { state: 'created' },
      });
      if (updated.count !== 1) throw Error('IDENTITY_OPERATION_CONFLICT');
      return { ...operation, state: 'created' };
    });
  }
  async beginUpdate(issuer, subject, actorId, actorRole) {
    return this.client.$transaction(async tx => {
      const actors = await tx.usuario.findFirst({ where: { id_usuario: actorId, rol_usuario: actorRole,
        estado_usuario: { in: [...ACTIVE_USER_STATUSES] } }, select: { id_usuario: true } });
      if (!actors) throw Object.assign(Error('Actor no autorizado'), { code: 'IDENTITY_ACTOR_CHANGED' });
      const locked = await tx.$queryRaw`SELECT e.id_external_identity, e.provider, e.issuer, e.subject,
        e.username, e.user_id, u.id_usuario, u.rol_usuario, u.estado_usuario, u.correo_usuario,
        u.nombre_usuario, u.apellido_usuario, p.state AS provision_state
        FROM Usuario u JOIN ExternalIdentity e ON e.user_id = u.id_usuario
        LEFT JOIN IdentityProvisionOperation p ON p.issuer = e.issuer AND p.username = e.username AND p.local_user_id = u.id_usuario
        WHERE e.provider='keycloak' AND e.issuer=${issuer} AND e.subject=${subject} FOR UPDATE`;
      // Use the current locking read. A following ordinary ORM read can still
      // see the transaction's older snapshot under REPEATABLE READ.
      const { provision_state, ...row } = locked[0] ?? {};
      const binding = locked.length ? mapBinding(row) : null;
      if (!binding || binding.Usuario.id_usuario !== binding.user_id
        || !ASSIGNABLE_ROLES.includes(binding.Usuario.rol_usuario) || binding.user_id === actorId) {
        throw Object.assign(Error('Usuario no editable'), { code: 'IDENTITY_TARGET_FORBIDDEN' });
      }
      if (binding.Usuario.estado_usuario?.startsWith('Actualizando:')) {
        throw Object.assign(Error('Actualizacion en curso'), { code: 'IDENTITY_UPDATE_BUSY' });
      }
      if (['running', 'needs_reconciliation'].includes(provision_state)) {
        throw Object.assign(Error('Provision pendiente de conciliacion'), { code: 'IDENTITY_PROVISION_INCOMPLETE' });
      }
      const updateState = 'Actualizando:' + randomUUID().replaceAll('-', '').slice(0, 16);
      const updated = await tx.usuario.updateMany({ where: { id_usuario: binding.user_id,
        estado_usuario: binding.Usuario.estado_usuario }, data: { estado_usuario: updateState } });
      if (updated.count !== 1) throw Object.assign(Error('La cuenta cambio'), { code: 'IDENTITY_UPDATE_BUSY' });
      return { ...binding, updateState };
    });
  }
  async finishUpdate(binding, data, actorId, outcome = 'updated') {
    return this.client.$transaction(async tx => {
      const updated = await tx.usuario.updateMany({ where: { id_usuario: binding.user_id, estado_usuario: binding.updateState,
        ExternalIdentity: { is: { provider: 'keycloak', issuer: binding.issuer, subject: binding.subject } } }, data });
      if (updated.count !== 1) throw Object.assign(Error('La cuenta cambio'), { code: 'IDENTITY_UPDATE_CONFLICT' });
      await insertOne(tx.securityAuditEvent, { event_type: 'identity.update', actor_user_id: actorId,
        action: 'update', resource_type: 'user', resource_id: String(binding.user_id), outcome });
    });
  }
  async binding(issuer, subject) {
    const rows = await this.client.$queryRaw`SELECT e.id_external_identity, e.provider, e.issuer, e.subject,
      e.username, e.user_id, u.id_usuario, u.rol_usuario, u.estado_usuario, u.correo_usuario,
      u.nombre_usuario, u.apellido_usuario FROM ExternalIdentity e JOIN Usuario u ON u.id_usuario = e.user_id
      WHERE e.provider = 'keycloak' AND e.issuer = ${issuer} AND e.subject = ${subject} LIMIT 1`;
    return mapBinding(rows[0]);
  }
}

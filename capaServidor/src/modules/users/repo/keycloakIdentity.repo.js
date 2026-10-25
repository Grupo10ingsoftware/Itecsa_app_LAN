import { randomUUID } from 'node:crypto';
import getPrismaClient from '../../../database/prisma.js';
import { isActiveUserStatus, ACTIVE_USER_STATUSES, USER_STATUS } from '../../../config/userLifecycle.js';
import { ROLES, ASSIGNABLE_ROLES } from '../../../../../shared/keycloakAuthorization.js';
import { USER_RESPONSE_SELECT, UserRepository } from './users.repo.js';

// New-provider persistence is independent of the legacy Auth0 repository.
export class KeycloakIdentityRepository {
  constructor({ prisma } = {}) { this.prisma = prisma; }
  get client() { return this.prisma ?? getPrismaClient(); }
  userScope(issuer, { search = '', estadoUsuario = '', rolUsuario = '' } = {}) {
    const where = { rol_usuario: { in: [...ASSIGNABLE_ROLES] }, ExternalIdentity: { is: { provider: 'keycloak', issuer } } };
    if (rolUsuario) where.rol_usuario = { equals: rolUsuario, in: [...ASSIGNABLE_ROLES] };
    if (estadoUsuario) where.estado_usuario = ACTIVE_USER_STATUSES.includes(estadoUsuario)
      ? { in: [...ACTIVE_USER_STATUSES] } : estadoUsuario;
    if (search) where.OR = ['nombre_usuario', 'apellido_usuario', 'correo_usuario', 'rut_usuario'].map(field => ({ [field]: { contains: search } }))
      .concat({ ExternalIdentity: { is: { username: { contains: search } } } });
    return where;
  }
  async list(issuer, { page, perPage, ...filters }) {
    const where = this.userScope(issuer, filters);
    const [rows, total] = await Promise.all([
      this.client.usuario.findMany({ where, skip: (page - 1) * perPage, take: perPage, orderBy: { id_usuario: 'desc' },
        select: { ...USER_RESPONSE_SELECT, ExternalIdentity: { select: { subject: true, username: true } } } }),
      this.client.usuario.count({ where }),
    ]);
    return { usuarios: rows.map(row => {
      const identityBindingConflict = row.id_auth0 !== row.ExternalIdentity.subject;
      return { idUsuario: row.id_usuario, idUsuarioAutenticacionExterna: identityBindingConflict ? null : row.ExternalIdentity.subject,
        identityBindingConflict,
        username: row.ExternalIdentity.username, nombreUsuario: row.nombre_usuario, apellidoUsuario: row.apellido_usuario,
        rutUsuario: row.rut_usuario, correoUsuario: row.correo_usuario, rolUsuario: row.rol_usuario, estadoUsuario: row.estado_usuario };
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
  movements(userId, filters) { return new UserRepository({ prisma: this.client }).listMovements(userId, filters); }
  actor(subject) {
    return this.client.usuario.findUnique({ where: { id_auth0: subject },
      select: { id_usuario: true, rol_usuario: true, estado_usuario: true } });
  }
  async claim({ issuer, input, digest, actorId }) {
    try {
      return await this.client.identityProvisionOperation.create({ data: { id: randomUUID(), issuer,
        username: input.username, input, payload_digest: digest, state: 'pending', actor_user_id: actorId } });
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
    return result.count === 1 ? this.operation(operation.id) : null;
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
      await tx.securityAuditEvent.create({ data: { event_type: 'identity.preparation', actor_user_id: actorId,
        action: 'prepare', resource_type: 'identity_operation', resource_id: operation.id, request_id: operation.id,
        outcome: terminal ? 'rejected' : 'pending', reason_code: code } });
    });
  }
  async complete(operation, subject, actorId, actorSubject) {
    return this.client.$transaction(async tx => {
      const actors = await tx.$queryRaw`SELECT id_auth0, rol_usuario, estado_usuario FROM Usuario WHERE id_usuario=${actorId} FOR UPDATE`;
      if (actors[0]?.id_auth0 !== actorSubject || actors[0]?.rol_usuario !== ROLES.SOPORTE || !isActiveUserStatus(actors[0]?.estado_usuario)) {
        throw Object.assign(Error('El actor cambio durante la preparacion.'), { code: 'IDENTITY_ACTOR_CHANGED' });
      }
      const input = operation.input;
      const user = await tx.usuario.create({ data: { id_auth0: subject, correo_usuario: input.email,
        nombre_usuario: input.firstName, apellido_usuario: input.lastName, rol_usuario: input.role, estado_usuario: 'Pendiente' } });
      await tx.externalIdentity.create({ data: { provider: 'keycloak', issuer: operation.issuer, subject,
        username: input.username, user_id: user.id_usuario } });
      await tx.securityAuditEvent.create({ data: { event_type: 'identity.preparation', actor_user_id: actorId,
        action: 'prepare', resource_type: 'identity_operation', resource_id: operation.id, request_id: operation.id,
        outcome: 'prepared' } });
      const result = await tx.identityProvisionOperation.updateMany({
        where: { id: operation.id, revision: operation.revision, state: 'running' },
        data: { state: 'prepared', external_subject: subject, local_user_id: user.id_usuario },
      });
      if (result.count !== 1) throw Error('IDENTITY_OPERATION_CONFLICT');
      return this.operationUsing(tx, operation.id);
    });
  }
  operationUsing(client, id) { return client.identityProvisionOperation.findUnique({ where: { id } }); }
  binding(issuer, subject) {
    return this.client.externalIdentity.findUnique({ where: { provider_issuer_subject: { provider: 'keycloak', issuer, subject } },
      include: { Usuario: { select: { id_auth0: true, rol_usuario: true, estado_usuario: true, correo_usuario: true } } } });
  }
}

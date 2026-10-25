import { randomUUID } from 'node:crypto';
import getPrismaClient from '../../../database/prisma.js';
import { isActiveUserStatus } from '../../../config/userLifecycle.js';
import { ROLES } from '../../../../../shared/keycloakAuthorization.js';

// New-provider persistence is independent of the legacy Auth0 repository.
export class KeycloakIdentityRepository {
  constructor({ prisma } = {}) { this.prisma = prisma; }
  get client() { return this.prisma ?? getPrismaClient(); }
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

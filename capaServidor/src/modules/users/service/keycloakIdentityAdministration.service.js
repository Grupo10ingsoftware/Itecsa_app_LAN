import { generarContrasena } from './generarContrasena.js';
import { createHash } from 'node:crypto';
import { can, PERMISSIONS, ASSIGNABLE_ROLES } from '../../../../../shared/keycloakAuthorization.js';
import { isActiveUserStatus } from '../../../config/userLifecycle.js';
import { KeycloakIdentityRepository } from '../repo/keycloakIdentity.repo.js';
import { KeycloakManagementService, KeycloakServiceError } from './keycloakManagement.service.js';
import pinService from '../../auth/service/pin.service.js';

export class IdentityAdministrationError extends Error {
  constructor(code, status = 409) {
    super('La preparacion de identidad requiere revision.');
    this.name = 'IdentityAdministrationError';
    Object.assign(this, { code, status });
  }
}
const reject = (code, status) => { throw new IdentityAdministrationError(code, status); };
function normalizeUpdate(input) {
  const fields = ['firstName', 'lastName', 'email', 'role', 'state'];
  if (!input || Object.keys(input).some(key => !fields.includes(key))
    || fields.some(key => typeof input[key] !== 'string' || !input[key].trim())) reject('IDENTITY_INPUT_INVALID', 400);
  const value = Object.fromEntries(fields.map(key => [key, input[key].trim()]));
  if ([value.firstName, value.lastName].some(name => name.length > 100 || !/^[\p{L} ]+$/u.test(name))
    || value.email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) reject('IDENTITY_INPUT_INVALID', 400);
  if (!ASSIGNABLE_ROLES.includes(value.role)) reject('IDENTITY_ROLE_FORBIDDEN', 403);
  if (!['Activo', 'Desvinculado', 'Pendiente', 'Pendiente rol'].includes(value.state)) reject('IDENTITY_INPUT_INVALID', 400);
  return { ...value, email: value.email.toLowerCase() };
}
const localUpdate = input => ({ nombre_usuario: input.firstName, apellido_usuario: input.lastName,
  correo_usuario: input.email, rol_usuario: input.role, estado_usuario: input.state });
function normalize(input) {
  if (!input || Object.keys(input).some(key => !['username', 'email', 'firstName', 'lastName', 'role', 'rut'].includes(key))) reject('IDENTITY_INPUT_INVALID', 400);
  if (!ASSIGNABLE_ROLES.includes(input.role)) reject('IDENTITY_ROLE_FORBIDDEN', 403);
  const text = (value, max) => typeof value === 'string' && value.trim() && value.length <= max && !/[\u0000-\u001f]/u.test(value);
  if (!text(input.username, 255) || input.username !== input.username.trim().toLowerCase()
    || !text(input.firstName, 100) || !text(input.lastName, 100)) reject('IDENTITY_INPUT_INVALID', 400);
  if (!text(input.email, 255) || !text(input.rut, 12)) reject('IDENTITY_INPUT_INVALID', 400);
  const email = input.email.trim().toLowerCase();
  const rut = input.rut.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || !/^(\d{1,2}\.?\d{3}\.?\d{3}-[\dkK])$/.test(rut)) reject('IDENTITY_INPUT_INVALID', 400);
  return { username: input.username, email, rut: rut.replaceAll('.', '').toUpperCase(),
    firstName: input.firstName.trim(), lastName: input.lastName.trim(), role: input.role };
}
const result = operation => ({
  operationId: operation.id, outcome: operation.state === 'created' ? 'user_created'
    : operation.state === 'prepared' ? 'identity_prepared' : operation.state,
  externalSubject: operation.external_subject, localUserId: operation.local_user_id,
  recoverable: ['needs_reconciliation', 'running', 'pending'].includes(operation.state),
  credentialsConfigured: operation.state === 'created', fullyProvisioned: operation.state === 'created',
});
const matchesPreparation = (external, operation) => !external.enabled && external.username === operation.username
  && external.attributes?.itecsa_provision_id?.length === 1 && external.attributes.itecsa_provision_id[0] === operation.id
  && (external.email ?? null) === operation.input.email
  && external.firstName === operation.input.firstName && external.lastName === operation.input.lastName;

export class KeycloakIdentityAdministrationService {
  constructor({ management, repository = new KeycloakIdentityRepository(), pins = pinService } = {}) {
    this.management = management ?? new KeycloakManagementService();
    this.repository = repository;
    this.pins = pins;
  }
  async authorize(context, { mutation = false, revalidate = false } = {}) {
    if (context?.provider !== 'keycloak' || typeof context.subject !== 'string' || !context.subject || context.subject.length > 128
      || !can(context.role, context.permissions, PERMISSIONS.MANAGE_USERS)) reject('IDENTITY_ADMIN_FORBIDDEN', 403);
    // Reuse middleware identity only for immediate reads. Mutations and checks
    // after remote work still consult current authorization, including around PIN.
    let actor;
    if (!mutation && !revalidate && context.currentUser !== undefined) {
      const current = context.currentUser;
      if (current?.identitySubject !== context.subject || !Number.isSafeInteger(current?.idUsuario)
        || current.idUsuario <= 0) reject('IDENTITY_ADMIN_FORBIDDEN', 403);
      actor = { id_usuario: current.idUsuario, rol_usuario: current.rolUsuario, estado_usuario: current.estadoUsuario };
    } else actor = await this.repository.actor(context.subject);
    if (!actor || !isActiveUserStatus(actor.estado_usuario) || actor.rol_usuario !== context.role) reject('IDENTITY_ADMIN_FORBIDDEN', 403);
    if (mutation) {
      const pinActor = await this.pins.validate(context.subject, context.pin);
      if (pinActor.idUsuario !== actor.id_usuario) reject('IDENTITY_ADMIN_FORBIDDEN', 403);
      // Recheck local revocation after PIN validation.
      const current = await this.repository.actor(context.subject);
      if (current?.id_usuario !== actor.id_usuario || current?.rol_usuario !== context.role
        || !isActiveUserStatus(current?.estado_usuario)) reject('IDENTITY_ADMIN_FORBIDDEN', 403);
    }
    return actor.id_usuario;
  }
  async inspect(context, subject, { revalidateActor = false } = {}) {
    await this.authorize(context, { revalidate: revalidateActor });
    if (subject === context.subject) reject('IDENTITY_SELF_TARGET_FORBIDDEN', 403);
    const binding = await this.repository.binding(this.management.config.issuer, subject);
    if (!binding || !ASSIGNABLE_ROLES.includes(binding.Usuario.rol_usuario)) reject('IDENTITY_TARGET_FORBIDDEN', 403);
    if (binding.Usuario.estado_usuario?.startsWith('Actualizando:')) reject('IDENTITY_UPDATE_BUSY');
    const [external, roles] = await Promise.all([this.management.getUser(subject), this.management.roles(subject)]);
    if (binding.subject !== subject || binding.Usuario.id_usuario !== binding.user_id || binding.username !== external.username || roles.length !== 1
      || roles[0].name !== binding.Usuario.rol_usuario) reject('IDENTITY_BINDING_CONFLICT');
    return { localUserId: binding.user_id, subject, username: external.username, email: binding.Usuario.correo_usuario,
      firstName: binding.Usuario.nombre_usuario, lastName: binding.Usuario.apellido_usuario,
      externalEmail: external.email ?? null, issuer: binding.issuer, role: binding.Usuario.rol_usuario,
      localState: binding.Usuario.estado_usuario, enabled: external.enabled };
  }
  async list(context, filters) {
    await this.authorize(context);
    if (filters.rolUsuario && !ASSIGNABLE_ROLES.includes(filters.rolUsuario)) reject('IDENTITY_TARGET_FORBIDDEN', 403);
    return this.repository.list(this.management.config.issuer, filters);
  }
  async update(context, subject, rawInput) {
    const actorId = await this.authorize(context, { mutation: true });
    if (subject === context.subject) reject('IDENTITY_SELF_TARGET_FORBIDDEN', 403);
    const input = normalizeUpdate(rawInput);
    let binding;
    try { binding = await this.repository.beginUpdate(this.management.config.issuer, subject, actorId, context.role); }
    catch (error) {
      if (error.code === 'IDENTITY_TARGET_FORBIDDEN' || error.code === 'IDENTITY_ACTOR_CHANGED') reject(error.code, 403);
      if (['IDENTITY_UPDATE_BUSY', 'IDENTITY_PROVISION_INCOMPLETE'].includes(error.code)) reject(error.code, 409);
      reject('IDENTITY_STORAGE_UNAVAILABLE', 503);
    }
    const original = { role: binding.Usuario.rol_usuario, localState: binding.Usuario.estado_usuario };
    let external, remoteStarted = false, finishAttempted = false;
    try {
      if (input.state.startsWith('Pendiente') && input.state !== original.localState) reject('IDENTITY_INPUT_INVALID', 400);
      let roles;
      [external, roles] = await Promise.all([this.management.getUser(subject), this.management.roles(subject)]);
      if (external.username !== binding.username || roles.length !== 1 || roles[0].name !== original.role) reject('IDENTITY_BINDING_CONFLICT');
      const enabled = input.state === 'Activo' || (input.state.startsWith('Pendiente') && external.enabled);
      remoteStarted = true;
      await this.management.setEnabled(subject, false);
      await this.management.logout(subject);
      const attributes = Object.fromEntries(['firstName', 'lastName', 'email']
        .filter(key => input[key] !== external[key]).map(key => [key, input[key]]));
      if (Object.keys(attributes).length) await this.management.updateAttributes(subject, attributes);
      if (input.role !== original.role) await this.management.replaceRole(subject, input.role);
      const verified = await this.management.getUser(subject);
      if (verified.firstName !== input.firstName || verified.lastName !== input.lastName || verified.email !== input.email) {
        reject('IDENTITY_UPDATE_NOT_CONFIRMED');
      }
      if (await this.authorize(context, { revalidate: true }) !== actorId) reject('IDENTITY_ADMIN_FORBIDDEN', 403);
      // The disabled state was already written before logout. Keep the final
      // readback even when there is no activation to perform.
      if (enabled || verified.enabled !== false) await this.management.setEnabled(subject, enabled);
      if ((await this.management.getUser(subject)).enabled !== enabled) reject('IDENTITY_UPDATE_NOT_CONFIRMED');
      finishAttempted = true;
      await this.repository.finishUpdate(binding, localUpdate(input), actorId);
      return { outcome: 'user_updated', subject };
    } catch (error) {
      let current;
      try { current = await this.repository.binding(this.management.config.issuer, subject); }
      catch { reject('IDENTITY_UPDATE_REQUIRES_REVIEW', 503); }
      if (finishAttempted && current && Object.entries(localUpdate(input)).every(([key, value]) => current.Usuario[key] === value)) {
        return { outcome: 'user_updated', subject };
      }
      if (current?.Usuario.estado_usuario === binding.updateState) {
        await this.restoreUpdate(binding, remoteStarted ? external : null, original, actorId);
      }
      if (error instanceof KeycloakServiceError || error instanceof IdentityAdministrationError) throw error;
      reject('IDENTITY_STORAGE_UNAVAILABLE', 503);
    }
  }
  async restoreUpdate(binding, external, original, actorId) {
    const subject = binding.subject;
    const previous = binding.Usuario;
    try {
      if (external) {
        await this.management.setEnabled(subject, false);
        const current = await this.management.getUser(subject);
        await this.management.updateAttributes(subject, { firstName: external.firstName, lastName: external.lastName,
          ...(current.email !== external.email ? { email: external.email ?? null } : {}) });
        await this.management.replaceRole(subject, original.role);
        await this.management.setEnabled(subject, external.enabled);
      }
      await this.repository.finishUpdate(binding, { nombre_usuario: previous.nombre_usuario, apellido_usuario: previous.apellido_usuario,
        correo_usuario: previous.correo_usuario, rol_usuario: previous.rol_usuario, estado_usuario: previous.estado_usuario }, actorId, 'reverted');
    } catch {
      try { await this.management.setEnabled(subject, false); } catch { /* Local access remains blocked. */ }
      reject('IDENTITY_UPDATE_REQUIRES_REVIEW', 503);
    }
  }
  async summary(context) {
    await this.authorize(context);
    return this.repository.summary(this.management.config.issuer);
  }
  async movements(context, subject, filters) {
    const target = await this.inspect(context, subject);
    return this.repository.movements(target.localUserId, filters);
  }
  async findByUsername(context, username) {
    await this.authorize(context);
    const user = await this.management.findByUsername(username);
    return user ? this.inspect(context, user.id, { revalidateActor: true }) : null;
  }
  async prepare(context, rawInput) {
    const actorId = await this.authorize(context, { mutation: true });
    const input = normalize(rawInput);
    const digest = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    let operation;
    try { operation = await this.repository.claim({ issuer: this.management.config.issuer, input, digest, actorId }); }
    catch { throw new IdentityAdministrationError('IDENTITY_JOURNAL_UNAVAILABLE', 503); }
    if (operation.payload_digest !== digest) reject('IDENTITY_OPERATION_PAYLOAD_CONFLICT');
    if (operation.state === 'created') return result(operation);
    if (operation.state === 'prepared') {
      const user = await this.inspect(context, operation.external_subject, { revalidateActor: true });
      if (user.enabled || user.localState !== 'Pendiente'
        || !matchesPreparation(await this.management.getUser(operation.external_subject), operation)) reject('IDENTITY_PREPARATION_CHANGED');
      return result(operation);
    }
    if (operation.state !== 'pending') return result(operation);
    const acquired = await this.repository.acquire(operation, false);
    return acquired ? this.execute(context, acquired, actorId, false) : result(await this.repository.operation(operation.id));
  }
  async reconcile(context, operationId) {
    const actorId = await this.authorize(context, { mutation: true });
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(operationId ?? '')) reject('IDENTITY_INPUT_INVALID', 400);
    const operation = await this.repository.operation(operationId);
    if (!operation || operation.issuer !== this.management.config.issuer) reject('IDENTITY_OPERATION_NOT_FOUND', 404);
    // No automatic stealing of running operations or retries of ambiguous POST.
    if (operation.state !== 'needs_reconciliation') reject('IDENTITY_OPERATION_NOT_RECONCILABLE');
    const acquired = await this.repository.acquire(operation, true);
    return acquired ? this.execute(context, acquired, actorId, true) : reject('IDENTITY_OPERATION_BUSY');
  }
  async execute(context, operation, actorId, reconcile) {
    let ownedSubject;
    try {
      let checkpointed = false;
      let external = await this.management.findByUsername(operation.username);
      if (external && (!reconcile || external.attributes?.itecsa_provision_id?.[0] !== operation.id)) {
        reject('IDENTITY_USERNAME_EXISTS');
      }
      if (!external) {
        if (reconcile) reject('IDENTITY_EXTERNAL_OUTCOME_UNKNOWN');
        const subject = await this.management.createDisabled({ ...operation.input, operationId: operation.id });
        await this.repository.checkpoint(operation, subject);
        checkpointed = true;
        external = await this.management.getUser(subject);
      }
      if (external?.attributes?.itecsa_provision_id?.[0] === operation.id) {
        ownedSubject = external.id;
        if (reconcile && external.enabled) {
          await this.management.setEnabled(ownedSubject, false);
          external = await this.management.getUser(ownedSubject);
        }
      }
      if (!matchesPreparation(external, operation)
        || (operation.external_subject && operation.external_subject !== external.id)) reject('IDENTITY_EXTERNAL_OUTCOME_UNKNOWN');
      if (!checkpointed) await this.repository.checkpoint(operation, external.id);
      await this.management.replaceRole(external.id, operation.input.role);
      const verified = await this.management.getUser(external.id);
      if (!matchesPreparation(verified, operation)) reject('IDENTITY_EXTERNAL_OUTCOME_UNKNOWN');
      if (await this.authorize(context, { revalidate: true }) !== actorId) reject('IDENTITY_ADMIN_FORBIDDEN', 403);
      let temporaryPassword;
      if (!reconcile) {
        temporaryPassword = generarContrasena();
        await this.management.setTemporaryPassword(external.id, temporaryPassword);
      }
      if (!await this.management.hasTemporaryPassword(external.id)) reject('IDENTITY_CREDENTIAL_NOT_CONFIRMED');
      const stored = await this.repository.complete(operation, external.id, actorId, context.subject, context.role);
      await this.management.setEnabled(external.id, true);
      if (!(await this.management.getUser(external.id)).enabled) reject('IDENTITY_ACTIVATION_NOT_CONFIRMED');
      let completed;
      try { completed = await this.repository.finish(stored); }
      catch (error) {
        // A transport failure can follow a successful commit. Confirm this exact
        // revision and binding before compensating or returning a credential.
        const confirmed = await this.repository.operation(stored.id);
        if (confirmed?.id !== stored.id || confirmed.issuer !== stored.issuer || confirmed.state !== 'created' || confirmed.revision !== stored.revision
          || confirmed.external_subject !== stored.external_subject || confirmed.local_user_id !== stored.local_user_id) throw error;
        completed = confirmed;
      }
      return { ...result(completed), ...(temporaryPassword ? { temporaryPassword, mustChangePassword: true } : {}) };
    } catch (error) {
      let disableFailed = false;
      if (ownedSubject) {
        try { await this.management.setEnabled(ownedSubject, false); }
        catch { disableFailed = true; }
      }
      const code = disableFailed ? 'IDENTITY_DISABLE_UNCONFIRMED' : error instanceof IdentityAdministrationError || error instanceof KeycloakServiceError ? error.code
        : error?.code === 'IDENTITY_ACTOR_CHANGED' ? 'IDENTITY_ADMIN_FORBIDDEN' : 'IDENTITY_STORAGE_UNAVAILABLE';
      try { await this.repository.fail(operation, code, { terminal: code === 'IDENTITY_USERNAME_EXISTS', actorId }); }
      catch { throw new IdentityAdministrationError('IDENTITY_JOURNAL_UNAVAILABLE', 503); }
      return result(await this.repository.operation(operation.id));
    }
  }
}

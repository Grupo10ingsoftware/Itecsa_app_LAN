import { Router } from 'express';
import checkJwt from '../../../middlewares/checkJwt.js';
import requireAdministrativeRole from '../../../middlewares/requireAdministrativeRole.js';
import { respondError } from '../../../errors/httpErrors.js';
import { roleFromPayload } from '../../../../../shared/keycloakAuthorization.js';
import { IdentityAdministrationError } from '../service/keycloakIdentityAdministration.service.js';
import { KeycloakServiceError } from '../service/keycloakManagement.service.js';
import { validateListUsersQuery, validateUserMovementsQuery } from '../validators/adminUsers.validator.js';

// Mounted by the normal server when IDENTITY_PREPARATION_ENABLED=true.
export function createKeycloakIdentityPreparationRouter({ authenticate = checkJwt, service } = {}) {
  if (!service) throw Error('El servicio administrativo es obligatorio.');
  const router = Router();
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use(authenticate, requireAdministrativeRole);
  const context = req => ({ provider: req.identityProvider, subject: req.auth?.payload?.sub,
    role: roleFromPayload(req.auth?.payload), permissions: req.auth?.payload?.permissions, pin: req.body?.pin });
  const run = action => async (req, res) => {
    try { await action(req, res); }
    catch (error) {
      if (error instanceof IdentityAdministrationError || error instanceof KeycloakServiceError) {
        const messages = {
          IDENTITY_UPDATE_BUSY: 'Otro cambio de este usuario esta en curso. Actualiza e intenta nuevamente.',
          IDENTITY_UPDATE_REQUIRES_REVIEW: 'La actualizacion quedo incompleta y el acceso permanece bloqueado. Requiere revision administrativa.',
          IDENTITY_INPUT_INVALID: 'Revisa el nombre, apellido, correo, rol y estado ingresados.',
        };
        return res.status(error.status).json({ code: error.code, message: messages[error.code] ?? 'La operacion administrativa no pudo completarse.' });
      }
      return respondError(error, req, res);
    }
  };
  router.get('/users', run(async (req, res) => {
    const query = validateListUsersQuery(req.query);
    if (!query.valid) return res.status(400).json({ message: query.message });
    return res.json(await service.list(context(req), query.filters));
  }));
  router.get('/users/summary', run(async (req, res) => res.json(await service.summary(context(req)))));
  router.get('/users/:subject/movements', run(async (req, res) => {
    const query = validateUserMovementsQuery(req.query);
    if (!query.valid) return res.status(400).json({ message: query.message });
    return res.json(await service.movements(context(req), req.params.subject, query.filters));
  }));
  router.get('/identities/by-username/:username', run(async (req, res) => {
    const user = await service.findByUsername(context(req), req.params.username);
    return res.status(user ? 200 : 404).json(user ?? { code: 'IDENTITY_NOT_FOUND' });
  }));
  router.get('/identities/:subject', run(async (req, res) => res.json(await service.inspect(context(req), req.params.subject))));
  router.patch('/identities/:subject', run(async (req, res) => {
    if (!req.body || Object.keys(req.body).some(key => !['identity', 'pin'].includes(key))) {
      throw new IdentityAdministrationError('IDENTITY_INPUT_INVALID', 400);
    }
    return res.json(await service.update(context(req), req.params.subject, req.body.identity));
  }));
  router.post('/identities/prepare', run(async (req, res) => {
    if (!req.body || Object.keys(req.body).some(key => !['identity', 'pin'].includes(key))) {
      throw new IdentityAdministrationError('IDENTITY_INPUT_INVALID', 400);
    }
    const result = await service.prepare(context(req), req.body.identity);
    const status = result.outcome === 'user_created' ? 201 : result.outcome === 'failed' ? 409 : 202;
    return res.status(status).json(result);
  }));
  router.post('/operations/:id/reconcile', run(async (req, res) => {
    if (!req.body || Object.keys(req.body).some(key => key !== 'pin')) throw new IdentityAdministrationError('IDENTITY_INPUT_INVALID', 400);
    return res.status(202).json(await service.reconcile(context(req), req.params.id));
  }));
  return router;
}

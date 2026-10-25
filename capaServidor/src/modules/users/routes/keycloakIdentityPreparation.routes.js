import { Router } from 'express';
import checkJwt from '../../../middlewares/checkJwt.js';
import requireAdministrativeRole from '../../../middlewares/requireAdministrativeRole.js';
import { respondError } from '../../../errors/httpErrors.js';
import { roleFromPayload } from '../../../../../shared/keycloakAuthorization.js';
import { IdentityAdministrationError } from '../service/keycloakIdentityAdministration.service.js';
import { KeycloakServiceError } from '../service/keycloakManagement.service.js';

// Deliberately NOT mounted by the application in phase 06. The lab exercises this
// factory with real JWT middleware; phase 07 must review its final account workflow.
export function createKeycloakIdentityPreparationRouter({ authenticate = checkJwt, service } = {}) {
  if (!service) throw Error('El servicio administrativo es obligatorio.');
  const router = Router();
  router.use(authenticate, requireAdministrativeRole);
  const context = req => ({ provider: req.identityProvider, subject: req.auth?.payload?.sub,
    role: roleFromPayload(req.auth?.payload), permissions: req.auth?.payload?.permissions, pin: req.body?.pin });
  const run = action => async (req, res) => {
    try { await action(req, res); }
    catch (error) {
      if (error instanceof IdentityAdministrationError || error instanceof KeycloakServiceError) {
        return res.status(error.status).json({ code: error.code, message: 'La operacion administrativa no pudo completarse.' });
      }
      return respondError(error, req, res);
    }
  };
  router.get('/identities/by-username/:username', run(async (req, res) => {
    const user = await service.findByUsername(context(req), req.params.username);
    return res.status(user ? 200 : 404).json(user ?? { code: 'IDENTITY_NOT_FOUND' });
  }));
  router.get('/identities/:subject', run(async (req, res) => res.json(await service.inspect(context(req), req.params.subject))));
  router.post('/identities/prepare', run(async (req, res) => {
    if (!req.body || Object.keys(req.body).some(key => !['identity', 'pin'].includes(key))) {
      throw new IdentityAdministrationError('IDENTITY_INPUT_INVALID', 400);
    }
    const result = await service.prepare(context(req), req.body.identity);
    return res.status(result.outcome === 'failed' ? 409 : 202).json(result);
  }));
  router.post('/operations/:id/reconcile', run(async (req, res) => {
    if (!req.body || Object.keys(req.body).some(key => key !== 'pin')) throw new IdentityAdministrationError('IDENTITY_INPUT_INVALID', 400);
    return res.status(202).json(await service.reconcile(context(req), req.params.id));
  }));
  return router;
}

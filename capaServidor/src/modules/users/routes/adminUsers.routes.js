import { Router } from 'express';
import checkJwt from '../../../middlewares/checkJwt.js';
import requireAdministrativeRole from '../../../middlewares/requireAdministrativeRole.js';

// Reserved contracts remain closed until their Keycloak workflows are complete.
export function createAdminUsersRouter({ authenticate = checkJwt, authorize = requireAdministrativeRole } = {}) {
  const router = Router();
  router.use('/users', authenticate, authorize, (_req, res) => res.status(503).json({
    code: 'IDENTITY_OPERATION_NOT_IMPLEMENTED',
    message: 'Utiliza la administracion de identidad habilitada; esta operacion aun no esta disponible.',
  }));
  return router;
}
export default createAdminUsersRouter();

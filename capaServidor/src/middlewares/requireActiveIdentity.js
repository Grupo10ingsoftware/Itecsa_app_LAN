import users from '../modules/users/repo/users.repo.js';
import { KeycloakManagementService } from '../modules/users/service/keycloakManagement.service.js';
import { authorizationForProvider } from '../../../shared/identityAuthorization.js';
import { isActiveUserStatus, USER_STATUS } from '../config/userLifecycle.js';

const ACCESS_DENIED = 'Usuario desvinculado o rol desactualizado. Renueva tu sesion.';

export function createRequireActiveIdentity({ repository = users,
  readKeycloakRoles = subject => new KeycloakManagementService().roles(subject) } = {}) {
  return async (req, res, next) => {
    const payload = req.auth?.payload;
    if (!payload?.sub) return res.status(401).json({ message: 'Sesion no valida.' });
    const role = authorizationForProvider(req.identityProvider)?.roleFromPayload(payload);
    if (req.identityProvider !== 'keycloak' || !role || !Array.isArray(payload.permissions) ||
        payload.permissions.some(permission => typeof permission !== 'string')) {
      return res.status(403).json({ message: 'La sesion no tiene un rol o permisos validos.' });
    }
    try {
      let user = await repository.findBySubject(payload.sub);
      if (!user || user.identitySubject !== payload.sub ||
          (!isActiveUserStatus(user.estadoUsuario) && user.estadoUsuario !== USER_STATUS.PENDING_FIRST_LOGIN)) {
        return res.status(403).json({ message: ACCESS_DENIED });
      }
      if (user.rolUsuario !== role) {
        // A signed access token can predate a later role change. Confirm the
        // current Keycloak mapping before copying it to the local binding.
        const roles = await readKeycloakRoles(payload.sub);
        if (!Array.isArray(roles) || roles.length !== 1 || roles[0]?.name !== role) return res.status(403).json({ message: ACCESS_DENIED });
        await repository.reconcileRole(payload.sub, user, role);
        user = await repository.findBySubject(payload.sub);
      }
      if (user.estadoUsuario === USER_STATUS.PENDING_FIRST_LOGIN) {
        if (user.rolUsuario !== role) return res.status(403).json({ message: ACCESS_DENIED });
        user = await repository.activateOnFirstAccess(payload.sub, role);
      }
      if (!user || user.identitySubject !== payload.sub || !isActiveUserStatus(user.estadoUsuario) || user.rolUsuario !== role) {
        return res.status(403).json({ message: ACCESS_DENIED });
      }
      req.currentUser = user;
      return next();
    } catch {
      return res.status(503).json({ code: 'INTERNAL_ERROR', message: 'No fue posible verificar el acceso.', requestId: req.requestId });
    }
  };
}
export default createRequireActiveIdentity();

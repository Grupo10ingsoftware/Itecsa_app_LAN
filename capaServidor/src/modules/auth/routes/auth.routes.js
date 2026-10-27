import requireCapability, { PERMISSIONS as P } from '../../../middlewares/requireCapability.js';
import { Router } from 'express';
import checkJwt from '../../../middlewares/checkJwt.js';
import pinService from '../service/pin.service.js';
import pinRecoveryService from '../service/pinRecovery.service.js';
import pinRecoveryNavigation from '../service/pinRecoveryNavigation.service.js';
import { createPinRecoveryRateLimit, createThrottleMiddleware } from '../../../middlewares/rateLimit.js';
import {
  createGetProfileHandler, createGetProfileMovementsHandler, createAcknowledgePinHandler,
  createPinRecoveryHandler, createResumePinSessionHandler,
  createRevealPinHandler, createVerifyAuthSessionHandler,
} from '../controller/auth.controller.js';

export function createAuthRouter({
  authenticate = checkJwt,
  pinRecoveryRateLimit = createPinRecoveryRateLimit(),
  users, logger, pins = pinService, recovery = pinRecoveryService, navigation = pinRecoveryNavigation,
} = {}) {
  const router = Router();
  router.post('/pin/recovery/resume', createThrottleMiddleware({ rules: req => [{
    scope: 'pin-recovery-resume-ip', subject: req.ip, limit: 20, windowMs: 15 * 60_000,
  }] }), createResumePinSessionHandler({ navigation }));
  router.get('/profile', authenticate, requireCapability(P.READ_PROFILE), createGetProfileHandler({ users }));
  router.get('/profile/movements', authenticate, requireCapability(P.READ_PROFILE), createGetProfileMovementsHandler({ users }));
  router.get('/verify', authenticate, requireCapability(P.READ_PROFILE), createVerifyAuthSessionHandler({ pins, logger }));
  router.post('/pin/reveal', authenticate, requireCapability(P.MANAGE_PIN), createRevealPinHandler({ pins }));
  router.post('/pin/acknowledge', authenticate, requireCapability(P.MANAGE_PIN), createAcknowledgePinHandler({ pins }));
  for (const action of ['start', 'finish', 'cancel']) {
    router.post('/pin/recovery/' + action, authenticate, requireCapability(P.MANAGE_PIN),
      ...(action === 'cancel' ? [] : [pinRecoveryRateLimit]), createPinRecoveryHandler({ pins, recovery, navigation, action }));
  }
  router.post('/password-reset/request', (_req, res) => res.status(503).json({
    code: 'IDENTITY_OPERATION_NOT_IMPLEMENTED', message: 'La recuperacion supervisada de credenciales aun no esta habilitada.',
  }));
  return router;
}
export default createAuthRouter();

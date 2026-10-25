import requireCapability, { PERMISSIONS as P } from '../../../middlewares/requireCapability.js';
import { Router } from 'express';
import checkJwt from '../../../middlewares/checkJwt.js';
import pinService from '../service/pin.service.js';
import { createPinRecoveryRateLimit } from '../../../middlewares/rateLimit.js';
import {
  createGetProfileHandler, createGetProfileMovementsHandler, createAcknowledgePinHandler,
  createConfirmPinRecoveryHandler, createRequestPinRecoveryHandler,
  createRevealPinHandler, createVerifyAuthSessionHandler,
} from '../controller/auth.controller.js';

export function createAuthRouter({
  authenticate = checkJwt,
  pinRecoveryRequestRateLimit = createPinRecoveryRateLimit({ event: 'request' }),
  pinRecoveryConfirmRateLimit = createPinRecoveryRateLimit({ event: 'confirm' }),
  users, logger, pins = pinService,
} = {}) {
  const router = Router();
  router.get('/profile', authenticate, requireCapability(P.READ_PROFILE), createGetProfileHandler({ users }));
  router.get('/profile/movements', authenticate, requireCapability(P.READ_PROFILE), createGetProfileMovementsHandler({ users }));
  router.get('/verify', authenticate, requireCapability(P.READ_PROFILE), createVerifyAuthSessionHandler({ pins, logger }));
  router.post('/pin/reveal', authenticate, requireCapability(P.MANAGE_PIN), createRevealPinHandler({ pins }));
  router.post('/pin/acknowledge', authenticate, requireCapability(P.MANAGE_PIN), createAcknowledgePinHandler({ pins }));
  router.post('/pin-recovery/request', authenticate, requireCapability(P.MANAGE_PIN),
    pinRecoveryRequestRateLimit, createRequestPinRecoveryHandler({ pins }));
  router.post('/pin-recovery/confirm', authenticate, requireCapability(P.MANAGE_PIN),
    pinRecoveryConfirmRateLimit, createConfirmPinRecoveryHandler({ pins }));
  router.post('/password-reset/request', (_req, res) => res.status(503).json({
    code: 'IDENTITY_OPERATION_NOT_IMPLEMENTED', message: 'La recuperacion supervisada de credenciales aun no esta habilitada.',
  }));
  return router;
}
export default createAuthRouter();

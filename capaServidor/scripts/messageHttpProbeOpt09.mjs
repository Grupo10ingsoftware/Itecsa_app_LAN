import assert from 'node:assert/strict';
import express from 'express';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import MessageService from '../src/modules/messages/service/message.service.js';
import MessageController from '../src/modules/messages/controller/message.controller.js';
import { createMessageRouter } from '../src/modules/messages/routes/message.routes.js';
import { UserRepository } from '../src/modules/users/repo/users.repo.js';
import { createCheckJwt } from '../src/middlewares/checkJwt.js';
import { createRequireActiveIdentity } from '../src/middlewares/requireActiveIdentity.js';
import { createThrottleMiddleware } from '../src/middlewares/rateLimit.js';
import { MemoryThrottleService } from '../src/modules/security/service/securityThrottle.service.js';
import { PERMISSIONS as P, ROLE_PERMISSIONS } from '../../shared/authorization.js';
import { requestContext, respondError } from '../src/errors/httpErrors.js';
import { ACTIVE_USER_STATUSES } from '../src/config/userLifecycle.js';

export async function measureMessageHttp({ db, beforeRepo, repo, output, sample, baseline }) {
  const { default: BeforeService } = await baseline('src/modules/messages/service/message.service.js');
  const { default: BeforeController } = await baseline('src/modules/messages/controller/message.controller.js');
  const { createMessageRouter: beforeRouter } = await baseline('src/modules/messages/routes/message.routes.js');
  const roles = Object.entries(ROLE_PERMISSIONS).filter(([,p])=>p.includes(P.READ_MESSAGES)).map(([role])=>role);
  const binding = await db.externalIdentity.findFirst({ where: { provider:'keycloak', issuer:process.env.KEYCLOAK_ISSUER,
    Usuario:{is:{estado_usuario:{in:[...ACTIVE_USER_STATUSES]},rol_usuario:{in:roles}}} }, select:{subject:true} });
  if(!binding) throw Object.assign(Error(),{code:'NO_ACTIVE_READ_IDENTITY'});
  const identity = new UserRepository({prisma:db}), actor=await identity.findBySubject(binding.subject);
  const {privateKey,publicKey}=await generateKeyPair('RS256');
  const jwk={...await exportJWK(publicKey),kid:'opt09',alg:'RS256',use:'sig'};
  const app=express();app.locals.errorLogger={error(){}};app.use(requestContext);
  app.get('/certs',(_req,res)=>res.json({keys:[jwk]}));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  try {
    const origin=`http://127.0.0.1:${server.address().port}`;
    const environment={APP_ENV:'test',KEYCLOAK_ALLOW_HTTP:'true',KEYCLOAK_ISSUER:origin,KEYCLOAK_JWKS_URI:origin+'/certs',KEYCLOAK_AUDIENCE:'api',KEYCLOAK_CLIENT_ID:'web',KEYCLOAK_ROLE_CLIENT_ID:'roles'};
    const authenticate=createCheckJwt({environment,requireIdentity:createRequireActiveIdentity({repository:identity}),rateLimit:createThrottleMiddleware({throttle:new MemoryThrottleService(),rules:req=>[{scope:'opt09',subject:req.currentUser.idUsuario,limit:120,windowMs:60000}]})});
    app.use('/before',beforeRouter({authenticate,controller:new BeforeController({service:new BeforeService({repo:beforeRepo})})}));
    app.use('/after',createMessageRouter({authenticate,controller:new MessageController({service:new MessageService({repo})})}));
    app.use((error,req,res,_next)=>respondError(error,req,res));
    const token=await new SignJWT({sub:binding.subject,typ:'Bearer',azp:'web',resource_access:{roles:{roles:[actor.rolUsuario]}},permissions:[P.READ_MESSAGES]})
      .setProtectedHeader({alg:'RS256',kid:'opt09'}).setIssuer(origin).setAudience('api').setIssuedAt().setExpirationTime('15m').sign(privateKey);
    const read=async(version,path)=>{const response=await fetch(origin+'/'+version+path,{headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(30000)});
      if(response.status!==200){await response.body?.cancel();throw Object.assign(Error(),{code:'HTTP_'+response.status})}return response.json()};
    output.httpHarness={authority:'synthetic local RS256 JWT/JWKS',identity:'real active DB binding',includes:['real routes/controllers/DTO','identity and capabilities','strict MySQL TLS'],excludes:['real Keycloak session/login','browser/render','global support audit','SQL quota writes'],quota:'memory 120/minute'};
    for(const [name,path]of[['inbox','/?perPage=12'],['notifications','/notifications?limit=50']]){
      const expected=await read('before',path);assert.deepEqual(await read('after',path),expected);
      for(const version of ['before','after'])await sample('http_'+name+'_'+version,async()=>{const value=await read(version,path);assert.deepEqual(value,expected);return value});
    }
    const snapshot=await read('after','/notifications?limit=50&view=bell');
    await sample('http_compact_after',()=>read('after','/notifications?limit=50&view=bell'));
    await sample('http_unchanged_after',()=>read('after','/notifications?limit=50&view=bell&revision='+snapshot.revision));
  }finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
}

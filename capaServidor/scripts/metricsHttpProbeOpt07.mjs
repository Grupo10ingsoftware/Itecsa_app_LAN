import assert from 'node:assert/strict';
import express from 'express';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import MetricsController from '../src/modules/metrics/controller/metrics.controller.js';
import { createMetricsRouter } from '../src/modules/metrics/routes/metrics.routes.js';
import { UserRepository } from '../src/modules/users/repo/users.repo.js';
import { createCheckJwt } from '../src/middlewares/checkJwt.js';
import { createRequireActiveIdentity } from '../src/middlewares/requireActiveIdentity.js';
import { createThrottleMiddleware } from '../src/middlewares/rateLimit.js';
import { MemoryThrottleService } from '../src/modules/security/service/securityThrottle.service.js';
import { PERMISSIONS as P, ROLE_PERMISSIONS } from '../../shared/authorization.js';
import { requestContext, respondError } from '../src/errors/httpErrors.js';
import { ACTIVE_USER_STATUSES } from '../src/config/userLifecycle.js';

export async function measureMetricsHttp({db,before,after,range,output,measure}) {
 const roles=Object.entries(ROLE_PERMISSIONS).filter(([,p])=>p.includes(P.VIEW_METRICS)).map(([role])=>role);
 const binding=await db.externalIdentity.findFirst({where:{provider:'keycloak',issuer:process.env.KEYCLOAK_ISSUER,Usuario:{is:{estado_usuario:{in:[...ACTIVE_USER_STATUSES]},rol_usuario:{in:roles}}}},select:{subject:true}});
 if(!binding)throw Object.assign(Error(),{code:'NO_ACTIVE_METRICS_IDENTITY'});
 const identity=new UserRepository({prisma:db}),actor=await identity.findBySubject(binding.subject);
 const {privateKey,publicKey}=await generateKeyPair('RS256');const jwk={...await exportJWK(publicKey),kid:'opt07',alg:'RS256',use:'sig'};
 const app=express();app.locals.errorLogger={error(){}};app.use(requestContext);app.get('/certs',(_req,res)=>res.json({keys:[jwk]}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try {
  const origin=`http://127.0.0.1:${server.address().port}`;
  const environment={APP_ENV:'test',KEYCLOAK_ALLOW_HTTP:'true',KEYCLOAK_ISSUER:origin,KEYCLOAK_JWKS_URI:origin+'/certs',KEYCLOAK_AUDIENCE:'api',KEYCLOAK_CLIENT_ID:'web',KEYCLOAK_ROLE_CLIENT_ID:'roles'};
  const authenticate=createCheckJwt({environment,requireIdentity:createRequireActiveIdentity({repository:identity}),rateLimit:createThrottleMiddleware({throttle:new MemoryThrottleService(),rules:req=>[{scope:'opt07',subject:req.currentUser.idUsuario,limit:120,windowMs:60000}]})});
  for(const [version,service]of[['before',before],['after',after]])app.use('/'+version,createMetricsRouter({authenticate,controller:new MetricsController({service})}));
  app.use((error,req,res,_next)=>respondError(error,req,res));
  const token=await new SignJWT({sub:binding.subject,typ:'Bearer',azp:'web',resource_access:{roles:{roles:[actor.rolUsuario]}},permissions:[P.VIEW_METRICS]}).setProtectedHeader({alg:'RS256',kid:'opt07'}).setIssuer(origin).setAudience('api').setIssuedAt().setExpirationTime('15m').sign(privateKey);
  const read=async(version,path)=>{const r=await fetch(`${origin}/${version}/${path}?${new URLSearchParams(range)}`,{headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(30000)});if(r.status!==200){await r.body?.cancel();throw Object.assign(Error(),{code:'HTTP_'+r.status});}return r.json();};
  output.httpHarness={authority:'local synthetic RS256 JWT/JWKS',identity:'real active DB binding',includes:['real router/controller','identity and capabilities','strict TLS MySQL'],excludes:['real Keycloak session','browser/render','global support audit','SQL quota writes'],quota:'memory 120/minute'};
  for(const path of ['summary','production-performance']){
   const expected=await read('before',path);assert.deepEqual(await read('after',path),expected);
   for(const version of ['before','after'])await measure(`http_${path}_${version}`,async()=>{const result=await read(version,path);assert.deepEqual(result,expected);return result;});
  }
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
}

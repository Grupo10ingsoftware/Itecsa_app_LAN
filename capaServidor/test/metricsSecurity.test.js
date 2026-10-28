import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { createCheckJwt } from '../src/middlewares/checkJwt.js';
import { createRequireActiveIdentity } from '../src/middlewares/requireActiveIdentity.js';
import { createThrottleMiddleware } from '../src/middlewares/rateLimit.js';
import { MemoryThrottleService } from '../src/modules/security/service/securityThrottle.service.js';
import { createMetricsRouter } from '../src/modules/metrics/routes/metrics.routes.js';
import MetricsController from '../src/modules/metrics/controller/metrics.controller.js';
import MetricsService from '../src/modules/metrics/service/metrics.service.js';
import MetricsRepository from '../src/modules/metrics/repo/metrics.repo.js';
import { requestContext, respondError } from '../src/errors/httpErrors.js';
import { ROLE_PERMISSIONS, PERMISSIONS as P } from '../../shared/authorization.js';

test('both metrics routes enforce real JWT, fresh active identity, capabilities, quota and period validation',async t=>{
 const {privateKey,publicKey}=await generateKeyPair('RS256');
 const role=Object.entries(ROLE_PERMISSIONS).find(([,permissions])=>permissions.includes(P.VIEW_METRICS))[0];
 let active=true,lookups=0,queries=0;
 const repository={findBySubject:async subject=>{lookups++;return subject==='fixture'?{idUsuario:1,identitySubject:subject,rolUsuario:role,estadoUsuario:active?'Activo':'Desvinculado'}:null;}};
 const app=express();app.locals.errorLogger={error(){}};app.use(requestContext);
 app.get('/certs',(_req,res)=>res.json({keys:[{...exported,kid:'opt07',alg:'RS256',use:'sig'}]}));
 const exported=await exportJWK(publicKey);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));
 const origin=`http://127.0.0.1:${server.address().port}`;
 const environment={APP_ENV:'test',KEYCLOAK_ALLOW_HTTP:'true',KEYCLOAK_ISSUER:origin,KEYCLOAK_JWKS_URI:origin+'/certs',KEYCLOAK_AUDIENCE:'api',KEYCLOAK_CLIENT_ID:'web',KEYCLOAK_ROLE_CLIENT_ID:'roles'};
 const authenticate=createCheckJwt({environment,requireIdentity:createRequireActiveIdentity({repository}),rateLimit:createThrottleMiddleware({throttle:new MemoryThrottleService(),rules:()=>[{scope:'opt07-test',subject:'fixture',limit:20,windowMs:60000}]})});
 app.use('/metrics',createMetricsRouter({authenticate,controller:new MetricsController({service:new MetricsService({repo:new MetricsRepository({prisma:{$queryRaw:async()=>{queries++;return [];}}})})})}));
 app.use((error,req,res,_next)=>respondError(error,req,res));
 const token=async changes=>new SignJWT({sub:'fixture',typ:'Bearer',azp:'web',resource_access:{roles:{roles:[role]}},permissions:[P.VIEW_METRICS],...changes}).setProtectedHeader({alg:'RS256',kid:'opt07'}).setIssuer(origin).setAudience('api').setIssuedAt().setExpirationTime('5m').sign(privateKey);
 const get=(path,bearer,query='from=2024-09-01&to=2024-09-30')=>fetch(`${origin}/metrics/${path}?${query}`,{headers:bearer?{authorization:`Bearer ${bearer}`}:{}});
 for(const path of ['summary','production-performance']){
  const initial=queries;
  assert.equal((await get(path)).status,401);
  assert.equal((await get(path,'broken')).status,401);
  assert.equal((await get(path,await token({sub:'unknown'}))).status,403);
  assert.equal((await get(path,await token({permissions:[]}))).status,403);
  active=false;assert.equal((await get(path,await token({}))).status,403);active=true;
  assert.equal(queries,initial);
  assert.equal((await get(path,await token({}),'from=2024-02-30&to=2024-03-01')).status,400);
  assert.equal(queries,initial);
  const before=lookups;assert.equal((await get(path,await token({}))).status,200);assert.equal(lookups,before+1);
 }
 const bearer=await token({});let limited=false;
 for(let i=0;i<21;i++){const response=await get('production-performance',bearer);if(response.status===429){limited=true;break;}assert.equal(response.status,200);}
 assert.equal(limited,true);
});

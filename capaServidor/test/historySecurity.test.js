import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import {createCheckJwt} from '../src/middlewares/checkJwt.js';
import {createRequireActiveIdentity} from '../src/middlewares/requireActiveIdentity.js';
import {createThrottleMiddleware} from '../src/middlewares/rateLimit.js';
import {MemoryThrottleService} from '../src/modules/security/service/securityThrottle.service.js';
import {createOrderHistoryRouter} from '../src/modules/history/routes/orderHistory.routes.js';
import Controller from '../src/modules/history/controller/orderHistory.controller.js';
import Service from '../src/modules/history/service/orderHistory.service.js';
import Repository from '../src/modules/history/repo/orderHistory.repo.js';
import {requestContext,respondError} from '../src/errors/httpErrors.js';
import {ROLES,PERMISSIONS as P} from '../../shared/authorization.js';
import {header,children,eventRows} from './fixtures/opt05/historyFixture.js';

test('history routes preserve JWT, fresh identity, capability/financial matrix, SQL redaction flags and safe errors',async t=>{
 const {privateKey,publicKey}=await generateKeyPair('RS256'),key={...await exportJWK(publicKey),kid:'opt05',alg:'RS256',use:'sig'};
 let active=true,roleChanged=false,lookups=0,queries=0;const logs=[],flags=[];
 const identity={findBySubject:async sub=>{lookups++;return ['reader','finance'].includes(sub)?{idUsuario:sub==='finance'?1:2,identitySubject:sub,rolUsuario:roleChanged?ROLES.GERENCIA:sub==='finance'?ROLES.ADMIN_COBRANZAS:ROLES.PRODUCCION,estadoUsuario:active?'Activo':'Desvinculado'}:null;}};
 const client={$queryRaw:async q=>{queries++;return q.sql.includes('UNION ALL')?children:q.sql.includes('p.id_pedido=')?[header]:[];},$queryRawUnsafe:async(_sql,...args)=>{
  queries++;flags.push(args[0]);const row={...eventRows(1)[0]};
  if(!args[0])for(const field of ['id_usuario_visible','nombre_usuario_visible','apellido_usuario_visible','observacion_visible','payment_observation'])row[field]=null;
  return [row];
 }};
 const app=express();app.locals.errorLogger={error:entry=>logs.push(entry)};app.use(requestContext);app.get('/certs',(_req,res)=>res.json({keys:[key]}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));
 const origin=`http://127.0.0.1:${server.address().port}`,environment={APP_ENV:'test',KEYCLOAK_ALLOW_HTTP:'true',KEYCLOAK_ISSUER:origin,KEYCLOAK_JWKS_URI:origin+'/certs',KEYCLOAK_AUDIENCE:'api',KEYCLOAK_CLIENT_ID:'web',KEYCLOAK_ROLE_CLIENT_ID:'roles'};
 const authenticate=createCheckJwt({environment,requireIdentity:createRequireActiveIdentity({repository:identity}),rateLimit:createThrottleMiddleware({throttle:new MemoryThrottleService(),rules:()=>[{scope:'opt05-test',subject:'fixture',limit:100,windowMs:60000}]})});
 app.use('/history',createOrderHistoryRouter({authenticate,controller:new Controller({service:new Service({repo:new Repository({prisma:client})})})}));app.use((error,req,res,_next)=>respondError(error,req,res));
 const token=async(sub='reader',permissions=[P.READ_ORDERS],expired=false)=>new SignJWT({sub,typ:'Bearer',azp:'web',resource_access:{roles:{roles:[sub==='finance'?ROLES.ADMIN_COBRANZAS:ROLES.PRODUCCION]}},permissions}).setProtectedHeader({alg:'RS256',kid:'opt05'}).setIssuer(origin).setAudience('api').setIssuedAt().setExpirationTime(Math.floor(Date.now()/1000)+(expired?-3600:300)).sign(privateKey);
 const read=(path,bearer)=>fetch(`${origin}/history/${path}`,{headers:bearer?{authorization:`Bearer ${bearer}`}:{}});
 for(const path of ['orders','orders/1','orders/1/events?type=payment']){
  const initial=queries;
  assert.equal((await read(path)).status,401);assert.equal((await read(path,'invalid')).status,401);assert.equal((await read(path,await token('reader',[P.READ_ORDERS],true))).status,401);
  assert.equal((await read(path,await token('reader',[]))).status,403);assert.equal((await read(path,await token('unknown'))).status,403);
  active=false;assert.equal((await read(path,await token())).status,403);active=true;
  roleChanged=true;assert.equal((await read(path,await token())).status,403);roleChanged=false;
  assert.equal(queries,initial);const count=lookups;const response=await read(path,await token());assert.equal(response.status,200);assert.equal(lookups,count+1);assert.equal(response.headers.get('cache-control'),'no-store');await response.json();
 }
 for(const [sub,permissions,allowed]of [['reader',[P.READ_ORDERS,P.READ_PAYMENTS],false],['finance',[P.READ_ORDERS],false],['finance',[P.READ_ORDERS,P.READ_PAYMENTS],true]])for(const path of ['orders/1','orders/1/events']){
  const response=await read(path+'?type=payment&includePaymentDetails=true',await token(sub,permissions));assert.equal(response.status,200);const data=await response.json(),event=data.events[0];assert.equal(flags.at(-1),allowed?1:0);
  assert.equal(Object.hasOwn(event,'responsible'),allowed);assert.equal(Object.hasOwn(event,'description'),allowed);if(!allowed)assert(!JSON.stringify(data).includes('Privado OPT05'));
 }
 for(const path of ['orders?cursor=bad','orders?from=2024-02-30',"orders?from=2024-09-10&to=2024-09-01",'orders/1%20OR%201=1','orders/1/events?type=all%3BDROP','orders/1/events?cursor=bad','orders/1/events?limit=1000']){const count=queries;assert.equal((await read(path,await token())).status,400);assert.equal(queries,count);}
 const bearer=await token();let limited=false;for(let i=0;i<101;i++){const response=await read('orders',bearer);await response.body?.cancel();if(response.status===429){limited=true;break;}assert.equal(response.status,200);}assert(limited);
 assert(!JSON.stringify(logs).includes('Privado OPT05'));assert(!JSON.stringify(logs).includes(bearer));
});

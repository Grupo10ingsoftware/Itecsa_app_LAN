import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { createCheckJwt } from '../src/middlewares/checkJwt.js';
import { createRequireActiveIdentity } from '../src/middlewares/requireActiveIdentity.js';
import { createRequirePin } from '../src/middlewares/requirePin.js';
import { PinServiceError } from '../src/modules/auth/service/pin.service.js';
import { createOrderRouter } from '../src/modules/orders/routes/order.routes.js';
import OrderController from '../src/modules/orders/controller/orders.controller.js';
import OrderService from '../src/modules/orders/service/order.service.js';
import SalesNoteSecurityMonitor from '../src/modules/security/service/salesNoteSecurityMonitor.service.js';
import { creationHarness, sourceNote } from './fixtures/opt04/creationHarness.js';
import { ROLE_PERMISSIONS, PERMISSIONS as P } from '../../shared/authorization.js';
import { requestContext, respondError } from '../src/errors/httpErrors.js';

test('HTTP POST preserves JWT/capability/PIN gates, authoritative source, actor, 201 receipt and duplicate 409', async t => {
 const keys=await generateKeyPair('RS256'),jwk={...await exportJWK(keys.publicKey),kid:'opt04',alg:'RS256',use:'sig'};
 const role=Object.entries(ROLE_PERMISSIONS).find(([,p])=>p.includes(P.CREATE_ORDERS)&&p.includes(P.READ_SALES_NOTES))[0];
 let active=true,pins=0;const h=creationHarness(),events=[],counters=[];
 const monitor=new SalesNoteSecurityMonitor({repository:{recordAuditEvent:async e=>{events.push(e);},incrementThrottleWindow:async c=>{counters.push(c);return{request_count:counters.length};}},config:{lookupSignalThreshold:100,notFoundSignalThreshold:100}});
 const service=new OrderService({salesOrderTransaction:h.runInTransaction,salesNoteSourceService:{getByNumber:async()=>sourceNote()},repo:{existsBySalesNoteNumber:async n=>h.state().orders.some(o=>o.numero_nota_venta===n)}});
 const app=express();app.locals.errorLogger={error(){}};app.use(express.json(),requestContext);app.get('/certs',(_req,res)=>res.json({keys:[jwk]}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));
 const origin=`http://127.0.0.1:${server.address().port}`,environment={APP_ENV:'test',KEYCLOAK_ALLOW_HTTP:'true',KEYCLOAK_ISSUER:origin,KEYCLOAK_JWKS_URI:origin+'/certs',KEYCLOAK_AUDIENCE:'api',KEYCLOAK_CLIENT_ID:'web',KEYCLOAK_ROLE_CLIENT_ID:'roles'};
 const authenticate=createCheckJwt({environment,requireIdentity:createRequireActiveIdentity({repository:{findBySubject:async sub=>sub==='fixture'?{idUsuario:9,identitySubject:sub,rolUsuario:role,estadoUsuario:active?'Activo':'Desvinculado'}:null}})});
 const validatePin=createRequirePin({pins:{validate:async(subject,pin)=>{pins++;assert.equal(subject,'fixture');if(pin!=='123456')throw new PinServiceError('PIN_INVALID','PIN invalido',{status:403});return{idUsuario:9};}}});
 app.use('/orders',createOrderRouter({authenticate,validatePin,controller:new OrderController({service,salesNoteMonitor:monitor})}));app.use((error,req,res,_next)=>respondError(error,req,res));
 const token=changes=>new SignJWT({sub:'fixture',typ:'Bearer',azp:'web',resource_access:{roles:{roles:[role]}},permissions:[P.CREATE_ORDERS,P.READ_SALES_NOTES],...changes}).setProtectedHeader({alg:'RS256',kid:'opt04'}).setIssuer(origin).setAudience('api').setIssuedAt().setExpirationTime('5m').sign(keys.privateKey);
 const post=(bearer,body={numeroNota:'SYN-OPT04',pin:'123456'})=>fetch(origin+'/orders',{method:'POST',headers:{'content-type':'application/json',...(bearer?{authorization:`Bearer ${bearer}`}:{})},body:JSON.stringify(body)});
 assert.equal((await post(null)).status,401);assert.equal((await post('invalid')).status,401);assert.equal((await post(await token({permissions:[]}))).status,403);
 active=false;assert.equal((await post(await token({}))).status,403);active=true;
 assert.equal(h.transactions.length,0);assert.equal(pins,0);
 const bearer=await token({});assert.equal((await post(bearer,{numeroNota:'SYN-OPT04',pin:'000000'})).status,403);assert.equal(h.transactions.length,0);
 const response=await post(bearer,{numeroNota:'SYN-OPT04',pin:'123456',actorId:999,id_usuario:999,items:[],cliente:{rut:'attacker'}});
 assert.equal(response.status,201);assert.deepEqual(await response.json(),{id:1,salesNoteNumber:'SYN-OPT04'});assert.equal(h.state().orders[0].id_usuario,9);assert.equal(h.state().details.length,5);
 assert.equal((await post(bearer)).status,409);assert.equal(h.state().orders.length,1);assert.equal(h.state().messages.length,2);
 const lookup=await fetch(origin+'/orders/sales-notes/SYN-OPT04',{headers:{authorization:`Bearer ${bearer}`}});assert.equal(lookup.status,409);
 for(let i=0;i<10&&!events.length;i++)await new Promise(r=>setImmediate(r));
 assert.equal(events[0].outcome,'ALREADY_REGISTERED');assert.equal(counters.length,1);assert(!JSON.stringify(events).includes('123456'));
});

test('lookup handler still awaits the security observer and retains its best-effort failure policy',async()=>{
 let finish;const gate=new Promise(r=>finish=r),calls=[];
 const controller=new OrderController({service:{getSalesNoteByNumber:async()=>sourceNote()},salesNoteMonitor:{observeLookup:async()=>{calls.push('observe');await gate;}},logger:{error(){}}});
 const res={status(){return this;},json(){calls.push('response');return this;}};let settled=false;
 const pending=controller.getSalesNote({params:{numeroNota:'SYN'},currentUser:{idUsuario:9}},res).then(()=>{settled=true;});
 await new Promise(r=>setImmediate(r));assert.deepEqual(calls,['response','observe']);assert.equal(settled,false);finish();await pending;
});

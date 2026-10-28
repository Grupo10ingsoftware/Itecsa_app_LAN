import express from 'express';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import Controller from '../src/modules/history/controller/orderHistory.controller.js';
import {createOrderHistoryRouter} from '../src/modules/history/routes/orderHistory.routes.js';
import {UserRepository} from '../src/modules/users/repo/users.repo.js';
import {createCheckJwt} from '../src/middlewares/checkJwt.js';
import {createRequireActiveIdentity} from '../src/middlewares/requireActiveIdentity.js';
import {createThrottleMiddleware} from '../src/middlewares/rateLimit.js';
import {MemoryThrottleService} from '../src/modules/security/service/securityThrottle.service.js';
import {ROLE_PERMISSIONS,PERMISSIONS as P} from '../../shared/authorization.js';
import {ACTIVE_USER_STATUSES} from '../src/config/userLifecycle.js';
import {requestContext,respondError} from '../src/errors/httpErrors.js';

export async function measureHistoryHttp({db,before,after,id,next,eventCursor,from,to,output,measure}){
 const roles=Object.entries(ROLE_PERMISSIONS).filter(([,ps])=>ps.includes(P.READ_ORDERS)).map(([role])=>role);
 const binding=await db.externalIdentity.findFirst({where:{provider:'keycloak',issuer:process.env.KEYCLOAK_ISSUER,Usuario:{is:{estado_usuario:{in:[...ACTIVE_USER_STATUSES]},rol_usuario:{in:roles}}}},select:{subject:true}});
 if(!binding)throw Object.assign(Error(),{code:'NO_ACTIVE_HISTORY_IDENTITY'});
 const identity=new UserRepository({prisma:db}),actor=await identity.findBySubject(binding.subject);
 const {privateKey,publicKey}=await generateKeyPair('RS256'),key={...await exportJWK(publicKey),kid:'opt05',alg:'RS256',use:'sig'};
 const app=express();app.locals.errorLogger={error(){}};app.use(requestContext);app.get('/certs',(_req,res)=>res.json({keys:[key]}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try{
  const origin=`http://127.0.0.1:${server.address().port}`,environment={APP_ENV:'test',KEYCLOAK_ALLOW_HTTP:'true',KEYCLOAK_ISSUER:origin,KEYCLOAK_JWKS_URI:origin+'/certs',KEYCLOAK_AUDIENCE:'api',KEYCLOAK_CLIENT_ID:'web',KEYCLOAK_ROLE_CLIENT_ID:'roles'};
  const authenticate=createCheckJwt({environment,requireIdentity:createRequireActiveIdentity({repository:identity}),rateLimit:createThrottleMiddleware({throttle:new MemoryThrottleService(),rules:req=>[{scope:'opt05',subject:req.currentUser.idUsuario,limit:200,windowMs:60000}]})});
  for(const [version,service]of [['before',before],['after',after]])app.use('/'+version,createOrderHistoryRouter({authenticate,controller:new Controller({service})}));
  app.use((error,req,res,_next)=>respondError(error,req,res));
  const permissions=ROLE_PERMISSIONS[actor.rolUsuario].filter(p=>[P.READ_ORDERS,P.READ_PAYMENTS].includes(p));
  const token=await new SignJWT({sub:binding.subject,typ:'Bearer',azp:'web',resource_access:{roles:{roles:[actor.rolUsuario]}},permissions}).setProtectedHeader({alg:'RS256',kid:'opt05'}).setIssuer(origin).setAudience('api').setIssuedAt().setExpirationTime('15m').sign(privateKey);
  output.httpHarness={includes:['real router/controller/JWT signature','fresh active DB identity and capabilities','strict TLS MySQL'],excludes:['real Keycloak session','browser/render','global audit and SQL quota writes'],quota:'memory 200/minute',financialCapability:permissions.includes(P.READ_PAYMENTS)};
  const paths={list:['orders',{limit:50}],search:['orders',{search:'a',limit:50}],status:['orders',{status:'Cancelado',limit:50}],dates:['orders',{from,to,limit:50}],next:['orders',{cursor:next??'',limit:10}],previous:['orders',{limit:10}],detail:[`orders/${id}`,{limit:50}],events:[`orders/${id}/events`,{type:'stage',limit:50}],more:[`orders/${id}/events`,{cursor:eventCursor??'',limit:5}]};
  for(const [operation,[path,params]]of Object.entries(paths))for(const version of ['before','after'])await measure(`http_${operation}_${version}`,async()=>{const response=await fetch(`${origin}/${version}/${path}?${new URLSearchParams(params)}`,{headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(30000)});if(response.status!==200){await response.body?.cancel();throw Object.assign(Error(),{code:'HTTP_'+response.status});}return response.json();});
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
}

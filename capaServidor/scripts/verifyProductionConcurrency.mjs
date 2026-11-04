import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openVerifiedLabConnection } from '../src/database/mysqlLabSafety.js';
import getPrismaClient, { disconnectPrismaClient } from '../src/database/prisma.js';
import OrderRepository from '../src/modules/orders/repo/orders.repo.js';
if (!process.env.COMPOSE_PROJECT_NAME?.startsWith('itecsa-integrity-') || process.env.INTEGRITY_CHECK_CONFIRM !== process.env.DB_NAME) throw Error('Disposable integrity lab confirmation required');
const connection=await openVerifiedLabConnection();await connection.end();
const db=getPrismaClient();
try {
 const actor=await db.usuario.findFirst({where:{rol_usuario:'Soporte',ExternalIdentity:{is:{provider:'keycloak'}}}});
 assert.ok(actor,'Create the first Keycloak user before this check');
 const order=await db.pedidos.create({data:{numero_nota_venta:'CONC-'+randomUUID(),id_usuario:actor.id_usuario,id_estado_pedido:3,id_estado_pago:2,fecha_estimada_termino:new Date('2026-11-05'),fecha_creacion:new Date()}});
 const detail=await db.detalle_pedido.create({data:{id_pedido:order.id_pedido,id_tipo_producto:3,id_estado_subproceso:10,cantidad:100}});
 const run=callback=>db.$transaction(tx=>callback(new OrderRepository({prisma:tx})),{timeout:20000,maxWait:10000});
 const args={orderId:order.id_pedido,detailId:detail.id_detalle_pedido,userId:actor.id_usuario,hydrate:false};
 const compete=async callback=>{
  const results=await Promise.allSettled([run(callback),run(callback)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.find(r=>r.status==='rejected').reason.statusCode,409);
 };
 await compete(repo=>repo.completeSubprocess({...args,subprocessId:10}));
 assert.equal(await db.registro_subprocesos.count({where:{id_detalle_pedido:detail.id_detalle_pedido}}),1);
 await compete(repo=>repo.rollbackSubprocess({...args,subprocessId:10,comment:'Retroceso de prueba concurrente'}));
 assert.equal(await db.registro_subprocesos.count({where:{id_detalle_pedido:detail.id_detalle_pedido}}),2);
 await run(repo=>repo.completeSubprocess({...args,subprocessId:10}));
 await compete(repo=>repo.completeSubprocess({...args,subprocessId:5}));
 assert.equal(await db.registro_subprocesos.count({where:{id_detalle_pedido:detail.id_detalle_pedido}}),4);
 await compete(repo=>repo.updateGeneralStep(order.id_pedido,3,{userId:actor.id_usuario}));
 await compete(repo=>repo.updateGeneralStep(order.id_pedido,4,{userId:actor.id_usuario}));
 assert.equal(await db.registro_Etapas.count({where:{id_estado_pedido:5,Registros:{id_pedido:order.id_pedido}}}),1);
 console.log(JSON.stringify({ok:true,orderId:order.id_pedido,checks:['parallel progress','parallel rollback','parallel packaging','parallel production closure','parallel final closure'],subprocessRecords:4,finalClosures:1,fixture:'retained in disposable lab for audit inspection'},null,2));
} finally {await disconnectPrismaClient();}

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openVerifiedLabConnection } from '../src/database/mysqlLabSafety.js';
import getPrismaClient, { disconnectPrismaClient } from '../src/database/prisma.js';
import { seedMysqlLabCatalog, validateMysqlLabCatalog } from '../src/database/mysqlLabSeed.js';
import SalesOrderCreationService from '../src/modules/orders/service/salesOrderCreation.service.js';
import { createSalesOrderTransaction } from '../src/modules/orders/service/salesOrder.transaction.js';
import OrderRepository from '../src/modules/orders/repo/orders.repo.js';
import ProductionLoadRepository from '../src/modules/productionLoad/repo/productionLoad.repo.js';
import ProductionLoadService from '../src/modules/productionLoad/service/productionLoad.service.js';
import { readReportOrders } from '../src/modules/metrics/repo/metricsRead.repo.js';
import MetricsService from '../src/modules/metrics/service/metrics.service.js';

// Explicitly opt into a disposable Docker lab. Operational checks roll back.
if (!process.env.COMPOSE_PROJECT_NAME?.startsWith('itecsa-integrity-') || process.env.INTEGRITY_CHECK_CONFIRM !== process.env.DB_NAME) {
  throw Error('Require an isolated itecsa-integrity-* project and INTEGRITY_CHECK_CONFIRM=DB_NAME.');
}
const verified = await openVerifiedLabConnection(); await verified.end();
const db = getPrismaClient(), evidence = [];
const rollback = Error('EXPECTED_INTEGRITY_ROLLBACK');
try {
  assert.equal((await validateMysqlLabCatalog(db)).valid, true);
  assert.equal((await seedMysqlLabCatalog(db)).created, 0);
  await db.tipo_Producto.update({where:{id_tipo_producto:1},data:{capacidad_diaria:1500}});
  assert.equal((await seedMysqlLabCatalog(db)).created, 0);
  assert.equal(await new ProductionLoadRepository({prisma:db}).getCapacity(),1500);
  evidence.push('seed idempotente; capacidad 1500 conservada');
  const before = await db.pedidos.count();
  try { await db.$transaction(async tx => {
    const subject=randomUUID();
    const actor=await tx.usuario.create({data:{id_keycloak:subject,nombre_usuario:'Prueba integridad',rol_usuario:'Soporte',estado_usuario:'Activo'}});
    await tx.externalIdentity.create({data:{user_id:actor.id_usuario,subject,provider:'keycloak',issuer:'https://integrity.test/realms/lab',username:subject}});
    await assert.rejects(tx.$executeRaw`INSERT INTO Usuario (id_keycloak) VALUES (NULL)`);
    await assert.rejects(tx.usuario.create({data:{id_keycloak:subject}}));
    const other=await tx.usuario.create({data:{id_keycloak:randomUUID()}});
    await assert.rejects(tx.externalIdentity.create({data:{user_id:other.id_usuario,subject:randomUUID(),provider:'keycloak',issuer:'https://integrity.test/realms/lab',username:randomUUID()}}));
    await assert.rejects(tx.$executeRaw`INSERT INTO Estado_Pedido (id_estado_pedido,orden_kanban) VALUES (99,NULL)`);
    await assert.rejects(tx.estado_Pedido.create({data:{id_estado_pedido:99,orden_kanban:4}}));
    await assert.rejects(tx.$executeRaw`UPDATE Producto_Subproceso SET orden_flujo=NULL WHERE id_tipo_producto=3 AND id_estado_subproceso=10`);
    await assert.rejects(tx.producto_Subproceso.update({where:{id_tipo_producto_id_estado_subproceso:{id_tipo_producto:3,id_estado_subproceso:10}},data:{orden_flujo:2}}));
    evidence.push('MySQL rechaza identidad nula/duplicada/discordante y ordenes nulos/duplicados');
    const removed=await tx.producto_Subproceso.findUnique({where:{id_tipo_producto_id_estado_subproceso:{id_tipo_producto:3,id_estado_subproceso:10}}});
    await tx.producto_Subproceso.delete({where:{id_tipo_producto_id_estado_subproceso:{id_tipo_producto:3,id_estado_subproceso:10}}});
    assert.equal((await validateMysqlLabCatalog(tx)).valid,false);
    await assert.rejects(new OrderRepository({prisma:tx}).getCreationProductContext('Yoyo'),{code:'INVALID_PRODUCT_FLOW'});
    await tx.producto_Subproceso.create({data:removed});
    evidence.push('catalogo incompleto rechazado');
    const transactional={$transaction:callback=>callback(tx)};
    const loadRepo=new ProductionLoadRepository({prisma:{...tx,$transaction:callback=>callback(tx)}});
    const names={1:'Lanyard',2:'Tarjeta',3:'Yoyo'};
    const flows={1:[1,2,3,4,5],2:[6,7,8,9,5],3:[10,5]}; // Independent expectations, never imported from seed.
    const createdOrderIds=[];
    for(const products of [[1],[2],[3],[1,2,3]]) {
      const number='INTEGRITY-'+products.join('');
      const source={numeroNota:number,cliente:{rut:'11111111-1',nombre:'Cliente de prueba'},origen:{},items:products.map(id=>({producto:names[id],tipoProducto:names[id],cantidad:100})),itemsSinSeguimientoProductivo:[]};
      const creation=new SalesOrderCreationService({source:{getByNumber:async()=>source},runInTransaction:createSalesOrderTransaction(()=>transactional)});
      const created=await creation.create({numeroNota:number},{actorId:actor.id_usuario,response:'receipt'});
      const id=created.id_pedido ?? created.id;
      assert.ok(id,'creation returns an order ID');
      createdOrderIds.push(id);
      const repo=new OrderRepository({prisma:tx});
      await assert.rejects(repo.updateGeneralStep(id,2,{userId:actor.id_usuario}),{statusCode:409});
      await repo.updatePaymentStatus(id,2,1);
      await assert.rejects(repo.updateGeneralStep(id,2,{userId:actor.id_usuario}),{code:'PRODUCTION_SCHEDULE_REQUIRED'});
      await tx.pedidos.update({where:{id_pedido:id},data:{fecha_estimada_termino:new Date('2026-11-05T00:00:00Z')}});
      await repo.updateGeneralStep(id,2,{userId:actor.id_usuario});
      const details=await tx.detalle_pedido.findMany({where:{id_pedido:id},orderBy:{id_detalle_pedido:'asc'}});
      assert.deepEqual(details.map(d=>d.id_tipo_producto),products);
      await assert.rejects(repo.updateGeneralStep(id,3,{userId:actor.id_usuario}),{statusCode:409});
      for(const detail of details){
        const steps=flows[detail.id_tipo_producto]; assert.equal(detail.id_estado_subproceso,steps[0]);
        const complete=step=>repo.completeSubprocess({orderId:id,detailId:detail.id_detalle_pedido,subprocessId:step,userId:actor.id_usuario,hydrate:false});
        await assert.rejects(complete(steps[1]),{statusCode:409});
        if(detail.id_tipo_producto===1){
          for(const step of steps.slice(0,4))await complete(step);
          const repeated=await tx.detalle_pedido.findUnique({where:{id_detalle_pedido:detail.id_detalle_pedido}});
          assert.equal(repeated.id_estado_subproceso,1); assert.equal(repeated.fecha_real_termino,null);
          await loadRepo.updateDailyLoads({dateKey:'2026-11-03',entries:[{detailId:detail.id_detalle_pedido,quantity:100}],userId:actor.id_usuario,capacity:1500});
          const progress=await tx.avance_Lanyard.findFirst({where:{id_detalle_pedido:detail.id_detalle_pedido}});
          assert.equal(progress.capacidad_diaria_referencia,1500);assert.equal(Number(progress.porcentaje_acumulado),100);
          const load=await new ProductionLoadService({repo:loadRepo}).getDailyLoad({date:'2026-11-03'});
          assert.equal(load.capacity,1500);assert.equal(load.percentage,Math.round(load.lanyardsInProduction/1500*100));
        }
        for(const step of steps)await complete(step);
        await assert.rejects(complete(steps.at(-1)),{statusCode:409});
        assert.ok((await tx.detalle_pedido.findUnique({where:{id_detalle_pedido:detail.id_detalle_pedido}})).fecha_real_termino);
      }
      await repo.updateGeneralStep(id,3,{userId:actor.id_usuario});
      await repo.updateGeneralStep(id,4,{userId:actor.id_usuario});
      await assert.rejects(repo.updateGeneralStep(id,4,{userId:actor.id_usuario}),{statusCode:409});
      const final=await tx.pedidos.findUnique({where:{id_pedido:id},include:{Estado_Pedido:true}});
      assert.equal(final.id_estado_pedido,5);assert.equal(final.Estado_Pedido.nombre_etapa,'Terminado');
      assert.equal(await tx.registro_Etapas.count({where:{id_estado_pedido:5,Registros:{id_pedido:id}}}),1);
      evidence.push(`pedido ${products.map(id=>names[id]).join('+')}: flujo ${products.map(id=>flows[id].length).join('/')} completo y cierre unico`);
    }
    const orders=(await readReportOrders(tx,{start:new Date('2026-01-01'),end:new Date('2027-01-01')})).filter(order=>createdOrderIds.includes(order.id_pedido));
    assert.equal(orders.length,4);assert.ok(orders.every(order=>order.Registros[0].Registro_Etapas.Estado_Pedido.id_estado_pedido===4));
    const metrics=await new MetricsService({repo:{production:async()=>({}),dwellTime:async()=>({stages:[],subprocesses:[]}),reportOrders:async()=>orders}}).summary({from:'2026-01-01',to:'2026-12-31'});
    assert.ok(metrics.flowTime.every(row=>row.readyForDeliveryAt));
    evidence.push('metricas conservan fecha real de Listo para Entrega por ID');
    throw rollback;
  },{timeout:90000,maxWait:10000}); } catch(error){if(error!==rollback)throw error;}
  assert.equal(await db.pedidos.count(),before);
  console.log(JSON.stringify({ok:true,evidence,operationalData:'rolled back',capacity:1500},null,2));
} finally {await disconnectPrismaClient();}

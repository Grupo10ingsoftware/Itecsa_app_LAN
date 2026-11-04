import { respondError } from '../src/errors/httpErrors.js';
import { AppError } from '../src/errors/AppError.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { assertProductFlow } from '../src/modules/orders/repo/productFlow.js';
import { identityKey } from '../src/database/identityBinding.js';
import ProductionCapacityService from '../src/modules/productionCapacity/service/productionCapacity.service.js';
import ProductionLoadRepository from '../src/modules/productionLoad/repo/productionLoad.repo.js';
import ProductionLoadService from '../src/modules/productionLoad/service/productionLoad.service.js';
import { transitionGeneralStageOperation } from '../src/modules/orders/repo/orderStageOperations.js';

for (const [id, expected] of [[1,[1,2,3,4,5]],[2,[6,7,8,9,5]],[3,[10,5]]]) {
 test(`flujo ${id}: completo, ausente, truncado, desordenado y pertenencia`,()=>{
  const steps=expected.map((step,index)=>({id_estado_subproceso:step,orden_flujo:index+1}));
  assert.deepEqual(assertProductFlow(id,steps),steps);
  for(const wrong of [[],steps.slice(1),[...steps].reverse(),steps.map((row,index)=>index===0?{...row,id_estado_subproceso:99}:row)]){
   assert.throws(()=>assertProductFlow(id,wrong),{code:'INVALID_PRODUCT_FLOW'});
  }
 });
}
test('identidad vacia o solo espacios se rechaza',()=>{
 for(const subject of ['',null,'   ','\t'])assert.throws(()=>identityKey(subject,'https://keycloak.test'));
});
test('capacidad de la base rige carga; nunca se sustituye por 1200',async()=>{
 let capacity=1500;
 const repo=new ProductionLoadRepository({prisma:{tipo_Producto:{findUnique:async({where})=>{assert.equal(where.id_tipo_producto,1);return{capacidad_diaria:capacity};}}}});
 repo.listLanyardDetails=async()=>[{dailyQuantity:750}];
 const service=new ProductionLoadService({repo});
 assert.equal((await service.getDailyLoad({date:'2026-11-03'})).percentage,50);
 for(const invalid of [null,0,10001]){capacity=invalid;await assert.rejects(service.getDailyLoad(),{code:'INVALID_PRODUCTION_CAPACITY'});}
});
test('solo Lanyard admite cambios de capacidad de 1 a 10000',async()=>{
 let writes=0;
 const service=new ProductionCapacityService({repo:{updateMany:async values=>{writes++;return[{id_tipo_producto:1,nombre_producto:'Lanyard',capacidad_diaria:values[0].capacity}];}}});
 for(const capacities of [[{id:2,capacity:1500}],[{id:3,capacity:1500}],[{id:1,capacity:0}],[{id:1,capacity:10001}],[{id:1,capacity:1.5}]])await assert.rejects(service.update(capacities),{statusCode:400});
 assert.equal(writes,0);assert.equal((await service.update([{id:1,capacity:1500}]))[0].capacity,1500);
});
test('estado ausente da error de configuracion antes de escribir pedido o historial',async()=>{
 const repo={client:{estado_Pedido:{findFirst:async({where})=>{assert.deepEqual(where,{id_estado_pedido:5});return null;}}}};
 await assert.rejects(transitionGeneralStageOperation(repo,{id:1,ordenKanban:4}),{statusCode:500,code:'INVALID_ORDER_CATALOG'});
});

test('errores de catalogo tienen mensaje publico fijo sin filtrar detalles internos',()=>{
 for(const code of ['INVALID_ORDER_CATALOG','INVALID_PRODUCT_FLOW','INVALID_PRODUCTION_CAPACITY']){
  let body,status;
  const response={setHeader(){},status(value){status=value;return this;},json(value){body=value;}};
  respondError(new AppError(500,'SECRET SQL DETAIL',code),{method:'GET'},response,{logger:{error(){}}});
  assert.equal(status,500);assert.equal(body.code,code);assert.match(body.message,/Configuracion inconsistente/);
  assert.ok(!JSON.stringify(body).includes('SECRET'));assert.ok(body.requestId);
 }
});

import assert from 'node:assert/strict';
import Repository from '../src/modules/history/repo/orderHistory.repo.js';
import Service from '../src/modules/history/service/orderHistory.service.js';
import BeforeRepository from '../test/fixtures/opt05/orderHistory.before.repo.js';
import BeforeService from '../test/fixtures/opt05/orderHistory.before.service.js';
import {fixtureSqlClient} from '../test/fixtures/opt05/historyFixture.js';
import {orderListQuery} from '../src/modules/history/repo/historyRead.repo.js';
import {encodeCursor} from '../src/shared/pagination.js';

export async function verifyHistorySqlFixtures(db) {
 const client=fixtureSqlClient(db),repo=new Repository({prisma:client}),before=new BeforeService({repo:new BeforeRepository({prisma:client})}),after=new Service({repo});
 const output={source:'Read-only CTE tables inside SELECT; no fixture DDL/DML',equivalence:[],chronology:[]};
 for(const [query,ids]of [[{},[4,3,2,1]],[{cursor:{id:3}},[2,1]],[{status:'Cancelado'},[4]],[{search:'Ána'},[4,1]],[{search:'No cliente'},[3]],[{dateRange:{start:new Date('2024-09-01'),end:new Date('2024-10-01')}},[2,1]]]){
  const rows=await repo.list({limit:50,...query});assert.deepEqual(rows.map(r=>r.id_pedido),ids);output.equivalence.push({operation:'list',equal:true});
 }
 for(const id of [1,2,999]){assert.deepEqual(await repo.getById(id),await before.repo.getById(id));output.equivalence.push({operation:'header',fixtureOrder:id,equal:true});}
 const order=await repo.getById(1);assert.equal(order.Detalle_pedido.length,2);assert.equal(order.Pedido_Item_Sin_Seguimiento.length,1);assert.equal(order.Pedido_Etiqueta.length,3);
 for(const allowed of [false,true])for(const type of ['all','stage','payment','subprocess','calendar','general']){
  const opts={includePaymentDetails:allowed},query={type,limit:50};
  const old=await before.getOrderHistory(1,query,opts),current=await after.getOrderHistory(1,query,opts);assert.deepEqual(current,old);
  if(type==='payment'){
   assert.equal(current.events.length,1);const payment=current.events[0];
   if(allowed){assert.match(payment.description,/privada OPT05/);assert.equal(payment.responsible,'Ana Sintética');}
   else{assert.equal(Object.hasOwn(payment,'description'),false);assert.equal(Object.hasOwn(payment,'responsible'),false);assert(!JSON.stringify(current).includes('privad'));}
  }
  output.equivalence.push({operation:'detail',type,includePaymentDetails:allowed,equal:true});
 }
 let cursor=null,firstCursor=null;const ids=[];
 do{const page=await after.listOrderEvents(1,{limit:2,cursor});ids.push(...page.events.map(e=>e.id));cursor=page.pageInfo.nextCursor;firstCursor??=cursor;}while(cursor);
 assert.deepEqual(ids,[7,6,5,4,3,2,1]);output.chronology=ids;
 assert.deepEqual((await after.listOrderEvents(2,{limit:2,cursor:firstCursor})).events,[]);
 output.crossOrderCursorNoLeak=true;
 const grownRepo=new Repository({prisma:fixtureSqlClient(db,{newer:true,changedStatus:true})}),grown=new Service({repo:grownRepo});
 assert.deepEqual((await grown.listOrderEvents(1,{limit:2,cursor:firstCursor})).events.map(e=>e.id),[5,4]);
 assert.deepEqual((await grown.listOrderEvents(1,{limit:2})).events.map(e=>e.id),[8,7]);
 assert.deepEqual((await grown.listOrders({limit:2,cursor:encodeCursor({id:3})})).items.map(o=>o.id),[2,1]);
 assert.deepEqual((await grown.listOrders({limit:2})).items.map(o=>o.id),[5,4]);
 assert.equal((await grownRepo.getById(1)).Estado_Pedido.nombre_etapa,'Cancelado');
 output.concurrentVariants={method:'Changed read-only CTE rows between pages; no live writes',newOrdersNotMixedIntoOlderPages:true,newEventsVisibleOnFreshPage:true,updatedOrderStatusVisible:true};
 const probe='SYN%_\\literal';let pattern=null,probeSql='',probing=false;
 db.$on('query',event=>{if(probing){const values=JSON.parse(event.params);pattern=values.find(v=>typeof v==='string'&&v.includes('SYN'))??pattern;probeSql=event.query;}});
 probing=true;await db.pedidos.findMany({where:{numero_nota_venta:{contains:probe}},select:{id_pedido:true},take:1});probing=false;
 assert(pattern);
 assert.match(probeSql,/LIKE\s+CONCAT\(\s*'%'\s*,\s*\?\s*,\s*'%'\s*\)/i);
 assert(orderListQuery({search:probe,limit:1}).values.includes('%'+pattern+'%'));
 output.likeSemantics={syntheticProbe:probe,prismaParameter:pattern,prismaSql:probeSql,effectivePattern:'%'+pattern+'%',equal:true};
 return output;
}

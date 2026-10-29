import test from 'node:test';
import assert from 'node:assert/strict';
import Repository from '../src/modules/history/repo/orderHistory.repo.js';
import Service from '../src/modules/history/service/orderHistory.service.js';
import BeforeRepository from './fixtures/opt05/orderHistory.before.repo.js';
import BeforeService from './fixtures/opt05/orderHistory.before.service.js';
import {orderListQuery,orderCountQuery} from '../src/modules/history/repo/historyRead.repo.js';
import {encodeCursor,encodeHistoryEventCursor,decodeHistoryEventCursor} from '../src/shared/pagination.js';
import {header,tracked,untracked,labels,children,eventRows} from './fixtures/opt05/historyFixture.js';
process.env.APP_ENV='test';

test('header uses two parallel reads, preserves nulls, accessories and repeated labels without fan-out',async()=>{
 let calls=0,release;const gate=new Promise(resolve=>release=resolve);
 const current=new Repository({prisma:{$queryRaw:async q=>{if(++calls===2)release();await gate;return q.sql.includes('UNION ALL')?children:[header];}}});
 const old=new BeforeRepository({prisma:{$queryRawUnsafe:async q=>q.includes('FROM Pedidos')?[header]:q.includes('FROM Detalle_pedido')?tracked:q.includes('FROM Pedido_Item')?untracked:labels}});
 assert.deepEqual(await current.getById(1),await old.getById(1));assert.equal(calls,2);
 assert.equal(await new Repository({prisma:{$queryRaw:async()=>[]}}).getById(999),null);
});

for(const limit of [1,10,50])test(`list stays one bounded query for limit ${limit}, with the same graph and keyset`,async()=>{
 const row={id_pedido:9,numero_nota_venta:'SYN',fecha_creacion:null,relatedClient:1,nombre_cliente:null,razon_social:'ñ',id_estado_pedido:1,nombre_etapa:'Cancelado',orden_kanban:null};
 const expected={id_pedido:9,numero_nota_venta:'SYN',fecha_creacion:null,Cliente:{nombre_cliente:null,razon_social:'ñ'},Estado_Pedido:{id_estado_pedido:1,nombre_etapa:'Cancelado',orden_kanban:null}};
 let count=0;const repo=new Repository({prisma:{$queryRaw:async q=>{count++;assert.equal(q.values.at(-1),limit+1);return [row];}}});
 assert.deepEqual(await repo.list({limit,cursor:{id:10}}),[expected]);assert.equal(count,1);
});

test('list binds partial search, state, cursor and inclusive/exclusive creation dates',()=>{
 const input={limit:50,cursor:{id:99},search:"ñ%_\\' OR 1=1",status:"Cancelado'",dateRange:{start:new Date('2024-09-01'),end:new Date('2024-10-01')}};
 const q=orderListQuery(input);assert(!q.sql.includes(input.search));assert(!q.sql.includes(input.status));
 assert(q.values.includes('%'+input.search+'%'));assert(q.values.includes(input.status));assert(q.values.includes(input.dateRange.start));assert(q.values.includes(input.dateRange.end));
 assert.match(q.sql,/p.id_pedido < \?/);assert.match(q.sql,/ORDER BY p.id_pedido DESC LIMIT \?/);assert.doesNotMatch(q.sql,/OFFSET|SELECT\s+\*/);
});

test('detail header and event reads start concurrently',async()=>{
 let count=0,release;const gate=new Promise(resolve=>release=resolve);
 const wait=async value=>{if(++count===2)release();await gate;return value;};
 const order=await new Repository({prisma:{$queryRaw:async q=>q.sql.includes('UNION ALL')?children:[header]}}).getById(1);
 const result=await new Service({repo:{getById:()=>wait(order),listEvents:()=>wait([])}}).getOrderHistory(1);
 assert.equal(count,2);assert.equal(result.items.length,3);assert.deepEqual(result.labels,['Alta','Urgente','Urgente']);
});

test('numbered history pages use bound offsets and the same filters for the real total',async()=>{
 const filters={page:5,limit:10,status:'En producción',search:"ñ' OR 1=1",dateRange:{start:new Date('2026-01-01'),end:new Date('2026-11-01')}};
 const page=orderListQuery(filters),count=orderCountQuery({...filters,cursor:{id:90}});
 assert.match(page.sql,/ORDER BY p.id_pedido DESC LIMIT \?\s+OFFSET \?/);
 assert.deepEqual(page.values.slice(-2),[11,40]);
 assert.match(count.sql,/SELECT COUNT\(\*\) AS total/);assert.doesNotMatch(count.sql,/OFFSET|LIMIT|p.id_pedido </);
 assert.deepEqual(count.values,page.values.slice(0,-2));
 assert(!page.sql.includes(filters.search));assert(!count.sql.includes(filters.status));
 const repo=new Repository({prisma:{$queryRaw:async q=>{assert.equal(q.sql,count.sql);return [{total:53n}];}}});
 assert.equal(await repo.count(filters),53);
});

test('numbered page rows and filtered count run concurrently without changing legacy cursor responses',async()=>{
 let calls=0,release;const gate=new Promise(resolve=>release=resolve);
 const wait=async result=>{if(++calls===2)release();await gate;return result;};
 const service=new Service({repo:{list:filters=>{assert.equal(filters.page,3);assert.equal(filters.limit,20);return wait([]);},count:filters=>{assert.equal(filters.status,'Cancelado');return wait(53);}}});
 const page=await service.listOrders({page:3,limit:20,status:'Cancelado'});
 assert.equal(calls,2);assert.equal(page.total,53);assert.equal(page.page,3);assert.deepEqual(page.items,[]);
 const legacy=await new Service({repo:{list:async()=>[]}}).listOrders({limit:10});
 assert.deepEqual(legacy,{items:[],pageInfo:{limit:10,nextCursor:null,hasMore:false}});
});

for(const page of [0,-1,1.5,'bad',Number.MAX_SAFE_INTEGER])test(`numbered page rejects invalid input without a read: ${page}`,async()=>{
 const service=new Service({repo:new Proxy({},{get(){throw Error('must not read');}})});
 await assert.rejects(service.listOrders({page,limit:50}),error=>error.statusCode===400);
});

test('history rejects ambiguous page plus cursor without reading',async()=>{
 const service=new Service({repo:new Proxy({},{get(){throw Error('must not read');}})});
 await assert.rejects(service.listOrders({page:1,cursor:encodeCursor({id:10})}),error=>error.statusCode===400);
});

for(const type of ['all','stage','payment','subprocess','calendar','general'])for(const allowed of [false,true])test(`events retain exact SQL, actor/observation projection and DTO: ${type}, finance=${allowed}`,async()=>{
 const rows=eventRows(12),queries=[];
 const client={$queryRawUnsafe:async(sql,...values)=>{queries.push({sql,values});return rows;}};
 const before=new BeforeService({repo:new BeforeRepository({prisma:client})}),after=new Service({repo:new Repository({prisma:client})});
 const query={type,limit:10,cursor:encodeHistoryEventCursor(rows[0])},options={includePaymentDetails:allowed};
 assert.deepEqual(await after.listOrderEvents(1,query,options),await before.listOrderEvents(1,query,options));
 assert.deepEqual(queries[0],queries[1]);assert.deepEqual(queries[0].values.slice(0,5),Array(5).fill(allowed?1:0));
 assert.match(queries[0].sql,/CASE WHEN rp.id_registro IS NOT NULL AND \? = 0 THEN NULL ELSE r.observacion END/);
 assert.match(queries[0].sql,/ORDER BY r.FECHA_HORA DESC, r.ID_REGISTRO DESC/);
 assert.equal(queries[0].values.at(-1),11);
});

for(const query of [{limit:0},{limit:101},{cursor:'invalid'},{from:'2024-02-30'},{from:'2024-09-10',to:'2024-09-01'}])test(`list rejects invalid input before repository: ${JSON.stringify(query)}`,async()=>{
 const s=new Service({repo:new Proxy({},{get(){throw Error('must not read');}})});await assert.rejects(s.listOrders(query));
});
for(const [id,query]of [['1 OR 1=1',{}],[1,{type:'all;DROP'}],[1,{cursor:'bad'}],[1,{limit:999}]])test(`events reject invalid input before repository: ${id} ${JSON.stringify(query)}`,async()=>{
 const s=new Service({repo:new Proxy({},{get(){throw Error('must not read');}})});await assert.rejects(s.listOrderEvents(id,query));await assert.rejects(s.getOrderHistory(id,query));
});

test('compound cursor includes ID to traverse timestamp ties and rejects the wrong cursor kind',async()=>{
 const rows=eventRows(1000),client={$queryRawUnsafe:async(_sql,...args)=>{
  const cursor=args.length>7?{occurredAt:args.at(-4),id:args.at(-2)}:null;
  return rows.filter(r=>!cursor||r.FECHA_HORA<cursor.occurredAt||(r.FECHA_HORA.getTime()===cursor.occurredAt.getTime()&&r.ID_REGISTRO<cursor.id)).slice(0,args.at(-1));
 }};
 const s=new Service({repo:new Repository({prisma:client})});let cursor=null;const ids=[];
 do{const page=await s.listOrderEvents(1,{limit:50,cursor});ids.push(...page.events.map(e=>e.id));cursor=page.pageInfo.nextCursor;if(cursor)assert(decodeHistoryEventCursor(cursor).id>0);}while(cursor);
 assert.deepEqual(ids,rows.map(r=>r.ID_REGISTRO));assert.equal(new Set(ids).size,1000);
 assert.throws(()=>decodeHistoryEventCursor(encodeCursor({id:1})),{code:'INVALID_CURSOR'});
});

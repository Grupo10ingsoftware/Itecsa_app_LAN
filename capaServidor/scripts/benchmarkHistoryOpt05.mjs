// Bounded development SELECT/EXPLAIN only. No business rows/parameters in output.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {PrismaClient,Prisma} from '@prisma/client';
import {PrismaMariaDb} from '@prisma/adapter-mariadb';
import {resolveDatabaseConnection,createStrictTlsOptions} from '../src/database/connectionConfig.js';
import BeforeRepository from '../test/fixtures/opt05/orderHistory.before.repo.js';
import BeforeService from '../test/fixtures/opt05/orderHistory.before.service.js';
import Repository from '../src/modules/history/repo/orderHistory.repo.js';
import Service from '../src/modules/history/service/orderHistory.service.js';

if(process.env.APP_ENV!=='development'||!process.argv.includes('--allow-development-reads'))throw Error('Explicit development read opt-in required');
const baseline=process.argv.includes('--baseline-only'),arg=name=>process.argv.find(v=>v.startsWith(`--${name}=`))?.slice(name.length+3);
const bytes=v=>Buffer.byteLength(JSON.stringify(v,(_k,x)=>typeof x==='bigint'?x.toString():x));
const c=resolveDatabaseConnection(),db=new PrismaClient({adapter:new PrismaMariaDb({host:c.host,port:c.port,user:c.user,password:c.password,database:c.database,connectionLimit:10,connectTimeout:8000,socketTimeout:15000,...(c.sslMode==='required'?{ssl:createStrictTlsOptions(c.host,c.ca)}:{})}),log:[{emit:'event',level:'query'}]});
let queries=[],reads=[];const plans=new Map();
db.$on('query',e=>{if(/^\s*(SELECT|WITH)\b/i.test(e.query)){queries.push({sql:e.query,ms:e.duration});if(!plans.has(e.query))plans.set(e.query,{sql:e.query,values:JSON.parse(e.params)});}});
async function read(fn){const t=performance.now(),rows=await fn();reads.push({rows:rows.length,bytes:bytes(rows),ms:+(performance.now()-t).toFixed(3)});return rows;}
const client=new Proxy(db,{get(target,key){if(key==='$queryRaw')return q=>{plans.set(q.sql,q);return read(()=>target.$queryRaw(q));};if(key==='$queryRawUnsafe')return (sql,...values)=>{plans.set(sql,{sql,values});return read(()=>target.$queryRawUnsafe(sql,...values));};const v=Reflect.get(target,key,target);if(v&&typeof v==='object')return new Proxy(v,{get(model,method){const fn=model[method];return method==='findMany'?(...args)=>read(()=>fn.apply(model,args)):typeof fn==='function'?fn.bind(model):fn;}});return typeof v==='function'?v.bind(target):v;}});
const before=new BeforeService({repo:new BeforeRepository({prisma:client})}),after=new Service({repo:new Repository({prisma:client})});
const output={reference:'d9e67ac (history unchanged; pending OPT-07 preserved)',capturedAt:new Date().toISOString(),methodology:'Five warm samples, strict TLS/pool10; no writes. Driver includes network/adapter. Engine CPU and E2E not measured. No reliable p95 from five samples.',samples:{},equivalence:[],explain:[]};
async function measure(name,fn){await fn();const samples=[];for(let i=0;i<5;i++){queries=[];reads=[];const cpu=process.cpuUsage(),heap=process.memoryUsage().heapUsed,t=performance.now();const value=await fn(),ms=performance.now()-t,used=process.cpuUsage(cpu);samples.push({ms:+ms.toFixed(3),selects:queries.length,resultBytes:bytes(value),cpuMs:(used.user+used.system)/1000,heapDeltaBytes:process.memoryUsage().heapUsed-heap,driverMs:queries.map(q=>q.ms),reads:[...reads]});}const times=samples.map(s=>s.ms).sort((a,b)=>a-b);output.samples[name]={minMs:times[0],meanMs:times.reduce((a,b)=>a+b)/times.length,medianMs:times[2],maxMs:times.at(-1),samples};console.error(name,times[2]);}
async function equivalent(fn){const OriginalDate=Date,now=Date.now();globalThis.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}static [Symbol.hasInstance](v){return v instanceof OriginalDate;}};try{assert.deepEqual(await fn(after),await fn(before));}finally{globalThis.Date=OriginalDate;}}
try{
 if(process.argv.includes('--fixtures-only')){
  const {verifyHistorySqlFixtures}=await import('./historySqlFixtureProbeOpt05.mjs');
  output.sqlFixtures=await verifyHistorySqlFixtures(db);
 }else{
 const first=await before.listOrders({limit:50});
 const [sampleOrder]=await db.$queryRaw`SELECT p.id_pedido FROM Pedidos p LEFT JOIN Registros r ON r.id_pedido=p.id_pedido GROUP BY p.id_pedido ORDER BY COUNT(r.ID_REGISTRO) DESC,p.id_pedido DESC LIMIT 1`;
 const id=Number(sampleOrder?.id_pedido??1),date=new Date(first.items[0]?.createdAt??'2026-10-01');
 const from=date.toISOString().slice(0,7)+'-01',to=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).toISOString().slice(0,10);
 const next=(await before.listOrders({limit:10})).pageInfo.nextCursor,events=await before.listOrderEvents(id,{limit:5});
 output.scenario={ordersInFirstPage:first.items.length,defaultLimit:50,deepPageLimit:10,eventPageLimit:5,hasNextPage:!!next,hasMoreEvents:events.pageInfo.hasMore};
 const cases={list:s=>s.listOrders({limit:50}),search:s=>s.listOrders({search:'a',limit:50}),status:s=>s.listOrders({status:'Cancelado',limit:50}),dates:s=>s.listOrders({from,to,limit:50}),next:s=>s.listOrders({limit:10,cursor:next}),previous:s=>s.listOrders({limit:10}),detail:s=>s.getOrderHistory(id,{limit:50},{includePaymentDetails:false}),events:s=>s.listOrderEvents(id,{type:'stage',limit:50},{includePaymentDetails:false}),more:s=>s.listOrderEvents(id,{limit:5,cursor:events.pageInfo.nextCursor},{includePaymentDetails:false}),header:s=>s.repo.getById(id)};
 if(process.argv.includes('--plans-only')){
  for(const name of ['list','search','status','dates','next']){await cases[name](before);await cases[name](after);}
 }else if(!process.argv.includes('--http-only'))for(const [name,fn]of Object.entries(cases)){
  await measure(name+'_before',()=>fn(before));
  if(!baseline){await measure(name+'_after',()=>fn(after));await equivalent(fn);output.equivalence.push({operation:name,equal:true});}
 }
 if(!baseline&&!process.argv.includes('--http-only')){
  if(!process.argv.includes('--plans-only')){
   for(const permission of [false,true])for(const type of ['all','stage','payment','subprocess','calendar','general']){await equivalent(s=>s.getOrderHistory(id,{type,limit:50},{includePaymentDetails:permission}));output.equivalence.push({operation:'detail',type,includePaymentDetails:permission,equal:true});}
   for(const query of [{limit:1},{limit:10},{limit:50},{search:'ñ'},{search:'%_\\'},{search:"' OR 1=1 --"},{search:'never-a-real-note-opt05'},{from:'2024-02-29',to:'2024-03-01'},{status:'Terminado',from,to}]){await equivalent(s=>s.listOrders(query));output.equivalence.push({operation:'list',scenario:'bounded edge case',equal:true});}
  }
  for(const q of plans.values())output.explain.push({sql:q.sql,plan:q.strings?await db.$queryRaw(Prisma.sql`EXPLAIN ${q}`):await db.$queryRawUnsafe('EXPLAIN '+q.sql,...q.values)});
  output.indexes=await db.$queryRaw`SELECT TABLE_NAME,INDEX_NAME,COLUMN_NAME,SEQ_IN_INDEX FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('Pedidos','Registros','Detalle_pedido','Pedido_Etiqueta') ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX`;
 }
 if(process.argv.includes('--http-only')){const {measureHistoryHttp}=await import('./historyHttpProbeOpt05.mjs');await measureHistoryHttp({db,before,after,id,next,eventCursor:events.pageInfo.nextCursor,from,to,output,measure});}
 }
}catch(error){output.failure={name:error.name,code:error.code??'HISTORY_COMPARISON_FAILED'};console.error(output.failure);process.exitCode=1;}
finally{await db.$disconnect();await writeFile(arg('output')??(baseline?'../docs/OPT-05_LINEA_BASE.json':'../docs/OPT-05_RENDIMIENTO.json'),JSON.stringify(output,(_k,v)=>typeof v==='bigint'?v.toString():v,2)+'\n');}

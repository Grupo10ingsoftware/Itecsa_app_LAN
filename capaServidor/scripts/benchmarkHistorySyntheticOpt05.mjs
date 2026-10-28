// In-memory transport/CPU only; never a SQL execution, HTTP or render benchmark.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import Repository from '../src/modules/history/repo/orderHistory.repo.js';
import Service from '../src/modules/history/service/orderHistory.service.js';
import BeforeRepository from '../test/fixtures/opt05/orderHistory.before.repo.js';
import BeforeService from '../test/fixtures/opt05/orderHistory.before.service.js';
import {eventRows,header,tracked,untracked,labels} from '../test/fixtures/opt05/historyFixture.js';
import * as formats from '../../capaVista/src/modules/orderHistory/utils/orderHistoryFormatters.js';
import * as oldFormats from '../../capaVista/src/modules/orderHistory/utils/fixtures/formatters.before.js';
process.env.APP_ENV='test';
const output={methodology:'Five warm samples; prebuilt in-memory transport, no MySQL/HTTP/render timing. Heap delta includes GC and is not peak. Pagination simulation does not establish SQL plans at scale.',lists:[],headers:[],events:[],formatters:[]};
async function measure(fn){await fn();const samples=[];for(let i=0;i<5;i++){const cpu=process.cpuUsage(),heap=process.memoryUsage().heapUsed,t=performance.now();const value=await fn(),ms=performance.now()-t,used=process.cpuUsage(cpu);samples.push({ms:+ms.toFixed(3),cpuMs:(used.user+used.system)/1000,heapDeltaBytes:process.memoryUsage().heapUsed-heap,resultBytes:Buffer.byteLength(JSON.stringify(value))});}const times=samples.map(s=>s.ms).sort((a,b)=>a-b);return {medianMs:times[2],minMs:times[0],maxMs:times.at(-1),meanMs:times.reduce((a,b)=>a+b)/5,samples};}
for(const n of [0,50,500,5000]){
 const dataset=Array.from({length:n},(_,i)=>({id_pedido:n-i,numero_nota_venta:`SYN-${n-i}`,fecha_creacion:new Date('2024-09-01'),Cliente:{nombre_cliente:'Cliente ñ',razon_social:'Razón'},Estado_Pedido:{id_estado_pedido:1,nombre_etapa:'Cancelado',orden_kanban:1}}));
 const page=dataset.slice(0,51),flat=page.map(o=>({...o,relatedClient:1,nombre_cliente:o.Cliente.nombre_cliente,razon_social:o.Cliente.razon_social,...o.Estado_Pedido}));
 const old=new BeforeService({repo:new BeforeRepository({prisma:{pedidos:{findMany:async()=>page}}})}),current=new Service({repo:new Repository({prisma:{$queryRaw:async()=>flat}})});
 assert.deepEqual(await current.listOrders(),await old.listOrders());
 output.lists.push({datasetOrders:n,pageRows:page.length,equal:true,before:await measure(()=>old.listOrders()),after:await measure(()=>current.listOrders())});
}
for(const n of [1,10,1000,5000]){
 const details=Array.from({length:n},(_,i)=>({...tracked[0],id_detalle_pedido:i+1})),accessories=Array.from({length:Math.ceil(n/10)},(_,i)=>({...untracked[0],id_item_sin_seguimiento:i+1}));
 const joined=[...details.map(row=>({kind:0,...row})),...accessories.map(row=>({kind:1,...row})),...labels.map(row=>({kind:2,...row}))];
 const old=new BeforeService({repo:new BeforeRepository({prisma:{$queryRawUnsafe:async sql=>sql.includes('FROM Registros')?[]:sql.includes('FROM Pedidos')?[header]:sql.includes('FROM Detalle_pedido')?details:sql.includes('FROM Pedido_Item')?accessories:labels}})});
 const current=new Service({repo:new Repository({prisma:{$queryRaw:async q=>q.sql.includes('UNION ALL')?joined:[header],$queryRawUnsafe:async()=>[]}})});
 assert.deepEqual(await current.getOrderHistory(1),await old.getOrderHistory(1));
 output.headers.push({trackedItems:n,untrackedItems:accessories.length,labels:labels.length,equal:true,before:await measure(()=>old.getOrderHistory(1)),after:await measure(()=>current.getOrderHistory(1))});
}
for(const n of [0,10,100,1000,10000]){
 const rows=eventRows(n);const client={$queryRawUnsafe:async(_sql,...params)=>{const hasCursor=params.length>7,at=params.at(-4),id=params.at(-2);return rows.filter(r=>!hasCursor||r.FECHA_HORA<at||(r.FECHA_HORA.getTime()===at.getTime()&&r.ID_REGISTRO<id)).slice(0,params.at(-1));}};
 const old=new BeforeService({repo:new BeforeRepository({prisma:client})}),current=new Service({repo:new Repository({prisma:client})});
 async function collect(service){let cursor=null;const ids=[];do{const page=await service.listOrderEvents(1,{limit:50,cursor});ids.push(...page.events.map(e=>e.id));cursor=page.pageInfo.nextCursor;}while(cursor);return ids;}
 assert.deepEqual(await collect(current),rows.map(r=>r.ID_REGISTRO));assert.deepEqual(await collect(current),await collect(old));
 output.events.push({events:n,timestampTies:true,equal:true,before:await measure(()=>collect(old)),after:await measure(()=>collect(current))});
}
for(const n of [0,50,500,1000]){
 const values=Array.from({length:n},(_,i)=>new Date(1725767999000+i*1000).toISOString());
 for(const name of ['formatDate','formatDateTime']){const old=()=>values.map(oldFormats[name]),current=()=>values.map(formats[name]);assert.deepEqual(current(),old());output.formatters.push({name,values:n,equal:true,before:await measure(old),after:await measure(current)});}
}
for(const zone of ['UTC','America/Santiago']){
 process.env.TZ=zone;
 const scoped=await import('../../capaVista/src/modules/orderHistory/utils/orderHistoryFormatters.js?zone='+zone);
 for(const value of ['2024-09-08T03:59:59Z','2024-09-08T04:00:00Z','2024-04-07T02:59:59Z','2024-04-07T03:00:00Z','2024-02-29','2025-01-01']){assert.equal(scoped.formatDate(value),oldFormats.formatDate(value));assert.equal(scoped.formatDateTime(value),oldFormats.formatDateTime(value));}
}
output.timezoneEquivalence=['UTC','America/Santiago'];
await writeFile('../docs/OPT-05_SINTETICO.json',JSON.stringify(output,null,2)+'\n');

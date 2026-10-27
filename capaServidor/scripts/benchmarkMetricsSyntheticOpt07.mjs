// CPU/serialization fixtures, no database connection, HTTP or MySQL timing claims.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import BeforeRepository from '../test/fixtures/opt07/metrics.before.repo.js';
import BeforeService from '../test/fixtures/opt07/metrics.before.service.js';
import MetricsRepository from '../src/modules/metrics/repo/metrics.repo.js';
import MetricsService from '../src/modules/metrics/service/metrics.service.js';
import { buildProductionChart as beforeChart } from '../../capaVista/src/modules/metrics/utils/fixtures/chart.before.js';
import { buildProductionChart } from '../../capaVista/src/modules/metrics/utils/metricsPage.js';
import { buildSellerReport } from '../../capaVista/src/modules/metrics/utils/reportFormatting.js';
import { beforeSellerReport } from '../../capaVista/src/modules/metrics/utils/fixtures/export.before.js';
const date=v=>new Date(v);
function fixture(n){
 const orders=[],details=[],stages=[],subs=[],rows=[];
 for(let i=1;i<=n;i++){
  const order={id_pedido:i,numero_nota_venta:`SYN-${i}`,fecha_creacion:date('2024-09-01'),fecha_estimada_termino:i%7?date('2024-09-10'):null,Usuario:i%5?{nombre_usuario:`Vendedor ${i%30}`,apellido_usuario:'ñ'}:null,Detalle_pedido:[],Registros:[]};
  rows.push({kind:0,...order,relatedUser:order.Usuario?1:null,nombre_usuario:order.Usuario?.nombre_usuario,apellido_usuario:order.Usuario?.apellido_usuario});
  for(let j=0;j<2;j++){
   const detail={cantidad:i%13,fecha_estimada_termino:date('2024-09-10'),fecha_real_termino:i%4?date(`2024-09-${i%2?'09':'11'}`):null,Tipo_Producto:{nombre_producto:j?'Lanyard':'lanyard'}};
   order.Detalle_pedido.push(detail);details.push(detail);rows.push({kind:1,id_pedido:i,...detail,nombre_producto:detail.Tipo_Producto.nombre_producto});
  }
  for(let j=0;j<12;j++){
   const entry=j===10&&i%3===0?null:date(`2024-09-${j<10?'02':'03'}T04:00:00Z`);
   const stage={fecha_hora_entrada:entry,fecha_hora_salida:date('2024-09-04T04:00:01Z'),Estado_Pedido:{nombre_etapa:j<10?'Producción':'Listo para entrega'}};
   const event={FECHA_HORA:date(`2024-09-${String(j+1).padStart(2,'0')}T12:00:00Z`),Registro_Etapas:stage};
   order.Registros.push(event);stages.push(stage);
   if(j>=10)rows.push({kind:2,id_pedido:i,sortDate:event.FECHA_HORA,fecha_hora_entrada:entry,nombre_etapa:stage.Estado_Pedido.nombre_etapa});
   subs.push({...stage,Estado_Subprocesos:{nombre_estado:'Corte'},Detalle_pedido:{Tipo_Producto:{nombre_producto:i%2?'Lanyard':'Tarjeta'}}});
  }
  orders.push(order);
 }
 const beforeRepo=new BeforeRepository({prisma:{detalle_pedido:{findMany:async()=>details},registro_Etapas:{findMany:async()=>stages},registro_subprocesos:{findMany:async()=>subs},pedidos:{findMany:async()=>orders}}});
 const flatDetails=details.map(d=>({cantidad:d.cantidad,nombre_producto:d.Tipo_Producto.nombre_producto}));
 const flatSubs=subs.map(s=>({fecha_hora_entrada:s.fecha_hora_entrada,fecha_hora_salida:s.fecha_hora_salida,nombre_estado:s.Estado_Subprocesos.nombre_estado,nombre_producto:s.Detalle_pedido.Tipo_Producto.nombre_producto}));
 const flatStages=stages.map(s=>({fecha_hora_entrada:s.fecha_hora_entrada,fecha_hora_salida:s.fecha_hora_salida,nombre_etapa:s.Estado_Pedido.nombre_etapa}));
 const afterRepo=new MetricsRepository({prisma:{$queryRaw:async q=>q.sql.includes('WITH selected_orders')?rows:q.sql.includes('FROM Detalle_pedido')?flatDetails:q.sql.includes('FROM registro_subprocesos')?flatSubs:flatStages}});
 return {before:new BeforeService({repo:beforeRepo}),after:new MetricsService({repo:afterRepo}),shape:{orders:n,details:details.length,events:stages.length,subprocesses:subs.length,readyEvents:n*2}};
}
async function measure(fn){await fn();const samples=[];for(let i=0;i<5;i++){const cpu=process.cpuUsage(),heap=process.memoryUsage().heapUsed,t=performance.now();const value=await fn();const elapsed=performance.now()-t,used=process.cpuUsage(cpu);samples.push({ms:+elapsed.toFixed(3),cpuMs:(used.user+used.system)/1000,heapDeltaBytes:process.memoryUsage().heapUsed-heap,bytes:Buffer.byteLength(typeof value==='string'?value:JSON.stringify(value))});}return {medianMs:samples.map(s=>s.ms).sort((a,b)=>a-b)[2],samples};}
const output={methodology:'Synthetic in-memory repo transport, no SQL execution/network/render. Five warm samples. Heap deltas include GC, not peak memory. Exports unchanged serializer; no baseline speedup claimed.',cases:[]};
for(const n of [10,100,1000,10000]){
 const f=fixture(n),period={from:'2024-09-01',to:'2024-09-30'};
 const old=await f.before.summary(period),current=await f.after.summary(period);assert.deepEqual(current,old);
 const products=Array.from({length:n},(_,i)=>({productType:`Producto ${i}`,quantity:i%5})),production={total:products.reduce((s,p)=>s+p.quantity,0),products};
 assert.deepEqual(buildProductionChart(production,['red','blue']),beforeChart(production,['red','blue']));
 const row={...f.shape,equal:true,summaryDigest:createHash('sha256').update(JSON.stringify(current)).digest('hex'),before:await measure(()=>f.before.summary(period)),after:await measure(()=>f.after.summary(period)),chartBefore:await measure(()=>beforeChart(production,['red','blue'])),chartAfter:await measure(()=>buildProductionChart(production,['red','blue'])),exports:{}};
 const sellers=Array.from({length:n},(_,i)=>({seller:`=Sintético ñ ${i},"\n`,salesNotes:2,deliveredOnTime:1,deliveredLate:1,enteredDuringHighLoad:0}));
 for(const format of ['csv','excel','pdf']){
  assert.equal(buildSellerReport(sellers,format,period.from,period.to),beforeSellerReport(sellers,format,period.from,period.to));
  row.exports[format]={equal:true,before:await measure(()=>beforeSellerReport(sellers,format,period.from,period.to)),after:await measure(()=>buildSellerReport(sellers,format,period.from,period.to))};
 }
 output.cases.push(row);
}
await writeFile('../docs/OPT-07_VOLUMEN_SINTETICO.json',JSON.stringify(output,null,2)+'\n');

import test from 'node:test';
import assert from 'node:assert/strict';
import MetricsRepository from '../src/modules/metrics/repo/metrics.repo.js';
import MetricsService from '../src/modules/metrics/service/metrics.service.js';
import BeforeRepository from './fixtures/opt07/metrics.before.repo.js';
import BeforeService from './fixtures/opt07/metrics.before.service.js';
import { productionQuery, stagesQuery, subprocessesQuery, performanceQuery, readReportOrders } from '../src/modules/metrics/repo/metricsRead.repo.js';

const date=v=>v==null?null:new Date(v);
const range={from:'2024-09-01',to:'2024-09-30'};
const stage=(entry,exit,name='Producción')=>({fecha_hora_entrada:date(entry),fecha_hora_salida:date(exit),Estado_Pedido:{nombre_etapa:name}});

test('joined production keeps exact JS case, accents, null quantities and insertion order',async()=>{
 const details=[['Lanyard',3],['lanyard',4],['Tarjéta',null],['Tarjeta',-2],['Lanyard',9],[null,20],['',1]];
 const old=new BeforeRepository({prisma:{detalle_pedido:{findMany:async()=>details.map(([n,cantidad])=>({cantidad,Tipo_Producto:{nombre_producto:n}}))}}});
 const current=new MetricsRepository({prisma:{$queryRaw:async()=>details.map(([nombre_producto,cantidad])=>({nombre_producto,cantidad}))}});
 assert.deepEqual(await current.production({}),await old.production({}));
});

for(const [name,entry,exit]of[
 ['closed','2024-09-01T12:00:00Z','2024-09-01T13:00:00Z'],
 ['open','2024-09-01T12:00:00Z',null],['missing',null,'2024-09-01T12:00:00Z'],
 ['equal','2024-09-01T12:00:00Z','2024-09-01T12:00:00Z'],
 ['negative','2024-09-01T12:00:01Z','2024-09-01T12:00:00Z'],
 ['fraction','2024-09-01T12:00:00.100Z','2024-09-01T12:00:00.600Z'],
 ['midnight','2024-09-01T23:59:59Z','2024-09-02T00:00:01Z'],
 ['month','2024-08-31T23:59:59Z','2024-09-01T00:00:01Z'],
 ['Chile DST','2024-09-08T03:59:59Z','2024-09-08T04:00:01Z'],
 ['leap','2024-02-28T23:59:59Z','2024-03-01T00:00:01Z'],
])test(`duration exact equivalence: ${name}, repeats and reentry`,()=>{
 const items=[stage(entry,exit),stage(entry,exit),stage('2024-09-02T10:00:00Z','2024-09-02T10:00:03Z')];
 const before=new BeforeRepository().averageDurations(items,x=>x.Estado_Pedido?.nombre_etapa);
 const after=new MetricsRepository().averageDurations(items,x=>x.Estado_Pedido?.nombre_etapa);
 assert.deepEqual(after,before);
});

test('joined dwell branches remain parallel and preserve repeated names by product',async()=>{
 let started=0;let release;const gate=new Promise(r=>release=r);
 const repo=new MetricsRepository({prisma:{$queryRaw:async q=>{started++;if(started===2)release();await gate;return q.sql.includes('registro_subprocesos')?[{...stage('2024-09-01','2024-09-02'),nombre_estado:'Corte',nombre_producto:'Lanyard'}]:[{...stage('2024-09-01','2024-09-02'),nombre_etapa:'Producción'}];}}});
 const result=await repo.dwellTime({start:date('2024-09-01'),end:date('2024-10-01')});
 assert.equal(started,2);assert.equal(result.stages[0].averageSeconds,86400);assert.equal(result.subprocesses[0].productType,'Lanyard');
});

test('disjoint report rows do not multiply quantities; preserve first ready event including null entry',async()=>{
 const rows=[{kind:0,id_pedido:1,numero_nota_venta:'N1',fecha_creacion:date('2024-09-01'),fecha_estimada_termino:date('2024-09-10'),relatedUser:1,nombre_usuario:'Ana',apellido_usuario:null},
 {kind:1,id_pedido:1,cantidad:901,nombre_producto:'Lanyard',fecha_estimada_termino:date('2024-09-10'),fecha_real_termino:date('2024-09-09')},
 {kind:1,id_pedido:1,cantidad:3,nombre_producto:'Tarjeta',fecha_estimada_termino:null,fecha_real_termino:null},
 {kind:2,id_pedido:1,sortDate:date('2024-09-02'),fecha_hora_entrada:null,nombre_etapa:'Listo para entrega'},
 {kind:2,id_pedido:1,sortDate:date('2024-09-03'),fecha_hora_entrada:date('2024-09-03'),nombre_etapa:'Listo para entrega'}];
 let calls=0;const orders=await readReportOrders({$queryRaw:async()=>{calls++;return rows;}},{start:date('2024-09-01'),end:date('2024-10-01')});
 const oldOrders=structuredClone(orders);oldOrders[0].Registros.unshift({FECHA_HORA:date('2024-09-01'),Registro_Etapas:{Estado_Pedido:{nombre_etapa:'Producción'}}});
 const fixed={production:async()=>({Lanyard:901,Tarjeta:3}),dwellTime:async()=>({stages:[],subprocesses:[]})};
 const before=await new BeforeService({repo:{...fixed,reportOrders:async()=>oldOrders}}).summary(range);
 const after=await new MetricsService({repo:{...fixed,reportOrders:async()=>orders}}).summary(range);
 assert.deepEqual(after,before);assert.equal(calls,1);assert.equal(after.flowTime[0].durationSeconds,null);assert.equal(after.sellerCompliance[0].salesNotes,1);
});

for(const [name,ready,due]of[
 ['on-time','2024-09-10T03:00:00Z','2024-09-10'],['late','2024-09-11T03:00:00Z','2024-09-10'],
 ['missing deadline','2024-09-10T03:00:00Z',null],['UTC before Chile month','2024-09-01T00:00:00Z','2024-09-01'],
 ['DST before','2024-09-08T03:59:59Z','2024-09-07'],['DST after','2024-09-08T04:00:00Z','2024-09-08'],
 ['latest outside month','2024-10-02T12:00:00Z','2024-09-30'],['missing event',null,null],
])test(`performance exact DTO: ${name}`,async()=>{
 const orders=[{fecha_estimada_termino:date(due),Registros:[{Registro_Etapas:{fecha_hora_entrada:date(ready)}}]}];
 const repo={performanceOrders:async()=>orders};
 assert.deepEqual(await new MetricsService({repo}).productionPerformance(range),await new BeforeService({repo}).productionPerformance(range));
});

test('empty DTO and all three summary branches remain unchanged',async()=>{
 let started=0;let release;const gate=new Promise(r=>release=r);
 const wait=async v=>{if(++started===3)release();await gate;return v;};
 const result=await new MetricsService({repo:{production:()=>wait({}),dwellTime:()=>wait({stages:[],subprocesses:[]}),reportOrders:()=>wait([])}}).summary(range);
 assert.equal(started,3);assert.deepEqual(result,{period:range,production:{total:0,products:[]},dwellTime:{stages:[],subprocesses:[]},sellerCompliance:[],flowTime:[]});
});

for(const query of [{from:'2024-02-30',to:'2024-03-01'},{from:'2024-03-02',to:'2024-03-01'},{from:'2023-01-01',to:'2024-01-02'},{from:"2024-01-01' OR 1=1",to:'2024-01-02'}])test(`invalid period rejected before SQL: ${query.from}`,async()=>{
 const service=new MetricsService({repo:new Proxy({},{get(){throw Error('must not query');}})});
 await assert.rejects(service.summary(query),{statusCode:400});await assert.rejects(service.productionPerformance(query),{statusCode:400});
});

test('all SQL date and status values are parameters; latest-ready search is not range-restricted',()=>{
 const start=date('2024-09-01'),end=date('2024-10-01');
 for(const make of [productionQuery,stagesQuery,subprocessesQuery,performanceQuery]){const q=make({start,end});assert(q.values.includes(start));assert(!q.sql.includes('2024-09-01'));assert(!/\bSELECT\s+\*/i.test(q.sql));}
 const q=performanceQuery({start,end});assert(q.sql.includes('ORDER BY e.fecha_hora_entrada DESC, r.ID_REGISTRO DESC LIMIT 1'));assert.equal(q.values.at(-1).toISOString(),'2024-10-02T00:00:00.000Z');
});

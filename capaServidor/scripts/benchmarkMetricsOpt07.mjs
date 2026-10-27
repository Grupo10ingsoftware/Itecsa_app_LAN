// Opt-in, bounded development reads only. Never persists business rows or parameters.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { resolveDatabaseConnection, createStrictTlsOptions } from '../src/database/connectionConfig.js';
import BeforeRepository from '../test/fixtures/opt07/metrics.before.repo.js';
import BeforeService from '../test/fixtures/opt07/metrics.before.service.js';
import MetricsRepository from '../src/modules/metrics/repo/metrics.repo.js';
import MetricsService from '../src/modules/metrics/service/metrics.service.js';
const arg = name => process.argv.find(v => v.startsWith(`--${name}=`))?.slice(name.length + 3);
if (process.env.APP_ENV !== 'development' || !process.argv.includes('--allow-development-reads')) throw Error('Requires explicit development reads');
const c = resolveDatabaseConnection();
const db = new PrismaClient({ adapter: new PrismaMariaDb({ host:c.host,port:c.port,user:c.user,password:c.password,database:c.database,connectionLimit:10,connectTimeout:8000,socketTimeout:15000,...(c.sslMode === 'required' ? {ssl:createStrictTlsOptions(c.host,c.ca)}:{}) }),log:[{emit:'event',level:'query'}] });
let queries=[],reads=[],branches=[]; const plans=new Map();
db.$on('query',e=>{ if (/^\s*(SELECT|WITH)\b/i.test(e.query)) queries.push({sql:e.query,driverMs:e.duration}); });
async function read(label,work){const t=performance.now();const result=await work();reads.push({label,ms:+(performance.now()-t).toFixed(3),topLevelRows:result.length,bytes:Buffer.byteLength(JSON.stringify(result,(_k,v)=>typeof v==='bigint'?v.toString():v))});return result;}
const client=new Proxy(db,{get(target,key){if(key==='$queryRaw')return (input,...values)=>{const q=Array.isArray(input)?Prisma.sql(input,...values):input;plans.set(q.sql,q);return read('raw',()=>target.$queryRaw(q));};const value=Reflect.get(target,key,target);if(value&&typeof value==='object')return new Proxy(value,{get(model,method){const fn=model[method];return method==='findMany'?(...args)=>read(String(key),()=>fn.apply(model,args)):typeof fn==='function'?fn.bind(model):fn;}});return typeof value==='function'?value.bind(target):value;}});
const timed=repo=>new Proxy(repo,{get(target,key){const value=Reflect.get(target,key,target);if(['production','dwellTime','reportOrders','performanceOrders'].includes(key))return async(...args)=>{const t=performance.now();const result=await value.apply(target,args);branches.push({name:key,ms:+(performance.now()-t).toFixed(3),resultBytes:Buffer.byteLength(JSON.stringify(result))});return result;};return typeof value==='function'?value.bind(target):value;}});
const before=new BeforeService({repo:timed(new BeforeRepository({prisma:client}))});
const after=new MetricsService({repo:timed(new MetricsRepository({prisma:client}))});
const output={reference:'51a4d89',node:process.version,capturedAt:new Date().toISOString(),methodology:'5 warm sequential samples, 250ms pauses, strict TLS/pool10. Service only, no E2E claim; query durations overlap in parallel branches.',samples:{},equivalence:[],explain:[]};
async function measure(name,fn){await fn();const samples=[];let shapes;for(let i=0;i<5;i++){queries=[];reads=[];branches=[];const cpu=process.cpuUsage(),memory=process.memoryUsage().heapUsed,t=performance.now();const result=await fn();const ms=performance.now()-t,used=process.cpuUsage(cpu);samples.push({ms:+ms.toFixed(3),selects:queries.length,bytes:Buffer.byteLength(JSON.stringify(result)),cpuMs:(used.user+used.system)/1000,heapDeltaBytes:process.memoryUsage().heapUsed-memory,driverMs:queries.map(q=>q.driverMs),reads:[...reads],branches:[...branches]});shapes=[...new Set(queries.map(q=>q.sql))];await new Promise(r=>setTimeout(r,250));}const sorted=samples.map(s=>s.ms).sort((a,b)=>a-b);output.samples[name]={medianMs:sorted[2],samples,sql:shapes};console.error(name,sorted[2]);}
try {
 const [latest]=await db.$queryRaw`SELECT MAX(fecha_creacion) AS latest FROM Pedidos`;
 const date=latest.latest??new Date('2026-10-01T00:00:00Z');
 const from=date.toISOString().slice(0,7)+'-01';const end=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0));
 const range={from,to:end.toISOString().slice(0,10)};output.period=range;
 if(process.argv.includes('--http-only')){
  const {measureMetricsHttp}=await import('./metricsHttpProbeOpt07.mjs');
  await measureMetricsHttp({db,before,after,range,output,measure});
 }else{
 for(const name of ['summary','productionPerformance']){
  await measure(`${name}_before`,()=>before[name](range));
  if(!process.argv.includes('--baseline-only')){await measure(`${name}_after`,()=>after[name](range));assert.deepEqual(await after[name](range),await before[name](range));output.equivalence.push({operation:name,period:'populated month',equal:true});}
 }
 if(!process.argv.includes('--baseline-only')){
  for(const range of [{from:'2000-01-01',to:'2000-01-31'},{from:'2024-01-01',to:'2024-12-31'}])for(const name of ['summary','productionPerformance']){assert.deepEqual(await after[name](range),await before[name](range));output.equivalence.push({operation:name,period:range,equal:true});}
  for(const query of plans.values())output.explain.push({sql:query.sql,plan:await db.$queryRaw(Prisma.sql`EXPLAIN ${query}`)});
  output.indexes=await db.$queryRaw`SELECT TABLE_NAME,INDEX_NAME,COLUMN_NAME,SEQ_IN_INDEX FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('Detalle_pedido','Registro_Etapas','registro_subprocesos','Registros','Pedidos') ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX`;
 }
 }
}catch(error){output.failure={name:error.name,code:error.code??'DIAGNOSTIC_FAILED'};process.exitCode=1;}
finally{await db.$disconnect();await writeFile(arg('output')??'../docs/OPT-07_RENDIMIENTO_SQL.json',JSON.stringify(output,(_k,v)=>typeof v==='bigint'?v.toString():v,2)+'\n');}

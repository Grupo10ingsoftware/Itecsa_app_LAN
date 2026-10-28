// A second pass against d9e67ac, preserving the original OPT-07 evidence.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { resolveDatabaseConnection, createStrictTlsOptions } from '../src/database/connectionConfig.js';
import MetricsRepository from '../src/modules/metrics/repo/metrics.repo.js';
import MetricsService from '../src/modules/metrics/service/metrics.service.js';
import { readReportOrders, reportOrdersQuery } from '../src/modules/metrics/repo/metricsRead.repo.js';
import { readReportOrders as beforeRead } from '../test/fixtures/opt07/second-pass/metricsRead.before.repo.js';
import { range, period, volumeFixture, withReportFixture } from '../test/fixtures/opt07/second-pass/reportFixture.js';

const bytes = value => Buffer.byteLength(JSON.stringify(value,(_k,v)=>typeof v==='bigint'?v.toString():v));
const digest = value => createHash('sha256').update(JSON.stringify(value,(_k,v)=>typeof v==='bigint'?v.toString():v)).digest('hex');
const output = {reference:'d9e67ac873c00f00e36709907f431fdabe7e1e7b',capturedAt:new Date().toISOString(),node:process.version,
 methodology:'Five warm samples per version; interleaved pairs for service/CPU. Internal payload is JSON representation, not protocol bytes. Heap deltas include GC, not peak. No E2E claim.',
 samples:{},synthetic:[],equivalence:[]};
let queries=[],reads=[],branches=[];
const sample = async fn => {
 queries=[];reads=[];branches=[];
 const cpu=process.cpuUsage(),heap=process.memoryUsage().heapUsed,t=performance.now();
 const value=await fn(),ms=performance.now()-t,used=process.cpuUsage(cpu);
 return {ms:+ms.toFixed(3),cpuMs:(used.user+used.system)/1000,heapDeltaBytes:process.memoryUsage().heapUsed-heap,
  resultBytes:bytes(value),selects:queries.length,driverMs:queries.map(q=>q.ms),reads:[...reads],branches:[...branches]};
};
const stats = samples => ({medianMs:samples.map(s=>s.ms).sort((a,b)=>a-b)[Math.floor(samples.length/2)],samples});
const fixtureClient = rows => ({$queryRaw:async q=>q.sql.includes('WITH selected_orders')?rows:[]});
async function paired(before,after){await before();await after();const a=[],b=[];for(let i=0;i<5;i++){if(i%2){b.push(await sample(after));a.push(await sample(before));}else{a.push(await sample(before));b.push(await sample(after));}}return {before:stats(a),after:stats(b)};}
const service = (client,read) => {
 const repo=new MetricsRepository({prisma:client}); repo.reportOrders=r=>read(client,r);
 const timed=new Proxy(repo,{get(target,key){const v=Reflect.get(target,key,target);return typeof v==='function'?async(...args)=>{const t=performance.now();const value=await v.apply(target,args);branches.push({name:key,ms:+(performance.now()-t).toFixed(3)});return value;}:v;}});
 return new MetricsService({repo:timed});
};

for(const [count,events]of [[10,2],[100,20],[1000,50],[10000,20]]){
 const {rows,reducedRows}=volumeFixture(count,events),base=fixtureClient(rows),next=fixtureClient(reducedRows);
 const before=service(base,beforeRead),after=service(next,readReportOrders);
 const old=await before.summary(period),current=await after.summary(period);assert.deepEqual(current,old);
 output.synthetic.push({orders:count,readyPerOrder:events,beforeRows:rows.length,afterRows:reducedRows.length,beforeInternalBytes:bytes(rows),afterInternalBytes:bytes(reducedRows),equal:true,digest:digest(current),
  transport:'Prebuilt in-memory rows; no SQL/network/selection time included',...await paired(()=>before.summary(period),()=>after.summary(period))});
}

if(process.argv.includes('--allow-development-reads')){
 if(process.env.APP_ENV!=='development')throw Error('Requires APP_ENV=development');
 const c=resolveDatabaseConnection();
 const db=new PrismaClient({adapter:new PrismaMariaDb({host:c.host,port:c.port,user:c.user,password:c.password,database:c.database,connectionLimit:10,connectTimeout:8000,socketTimeout:15000,...(c.sslMode==='required'?{ssl:createStrictTlsOptions(c.host,c.ca)}:{})}),log:[{emit:'event',level:'query'}]});
 db.$on('query',e=>{if(/^\s*(SELECT|WITH)\b/i.test(e.query))queries.push({ms:e.duration});});
 const client={$queryRaw:async q=>{const t=performance.now(),rows=await db.$queryRaw(q);reads.push({rows:rows.length,bytes:bytes(rows),ms:+(performance.now()-t).toFixed(3)});return rows;}};
 try{
  let oldQuery;await beforeRead({$queryRaw:async q=>{oldQuery=q;return [];}},range);
  const oldFixture=await db.$queryRaw(withReportFixture(oldQuery));
  const newFixture=await db.$queryRaw(withReportFixture(reportOrdersQuery(range)));
  const beforeFixture=service(fixtureClient(oldFixture),beforeRead),afterFixture=service(fixtureClient(newFixture),readReportOrders);
  const expected=await beforeFixture.summary(period),actual=await afterFixture.summary(period);
  assert.deepEqual(actual,expected);
  assert.deepEqual(actual.flowTime.map(row=>row.readyForDeliveryAt?.toISOString()??null),[null,'2024-09-02T00:00:00.000Z',null,'2024-09-10T00:00:00.000Z',null]);
  assert.equal(newFixture.filter(r=>Number(r.kind)===2).length,3);
  output.sqlFixture={source:'Read-only CTE shadow tables, no writes to physical business tables',orders:5,events:9,beforeRows:oldFixture.length,afterRows:newFixture.length,equal:true,digest:digest(actual),
   cases:['CI/accent/trailing-space near names before first exact','null first entry preserved','timestamp tie ordered by PK','event timestamp differs from entry timestamp','order with no exact event','all details retained']};
  console.error('SQL fixture: equivalent');
  const [latest]=await db.$queryRaw`SELECT MAX(fecha_creacion) AS latest FROM Pedidos`;
  const date=latest.latest??range.start,from=date.toISOString().slice(0,7)+'-01',to=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).toISOString().slice(0,10);
  const selected={from,to};output.period=selected;
  const before=service(client,beforeRead),after=service(client,readReportOrders);
  for(const name of ['summary','productionPerformance']){
   for(const p of [selected,{from:'2000-01-01',to:'2000-01-31'},{from:'2024-01-01',to:'2024-12-31'}]){assert.deepEqual(await after[name](p),await before[name](p));output.equivalence.push({operation:name,period:p,equal:true});}
   const result=await paired(()=>before[name](selected),()=>after[name](selected));
   output.samples[name+'_before']=result.before;output.samples[name+'_after']=result.after;
   console.error(name,result.before.medianMs,result.after.medianMs);
  }
  output.explain=[];
  const selectedRange={start:new Date(from+'T00:00:00Z'),end:new Date(new Date(to+'T00:00:00Z').getTime()+86400000)};
  let baselineQuery;await beforeRead({$queryRaw:async q=>{baselineQuery=q;return [];}},selectedRange);
  for(const [version,q]of [['before',baselineQuery],['after',reportOrdersQuery(selectedRange)]])output.explain.push({version,sql:q.sql,plan:await db.$queryRaw(Prisma.sql`EXPLAIN ${q}`)});
  const {measureMetricsHttp}=await import('./metricsHttpProbeOpt07.mjs');
  await measureMetricsHttp({db,before,after,range:selected,output,measure:async(name,fn)=>{await fn();const values=[];for(let i=0;i<5;i++)values.push(await sample(fn));output.samples[name]=stats(values);console.error(name,output.samples[name].medianMs);}});
 }catch(error){output.failure={name:error.name,code:error.code??'READ_COMPARISON_FAILED'};console.error(output.failure);process.exitCode=1;}
 finally{await db.$disconnect();}
}
const destination=process.argv.find(v=>v.startsWith('--output='))?.slice(9)??'../docs/OPT-07_SEGUNDA_PASADA.json';
await writeFile(destination,JSON.stringify(output,(_k,v)=>typeof v==='bigint'?v.toString():v,2)+'\n');

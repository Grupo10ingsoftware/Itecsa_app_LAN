// Synthetic CPU/model-call benchmark. No SQL, remote writes, PIN checks or E2E claims.
import assert from 'node:assert/strict';
import { writeFile, mkdtemp, unlink, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import SalesOrderCreationService from '../src/modules/orders/service/salesOrderCreation.service.js';
import BeforeService from '../test/fixtures/opt04/salesOrderCreation.before.js';
import { creationHarness, normalizedState, sourceNote } from '../test/fixtures/opt04/creationHarness.js';
import { normalizeSalesNote, FixtureSalesNoteRepository } from '../src/modules/orders/service/salesNoteSource.service.js';
import { normalizeSalesNote as beforeNormalize } from '../test/fixtures/opt04/salesNoteNormalization.before.js';
import { toOrderCreatedDTO } from '../src/modules/orders/dto/order.dto.js';
const n=20;
const output={reference:'0be21bb',node:process.version,capturedAt:new Date().toISOString(),methodology:'20 warm sequential synthetic samples; isolated transactional model. Times include JS/model work, no database/network/security PIN cost. Model-call counts are NOT physical SQL counts. p95 applies only to this synthetic workload; not the 1s application goal.',cases:[],source:[]};
async function run(Type,note,config){const h=creationHarness(config);let txMs;const service=new Type({source:{getByNumber:async()=>structuredClone(note)},runInTransaction:async op=>{const t=performance.now();const value=await h.runInTransaction(op);txMs=performance.now()-t;return value;}});const cpu=process.cpuUsage(),heap=process.memoryUsage().heapUsed,t=performance.now();const result=await service.create({numeroNota:note.numeroNota,priority:'urgent',observacionInterna:'Sintético ñ'},{actorId:9,response:'receipt',requestId:'synthetic'});const ms=performance.now()-t,used=process.cpuUsage(cpu);return{sample:{ms:+ms.toFixed(3),transactionModelMs:+txMs.toFixed(3),cpuMs:(used.user+used.system)/1000,heapDeltaBytes:process.memoryUsage().heapUsed-heap,receiptBytes:Buffer.byteLength(JSON.stringify(toOrderCreatedDTO(result))),modelCalls:h.calls.length},calls:h.calls,state:normalizedState(h.state())};}
function stats(samples){const sorted=samples.map(s=>s.ms).sort((a,b)=>a-b);return{n:samples.length,medianMs:+((sorted[9]+sorted[10])/2).toFixed(3),p95Ms:sorted[Math.ceil(sorted.length*.95)-1],samples};}
for(const fixture of [{lines:1,accessories:0,types:['Lanyard']},{lines:5,accessories:3,types:['Lanyard']},{lines:20,accessories:30,types:['Yoyo','Lanyard','Tarjeta']}])for(const existingClient of [true,false]){
 const note=sourceNote(fixture),config={existingClient};await run(BeforeService,note,config);await run(SalesOrderCreationService,note,config);
 const before=[],after=[];let calls;
 for(let i=0;i<n;i++){const b=await run(BeforeService,note,config),a=await run(SalesOrderCreationService,note,config);assert.deepEqual(a.state,b.state);before.push(b.sample);after.push(a.sample);calls={before:b.calls,after:a.calls};}
 output.cases.push({fixture,existingClient,equivalent:true,before:stats(before),after:stats(after),modelCalls:calls});
}
for(const count of [1,5,20,1000]){
 const raw={numeroNota:'SYN',cliente:{rut:'11111111-1',nombre:'Cliente ñ'},items:Array.from({length:count},(_,i)=>({importable:i%3!==0,codigo:'P'+i,producto:'Producto sintético ñ',cantidad:i+1,familia:'LANYARD',subfamilia:'LANYARD'}))};
 assert.deepEqual(normalizeSalesNote(raw),beforeNormalize(raw));const result={lines:count,equivalent:true};
 for(const [name,fn]of[['before',beforeNormalize],['after',normalizeSalesNote]]){for(let i=0;i<20;i++)fn(raw);const samples=[];for(let i=0;i<n;i++){const t=performance.now();for(let j=0;j<100;j++)fn(raw);samples.push((performance.now()-t)/100);}samples.sort((a,b)=>a-b);result[name]={medianMs:+((samples[9]+samples[10])/2).toFixed(6),p95Ms:+samples[18].toFixed(6)};}
 output.source.push(result);
}
output.fixtureLookup=[];
const dir=await mkdtemp('../tmp/opt04-source-bench-'),fixturePath=join(dir,'fixture.json');
try{
 for(const count of [1,5,20]){
  const record={numeroNota:'123',cliente:{rut:'11111111-1',nombre:'Cliente sintético'},items:Array.from({length:count},(_,i)=>({importable:true,codigo:'P'+i,producto:'Producto sintético',cantidad:i+1,familia:'LANYARD',subfamilia:'LANYARD'}))};
  await writeFile(fixturePath,JSON.stringify([record]));
  const repo=new FixtureSalesNoteRepository({fixturePath,fixtureEnabled:()=>true});
  const result={lines:count,methodology:'Current fixture file only; no DB, duplicate check, monitoring or HTTP. Cache policy unchanged, no before/after speedup claim.'};
  for(const mode of ['cold','warm']){await repo.getByNumber('123');const samples=[];for(let i=0;i<n;i++){if(mode==='cold')repo.cache=null;const t=performance.now();await repo.getByNumber('123');samples.push({ms:+(performance.now()-t).toFixed(3)});}result[mode]=stats(samples);}
  output.fixtureLookup.push(result);
 }
}finally{await unlink(fixturePath);await rmdir(dir);}
await writeFile('../docs/OPT-04_CREACION_SINTETICA.json',JSON.stringify(output,null,2)+'\n');

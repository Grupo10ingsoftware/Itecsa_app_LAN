import fs from 'node:fs/promises';
const dir=new URL('../../docs/optimización/evidencia/conexiones-20261030/',import.meta.url);
const round=x=>+x.toFixed(3);
export function stats(values){const v=values.filter(Number.isFinite).toSorted((a,b)=>a-b),n=v.length;return n?{n,medianMs:round((v[(n-1)>>1]+v[n>>1])/2),maxMs:v.at(-1),...(n>=20?{p95Ms:v[Math.ceil(.95*n)-1]}:{})}:{n:0};}
function union(events,end){const spans=events.map(e=>[Math.max(0,e.atMs),Math.min(end,e.atMs+e.ms)]).filter(([a,b])=>b>a).sort((a,b)=>a[0]-b[0]);let sum=0,a=0,b=0;for(const [x,y]of spans){if(x>b){sum+=b-a;a=x;b=y;}else b=Math.max(b,y);}return round(sum+b-a);}
const out={createdAt:new Date().toISOString(),percentiles:'nearest rank p95 only n>=20; empirical, not population SLO',http:{},prisma:{},direct:{}};
for(const file of await fs.readdir(dir)){
 if(!file.endsWith('.json')||file==='resumen.json'||file==='http-live.json')continue;
 const a=JSON.parse(await fs.readFile(new URL(file,dir),'utf8'));
 if(a.client){const samples=a.server.filter(s=>a.client.some(c=>c.id===s.id));const stages={};for(const s of samples)for(const e of s.events){if(e.postResponse)continue;(stages[e.name]??=[]).push(e.ms);}
 out.http[file]={client:stats(a.client.map(s=>s.ms)),server:stats(samples.map(s=>s.ms)),statuses:a.client.reduce((m,s)=>(m[s.status]=(m[s.status]??0)+1,m),{}),bytes:[...new Set(a.client.map(s=>s.bytes))],stages:Object.fromEntries(Object.entries(stages).map(([k,v])=>[k,stats(v)])),requestDetails:samples.map(s=>{const io=union(s.events.filter(e=>['pool.acquire','driver.prepareExecute','driver.query'].includes(e.name)),s.ms);return {id:s.id,serverMs:s.ms,foregroundIoUnionMs:io,otherElapsedMs:round(s.ms-io),foregroundSql:s.events.filter(e=>e.name==='driver.prepareExecute'&&e.atMs<s.ms).length,postResponseEvents:s.events.filter(e=>e.postResponse).length};})};
 }
 if(a.samples){const events=a.samples.flatMap(s=>s.events);out.prisma[file]={total:stats(a.samples.map(s=>s.ms)),stages:Object.fromEntries([...new Set(events.map(e=>e.name))].map(n=>[n,stats(events.filter(e=>e.name===n).map(e=>e.ms))])),errors:events.filter(e=>e.error),connections:[...new Set(events.map(e=>e.connection).filter(Boolean))],pool:a.pool};}
 if(a.pairs){out.pairs={elapsed:stats(a.pairs.map(s=>s.ms)),acquire:stats(a.pairs.flatMap(s=>s.events.filter(e=>e.name==='pool.acquire').map(e=>e.ms))),errors:a.pairs.flatMap(s=>s.events.filter(e=>e.error)),queueSnapshots:a.pairs.flatMap(s=>s.events.filter(e=>e.name==='pool.acquire').map(e=>e.before.queued))};}
 if(file==='directo-exacto.json')for(const s of a.series){out.direct[s.name]=s.values?{first:s.first,driver:stats(s.values.map(v=>v.ms)),engine:stats(s.values.filter(v=>v.engine).map(v=>Number(v.engine.engineMs))),pairedUnseparated:stats(s.values.filter(v=>v.engine).map(v=>v.ms-Number(v.engine.engineMs))),before:s.before,after:s.after}:{driver:stats(s.driver),prisma:stats(s.prisma),acquire:stats(s.acquire),pairedPrismaMinusDriver:stats(s.prisma.map((v,i)=>v-s.driver[i]))};}
}
const paymentFiles=['http-cobranzas-final.json','http-cobranzas-extra-caliente.json'];
const hot=[],cold=[];
for(const file of paymentFiles){let a;try{a=JSON.parse(await fs.readFile(new URL(file,dir),'utf8'));}catch{continue;}for(const c of a.client){const s=a.server.find(s=>s.id===c.id);if(!s)continue;const n=s.events.filter(e=>e.name==='driver.prepareExecute'&&e.atMs<s.ms).length;(n===3?hot:cold).push({file,client:c,server:s,sql:n});}}
out.paymentCohorts={};for(const [name,rows] of [['catalogWarm',hot],['catalogReload',cold]]){const stage=n=>stats(rows.flatMap(r=>r.server.events.filter(e=>e.name===n&&!e.postResponse).map(e=>e.ms)));out.paymentCohorts[name]={sources:rows.map(r=>({file:r.file,id:r.client.id,sql:r.sql})),client:stats(rows.map(r=>r.client.ms)),server:stats(rows.map(r=>r.server.ms)),identity:stage('identity.findBySubject'),auth:stage('middleware.checkJwt'),business:stage('orderService.getPagedPaymentWorkspace')};}
await fs.writeFile(new URL('resumen.json',dir),JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify(out,null,2));

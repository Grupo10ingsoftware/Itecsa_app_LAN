import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../../docs/optimización/evidencia/optimizacion-conexiones-20261030');
const round=x=>+x.toFixed(3);
function stats(values){const v=values.filter(Number.isFinite).sort((a,b)=>a-b),n=v.length;return n?{n,medianMs:round((v[(n-1)>>1]+v[n>>1])/2),...(n>=20?{p95Ms:v[Math.ceil(n*.95)-1]}:{}),maxMs:v.at(-1)}:{n:0};}
const out={capturedAt:new Date().toISOString(),percentile:'nearest rank, only n>=20; empirical small sample',phases:{}};
for(const phase of ['before','cache','pool','audit']){
 const dir=path.join(root,phase),section={routes:{}};
 for(const name of ['users','payments','profile','select1']){
  const a=JSON.parse(await fs.readFile(path.join(dir,name+'.json'),'utf8')),samples=a.server??a.samples;
  const events=samples.flatMap(s=>s.events);
  const stage=n=>stats(events.filter(e=>e.name===n&&!e.postResponse).map(e=>e.ms));
  const audit=samples.map(s=>{const ac=s.events.find(e=>e.name==='pool.acquire'&&e.postResponse);const cmds=s.events.filter(e=>e.postResponse&&['driver.prepareExecute','driver.query'].includes(e.name));return ac&&cmds.length?Math.max(...cmds.map(e=>e.atMs+e.ms))-ac.atMs-ac.ms:null;}).filter(Number.isFinite);
  const observed=samples.map(s=>s.events.filter(e=>e.name==='driver.prepareExecute'&&!e.postResponse).length);
  section.routes[name]={client:stats((a.client??a.samples).map(s=>s.ms)),server:stats(samples.map(s=>s.ms)),statuses:a.client?.reduce((r,s)=>(r[s.status]=(r[s.status]??0)+1,r),{}),acquisition:stage('pool.acquire'),binaryDriver:stage('driver.prepareExecute'),execute:stage('driver.executePromise'),identity:stage('identity.findBySubject'),auth:stage('middleware.checkJwt'),auditConnectionUntilLastCommand:stats(audit),pings:events.filter(e=>e.name==='driver.ping'&&!e.postResponse).length,errors:events.filter(e=>e.error).map(e=>({name:e.name,code:e.error})),observedSqlPerRequest:observed,driverTraceComplete:observed.every(n=>n===({users:3,payments:3,profile:2,select1:1}[name])),postCommands:events.filter(e=>e.postResponse&&['driver.prepareExecute','driver.query'].includes(e.name)).reduce((r,e)=>(r[e.kind]=(r[e.kind]??0)+1,r),{})};
 }
 const cfg=JSON.parse(await fs.readFile(path.join(dir,'config.json'),'utf8'));section.configuration=cfg;
 const sessions=JSON.parse(await fs.readFile(path.join(dir,'sessions.json'),'utf8')).sessions;
 section.survivingSessionCounters={connections:new Set(sessions.map(s=>s.connection)).size,prepare:sessions.reduce((n,s)=>n+s.counters.Com_stmt_prepare,0),execute:sessions.reduce((n,s)=>n+s.counters.Com_stmt_execute,0),close:sessions.reduce((n,s)=>n+s.counters.Com_stmt_close,0),preparedRetained:sessions.every(s=>s.serverPrepared!==undefined)?sessions.reduce((n,s)=>n+(s.serverPrepared??0),0):null};
 out.phases[phase]=section;
}
out.httpImprovement={};for(const route of ['users','payments','profile']){const a=out.phases.before.routes[route].client,b=out.phases.audit.routes[route].client;out.httpImprovement[route]={before:a,after:b,observedMedianReductionPercent:round(100*(a.medianMs-b.medianMs)/a.medianMs)};}
const extra=JSON.parse(await fs.readFile(path.join(root,'final/idle-concurrency-audit.json'),'utf8'));
out.concurrent={client:stats(extra.concurrent.client.map(s=>s.ms)),statuses:extra.concurrent.client.reduce((r,s)=>(r[s.status]=(r[s.status]??0)+1,r),{}),maxActive:Math.max(...extra.concurrent.parallelWindow.events.filter(e=>e.name==='pool.acquire').map(e=>e.after.active)),maxQueue:Math.max(...extra.concurrent.parallelWindow.events.filter(e=>e.name==='pool.acquire').map(e=>e.before.queued))};
out.idle=extra.idle.map(s=>({pauseMs:s.idleMs,http:s.trace.client[0].ms,status:s.trace.client[0].status,pings:s.trace.server.flatMap(s=>s.events.filter(e=>e.name==='driver.ping'&&!e.postResponse)).map(e=>e.ms)}));
out.auditsVerified=extra.persistedAudit;
await fs.writeFile(path.join(root,'summary.json'),JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({improvement:out.httpImprovement,stages:Object.fromEntries(Object.entries(out.phases).map(([p,s])=>[p,{select1:s.routes.select1.client,users:s.routes.users.client,payments:s.routes.payments.client,profile:s.routes.profile.client,auditUsers:s.routes.users.auditConnectionUntilLastCommand,counters:s.survivingSessionCounters,errors:Object.values(s.routes).flatMap(r=>r.errors)}])),concurrent:out.concurrent},null,2));

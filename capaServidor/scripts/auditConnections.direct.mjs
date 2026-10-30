// Complementary, bounded read-only experiments; never a replacement for real HTTP.
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import tls from 'node:tls';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import dotenv from 'dotenv';
import mariadb from 'mariadb';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { resolveDatabaseConnection,createStrictTlsOptions } from '../src/database/connectionConfig.js';
import { readPaymentCounts } from '../src/modules/orders/repo/paymentWorkspaceRead.repo.js';
import { KeycloakManagementService } from '../src/modules/users/service/keycloakManagement.service.js';
dotenv.config({path:new URL('../.env',import.meta.url),quiet:true});
if(!process.argv.includes('--allow-aiven-reads'))throw Error('READ_OPT_IN_REQUIRED');
const cfg=resolveDatabaseConnection();
if(process.env.APP_ENV!=='development'||!cfg.host.endsWith('.aivencloud.com')||cfg.sslMode!=='required')throw Error('UNEXPECTED_TARGET');
const options={host:cfg.host,port:cfg.port,user:cfg.user,password:cfg.password,database:cfg.database,
 connectTimeout:Number(process.env.DB_CONNECT_TIMEOUT_MS??8000),socketTimeout:Number(process.env.DB_QUERY_TIMEOUT_MS??15000),ssl:createStrictTlsOptions(cfg.host,cfg.ca),prepareCacheLength:0};
const out={capturedAt:new Date().toISOString(),node:process.version,commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
 scope:'complementary direct real services; no business writes',engineCorrelation:'own THREAD_ID and exact SQL_TEXT equality; null means not observable',targetHash:createHash('sha256').update(cfg.host+':'+cfg.port+'/'+cfg.database).digest('hex'),cold:[],series:[],keycloak:[],errors:[]};
const outputArg=process.argv.find(a=>a.startsWith('--output='))?.slice('--output='.length);
const round=x=>+x.toFixed(3),target=outputArg?path.resolve(outputArg):new URL('../../docs/optimización/evidencia/conexiones-20261030/directo-exacto.json',import.meta.url);
// Claim a NEW evidence file before opening connections. Incremental saves below
// update only the file created by this invocation; never overwrite an earlier run.
await fs.writeFile(target,JSON.stringify(out,null,2)+'\n',{flag:'wx'});
let current;
const nativeNet=net.connect,nativeTls=tls.connect;
net.connect=function(...a){const start=performance.now(),sample=current;const sock=nativeNet.apply(this,a);sock.once('lookup',()=>{if(sample)sample.dnsMs=round(performance.now()-start)});sock.once('connect',()=>{if(sample)sample.tcpFromStartMs=round(performance.now()-start)});return sock;};
tls.connect=function(...a){const start=performance.now(),sample=current,sock=nativeTls.apply(this,a);sock.once('secureConnect',()=>{if(sample){sample.tlsMs=round(performance.now()-start);sample.authorized=sock.authorized;sample.tlsProtocol=sock.getProtocol();}});return sock;};
const save=()=>fs.writeFile(target,JSON.stringify(out,(_k,v)=>typeof v==='bigint'?Number(v):v,2)+'\n');
let sqlObject;await readPaymentCounts({$queryRaw:async q=>{sqlObject=q;return [];}},{});
const baseSql=sqlObject.sql,values=sqlObject.values;
let pool,db;
try {
 for(let i=0;i<3;i++){
  const row={sample:i},start=performance.now();current=row;let c;
  try{c=await mariadb.createConnection(options);row.connectTotalMs=round(performance.now()-start);current=undefined;const t=performance.now();await c.query('SELECT 1');row.firstTextQueryMs=round(performance.now()-t);if(i===0){const [v]=await c.query('SELECT VERSION() AS version,@@transaction_isolation AS isolationLevel,@@require_secure_transport AS secureTransport');out.mysql=v;}}finally{current=undefined;await c?.end();}out.cold.push(row);
 }
 for(const cache of [0,16]){
  const c=await mariadb.createConnection({...options,prepareCacheLength:cache});
  try{
   await c.query('SET SESSION TRANSACTION READ ONLY');
   const [thread]=await c.query('SELECT THREAD_ID AS id FROM performance_schema.threads WHERE PROCESSLIST_ID=CONNECTION_ID()');
   const counters=async()=>Object.fromEntries((await c.query("SHOW SESSION STATUS WHERE Variable_name IN ('Com_stmt_prepare','Com_stmt_execute','Com_stmt_close')")).map(r=>[r.Variable_name,Number(r.Value)]));
   for(const mode of (cache===0?['query','execute']:['execute'])){
    const marker='ITECSA_CONN_AUDIT_'+cache+'_'+mode,sql=baseSql+' /*'+marker+'*/';
    const series={name:'dedicated_count_'+mode+'_cache'+cache,n:20,first:null,values:[],before:await counters()};
    const run=async()=>{const start=performance.now();await c[mode](sql,values);const ms=round(performance.now()-start);const [e]=await c.query(`SELECT EVENT_ID AS eventId,EVENT_NAME AS eventName,TIMER_WAIT/1000000000 AS engineMs,LOCK_TIME/1000000000 AS lockMs,ROWS_EXAMINED AS rowsExamined,ROWS_SENT AS rowsSent FROM performance_schema.events_statements_history WHERE THREAD_ID=? AND SQL_TEXT=? ORDER BY EVENT_ID DESC LIMIT 1`,[thread.id,sql]);return {ms,engine:e??null};};
    series.first=await run();for(let i=0;i<20;i++)series.values.push(await run());series.after=await counters();out.series.push(series);await save();console.log(JSON.stringify({series:series.name,n:20}));
   }
  }finally{await c.end();}
 }
 // Same destination, SQL, parameters and single reused pool; Prisma adds its own conversion layer.
 pool=mariadb.createPool({...options,connectionLimit:1,minimumIdle:1});
 db=new PrismaClient({adapter:new PrismaMariaDb(pool)});
 await db.$queryRawUnsafe('SELECT 1');
 const comparison={name:'same_pool_driver_vs_prisma',n:20,driver:[],prisma:[],acquire:[]};
 for(let i=0;i<20;i++){
  let start=performance.now();const c=await pool.getConnection();comparison.acquire.push(round(performance.now()-start));
  start=performance.now();await c.execute(baseSql,values);comparison.driver.push(round(performance.now()-start));await c.release();
  start=performance.now();await db.$queryRawUnsafe(baseSql,...values);comparison.prisma.push(round(performance.now()-start));
 }out.series.push(comparison);await db.$disconnect();db=undefined;await pool.end();pool=undefined;
 // Public identity reads and an existing service-account token; no user administration mutations.
 const management=new KeycloakManagementService();
 let start=performance.now();await management.token();out.keycloak.push({name:'admin_token_first',ms:round(performance.now()-start),n:1});
 for(const name of ['cached_admin_token','jwks']){
  const series={name,n:20,values:[]};
  for(let i=0;i<20;i++){start=performance.now();if(name==='cached_admin_token')await management.token();else {const r=await fetch(process.env.KEYCLOAK_JWKS_URI,{signal:AbortSignal.timeout(8000),redirect:'error'});if(!r.ok)throw Error('JWKS_HTTP_'+r.status);await r.arrayBuffer();}series.values.push(round(performance.now()-start));}
  out.keycloak.push(series);
 }
 // TCP to local forwarding endpoint is NOT TCP end-to-end to Keycloak.
 out.keycloakTcp=[];for(let i=0;i<3;i++){const u=new URL(process.env.KEYCLOAK_ISSUER),t=performance.now();await new Promise((ok,no)=>{const s=net.connect(Number(u.port),u.hostname);s.once('connect',()=>{out.keycloakTcp.push(round(performance.now()-t));s.destroy();ok();});s.once('error',no);s.setTimeout(5000,()=>s.destroy(Error('TIMEOUT')));});}
}catch(e){out.errors.push({stage:'direct',code:e.code??e.name});}
finally{current=undefined;net.connect=nativeNet;tls.connect=nativeTls;await db?.$disconnect().catch(()=>{});await pool?.end().catch(()=>{});await save();console.log(JSON.stringify({saved:true,series:out.series.length,errors:out.errors}));}

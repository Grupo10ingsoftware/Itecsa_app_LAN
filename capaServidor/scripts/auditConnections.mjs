// Business read diagnostics; normal security auditing stays active.
// No SQL values, credentials, bodies or tokens in output.
import fs from 'node:fs/promises';
const origin = 'http://127.0.0.1:9229';
const targets = await (await fetch(origin + '/json/list')).json();
const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let seq = 0;
const pending = new Map();
ws.onmessage = event => { const data = JSON.parse(event.data); if (data.id) { const p = pending.get(data.id); pending.delete(data.id); data.error ? p.reject(Error(data.error.message)) : p.resolve(data.result); } };
async function evaluate(expression) {
  const result = await new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } })); });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description?.split('\n')[0] ?? 'TARGET_EVALUATION_FAILED');
  return result.result.value;
}
const mode = process.argv[2] ?? 'probe';
try {
  if(mode==='close-inspector') console.log(JSON.stringify(await evaluate("(setTimeout(()=>process.getBuiltinModule('inspector').close(),100),{closing:true})")));
  else if(mode==='verify-restored') {
    const value=await evaluate(`(()=>{const req=process.getBuiltinModule('module').createRequire(process.cwd()+'/package.json');const server=process._getActiveHandles().find(h=>h.constructor.name==='Server'&&h.address()?.port===Number(process.env.PORT)),throttle=req('./src/modules/security/service/securityThrottle.service.js').default;const removed=[];for(const [o,k]of [[server,'emit'],[throttle,'consume']])if(Object.hasOwn(o,k)&&o[k]===Object.getPrototypeOf(o)[k]){delete o[k];removed.push(k);}const cp=req('./node_modules/mariadb/lib/connection.js').default.prototype,pp=req('./node_modules/mariadb/lib/pool.js').default.prototype;return {diagnosticGlobalPresent:Object.hasOwn(globalThis,'__connectionAudit'),poolGlobalPresent:Object.hasOwn(globalThis,'__auditPool'),originalMethodsRestored:server.emit===Object.getPrototypeOf(server).emit&&throttle.consume===Object.getPrototypeOf(throttle).consume,driverMethodsRestored:['connect','socketTimeoutReached','query','prepareExecute','executePromise','ping'].every(k=>cp[k].name===k)&&pp.getConnection.name==='getConnection',legacyOwnShadowsRemoved:removed,pid:process.pid};})()`);
    if(process.argv[3])await fs.writeFile(process.argv[3],JSON.stringify(value,null,2)+'\n',{flag:'wx'});else console.log(JSON.stringify(value));
  }
  else if (['status','config','cleanup','health','prisma','users','payments','profile','concurrent','pool-pairs','take'].includes(mode)) {
    const n=Number(process.argv.find(a=>a.startsWith('--samples='))?.split('=')[1]??20);if(!Number.isInteger(n)||n<1||n>30)throw Error('INVALID_SAMPLE_BOUND');
    const expr = {status:'status()',config:'config()',cleanup:'cleanup()',take:'take()',health:`measure('/api/health/live',${n})`,prisma:`direct('active-prisma-select1','SELECT 1 AS ok',${n})`,users:`measure('/api/admin/identity/users?page=1&perPage=10',${n})`,payments:`measure('/api/orders/payments?status=Pendiente&page=1&limit=10',${n})`,profile:`measure('/api/auth/profile',${n})`,concurrent:"measure('/api/orders/payments?status=Pendiente&page=1&limit=10',10,2)",'pool-pairs':'concurrencyProbe()'}[mode];
    const value = await evaluate('globalThis.__connectionAudit.' + expr);
    if(process.argv[3]) { await fs.writeFile(process.argv[3],JSON.stringify(value,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({mode,saved:true,samples:value.client?.length??value.samples?.length})); }
    else console.log(JSON.stringify(value,null,2));
  }
  else if (mode === 'probe') console.log(JSON.stringify(await evaluate(`(async()=>{const req=process.getBuiltinModule('module').createRequire(process.cwd()+'/package.json');const m=req('./src/database/prisma.js');const p=m.getPrismaClient();return {pid:process.pid,node:process.version,cwd:process.cwd(),env:Object.fromEntries(['DOTENV_PATH','APP_ENV','NODE_ENV','PORT','FRONTEND_ORIGIN','AUTH_PROVIDER','KEYCLOAK_ISSUER','KEYCLOAK_JWKS_URI','KEYCLOAK_ADMIN_TRANSPORT_ORIGIN','DB_SSL_MODE','DB_CONNECT_TIMEOUT_MS','DB_QUERY_TIMEOUT_MS','IDENTITY_PREPARATION_ENABLED','HTTP_REQUEST_TIMEOUT_MS','HTTP_HEADERS_TIMEOUT_MS','HTTP_KEEP_ALIVE_TIMEOUT_MS'].map(k=>[k,process.env[k]??null])),prismaKeys:Object.keys(p),engineKeys:Object.keys(p._engine??{})}})()`),null,2));
  else if (mode === 'eval-file') {
    const source = await fs.readFile(process.argv[3], 'utf8');
    const evidenceRoot=process.argv.find(a=>a.startsWith('--evidence-root='))?.slice('--evidence-root='.length);
    if(evidenceRoot)await evaluate('globalThis.__connectionAudit.evidenceRoot='+JSON.stringify(evidenceRoot));
    const result = await evaluate(source);
    if (process.argv[4]) await fs.writeFile(process.argv[4], JSON.stringify(result,null,2)+'\n',{flag:'wx'});
    else console.log(JSON.stringify(result,null,2));
  }
} finally { ws.close(); }

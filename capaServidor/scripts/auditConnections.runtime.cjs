(async () => {
  if (globalThis.__connectionAudit) return { installed: true, reused: true };
  const req = process.getBuiltinModule('module').createRequire(process.cwd() + '/package.json');
  const { AsyncLocalStorage } = req('node:async_hooks');
  const als = new AsyncLocalStorage(), undo = [], samples = [], pools = new Set(), seen = new Map();
  let bearer, counter = 0, current, deadline;
  const scope = () => als.getStore() ?? current;
  const round = x => +x.toFixed(3);
  const snap = p => ({ total: p.totalConnections(), active: p.activeConnections(), idle: p.idleConnections(), queued: p.taskQueueSize() });
  const push = (s, name, start, extra = {}) => { if (s) s.events.push({ name, atMs: round(start - s.start), ms: round(performance.now() - start), ...extra }); };
  function patch(obj, name, factory) { const old = obj[name], descriptor=Object.getOwnPropertyDescriptor(obj,name); obj[name] = factory(old); undo.push(() => { if(descriptor)Object.defineProperty(obj,name,descriptor);else delete obj[name]; }); }
  try {
  const Pool = req('./node_modules/mariadb/lib/pool.js').default;
  const Conn = req('./node_modules/mariadb/lib/connection.js').default;
  patch(Pool.prototype, 'getConnection', old => function (param, cb) {
    if (typeof param === 'function') { cb = param; param = {}; }
    pools.add(this);
    const s = scope(), start = performance.now(), before = snap(this);
    return old.call(this, param, (err, conn) => {
      let connection = null;
      if (conn) { if (!seen.has(conn)) seen.set(conn, ++counter); connection = seen.get(conn); }
      push(s, 'pool.acquire', start, { before, after: snap(this), connection, error: err?.code ?? null });
      cb(err, conn);
    });
  });
  for (const name of ['query', 'prepare', 'prepareExecute', 'executePromise', 'ping']) {
    patch(Conn.prototype, name, old => function (...args) {
      const s = scope(), start = performance.now();
      // These internal APIs end in resolve/reject callbacks; executePromise has a prepare argument.
      const ri = name === 'executePromise' ? 2 : 1, ji = ri + 1;
      if (!s || typeof args[ri] !== 'function' || typeof args[ji] !== 'function') return old.apply(this, args);
      const conn = this;
      if (!seen.has(conn)) seen.set(conn, ++counter);
      const sql = typeof args[0]?.sql === 'string' ? args[0].sql : '';
      const kind = sql.trim().split(/\s+/)[0]?.toUpperCase() ?? '';
      const shape = req('node:crypto').createHash('sha256').update(sql).digest('hex').slice(0,12);
      const resolve = args[ri], reject = args[ji];
      args[ri] = function (...values) { push(s, 'driver.' + name, start, { connection: seen.get(conn), kind, shape }); return resolve(...values); };
      args[ji] = function (error) { push(s, 'driver.' + name, start, { connection: seen.get(conn), kind, shape, error: error?.code ?? 'ERROR' }); return reject(error); };
      return old.apply(this, args);
    });
  }
  patch(Pool.prototype, '_handleRelease', old => function (conn, cb) {
    const s = scope(), start = performance.now();
    return old.call(this, conn, (...args) => { push(s, 'pool.release', start, { after: snap(this) }); return cb?.(...args); });
  });
  function method(obj, name, label) {
    if (typeof obj[name] !== 'function') return;
    patch(obj, name, old => async function (...args) {
      const s = als.getStore(), start = performance.now();
      try { return await old.apply(this,args); } finally { push(s,label+'.'+name,start); }
    });
  }
  const UserRepo = req('./src/modules/users/repo/users.repo.js').UserRepository;
  for (const name of ['findBySubject','activateOnFirstAccess']) method(UserRepo.prototype,name,'identity');
  const Admin = req('./src/modules/users/service/keycloakIdentityAdministration.service.js').KeycloakIdentityAdministrationService;
  for (const name of ['authorize','list','summary','inspect']) method(Admin.prototype,name,'adminService');
  const AdminRepo = req('./src/modules/users/repo/keycloakIdentity.repo.js').KeycloakIdentityRepository;
  for (const name of ['actor','list','summary','binding']) method(AdminRepo.prototype,name,'adminRepo');
  const OrderService = req('./src/modules/orders/service/order.service.js').default;
  for (const name of ['getPaymentWorkspace','getPagedPaymentWorkspace']) method(OrderService.prototype,name,'orderService');
  const throttle = req('./src/modules/security/service/securityThrottle.service.js').default;
  method(throttle,'consume','throttle');
  const management = req('./src/modules/users/service/keycloakManagement.service.js').KeycloakManagementService;
  for (const name of ['transport','token','getUser','roles','roleClient']) method(management.prototype,name,'keycloak');
  const server = process._getActiveHandles().find(h => h.constructor.name === 'Server' && h.address()?.port === Number(process.env.PORT));
  if (!server) { undo.reverse().forEach(f=>f()); throw Error('API_SERVER_NOT_FOUND'); }
  const app = server.listeners('request')[0];
  const layers = [];
  function walk(stack) {
    for (const layer of stack ?? []) {
      const fn = layer.handle;
      if (fn?.stack) walk(fn.stack);
      if (layer.route?.stack) walk(layer.route.stack);
      if (['checkJwt','requireAdministrativeRole','requireCapabilityMiddleware'].includes(fn?.name) || (typeof fn==='function' && fn.length===3 && !fn.stack && !layer.route && !fn.name)) {
        layers.push(fn.name);
        patch(layer,'handle',old=>function(r,res,next){ const s=als.getStore(),start=performance.now();let done=false;const end=()=>{if(!done){done=true;push(s,'middleware.'+(old.name||'anonymous-local'),start);res.off('finish',end);}};res.once('finish',end);return old(r,res,(...a)=>{end();next(...a);}); });
      }
    }
  }
  walk(app.router?.stack);
  const allowed = new Set(['/api/admin/identity/users','/api/orders/payments','/api/auth/profile','/api/health/live']);
  patch(server,'emit',old=>function(event,...args){
    if(event!=='request') return old.call(this,event,...args);
    const [r,res]=args, route=r.url.split('?')[0];
    if (!allowed.has(route) || r.method!=='GET') return old.call(this,event,...args);
    // A real successful user request can lend its existing session only in memory.
    const credential=r.headers.authorization;
    res.once('finish',()=>{if(res.statusCode===200&&credential?.startsWith('Bearer '))bearer=credential;});
    if(!r.headers['x-itecsa-audit']) return old.call(this,event,...args);
    const s={id:r.headers['x-itecsa-audit'],route,start:performance.now(),events:[]};
    current = s;
    return als.run(s,()=>{
      res.once('finish',()=>{s.ms=round(performance.now()-s.start);s.status=res.statusCode;samples.push(s);});
      return old.call(this,event,...args);
    });
  });
  globalThis.__connectionAudit={
    status:()=>({sessionAvailable:!!bearer,pid:process.pid,pools:[...pools].map(snap),middlewareLayers:layers}),
    async measure(route,n=20,concurrency=1){
      if(!allowed.has(route.split('?')[0])||n>30||concurrency>2)throw Error('AUDIT_BOUNDS');
      if(route!=='/api/health/live'&&!bearer)throw Error('NO_EXISTING_SESSION');
      const drainUntil=performance.now()+5000;while([...pools].some(p=>p.activeConnections()>0)&&performance.now()<drainUntil)await new Promise(ok=>setTimeout(ok,25));current=undefined;
      const result=[];
      const one=async i=>{const id='audit-'+route.split('/').at(-1)+'-'+Date.now()+'-'+i;const start=performance.now();const res=await fetch('http://127.0.0.1:'+process.env.PORT+route,{headers:{...(bearer?{authorization:bearer}:{}),'x-itecsa-audit':id},signal:AbortSignal.timeout(30000)});const bytes=(await res.arrayBuffer()).byteLength;result.push({id,ms:round(performance.now()-start),status:res.status,bytes});if(concurrency===1){const end=performance.now()+5000;while([...pools].some(p=>p.activeConnections()>0)&&performance.now()<end)await new Promise(ok=>setTimeout(ok,25));current=undefined;}};
      for(let i=0;i<n;i+=concurrency)await Promise.all(Array.from({length:Math.min(concurrency,n-i)},(_,j)=>one(i+j)));
      return {client:result,server:samples.splice(0).map(({start,...s})=>({...s,events:s.events.map(e=>({...e,postResponse:e.atMs>=s.ms}))})),pool:[...pools].map(snap),correlation:concurrency===1?'serialized; post-response audit drained before next request':'concurrent driver events not attributable per request; use aggregate only'};
    },
    take:()=>samples.splice(0).map(({start,...s})=>({...s,events:s.events.map(e=>({...e,postResponse:e.atMs>=s.ms}))})),
    async direct(label,sql,n=20){
      if(!/^SELECT\b/i.test(sql)||n>30)throw Error('READ_ONLY_BOUND');
      const p=req('./src/database/prisma.js').getPrismaClient();const result=[];
      for(let i=0;i<n;i++){const s={id:label+'-'+i,start:performance.now(),events:[]};current=s;try{await als.run(s,()=>p.$queryRawUnsafe(sql));}finally{current=undefined;}s.ms=round(performance.now()-s.start);delete s.start;result.push(s);}
      return {samples:result,pool:[...pools].map(snap)};
    },
    async concurrencyProbe(){
      const p=req('./src/database/prisma.js').getPrismaClient(),result=[];
      for(let i=0;i<10;i++){const s={id:'pair-'+i,start:performance.now(),events:[]};current=s;try{await als.run(s,()=>Promise.all([p.$queryRawUnsafe('SELECT 1 AS ok'),p.$queryRawUnsafe('SELECT 1 AS ok')]));}finally{current=undefined;}s.ms=round(performance.now()-s.start);delete s.start;result.push(s);}
      return {pairs:result,pool:[...pools].map(snap),correlation:'events grouped by simultaneous pair, not individual SQL request'};
    },
    config:()=>({pools:[...pools].map(p=>({state:snap(p),options:Object.fromEntries(['connectionLimit','minimumIdle','acquireTimeout','idleTimeout','initializationTimeout','minDelayValidation','pingTimeout','resetAfterUse','noControlAfterUse','leakDetectionTimeout'].map(k=>[k,p.opts[k]])),connectionOptions:Object.fromEntries(['connectTimeout','socketTimeout','prepareCacheLength','pipelining','keepAliveDelay'].map(k=>[k,p.opts.connOptions[k]])),tls:p.opts.connOptions.ssl?.rejectUnauthorized===true})),server:{requestTimeout:server.requestTimeout,headersTimeout:server.headersTimeout,keepAliveTimeout:server.keepAliveTimeout},clientVersion:req('@prisma/client/package.json').version,adapterVersion:req('./node_modules/@prisma/adapter-mariadb/package.json').version,driverVersion:req('./node_modules/mariadb/package.json').version}),
    cleanup(){clearTimeout(deadline);bearer=undefined;current=undefined;undo.reverse().forEach(f=>f());delete globalThis.__connectionAudit;delete globalThis.__auditPool;return {restored:true};}
  };
  deadline=setTimeout(()=>globalThis.__connectionAudit?.cleanup(),15*60*1000);deadline.unref();
  return globalThis.__connectionAudit.status();
  } catch(error) { undo.reverse().forEach(f=>f());delete globalThis.__connectionAudit;throw error; }
})()

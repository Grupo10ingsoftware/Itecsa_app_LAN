(async()=>{
 const req=process.getBuiltinModule('module').createRequire(process.cwd()+'/package.json');
 const db=req('./src/database/prisma.js').getPrismaClient(),assert=req('node:assert/strict');
 const out={capturedAt:new Date().toISOString(),idle:[]};
 for(const idleMs of [1000,6000,6000]){
  await new Promise(ok=>setTimeout(ok,idleMs));
  const trace=await globalThis.__connectionAudit.measure('/api/auth/profile',1);
  assert.equal(trace.client[0].status,200);out.idle.push({idleMs,trace});
 }
 out.concurrent=await globalThis.__connectionAudit.measure('/api/orders/payments?status=Pendiente&page=1&limit=10',20,2);
 assert.ok(out.concurrent.client.every(s=>s.status===200));
 const fs=req('node:fs'),path=req('node:path');
 const auditRoot=globalThis.__connectionAudit.evidenceRoot?path.join(globalThis.__connectionAudit.evidenceRoot,'audit'):path.resolve('../docs/optimización/evidencia/optimizacion-conexiones-20261030/audit');
 const ids=['users','payments','profile'].flatMap(name=>JSON.parse(fs.readFileSync(path.join(auditRoot,name+'.json'),'utf8')).server.map(s=>s.requestId));
 assert.equal(ids.length,60);assert.ok(ids.every(Boolean));
 const rows=await db.securityAuditEvent.groupBy({by:['request_id'],where:{request_id:{in:ids},event_type:'support.request'},_count:{_all:true}});
 assert.equal(rows.length,60);assert.ok(rows.every(r=>r._count._all===1));
 out.persistedAudit={expected:60,found:rows.length,exactlyOnePerRequest:true};
 return out;
})()

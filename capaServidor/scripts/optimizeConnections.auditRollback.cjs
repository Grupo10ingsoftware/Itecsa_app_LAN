(async()=>{
 const req=process.getBuiltinModule('module').createRequire(process.cwd()+'/package.json'),assert=req('node:assert/strict');
 const db=req('./src/database/prisma.js').getPrismaClient(),Repo=req('./src/modules/security/repo/securityAudit.repo.js').default;
 const out={capturedAt:new Date().toISOString(),checks:[]};
 for(const returnRecord of [false,true]){
  const requestId=req('node:crypto').randomUUID(),sentinel=Error('DIAGNOSTIC_ROLLBACK');
  const event={eventType:'diagnostic.rollback',actorUserId:null,action:'rollback-test',resourceType:'diagnostic',resourceId:requestId,requestId,outcome:'test'};
  try{await db.$transaction(async tx=>{
   const result=await new Repo({prisma:tx}).record(event,{returnRecord});
   if(returnRecord)assert.equal(typeof result.id_security_audit_event,'bigint');else assert.equal(result,undefined);
   assert.equal(await tx.securityAuditEvent.count({where:{request_id:requestId}}),1);
   throw sentinel;
  });throw Error('ROLLBACK_NOT_PROPAGATED');}catch(e){if(e!==sentinel)throw e;}
  assert.equal(await db.securityAuditEvent.count({where:{request_id:requestId}}),0);
  out.checks.push({returnRecord,insertedInTransaction:1,persistedAfterRollback:0,pass:true});
 }
 return out;
})()

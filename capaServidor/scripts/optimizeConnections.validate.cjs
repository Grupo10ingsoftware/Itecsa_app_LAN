(async()=>{
 const req=process.getBuiltinModule('module').createRequire(process.cwd()+'/package.json');
 const assert=req('node:assert/strict'),db=req('./src/database/prisma.js').getPrismaClient();
 const out={capturedAt:new Date().toISOString(),checks:[],errors:[]};
 const sql=`SELECT CAST(? AS SIGNED) AS signedValue,CAST(? AS DECIMAL(20,4)) AS decimalValue,
   CAST(? AS UNSIGNED) AS bigValue,CAST(? AS DATETIME(3)) AS dateValue,? AS nullableValue,? AS textValue`;
 const values=[-7,'123456789012345.6789','9007199254740993','2026-10-30 12:34:56.123',null,"á prueba '; SELECT 99; --"];
 function verify(row,expected=values){assert.equal(Number(row.signedValue),expected[0]);assert.equal(row.decimalValue.toFixed(4),expected[1]);assert.equal(row.bigValue,BigInt(expected[2]));assert.equal(row.dateValue.toISOString(),'2026-10-30T12:34:56.123Z');assert.equal(row.nullableValue,expected[4]);assert.equal(row.textValue,expected[5]);}
 for(let i=0;i<20;i++){const params=[...values];params[0]=-7-i;params[1]=i%2?'0.0001':values[1];params[2]=String(BigInt(values[2])+BigInt(i));params[4]=i%2?null:'present';params[5]+=' '+i;verify((await db.$queryRawUnsafe(sql,...params))[0],params);}
 out.checks.push({name:'real_api_prisma_binary_types_and_bound_parameters',repetitions:20,pass:true});
 const sentinel=Error('EXPECTED_READ_ONLY_ROLLBACK');
 try{await db.$transaction(async tx=>{verify((await tx.$queryRawUnsafe(sql,...values))[0]);throw sentinel;});throw Error('ROLLBACK_DID_NOT_PROPAGATE');}catch(e){if(e!==sentinel)throw e;}
 verify((await db.$queryRawUnsafe(sql,...values))[0]);
 out.checks.push({name:'real_interactive_transaction_rollback_propagates_then_connection_reusable',pass:true});
 const t=performance.now();
 await db.$transaction(async tx=>{
  for(let i=0;i<40;i++){const [r]=await tx.$queryRawUnsafe('SELECT CAST(? AS SIGNED) AS probe_'+i,i);assert.equal(Number(r['probe_'+i]),i);}
  verify((await tx.$queryRawUnsafe(sql,...values))[0]);
  const [r]=await tx.$queryRawUnsafe('SELECT COUNT(*) AS n FROM performance_schema.prepared_statements_instances WHERE OWNER_THREAD_ID=(SELECT THREAD_ID FROM performance_schema.threads WHERE PROCESSLIST_ID=CONNECTION_ID())');
  out.sessionPreparedAfterEviction=Number(r.n);assert.ok(Number(r.n)<=33);
 },{maxWait:10000,timeout:60000});
 out.checks.push({name:'40_shapes_evict_bounded_cache_and_read_only_commit',ms:+(performance.now()-t).toFixed(3),diagnosticTransactionTimeoutMs:60000,pass:true});
 const fault=await globalThis.__connectionAudit.recoveryProbe();out.checks.push(fault);
 return out;
})()

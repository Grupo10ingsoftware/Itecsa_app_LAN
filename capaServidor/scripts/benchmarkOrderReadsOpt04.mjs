// Development SELECT/EXPLAIN only. Does not invoke lookup observation or POST.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { resolveDatabaseConnection, createStrictTlsOptions } from '../src/database/connectionConfig.js';
import OrderRepository from '../src/modules/orders/repo/orders.repo.js';
import ProductTypeService from '../src/modules/products/service/product.service.js';
import ProductTypeRepo from '../src/modules/products/repo/product.repo.js';
import { toOrderCreatedDTO } from '../src/modules/orders/dto/order.dto.js';
import { creationRecipientsQuery } from '../src/modules/orders/repo/orderCreationOperations.js';
import { ROLES } from '../src/config/roles.js';
const arg=n=>process.argv.find(a=>a.startsWith(`--${n}=`))?.slice(n.length+3);
if(process.env.APP_ENV!=='development'||!process.argv.includes('--allow-development-reads'))throw Error('Explicit development reads required');
const c=resolveDatabaseConnection();
const db=new PrismaClient({adapter:new PrismaMariaDb({host:c.host,port:c.port,user:c.user,password:c.password,database:c.database,connectionLimit:10,connectTimeout:8000,socketTimeout:15000,...(c.sslMode==='required'?{ssl:createStrictTlsOptions(c.host,c.ca)}:{})}),log:[{emit:'event',level:'query'}]});
let queries=[];const plans=new Map();db.$on('query',e=>{if(/^\s*SELECT/i.test(e.query))queries.push({sql:e.query,driverMs:e.duration});});
const client=new Proxy(db,{get(target,key){if(key==='$queryRaw')return(input,...v)=>{const q=Array.isArray(input)?Prisma.sql(input,...v):input;if(!q.sql.includes('information_schema'))plans.set(q.sql,q);return target.$queryRaw(q);};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
const repo=new OrderRepository({prisma:client}),products=new ProductTypeService({repo:new ProductTypeRepo({prisma:db})});
const output={reference:'0be21bb',capturedAt:new Date().toISOString(),node:process.version,methodology:'5 warm sequential samples, 250ms pauses; development reads only. Final hydration is an existing-order stage proxy, NOT creation/transaction/HTTP/E2E. No business/security writes.',samples:{},equivalence:[],explain:[]};
async function measure(name,work){await work();const samples=[];let sql;for(let i=0;i<5;i++){queries=[];const t=performance.now();const value=await work();samples.push({ms:+(performance.now()-t).toFixed(3),selects:queries.length,bytes:Buffer.byteLength(JSON.stringify(value)),driverMs:queries.map(q=>q.driverMs)});sql=[...new Set(queries.map(q=>q.sql))];await new Promise(r=>setTimeout(r,250));}output.samples[name]={medianMs:samples.map(s=>s.ms).sort((a,b)=>a-b)[2],samples,sql};console.error(name,output.samples[name].medianMs);}
try{
 const fixture=await db.pedidos.findFirst({where:{numero_nota_venta:{not:null}},select:{id_pedido:true,numero_nota_venta:true},orderBy:{id_pedido:'desc'}});
 if(!fixture)throw Object.assign(Error(),{code:'NO_ORDER_FIXTURE'});
 const full=await repo.get(fixture.id_pedido);const expected=toOrderCreatedDTO(full);
 await measure('duplicate_lookup',()=>repo.existsBySalesNoteNumber(fixture.numero_nota_venta));
 await measure('final_hydration_stage_before',()=>repo.get(fixture.id_pedido));
 await measure('receipt_projection_only',()=>toOrderCreatedDTO({id_pedido:fixture.id_pedido,numero_nota_venta:fixture.numero_nota_venta}));
 assert.deepEqual(toOrderCreatedDTO(fixture),expected);output.equivalence.push({operation:'public creation DTO projection',equal:true});
 for(const name of ['Yoyo','Lanyard','Tarjeta']){
  const before=async()=>{const type=await products.getProductTypeByName(name);const flow=await repo.getProductSubprocesses(type.id_tipo_producto);return{productType:{id_tipo_producto:type.id_tipo_producto},firstSubprocess:flow[0]?{id_estado_subproceso:flow[0].id_estado_subproceso}:null};};
  await measure('product_'+name+'_before',before);
  if(!process.argv.includes('--baseline-only')){const after=()=>repo.getCreationProductContext(name);assert.deepEqual(await after(),await before());await measure('product_'+name+'_after',after);output.equivalence.push({operation:'product context '+name,equal:true});}
 }
 if(!process.argv.includes('--baseline-only')){
  const beforeRecipients=async()=>{const result=[];for(const role of [ROLES.ADMIN_COBRANZAS,ROLES.ADMINISTRADOR])result.push(await db.usuario.findMany({where:{rol_usuario:role,NOT:{estado_usuario:'Desvinculado'}},select:{id_usuario:true}}));return result;};
  const afterRecipients=async()=>{const users=await client.$queryRaw(creationRecipientsQuery());return ['collections','production'].map(flag=>users.filter(u=>Boolean(Number(u[flag]))).map(u=>({id_usuario:u.id_usuario})));};
  const sort=groups=>groups.map(g=>g.sort((a,b)=>a.id_usuario-b.id_usuario));
  assert.deepEqual(sort(await afterRecipients()),sort(await beforeRecipients()));output.equivalence.push({operation:'notification recipient sets',equal:true});
  await measure('recipient_reads_before',beforeRecipients);await measure('recipient_reads_after',afterRecipients);
  for(const query of plans.values())output.explain.push({sql:query.sql,plan:await db.$queryRaw(Prisma.sql`EXPLAIN ${query}`)});
  output.indexes=await db.$queryRaw`SELECT TABLE_NAME,INDEX_NAME,COLUMN_NAME,SEQ_IN_INDEX FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('Pedidos','Cliente','Tipo_Producto','Producto_Subproceso') ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX`;
 }
}catch(error){output.failure={name:error.name,code:error.code??'DIAGNOSTIC_FAILED'};process.exitCode=1;}
finally{await db.$disconnect();await writeFile(arg('output')??'../docs/OPT-04_LECTURAS_SQL.json',JSON.stringify(output,(_k,v)=>typeof v==='bigint'?v.toString():v,2)+'\n');}

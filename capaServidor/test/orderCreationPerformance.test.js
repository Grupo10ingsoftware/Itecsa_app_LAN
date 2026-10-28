import test from 'node:test';
import assert from 'node:assert/strict';
import SalesOrderCreationService from '../src/modules/orders/service/salesOrderCreation.service.js';
import BeforeService from './fixtures/opt04/salesOrderCreation.before.js';
import { creationHarness, normalizedState, sourceNote } from './fixtures/opt04/creationHarness.js';
import { createLineSnapshots } from '../src/modules/orders/service/salesOrder.snapshot.js';
import { toOrderCreatedDTO, toKanbanOrderSummaryDTO, toCalendarOrderSummaryDTO, toPaymentOrderDTO } from '../src/modules/orders/dto/order.dto.js';
import { createCreationDetailsOperation, createCreationAccessoriesOperation, getCreationProductContextOperation } from '../src/modules/orders/repo/orderCreationOperations.js';
import { normalizeSalesNote } from '../src/modules/orders/service/salesNoteSource.service.js';

const input = { numeroNota: 'SYN-OPT04', priority: 'urgent', observacionInterna: 'Interna ñ' };
const options = { actorId: 9, requestId: 'synthetic', response: 'receipt' };
function service(H, Type = SalesOrderCreationService, note = sourceNote()) {
  return new Type({ runInTransaction: H.runInTransaction, source: { getByNumber: async () => structuredClone(note) }, userRepo: { findBySubject: () => assert.fail('request actor must be reused') } });
}

for (const fixture of [
  { lines: 1, accessories: 0 }, { lines: 5, accessories: 3 }, { lines: 20, accessories: 30 },
  { lines: 6, types: ['Yoyo','Lanyard','Tarjeta'], accessories: 8 },
]) for (const existingClient of [false,true]) test(`persisted graph equivalence ${JSON.stringify(fixture)}, client=${existingClient}`, async () => {
  const note=sourceNote(fixture), before=creationHarness({existingClient}),after=creationHarness({existingClient});
  const original=await service(before,BeforeService,note).create(input,options);
  const receipt=await service(after,SalesOrderCreationService,note).create(input,options);
  assert.deepEqual(normalizedState(after.state()),normalizedState(before.state()));
  assert.deepEqual(toOrderCreatedDTO(receipt),toOrderCreatedDTO(original));
  assert.equal(after.calls.filter(c=>c==='detail.createMany').length,1);
  assert.equal(after.calls.filter(c=>c==='detail.create').length,0);
  assert.equal(after.calls.includes('fullOrder.read'),false);
  assert.equal(after.state().records.length,1);assert.equal(after.state().stages.length,1);
  assert.equal(after.state().messages.length,2);assert.equal(after.state().assignments.length,2);assert.equal(after.state().audits.length,1);
  assert.deepEqual(after.transactions,[{timeout:20000,maxWait:10000}]);
});

for(const failAt of ['order.findFirst','client.create','label.findMany','order.create','label.create','record.create','stage.create','raw.read','detail.createMany','accessory.createMany','message.create','assignment.createMany','audit.create','commit'])test(`rollback leaves no order effects on ${failAt}`,async()=>{
 const h=creationHarness({existingClient:false,failAt});
 await assert.rejects(service(h).create(input,options));
 const state=h.state();for(const [name,rows]of Object.entries(state))assert.equal(rows.length,0,name);
});

test('snapshot identity and repeated lines remain exact, accessories never become productive details',async()=>{
 const note=sourceNote({lines:5,accessories:5}),h=creationHarness();await service(h,SalesOrderCreationService,note).create(input,options);
 const state=h.state(),snapshots=createLineSnapshots(note.items);
 state.details.forEach((d,i)=>{for(const [key,value]of Object.entries(snapshots[i]))assert.equal(d[key],value);assert.equal(d.cantidad,note.items[i].cantidad);assert.equal(d.id_estado_subproceso,10);});
 assert.equal(state.accessories.length,5);assert.equal(state.details.length,5);
 assert.deepEqual(state.records[0].FECHA_HORA,state.stages[0].fecha_hora_entrada);assert.equal(state.records[0].id_usuario,9);assert.equal(state.orders[0].id_usuario,9);
});

test('legacy full service return remains available and public consumers retain their contracts',async()=>{
 const h=creationHarness();const order=await service(h).create(input,{actorId:9});
 assert.equal(h.calls.includes('fullOrder.read'),true);assert.equal(order.detalles.length,5);assert.equal(order.itemsSinSeguimientoProductivo.length,2);
 const stored={...order,id_etapa_general:1,nombre_etapa_general:'Confirmación de pago',estado_pago:'Pendiente',nombre_cliente:'Cliente sintético ñ'};
 assert.equal(toKanbanOrderSummaryDTO(stored).items.length,5);assert.equal(toCalendarOrderSummaryDTO(stored).generalStepId,1);assert.equal(toPaymentOrderDTO(stored).paymentStatus,'Pendiente');
});

for(const snapshots of [false,true])test(`snapshot schema compatibility is retained: ${snapshots}`,async()=>{
 const a=creationHarness({snapshots}),b=creationHarness({snapshots});
 await service(a,BeforeService).create(input,options);await service(b).create(input,options);
 assert.deepEqual(normalizedState(a.state()),normalizedState(b.state()));
 assert.equal(Object.hasOwn(b.state().details[0],'linea_origen'),snapshots);
});

for(const config of [{noSubprocess:true},{noRecipients:true},{missingLabel:true},{missingType:true},{shortBatch:true}])test(`creation boundary ${JSON.stringify(config)}`,async()=>{
 const h=creationHarness(config);
 if(config.missingLabel||config.missingType||config.shortBatch){await assert.rejects(service(h).create(input,options));assert.equal(h.state().orders.length,0);}
 else{await service(h).create(input,options);if(config.noSubprocess)assert.equal(h.state().details[0].id_estado_subproceso,null);if(config.noRecipients){assert.equal(h.state().messages.length,0);assert.equal(h.state().assignments.length,0);}}
});

test('two administrators/model transactions cannot commit the same sales note and effects are not duplicated',async()=>{
 const h=creationHarness(),s=service(h);
 const results=await Promise.allSettled([s.create(input,options),s.create(input,{...options,actorId:10})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.statusCode,409);
 assert.equal(h.state().orders.length,1);assert.equal(h.state().messages.length,2);assert.equal(h.state().audits.length,1);
});

test('UNIQUE conflict after a missed precheck is mapped to 409 and rolls back',async()=>{
 const h=creationHarness();await service(h).create(input,options);
 const s=new SalesOrderCreationService({source:{getByNumber:async()=>sourceNote()},runInTransaction:operation=>h.runInTransaction(uow=>{uow.repo.existsBySalesNoteNumber=async()=>false;return operation(uow);})});
 await assert.rejects(s.create(input,options),{statusCode:409});assert.equal(h.state().orders.length,1);assert.equal(h.state().messages.length,2);
});

test('service promise resolves only after commit, never while the graph is uncommitted',async()=>{
 let release;const gate=new Promise(r=>release=r),h=creationHarness({commitGate:gate});let finished=false;
 const promise=service(h).create(input,options).then(result=>{finished=true;return result;});
 while(!h.calls.includes('audit.create'))await new Promise(r=>setImmediate(r));
 assert.equal(finished,false);assert.equal(h.state().orders.length,0);release();await promise;assert.equal(finished,true);assert.equal(h.state().orders.length,1);
});

test('POST-supplied client, lines, quantities, actor, state and dates cannot override source or policy',async()=>{
 const h=creationHarness();await service(h).create({...input,id_usuario:999,actorId:999,id_estado_pedido:8,cliente:{rut:'attacker'},items:[],cantidad:999,fecha_estimada_termino:'2000-01-01'},options);
 const state=h.state();assert.equal(state.orders[0].id_usuario,9);assert.equal(state.orders[0].id_estado_pedido,1);assert.equal(state.details.length,5);assert.equal(state.details[0].cantidad,1);assert.equal(state.orders[0].fecha_estimada_termino,null);
});

test('source validation fails before transaction; direct actor fallback still requires linked identity',async()=>{
 const h=creationHarness();await assert.rejects(service(h,SalesOrderCreationService,{...sourceNote(),items:[{cantidad:0}]}).create(input,options),{statusCode:422});assert.equal(h.transactions.length,0);
 await assert.rejects(new SalesOrderCreationService({source:{getByNumber:()=>assert.fail()},userRepo:{findBySubject:async()=>null},runInTransaction:()=>assert.fail()}).create(input,{identitySubject:'unknown'}),{statusCode:403});
});

test('batches are all-or-fail and do not request skipDuplicates or generated-ID inference',async()=>{
 const calls=[];const client={detalle_pedido:{createMany:async args=>{calls.push(args);return{count:1};}},pedido_Item_Sin_Seguimiento:{createMany:async args=>{calls.push(args);return{count:1};}}};
 await createCreationDetailsOperation({client},1,[{id_tipo_producto:2,cantidad:5}]);await createCreationAccessoriesOperation({client},1,[{producto:'Accesorio',cantidad:3}]);
 assert(calls.every(c=>!Object.hasOwn(c,'skipDuplicates')));assert.equal(calls[0].data[0].id_pedido,1);
 await assert.rejects(createCreationDetailsOperation({client},1,[{id_tipo_producto:2}]),{statusCode:400});
});

test('product projection is parameterized and missing catalog retains the 404',async()=>{
 let query;const client={$queryRaw:async(input,...values)=>{query={text:input.join('?'),values};return[];}};
 await assert.rejects(getCreationProductContextOperation({client},"Lanyard' OR 1=1"),{statusCode:404});
 assert(!query.text.includes("Lanyard'"));assert.deepEqual(query.values,["Lanyard' OR 1=1"]);
});

test('source normalization preserves classification, line order, duplicates and untracked quantities',()=>{
 const note=normalizeSalesNote({numeroNota:'SYN',cliente:{RUT:'1',CLIENTE:'ñ'},items:[
  {importable:true,codigo:'A',producto:'Uno',cantidad:2,familia:' lanyard ',subfamilia:'LANYARD'},
  {importable:false,codigo:'A',producto:'Accesorio',cantidad:4,familia:'LANYARD',subfamilia:'LANYARD'},
  {importable:true,producto:'No soportado',cantidad:5,familia:'OTRO',subfamilia:'OTRO'},
  {importable:true,codigo:'A',producto:'Dos',cantidad:7,familia:'TARJETAS',subfamilia:'TARJETAS'},
 ]});
 assert.deepEqual(note.items.map(i=>[i.producto,i.tipoProducto,i.cantidad]),[['Uno','Lanyard',2],['Dos','Tarjeta',7]]);
 assert.deepEqual(note.itemsSinSeguimientoProductivo.map(i=>[i.producto,i.cantidad]),[['Accesorio',4],['No soportado',5]]);
});

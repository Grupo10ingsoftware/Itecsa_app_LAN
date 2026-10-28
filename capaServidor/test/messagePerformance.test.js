import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import MessageRepository from '../src/modules/messages/repo/message.repo.js';
import MessageService from '../src/modules/messages/service/message.service.js';
import MessageController from '../src/modules/messages/controller/message.controller.js';
import { createMessageRouter } from '../src/modules/messages/routes/message.routes.js';
import { inboxQuery, detailQuery, notificationsQuery } from '../src/modules/messages/repo/messageRead.repo.js';
import { ROLES, ROLES_CLAIM, PERMISSIONS as P } from '../../shared/authorization.js';

const actor = { idUsuario: 1, identitySubject: 'alice', estadoUsuario: 'Activo' };
const context = { currentUser: actor };
const message = (id = 1, extra = {}) => ({ id_mensaje: id, contenido: 'Private synthetic body', Asunto: 'Synthetic',
  fecha_publicacion: new Date('2026-01-01'), id_pedido: null, leido: false, oculto: false, pedido: null, ...extra });
function fixture() {
  const rows = new Map([['1:1', message()], ['2:2', message(2)], ['1:3', message(3, { leido: true, oculto: true })]]);
  const writes = [];
  const repo = {
    findUserMessage: async (user, id) => rows.get(`${user}:${id}`) ?? null,
    markAsRead: async (user, id) => { writes.push([user, id, 'read']); const row = rows.get(`${user}:${id}`); row.leido = true; return row; },
    hideNotification: async (user, id) => { writes.push([user, id, 'hide']); const row = rows.get(`${user}:${id}`); row.oculto = true; return row; },
    hideAllNotifications: async user => { let count = 0; for (const [key, row] of rows) if (key.startsWith(user + ':') && !row.oculto) { row.oculto = true; count++; } return { count }; },
    getNotificationSnapshot: async user => {
      const notifications = [...rows].filter(([key, row]) => key.startsWith(user + ':') && !row.leido && !row.oculto).map(([,row]) => row);
      return { notifications, unreadCount: notifications.length };
    },
  };
  const service = new MessageService({ repo, userRepo: { findBySubject: () => assert.fail('duplicate identity lookup') } });
  return { rows, writes, repo, service };
}
test('all SQL reads bind the recipient; inbox retains numbered OFFSET, status, dates and deterministic ordering', () => {
  const from = new Date('2026-09-06'), to = new Date('2026-09-06T23:59:59.999Z');
  const sql = inboxQuery({ userId: 1, status: 'unread', sort: 'oldest', from, to, page: 3, perPage: 12 });
  assert.deepEqual(sql.values, [1, from, to, 12, 24]);
  assert.match(sql.sql, /mu.id_usuario=\?/); assert.match(sql.sql, /`leido\?`=0/);
  assert.match(sql.sql, /fecha_publicacion ASC, mu.id_mensaje ASC/); assert.ok(!sql.sql.split('WHERE')[1].includes('oculto?'));
  const detail = detailQuery(7, 99); assert.deepEqual(detail.values, [7,99]);
  assert.match(detail.sql, /mu.id_usuario=\? AND mu.id_mensaje=\?/);
  const notification = notificationsQuery(7,50,true);
  assert.deepEqual(notification.values, [7,7,50]); assert.match(notification.sql, /LEFT JOIN \(SELECT/);
  assert.equal((notification.sql.match(/`oculto\?`=0/g) ?? []).length, 2);
});
test('inbox keeps page and count inside the same existing transaction and preserves all DTO fields', async () => {
  const row = { ...message(), relatedId: 8, numero_nota_venta: 'SYNTH', fecha_creacion: new Date('2026-01-01'), fecha_estimada_termino: null, leido: 0, oculto: 1 };
  let transactions = 0, countWhere;
  const repo = new MessageRepository({ prisma: { $queryRaw: async () => [row],
    mENSAJE_USUARIO: { count: async ({where}) => { countWhere = where; return 21; } },
    $transaction: async tasks => { transactions++; assert.equal(tasks.length, 2); return Promise.all(tasks); } } });
  const result = await repo.listInbox({ userId: 1, status: 'read', sort: 'latest', page: 2, perPage: 12 });
  assert.equal(transactions, 1); assert.deepEqual(countWhere, { id_usuario: 1, leido_: true });
  assert.equal(result.totalPages, 2); assert.equal(result.page, 2); assert.equal(result.messages[0].oculto, true);
  assert.deepEqual(result.messages[0].pedido, { id_pedido: 8, numero_nota_venta: 'SYNTH', fecha_creacion: row.fecha_creacion, fecha_estimada_termino: null });
});
test('notification snapshot counts beyond the page, maps empty/BigInt and keeps fixed one-query cost', async () => {
  let calls = 0;
  const prisma = { $queryRaw: async () => { calls++; return [{ ...message(), leido: 0, oculto: 0, unreadCount: 501n }]; } };
  const repo = new MessageRepository({ prisma });
  const result = await repo.getNotificationSnapshot(1,50);
  assert.equal(result.unreadCount, 501); assert.equal(result.notifications.length, 1); assert.equal(calls, 1);
  prisma.$queryRaw = async () => [{ id_mensaje: null, unreadCount: 0n }];
  assert.deepEqual(await repo.getNotificationSnapshot(1,50), { notifications: [], unreadCount: 0 });
});
test('compact view preserves the exact normalized 82-character excerpt and excludes private body/order', async () => {
  const f = fixture(); f.rows.get('1:1').contenido = '  inicio\n' + 'contenido\t'.repeat(100);
  const full = await f.service.getNotifications('alice', {}, context);
  const compact = await f.service.getNotifications('alice', { view: 'bell', limit: 50 }, context);
  const normalized = full.notifications[0].contenido.replace(/\s+/g,' ').trim();
  assert.equal(compact.notifications[0].preview, normalized.slice(0,82).trim()); assert.equal(compact.notifications[0].truncated, true);
  assert.equal(Object.hasOwn(compact.notifications[0], 'contenido'), false); assert.equal(Object.hasOwn(compact.notifications[0], 'pedido'), false);
  const unchanged = await f.service.getNotifications('alice', { view: 'bell', revision: compact.revision }, context);
  assert.deepEqual(unchanged, { unchanged: true, revision: compact.revision, unreadCount: 1 });
  assert.equal(Object.hasOwn(full,'revision'), false);
});
test('revision detects same-count replacement, visible content, read/hide and is bound to recipient', async () => {
  const f = fixture(); const read = revision => f.service.getNotifications('alice', { view: 'bell', revision }, context);
  let previous = await read(); f.rows.get('1:1').Asunto = 'Changed';
  let next = await read(previous.revision); assert.notEqual(next.revision, previous.revision);
  previous = next; f.rows.delete('1:1'); f.rows.set('1:4', message(4));
  next = await read(previous.revision); assert.equal(next.unreadCount, 1); assert.notEqual(next.revision, previous.revision);
  const bob = await f.service.getNotifications('bob', { view: 'bell', revision: next.revision }, { currentUser: { ...actor, idUsuario: 2, identitySubject: 'bob' } });
  assert.notEqual(bob.revision, next.revision); assert.equal(bob.notifications[0].id_mensaje, 2);
  f.rows.get('1:4').oculto = true; assert.equal((await read(next.revision)).unreadCount, 0);
});
for (const action of ['getMessage','markAsRead','hideNotification','openMessage']) test(`${action} cannot access another recipient or invalid ID`, async () => {
  const f = fixture();
  await assert.rejects(f.service[action]('alice', 2, { ...context, canMarkRead: true }), { statusCode: 404 });
  await assert.rejects(f.service[action]('alice', "1 OR 1=1", context), { statusCode: 400 });
  assert.equal(f.writes.length, 0);
});
test('opening handles read/unread, read-only permission, idempotence and preserves hidden inbox messages', async () => {
  const f = fixture();
  assert.equal((await f.service.openMessage('alice',1,context)).message.leido, false); assert.equal(f.writes.length,0);
  const result = await f.service.openMessage('alice',1,{...context,canMarkRead:true});
  assert.equal(result.message.leido,true); assert.equal(result.markedAsRead,true);
  assert.equal((await f.service.openMessage('alice',1,{...context,canMarkRead:true})).markedAsRead,false);
  assert.equal(f.writes.length,1); assert.equal((await f.service.openMessage('alice',3,{...context,canMarkRead:true})).message.oculto,true);
});
test('mark/hide repeated are idempotent; clear affects only current recipient and preserves read flags', async () => {
  const f=fixture(); await f.service.markAsRead('alice',1,context); await f.service.markAsRead('alice',1,context);
  await f.service.hideNotification('alice',1,context); await f.service.hideNotification('alice',1,context);
  assert.equal(f.writes.length,2); assert.equal(f.rows.get('2:2').oculto,false);
  assert.deepEqual(await f.service.clearNotifications('alice',context), { hiddenCount: 0 });
  assert.equal(f.rows.get('1:1').leido,true); assert.equal(f.rows.get('2:2').leido,false);
});
test('atomic scoped update and bulk clear never accept caller supplied recipient; mutation errors propagate', async () => {
  const changes=[];
  const repo=new MessageRepository({prisma:{mENSAJE_USUARIO:{updateMany:async query=>{changes.push(query);return{count:1}}},$queryRaw:async()=>[{...message(),leido:1,oculto:0}]}});
  await repo.markAsRead(1,7); await repo.hideNotification(1,7); await repo.hideAllNotifications(1);
  assert.deepEqual(changes.map(q=>q.where),[{id_usuario:1,id_mensaje:7},{id_usuario:1,id_mensaje:7},{id_usuario:1,oculto_:false}]);
  repo.client.mENSAJE_USUARIO.updateMany=async()=>{throw Error('SQL failure')};
  await assert.rejects(repo.hideNotification(1,7),/SQL failure/);
});
test('Fase 1 currentUser validation remains fail-closed and body/query cannot replace it', async () => {
  const f=fixture();
  for(const currentUser of [{...actor,identitySubject:'bob'},{...actor,estadoUsuario:'Desvinculado'},{...actor,idUsuario:-1}]) {
    await assert.rejects(f.service.getNotifications('alice',{currentUser:actor},{currentUser}),{statusCode:403});
  }
  await assert.rejects(f.service.getNotifications('',{},context),{statusCode:401});
});
test('new open endpoint checks READ_MESSAGES and derives mark permission server-side, not body', async t => {
  let permissions=[P.READ_MESSAGES], user=actor;
  const f=fixture(), app=express();app.use(express.json());app.locals.errorLogger={error(){}};
  const authenticate=(req,_res,next)=>{req.currentUser=user;req.identityProvider='keycloak';req.auth={payload:{sub:user.identitySubject,[ROLES_CLAIM]:[ROLES.PRODUCCION],permissions}};next()};
  app.use('/messages',createMessageRouter({authenticate,controller:new MessageController({service:f.service})}));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r)}));
  const open=()=>fetch(`http://127.0.0.1:${server.address().port}/messages/1/open`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({canMarkRead:true,currentUser:{idUsuario:2}})});
  let response=await open();assert.equal(response.status,200);assert.equal((await response.json()).message.leido,false);assert.equal(f.writes.length,0);
  permissions.push(P.UPDATE_MESSAGES);response=await open();assert.equal((await response.json()).message.leido,true);assert.equal(f.writes.length,1);
  permissions=[];assert.equal((await open()).status,403);
  permissions=[P.READ_MESSAGES];user={...actor,idUsuario:2,identitySubject:'bob'};assert.equal((await open()).status,404);
});

for(const size of [0,1,10,50,500,5000]) test(`synthetic ${size} assignments keep a bounded page, complete count and one snapshot call`,async()=>{
  let calls=0;
  const rows=Array.from({length:Math.min(size,50)},(_,i)=>({...message(i+1),leido:0,oculto:0,unreadCount:BigInt(size)}));
  const repo=new MessageRepository({prisma:{$queryRaw:async query=>{calls++;assert.equal(query.values.at(-1),50);return rows.length?rows:[{id_mensaje:null,unreadCount:0n}]}}});
  const service=new MessageService({repo});
  const result=await service.getNotifications('alice',{limit:5000},context);
  assert.equal(result.notifications.length,Math.min(size,50));assert.equal(result.unreadCount,size);assert.equal(calls,1);
});
for(const failure of [null,'message','recipients']) test(`message creation preserves transactional assignments and rollback (${failure})`,async()=>{
  let state={messages:[],assignments:[]};
  const tx={mensaje:{create:async({data})=>{if(failure==='message')throw Error('Synthetic failure');const row={...data,id_mensaje:1};state.messages.push(row);return row},findUnique:async()=>state.messages[0]},
    mENSAJE_USUARIO:{createMany:async({data})=>{if(failure==='recipients')throw Error('Synthetic failure');state.assignments.push(...data);return{count:data.length}}}};
  const repo=new MessageRepository({prisma:{$transaction:async callback=>{const snapshot=structuredClone(state);try{return await callback(tx)}catch(error){state=snapshot;throw error}}}});
  const service=new MessageService({repo});
  const action=service.createMessage({orderId:9,contenido:' Synthetic ',asunto:' Test ',recipientUserIds:[1,2,1],fechaPublicacion:'2026-01-01'});
  if(failure){await assert.rejects(action);assert.deepEqual(state,{messages:[],assignments:[]})}
  else{await action;assert.equal(state.messages[0].id_pedido,9);assert.equal(state.messages[0].contenido,'Synthetic');assert.ok(state.messages[0].fecha_publicacion instanceof Date);
    assert.deepEqual(state.assignments,[{id_usuario:1,id_mensaje:1,leido_:false,oculto_:false},{id_usuario:2,id_mensaje:1,leido_:false,oculto_:false}])}
});

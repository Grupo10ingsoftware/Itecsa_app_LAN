import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readPrismaConfiguration } from '../src/database/prisma.js';
import SecurityAuditRepository from '../src/modules/security/repo/securityAudit.repo.js';
import { createSupportAudit } from '../src/middlewares/supportAudit.js';
import { ROLES } from '../../shared/keycloakAuthorization.js';

const directory=mkdtempSync(path.join(tmpdir(),'itecsa-pool-policy-'));
const ca=path.join(directory,'ca.pem');writeFileSync(ca,'test CA');
process.on('exit',()=>rmSync(directory,{recursive:true,force:true}));
const environment=extra=>({APP_ENV:'development',DB_HOST:'db.example.invalid',DB_PORT:'3306',DB_USER:'test',DB_PASSWORD:'not-a-real-password',DB_NAME:'test',DB_SSL_MODE:'required',DB_SSL_CA_PATH:ca,...extra});

test('central pool policy bounds reuse and preserves strict TLS, timeouts and maximum capacity',()=>{
 const o=readPrismaConfiguration(environment());
 assert.equal(o.connectionLimit,10);assert.equal(o.prepareCacheLength,32);
 assert.equal(o.minDelayValidation,5000);assert.equal(o.pingTimeout,1000);
 assert.equal(o.connectTimeout,8000);assert.equal(o.socketTimeout,15000);
 assert.equal(o.ssl.rejectUnauthorized,true);assert.equal(typeof o.ssl.checkServerIdentity,'function');
 assert.equal(o.noControlAfterUse,undefined);assert.equal(o.resetAfterUse,undefined);
});

test('explicit rollback settings are supported without bypassing configuration validation',()=>{
 const o=readPrismaConfiguration(environment({DB_PREPARE_CACHE_LENGTH:'0',DB_POOL_VALIDATION_DELAY_MS:'500',DB_POOL_PING_TIMEOUT_MS:'250'}));
 assert.equal(o.prepareCacheLength,0);assert.equal(o.minDelayValidation,500);assert.equal(o.pingTimeout,250);
 for(const [key,invalid]of Object.entries({DB_PREPARE_CACHE_LENGTH:['',-1,257,1.5,'NaN'],DB_POOL_VALIDATION_DELAY_MS:['',-1,30001,'Infinity'],DB_POOL_PING_TIMEOUT_MS:['',0,99,8001]}))
  for(const value of invalid)assert.throws(()=>readPrismaConfiguration(environment({[key]:String(value)})),e=>!e.message.includes('not-a-real-password'));
});

const event={eventType:'support.request',occurredAt:new Date('2026-10-30T12:00:00Z'),actorUserId:7,action:'GET /api/auth/profile',resourceType:'http_request',requestId:'12345678-1234-1234-1234-123456789012',outcome:'allowed',reasonCode:'HTTP_200'};
test('audit default contract still returns the created row; receipt mode persists identical fields once',async()=>{
 const calls=[],row={id_security_audit_event:9007199254740993n};
 const client={securityAuditEvent:{create:async x=>{calls.push(['create',x]);return row;},createMany:async x=>{calls.push(['createMany',x]);return {count:1};}}};
 const repo=new SecurityAuditRepository({prisma:client});
 assert.equal(await repo.record(event),row);
 assert.equal(await repo.record(event,{returnRecord:false}),undefined);
 assert.deepEqual(calls[1][1],{data:[calls[0][1].data]});
 assert.deepEqual(calls.map(c=>c[0]),['create','createMany']);
 assert.equal(calls[1][1].skipDuplicates,undefined);
});

test('audit receipt preserves incident metadata filtering and injected transaction client',async()=>{
 let stored;const tx={securityAuditEvent:{createMany:async x=>{stored=x;return {count:1};}}};
 const repo=new SecurityAuditRepository({prisma:{securityAuditEvent:{createMany(){throw Error('wrong client');}}}});
 await repo.record({...event,eventType:'incident_report.delivery',eventKey:'fixture/1',action:'line1\nline2',metadata:{attempt:2,providerId:'safe',password:'never stored',description:'never stored'}},{client:tx,returnRecord:false});
 assert.equal(stored.data[0].action,'line1 line2');assert.equal(stored.data[0].event_key,'fixture/1');
 assert.deepEqual(stored.data[0].metadata,{providerId:'safe',attempt:2});
});

test('audit receipt rejects missing persistence and propagates database failure without retry',async()=>{
 for(const count of [0,2]){const repo=new SecurityAuditRepository({prisma:{securityAuditEvent:{createMany:async()=>({count})}}});await assert.rejects(repo.record(event,{returnRecord:false}),{code:'AUDIT_WRITE_NOT_CONFIRMED'});}
 const failure=Object.assign(Error('duplicate'),{code:'P2002'});let attempts=0;
 const repo=new SecurityAuditRepository({prisma:{securityAuditEvent:{createMany:async()=>{attempts++;throw failure;}}}});
 await assert.rejects(repo.record(event,{returnRecord:false}),e=>e===failure);assert.equal(attempts,1);
});

test('support middleware retains finish timing, one event, confirmed receipt and safe error reporting',async()=>{
 const calls=[],errors=[],res=new EventEmitter();let next=0,reject;
 const repository={record:(...a)=>{calls.push(a);return new Promise((_ok,no)=>{reject=no;});}};
 const req={currentUser:{idUsuario:7,rolUsuario:ROLES.DESARROLLADOR},identityProvider:'keycloak',method:'GET',path:'/api/auth/profile',params:{},requestId:event.requestId};res.statusCode=200;
 createSupportAudit({repository,logger:{error:(...a)=>errors.push(a)}})(req,res,()=>next++);
 assert.equal(next,1);assert.equal(calls.length,0);res.emit('finish');
 assert.equal(calls.length,1);assert.deepEqual(calls[0][1],{returnRecord:false});
 assert.equal(calls[0][0].eventType,'support.request');assert.equal(calls[0][0].outcome,'allowed');
 reject(Object.assign(Error('private SQL and values'),{code:'P2002'}));await new Promise(ok=>setImmediate(ok));
 assert.equal(errors.length,1);assert.equal(errors[0][0],'security_audit.write_failed');assert.equal(errors[0][1].code,'P2002');assert.ok(!JSON.stringify(errors).includes('private SQL'));
});

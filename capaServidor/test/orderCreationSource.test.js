import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { FixtureSalesNoteRepository, normalizeSalesNote } from '../src/modules/orders/service/salesNoteSource.service.js';
import { normalizeSalesNote as beforeNormalize } from './fixtures/opt04/salesNoteNormalization.before.js';

for(const n of [1,5,20,1000])test(`normalization exact DTO equivalence: ${n} lines`,()=>{
 const record={numeroNota:'123',cliente:{RUT:'11111111-1',CLIENTE:'Cliente ñ'},origen:{usuarioManager:'Origen'},items:Array.from({length:n},(_,i)=>({importable:i%3!==0,codigo:i%2?'Repeated':null,producto:'Producto ñ',cantidad:i+1,familia:i%2?' LANYARD ':'TARJETAS',subfamilia:i%2?'LANYARD':'TARJETAS'}))};
 assert.deepEqual(normalizeSalesNote(record),beforeNormalize(record));
});

test('fixture cold/warm/expiry/file-version/disabled/errors keep the original cache and Map guarantees',async t=>{
 const dir=await mkdtemp(fileURLToPath(new URL('../../tmp/opt04-source-',import.meta.url))),path=join(dir,'fixture.json');
 t.after(async()=>{await unlink(path);await rmdir(dir);});
 let now=1000,enabled=true;
 const data=name=>[{numeroNota:'123',cliente:{rut:'11111111-1',nombre:name},items:[{importable:true,codigo:'P',producto:'Producto',cantidad:1,familia:'LANYARD',subfamilia:'LANYARD'}]}];
 await writeFile(path,JSON.stringify(data('Cliente')));
 const repo=new FixtureSalesNoteRepository({fixturePath:path,cacheTtlMs:100,now:()=>now,fixtureEnabled:()=>enabled});
 const first=await repo.getByNumber(' NV-2026-123 '),cache=repo.cache;assert.equal(first.numeroNota,'123');
 first.items[0].cantidad=999;assert.equal((await repo.getByNumber('123')).items[0].cantidad,1);assert.equal(repo.cache,cache);assert(repo.cache.byNumber instanceof Map);
 now=1101;await repo.getByNumber('123');assert.notEqual(repo.cache,cache);const expired=repo.cache;
 await writeFile(path,JSON.stringify(data('Cliente modificado y mas largo')));assert.equal((await repo.getByNumber('123')).cliente.nombre,'Cliente modificado y mas largo');assert.notEqual(repo.cache,expired);
 await assert.rejects(repo.getByNumber('missing'),{statusCode:404});await assert.rejects(repo.getByNumber(' '),{statusCode:400});
 enabled=false;await assert.rejects(repo.getByNumber('123'),{code:'SALES_NOTE_SOURCE_UNAVAILABLE'});enabled=true;
 await writeFile(path,'not-json');await assert.rejects(repo.getByNumber('123'),SyntaxError);
});

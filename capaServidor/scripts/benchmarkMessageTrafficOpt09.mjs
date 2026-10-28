// Virtual-time scheduler experiment, not a real-minute network/load test.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import MessageService from '../src/modules/messages/service/message.service.js';
import { createNotificationRefresh } from '../../capaVista/src/modules/messages/utils/notificationRefresh.js';
const data = Array.from({length:50},(_,i)=>({id_mensaje:i+1,contenido:'Synthetic private body '.repeat(180),Asunto:'Synthetic '+i,
  fecha_publicacion:'2026-01-01T00:00:00Z',leido:false,oculto:false,id_pedido:null,pedido:null}));
const context={currentUser:{idUsuario:1,identitySubject:'synthetic',estadoUsuario:'Activo'}};
const service=new MessageService({repo:{getNotificationSnapshot:async()=>({notifications:data,unreadCount:50})}});
const full=await service.getNotifications('synthetic',{},context);
const first=await service.getNotifications('synthetic',{view:'bell'},context);
const unchanged=await service.getNotifications('synthetic',{view:'bell',revision:first.revision},context);
const size=value=>Buffer.byteLength(JSON.stringify(value));
const output={reference:'755ce1e',node:process.version,methodology:'Virtual 60-second half-open windows [0,60000), including initial load. GET-call counts are simulated, not actual network or SQL. No real messages, writes or saturation.',
 payloadBytes:{full:size(full),compact:size(first),unchanged:size(unchanged)},scenarios:[]};
for(const [name,tabs,hidden,burst]of[['visible',1,false,false],['two_visible_tabs',2,false,false],['three_visible_tabs',3,false,false],['hidden',1,true,false],['focus_visibility_burst',1,false,true]]){
 const counts={before:0,after:0},bytes={before:0,after:0};
 for(const version of ['before','after']){
  let time=0;
  const feeds=Array.from({length:tabs},()=>{
   let initialized=false;
   const load=async()=>{counts[version]++;const payload=version==='before'?full:initialized?unchanged:first;bytes[version]+=size(payload);initialized=true;return payload};
   const scheduler=createNotificationRefresh({load,onData(){},onError(error){throw error},visible:()=>!hidden,now:()=>time});
   return{load,scheduler};
  });
  const events=Array.from({length:12},(_,i)=>i*5000);
  if(burst)events.push(20001,20002,20003);
  events.sort((a,b)=>a-b);
  for(const at of events){time=at;for(const feed of feeds){if(version==='before'){if(!hidden||at===0)await feed.load()}else await feed.scheduler.request()}}
  feeds.forEach(feed=>feed.scheduler.dispose());
 }
 output.scenarios.push({name,tabs,simulatedGetsPerMinute:counts,simulatedBytesPerMinute:bytes});
}
assert.equal(output.scenarios[0].simulatedGetsPerMinute.after,12);
assert.equal(output.scenarios[1].simulatedGetsPerMinute.after,24);
// With initial baseline established, a new ID at 12001 is detected by the 15000 tick.
output.detection={messageIntroducedAtVirtualMs:12001,nextPollAtVirtualMs:15000,waitBeforeRequestMs:2999,
 note:'Same cadence before/after. Excludes SQL/HTTP/browser latency; not a real arrival-latency measurement.'};
const path=process.argv.find(v=>v.startsWith('--output='))?.slice(9);
if(!path)throw Error('Requires --output');await writeFile(path,JSON.stringify(output,null,2)+'\n');

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync,writeFileSync,existsSync,mkdirSync,unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { RECOGNIZED_ROLES,ROLE_PERMISSIONS } from '../shared/keycloakAuthorization.js';
import { assertPrivateOperatorDirectory } from './private-operator-directory.mjs';

// Real Brave, real application, Ubuntu and Aiven. No mocked API or database fixtures.
const [privatePath, origin='http://127.0.0.1:5173', selectedUsername, verificationMode] = process.argv.slice(2);
assert.ok(!verificationMode || verificationMode==='--preserve-password');
assert.ok(privatePath && ['http://localhost:5173','http://127.0.0.1:5173'].includes(origin));
assertPrivateOperatorDirectory(privatePath);
const file=join(privatePath,'credenciales.json'), state=JSON.parse(readFileSync(file,'utf8'));
assert.ok(!selectedUsername||state.users.some(u=>u.username===selectedUsername));
const save=()=>writeFileSync(file,JSON.stringify(state,null,2)+'\n',{mode:0o600});
const profile=join(privatePath,'brave-verificacion');mkdirSync(profile,{recursive:true});
const active=join(profile,'DevToolsActivePort');if(existsSync(active))unlinkSync(active);
const binary=join(process.env.LOCALAPPDATA,'BraveSoftware/Brave-Browser/Application/brave.exe');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const report={origin,startedAt:new Date().toISOString(),browser:'Brave',users:[],undefinedRefreshRequests:0,tokenErrors:0,tokenRequests:[],providerErrors:[]};
let browser,ws;
try{
 browser=spawn(binary,['--headless=new','--disable-gpu','--disable-extensions','--disable-background-networking',
  '--no-first-run','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let spawnError;browser.on('error',e=>{spawnError=e;});
 for(let i=0;i<100&&!existsSync(active)&&!spawnError;i++)await pause(100);
 if(spawnError)throw spawnError;
 const port=readFileSync(active,'utf8').split(/\r?\n/)[0];
 const target=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
 let serial=0;const pending=new Map(),listeners=new Set();
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error('CDP '+m.error.code)):p.resolve(m.result);}}else for(const listener of listeners)listener(m);};
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},20000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>(await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})).result?.value;
 await call('Page.enable');await call('Runtime.enable');await call('Network.enable');
 await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 report.browserVersion=(await call('Browser.getVersion')).product;
 let current,accessToken,verified,tokenReads=[],requests=new Map();
 listeners.add(event=>{
  if(event.method==='Network.requestWillBeSent'){
   const {requestId,request}=event.params;const url=new URL(request.url);
   if(url.pathname.endsWith('/token')){const data=new URLSearchParams(request.postData??'');
    if(data.get('grant_type')==='refresh_token'&&data.get('refresh_token')==='undefined')report.undefinedRefreshRequests++;
    report.tokenRequests.push({grant:data.get('grant_type'),refreshUndefined:data.get('refresh_token')==='undefined',refreshMissing:!data.has('refresh_token')});
    requests.set(requestId,'token');}
   if(url.pathname==='/api/auth/verify')requests.set(requestId,'verify');
  }
  if(event.method==='Network.responseReceived'){
   const {requestId,response}=event.params,kind=requests.get(requestId);
   if(kind==='token'&&response.status>=400)report.tokenErrors++;
   if(kind==='verify'&&current)current.verifyStatus=response.status;
   if(current && new URL(response.url).pathname==='/api/admin/identity/identities/prepare')current.preparationStatus=response.status;
  }
  if(event.method==='Network.loadingFinished'&&requests.has(event.params.requestId)){
   const requestId=event.params.requestId,kind=requests.get(requestId);requests.delete(requestId);
   const work=call('Network.getResponseBody',{requestId}).then(value=>{
    const raw=value.base64Encoded?Buffer.from(value.body,'base64').toString():value.body;let data;try{data=JSON.parse(raw);}catch{return;}
    if(kind==='token'&&data.access_token)accessToken=data.access_token;
    if(kind==='token'&&data.error)report.providerErrors.push({error:data.error,description:data.error_description});
    if(kind==='verify'&&data.rolUsuario)verified=data;
   }).catch(()=>{});tokenReads.push(work);
  }
 });
 const routes=[['/kanban','read:orders'],['/pagos','read:payments'],['/admin/usuarios','manage:users'],
  ['/ordenes/nuevo','create:orders'],['/historial-pedidos','read:orders'],['/calendario-produccion','read:production-calendar'],
  ['/metricas','view:metrics'],['/mensajes','read:own-messages'],['/perfil','read:own-profile']];
 const endpoints=[['/orders/kanban-summary?limit=2','read:orders'],['/orders/calendar-summary?unscheduled=true&limit=2','read:production-calendar'],
  ['/orders/payments','read:payments'],['/history/orders?perPage=2','read:orders'],['/metrics/summary?from=2026-10-01&to=2026-10-25','view:metrics'],
  ['/production-capacity','read:production-capacity'],['/production-load/today','read:production-capacity'],
  ['/messages?perPage=2','read:own-messages'],['/messages/notifications','read:own-messages']];
 for(const user of state.users.filter(u=>!selectedUsername||u.username===selectedUsername)){
  assert.ok(RECOGNIZED_ROLES.includes(user.role));accessToken=undefined;verified=undefined;tokenReads=[];
  current={username:user.username,role:user.role,subject:user.subject,api:[],routes:[]};report.users.push(current);
  await call('Page.navigate',{url:origin+'/login'});
  let submitted=false,changed=false;
  for(let i=0;i<240;i++){
   const view=await evaluate(`({login:!!document.querySelector('#username'),change:!!document.querySelector('#password-new'),path:location.pathname,origin:location.origin,error:document.querySelector('#input-error,.kc-feedback-text')?.textContent?.trim()})`);
   if(view?.login && submitted && view.error) throw Error('Keycloak rejected the saved credential for '+user.username+'; password was not reset');
   if(view?.login&&!submitted){
    const credentials=JSON.stringify({username:user.username,password:user.passwordChangePlanned&&user.verificationPassword?user.verificationPassword:user.password});
    await evaluate(`(()=>{const c=${credentials};document.querySelector('#username').value=c.username;document.querySelector('#password').value=c.password;document.querySelector('#kc-form-login').requestSubmit();return true;})()`);submitted=true;
   }
   if(view?.change&&!changed){
    assert.notEqual(verificationMode,'--preserve-password','Password change required; existing password preserved');
    user.verificationPassword ??= 'Aa9!' + randomBytes(24).toString('base64url');
    user.passwordChangePlanned=true;save();
    await evaluate(`(()=>{const p=${JSON.stringify(user.verificationPassword)};document.querySelector('#password-new').value=p;document.querySelector('#password-confirm').value=p;document.querySelector('form').requestSubmit();return true;})()`);changed=true;
   }
   if(verified&&accessToken&&view?.origin===origin&&view.path!=='/login')break;
   await pause(250);
  }
  await Promise.all(tokenReads);
  current.landing=await evaluate('location.pathname');
  current.login=!!verified&&!!accessToken;
  if(!current.login){current.page=await evaluate('({origin:location.origin,path:location.pathname,title:document.title})');throw Error('Login not completed: '+user.username);}
  if(changed||(user.passwordChangePlanned&&user.verificationPassword)){user.password=user.verificationPassword;delete user.verificationPassword;delete user.passwordChangePlanned;user.temporary=false;user.passwordChangedAt=new Date().toISOString();save();}
  const claims=JSON.parse(Buffer.from(accessToken.split('.')[1],'base64url').toString());
  assert.equal(claims.sub,user.subject);assert.equal(claims.iss,state.issuer);assert.equal(claims.azp,state.clientId);
  assert.ok([claims.aud].flat().includes('https://api.itecsa.local'));
  assert.deepEqual(claims.resource_access?.['itecsa-api-v1']?.roles,[user.role]);
  assert.deepEqual([...claims.permissions].sort(),[...ROLE_PERMISSIONS[user.role]].sort());
  assert.ok(!claims.resource_access?.['realm-management']);
  assert.equal(verified.rolUsuario,user.role);assert.equal(verified.estadoUsuario,'Activo');assert.equal(current.verifyStatus,200);
  if(verified.pinStatus==='pending_acknowledgement'){
   current.initialLanding=current.landing;
   for(let i=0;i<80;i++){
    const pin=await evaluate(`document.querySelector('[aria-labelledby="pin-delivery-title"] .display-5')?.textContent?.trim()`);
    if(/^\d{6}$/.test(pin??'')){user.pin=pin;save();break;}await pause(150);
   }
   assert.match(user.pin??'',/^\d{6}$/,'Own account PIN delivery required');
   await evaluate(`(()=>{const b=[...document.querySelectorAll('[aria-labelledby="pin-delivery-title"] button')].find(b=>b.textContent.trim()==='Aceptar'&&!b.disabled);if(b){b.click();return true;}return false;})()`);
   for(let i=0;i<80&&verified.pinStatus!=='active';i++)await pause(150);
   current.pinAcknowledged=verified.pinStatus==='active';assert.ok(current.pinAcknowledged);
   await call('Page.navigate',{url:origin+'/login'});
   for(let i=0;i<80;i++){current.landing=await evaluate('location.pathname');if(current.landing===(user.role==='Soporte'?'/admin/usuarios':'/kanban'))break;await pause(150);}
  }
  assert.equal(current.landing,user.role==='Soporte'?'/admin/usuarios':'/kanban');
  current.claims={issuer:claims.iss,audience:claims.aud,clientId:claims.azp,resourceRoles:claims.resource_access['itecsa-api-v1'].roles,
   permissions:claims.permissions,administrativeRoles:false};current.passwordChangeVerified=changed;
  for(let i=0;i<50;i++){if(await evaluate(`!!document.querySelector('a[href="/perfil"]')`))break;await pause(100);}
  current.menu=await evaluate(`[...document.querySelectorAll('a[href]')].map(a=>({path:a.getAttribute('href'),text:a.textContent.trim()})).filter(a=>${JSON.stringify(routes.map(([path])=>path))}.includes(a.path))`);
  current.menuMatchesPolicy=routes.every(([path,permission])=>current.menu.some(link=>link.path===path)===ROLE_PERMISSIONS[user.role].includes(permission));
  const token=accessToken;
  const usersBase='http://127.0.0.1:3000/api/admin/identity/users';
  current.userManagement=[];
  for(const path of ['', '/summary', '/'+encodeURIComponent(state.users.find(u=>u.username==='operario.produccion.prueba.2').subject)+'/movements']) {
   const response=await fetch(usersBase+path,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)});
   current.userManagement.push({path,expected:user.role==='Soporte'?200:403,status:response.status});
   assert.equal(response.status,user.role==='Soporte'?200:403);await response.body?.cancel();
  }
  if(user.role==='Soporte') {
   const waitFor=async expression=>{for(let i=0;i<160;i++){if(await evaluate(expression))return;await pause(150);}throw Error('Users UI condition timed out');};
   const setField=async(selector,value)=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return false;
    Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});
    e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);
   await waitFor(`!!document.querySelector('#user-management-title')&&!!document.querySelector('table tbody tr')&&!document.body.innerText.includes('Cargando usuarios')`);
   current.originalUsersTable=await evaluate(`!!document.querySelector('table')&&!!document.querySelector('#user-management-search')&&!document.querySelector('#support-title')`);
   assert.ok(current.originalUsersTable);
   await setField('#user-management-search','operario.produccion.prueba.2');
   await waitFor(`document.querySelector('table tbody')?.innerText.includes('operario.produccion.prueba.2')&&document.querySelectorAll('table tbody tr').length===1`);
   await evaluate(`(()=>{const b=[...document.querySelectorAll('table tbody button')].find(b=>b.textContent.trim()==='Consultar');b.click();return true;})()`);
   await waitFor(`!!document.querySelector('#user-edit-modal-title')`);
   current.readOnlyDetail=await evaluate(`document.querySelector('#user-edit-modal-title').textContent==='Consultar usuario'&&document.querySelector('#edit-user-first-name').disabled&&!document.querySelector('#edit-user-pin')&&![...document.querySelectorAll('[role="dialog"] button')].some(b=>/Guardar cambios|Desvincular|Establecer credenciales/.test(b.textContent))`);
   assert.ok(current.readOnlyDetail);
   await evaluate(`document.querySelector('[aria-label="Cerrar modal de edicion"]').click()`);
   await evaluate(`(()=>{const b=[...document.querySelectorAll('table tbody button')].find(b=>b.textContent.trim()==='Movimientos');b.click();return true;})()`);
   await waitFor(`!!document.querySelector('#user-movements-title')&&!document.querySelector('dialog')?.innerText.includes('Cargando movimientos')`);
   current.movementsDialog=await evaluate(`!!document.querySelector('#user-movements-title')&&!document.querySelector('dialog [role="alert"]')`);assert.ok(current.movementsDialog);
   await evaluate(`document.querySelector('[aria-label="Cerrar historial"]').click()`);
   await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
   current.responsive=await evaluate(`[...document.querySelectorAll('article')].some(e=>e.innerText.includes('operario.produccion.prueba.2')&&getComputedStyle(e.parentElement).display!=='none')`);
   assert.ok(current.responsive);
   await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
   await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Crear usuario');b.click();return true;})()`);
   await waitFor(`!!document.querySelector('#user-create-modal-title')`);
   current.preparationForm=await evaluate(`!!document.querySelector('#user-username')&&!!document.querySelector('#user-prepare-pin')&&document.querySelector('#user-rut').disabled&&document.querySelector('#user-role').options.length===7`);assert.ok(current.preparationForm);
   const preparedUsername='verificacion.users.pendiente';
   await setField('#user-username',preparedUsername);await setField('#user-first-name','Soporte');await setField('#user-last-name','Verificacion');
   await setField('#user-role','Operario Produccion');await setField('#user-prepare-pin',user.pin);
   await evaluate(`document.querySelector('#user-username').closest('form').requestSubmit()`);
   await waitFor(`!document.querySelector('#user-create-modal-title')`);
   assert.equal(current.preparationStatus,202,'Original Users form must prepare through phase06');
   const inspect=await fetch('http://127.0.0.1:3000/api/admin/identity/identities/by-username/'+preparedUsername,{headers:{authorization:'Bearer '+accessToken},signal:AbortSignal.timeout(20000)});
   assert.equal(inspect.status,200);const prepared=await inspect.json();assert.equal(prepared.enabled,false);assert.equal(prepared.localState,'Pendiente');
   current.preparedAccount={username:prepared.username,subject:prepared.subject,localUserId:prepared.localUserId,enabled:prepared.enabled,state:prepared.localState};
  }
  for(const [path,permission] of endpoints){const response=await fetch('http://localhost:3000/api'+path,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)});
   const allowed=ROLE_PERMISSIONS[user.role].includes(permission);const result={path,permission,expected:allowed?200:403,status:response.status};current.api.push(result);await response.body?.cancel();}
  for(const [path,permission]of routes){
   await evaluate(`(()=>{history.pushState(null,'',${JSON.stringify(path)});dispatchEvent(new PopStateEvent('popstate'));return true;})()`);await pause(400);
   const allowed=ROLE_PERMISSIONS[user.role].includes(permission);let actual;
   for(let i=0;i<80;i++){actual=await evaluate(`({path:location.pathname,loading:document.body.innerText.includes('Cargando sesion')})`);if(!actual?.loading&&(allowed?actual?.path===path:actual?.path==='/access-denied'))break;await pause(150);}
   actual=actual?.path;
   current.routes.push({path,allowed,actual,pass:allowed?actual===path:actual==='/access-denied'});
  }
  await call('Page.navigate',{url:origin+'/perfil'});await pause(500);verified=undefined;
  await call('Page.reload',{ignoreCache:true});
  for(let i=0;i<100&&!verified;i++)await pause(150);
  current.reload=verified?.sub===user.subject&&verified?.rolUsuario===user.role;
  // Read-only phase 06 inspection exercises authorization without creating another account.
  const targetUser=state.users.find(u=>u.role==='Operario Ventas');
  const admin=await fetch(`http://localhost:3000/api/admin/identity/identities/${targetUser.subject}`,{headers:{authorization:'Bearer '+accessToken},signal:AbortSignal.timeout(20000)});
  current.administration={expected:user.role==='Soporte'?200:403,status:admin.status};await admin.body?.cancel();
  const pin=await fetch('http://localhost:3000/api/auth/pin/reveal',{method:'POST',headers:{authorization:'Bearer '+accessToken,'content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(20000)});
  current.pinStatus=pin.status;await pin.body?.cancel(); // Never log/reveal the PIN to this report.
  const clicked=await evaluate(`(()=>{const b=[...document.querySelectorAll('button,a')].find(x=>/cerrar sesi[oó]n|salir/i.test(x.textContent));if(b){b.click();return true;}return false;})()`);
  current.logoutClicked=clicked;
  if(clicked){await pause(300);await evaluate(`(()=>{const b=[...document.querySelectorAll('[role="dialog"] button')].find(x=>/cerrar sesi[oó]n/i.test(x.textContent));if(b){b.click();return true;}return false;})()`);}
  for(let i=0;i<100;i++){const logged=await evaluate(`location.pathname==='/login'&&new URLSearchParams(location.search).get('logged_out')==='1'`);if(logged){current.logout=true;break;}await pause(150);}
  console.log(user.username+': login '+current.verifyStatus+', '+claims.permissions.length+' permissions, reload '+current.reload+', logout '+!!current.logout);
  assert.ok(current.reload&&current.logout,'Reload/logout not completed');
 }
 report.finishedAt=new Date().toISOString();
}catch(error){report.error=error.message;console.error(error.message);process.exitCode=1;}
finally{
 const name=(origin.includes('localhost')?'brave-localhost':'brave-127')+(selectedUsername?'-'+selectedUsername:'')+'.json';
 writeFileSync(join(privatePath,name),JSON.stringify(report,null,2)+'\n',{mode:0o600});
 ws?.close();if(browser&&browser.exitCode===null){browser.kill();await Promise.race([new Promise(r=>browser.once('exit',r)),pause(3000)]);}
}

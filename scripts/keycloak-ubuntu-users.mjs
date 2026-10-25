import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { startAdmin, closeAdmin, request, client, patchEnv } from './keycloak-ubuntu-configure.mjs';
import { RECOGNIZED_ROLES, ROLE_PERMISSIONS } from '../shared/keycloakAuthorization.js';
import { assertPrivateOperatorDirectory } from './private-operator-directory.mjs';

const [action, privatePath, selectedUsername] = process.argv.slice(2);
assert.ok(['create', 'create-second', 'audit', 'arm', 'canonical', 'open-verification', 'close-verification'].includes(action) && privatePath);
assertPrivateOperatorDirectory(privatePath);
const credentialsPath = join(privatePath, 'credenciales.json');
const usernames = ['admin.produccion.prueba','admin.ventas.prueba','admin.cobranzas.prueba',
  'operario.produccion.prueba','operario.ventas.prueba','operario.cobranzas.prueba',
  'gerencia.prueba','desarrollador.prueba','soporte.prueba'];
const save = (name, value) => writeFileSync(join(privatePath,name),JSON.stringify(value,null,2)+'\n',{mode:0o600});
const strong = () => 'Aa9!' + randomBytes(24).toString('base64url');
let state;
if (existsSync(credentialsPath)) state = JSON.parse(readFileSync(credentialsPath,'utf8'));
else {
  assert.equal(action,'create');
  state={owner:randomUUID(),issuer:'http://127.0.0.1:18080/realms/itecsa',clientId:'itecsa-web',createdAt:new Date().toISOString(),
    users:RECOGNIZED_ROLES.map((role,i)=>({username:usernames[i],role,password:strong(),verificationPassword:strong(),temporary:true}))};
  save('credenciales.json',state);
}
assert.equal(state.issuer,'http://127.0.0.1:18080/realms/itecsa');
const secondUsername = 'operario.produccion.prueba.2';
assert.deepEqual(state.users.slice(0, usernames.length).map(u=>u.username),usernames);
assert.ok(state.users.length === usernames.length || (state.users.length === usernames.length + 1
  && state.users.at(-1).username === secondUsername));
assert.ok(!selectedUsername || (['arm','open-verification','close-verification'].includes(action) && state.users.some(u=>u.username === selectedUsername)));
assert.ok(!['open-verification','close-verification'].includes(action) || selectedUsername);
async function inventory() {
  const realm = await request('');
  const clients = await request('/clients');
  const result = {observedAt:new Date().toISOString(),realm:Object.fromEntries(['id','realm','enabled','sslRequired','registrationAllowed',
    'resetPasswordAllowed','loginWithEmailAllowed','editUsernameAllowed','passwordPolicy','accessTokenLifespan','ssoSessionIdleTimeout',
    'adminEventsEnabled','eventsEnabled'].map(k=>[k,realm[k]??null])),realmRoles:await request('/roles?max=1000'),
    groups:await request('/groups?max=1000'),scopes:await request('/client-scopes'),profile:await request('/users/profile'),realmRoleComposites:{},clients:[],users:[]};
  for(const role of result.realmRoles)if(role.composite)result.realmRoleComposites[role.name]=await request('/roles/'+encodeURIComponent(role.name)+'/composites');
  for (const c of clients) {
    const full=await request('/clients/'+c.id);
    const fields=['id','clientId','enabled','publicClient','bearerOnly','standardFlowEnabled','directAccessGrantsEnabled',
      'implicitFlowEnabled','serviceAccountsEnabled','fullScopeAllowed','redirectUris','webOrigins','attributes','protocolMappers'];
    const entry=Object.fromEntries(fields.map(k=>[k,full[k]??null]));
    entry.roles=await request(`/clients/${c.id}/roles?max=1000`);
    entry.composites={};for(const role of entry.roles) if(role.composite) entry.composites[role.name]=await request(`/clients/${c.id}/roles/${encodeURIComponent(role.name)}/composites`);
    entry.defaultScopes=await request(`/clients/${c.id}/default-client-scopes`);
    entry.optionalScopes=await request(`/clients/${c.id}/optional-client-scopes`);
    entry.scopeMappings=await request(`/clients/${c.id}/scope-mappings`);
    if(c.clientId==='itecsa-backend-admin'){
      const account=await request(`/clients/${c.id}/service-account-user`);
      entry.serviceAccount={id:account.id,username:account.username,roleMappings:await request(`/users/${account.id}/role-mappings`)};
    }
    result.clients.push(entry);
  }
  const users=await request('/users?max=1000&briefRepresentation=false');assert.ok(users.length<1000);
  for(const u of users) result.users.push({id:u.id,username:u.username,enabled:u.enabled,requiredActions:u.requiredActions,
    attributes:u.attributes,groups:await request(`/users/${u.id}/groups`),roleMappings:await request(`/users/${u.id}/role-mappings`)});
  return result;
}
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
try {
  await startAdmin();
  const discovery=await (await fetch(state.issuer+'/.well-known/openid-configuration')).json();assert.equal(discovery.issuer,state.issuer);
  if (selectedUsername && ['arm','open-verification','close-verification'].includes(action)) {
    const user = state.users.find(u=>u.username===selectedUsername);
    const current = await request('/users/'+user.subject);
    assert.equal(current.username,user.username);
    assert.equal(current.attributes?.itecsa_provision_id?.[0],state.owner);
    let requiredActions;
    if (action==='open-verification') {
      assert.ok(user.passwordChangedAt && !user.verificationPassword,'Verified existing password required; never reset it');
      user.verificationRequiredActions ??= current.requiredActions ?? [];
      save('credenciales.json',state);
      requiredActions = (current.requiredActions??[]).filter(value=>value!=='UPDATE_PASSWORD');
    } else if(action==='close-verification') {
      assert.ok(Array.isArray(user.verificationRequiredActions),'No temporary verification state');
      requiredActions = [...new Set([...(current.requiredActions??[]), ...user.verificationRequiredActions])];
    } else {
      assert.ok(user.passwordChangedAt && !user.verificationPassword);
      requiredActions = [...new Set([...(current.requiredActions??[]),'UPDATE_PASSWORD'])];
    }
    await request('/users/'+user.subject,'PUT',{...current,requiredActions});
    if(action==='close-verification')delete user.verificationRequiredActions;
    if(action==='arm')user.temporary=true;
    save('credenciales.json',state);
    console.log(selectedUsername+': required actions updated; password unchanged');
  } else {
  const rolesClient=await client('itecsa-api-v1');
  const roles=await request(`/clients/${rolesClient.id}/roles?max=1000`);
  assert.deepEqual(roles.map(r=>r.name).sort(),[...RECOGNIZED_ROLES].sort());
  if(action==='create-second') {
    const first = state.users.find(u=>u.username==='operario.produccion.prueba');
    assert.ok(first?.subject && first.role==='Operario Produccion');
    const original = await request('/users/'+first.subject);
    assert.equal(original.username, first.username);
    const mappings = await request(`/users/${first.subject}/role-mappings/clients/${rolesClient.id}`);
    assert.deepEqual(mappings.map(r=>r.name),[first.role]);
    const composite = await request(`/clients/${rolesClient.id}/roles/${encodeURIComponent(first.role)}/composites`);
    assert.deepEqual(composite.map(r=>r.name).sort(),[...ROLE_PERMISSIONS[first.role]].sort());
    if(!state.users.some(u=>u.username===secondUsername)) {
      const found=await request('/users?exact=true&username='+encodeURIComponent(secondUsername));
      assert.equal(found.length,0,'Existing username is not owned by the private journal');
      state.users.push({username:secondUsername,role:first.role,password:strong(),verificationPassword:strong(),temporary:true});
      save('credenciales.json',state);
    }
  }
  const targets = action==='create-second' ? state.users.filter(u=>u.username===secondUsername)
    : selectedUsername ? state.users.filter(u=>u.username===selectedUsername) : state.users;
  const before=await inventory();
  if(!existsSync(join(privatePath,'inventario-anterior.json')))save('inventario-anterior.json',before);
  const preserved=before.users.filter(u=>!targets.some(owned=>owned.subject===u.id));
  if(action==='create'||action==='create-second') {
    for(const user of targets) {
      let found=await request('/users?exact=true&username='+encodeURIComponent(user.username));
      assert.ok(found.length<=1);
      if(found.length) {
        const existing=await request('/users/'+found[0].id);
        assert.ok(existing.attributes?.itecsa_provision_id?.[0]===state.owner && (!user.subject||user.subject===existing.id),
          'Username collision: refusing to adopt or overwrite '+user.username);
      } else {
        assert.ok(!user.subject,'Owned account missing: investigate before recreating');
        user.creationPlanned=true;save('credenciales.json',state);
        await request('/users','POST',{username:user.username,enabled:true,firstName:'Prueba',lastName:user.role,
          requiredActions:['UPDATE_PASSWORD'],attributes:{itecsa_provision_id:[state.owner]},
          credentials:[{type:'password',value:user.password,temporary:true}]});
        found=await request('/users?exact=true&username='+encodeURIComponent(user.username));assert.equal(found.length,1);
      }
      user.subject=found[0].id;save('credenciales.json',state);
      const path=`/users/${user.subject}/role-mappings/clients/${rolesClient.id}`;
      const current=await request(path), desired=roles.find(role=>role.name===user.role);assert.ok(desired);
      assert.ok(current.length===0||(current.length===1&&current[0].id===desired.id),'Unexpected app-role mapping');
      if(!current.length)await request(path,'POST',[desired]);
      const assigned=await request(`/users/${user.subject}/role-mappings`);
      assert.ok(!assigned.clientMappings?.['realm-management'],'No Keycloak admin roles allowed');
      console.log(user.username+': enabled; '+user.role+'; mandatory password change');
    }
    // Link only the selected, explicitly owned UUIDs in the existing Aiven database.
    const program=`import getDb from './src/database/prisma.js';
const d=getDb(), users=${JSON.stringify(targets.map(({username,role,subject})=>({username,role,subject})))}, issuer=${JSON.stringify(state.issuer)};
try{if(process.env.DB_HOST!=='itecsabddev-itecsabd.l.aivencloud.com'||process.env.DB_NAME!=='mydb'||process.env.DB_SSL_MODE!=='required')throw Error('Wrong database');
const result=await d.$transaction(async tx=>{const linked=[];for(const u of users){
let row=await tx.usuario.findUnique({where:{id_auth0:u.subject}});
if(row){const binding=await tx.externalIdentity.findUnique({where:{provider_issuer_subject:{provider:'keycloak',issuer,subject:u.subject}}});if(!binding||binding.user_id!==row.id_usuario||binding.username!==u.username||row.rol_usuario!==u.role||row.estado_usuario!=='Activo')throw Error('Existing binding conflict');}
else{row=await tx.usuario.create({data:{id_auth0:u.subject,correo_usuario:null,nombre_usuario:'Prueba',apellido_usuario:u.role,rol_usuario:u.role,estado_usuario:'Activo'}});
await tx.$executeRawUnsafe('UPDATE Usuario SET id_keycloak=? WHERE id_usuario=? AND id_auth0=?',u.subject,row.id_usuario,u.subject);
await tx.externalIdentity.create({data:{provider:'keycloak',issuer,subject:u.subject,username:u.username,user_id:row.id_usuario}});}
linked.push({username:u.username,subject:u.subject,role:u.role,localId:row.id_usuario,state:row.estado_usuario});}return linked;},{timeout:120000,maxWait:10000});console.log(JSON.stringify(result));}
catch(e){console.error('Local identity binding failed: '+e.name+' '+(e.code||''));process.exitCode=1;}finally{await d.$disconnect();}`;
    const run=spawnSync('docker',['exec','-i','-w','/app/capaServidor','itecsa_app_lan-api-1','node','--input-type=module'],
      {input:program,encoding:'utf8',timeout:120000,stdio:['pipe','pipe','pipe']});
    assert.equal(run.status,0,'Aiven binding failed: '+(run.stderr.match(/Local identity binding failed: \w+ \w*/)?.[0]??'inspect private process status'));
    save(action==='create-second'?'vinculo-segundo-operario.json':'vinculos.json',JSON.parse(run.stdout));
    console.log(targets.length+' explicit UUID bindings active in existing Aiven; no commercial fixtures created.');
  }
  if(action==='canonical') {
    const spa=await client('itecsa-web'), origins=['http://127.0.0.1:5173'];
    await request('/clients/'+spa.id,'PUT',{...spa,redirectUris:origins.map(o=>o+'/*'),webOrigins:origins,
      attributes:{...spa.attributes,'post.logout.redirect.uris':origins.map(o=>o+'/*').join('##')}});
    patchEnv('capaServidor/.env',{FRONTEND_ORIGIN:origins[0],FRONTEND_ALTERNATE_ORIGIN:''});
    patchEnv('capaVista/.env',{VITE_API_BASE_URL:'http://127.0.0.1:3000/api'});
    console.log('127.0.0.1 canonical, explicit redirects/origin only; iframe and issuer unchanged.');
  }
  if(action==='arm')for(const user of targets){
    assert.ok(user.passwordChangedAt&&!user.verificationPassword,'Reconcile the private password journal before handoff');
    const current=await request('/users/'+user.subject);
    assert.equal(current.attributes?.itecsa_provision_id?.[0],state.owner);
    await request('/users/'+user.subject,'PUT',{...current,requiredActions:[...new Set([...(current.requiredActions??[]),'UPDATE_PASSWORD'])]});
    user.temporary=true;
    delete user.passwordChangePlanned;
    save('credenciales.json',state);
  }
  if(action==='arm')save('credenciales.json',state);
  const after=await inventory();
  for(const user of preserved){const actual=after.users.find(u=>u.id===user.id);assert.equal(hash(actual),hash(user),'Pre-existing user changed');}
  save('inventario-actual.json',after);
  save('preservacion.json',{observedAt:new Date().toISOString(),preservedUsers:preserved.map(u=>({id:u.id,username:u.username})),unchanged:true});
  console.log('Pre-existing accounts and role mappings preserved; inventory saved without credentials.');
  }
}catch(error){console.error('User preparation stopped: '+error.message);process.exitCode=1;}
finally{await closeAdmin();}

// Opt-in measurements against the EXISTING API. No service replacement or mocks.
// Credentials from the specifically authorized prior user message stay in memory.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomBytes,createHash } from 'node:crypto';
import dotenv from 'dotenv';
const root=path.resolve(import.meta.dirname,'../..'),serverRoot=path.join(root,'capaServidor');
dotenv.config({path:path.join(serverRoot,'.env'),quiet:true});
const phase=process.argv[2],pid=Number(process.argv[3]);
if(!['before','cache','pool','audit','final'].includes(phase)||!Number.isSafeInteger(pid)||pid<1)throw Error('EXPLICIT_PHASE_AND_API_PID_REQUIRED');
const evidenceArg=process.argv.find(a=>a.startsWith('--evidence-root='))?.slice('--evidence-root='.length);
const evidenceRoot=evidenceArg?path.resolve(root,evidenceArg):path.join(root,'docs/optimización/evidencia/optimizacion-conexiones-20261030');
const allowedRoot=path.join(root,'docs/optimización/evidencia');
const relative=path.relative(allowedRoot,evidenceRoot);if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('EVIDENCE_MUST_STAY_IN_REPOSITORY');
const dir=path.join(evidenceRoot,phase);
await fs.mkdir(evidenceRoot,{recursive:true});
await fs.mkdir(dir,{recursive:false});
const cli=(...args)=>execFileSync(process.execPath,[path.join(serverRoot,'scripts/auditConnections.mjs'),...args],{cwd:root,encoding:'utf8',maxBuffer:1024*1024});
const save=(name,obj)=>fs.writeFile(path.join(dir,name+'.json'),JSON.stringify(obj,null,2)+'\n',{flag:'wx'});
async function login(){
 const history=process.env.ITECSA_AUTHORIZED_CREDENTIAL_HISTORY;
 if(!history)throw Error('AUTHORIZED_CREDENTIAL_HISTORY_REQUIRED');
 let password;
 for(const line of (await fs.readFile(history,'utf8')).split('\n')){let o;try{o=JSON.parse(line);}catch{continue;}
  if(o.type!=='response_item'||o.payload?.role!=='user')continue;
  const text=o.payload.content?.filter(c=>c.type==='input_text').map(c=>c.text).join('\n')??'';
  if(!text.includes('desarrollador.prueba'))continue;
  const p=text.match(/contrase.a\s*:\s*([^\r\n]+)/i);
  if(/usuario\s*:/i.test(text)&&p)password=p[1].trim().replace(/^[\s*`"']+/,'').split(/\s/)[0].replace(/(?:\*\*|[`"'])$/,'');
 }
 if(!password)throw Error('AUTHORIZED_CREDENTIAL_NOT_FOUND');
 const issuer=process.env.KEYCLOAK_ISSUER,client=process.env.KEYCLOAK_CLIENT_ID,redirect=process.env.FRONTEND_ORIGIN+'/',verifier=randomBytes(32).toString('base64url');
 const url=new URL(issuer+'/protocol/openid-connect/auth');url.search=new URLSearchParams({client_id:client,redirect_uri:redirect,response_type:'code',scope:'openid',state:randomBytes(16).toString('hex'),nonce:randomBytes(16).toString('hex'),code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url')});
 const t=performance.now(),r=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(10000)}),cookies=r.headers.getSetCookie().map(x=>x.split(';')[0]).join('; '),html=await r.text();
 const action=html.match(/<form[^>]+action="([^"]+)"/i)?.[1]?.replaceAll('&amp;','&');
 if(!action||new URL(action).origin!==new URL(issuer).origin)throw Error('UNEXPECTED_LOGIN_FORM');
 const l=await fetch(action,{method:'POST',redirect:'manual',headers:{cookie:cookies,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:'desarrollador.prueba',password,credentialId:''}),signal:AbortSignal.timeout(10000)});
 // eslint-disable-next-line no-useless-assignment -- Drop the credential reference before sampling.
 password=undefined;
 await l.body?.cancel();
 const loc=l.headers.get('location');if(!loc?.startsWith(redirect))throw Error('LOGIN_NOT_CONFIRMED');const code=new URL(loc).searchParams.get('code');if(!code)throw Error('CODE_MISSING');
 const tr=await fetch(issuer+'/protocol/openid-connect/token',{method:'POST',redirect:'error',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:client,redirect_uri:redirect,code,code_verifier:verifier}),signal:AbortSignal.timeout(10000)}),tokens=await tr.json();if(!tr.ok||!tokens.access_token)throw Error('TOKEN_NOT_CONFIRMED');
 const loginMs=+(performance.now()-t).toFixed(3),p=await fetch('http://127.0.0.1:'+process.env.PORT+'/api/auth/profile',{headers:{authorization:'Bearer '+tokens.access_token,'x-itecsa-audit':'initial-profile-'+phase},signal:AbortSignal.timeout(30000)});
 const body=await p.json();tokens.access_token=undefined;tokens.refresh_token=undefined;tokens.id_token=undefined;
 if(p.status!==200||!Array.isArray(body.records)||typeof body.rolUsuario!=='string')throw Error('PROFILE_CONTRACT_FAILED_'+p.status);
 return {loginMs,profileStatus:p.status,profileKeys:Object.keys(body).sort()};
}
let installed=false;
try{
 process._debugProcess(pid);
 for(let i=0;i<20;i++){try{await fetch('http://127.0.0.1:9229/json/list');break;}catch{await new Promise(ok=>setTimeout(ok,100));}}
 const probe=JSON.parse(cli('probe'));if(probe.pid!==pid||probe.cwd!==serverRoot)throw Error('WRONG_API_PROCESS');
 await save('process',probe);
 cli('eval-file',path.join(serverRoot,'scripts/optimizeConnections.runtime.cjs'));installed=true;
 await save('login',await login());cli('take',path.join(dir,'first-profile.json'));
 if(phase==='final'){
  cli('prisma',path.join(dir,'bootstrap.json'),'--samples=1');
  cli('eval-file',path.join(serverRoot,'scripts/optimizeConnections.validate.cjs'),path.join(dir,'real-safety.json'));
  cli('eval-file',path.join(serverRoot,'scripts/optimizeConnections.scenarios.cjs'),path.join(dir,'idle-concurrency-audit.json'),'--evidence-root='+evidenceRoot);
  cli('eval-file',path.join(serverRoot,'scripts/auditConnections.identity.cjs'),path.join(dir,'keycloak.json'));
  cli('config',path.join(dir,'config.json'));
  cli('eval-file',path.join(serverRoot,'scripts/optimizeConnections.snapshot.cjs'),path.join(dir,'sessions.json'));
  console.log(JSON.stringify({phase,realSafety:true,idle:true,concurrency:20,auditsVerified:60}));
 }else{
 cli('prisma',path.join(dir,'select1-first.json'),'--samples=1');
 cli('prisma',path.join(dir,'select1.json'));
 for(const mode of ['users','payments','profile']){
  cli(mode,path.join(dir,mode+'-warmup.json'),'--samples=5');
  cli(mode,path.join(dir,mode+'.json'));
  console.log(JSON.stringify({phase,route:mode,n:20}));
 }
 cli('pool-pairs',path.join(dir,'pairs.json'));
 cli('config',path.join(dir,'config.json'));
 cli('eval-file',path.join(serverRoot,'scripts/auditConnections.environment.cjs'),path.join(dir,'environment.json'));
 cli('eval-file',path.join(serverRoot,'scripts/optimizeConnections.snapshot.cjs'),path.join(dir,'sessions.json'));
 }
 await save('metadata',{capturedAt:new Date().toISOString(),phase,pid,head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),node:process.version,clock:'performance.now',warmup:5,normalSecurityAudits:true,serialHttpDrainsAudits:true});
}finally{if(installed)try{cli('cleanup',path.join(dir,'cleanup.json'));}catch{}try{cli('close-inspector');}catch{}}

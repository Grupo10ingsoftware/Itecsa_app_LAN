(async()=>{
 const req=process.getBuiltinModule('module').createRequire(process.cwd()+'/package.json');
 const {KeycloakManagementService}=req('./src/modules/users/service/keycloakManagement.service.js');
 const {ASSIGNABLE_ROLES}=req('../shared/keycloakAuthorization.js');
 const jose=req('jose'),http=req('node:http'),https=req('node:https');
 const out={capturedAt:new Date().toISOString(),scope:'real configured Keycloak, token and administrative catalog GET only',series:[],errors:[]};
 const round=v=>+v.toFixed(3);
 const sample=async(name,n,fn)=>{const values=[];for(let i=0;i<n;i++){const t=performance.now();await fn();values.push(round(performance.now()-t));}out.series.push({name,n,values});};
 const m=new KeycloakManagementService();
 try{
  await sample('adminTokenCold',1,()=>m.token());
  await sample('adminClientDiscoveryCold',1,()=>m.roleClient());
  await sample('adminRoleRepresentation',20,()=>m.roleRepresentation(ASSIGNABLE_ROLES[0]));
  const token=await m.token(),keys=jose.createRemoteJWKSet(new URL(process.env.KEYCLOAK_JWKS_URI));
  let gets=0;const hg=http.get,sg=https.get;
  http.get=function(...a){gets++;return hg.apply(this,a);};https.get=function(...a){gets++;return sg.apply(this,a);};
  try{const verify=()=>jose.jwtVerify(token,keys,{issuer:process.env.KEYCLOAK_ISSUER,algorithms:['RS256']});await sample('jwtNewJwksCache',1,verify);out.jwksRequestsCold=gets;await sample('jwtWarmJwksCache',20,verify);out.jwksRequestsAfterWarm=gets;}
  finally{http.get=hg;https.get=sg;}
 }catch(e){out.errors.push({code:e.code??e.name});}
 return out;
})()

(()=>{
 const req=process.getBuiltinModule('module').createRequire(process.cwd()+'/package.json');
 const fs=req('node:fs'),path=req('node:path'),crypto=req('node:crypto');
 const {resolveDatabaseConnection}=req('./src/database/connectionConfig.js'),cfg=resolveDatabaseConnection();
 const target=v=>crypto.createHash('sha256').update(v.host+':'+v.port+'/'+v.database).digest('hex');
 const disk=req('dotenv').parse(fs.readFileSync('.env'));
 const c=resolveDatabaseConnection(disk);
 const files=['src/database/prisma.js','src/database/connectionConfig.js','src/server.js','src/app/dev.js','src/app/app.js','src/middlewares/checkJwt.js','src/middlewares/requireActiveIdentity.js','src/middlewares/rateLimit.js','src/middlewares/supportAudit.js','src/modules/users/repo/users.repo.js','src/modules/users/repo/keycloakIdentity.repo.js','src/modules/users/service/keycloakIdentityAdministration.service.js','src/modules/users/service/keycloakManagement.service.js','src/modules/orders/repo/paymentWorkspaceRead.repo.js','src/modules/orders/service/order.service.js','src/modules/orders/service/orderPayment.service.js'];
 return {capturedAt:new Date().toISOString(),pid:process.pid,node:process.version,platform:process.platform,arch:process.arch,cwd:process.cwd(),
  env:Object.fromEntries(['DOTENV_PATH','APP_ENV','NODE_ENV','PORT','FRONTEND_ORIGIN','AUTH_PROVIDER','KEYCLOAK_ISSUER','KEYCLOAK_JWKS_URI','KEYCLOAK_ADMIN_TRANSPORT_ORIGIN','KEYCLOAK_ADMIN_TIMEOUT_MS','DB_SSL_MODE','DB_CONNECT_TIMEOUT_MS','DB_QUERY_TIMEOUT_MS','IDENTITY_PREPARATION_ENABLED','HTTP_REQUEST_TIMEOUT_MS','HTTP_HEADERS_TIMEOUT_MS','HTTP_KEEP_ALIVE_TIMEOUT_MS','SALES_NOTE_SOURCE','PRIVACY_REQUEST_PROVIDER','SECURITY_INCIDENT_PROVIDER','PIN_DELIVERY_PROVIDER'].map(k=>[k,process.env[k]??null])),
  target:{kind:cfg.host.endsWith('.aivencloud.com')?'Aiven':'other',tlsRequired:cfg.sslMode==='required',destinationHash:target(cfg),matchesCurrentEnvFileTarget:target(cfg)===target(c)},
  versions:Object.fromEntries(['@prisma/client','@prisma/adapter-mariadb','mariadb','express','express-oauth2-jwt-bearer','jose'].map(n=>[n,JSON.parse(fs.readFileSync(path.join('node_modules',n,'package.json'))).version])),
  sourceHashes:Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')]))};
})()

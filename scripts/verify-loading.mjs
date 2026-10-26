import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createServer } from '../capaVista/node_modules/vite/dist/node/index.js'
import react from '../capaVista/node_modules/@vitejs/plugin-react/dist/index.js'
import { pages } from '../capaVista/verify/pageFixtures.js'

// Navegador local con componentes reales y API sintética detenida por una compuerta.
// No contacta Keycloak ni la API de la instalación y no admite escrituras remotas.
const root = path.resolve('capaVista'), output = path.resolve('dist/loading-review')
const fixture = path.join(root, 'verify/dist/loading-review')
const nativeCss = await readFile('deploy/keycloak/themes/itecsa/login/resources/css/itecsa.css', 'utf8')
await mkdir(fixture, { recursive: true }); await mkdir(output, { recursive: true })
await writeFile(path.join(fixture, 'index.html'), '<!doctype html><html lang="es"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="./fixture.jsx"></script></html>')
await writeFile(path.join(fixture, 'fixture.jsx'), `
import {useEffect,useState} from 'react';import {createRoot} from 'react-dom/client';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import AppLayout from '/src/shared/components/layout/AppLayout.jsx';
import LoadingIndicator,{LoadingAction} from '/src/shared/components/loading/LoadingIndicator.jsx';
import PaymentCredentialsModal from '/src/modules/payments/components/PaymentCredentialsModal.jsx';
import PinLoadingPreview from '/verify/pinLoadingFixtures.jsx';
import ProtectedRoute from '/src/shared/components/navigation/ProtectedRoute.jsx';
import {initializeAuthForms} from '/@fs/${path.resolve('deploy/keycloak/themes/itecsa/login/resources/js/itecsa.js').replaceAll('\\','/')}';
import 'bootstrap/dist/css/bootstrap.min.css';import 'bootstrap-icons/font/bootstrap-icons.css';
import '/src/styles/theme.css';import '/src/styles/global.css';import '/src/styles/bootstrap-overrides.css';
${pages.map(([, , file], i) => `import Page${i} from '/src/modules/${file}.jsx';`).join('\n')}
window.__holdLoading=true;window.__loadingGate=new Promise(resolve=>{window.__releaseLoading=()=>{window.__holdLoading=false;resolve()}});
const routes=${JSON.stringify(pages.map(([id, url]) => [id, url]))};
const id=new URLSearchParams(location.search).get('page')||'gallery';
export function Gallery(){const[busy,setBusy]=useState(false);return <main style={{padding:16,display:'grid',gap:16}}>
{['light','dark'].map(surface=><section key={surface} data-gallery={surface} style={{background:surface==='dark'?'#141414':'#F5F6F8',borderRadius:16,padding:16,minWidth:0}}>
<LoadingIndicator surface={surface} context="Sección"/>
<div style={{width:'min(160px,100%)',margin:'auto'}}><LoadingIndicator surface={surface} context="Card angosta"/></div>
<button data-action={surface} type="button" disabled={busy} aria-busy={busy} onClick={()=>setBusy(true)} style={{background:surface==='dark'?'#111827':'white',color:surface==='dark'?'white':'#111827',padding:12,border:'1px solid #64748b',borderRadius:8,maxWidth:'100%'}}><LoadingAction surface={surface} busy={busy}>Confirmar actualización</LoadingAction></button>
</section>)}
</main>}
export function Native(){useEffect(()=>{initializeAuthForms();const form=document.querySelector('[data-auth-form]');form.requestSubmit(form.querySelector('[name=login]'))},[]);return <><style>{${JSON.stringify(nativeCss)}}</style><main className="auth-layout"><section className="auth-card"><h1>Iniciar sesión</h1><form data-auth-form noValidate onSubmit={event=>event.preventDefault()}><input name="username" defaultValue="fixture" required/><input name="password" type="password" defaultValue="fixture" required/><button className="auth-button auth-button-primary" name="login" type="submit">Iniciar sesión</button></form></section></main></>}
const route=routes.find(r=>r[0]===id);
createRoot(document.getElementById('root')).render(id.startsWith('pin-')?<MemoryRouter><PinLoadingPreview id={id}/></MemoryRouter>:id==='native'?<Native/>:id==='gallery'?<Gallery/>:id==='modal'?<PaymentCredentialsModal description="Validación sintética" isSubmitting onCancel={()=>{}} onConfirm={()=>{}}/>:id==='guard'?<MemoryRouter><ProtectedRoute/></MemoryRouter>:route?<MemoryRouter initialEntries={[route[1]]}><Routes><Route element={<AppLayout/>}>
${pages.map(([,url],i)=>`<Route path="${url.replace('/123','/:orderId').replace('/1','/:messageId')}" element={<Page${i}/>}/>`).join('\n')}
</Route></Routes></MemoryRouter>:null);
`)
const server = await createServer({ root, configFile: false, appType: 'mpa', plugins: [{
  name: 'isolated-loading-review', enforce: 'pre',
  resolveId(source) {
    if (/(?:^|\/)useAuth(?:\.js)?$/.test(source)) return '\0loading-auth'
    if (/(?:^|\/)useApiClient(?:\.js)?$/.test(source)) return '\0loading-client'
  },
  load(id) {
    if (id === '\0loading-auth') return "import {auth} from '/verify/pageFixtures.js';import {ROLES} from '/src/config/roles.js';const page=new URLSearchParams(location.search).get('page');export const useAuth=()=>({...auth,user:page==='pin-user-edit'?{...auth.user,rolUsuario:ROLES.SOPORTE}:auth.user,isAuthenticated:true,authStatus:'authenticated',pinStatus:['pin-profile-reveal','pin-profile-ack'].includes(page)?'pending_acknowledgement':auth.pinStatus,isLoading:page==='guard'});"
    if (id === '\0loading-client') return `import {client} from '/verify/pageFixtures.js';
      const page=new URLSearchParams(location.search).get('page');
      const slow={...client,get:async(...args)=>{if(window.__holdLoading&&!page.startsWith('pin-'))await window.__loadingGate;return client.get(...args)},
        post:async(path,...args)=>{
          if(page==='pin-profile-ack'&&path==='/auth/pin/reveal')return {pin:'123456'};
          if(page==='pin-profile-confirm'&&path==='/auth/pin-recovery/request')return {status:'sent'};
          if(page.startsWith('pin-profile-'))return window.__loadingGate;
          return client.post(path,...args);
        }};export const useApiClient=()=>slow;`
  },
}, react()], resolve: { alias: { '@': path.join(root, 'src') } }, server: { host: '127.0.0.1', port: 0, fs: { allow: [path.resolve('.')] } }, logLevel: 'error' })
let browser, socket
try {
  await server.listen()
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`
  const profile = path.join(output, 'browser-profile-' + process.pid)
  const executable = process.env.PAGE_REVIEW_BROWSER || 'C:/Program Files (x86)/Microsoft/EdgeCore/155.0.4283.62/msedge.exe'
  browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
  let target, browserOutput = ''
  browser.stderr.on('data', data => { browserOutput += data.toString() })
  browser.on('error', error => { browserOutput += error.message })
  for (let i=0;i<60;i++) {
    try { const port=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];target=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();break }
    catch { await new Promise(resolve=>setTimeout(resolve,100)) }
  }
  assert(target, 'No fue posible iniciar Edge: '+browserOutput.slice(-1500))
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject})
  const pending = new Map(), errors = [], results = []
  let sequence=0
  socket.onmessage=event=>{
    const message=JSON.parse(event.data)
    if(message.id){const task=pending.get(message.id);pending.delete(message.id);message.error?task.reject(Error(message.error.message)):task.resolve(message.result)}
    if(message.method==='Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text)
    if(message.method==='Runtime.consoleAPICalled' && message.params.type==='error') errors.push(message.params.args.map(a=>a.value||a.description).join(' '))
    if(message.method==='Fetch.requestPaused') {
      const allowed=new URL(message.params.request.url).origin===origin
      if(!allowed)errors.push('Solicitud externa bloqueada: '+new URL(message.params.request.url).origin)
      void send(allowed?'Fetch.continueRequest':'Fetch.failRequest', {requestId:message.params.requestId,...(allowed?{}:{errorReason:'BlockedByClient'})})
    }
  }
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))})
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value}
  await send('Page.enable'); await send('Runtime.enable')
  await send('Fetch.enable',{patterns:[{urlPattern:'*'}]})
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]})
  async function open(id) {
    await send('Page.navigate',{url:`${origin}/verify/dist/loading-review/index.html?page=${id}`})
    async function waitFor(expression) {
      for(let i=0;i<400;i++){if(await evaluate(expression))return;await new Promise(resolve=>setTimeout(resolve,50))}
      assert.fail(`${id}: no apareció el control esperado. ${await evaluate('document.body.innerText.slice(-1500)')}`)
    }
    async function enterPin(selector) {
      await waitFor(`!!document.querySelector(${JSON.stringify(selector)})`)
      await evaluate('new Promise(resolve=>setTimeout(resolve,50))')
      await evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'123456');input.dispatchEvent(new Event('input',{bubbles:true}))})()`)
      await evaluate('new Promise(resolve=>setTimeout(resolve,20))')
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).closest('form').requestSubmit()`)
    }
    if(['pin-move','pin-calendar','pin-user-edit'].includes(id))await enterPin('input[type="password"]')
    if(id==='pin-profile-ack') {
      await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Aceptar'&&!b.disabled)`)
      await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Aceptar').click()`)
    }
    if(['pin-profile-request','pin-profile-confirm'].includes(id)) {
      await waitFor(`!!document.querySelector('[aria-labelledby="personal-information-title"] dd')`)
      await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Recuperar PIN')).click()`)
      await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Generar codigo'&&!b.disabled)`)
      await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Generar codigo').click()`)
      if(id==='pin-profile-confirm')await enterPin('[role="dialog"] input')
    }
    if(id==='orders'){
      for(let i=0;i<400;i++){if(await evaluate('!!document.querySelector("#sales-note-code")'))break;await new Promise(resolve=>setTimeout(resolve,50))}
      await evaluate(`(()=>{const input=document.querySelector('#sales-note-code');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'NV-2026-fixture');input.dispatchEvent(new Event('input',{bubbles:true}))})()`)
      await evaluate('new Promise(resolve=>setTimeout(resolve,20))')
      await evaluate(`document.querySelector('#sales-note-code').closest('form').requestSubmit()`)
    }
    for(let i=0;i<400;i++){if(await evaluate('!!document.querySelector(".itecsa-loading")'))return;await new Promise(resolve=>setTimeout(resolve,50))}
    assert.fail(`${id}: no apareció el indicador. ${errors.join('; ')} ${await evaluate('document.body.innerText.slice(-2000)')}`)
  }
  async function check(id,width) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false})
    await evaluate('new Promise(resolve=>setTimeout(resolve,250))')
    const state=await evaluate(`(()=>{
      const channels=color=>(color.match(/[0-9.]+/g)||[]).map(Number);
      const luminance=c=>c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
      const contrast=n=>{let bg=[255,255,255],layers=[];for(let p=n;p;p=p.parentElement)layers.push(channels(getComputedStyle(p).backgroundColor));for(const layer of layers.reverse()){const a=layer[3]??1;bg=bg.map((v,i)=>v*(1-a)+(layer[i]??v)*a)}const values=[luminance(bg),luminance(channels(getComputedStyle(n).color))].sort((a,b)=>b-a);return(values[0]+.05)/(values[1]+.05)};
      const nodes=[...document.querySelectorAll('.itecsa-loading')].filter(n=>{const r=n.getBoundingClientRect();return r.width&&r.right>0&&r.left<innerWidth&&n.checkVisibility()});
      return {overflow:document.documentElement.scrollWidth>innerWidth+1,indicators:nodes.map(n=>{const r=n.getBoundingClientRect(),p=n.parentElement.getBoundingClientRect(),s=getComputedStyle(n),svg=n.querySelector('svg'),a=n.querySelector('.itecsa-loading__arc');return {scope:n.dataset.scope,surface:n.dataset.surface,text:n.textContent,role:n.getAttribute('role'),color:s.color,contrast:contrast(n),minimumContrast:parseFloat(s.fontSize)>=24||(parseFloat(s.fontSize)>=18.66&&Number(s.fontWeight)>=700)?3:4.5,stroke:getComputedStyle(a).stroke,animation:getComputedStyle(a).animationName,ring:svg.getBoundingClientRect().width,fits:r.left>=p.left-1&&r.right<=p.right+1}})}
    })()`)
    assert(state.indicators.length, `${id} ${width}: falta carga visible`)
    assert(!state.overflow,`${id} ${width}: desbordamiento horizontal ${state.overflow ? JSON.stringify(await evaluate("[...document.querySelectorAll('main *')].filter(n=>n.checkVisibility()&&n.getBoundingClientRect().right>innerWidth+1).slice(-8).map(n=>({tag:n.tagName,cls:n.className,text:n.textContent.slice(0,90),width:n.getBoundingClientRect().width,right:n.getBoundingClientRect().right}))")) : ''}`)
    for(const indicator of state.indicators){assert(indicator.fits,`${id}: indicador fuera de su contenedor`);assert(indicator.contrast>=indicator.minimumContrast,`${id}: contraste de texto insuficiente ${JSON.stringify(indicator)}`);assert(indicator.text.includes('Cargando...'));assert.equal(indicator.animation,'itecsa-loading-turn');assert.equal(indicator.stroke,indicator.surface==='dark'?'rgb(255, 255, 255)':'rgb(254, 90, 0)')}
    results.push({id,width,...state})
  }
  for (const id of (process.argv[2]?.split(',') || ['gallery','modal','guard','native',...pages.map(([id])=>id)])) {
    await open(id)
    for(const width of [320,375,768,1440]) await check(id,width)
    if(id==='gallery') {
      const before=await evaluate(`document.querySelector('[data-action="dark"]').getBoundingClientRect().width`)
      await evaluate(`document.querySelector('[data-action="dark"]').click()`)
      const after=await evaluate(`document.querySelector('[data-action="dark"]').getBoundingClientRect().width`)
      assert.equal(before,after,'La acción cambia de ancho al cargar')
      for(const width of [320,375,768,1440])await check('gallery-busy',width)
    }
    if(id==='gallery'||id.startsWith('pin-')) {
      const readTransforms=`[...document.querySelectorAll('.itecsa-loading__arc')].filter(n=>n.checkVisibility()).map(n=>getComputedStyle(n).transform)`
      const normalTransforms=await evaluate(readTransforms)
      await evaluate('new Promise(resolve=>setTimeout(resolve,180))')
      assert((await evaluate(readTransforms)).every((value,i)=>value!==normalTransforms[i]),`${id}: todos los círculos deben girar`)
      await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]})
      assert(await evaluate(`[...document.querySelectorAll('.itecsa-loading__arc')].every(n=>{const s=getComputedStyle(n);return s.animationName==='itecsa-loading-turn'&&s.animationDuration==='3.2s'})`),'Movimiento reducido conserva un giro lento')
      const reducedTransforms=await evaluate(readTransforms)
      await evaluate('new Promise(resolve=>setTimeout(resolve,180))')
      assert((await evaluate(readTransforms)).every((value,i)=>value!==reducedTransforms[i]),`${id}: todos los círculos deben girar con movimiento reducido`)
      await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]})
    }
    const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
    await writeFile(path.join(output,id+'.png'),Buffer.from(screenshot.data,'base64'))
    if(!id.startsWith('pin-')&&!['gallery','modal','guard','native'].includes(id)){
      await evaluate('window.__releaseLoading()')
      for(let i=0;i<100;i++){if(await evaluate('!document.querySelector(".itecsa-loading")'))break;await new Promise(resolve=>setTimeout(resolve,50))}
      assert(await evaluate('!document.querySelector(".itecsa-loading")'),`${id}: no termina la carga sintética`)
    }
    console.log(`${id}: carga contenida y responsive verificada`)
  }
  assert.deepEqual(errors,[],'Excepciones en navegador')
  const resultFile=process.argv[2]?.split(',').every(id=>id.startsWith('pin-'))?'results-pin.json':process.argv[2]?`results-${process.argv[2].replaceAll(',','-')}.json`:'results.json'
  await writeFile(path.join(output,resultFile),JSON.stringify(results,null,2))
  console.log(`${results.length} escenarios de carga; sin desbordamientos ni excepciones.`)
} finally { socket?.close();browser?.kill();await server.close() }

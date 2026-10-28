// Local browser fixtures only: real profile/layout/modal, no business services.
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createServer } from '../capaVista/node_modules/vite/dist/node/index.js'
import react from '../capaVista/node_modules/@vitejs/plugin-react/dist/index.js'

const before = process.argv.includes('--before'), version = before ? 'before' : 'after'
const root = path.resolve('capaVista'), output = path.resolve('tmp/opt08/browser-' + version)
await mkdir(output, { recursive: true })
const fixture = `
import React from 'react'; import {createRoot} from 'react-dom/client';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import AppLayout from '/src/shared/components/layout/AppLayout.jsx';
import ProfilePage from '/src/modules/profile/pages/ProfilePage.jsx';
import ToastProvider from '/src/shared/notifications/ToastProvider.jsx';
import 'bootstrap/dist/css/bootstrap.min.css'; import 'bootstrap-icons/font/bootstrap-icons.css';
import '/src/styles/theme.css'; import '/src/styles/global.css'; import '/src/styles/bootstrap-overrides.css';
window.profiles=[];
createRoot(document.getElementById('root')).render(<React.Profiler id="profile" onRender={(_id,phase,duration)=>window.profiles.push({phase,duration})}><ToastProvider><MemoryRouter initialEntries={['/perfil']}><Routes><Route element={<AppLayout/>}><Route path="/perfil" element={<ProfilePage/>}/></Route></Routes></MemoryRouter></ToastProvider></React.Profiler>);
`
const mocks = `
import {createAuthApi} from '/src/modules/auth/api/authApi.js';
const mode=new URLSearchParams(location.search).get('mode');
export const auth={user:{sub:'fixture',primerNombre:'Nombre'.repeat(12),apellidoPaterno:'Apellido'.repeat(10),email:'correo'.repeat(20)+'@example.invalid',rutUsuario:'Sintético',rolUsuario:'Soporte',estadoUsuario:'Activo'},identityUser:{sub:'fixture'},provider:'keycloak',pinStatus:mode==='pending'?'pending_acknowledgement':'active',hasPermission:()=>true,logout(){},refreshSession:async()=>{}};
const records=Array.from({length:10},(_,i)=>({id:100-i,detail:'Detalle de actividad sintética '+('ReferenciaLarga'.repeat(30)),dateTime:'2024-09-08T04:00:00Z'}));
window.calls=[];
export const client={get:async url=>{window.calls.push(url);if(mode==='error'&&url.startsWith('/auth/profile'))throw Error('Synthetic error');if(url.startsWith('/auth/profile/movements'))return {records,total:10000,page:1,perPage:10};if(url==='/auth/profile')return {...auth.user,records};if(url.includes('notifications'))return {notifications:[],unreadCount:0};return []},post:async url=>{window.calls.push(url);if(url==='/auth/pin/reveal')return {pin:'314159'};return null}};
export const api=createAuthApi(client,{subject:'fixture'});
export const beginPinRecovery=()=>{let reject;const result=new Promise((_,r)=>{reject=r});return {result,cancel:()=>reject(Error('Recuperación cancelada.'))}};
`
const server = await createServer({ root, configFile: false, plugins: [{ name: 'opt08-local-fixture', enforce: 'pre',
    resolveId(source) {
        if (source === '/opt08-fixture.jsx') return path.join(root, 'opt08-entry.jsx')
        if (source === 'opt08-mocks') return '\0opt08-mocks'
        if (/(?:^|\/)useAuth(?:\.js)?$/.test(source)) return '\0opt08-auth'
        if (/(?:^|\/)useAuthApi(?:\.js)?$/.test(source)) return '\0opt08-api'
        if (/(?:^|\/)useApiClient(?:\.js)?$/.test(source)) return '\0opt08-client'
        if (source.endsWith('/auth/pinRecoveryBrowser') || source.endsWith('/auth/pinRecoveryBrowser.js')) return '\0opt08-recovery'
    },
    load(id) {
        if (id.replaceAll('\\', '/') === path.join(root, 'opt08-entry.jsx').replaceAll('\\', '/')) return fixture
        if (id === '\0opt08-mocks') return mocks
        if (id === '\0opt08-auth') return "import {auth} from 'opt08-mocks'; export const useAuth=()=>auth;"
        if (id === '\0opt08-api') return "import {api} from 'opt08-mocks'; export const useAuthApi=()=>api;"
        if (id === '\0opt08-client') return "import {client} from 'opt08-mocks'; export const useApiClient=()=>client;"
        if (id === '\0opt08-recovery') return "export {beginPinRecovery} from 'opt08-mocks';export const getPinRecoveryOutcome=()=>null;export const clearPinRecoveryOutcome=()=>{};"
        const file = id.replaceAll('\\', '/').split('?')[0]
        if (before && ['/modules/profile/pages/ProfilePage.jsx', '/modules/profile/utils/profileFormatters.js', '/modules/auth/api/authApi.js', '/modules/profile/pages/ProfilePage.module.css', '/modules/users/components/UserMovementsModal.module.css'].some(s => file.endsWith(s))) {
            const relative = path.relative(path.resolve('.'), file).replaceAll('\\', '/')
            return execFileSync('git', ['show', 'b71fd33:' + relative], { encoding: 'utf8', windowsHide: true })
        }
    },
    configureServer(s) { s.middlewares.use('/opt08', async (_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(await s.transformIndexHtml('/opt08', '<!doctype html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/opt08-fixture.jsx"></script></body></html>')) }) },
}, react()], resolve: { alias: { '@': path.join(root, 'src') } }, server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' })
let browser, socket
try {
    await server.listen()
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`, profile = path.join(output, 'browser-profile-' + process.pid)
    browser = spawn(process.env.PAGE_REVIEW_BROWSER || 'C:/Program Files (x86)/Microsoft/EdgeCore/155.0.4283.62/msedge.exe',
        ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'],
        { windowsHide: true, stdio: 'ignore' })
    let target
    for (let i = 0; i < 50; i++) {
        try { const port = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json(); break }
        catch { await new Promise(r => setTimeout(r, 100)) }
    }
    assert(target, 'Browser unavailable')
    socket = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r, j) => { socket.onopen = r; socket.onerror = j })
    let seq = 0; const pending = new Map(), errors = []
    socket.onmessage = event => {
        const m = JSON.parse(event.data)
        if (m.id) { const task = pending.get(m.id); pending.delete(m.id); m.error ? task.reject(Error(m.error.message)) : task.resolve(m.result) }
        if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)
    }
    const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) })
    const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value }
    await send('Page.enable'); await send('Runtime.enable')
    const results = [], render = []
    async function navigate(mode) {
        await send('Page.navigate', { url: `${origin}/opt08?mode=${mode}` })
        for (let i = 0; i < 80; i++) {
            if (await evaluate("!!document.querySelector('[data-page-header]') && (window.calls||[]).some(x=>x==='/auth/profile')")) break
            await new Promise(r => setTimeout(r, 100))
        }
        assert(await evaluate("!!document.querySelector('[data-page-header]')"), errors.join('; ') || await evaluate('document.body.innerText'))
        await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
        if (mode === 'history') await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Ver historial completo')).click()")
        if (mode === 'recovery') await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Recuperar PIN')).click()")
        await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
    }
    for (const mode of ['active', 'history', 'pending', 'recovery', 'error']) {
        await navigate(mode)
        for (const width of [320, 375, 430, 768, 1024, 1440, 1920]) {
            await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false })
            await evaluate('new Promise(r=>setTimeout(r,350))')
            await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
            const geometry = await evaluate(`(()=>{const dialog=document.querySelector('dialog[open], [role="dialog"]');const el=dialog||document.querySelector('main');const box=el.getBoundingClientRect(), main=document.querySelector('main').getBoundingClientRect();return {pageOverflow:document.documentElement.scrollWidth>innerWidth+1,contentOverflow:el.scrollWidth>el.clientWidth+1,mainFits:main.left>=-1&&main.right<=innerWidth+1,dialogFits:!dialog||(box.left>=-1&&box.right<=innerWidth+1),profileRequests:window.calls.filter(x=>x==='/auth/profile').length,revealRequests:window.calls.filter(x=>x==='/auth/pin/reveal').length,storageContainsSecret:[...Object.values(localStorage),...Object.values(sessionStorage)].some(x=>x.includes('314159'))}})()`)
            results.push({ mode, width, ...geometry })
        }
        await evaluate('document.documentElement.style.zoom="2"')
        await evaluate('new Promise(r=>setTimeout(r,350))')
        results.push({ mode, width: 1920, zoom: 2, ...await evaluate("(()=>{const e=document.querySelector('dialog[open], [role=dialog]')||document.querySelector('main');return {pageOverflow:document.documentElement.scrollWidth>innerWidth+1,contentOverflow:e.scrollWidth>e.clientWidth+1}})()") })
        await evaluate('document.documentElement.style.zoom=""')
        await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 1000, deviceScaleFactor: 1, mobile: false })
        await evaluate('new Promise(r=>setTimeout(r,350))')
        if (mode === 'active' || mode === 'history') {
            const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
            await writeFile(path.join(output, mode + '.png'), Buffer.from(shot.data, 'base64'))
        }
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
        assert(await evaluate('document.activeElement.tagName!=="BODY"'), mode + ' keyboard focus')
    }
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
    for (let i = 0; i < 5; i++) {
        await navigate('active')
        render.push(await evaluate('({phase:"profile",actualDuration:window.profiles.reduce((s,x)=>s+x.duration,0)})'))
        const value = await evaluate(`(async()=>{window.profiles=[];const start=performance.now();[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Ver historial completo')).click();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return {phase:'modal',twoFrameMs:performance.now()-start,actualDuration:window.profiles.reduce((s,x)=>s+x.duration,0)}})()`)
        render.push(value)
    }
    const report = { version, reference: 'b71fd33', methodology: 'Actual components with synthetic account, 10 long records and total10000; local Vite development profiler, no real HTTP/Keycloak E2E. Five warm render samples. Geometry checks at 7 widths plus 200% zoom, keyboard Tab, secret-storage inspection.', results, render, errors }
    await writeFile(path.resolve(`docs/OPT-08_RESPONSIVE_${version.toUpperCase()}.json`), JSON.stringify(report, null, 2) + '\n')
    assert.deepEqual(errors, [])
    assert(results.every(r => !r.storageContainsSecret))
    if (!before) assert(results.every(r => !r.pageOverflow && !r.contentOverflow && r.dialogFits !== false && r.mainFits !== false), 'Responsive overflow; inspect report')
    console.log(version, results.length, 'scenarios; overflows:', results.filter(r => r.pageOverflow || r.contentOverflow || r.dialogFits === false).length)
} finally {
    socket?.close()
    if (browser && browser.exitCode === null) { browser.kill(); await new Promise(r => browser.once('exit', r)) }
    await server.close()
}

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createServer } from '../capaVista/node_modules/vite/dist/node/index.js'
import react from '../capaVista/node_modules/@vitejs/plugin-react/dist/index.js'
import { pages } from '../capaVista/verify/pageFixtures.js'

// Monta los componentes reales en AppLayout con identidad/API sintéticas.
// El servidor solo escucha en localhost; no inicia sesión ni escribe datos reales.
const root = path.resolve('capaVista')
const output = path.join(root, 'dist/page-layout-review')
const selected = pages.filter(([id]) => !process.argv[2] || process.argv[2].split(',').includes(id))
assert(selected.length, 'Indica páginas válidas o deja el argumento vacío para revisar las 14.')
await mkdir(output, { recursive: true })
await writeFile(path.join(output, 'index.html'), '<!doctype html><html lang="es"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="./fixture.jsx"></script></html>')
await writeFile(path.join(output, 'fixture.jsx'), `
import React from 'react'; import {createRoot} from 'react-dom/client';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import AppLayout from '/src/shared/components/layout/AppLayout.jsx';
import 'bootstrap/dist/css/bootstrap.min.css'; import 'bootstrap-icons/font/bootstrap-icons.css';
import '/src/styles/theme.css'; import '/src/styles/global.css'; import '/src/styles/bootstrap-overrides.css';
${selected.map(([id, , file], i) => `import Page${i} from '/src/modules/${file}.jsx';`).join('\n')}
const routes=${JSON.stringify(selected.map(([id, url]) => [id, url]))};
const id=new URLSearchParams(location.search).get('page') || routes[0][0];
createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={[routes.find(r=>r[0]===id)[1]]}><Routes><Route element={<AppLayout/>}>
${selected.map(([, url], i) => `<Route path="${url.replace('/123', '/:orderId').replace('/1', '/:messageId')}" element={<Page${i}/>}/>`).join('\n')}
</Route></Routes></MemoryRouter>);
`)
const server = await createServer({ root, configFile: false, plugins: [{
  name: 'isolated-page-review', enforce: 'pre',
  resolveId(source) {
    if (/(?:^|\/)useAuth(?:\.js)?$/.test(source)) return '\0review-auth'
    if (/(?:^|\/)useApiClient(?:\.js)?$/.test(source)) return '\0review-client'
  },
  load(id) {
    if (id === '\0review-auth') return "import {auth} from '/verify/pageFixtures.js'; export const useAuth=()=>auth;"
    if (id === '\0review-client') return "import {client} from '/verify/pageFixtures.js'; export const useApiClient=()=>client;"
  },
}, react()], resolve: { alias: { '@': path.join(root, 'src') } }, server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' })
let browser, socket, target
try {
  await server.listen()
  const address = server.httpServer.address()
  const origin = `http://127.0.0.1:${address.port}`
  let debugPort
  const profile = path.join(output, 'browser-profile-' + process.pid)
  const executable = process.env.PAGE_REVIEW_BROWSER || 'C:/Program Files (x86)/Microsoft/EdgeCore/155.0.4283.62/msedge.exe'
  browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
  let browserOutput = ''
  browser.stderr.on('data', data => { browserOutput += data.toString() })
  browser.on('error', error => console.error(error.message))
  for (let attempt = 0; attempt < 50; attempt++) {
    try { debugPort = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; target = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' })).json(); break }
    catch { await new Promise(resolve => setTimeout(resolve, 100)) }
  }
  assert(target, 'No fue posible abrir el navegador de revisión. ' + browserOutput.slice(-2000))
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
  let sequence = 0
  const pending = new Map(), errors = []
  socket.onmessage = event => {
    const message = JSON.parse(event.data)
    if (message.id) { const task = pending.get(message.id); pending.delete(message.id); message.error ? task.reject(Error(message.error.message)) : task.resolve(message.result) }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text)
  }
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) })
  const evaluate = async expression => {
    const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (response.exceptionDetails) throw Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text)
    return response.result.value
  }
  await send('Page.enable'); await send('Runtime.enable')
  const results = []
  for (const [id] of selected) {
    await send('Page.navigate', { url: `${origin}/dist/page-layout-review/index.html?page=${id}` })
    for (let n = 0; n < 100; n++) { if (await evaluate('!!document.querySelector("[data-page-header]")')) break; await new Promise(resolve => setTimeout(resolve, 100)) }
    assert.equal(await evaluate('!!document.querySelector("[data-page-header]")'), true, `${id}: falta banner; ${errors.join('; ')}`)
    for (const width of [320, 360, 375, 390, 430, 576, 768, 992, 1024, 1200, 1440, 1920]) {
      for (const collapsed of width >= 992 ? [false, true] : [false]) {
        await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false })
        await evaluate(`(() => { const label=${JSON.stringify(collapsed ? 'Cerrar barra lateral' : 'Abrir barra lateral')}; document.querySelector('button[aria-label="'+label+'"]')?.click(); })()`)
        await evaluate('new Promise(resolve=>setTimeout(resolve,250))')
        const geometry = await evaluate(`(() => {
          const header=document.querySelector('[data-page-header]'), title=header.querySelector('h1'), main=document.querySelector('main');
          const h=header.getBoundingClientRect(), t=title.getBoundingClientRect(), m=main.getBoundingClientRect(), s=getComputedStyle(header), ts=getComputedStyle(title);
          const side=(m.width-h.width)/2;
          const controls=[...header.querySelectorAll('button,a')].map(node=>{const r=node.getBoundingClientRect();return r.width>0&&r.left>=h.left&&r.right<=h.right&&r.top>=h.top&&r.bottom<=h.bottom});
          const stripeVisible=[0.05,0.5,0.95].every(position=>document.elementFromPoint(h.left+h.width*position,h.bottom-2)===header);
          return { left:h.left-m.left,right:m.right-h.right,side,background:s.backgroundColor,stripe:s.borderBottomColor,thickness:s.borderBottomWidth,stripeVisible,titleColor:ts.color,weight:ts.fontWeight,title: title.textContent, titleFits:t.right<=h.right&&t.left>=h.left, controlsFit:controls.every(Boolean), mainCount:document.querySelectorAll('main').length,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,font:ts.fontSize };
        })()`)
        assert.equal(geometry.background, 'rgb(0, 0, 0)', `${id} negro`)
        assert.equal(geometry.stripe, 'rgb(254, 90, 0)', `${id} naranja`)
        assert.equal(geometry.thickness, '4px')
        assert(geometry.stripeVisible, `${id} ${width}: otro elemento tapa la franja naranja`)
        assert.equal(geometry.titleColor, 'rgb(255, 255, 255)')
        assert.equal(geometry.weight, '700')
        assert.equal(geometry.mainCount, 1, `${id}: main anidado`)
        assert(Math.abs(geometry.left-geometry.right)<1.1, `${id} ${width}: márgenes asimétricos ${JSON.stringify(geometry)}`)
        assert(geometry.left >= 20 && geometry.titleFits, `${id} ${width}: espacio/título ${JSON.stringify(geometry)}`)
        assert(geometry.controlsFit, `${id} ${width}: acciones fuera del banner`)
        assert(!geometry.overflow, `${id} ${width}: overflow horizontal ${JSON.stringify(geometry)}`)
        results.push({ id, width, collapsed, ...geometry })
      }
    }
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    await writeFile(path.join(output, `${id}-desktop.png`), Buffer.from(shot.data, 'base64'))
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 1000, deviceScaleFactor: 1, mobile: false })
    await evaluate('new Promise(resolve=>setTimeout(resolve,100))')
    const mobile = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    await writeFile(path.join(output, `${id}-mobile.png`), Buffer.from(mobile.data, 'base64'))
    if (id === 'calendar') {
      assert(await evaluate(`(() => { const b=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Mostrar filtros')); b.focus(); b.click(); return true })()`))
      await evaluate('new Promise(resolve=>setTimeout(resolve,50))')
      assert(await evaluate(`document.activeElement.textContent.includes('Ocultar filtros')`), 'El botón conserva el foco al desplegar filtros')
      await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Ocultar filtros')).click()`)
    }
    if (id === 'kanban') {
      await evaluate(`document.querySelector('[aria-label="Configurar carga operativa"]').click()`)
      await evaluate('new Promise(resolve=>setTimeout(resolve,50))')
      const overlay = await evaluate(`(() => {const r=document.querySelector('[role="dialog"]').parentElement.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,viewport:document.documentElement.clientWidth}})()`)
      assert.equal(overlay.left, 0, 'El contenedor de página no desplaza modales fijos')
      assert.equal(overlay.top, 0)
      assert.equal(overlay.width, overlay.viewport)
      await evaluate(`document.querySelector('[role="dialog"] header button').click()`)
    }
    const titleText = await evaluate(`document.querySelector('[data-page-header] h1').textContent`)
    await evaluate(`document.querySelector('[data-page-header] h1').textContent='SOLICITUDES SOBRE MIS DATOS Y UN TÍTULO LARGO SIN RECORTES '+ 'IDENTIFICADOR'.repeat(8)`)
    assert(await evaluate(`(() => {const h=document.querySelector('[data-page-header]'),t=h.querySelector('h1');return t.getBoundingClientRect().right<=h.getBoundingClientRect().right && t.scrollWidth<=t.clientWidth+1})()`), `${id}: título largo`)
    await evaluate(`document.querySelector('[data-page-header] h1').textContent=${JSON.stringify(titleText)}`)
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
    await evaluate('document.documentElement.style.zoom="2"')
    assert(await evaluate(`(() => {const h=document.querySelector('[data-page-header]').getBoundingClientRect();return h.right<=innerWidth&&h.left>=0})()`), `${id}: zoom CSS 200%`)
    await evaluate('document.documentElement.style.zoom=""')
    const controls = await evaluate(`(() => { const h=document.querySelector('[data-page-header]');const b=h.querySelector('button,a'); if(!b)return false;b.focus();return document.activeElement===b;})()`)
    if (controls) {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
      assert(await evaluate('document.activeElement.tagName!=="BODY"'), `${id}: navegación con Tab`)
    }
    console.log(`${id}: ${results.filter(result=>result.id===id).length} escenarios verificados`)
  }
  assert.deepEqual(errors, [], 'Excepciones de navegador')
  await writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2))
  const overflows = results.filter(result=>result.overflow)
  console.log(`${results.length} escenarios; ${overflows.length} con overflow de contenido (consultar results.json).`)
} finally {
  socket?.close()
  browser?.kill()
  await server.close()
}

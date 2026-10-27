import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createServer } from '../capaVista/node_modules/vite/dist/node/index.js'
import react from '../capaVista/node_modules/@vitejs/plugin-react/dist/index.js'
import { pages } from '../capaVista/verify/pageFixtures.js'

const root = path.resolve('capaVista'), output = path.resolve('dist/toast-review')
await mkdir(output, { recursive: true })
const server = await createServer({ root, configFile: false, appType: 'mpa', plugins: [{
  name: 'synthetic-notification-review', enforce: 'pre',
  resolveId(source) {
    if (/(?:^|\/)useAuth(?:\.js)?$/.test(source)) return '\0toast-auth'
    if (/(?:^|\/)useApiClient(?:\.js)?$/.test(source)) return '\0toast-api'
    if (/(?:^|\/)identityContext(?:\.js)?$/.test(source)) return '\0toast-identity'
  },
  load(id) {
    if (id === '\0toast-auth') return "import {auth} from '/verify/pageFixtures.js'; export const useAuth=()=>auth;"
    if (id === '\0toast-api') return "import {client} from '/verify/pageFixtures.js'; export const useApiClient=()=>client;"
    if (id === '\0toast-identity') return "const getRecoveryRefreshToken=async()=>{throw Error('Disabled in visual review')}; export const useIdentity=()=>({getRecoveryRefreshToken});"
  },
}, react()], resolve: { alias: { '@': path.join(root, 'src') } }, server: { host: '127.0.0.1', port: 0, fs: { allow: [root, path.resolve('shared')] } }, logLevel: 'error' })
let browser, socket
try {
  await server.listen()
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`
  const profile = path.join(output, 'browser-profile-' + process.pid)
  const executable = process.env.PAGE_REVIEW_BROWSER || 'C:/Program Files (x86)/Microsoft/EdgeCore/155.0.4283.62/msedge.exe'
  browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
  browser.on('error', error => console.error(error.message))
  let target
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const port = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]
      target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json()
      break
    } catch { await new Promise(resolve => setTimeout(resolve, 100)) }
  }
  assert(target, 'No fue posible abrir Edge para la revisión visual')
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
  let sequence = 0
  const pending = new Map(), errors = []
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }))
  })
  socket.onmessage = event => {
    const message = JSON.parse(event.data)
    if (message.id) {
      const task = pending.get(message.id); pending.delete(message.id)
      message.error ? task.reject(Error(message.error.message)) : task.resolve(message.result)
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text)
    if (message.method === 'Fetch.requestPaused') {
      const { requestId, request } = message.params
      void send(request.url.startsWith(origin + '/') ? 'Fetch.continueRequest' : 'Fetch.failRequest', {
        requestId, ...(request.url.startsWith(origin + '/') ? {} : { errorReason: 'BlockedByClient' }),
      })
    }
  }
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
    return result.result.value
  }
  await send('Runtime.enable'); await send('Page.enable'); await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] })
  const delay = ms => evaluate(`new Promise(resolve=>setTimeout(resolve,${ms}))`)
  const emit = () => evaluate(`(()=>{reviewToasts.clear(); reviewToasts.success('Usuario actualizado correctamente.'); reviewToasts.error('No fue posible completar la operación. Intenta nuevamente.'); reviewToasts.warning('Debes confirmar el pago antes de mover este pedido.'); reviewToasts.info('Nuevo mensaje recibido.');})()`)
  const measure = () => evaluate(`(()=>{
    const host=document.querySelector('[data-toast-viewport]'),r=host.getBoundingClientRect(),css=getComputedStyle(host);
    const cards=[...host.querySelectorAll('article')].map(card=>{const c=getComputedStyle(card),b=card.getBoundingClientRect(),icon=card.querySelector('svg').parentElement;
      return {severity:card.dataset.severity,left:b.left,right:b.right,top:b.top,bottom:b.bottom,background:c.backgroundColor,text:getComputedStyle(card.querySelector('p')).color,border:c.borderLeftWidth,accent:c.borderLeftColor,icon:getComputedStyle(icon).color,iconBackground:getComputedStyle(icon).backgroundColor,radius:c.borderRadius,shadow:c.boxShadow,animation:c.animationName,role:card.querySelector('[role]').getAttribute('role')};});
    return {width:innerWidth,height:innerHeight,position:css.position,right:document.documentElement.clientWidth-r.right,bottom:innerHeight-r.bottom,hostHeight:r.height,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,cards};
  })()`)
  const results = []
  const luminance = color => color.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((value, component, i) => value + component * [.2126, .7152, .0722][i], 0)
  const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05)
  for (const [id] of pages) {
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
    await send('Page.navigate', { url: `${origin}/verify/toasts.html?page=${id}` })
    for (let n = 0; n < 100; n++) { if (await evaluate('!!window.reviewToasts && !!document.querySelector("[data-page-header]")')) break; await delay(100) }
    assert(await evaluate('!!window.reviewToasts && !!document.querySelector("[data-page-header]")'), `${id}: vista no montada ${errors.join('; ')}`)
    for (const width of id === 'users' ? [320, 375, 768, 1024, 1440] : [375, 1440]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false })
      await emit(); await delay(230)
      const geometry = await measure()
      assert.equal(geometry.position, 'fixed')
      assert(geometry.bottom >= 11 && geometry.bottom <= 21)
      assert(geometry.right >= 11 && geometry.right <= 21)
      assert(!geometry.overflow, `${id}/${width}: desbordamiento horizontal`)
      assert.equal(geometry.cards.length, width < 600 ? 2 : 3)
      assert(geometry.hostHeight <= 900 * .6 + 1)
      for (const card of geometry.cards) {
        assert.equal(card.background, 'rgb(255, 255, 255)')
        assert.equal(card.border, '4px'); assert.equal(card.accent, card.icon)
        assert(card.left >= 11 && card.right <= width - 11)
        assert.notEqual(card.shadow, 'none')
        assert(contrast(card.text, card.background) >= 4.5, `${id}: contraste del texto`)
        assert(contrast(card.icon, card.iconBackground) >= 3, `${id}: contraste del icono`)
      }
      results.push({ page: id, ...geometry })
      if (id === 'users') {
        const shot = await send('Page.captureScreenshot', { format: 'png' })
        await writeFile(path.join(output, `toasts-${width}.png`), Buffer.from(shot.data, 'base64'))
        if (width === 1024) {
          assert(await evaluate(`(()=>{const b=document.querySelector('button[aria-label="Cerrar barra lateral"]');if(!b)return false;b.click();return true})()`))
          await delay(250)
          assert.equal((await measure()).right, geometry.right, 'Sidebar cerrado conserva el anclaje')
          await evaluate(`document.querySelector('button[aria-label="Abrir barra lateral"]').click()`)
        }
      }
    }
    console.log(`${id}: páginas reales y toast inferior verificados`)
  }
  // All severities, FIFO, overflow, fixed scroll, modal isolation and keyboard focus.
  await emit(); await delay(220)
  await evaluate(`document.querySelector('[data-toast-viewport] button').click()`); await delay(200)
  assert(await evaluate(`!!document.querySelector('article[data-severity="info"]')`), 'Promoción FIFO de información')
  await evaluate(`reviewModal(true)`); await delay(50)
  assert(await evaluate(`!document.querySelector('[data-toast-viewport]').closest('[inert],[aria-hidden="true"]')`), 'Región viva no aislada por el modal')
  const closeVisible = await evaluate(`(()=>{const b=document.querySelector('[data-toast-viewport] button'),r=b.getBoundingClientRect();return b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})()`)
  assert(closeVisible, 'Aviso visible sobre el modal')
  await evaluate(`document.querySelector('[role="dialog"] input').focus()`)
  const before = await evaluate(`document.activeElement.tagName`)
  await evaluate(`reviewToasts.info('Aviso nuevo durante la edición.')`)
  assert.equal(await evaluate(`document.activeElement.tagName`), before, 'La emisión no roba el foco')
  await evaluate(`reviewModal(false); reviewToasts.clear(); reviewToasts.error('Texto largo '.repeat(60))`)
  await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 320, deviceScaleFactor: 1, mobile: false })
  await delay(220)
  let geometry = await measure()
  assert(!geometry.overflow && geometry.cards.length === 1 && geometry.hostHeight <= 193)
  await evaluate(`reviewModal(true)`); await delay(100)
  assert(await evaluate(`(()=>{const f=document.querySelector('[role="dialog"] footer').getBoundingClientRect(),t=document.querySelector('[data-toast-viewport]').getBoundingClientRect();return f.bottom<=t.top})()`), 'El aviso no tapa los controles del modal en baja altura')
  await evaluate(`reviewModal(false)`); await delay(50)
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  assert.equal((await measure()).cards[0].animation, 'none')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await evaluate(`document.documentElement.style.zoom='2'`)
  geometry = await measure()
  assert(geometry.cards.every(card=>card.left>=0 && card.right<=1440), 'Zoom 200%')
  await evaluate(`document.documentElement.style.zoom=''; reviewToasts.clear()`)
  await evaluate(`reviewToasts.info('Aviso fijo durante el scroll.'); const space=document.createElement('div');space.id='review-scroll';space.style.height='2000px';document.body.append(space);window.scrollTo(0,700)`)
  await delay(220)
  assert.equal((await measure()).bottom, 20, 'El scroll conserva el anclaje inferior')
  await evaluate(`document.querySelector('#review-scroll').remove(); window.scrollTo(0,0); document.querySelector('[data-toast-viewport] button').focus()`)
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers: 8 })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers: 8 })
  assert(await evaluate(`document.activeElement.tagName!=='BODY'`), 'Navegación por teclado')
  assert.deepEqual(errors, [], 'Excepciones del navegador')
  await writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2))
  console.log(`${results.length} escenarios responsive + modal, cola, movimiento reducido, baja altura y zoom verificados.`)
} finally {
  socket?.close(); browser?.kill(); await server.close()
}

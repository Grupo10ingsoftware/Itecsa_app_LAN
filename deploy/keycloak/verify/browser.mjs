import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Uses a disposable headless browser profile opened by the operator. No browser dependency.
const preview = path.resolve(process.argv[2] || 'dist/keycloak-preview');
const debugUrl = process.argv[3] || 'http://127.0.0.1:19226';
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.avif': 'image/avif', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  const filename = path.resolve(preview, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!filename.startsWith(preview + path.sep) || req.method !== 'GET') { res.writeHead(404).end(); return; }
  try { const content = await readFile(filename); res.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream' }).end(content); }
  catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let socket, target;
try {
  const response = await fetch(`${debugUrl}/json/new?about:blank`, { method: 'PUT' });
  assert(response.ok, 'Start the headless browser with a remote debugging port first.');
  target = await response.json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let sequence = 0;
  const pending = new Map(), events = new Map();
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const task = pending.get(message.id); if (!task) return; pending.delete(message.id);
      if (message.error) task.reject(Error(message.error.message)); else task.resolve(message.result);
    } else events.get(message.method)?.(message.params);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error('Browser assertion script failed: ' + result.exceptionDetails.text);
    return result.result.value;
  };
  const open = async (filename, width) => {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    const loaded = new Promise(resolve => events.set('Page.loadEventFired', resolve));
    await send('Page.navigate', { url: `${origin}/${filename}` });
    await loaded;
    assert.equal(await evaluate('document.documentElement.lang'), 'es');
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `${filename} overflows at ${width}px`);
  };
  await send('Page.enable');
  const screenshots = path.join(preview, 'screenshots'); await mkdir(screenshots, { recursive: true });
  const screenshot = async name => {
    const { cssContentSize } = await send('Page.getLayoutMetrics');
    const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: cssContentSize.width, height: cssContentSize.height, scale: 1 } });
    await writeFile(path.join(screenshots, name), Buffer.from(result.data, 'base64'));
  };
  let checks = 0;
  for (const width of [320, 375, 768, 1024, 1440]) {
    for (const filename of ['login.html', 'password.html', 'password-mismatch.html', 'recovery.html', 'recovery-info.html', 'expired.html', 'error.html']) {
      await open(filename, width); checks++;
      if (filename === 'password.html') {
        const layout = await evaluate(`(() => { const form = document.querySelector('.auth-card').getBoundingClientRect(); const requirements = document.querySelector('.requirements-card').getBoundingClientRect(); return {side: requirements.left >= form.right, below: requirements.top >= form.bottom}; })()`);
        assert(width >= 900 ? layout.side : layout.below, `Password card placement at ${width}px`);
      }
      if ([375, 1440].includes(width) && ['login.html', 'password.html'].includes(filename)) await screenshot(`${filename.replace('.html', '')}-${width}.png`);
    }
  }
  await open('password.html', 1440);
  const interaction = await evaluate(`(() => {
    const form = document.querySelector('form[data-password-update]');
    const password = form.querySelector('#password-new'), confirm = form.querySelector('#password-confirm');
    form.addEventListener('submit', event => event.preventDefault());
    password.value = 'Example1!'; password.dispatchEvent(new Event('input', {bubbles:true}));
    const fulfilled = document.querySelectorAll('[data-satisfied=true]').length;
    confirm.value = 'different'; confirm.dispatchEvent(new Event('input', {bubbles:true}));
    const mismatch = confirm.getAttribute('aria-invalid') === 'true' && document.querySelector('#password-confirm-error').textContent === 'Las contraseñas no coinciden';
    const toggle = form.querySelector('[data-toggle-password]'); toggle.click(); const visible = password.type === 'text'; toggle.click();
    password.value = ''; password.dispatchEvent(new Event('input', {bubbles:true}));
    const cleared = document.querySelectorAll('[data-satisfied=true]').length === 0;
    return {fulfilled, mismatch, visible, hidden: password.type === 'password', cleared};
  })()`);
  assert.deepEqual(interaction, { fulfilled: 5, mismatch: true, visible: true, hidden: true, cleared: true });
  await screenshot('password-validation-1440.png');
  await open('login.html', 375);
  await evaluate(`document.querySelector('#username').focus()`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  assert.equal(await evaluate('document.activeElement.id'), 'password');
  console.log(`${checks} responsive checks passed; visibility, policy indicators, mismatch and keyboard navigation passed.`);
  console.log(`Screenshots: ${screenshots}`);
} finally {
  socket?.close();
  if (target) await fetch(`${debugUrl}/json/close/${target.id}`).catch(() => {});
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}

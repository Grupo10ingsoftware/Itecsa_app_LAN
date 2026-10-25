import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

// Isolated Vite fixtures, real headless browser, synthetic API. No .env/Compose/production services.
const root = fileURLToPath(new URL('../', import.meta.url));
const image = 'sha256:4af8895559aa4a50f3793fabf42342517de8b50521dbcf7f193e46f118343c43';
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const production = process.argv.slice(2).includes('--production');
  const business = process.argv.slice(2).includes('--business');
  assert.deepEqual(process.argv.slice(2), business ? ['--run', '--production', '--business'] : production ? ['--run', '--production'] : ['--run'],
    'Uso: node scripts/keycloak-phase03-browser.mjs --run [--production [--business]]');
  const candidates = [process.env.ITECSA_BROWSER_BIN,
    join(process.env.LOCALAPPDATA || '', 'BraveSoftware/Brave-Browser/Application/brave.exe'),
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe'];
  const executable = candidates.filter(Boolean).find(existsSync);
  assert.ok(executable, 'Se requiere Chromium/Brave/Edge; definir ITECSA_BROWSER_BIN.');
  docker('image', 'inspect', image);
  const suffix = randomUUID().slice(0, 8), name = `itecsa-phase03-browser-${suffix}`;
  const profile = mkdtempSync(join(tmpdir(), 'itecsa-phase03-browser-'));
  let started = false, browser, socket;
  try {
    const mounts = ['src', 'test'].flatMap(dir => ['--mount', `type=bind,source=${join(root, 'capaVista', dir)},target=/app/capaVista/${dir},readonly`]);
    docker('run', '-d', '--name', name, '--label', `itecsa.phase03.browser=${suffix}`, '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges', '--pids-limit', '256', '-p', '127.0.0.1::5173', ...mounts,
      '--mount', `type=bind,source=${join(root, 'shared')},target=/app/shared,readonly`, image,
      'node', '--input-type=module', '-e',
      "import {createServer} from 'vite'; const s=await createServer({envDir:false,server:{host:'0.0.0.0',port:5173,strictPort:true,hmr:false}}); await s.listen();");
    started = true;
    const info = JSON.parse(docker('inspect', name))[0];
    const mapping = info.NetworkSettings.Ports['5173/tcp'][0];
    assert.equal(mapping.HostIp, '127.0.0.1');
    const origin = `http://127.0.0.1:${mapping.HostPort}`;
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { ready = (await fetch(origin + '/test/navigation.browser.html', { signal: AbortSignal.timeout(500) })).ok; } catch { /* owned server starting */ }
      if (ready) break;
      await pause(100);
    }
    assert.ok(ready, 'Vite de laboratorio no disponible');
    browser = spawn(executable, ['--headless=new', '--disable-gpu', '--disable-extensions', '--disable-background-networking',
      '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
    let spawnError;
    browser.on('error', error => { spawnError = error; });
    const activePort = join(profile, 'DevToolsActivePort');
    for (let i = 0; i < 100 && !existsSync(activePort) && !spawnError; i++) await pause(100);
    if (spawnError) throw spawnError;
    const [port] = readFileSync(activePort, 'utf8').split(/\r?\n/);
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
    assert.ok(target.webSocketDebuggerUrl, 'No fue posible crear pestaña de laboratorio');
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolveOpen, reject) => { socket.onopen = resolveOpen; socket.onerror = reject; });
    let id = 0;
    const pending = new Map();
    const exceptions = [];
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id); clearTimeout(request.timer);
      if (message.error) request.reject(Error(JSON.stringify(message.error))); else request.resolve(message.result);
    };
    const command = (method, params = {}) => new Promise((resolveCommand, reject) => {
      const requestId = ++id;
      const timer = setTimeout(() => { pending.delete(requestId); reject(Error(`CDP timeout: ${method}`)); }, 15000);
      pending.set(requestId, { resolve: resolveCommand, reject, timer });
      socket.send(JSON.stringify({ id: requestId, method, params }));
    });
    await command('Page.enable'); await command('Runtime.enable');
    console.log('Browser:', (await command('Browser.getVersion')).product);
    const fixtures = [
      ...(business ? [['business', 'BUSINESS_TEST_RESULT', 1440, 1000], ['business', 'BUSINESS_TEST_RESULT', 390, 844]] : []),
      ...(production ? [['production', 'PRODUCTION_TEST_RESULT', 1440, 1000], ['production', 'PRODUCTION_TEST_RESULT', 390, 844]] : []),
      ['navigation', 'NAVIGATION_TEST_RESULT', 1440, 1000],
      ['navigation', 'NAVIGATION_TEST_RESULT', 390, 844],
      ['authSession', 'AUTH_TEST_RESULT', 1440, 1000],
      ['metrics', 'METRICS_TEST_RESULT', 1440, 1000],
      ['paymentPin', 'PIN_TEST_RESULT', 1440, 1000],
    ];
    for (const [fixture, marker, width, height] of fixtures) {
      exceptions.length = 0;
      await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 992 });
      await command('Page.navigate', { url: `${origin}/test/${fixture}.browser.html?lab=${randomUUID()}` });
      let result;
      for (let i = 0; i < 450; i++) {
        assert.equal(exceptions.length, 0, exceptions.join('\n'));
        const response = await command('Runtime.evaluate', { expression: '(document.getElementById("result") || document.getElementById("results"))?.textContent', returnByValue: true });
        result = response.result?.value;
        if (result?.includes(`${marker}:PASS`) || result?.includes('FAIL:')) break;
        await pause(100);
      }
      assert.equal(result, `${marker}:PASS`, `${fixture} ${width}x${height}: ${result}`);
      const report = await command('Runtime.evaluate', { expression: 'JSON.stringify(window.__BUSINESS_REPORT__ || window.__PRODUCTION_REPORT__ || window.__NAVIGATION_REPORT__ || {})', returnByValue: true });
      console.log(`${fixture} ${width}x${height}: PASS ${report.result?.value}`);
    }
  } finally {
    socket?.close();
    if (browser && browser.exitCode === null) {
      browser.kill();
      await Promise.race([new Promise(resolveExit => browser.once('exit', resolveExit)), pause(5000)]);
    }
    if (started) {
      const info = JSON.parse(docker('inspect', name))[0];
      assert.equal(info.Config.Labels['itecsa.phase03.browser'], suffix);
      docker('rm', '-f', name);
    }
    const path = realpathSync(profile), temp = realpathSync(tmpdir()), rel = relative(temp, path);
    assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel) && resolve(path) === resolve(profile), 'Perfil fuera del temporal propio');
    rmSync(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

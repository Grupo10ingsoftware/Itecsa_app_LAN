import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, sep, join } from 'node:path'

import { createServer } from 'vite'

const browserCandidates = [
  process.env.ITECSA_BROWSER_BIN,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean)
const browserExecutable = browserCandidates.find(existsSync)
if (!browserExecutable) {
  throw new Error('Se requiere Edge o ITECSA_BROWSER_BIN para esta prueba interactiva.')
}

const profile = await mkdtemp(join(tmpdir(), 'itecsa-auth-session-'))
const server = await createServer({
  envDir: false,
  server: { host: '127.0.0.1', port: 0, hmr: false },
})

try {
  await server.listen()
  const port = server.httpServer.address().port
  const browser = spawn(browserExecutable, [
    '--headless=new',
    '--disable-gpu',
    '--disable-extensions',
    '--disable-background-networking',
    '--no-first-run',
    '--virtual-time-budget=12000',
    '--dump-dom',
    `--user-data-dir=${profile}`,
    `http://127.0.0.1:${port}/test/authSession.browser.html`,
  ], { windowsHide: true })

  let output = ''
  browser.stdout.setEncoding('utf8')
  browser.stdout.on('data', (chunk) => { output += chunk })
  browser.stderr.resume()
  const exitCode = await new Promise((resolveExit, reject) => {
    browser.on('error', reject)
    browser.on('close', resolveExit)
  })
  const result = output.match(/AUTH_TEST_RESULT:(PASS|FAIL:[^<]+)/)?.[1]
  assert.equal(exitCode, 0, 'Edge terminó con error')
  assert.equal(result, 'PASS', result ?? 'La prueba del PIN no terminó')
  console.log('Auth: SDK PKCE/callback/refresh y verificacion React simulados OK')
} finally {
  await server.close()
  const safeProfile = resolve(profile)
  const safeTemp = resolve(tmpdir())
  if (!safeProfile.startsWith(`${safeTemp}${sep}`)) {
    throw new Error('Ruta temporal de perfil fuera del directorio esperado')
  }
  await rm(safeProfile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
}

import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { MemoryRouter } from 'react-router-dom'
import 'bootstrap/dist/css/bootstrap.min.css'
import { AuthContext } from '../src/app/providers/authContext.js'
import { IdentityContext } from '../src/app/providers/identityContext.js'
import { ROLE_PERMISSIONS, can } from '../../shared/keycloakAuthorization.js'
import PaymentRowActions from '../src/modules/payments/components/PaymentRowActions.jsx'
import Topbar from '../src/shared/components/layout/Topbar.jsx'
import DataRequestsPage from '../src/modules/privacy/pages/DataRequestsPage.jsx'

const root = createRoot(document.getElementById('root'))
let checks = 0, currentSubject = 'A', session = 0
let holdPreviousRequest = false, releasePreviousRequest
const errors = []
window.addEventListener('error', event => errors.push(event.message))
window.addEventListener('unhandledrejection', event => errors.push(String(event.reason)))
const check = (value, message) => { checks++; if (!value) throw Error(message) }
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(predicate) { for (let i = 0; i < 150; i++) { if (predicate()) return; await pause(20) } throw Error('Timed out waiting for fixture UI') }
const originalFetch = window.fetch
window.fetch = async (url, options = {}) => {
  const target = new URL(url)
  check(target.origin === window.location.origin && ['/mock-api/messages/notifications', '/mock-api/privacy/documents'].includes(target.pathname), 'Only declared synthetic APIs are used')
  if (target.pathname === '/mock-api/privacy/documents') return new Response(JSON.stringify({ documents: [], requestsEnabled: true }), { headers: { 'content-type': 'application/json' } })
  const subject = new Headers(options.headers).get('authorization').split(' ').at(-1)
  if (subject === 'A' && holdPreviousRequest) await new Promise(resolve => { releasePreviousRequest = resolve })
  return new Response(JSON.stringify({ notifications: [{ id_mensaje: subject === 'A' ? 1 : 2,
    Asunto: subject + '-PERSONAL', contenido: 'Own synthetic message', fecha_publicacion: '2026-10-24T12:00:00Z' }], unreadCount: 1 }),
  { headers: { 'content-type': 'application/json' } })
}
function render(role, page, status = 'Pendiente') {
  const subject = currentSubject, sessionKey = session
  const auth = { provider: 'keycloak', user: { sub: subject, email: 'local-' + subject + '@example.invalid',
    primerNombre: subject, rolUsuario: role, permissions: ROLE_PERMISSIONS[role] },
    hasPermission: permission => can(role, ROLE_PERMISSIONS[role], permission) }
  const identity = { sessionKey, getSessionKey: () => session, getAccessToken: async () => subject }
  flushSync(() => root.render(<MemoryRouter><IdentityContext.Provider value={identity}><AuthContext.Provider value={auth}>
    {page === 'header' ? <Topbar /> : page === 'privacy' ? <DataRequestsPage /> : <PaymentRowActions editingStatus={{}} order={{ id: 1, paymentStatus: status }}
      canUpdatePaymentStatus={auth.hasPermission('update:payment-status')} onViewDetail={() => {}}
      onToggleEditor={() => {}} onSelectStatus={() => {}} />}
  </AuthContext.Provider></IdentityContext.Provider></MemoryRouter>))
}
async function run() {
  const roles = ['Administrador Produccion', 'Administrador Ventas', 'Administrador Cobranzas', 'Operario Produccion',
    'Operario Ventas', 'Operario Cobranzas', 'Gerencia', 'Desarrollador', 'Soporte']
  for (const role of roles) {
    render(role, 'payment')
    check(document.body.textContent.includes('Gestionar') === ['Administrador Cobranzas', 'Operario Cobranzas', 'Desarrollador'].includes(role), 'Ordinary payment: ' + role)
    render(role, 'payment', 'Confirmado')
    check(document.body.textContent.includes('Gestionar') === ['Administrador Cobranzas', 'Desarrollador'].includes(role), 'Resolved payment: ' + role)
  }
  render('Soporte', 'header')
  await until(() => document.querySelector('button[aria-label="Notificaciones, 1 sin leer"]'))
  document.querySelector('button[aria-label="Notificaciones, 1 sin leer"]').click()
  await until(() => document.body.textContent.includes('A-PERSONAL'))
  holdPreviousRequest = true
  window.dispatchEvent(new Event('focus'))
  await until(() => releasePreviousRequest)
  currentSubject = 'B'; session++
  render('Soporte', 'header')
  check(!document.body.textContent.includes('A-PERSONAL'), 'Previous subject notifications must disappear immediately')
  releasePreviousRequest()
  await until(() => document.querySelector('button[aria-label="Notificaciones, 1 sin leer"]'))
  document.querySelector('button[aria-label="Notificaciones, 1 sin leer"]').click()
  await until(() => document.body.textContent.includes('B-PERSONAL'))
  check(!document.body.textContent.includes('A-PERSONAL'), 'Only the current subject inbox is displayed')
  render('Soporte', 'privacy')
  await until(() => document.getElementById('request-email'))
  check(document.getElementById('request-email').value === 'local-B@example.invalid', 'Privacy displays the verified contact')
  check(document.getElementById('request-email').readOnly, 'Privacy cannot spoof another account contact')
  check(errors.length === 0, errors.join('; '))
  window.__BUSINESS_REPORT__ = { checks, roles: 9, subjectChange: true, errors }
  document.getElementById('result').textContent = 'BUSINESS_TEST_RESULT:PASS'
}
run().catch(error => { document.getElementById('result').textContent = 'FAIL: ' + error.message })
  .finally(() => { window.fetch = originalFetch })

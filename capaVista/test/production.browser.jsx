import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { AuthContext } from '../src/app/providers/authContext'
import { IdentityContext } from '../src/app/providers/identityContext'
import { ROLE_PERMISSIONS, can } from '../../shared/keycloakAuthorization'
import KanbanBoardPage from '../src/modules/kanban/pages/KanbanBoardPage'
import ProductionCalendarGrid from '../src/modules/productionCalendar/components/ProductionCalendarGrid'
import RoleGuard from '../src/shared/components/navigation/RoleGuard'
import 'bootstrap/dist/css/bootstrap.min.css'
import '../src/styles/global.css'
import '../src/styles/theme.css'

const assert = (condition, message) => { if (!condition) throw Error(message) }
const pause = () => new Promise(resolve => setTimeout(resolve, 20))
async function waitFor(check, message) { for (let i = 0; i < 200; i++) { if (check()) return; await pause() } throw Error(message) }
const root = createRoot(document.getElementById('root'))
const roles = ['Administrador Produccion', 'Administrador Ventas', 'Administrador Cobranzas', 'Operario Produccion',
  'Operario Ventas', 'Operario Cobranzas', 'Gerencia', 'Desarrollador', 'Soporte']
let role, detail, writes = [], count = 0
const errors = [], requests = []
window.addEventListener('error', event => errors.push(event.message))
window.addEventListener('unhandledrejection', event => errors.push(String(event.reason)))
const makeDetail = () => ({ id: 1, salesNoteNumber: 'P04-UI', clientName: 'Laboratorio', dueDate: '2026-10-20',
  generalStepId: 2, orderStatus: 'En produccion', createdAt: '2026-10-01', paymentStatusId: 2, paymentStatus: 'Confirmado',
  labels: [], seller: null, comments: [], commentGroups: { all: [], source: [], subprocesses: [], system: [] },
  items: [{ id: '11', product: 'Tarjeta', quantity: 100, dueDate: '2026-10-20', manufacturingDetails: null, lanyardProgress: null,
    subProcesses: [{ id: '41', name: 'Impresión', status: 'done', order: 1 }, { id: '42', name: 'Corte', status: 'pending', order: 2 }, { id: '43', name: 'Empaquetado', status: 'pending', order: 3 }] }],
})
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
const originalFetch = window.fetch
window.fetch = async (url, options = {}) => {
  const target = new URL(String(url)), path = target.pathname.replace('/mock-api', '')
  assert(target.origin === window.location.origin && target.pathname.startsWith('/mock-api/'), 'Solo API sintética')
  requests.push(path)
  if (options.method === 'PATCH') {
    const body = JSON.parse(options.body)
    writes.push({ path, body })
    if (path.endsWith('/complete')) detail = { ...detail, items: detail.items.map(item => ({ ...item,
      subProcesses: item.subProcesses.map(process => process.id === '42' ? { ...process, status: 'done' } : process) })) }
    return json(detail)
  }
  if (path === '/orders/kanban-summary') return json({ items: [target.searchParams.has('cursor') ? { ...detail, id: 2, salesNoteNumber: 'P04-MORE' } : detail],
    pageInfo: { limit: 50, hasMore: !target.searchParams.has('cursor'), nextCursor: target.searchParams.has('cursor') ? null : 'synthetic-cursor' } })
  if (path === '/order-status') return json(['Confirmacion de pago', 'Listo para produccion', 'En produccion', 'Listo para entrega', 'Entregado', 'Cancelado', 'En revision'].map((name, index) => ({ id_estado_pedido: index + 1, nombre_etapa: name, orden_kanban: index })))
  if (path.endsWith('/kanban-detail')) return json(detail)
  if (path === '/production-load/today') return json({ date: '2026-10-20', capacity: 1200, lanyardsInProduction: 0, percentage: 0, details: [] })
  throw Error('Solicitud no prevista en fixture: ' + path)
}
const identity = { provider: 'keycloak', sessionKey: 'production-ui', getSessionKey: () => 'production-ui', getAccessToken: async () => 'synthetic-production-only' }
function render(page) {
  const auth = { provider: 'keycloak', user: { rolUsuario: role, permissions: ROLE_PERMISSIONS[role] }, authStatus: 'authenticated',
    isAuthenticated: true, isLoading: false, hasRole: name => name === role, hasPermission: permission => can(role, ROLE_PERMISSIONS[role], permission) }
  const calendarItem = { id: '1', orderNumber: 'P04-UI', clientName: 'Laboratorio', dueDate: '2026-10-20', status: 'En produccion', productTypes: ['Tarjeta'] }
  flushSync(() => root.render(<MemoryRouter key={`${role}-${page}`} initialEntries={['/']}><IdentityContext.Provider value={identity}>
    <AuthContext.Provider value={auth}><Routes><Route path="/" element={page === 'kanban'
      ? <RoleGuard requiredPermission="read:orders"><KanbanBoardPage /></RoleGuard>
      : <RoleGuard requiredPermission="read:production-calendar"><ProductionCalendarGrid monthDate={new Date(2026, 9, 1)} items={[calendarItem]}
        allItems={[calendarItem]} getOrderDetail={async () => calendarItem} onChangeDeliveryDate={async (id, date, credentials) => writes.push({ id, date, credentials })} /></RoleGuard>} />
      <Route path="/access-denied" element={<div id="denied">Acceso denegado</div>} />
    </Routes></AuthContext.Provider></IdentityContext.Provider></MemoryRouter>))
}
function input(element, value) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
}
const button = text => [...document.querySelectorAll('button')].find(element => element.textContent.trim() === text)
async function run() {
  for (role of roles) {
    detail = makeDetail(); writes = []; requests.length = 0
    render('kanban')
    if (role === 'Soporte') {
      await waitFor(() => document.getElementById('denied'), 'Soporte no entra a Kanban')
      assert(requests.length === 0, 'Soporte no consulta datos productivos'); count++
    } else {
      await waitFor(() => button('Detalle'), `${role}: carga Kanban`)
      const manager = ['Administrador Produccion', 'Desarrollador'].includes(role)
      assert(!!document.querySelector('[aria-label="Configurar carga operativa"]') === manager, `${role}: configuración carga`)
      assert(document.querySelector('[title="Marcar urgencia"]').disabled === !manager, `${role}: etiquetas`)
      button('Cargar más pedidos').click()
      await waitFor(() => [...document.querySelectorAll('button')].filter(element => element.textContent.trim() === 'Detalle').length === 2, `${role}: paginación`)
      button('Detalle').click()
      await waitFor(() => document.getElementById('kanban-detail-title'), `${role}: detalle`)
      const first = [...document.querySelectorAll('button')].find(element => element.textContent.includes('Impresión'))
      const current = [...document.querySelectorAll('button')].find(element => element.textContent.includes('Corte'))
      assert(first.disabled === !manager, `${role}: retroceso separado de avance`)
      const worker = manager || role === 'Operario Produccion'
      assert(current.disabled === !worker, `${role}: avance`)
      count += 5
      if (worker) {
        current.click(); await waitFor(() => document.getElementById('operator-modal-title'), 'Modal PIN de subproceso')
        const form = document.querySelector('form[aria-labelledby="operator-modal-title"]')
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await pause()
        assert(writes.length === 0, 'Sin PIN no envía acción')
        input(form.querySelector('input[type="password"]'), '123456'); await pause()
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
        await waitFor(() => writes.length === 1 && !document.getElementById('operator-modal-title'), 'Completar actualiza y cierra modal')
        assert(writes[0].path.endsWith('/42/complete') && writes[0].body.pin === '123456', 'Contrato PIN sin actor recibido desde UI')
        assert(!Object.hasOwn(writes[0].body, 'actor'), 'Cliente no elige actor'); count += 4
      }
    }
    writes = []; render('calendar')
    const reader = ['Administrador Produccion', 'Administrador Ventas', 'Operario Ventas', 'Desarrollador'].includes(role)
    if (!reader) { await waitFor(() => document.getElementById('denied'), `${role}: calendario denegado`); count++; continue }
    await waitFor(() => document.querySelector('[title="Arrastrar para cambiar fecha de entrega"]'), 'Evento calendario')
    const event = document.querySelector('[title="Arrastrar para cambiar fecha de entrega"]')
    const editor = ['Administrador Produccion', 'Desarrollador'].includes(role)
    assert(event.draggable === editor, `${role}: lectura vs arrastre`); count++
    const day = [...document.querySelectorAll('article')].find(element => element.querySelector('span')?.textContent === '21')
    const dataTransfer = new DataTransfer(); dataTransfer.setData('text/plain', '1')
    day.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer })); await pause()
    if (!editor) { assert(!document.getElementById('delivery-change-title') && writes.length === 0, 'Drop forzado no evade permiso'); count++; continue }
    await waitFor(() => document.getElementById('delivery-change-title'), 'Confirmación de fecha')
    button('Si').click(); await waitFor(() => document.getElementById('delivery-credentials-title'), 'PIN calendario')
    const form = document.querySelector('form[aria-labelledby="delivery-credentials-title"]')
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await pause()
    assert(writes.length === 0, 'No cambia fecha sin PIN')
    input(form.querySelector('input[type="password"]'), '123456'); await pause()
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await waitFor(() => writes.length === 1 && !document.getElementById('delivery-credentials-title'), 'Fecha confirmada')
    assert(writes[0].id === '1' && writes[0].date === '2026-10-21' && writes[0].credentials.pin === '123456', 'Contrato calendario conserva fecha y PIN'); count += 3
  }
  assert(errors.length === 0, errors.join('; '))
  window.__PRODUCTION_REPORT__ = { checks: count, roles: 9, viewport: [innerWidth, innerHeight], api: 'synthetic', errors: errors.length }
}
run().then(() => { document.getElementById('result').textContent = 'PRODUCTION_TEST_RESULT:PASS' })
  .catch(error => { document.getElementById('result').textContent = `PRODUCTION_TEST_RESULT:FAIL:${error.message}; errors=${errors.join('; ')}` })
  .finally(() => { root.unmount(); window.fetch = originalFetch })

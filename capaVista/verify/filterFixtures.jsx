import { createRoot } from 'react-dom/client'
import { lazy, Suspense } from 'react'
import { MemoryRouter } from 'react-router-dom'
import AppRouter from '../src/app/router'
import { AuthContext } from '../src/app/providers/authContext'
import { IdentityContext } from '../src/app/providers/identityContext'
import ToastProvider from '../src/shared/notifications/ToastProvider'
import { auth, client } from './pageFixtures'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap-icons/font/bootstrap-icons.css'
import '../src/styles/theme.css'
import '../src/styles/global.css'
import '../src/styles/bootstrap-overrides.css'

// Standalone verification entry, never imported by the application.
// All requests stay in this synthetic fixture, including attempted writes.
window.__filterReads = []
window.fetch = async (input, options = {}) => {
  const url = new URL(input)
  const path = url.pathname.replace(/^\/api(?=\/)/, '') + url.search
  if (options.method && options.method !== 'GET') throw Error('Las escrituras están deshabilitadas en esta revisión.')
  window.__filterReads.push(path)
  const payload = await client.get(path)
  if (path.startsWith('/orders/payments?')) payload.counts = { pending: 24, rejected: 5, confirmed: 13 }
  return new Response(JSON.stringify(payload), { headers: { 'Content-Type': 'application/json' } })
}
const sessions = {
  kanban: ['/kanban', lazy(() => import('../src/modules/kanban/pages/KanbanBoardPage'))],
  payments: ['/pagos', lazy(() => import('../src/modules/payments/pages/PaymentConfirmationPage'))],
  users: ['/admin/usuarios', lazy(() => import('../src/modules/users/pages/UserManagementPage'))],
  history: ['/historial-pedidos', lazy(() => import('../src/modules/orderHistory/pages/OrderHistoryPage'))],
  calendar: ['/calendario-produccion', lazy(() => import('../src/modules/productionCalendar/pages/ProductionCalendarPage'))],
  inbox: ['/mensajes', lazy(() => import('../src/modules/messages/pages/MessageInboxPage'))],
}
const params = new URLSearchParams(location.search)
const [route, Page] = sessions[params.get('module')] ?? sessions.kanban
const identity = { sessionKey: 'visual-fixture', getSessionKey: () => 'visual-fixture', getAccessToken: async () => 'synthetic-preview-only' }
const previewAuth = { ...auth, user: { ...auth.user, rolUsuario: 'Soporte' },
  isAuthenticated: true, authStatus: 'authenticated', isLoading: false, hasRole: () => true,
  hasPermission: params.get('disabled') === '1' ? () => false : auth.hasPermission }

createRoot(document.getElementById('root')).render(
  <IdentityContext.Provider value={identity}><AuthContext.Provider value={previewAuth}><ToastProvider>
    <MemoryRouter initialEntries={[route]}><Suspense fallback={<p>Cargando vista sintética…</p>}>
      {params.has('navigation') ? <AppRouter /> : <Page />}
    </Suspense></MemoryRouter>
  </ToastProvider></AuthContext.Provider></IdentityContext.Provider>,
)

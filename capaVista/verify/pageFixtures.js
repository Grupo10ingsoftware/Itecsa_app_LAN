import { ROLES } from '../../shared/authorization.js'

// Datos sintéticos exclusivos de las pruebas. No contacta servidores ni permite escrituras.
export const auth = {
  user: { sub: 'preview', primerNombre: 'Ana', apellidoPaterno: 'Pérez', email: 'preview@example.test', rolUsuario: ROLES.ADMINISTRADOR, estadoUsuario: 'Vinculado' },
  identityUser: { sub: 'preview' }, provider: 'keycloak', pinStatus: 'active',
  hasPermission: () => true, logout: () => {}, refreshSession: async () => {},
}
const pageInfo = { nextCursor: null, hasMore: false }
const message = { id_mensaje: 1, Asunto: 'Pedido listo para entrega', contenido: 'Este mensaje sintético conserva su contenido y sus metadatos.', fecha_publicacion: '2026-10-26T10:00:00Z', leido: true, id_pedido: 123 }
export const client = {
  async get(url) {
    const pathname = url.split('?')[0]
    if (pathname === '/production-load/today') return { capacity: 1200, lanyardsInProduction: 900, percentage: 75, details: [] }
    if (pathname === '/production-capacity' || pathname === '/order-status') return []
    if (pathname === '/messages/notifications') return { notifications: [], unreadCount: 0 }
    if (pathname === '/messages') return { messages: [message], total: 1, totalPages: 2 }
    if (pathname === '/messages/1') return message
    if (pathname === '/privacy/documents') return { documents: [], requestsEnabled: true }
    if (pathname === '/security/incident-reports/config') return { reportsEnabled: true, contactEmail: 'preview@example.test' }
    if (pathname === '/auth/profile') return { ...auth.user, records: [] }
    if (pathname === '/admin/identity/users/summary') return { totalUsuarios: 0, vinculados: 0, desvinculados: 0, pendientes: 0, pendientesRol: 0 }
    if (pathname === '/admin/identity/users') return { users: [], total: 0, totalPages: 1 }
    if (pathname.includes('metrics')) return { production: { total: 0, products: [] }, dwellTime: { stages: [], subprocesses: [] }, sellerCompliance: [] }
    if (pathname === '/history/orders/123') return { salesNoteNumber: 'NV-123', client: { name: 'Cliente de prueba' }, seller: { name: 'Ana' }, items: [], events: [], pageInfo }
    if (pathname === '/history/orders') return { items: [{ id: 123, salesNoteNumber: 'NV-123', clientName: 'Cliente de prueba' }], pageInfo }
    if (pathname === '/orders/payments') return { items: [], pageInfo, counts: {}, paymentStatuses: [] }
    if (pathname === '/orders/calendar-summary' || pathname === '/orders/kanban-summary') return { items: [], pageInfo }
    throw new Error(`Lectura sin fixture: ${url}`)
  },
  async post(url) {
    if (url === '/messages/1/open') return { message, markedAsRead: false }
    throw new Error('Las escrituras están deshabilitadas en la revisión visual.')
  },
  async patch() { throw new Error('Las escrituras están deshabilitadas en la revisión visual.') },
}

export const pages = [
  ['orders', '/ordenes/nuevo', 'orders/pages/OrderCreatePage'],
  ['calendar', '/calendario-produccion', 'productionCalendar/pages/ProductionCalendarPage'],
  ['kanban', '/kanban', 'kanban/pages/KanbanBoardPage'],
  ['payments', '/pagos', 'payments/pages/PaymentConfirmationPage'],
  ['history', '/historial-pedidos', 'orderHistory/pages/OrderHistoryPage'],
  ['history-detail', '/historial-pedidos/123', 'orderHistory/pages/OrderHistoryDetailPage'],
  ['metrics', '/metricas', 'metrics/pages/MetricsPage'],
  ['users', '/admin/usuarios', 'users/pages/UserManagementPage'],
  ['profile', '/perfil', 'profile/pages/ProfilePage'],
  ['documents', '/documentos', 'privacy/pages/DocumentsPage'],
  ['requests', '/solicitudes', 'privacy/pages/DataRequestsPage'],
  ['incidents', '/reportar-incidente', 'security/pages/IncidentReportPage'],
  ['inbox', '/mensajes', 'messages/pages/MessageInboxPage'],
  ['message-detail', '/mensajes/1', 'messages/pages/MessageDetailPage'],
]

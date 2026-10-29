import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { render } from '../../../test/renderWithToast'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { auth, client } from '../../../../verify/pageFixtures.js'
import OrderCreatePage from '../../../modules/orders/pages/OrderCreatePage'
import ProductionCalendarPage from '../../../modules/productionCalendar/pages/ProductionCalendarPage'
import KanbanBoardPage from '../../../modules/kanban/pages/KanbanBoardPage'
import PaymentConfirmationPage from '../../../modules/payments/pages/PaymentConfirmationPage'
import OrderHistoryPage from '../../../modules/orderHistory/pages/OrderHistoryPage'
import OrderHistoryDetailPage from '../../../modules/orderHistory/pages/OrderHistoryDetailPage'
import MetricsPage from '../../../modules/metrics/pages/MetricsPage'
import UserManagementPage from '../../../modules/users/pages/UserManagementPage'
import ProfilePage from '../../../modules/profile/pages/ProfilePage'
import DocumentsPage from '../../../modules/privacy/pages/DocumentsPage'
import DataRequestsPage from '../../../modules/privacy/pages/DataRequestsPage'
import IncidentReportPage from '../../../modules/security/pages/IncidentReportPage'
import MessageInboxPage from '../../../modules/messages/pages/MessageInboxPage'
import MessageDetailPage from '../../../modules/messages/pages/MessageDetailPage'

vi.hoisted(() => {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
})
vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => auth }))
vi.mock('../../../hooks/useApiClient', () => ({ useApiClient: () => client }))
vi.mock('../../../app/providers/identityContext.js', () => ({
  useIdentity: () => ({ getRecoveryRefreshToken: vi.fn() }),
}))
afterEach(() => { cleanup(); vi.restoreAllMocks() })

function mount(Page, route = '/') {
  const pattern = route.replace('/123', '/:orderId').replace('/1', '/:messageId')
  return render(<MemoryRouter initialEntries={[route]}><main><Routes>
    <Route path={pattern} element={<Page />} />
  </Routes></main></MemoryRouter>)
}

describe('Páginas migradas sin modificar sus operaciones', () => {
  it.each([
    [OrderCreatePage, 'REGISTRO DE PEDIDO'],
    [ProductionCalendarPage, 'Calendario'],
    [KanbanBoardPage, 'Kanban'],
    [PaymentConfirmationPage, 'Confirmacion de pago'],
    [OrderHistoryPage, 'Historial de pedidos'],
    [OrderHistoryDetailPage, 'NV-123', '/historial-pedidos/123'],
    [MetricsPage, 'Métricas'],
    [UserManagementPage, 'Gestion de usuarios'],
    [ProfilePage, 'Mi perfil'],
    [DocumentsPage, 'LEGAL Y PRIVACIDAD'],
    [DataRequestsPage, 'SOLICITUDES SOBRE MIS DATOS'],
    [IncidentReportPage, 'REPORTAR INCIDENTE'],
    [MessageInboxPage, 'Bandeja de entrada'],
    [MessageDetailPage, 'Detalle del mensaje', '/mensajes/1'],
  ])('presenta un único título y banner en %s', async (Page, title, route) => {
    const { container } = mount(Page, route)
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(title))
    expect(container.querySelectorAll('main')).toHaveLength(1)
    expect(container.querySelectorAll('[data-page-header]')).toHaveLength(1)
  })

  it('mantiene el indicador Kanban y la apertura de su configuración', async () => {
    mount(KanbanBoardPage)
    await screen.findByText('75%')
    fireEvent.click(screen.getByRole('button', { name: 'Configurar carga operativa' }))
    expect(screen.getByRole('dialog').getAttribute('aria-labelledby')).toBe('capacity-title')
    expect(screen.getByRole('heading', { name: 'Carga diaria de Lanyard' })).toBeTruthy()
  })

  it('conserva la búsqueda y el enlace al detalle del historial', async () => {
    mount(OrderHistoryPage)
    await screen.findByRole('link', { name: /Ver detalle/ })
    expect(screen.getByRole('link', { name: /Ver detalle/ }).getAttribute('href')).toBe('/historial-pedidos/123')
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'NV-123' } })
    expect(screen.getByRole('searchbox').value).toBe('NV-123')
  })

  it('conserva el cliente y el enlace de regreso del detalle de historial', async () => {
    mount(OrderHistoryDetailPage, '/historial-pedidos/123')
    await screen.findByRole('heading', { level: 1, name: 'NV-123' })
    expect(screen.getAllByText('Cliente de prueba')).toHaveLength(2)
    expect(screen.getByRole('link', { name: /Volver/ }).getAttribute('href')).toBe('/historial-pedidos')
  })

  it('mantiene la acción de crear usuarios fuera del encabezado', async () => {
    mount(UserManagementPage)
    expect(document.querySelector('[data-page-header]').textContent).toBe('Gestion de usuarios')
    const create = await screen.findByRole('button', { name: /Crear usuario/ })
    expect(create.closest('[data-page-header]')).toBeNull()
  })

  it('mantiene la indicación operativa de revisión y respuesta a solicitudes', async () => {
    mount(DataRequestsPage)
    const notice = screen.getByText(/será revisada por el área responsable/)
    expect(notice.closest('[data-page-header]')).toBeNull()
    expect(document.querySelector('[data-page-header]').textContent).toBe('SOLICITUDES SOBRE MIS DATOS')
    expect(screen.queryByText('Envía una solicitud relacionada con el tratamiento de tus datos personales.')).toBeNull()
    await screen.findByRole('button', { name: /Enviar solicitud/ })
  })

  it('mantiene los datos del mensaje dentro del artículo con su jerarquía', async () => {
    mount(MessageDetailPage, '/mensajes/1')
    const subject = await screen.findByRole('heading', { level: 2, name: 'Pedido listo para entrega' })
    expect(subject.closest('article')).toBeTruthy()
    expect(screen.getByText('Leído')).toBeTruthy()
    expect(screen.getByText(/Este mensaje sintético conserva/)).toBeTruthy()
    expect(screen.getByText('Nota de Venta no disponible')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Volver a la bandeja/ }).getAttribute('href')).toBe('/mensajes')
  })

  it('permite abrir un mensaje y regresar a la bandeja mediante la navegación existente', async () => {
    render(<MemoryRouter initialEntries={['/mensajes']}><main><Routes>
      <Route path="/mensajes" element={<MessageInboxPage />} />
      <Route path="/mensajes/:messageId" element={<MessageDetailPage />} />
    </Routes></main></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: /Pedido listo para entrega/ }))
    await screen.findByRole('heading', { level: 1, name: 'Detalle del mensaje' })
    fireEvent.click(screen.getByRole('link', { name: /Volver a la bandeja/ }))
    await screen.findByRole('heading', { level: 1, name: 'Bandeja de entrada' })
  })

  it('conserva el aviso y reintento de resumen de usuarios', async () => {
    const original = client.get.bind(client)
    let fail = true
    vi.spyOn(client, 'get').mockImplementation(url => {
      if (fail && url === '/admin/identity/users/summary') return Promise.reject(new Error('Fallo sintético'))
      return original(url)
    })
    mount(UserManagementPage)
    const retry = await screen.findByRole('button', { name: 'Reintentar resumen' })
    expect(retry.closest('[role="alert"]')).toBeTruthy()
    fail = false
    fireEvent.click(retry)
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Reintentar resumen' })).toBeNull())
    expect(screen.getByRole('button', { name: /Crear usuario/ })).toBeTruthy()
  })

  it.each([
    [OrderHistoryDetailPage, '/historial-pedidos/123', /Volver al historial/],
    [MessageDetailPage, '/mensajes/1', /Volver a la bandeja/],
  ])('respeta el estado de error sin forzar un banner en %s', async (Page, route, link) => {
    vi.spyOn(client, 'get').mockRejectedValue(new Error('Fallo sintético'))
    vi.spyOn(client, 'post').mockRejectedValue(new Error('Fallo sintético'))
    const { container } = mount(Page, route)
    await waitFor(() => expect(screen.queryByText(/Cargando/)).toBeNull())
    expect(container.querySelector('[data-page-header]')).toBeNull()
    expect(screen.getByRole('link', { name: link })).toBeTruthy()
  })
})

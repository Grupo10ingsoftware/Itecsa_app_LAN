import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { render } from '../../../test/renderWithToast'
import AppRouter from '../../../app/router'
import { auth, client } from '../../../../verify/pageFixtures'

vi.hoisted(() => {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
})
vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => ({
  ...auth, user: { ...auth.user, rolUsuario: 'Soporte' },
  authStatus: 'authenticated', isAuthenticated: true, isLoading: false, hasRole: () => true,
}) }))
vi.mock('../../../hooks/useApiClient', () => ({ useApiClient: () => client }))
afterEach(() => { cleanup(); vi.restoreAllMocks() })

it.each([
  ['/kanban', 'Producción', 'filtros del tablero'],
  ['/pagos', 'Confirmar pago', 'filtros de pago'],
  ['/admin/usuarios', 'Gestion de usuarios', 'filtros de usuarios'],
  ['/historial-pedidos', 'Historial de pedidos', 'filtros del historial'],
  ['/calendario-produccion', 'Calendario', 'filtros de calendario'],
  ['/mensajes', 'Bandeja de mensajes', 'filtros de mensajes'],
])('%s starts closed and closes on re-entry through the real router and navigation', async (route, navigation, label) => {
  const reads = vi.spyOn(client, 'get')
  render(<MemoryRouter initialEntries={[route]}><AppRouter /></MemoryRouter>)
  const toggle = await screen.findByRole('button', { name: 'Expandir ' + label })
  const main = within(screen.getByRole('main'))
  expect(toggle.getAttribute('aria-expanded')).toBe('false')
  expect(main.queryByRole('button', { name: 'Aplicar filtros' })).toBeNull()
  fireEvent.click(toggle)
  const search = main.queryAllByRole('searchbox')[0]
  if (search) fireEvent.change(search, { target: { value: 'NV-001' } })
  else fireEvent.click(main.getByRole('button', { name: 'No leídos', exact: true }))
  fireEvent.click(main.getByRole('button', { name: 'Aplicar filtros', exact: true }))
  await waitFor(() => expect(main.getByRole('button', { name: 'Aplicar filtros', exact: true }).getAttribute('aria-busy')).toBeNull())
  const afterApply = reads.mock.calls.length
  fireEvent.click(screen.getByRole('button', { name: 'Contraer ' + label }))
  expect(main.queryByRole('button', { name: 'Aplicar filtros', exact: true })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Expandir ' + label }))
  if (search) expect(main.getAllByRole('searchbox')[0].value).toBe('NV-001')
  else expect(main.getByRole('button', { name: 'No leídos', exact: true }).getAttribute('aria-pressed')).toBe('true')
  expect(reads.mock.calls.length).toBe(afterApply)
  fireEvent.click(screen.getByRole('link', { name: 'Documentos', exact: true }))
  await screen.findByRole('heading', { name: 'LEGAL Y PRIVACIDAD' })
  fireEvent.click(screen.getByRole('link', { name: navigation, exact: true }))
  const returned = await screen.findByRole('button', { name: 'Expandir ' + label })
  expect(returned.getAttribute('aria-expanded')).toBe('false')
  expect(within(screen.getByRole('main')).queryByRole('button', { name: 'Aplicar filtros', exact: true })).toBeNull()
})

it('keeps Create user functional beside both collapsed and expanded filters', async () => {
  render(<MemoryRouter initialEntries={['/admin/usuarios']}><AppRouter /></MemoryRouter>)
  const toggle = await screen.findByRole('button', { name: 'Expandir filtros de usuarios' })
  const create = screen.getByRole('button', { name: 'Crear usuario', exact: true })
  const panel = toggle.closest('section')
  expect(create.parentElement.parentElement).toBe(panel.parentElement)
  expect(panel.contains(create)).toBe(false)
  for (const expand of [false, true]) {
    if (expand) fireEvent.click(toggle)
    fireEvent.click(create)
    expect(await screen.findByRole('dialog', { name: 'Creacion de usuario' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar modal de creacion' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(toggle.getAttribute('aria-expanded')).toBe(String(expand))
  }
})

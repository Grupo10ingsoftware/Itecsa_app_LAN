import { act, cleanup, fireEvent, renderHook, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { render } from '../../test/renderWithToast'
import ToastProvider from './ToastProvider'
import UserManagementPage from '../../modules/users/pages/UserManagementPage'
import { useOrderCreateFlow } from '../../hooks/useOrderCreateFlow'

const { users, orders } = vi.hoisted(() => ({ users: {}, orders: {} }))
vi.mock('../../modules/users/hooks/useAdminUsersApi', () => ({ useAdminUsersApi: () => users }))
vi.mock('../../modules/orders/hooks/useOrdersApi', () => ({ useOrdersApi: () => orders }))
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { sub: 'operator', rolUsuario: 'Soporte' }, identityUser: { sub: 'operator' }, provider: 'keycloak' }) }))
const user = { idUsuario: 2, idUsuarioAutenticacionExterna: 'target', nombreUsuario: 'Jose', apellidoUsuario: 'Perez',
  correoUsuario: 'jose@example.test', rutUsuario: '12.345.678-5', rolUsuario: 'Operario Ventas', estadoUsuario: 'Vinculado' }
beforeEach(() => {
  users.listUsers = vi.fn().mockResolvedValue({ usuarios: [user], total: 1, totalPages: 1 })
  users.getSummary = vi.fn().mockResolvedValue({ totalUsuarios: 1 })
  users.inspectUser = vi.fn().mockResolvedValue({ firstName: 'Jose', lastName: 'Perez', email: 'jose@example.test', role: 'Operario Ventas', localState: 'Vinculado' })
  users.updateUser = vi.fn().mockResolvedValue({ outcome: 'user_updated' })
  orders.getSalesNote = vi.fn().mockResolvedValue({ numeroNota: 'NV-1', items: [] })
  orders.createOrder = vi.fn().mockResolvedValue({ id: 123 })
})
afterEach(cleanup)
const viewport = () => document.querySelector('[data-toast-viewport]')
async function edit() {
  render(<MemoryRouter><UserManagementPage /></MemoryRouter>)
  const buttons = await screen.findAllByRole('button', { name: 'Editar' })
  fireEvent.click(buttons[0])
  await screen.findByRole('dialog')
  fireEvent.change(screen.getByLabelText('PIN de autorizacion'), { target: { value: '123456' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
}
it('Usuarios: éxito confirmado aparece una sola vez en el toast y cierra el diálogo', async () => {
  await edit()
  const text = await screen.findByText('Usuario actualizado correctamente.')
  expect(text.closest('[data-toast-viewport]')).toBe(viewport())
  expect(screen.getAllByText('Usuario actualizado correctamente.')).toHaveLength(1)
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(users.updateUser).toHaveBeenCalledOnce()
})
it('Usuarios: fallo general no duplica un bloque en el lienzo o el modal', async () => {
  users.updateUser.mockRejectedValue({ status: 403, payload: { message: 'No tienes autorización para actualizar esta cuenta.' } })
  await edit()
  const error = await screen.findByText('No tienes autorización para actualizar esta cuenta.')
  expect(error.closest('[data-toast-viewport]')).toBe(viewport())
  expect(within(screen.getByRole('dialog')).queryByRole('alert')).toBeNull()
  expect(screen.getByLabelText('Nombre').value).toBe('Jose')
})
it('Usuarios: PIN incorrecto permanece asociado al campo y no emite toast', async () => {
  users.updateUser.mockRejectedValue({ status: 403, payload: { code: 'PIN_INVALID', message: 'El PIN ingresado no es valido.' } })
  await edit()
  const error = await screen.findByText('El PIN ingresado no es valido.')
  expect(error.closest('[role="dialog"]')).toBe(screen.getByRole('dialog'))
  const input = screen.getByLabelText('PIN de autorizacion')
  expect(input.getAttribute('aria-describedby')).toBe(error.id)
  expect(viewport().querySelector('article')).toBeNull()
})
it('Usuarios: resultado incierto conserva instrucciones persistentes', async () => {
  users.updateUser.mockRejectedValue({ code: 'NETWORK_ERROR' })
  await edit()
  const issue = await screen.findByText(/Comprueba el resultado antes de repetir/)
  expect(issue.closest('[role="dialog"]')).toBeTruthy()
  expect(viewport().querySelector('article')).toBeNull()
})
it('Pedidos: confirma backend antes de emitir éxito, reinicia el formulario y conserva acceso a pedidos', async () => {
  let complete
  orders.createOrder.mockImplementation(() => new Promise(resolve => { complete = resolve }))
  const navigate = vi.fn()
  const hook = renderHook(() => useOrderCreateFlow({ navigate }), { wrapper: ToastProvider })
  act(() => hook.result.current.actions.updateDraftField('salesNoteCode', 'NV-1'))
  await act(() => hook.result.current.actions.handleSearchSalesNote())
  act(() => hook.result.current.actions.handleOpenConfirmModal())
  let operation
  act(() => hook.result.current.actions.handleConfirmRegister())
  expect(orders.createOrder).not.toHaveBeenCalled()
  act(() => { operation = hook.result.current.actions.authorizeRegister({ pin: '123456' }) })
  expect(viewport().querySelector('article')).toBeNull()
  await act(async () => { complete({ id: 123 }); await operation })
  expect(screen.getByText('Pedido registrado correctamente.').closest('[data-toast-viewport]')).toBeTruthy()
  expect(hook.result.current.showConfirmModal).toBe(false)
  expect(hook.result.current.draft.salesNoteCode).toBe('')
  fireEvent.click(screen.getByRole('button', { name: 'Ver pedidos' }))
  expect(navigate).toHaveBeenCalledWith('/pagos')
})
it('Pedidos: las validaciones no se convierten en toast y un resultado incierto conserva contexto', async () => {
  orders.createOrder.mockRejectedValue({ code: 'NETWORK_ERROR' })
  const hook = renderHook(() => useOrderCreateFlow({ navigate: vi.fn() }), { wrapper: ToastProvider })
  act(() => hook.result.current.actions.handleOpenConfirmModal())
  expect(hook.result.current.errors.salesNoteCode).toBeTruthy()
  expect(viewport().querySelector('article')).toBeNull()
  act(() => hook.result.current.actions.updateDraftField('salesNoteCode', 'NV-1'))
  await act(() => hook.result.current.actions.handleSearchSalesNote())
  act(() => hook.result.current.actions.handleOpenConfirmModal())
  await act(() => hook.result.current.actions.handleConfirmRegister())
  await act(async () => {
    await expect(hook.result.current.actions.authorizeRegister({ pin: '123456' })).rejects.toEqual({ code: 'NETWORK_ERROR' })
  })
  expect(hook.result.current.showPinModal).toBe(true)
  expect(hook.result.current.draft.salesNoteCode).toBe('NV-1')
  expect(viewport().querySelector('article')).toBeNull()
})

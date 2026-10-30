import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import UserEditModal from './UserEditModal.jsx'
import UserManagementTable from './UserManagementTable.jsx'
import { createAdminUsersApi } from '../api/adminUsersApi.js'

const notify = vi.hoisted(() => ({ error: vi.fn() }))
vi.mock('../../../shared/notifications/useToast', () => ({ useToast: () => notify }))

vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => ({ user: { rolUsuario: 'Soporte' }, provider: 'keycloak' }) }))

const user = { id: 2, idUsuarioAutenticacionExterna: 'target', nombreUsuario: 'Jose', apellidoUsuario: 'Perez',
  nombreCompleto: 'Jose Perez', nombreListado: 'Jose Perez', correoUsuario: 'jose@example.com',
  rutUsuario: '12.345.678-5', rolUsuario: 'Operario Ventas', estadoUsuario: 'Activo' }
afterEach(() => { cleanup(); vi.clearAllMocks() })

function editFields() {
  for (const [label, value] of [['Nombre', 'Maria'], ['Apellido', 'Soto'], ['Correo electronico', 'MARIA@example.com'],
    ['Rol', 'Operario Cobranzas'], ['Estado', 'Desvinculado']]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } })
  }
}

it('edits the five requested fields and submits them with the operator PIN', async () => {
  const onSave = vi.fn().mockResolvedValue(undefined)
  render(<UserEditModal isOpen user={user} onSave={onSave} onClose={vi.fn()} />)
  expect(screen.getByRole('heading', { name: 'Editar usuario' })).toBeTruthy()
  editFields()
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
  expect(onSave).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('PIN personal'), { target: { value: '123456' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
  await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
    nombreUsuario: 'Maria', apellidoUsuario: 'Soto', correoUsuario: 'maria@example.com',
    rolUsuario: 'Operario Cobranzas', estadoUsuario: 'Desvinculado', pin: '123456',
  })))
  expect(screen.getByLabelText('PIN personal').value).toBe('')
  expect(screen.queryByRole('button', { name: 'Establecer credenciales' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Desvincular' })).toBeNull()
})

it('validates email before submitting and clears PIN after a rejected update', async () => {
  const onSave = vi.fn().mockRejectedValue(Error('El PIN ingresado no es valido.'))
  render(<UserEditModal isOpen user={user} onSave={onSave} onClose={vi.fn()} />)
  editFields()
  fireEvent.change(screen.getByLabelText('Correo electronico'), { target: { value: 'invalid' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
  expect(onSave).not.toHaveBeenCalled()
  expect(notify.error).toHaveBeenCalledWith(expect.stringContaining('correo'))
  expect(screen.queryByLabelText('PIN personal')).toBeNull()
  fireEvent.change(screen.getByLabelText('Correo electronico'), { target: { value: 'maria@example.com' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
  fireEvent.change(screen.getByLabelText('PIN personal'), { target: { value: '123456' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
  await waitFor(() => expect(notify.error).toHaveBeenCalledTimes(2))
  expect(screen.getByLabelText('PIN personal').value).toBe('')
})

it('keeps pending as an existing status without offering it for active accounts', () => {
  const view = render(<UserEditModal isOpen user={{ ...user, estadoUsuario: 'Pendiente' }} onSave={vi.fn()} onClose={vi.fn()} />)
  expect(screen.getByRole('option', { name: 'Pendiente' })).toBeTruthy()
  view.unmount()
  render(<UserEditModal isOpen user={user} onSave={vi.fn()} onClose={vi.fn()} />)
  expect(screen.queryByRole('option', { name: 'Pendiente' })).toBeNull()
})

it('renders Editar in the shared scrollable table for desktop and mobile', () => {
  render(<UserManagementTable currentPage={1} totalPages={1} totalUsers={1} users={[user]}
    onEditUser={vi.fn()} onViewMovements={vi.fn()} onPageChange={vi.fn()} />)
  expect(screen.getAllByRole('button', { name: 'Editar' })).toHaveLength(1)
  expect(screen.queryByRole('button', { name: 'Consultar' })).toBeNull()
})

it('sends only editable identity fields to the backend PATCH endpoint', async () => {
  const patch = vi.fn().mockResolvedValue({ outcome: 'user_updated' })
  await createAdminUsersApi({ patch }).updateUser({ ...user, pin: '123456' })
  expect(patch).toHaveBeenCalledWith('/admin/identity/identities/target', {
    pin: '123456', identity: { firstName: 'Jose', lastName: 'Perez', email: 'jose@example.com',
      role: 'Operario Ventas', state: 'Activo' },
  })
})

it('keeps edits after canceling authorization and skips unchanged values', () => {
  const onSave = vi.fn()
  render(<UserEditModal isOpen user={user} onSave={onSave} onClose={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
  expect(screen.queryByLabelText('PIN personal')).toBeNull()
  editFields()
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  expect(screen.getByLabelText('Nombre').value).toBe('Maria')
  expect(screen.getByLabelText('Estado').value).toBe('Desvinculado')
  expect(onSave).not.toHaveBeenCalled()
})

it('blocks duplicate requests while authorization is pending', async () => {
  let resolve
  const onSave = vi.fn(() => new Promise(done => { resolve = done }))
  render(<UserEditModal isOpen user={user} onSave={onSave} onClose={vi.fn()} />)
  editFields()
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
  fireEvent.change(screen.getByLabelText('PIN personal'), { target: { value: '123456' } })
  const dialog = screen.getByRole('dialog')
  fireEvent.submit(dialog)
  fireEvent.submit(dialog)
  expect(onSave).toHaveBeenCalledTimes(1)
  resolve()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Cancelar' }).disabled).toBe(false))
})

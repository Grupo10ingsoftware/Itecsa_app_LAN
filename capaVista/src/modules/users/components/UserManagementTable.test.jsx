import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import UserManagementTable from './UserManagementTable'

afterEach(cleanup)
const users = ['Activo', 'Pendiente', 'Desvinculado'].map((estadoUsuario, index) => ({
  id: index + 1, idUsuarioAutenticacionExterna: `synthetic-${index}`, username: `usuario.${index}`,
  nombreCompleto: `Ana María Soto Pérez ${index}`, nombreListado: 'Ana Soto', rutUsuario: 'RUT-SYNTHETIC',
  correoUsuario: `synthetic${index}@example.test`, rolUsuario: 'Administrador Ventas', estadoUsuario,
}))
const props = { users, currentPage: 1, pageSize: 10, totalPages: 5, totalUsers: 50,
  onEditUser: vi.fn(), onViewMovements: vi.fn(), onPageChange: vi.fn(), onPageSizeChange: vi.fn() }

it('separates username and full name in seven semantic columns, preserving the real values', () => {
  render(<UserManagementTable {...props} />)
  const table = within(screen.getByRole('table'))
  expect(table.getAllByRole('columnheader').map(th => th.textContent)).toEqual(['Usuario', 'Nombre', 'RUT', 'Correo', 'Rol', 'Estado', 'Acciones'])
  expect(table.getAllByRole('columnheader').every(th => th.getAttribute('scope') === 'col')).toBe(true)
  table.getAllByRole('row').slice(1).forEach((row, index) => {
    const cells = within(row).getAllByRole('cell')
    expect(cells).toHaveLength(7)
    expect(cells.slice(0, 6).map(td => td.textContent)).toEqual([
      users[index].username, users[index].nombreCompleto, users[index].rutUsuario,
      users[index].correoUsuario, users[index].rolUsuario, ['Vinculado', 'Pendiente', 'Desvinculado'][index],
    ])
    expect(within(cells[6]).getAllByRole('button').map(button => button.textContent)).toEqual(['Editar', 'Movimientos'])
    expect(cells[6].querySelector('i, svg')).toBeNull()
  })
})

it('keeps Editar and Movimientos callbacks bound to the original user', () => {
  const onEditUser = vi.fn(), onViewMovements = vi.fn()
  render(<UserManagementTable {...props} onEditUser={onEditUser} onViewMovements={onViewMovements} />)
  const table = within(screen.getByRole('table'))
  fireEvent.click(table.getAllByRole('button', { name: 'Editar' })[0])
  fireEvent.click(table.getAllByRole('button', { name: 'Movimientos' })[0])
  expect(onEditUser).toHaveBeenCalledWith(users[0])
  expect(onViewMovements).toHaveBeenCalledWith(users[0])
})

it('preserves identity-binding warnings, unavailable values and disabled controls', () => {
  render(<UserManagementTable {...props} users={[{ ...users[0], username: '', correoUsuario: '',
    idUsuarioAutenticacionExterna: null, identityBindingConflict: true }]} />)
  const table = within(screen.getByRole('table'))
  expect(table.getByText('No disponible')).toBeTruthy()
  expect(table.getByText('Sin correo')).toBeTruthy()
  expect(table.getByText('Vinculo pendiente de conciliacion')).toBeTruthy()
  expect(table.getAllByRole('button').every(button => button.disabled)).toBe(true)
})

it('keeps read-only presentation and loading/empty states across seven columns', () => {
  const view = render(<UserManagementTable {...props} readOnly />)
  expect(within(screen.getByRole('table')).getAllByRole('button', { name: 'Consultar' })).toHaveLength(3)
  view.rerender(<UserManagementTable {...props} isLoading />)
  expect(screen.getByRole('table').getAttribute('aria-busy')).toBe('true')
  expect(within(screen.getByRole('table')).getByRole('cell').getAttribute('colspan')).toBe('7')
  view.rerender(<UserManagementTable {...props} users={[]} totalUsers={0} totalPages={1} />)
  expect(within(screen.getByRole('table')).getByRole('cell').textContent).toContain('No se encontraron usuarios')
  expect(screen.getByText('Mostrando 0 a 0 de 0 resultados')).toBeTruthy()
})

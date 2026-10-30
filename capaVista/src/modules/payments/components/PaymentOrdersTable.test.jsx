import { useState } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import PaymentOrdersTable from './PaymentOrdersTable'

const permissions = vi.hoisted(() => ({ revise: true }))
vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => ({ hasPermission: () => permissions.revise }) }))

const orders = ['Pendiente', 'Confirmado', 'Rechazado'].map((paymentStatus, index) => ({
  id: index + 1, nvNumber: `SYNTH-${index + 1}`, companyName: `Cliente sintético ${index + 1}`,
  rut: `RUT-SYNTH-${index + 1}`, createdAt: '2026-10-05', paymentStatus,
}))
const callbacks = { onSelectStatus: vi.fn(), onPrefetchDetails: vi.fn(), onViewDetail: vi.fn() }

function Table({ canUpdate = true, busy = false, items = orders }) {
  const [editingStatus, setEditingStatus] = useState({})
  return <PaymentOrdersTable orders={items} editingStatus={editingStatus}
    canUpdatePaymentStatus={canUpdate} isUpdatingPaymentStatus={busy} {...callbacks}
    onToggleEditor={id => setEditingStatus(current => ({ [id]: !current[id] }))}
    onCloseEditor={() => setEditingStatus({})} />
}

beforeEach(() => { vi.clearAllMocks(); permissions.revise = true })
afterEach(cleanup)

it('keeps the six columns, real records, statuses and icon-free management buttons', () => {
  render(<Table />)
  const headers = screen.getAllByRole('columnheader')
  expect(headers.map(header => header.textContent)).toEqual(['Pedido', 'Cliente', 'RUT', 'Fecha', 'Estado', 'Acciones'])
  expect(headers.every(header => header.getAttribute('scope') === 'col')).toBe(true)
  expect(headers.every(header => !header.querySelector('button, svg, i'))).toBe(true)
  const rows = screen.getAllByRole('row').slice(1)
  rows.forEach((row, index) => {
    const cells = within(row).getAllByRole('cell')
    expect(cells).toHaveLength(6)
    expect(cells.slice(0, 5).map(cell => cell.textContent)).toEqual([
      orders[index].nvNumber, orders[index].companyName, orders[index].rut, '05-10-2026', orders[index].paymentStatus,
    ])
    const manage = within(row).getByRole('button', { name: 'Gestionar' })
    expect(manage.querySelector('i, svg')).toBeNull()
    expect(manage.getAttribute('aria-haspopup')).toBe('menu')
  })
})

it('preserves prefetch, menu keyboard controls, confirmation and rejection callbacks', () => {
  render(<Table items={[orders[0]]} />)
  const manage = screen.getByRole('button', { name: 'Gestionar' })
  fireEvent.focus(manage)
  expect(callbacks.onPrefetchDetails).toHaveBeenCalledWith(orders[0])
  fireEvent.click(manage)
  const menu = screen.getByRole('menu', { name: 'Acciones de pago' })
  fireEvent.keyDown(menu, { key: 'ArrowDown' })
  expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Confirmar' }))
  fireEvent.keyDown(menu, { key: 'End' })
  expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Rechazar' }))
  fireEvent.click(document.activeElement)
  expect(callbacks.onSelectStatus).toHaveBeenLastCalledWith(orders[0], 'Rechazado')
  expect(screen.queryByRole('menu')).toBeNull()
  fireEvent.click(manage)
  fireEvent.click(screen.getByRole('menuitem', { name: 'Confirmar' }))
  expect(callbacks.onSelectStatus).toHaveBeenLastCalledWith(orders[0], 'Confirmado')
  fireEvent.click(manage)
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('menu')).toBeNull()
})

it('keeps resolved-payment details available without revision permission', () => {
  permissions.revise = false
  render(<Table items={[orders[1]]} />)
  expect(screen.queryByRole('button', { name: 'Gestionar' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Ver detalle' }))
  expect(callbacks.onViewDetail).toHaveBeenCalledWith(orders[1])
  expect(callbacks.onSelectStatus).not.toHaveBeenCalled()
})

it('blocks management while saving and respects update permission', () => {
  const view = render(<Table busy items={[orders[0]]} />)
  const button = screen.getByRole('button', { name: /Actualizar pago/ })
  expect(button.disabled).toBe(true)
  expect(button.getAttribute('aria-busy')).toBe('true')
  fireEvent.click(button)
  expect(screen.queryByRole('menu')).toBeNull()
  view.rerender(<Table canUpdate={false} items={[orders[0]]} />)
  expect(screen.queryByRole('button')).toBeNull()
})

it('keeps the empty state within all six columns', () => {
  render(<Table items={[]} />)
  const cell = screen.getByRole('cell')
  expect(cell.getAttribute('colspan')).toBe('6')
  expect(cell.textContent).toBe('No hay pedidos que coincidan con los filtros aplicados.')
})

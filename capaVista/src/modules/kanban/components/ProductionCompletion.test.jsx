import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { render } from '../../../test/renderWithToast'
import KanbanOffCanvas from './KanbanOffCanvas'

afterEach(cleanup)
const order = { id: 1, salesNoteNumber: 'NV-1', generalStepId: 2, paymentStatus: 'Confirmado',
  items: [{ id: 2, product: 'Tarjeta', subProcesses: [{ id: 3, name: 'Corte', status: 'done' }] }] }
function show(overrides = {}, callback = vi.fn()) {
  render(<KanbanOffCanvas isOpen order={{ ...order, ...overrides }} canFinishProduction onFinishProduction={callback} onClose={vi.fn()} />)
  return callback
}
it('opens the simple PIN modal, sends one operation and blocks repeated submissions', async () => {
  let resolve
  const finish = show({}, vi.fn(() => new Promise(done => { resolve = done })))
  fireEvent.click(screen.getByRole('button', { name: 'Finalizar producción' }))
  const dialog = screen.getByRole('dialog', { name: 'Finalizar producción' })
  expect(within(dialog).queryByRole('textbox')).toBeNull()
  fireEvent.change(screen.getByLabelText('PIN personal'), { target: { value: '123456' } })
  fireEvent.submit(dialog)
  fireEvent.submit(dialog)
  expect(finish).toHaveBeenCalledTimes(1)
  expect(finish).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), { pin: '123456' })
  resolve()
  await waitFor(() => expect(screen.queryByLabelText('PIN personal')).toBeNull())
})
it.each(['PIN_INVALID', 'PIN_LOCKED', 'ORDER_CONFLICT'])('keeps modal open and reports %s only in Toast', async code => {
  show({}, vi.fn().mockRejectedValue({ status: 409, payload: { code, message: 'La operación fue rechazada.' } }))
  fireEvent.click(screen.getByRole('button', { name: 'Finalizar producción' }))
  fireEvent.change(screen.getByLabelText('PIN personal'), { target: { value: '123456' } })
  fireEvent.submit(screen.getByRole('dialog', { name: 'Finalizar producción' }))
  const message = await screen.findByText('La operación fue rechazada.')
  expect(message.closest('[data-toast-viewport]')).toBeTruthy()
  expect(within(screen.getByRole('dialog', { name: 'Finalizar producción' })).queryByRole('alert')).toBeNull()
  expect(screen.getByLabelText('PIN personal').value).toBe('')
})
it('cancels authorization without executing the operation', () => {
  const finish = show()
  fireEvent.click(screen.getByRole('button', { name: 'Finalizar producción' }))
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  expect(finish).not.toHaveBeenCalled()
  expect(screen.queryByLabelText('PIN personal')).toBeNull()
})
it.each([
  { generalStepId: 1 },
  { items: [] },
  { items: [{ subProcesses: [] }] },
  { items: [{ subProcesses: [{ status: 'pending' }] }] },
])('does not offer completion for incompatible or unfinished orders: %j', overrides => {
  show(overrides)
  expect(screen.queryByRole('button', { name: 'Finalizar producción' })).toBeNull()
})
it('shows completed state and available audit information instead of the button', () => {
  show({ generalStepId: 3, orderStatus: 'Listo para entrega', productionCompletion: { completedAt: '2026-10-27T12:00:00Z', responsible: 'Ana Pérez' } })
  expect(screen.getByText('Producción finalizada')).toBeTruthy()
  expect(screen.getByText('Ana Pérez')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Finalizar producción' })).toBeNull()
})
it('does not offer completion without permission', () => {
  render(<KanbanOffCanvas isOpen order={order} onClose={vi.fn()} />)
  expect(screen.queryByRole('button', { name: 'Finalizar producción' })).toBeNull()
})

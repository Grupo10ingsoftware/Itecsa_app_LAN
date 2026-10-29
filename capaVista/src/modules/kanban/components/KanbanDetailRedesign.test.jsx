import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { render } from '../../../test/renderWithToast'
import KanbanOffCanvas from './KanbanOffCanvas'
import { KanbanSubprocesses } from './KanbanSubprocesses'
import { KanbanComments } from './KanbanComments'

afterEach(cleanup)
const order = { id: 1, salesNoteNumber: 'NV-1', generalStepId: 1, clientName: 'Cliente', items: [
  { id: 2, product: 'Tarjeta', quantity: 20, subProcesses: [{ id: 3, name: 'Corte', status: 'pending' }] },
] }
it('opens expanded, collapses independently, preserves correction input and resets on reopening', () => {
  const props = { isOpen: true, order, canReview: true, onClose: vi.fn() }
  const view = render(<KanbanOffCanvas {...props} />)
  const summary = screen.getByRole('button', { name: 'Resumen' })
  const correction = screen.getByRole('button', { name: 'Correccion previa a OP' })
  expect(summary.getAttribute('aria-expanded')).toBe('true')
  fireEvent.click(screen.getByRole('button', { name: 'Solicita correccion' }))
  const input = screen.getByLabelText('Especifique la correccion necesaria')
  fireEvent.change(input, { target: { value: 'Conservar texto' } })
  fireEvent.click(correction)
  expect(document.getElementById(correction.getAttribute('aria-controls')).hidden).toBe(true)
  expect(summary.getAttribute('aria-expanded')).toBe('true')
  fireEvent.click(correction)
  expect(screen.getByLabelText('Especifique la correccion necesaria')).toBe(input)
  expect(input.value).toBe('Conservar texto')
  fireEvent.click(summary)
  view.rerender(<KanbanOffCanvas {...props} isOpen={false} />)
  view.rerender(<KanbanOffCanvas {...props} />)
  expect(screen.getByRole('button', { name: 'Resumen' }).getAttribute('aria-expanded')).toBe('true')
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar detalle' }))
  expect(props.onClose).toHaveBeenCalledTimes(1)
})
it('the circle opens PIN authorization without performing an operation', async () => {
  const complete = vi.fn()
  render(<KanbanOffCanvas isOpen order={{ ...order, generalStepId: 2 }} canCompleteSubprocess onCompleteSubprocess={complete} onClose={vi.fn()} />)
  const circle = screen.getByRole('button', { name: 'Marcar como completo: Corte' })
  fireEvent.focus(circle)
  expect(await screen.findByRole('tooltip')).toBeTruthy()
  expect(screen.getByRole('tooltip').textContent).toBe('Marcar como completo')
  fireEvent.click(circle)
  expect(screen.getByLabelText('PIN personal')).toBeTruthy()
  expect(complete).not.toHaveBeenCalled()
})
it('preserves rollback, sequence and lanyard packaging restrictions', () => {
  const rollback = vi.fn(), complete = vi.fn()
  render(<KanbanSubprocesses isInProduction canCompleteSubprocess canRollbackSubprocess openAuthModal={complete} openRollbackModal={rollback}
    orderItems={[{ id: 1, product: 'Lanyard', quantity: 100, lanyardProgress: { percentage: 50, accumulatedQuantity: 50 }, subProcesses: [
      { id: 1, name: 'Impresion', status: 'done' }, { id: 2, name: 'Empaquetado', status: 'pending' }, { id: 3, name: 'Despacho', status: 'pending' },
    ] }]} />)
  fireEvent.click(screen.getByRole('button', { name: 'Retroceder subproceso: Impresion' }))
  expect(rollback).toHaveBeenCalledTimes(1)
  for (const name of ['Empaquetado', 'Despacho']) expect(screen.getByRole('button', { name: `Marcar como completo: ${name}` }).disabled).toBe(true)
  expect(complete).not.toHaveBeenCalled()
  expect(screen.getByText('50 / 100 lanyards')).toBeTruthy()
})
it('does not enable subprocess circles without permission', () => {
  render(<KanbanOffCanvas isOpen order={{ ...order, generalStepId: 2 }} onClose={vi.fn()} />)
  expect(screen.getByRole('button', { name: 'Marcar como completo: Corte' }).disabled).toBe(true)
  expect(screen.queryByRole('button', { name: 'Cancelar pedido' })).toBeNull()
})
it('keeps three real comment categories and supports keyboard tab navigation', async () => {
  render(<KanbanComments commentGroups={{ source: [{ id: 1, text: 'Manager completo' }], system: [{ id: 2, text: 'Sistema completo' }], subprocesses: [{ id: 3, text: 'Subproceso completo', subprocessName: 'Corte' }] }} />)
  expect(screen.getAllByRole('tab')).toHaveLength(3)
  const manager = screen.getByRole('tab', { name: 'Observaciones de Manager' })
  fireEvent.keyDown(manager, { key: 'ArrowRight' })
  await waitFor(() => expect(screen.getByRole('tabpanel').textContent).toContain('Subproceso completo'))
  fireEvent.click(screen.getByRole('tab', { name: 'Comentarios de subprocesos' }))
  expect(screen.getByRole('tabpanel').textContent).toContain('Subproceso completo')
  fireEvent.click(screen.getByRole('button', { name: 'Comentarios 3' }))
  fireEvent.click(screen.getByRole('button', { name: 'Comentarios 3' }))
  expect(screen.getByRole('tabpanel').textContent).toContain('Subproceso completo')
})

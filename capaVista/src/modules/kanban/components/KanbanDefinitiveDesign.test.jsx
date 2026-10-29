import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { render } from '../../../test/renderWithToast'
import KanbanOffCanvas from './KanbanOffCanvas'
import KanbanCard from './KanbanCard'
import { KanbanComments } from './KanbanComments'
import { KanbanOrderSummary } from './KanbanOrderSummary'
import { DragDropProvider } from '@dnd-kit/react'
import { PointerSensor, KeyboardSensor } from '@dnd-kit/dom'

// jsdom has no layout observer; keep the real drag sensors and provider.
vi.hoisted(() => {
  globalThis.ResizeObserver = class {
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
  }
})

afterEach(cleanup)
const order = { id: 1, salesNoteNumber: 'NV-1', generalStepId: 5, clientName: 'Cliente real', seller: 'Vendedor real', items: [{ id: 1, product: 'Tarjeta', subProcesses: [] }] }
function showReevaluation(callback) {
  render(<KanbanOffCanvas isOpen order={order} canReevaluate onReevaluate={callback} onClose={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Reevaluar pedido' }))
  return screen.getByRole('dialog', { name: 'Confirmar reevaluación' })
}
it('cancels reevaluation without calling the existing operation or requesting a PIN', async () => {
  const callback = vi.fn()
  const dialog = showReevaluation(callback)
  expect(within(dialog).getByText('¿Confirmas que ya corregiste la información de este pedido en Manager?')).toBeTruthy()
  expect(within(dialog).queryByLabelText('PIN personal')).toBeNull()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
  expect(callback).not.toHaveBeenCalled()
  expect(screen.queryByRole('dialog', { name: 'Confirmar reevaluación' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Reevaluar pedido' }))
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(callback).not.toHaveBeenCalled()
  expect(screen.queryByRole('dialog', { name: 'Confirmar reevaluación' })).toBeNull()
  await waitFor(() => expect(document.activeElement.closest('[role="dialog"]')?.getAttribute('aria-labelledby')).toBe('kanban-detail-title'))
})
it('confirms reevaluation once, blocks closing while pending and waits for the real result', async () => {
  let resolve
  const callback = vi.fn(() => new Promise(done => { resolve = done }))
  const dialog = showReevaluation(callback)
  fireEvent.submit(dialog)
  fireEvent.submit(dialog)
  expect(callback).toHaveBeenCalledExactlyOnceWith(order)
  expect(within(dialog).getByRole('button', { name: /Sí, ya corregí los datos/ }).disabled).toBe(true)
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.getByRole('dialog', { name: 'Confirmar reevaluación' })).toBeTruthy()
  await act(async () => resolve(true))
  expect(screen.queryByRole('dialog', { name: 'Confirmar reevaluación' })).toBeNull()
})
it('reports reevaluation errors through Toast and keeps confirmation available for retry', async () => {
  const callback = vi.fn().mockRejectedValue({ status: 409, payload: { code: 'ORDER_CONFLICT', message: 'Pedido modificado.' } })
  const dialog = showReevaluation(callback)
  fireEvent.submit(dialog)
  const message = await screen.findByText('Pedido modificado.')
  expect(message.closest('[data-toast-viewport]')).toBeTruthy()
  expect(within(dialog).queryByRole('alert')).toBeNull()
  expect(within(dialog).getByRole('button', { name: 'Sí, ya corregí los datos' }).disabled).toBe(false)
})
it('does not offer reevaluation without permission', () => {
  render(<KanbanOffCanvas isOpen order={order} onClose={vi.fn()} />)
  expect(screen.queryByRole('button', { name: 'Reevaluar pedido' })).toBeNull()
})
it('sorts real timestamps descending within every category without mutating records', () => {
  const entries = Object.freeze([
    Object.freeze({ id: 1, text: 'Anterior', createdAt: '2026-09-30T22:00:00Z' }),
    Object.freeze({ id: 2, text: 'Reciente', createdAt: '2026-10-01T01:30:00-03:00' }),
    Object.freeze({ id: 3, text: 'Sin fecha', createdAt: null }),
    Object.freeze({ id: 4, text: 'Fecha inválida', createdAt: 'invalid' }),
  ])
  render(<KanbanComments commentGroups={{ source: entries, system: entries, subprocesses: entries }} />)
  for (const tab of screen.getAllByRole('tab')) {
    fireEvent.click(tab)
    const texts = within(screen.getByRole('tabpanel')).getAllByRole('listitem').map(item => item.querySelector('p').textContent)
    expect(texts).toEqual(['Reciente', 'Anterior', 'Sin fecha', 'Fecha inválida'])
  }
  expect(entries[0].text).toBe('Anterior')
})
it.each(['Tarjeta', 'Lanyard', 'Yoyo', 'Otro producto'])('retains the actual summary fields for %s', product => {
  const details = { width: '15 mm', length: '90 cm', cardType: 'PVC', tapeTexture: 'Satinada', backgroundColor: 'Blanco', reverseLegend: 'Reverso real', frontLegend: 'Anverso real', endings: 'Gancho' }
  render(<KanbanOrderSummary order={order} orderItems={[{ id: 1, product, quantity: 123, dueDate: '30 oct. 2026', manufacturingDetails: details }]} />)
  for (const value of ['15 mm', '90 cm', '123', '30 oct. 2026', 'Cliente real', 'Vendedor real']) expect(screen.getByText(value)).toBeTruthy()
  if (product === 'Lanyard') {
    for (const value of ['Satinada', 'Blanco', 'Reverso real', 'Anverso real', 'Gancho']) expect(screen.getByText(value)).toBeTruthy()
    expect(screen.queryByText('Tipo de tarjeta')).toBeNull()
  } else expect(screen.getByText('PVC')).toBeTruthy()
})
it('shows completion metadata and one final action only when authorized', () => {
  const props = { isOpen: true, order: { ...order, generalStepId: 3, orderStatus: 'Listo para entrega', productionCompletion: { completedAt: '2026-10-28T12:00:00Z', responsible: 'Responsable real' } }, onClose: vi.fn() }
  const view = render(<KanbanOffCanvas {...props} canFinishProduction />)
  expect(screen.getByText('ETAPA COMPLETADA')).toBeTruthy()
  expect(screen.getByText('Responsable real')).toBeTruthy()
  expect(screen.getByText('Producción finalizada, ahora puedes finalizar este pedido.')).toBeTruthy()
  const button = screen.getByRole('button', { name: 'Finalizar pedido' })
  expect(button.closest('footer')).toBeTruthy()
  view.rerender(<KanbanOffCanvas {...props} />)
  expect(screen.queryByText('Producción finalizada, ahora puedes finalizar este pedido.')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Finalizar pedido' })).toBeNull()
  expect(screen.getByText('Responsable real')).toBeTruthy()
})
it('collapses cards independently, preserving indicators, drag eligibility and the separate detail action', () => {
  const onOpenDetail = vi.fn(), onToggleIndicator = vi.fn()
  render(<DragDropProvider>{['NV-1', 'NV-2'].map(salesNoteNumber => <KanbanCard key={salesNoteNumber} salesNoteNumber={salesNoteNumber} clientName="Cliente real"
    product="Tarjeta" quantity={100} dueDate="30 oct." isUrgent isProducing hasContractPriority isCorrectionRequested isPaymentDeconfirmationRequested
    canMove canManageIndicators onOpenDetail={onOpenDetail} onToggleIndicator={onToggleIndicator} />)}</DragDropProvider>)
  const collapse = screen.getByRole('button', { name: 'Contraer tarjeta NV-1' })
  const card = collapse.closest('article')
  const icon = collapse.querySelector('i')
  expect(PointerSensor.defaults.preventActivation({ target: icon }, { element: card })).toBe(true)
  expect(PointerSensor.defaults.preventActivation({ target: card }, { element: card })).toBe(false)
  expect(KeyboardSensor.defaults.preventActivation({ target: collapse }, { element: card })).toBe(true)
  expect(KeyboardSensor.defaults.preventActivation({ target: card }, { element: card })).toBe(false)
  fireEvent.click(collapse)
  expect(onOpenDetail).not.toHaveBeenCalled()
  expect(within(card).queryByRole('button', { name: 'Detalle' })).toBeNull()
  for (const title of ['Urgencia activa', 'PRODUCIÉNDOSE activa', 'Prioridad por contrato activa', 'Pedido en correccion', 'Solicitud de desconfirmacion']) expect(within(card).getByTitle(title)).toBeTruthy()
  fireEvent.click(within(card).getByTitle('Urgencia activa'))
  expect(onToggleIndicator).toHaveBeenCalledWith('urgent')
  expect(screen.getByRole('button', { name: 'Contraer tarjeta NV-2' }).getAttribute('aria-expanded')).toBe('true')
  fireEvent.click(screen.getByRole('button', { name: 'Expandir tarjeta NV-1' }))
  fireEvent.click(within(card).getByRole('button', { name: 'Detalle' }))
  expect(onOpenDetail).toHaveBeenCalledTimes(1)
  expect(within(card).getByText('Tarjeta')).toBeTruthy()
  expect(within(card).getByText('100')).toBeTruthy()
})
it('retains disabled indicators in a compact card without management permission', () => {
  render(<DragDropProvider><KanbanCard salesNoteNumber="NV-3" isMoveBlocked isUrgent /></DragDropProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'Contraer tarjeta NV-3' }))
  expect(screen.getByTitle('Urgencia activa').disabled).toBe(true)
  expect(screen.getByTitle('Pago pendiente')).toBeTruthy()
})

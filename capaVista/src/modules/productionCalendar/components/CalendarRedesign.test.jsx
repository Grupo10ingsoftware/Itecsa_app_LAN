import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { render } from '../../../test/renderWithToast'
import ProductionCalendarGrid from './ProductionCalendarGrid'
import CalendarToolbar from './CalendarToolbar'
import { PendingOrdersTray } from './CalendarOrderTrays'
import { formatScheduleState, getOrderToneClass } from '../utils/calendarPresentation'
import styles from './ProductionCalendarGrid.module.css'

const auth = vi.hoisted(() => ({ allowed: true }))
vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => ({ hasPermission: () => auth.allowed }) }))
afterEach(cleanup)
beforeEach(() => { auth.allowed = true })
const item = { id: 1, orderNumber: '24101', clientName: 'Cliente de prueba con nombre largo', productTypes: ['Tarjeta', 'Lanyard'], status: 'En producción', dueDate: '2026-10-05', labels: [] }
const props = { allItems: [item], items: [item], monthDate: new Date(2026, 9, 1), draggedItemId: 1,
  onDragEnd: vi.fn(), onDragStart: vi.fn(), getOrderDetail: vi.fn().mockResolvedValue(item) }
const transfer = { getData: () => '1', setData: vi.fn(), effectAllowed: '', dropEffect: '' }
const tray = () => screen.getByLabelText('Bandeja temporal para mover pedidos de mes')
const dayCell = number => within(screen.getByRole('region', { name: 'Calendario mensual de produccion' })).getAllByText(String(number), { selector: 'span' })[0].closest('article')

it.each([null, '', '2026-10-03', '2026-10-05'])('renders the actual stage independently of scheduling: %s', dueDate => {
  expect(formatScheduleState({ ...item, dueDate })).toBe('En producción')
  expect(formatScheduleState({ ...item, dueDate, orderStatus: 'Listo para Entrega' })).toBe('Listo para Entrega')
})
it('uses the existing stage lookup when only the stage number is available', () => {
  expect(formatScheduleState({ generalStepId: 2, dueDate: null })).toMatch(/producci/i)
})
it('preserves urgency and contract precedence', () => {
  expect(getOrderToneClass({ labels: [{ name: 'Urgencia' }] })).toBe(styles.urgentEvent)
  expect(getOrderToneClass({ labels: [{ name: 'Urgencia' }, { name: 'Prioridad por contrato' }] })).toBe(styles.contractPriorityEvent)
  expect(getOrderToneClass({ labels: [] })).toBe('')
})
it('pending cards show real stage and retain drag permissions and payload', () => {
  const onDragStart = vi.fn()
  render(<PendingOrdersTray items={[{ ...item, dueDate: null }]} onDragStart={onDragStart} />)
  expect(screen.getByText('En producción')).toBeTruthy()
  expect(screen.queryByText('Sin fecha programada')).toBeNull()
  const card = screen.getByText('24101').closest('article')
  expect(card.draggable).toBe(true)
  fireEvent.dragStart(card, { dataTransfer: transfer })
  expect(onDragStart).toHaveBeenCalledWith(1)
  expect(transfer.setData).toHaveBeenCalledWith('text/plain', 1)
})
it('keeps transfer orders when changing month, cancelling or failing PIN; persists only after authorization', async () => {
  const save = vi.fn().mockRejectedValueOnce({ status: 403, payload: { code: 'PIN_INVALID', message: 'El PIN ingresado no es valido.' } }).mockResolvedValueOnce({})
  const view = render(<ProductionCalendarGrid {...props} onChangeDeliveryDate={save} />)
  fireEvent.drop(tray(), { dataTransfer: transfer })
  expect(within(tray()).getByText('24101')).toBeTruthy()
  expect(save).not.toHaveBeenCalled()
  view.rerender(<ProductionCalendarGrid {...props} allItems={[]} items={[]} monthDate={new Date(2026, 10, 1)} onChangeDeliveryDate={save} />)
  expect(within(tray()).getByText('24101')).toBeTruthy()
  fireEvent.drop(dayCell(4), { dataTransfer: transfer })
  fireEvent.click(screen.getByRole('button', { name: 'No' }))
  expect(within(tray()).getByText('24101')).toBeTruthy()
  fireEvent.drop(dayCell(4), { dataTransfer: transfer })
  expect(save).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Si' }))
  fireEvent.change(screen.getByLabelText('PIN personal'), { target: { value: '000000' } })
  fireEvent.submit(screen.getByRole('dialog'))
  const error = await screen.findByText('El PIN ingresado no es valido.')
  expect(error.closest('[data-toast-viewport]')).toBeTruthy()
  expect(within(screen.getByRole('dialog')).queryByRole('alert')).toBeNull()
  expect(within(tray()).getByText('24101')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('PIN personal'), { target: { value: '123456' } })
  fireEvent.submit(screen.getByRole('dialog'))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(save).toHaveBeenLastCalledWith(1, '2026-11-04', { pin: '123456' })
  expect(within(tray()).queryByText('24101')).toBeNull()
  expect(screen.getByText('Fecha de entrega actualizada correctamente.').closest('[data-toast-viewport]')).toBeTruthy()
})
it('schedules pending orders through the existing confirmation and allows cancellation without persistence', () => {
  const save = vi.fn()
  render(<ProductionCalendarGrid {...props} items={[]} allItems={[{ ...item, dueDate: null }]} onChangeDeliveryDate={save} />)
  const pending = screen.getByRole('complementary', { name: 'Pedidos pendientes de programar' })
  fireEvent.drop(dayCell(5), { dataTransfer: transfer })
  expect(screen.getByRole('dialog')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'No' }))
  expect(save).not.toHaveBeenCalled()
  expect(within(pending).getByText('24101')).toBeTruthy()
})
it('does not allow moving orders without the existing permission', () => {
  auth.allowed = false
  const save = vi.fn()
  render(<ProductionCalendarGrid {...props} onChangeDeliveryDate={save} />)
  expect(screen.getByRole('button', { name: /24101/ }).draggable).toBe(false)
  fireEvent.drop(tray(), { dataTransfer: transfer })
  fireEvent.drop(dayCell(6), { dataTransfer: transfer })
  expect(save).not.toHaveBeenCalled()
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(within(tray()).queryByText('24101')).toBeNull()
})
it('monthly navigation exposes previous, next and Today without extra views', () => {
  const previous = vi.fn(), next = vi.fn(), today = vi.fn()
  render(<CalendarToolbar monthDate={new Date(2026, 9, 1)} onPreviousMonth={previous} onNextMonth={next} onToday={today} />)
  fireEvent.click(screen.getByTitle('Mes anterior'))
  fireEvent.click(screen.getByTitle('Mes siguiente'))
  fireEvent.click(screen.getByRole('button', { name: 'Hoy' }))
  expect(previous).toHaveBeenCalledOnce()
  expect(next).toHaveBeenCalledOnce()
  expect(today).toHaveBeenCalledOnce()
  expect(screen.getAllByRole('button')).toHaveLength(3)
})

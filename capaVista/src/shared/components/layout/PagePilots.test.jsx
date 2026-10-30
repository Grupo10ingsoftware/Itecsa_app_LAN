import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import CalendarFilters from '../../../modules/productionCalendar/components/CalendarFilters'
import CalendarHeader from '../../../modules/productionCalendar/components/CalendarHeader'
import OrderCreateHeader from '../../../modules/orders/components/OrderCreateHeader'

afterEach(cleanup)

it('el piloto de pedidos solo muestra el título funcional', () => {
  render(<OrderCreateHeader />)
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('REGISTRO DE PEDIDO')
  expect(screen.queryByText('Ventas')).toBeNull()
})

it('el calendario usa el panel compartido y colapsar conserva el borrador sin aplicar', () => {
  const onApply = vi.fn()
  render(<><CalendarHeader /><CalendarFilters
    filters={{ status: '', productType: '', search: 'Cliente' }}
    onChange={vi.fn()} onClear={vi.fn()} onApply={onApply} /></>)
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Calendario')
  expect(screen.queryByRole('searchbox')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Expandir filtros de calendario' }))
  fireEvent.click(screen.getByRole('button', { name: 'Contraer filtros de calendario' }))
  fireEvent.click(screen.getByRole('button', { name: 'Expandir filtros de calendario' }))
  expect(screen.getByRole('searchbox').value).toBe('Cliente')
  expect(onApply).not.toHaveBeenCalled()
})

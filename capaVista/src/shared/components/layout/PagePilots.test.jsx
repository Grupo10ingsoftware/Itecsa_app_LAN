import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import CalendarHeader from '../../../modules/productionCalendar/components/CalendarHeader'
import OrderCreateHeader from '../../../modules/orders/components/OrderCreateHeader'

afterEach(cleanup)

it('el piloto de pedidos solo muestra el título funcional', () => {
  render(<OrderCreateHeader />)
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('REGISTRO DE PEDIDO')
  expect(screen.queryByText('Ventas')).toBeNull()
})

it('el piloto del calendario conserva callback y ambos estados del botón', () => {
  const onToggle = vi.fn()
  function Calendar() {
    const [open, setOpen] = useState(false)
    return <CalendarHeader isFiltersOpen={open} onToggleFilters={() => { onToggle(); setOpen(!open) }} />
  }
  render(<Calendar />)
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Calendario')
  fireEvent.click(screen.getByRole('button', { name: 'Mostrar filtros' }))
  fireEvent.click(screen.getByRole('button', { name: 'Ocultar filtros' }))
  expect(onToggle).toHaveBeenCalledTimes(2)
  expect(screen.queryByText('Produccion')).toBeNull()
})

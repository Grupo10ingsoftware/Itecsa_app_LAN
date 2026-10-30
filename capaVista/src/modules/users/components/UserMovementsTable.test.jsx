import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import UserMovementsTable from './UserMovementsTable'
import TablePagination from '../../../shared/components/pagination/TablePagination'

afterEach(cleanup)
const record = { id: 21, detail: 'Movimiento real', dateTime: '2026-10-30T12:00:00Z' }

it('keeps the same table and headers while replacing only its loading body', () => {
  const view = render(<UserMovementsTable isLoading />)
  const table = screen.getByRole('table')
  const headers = within(table).getAllByRole('columnheader')
  expect(headers.map(header => header.textContent)).toEqual(['Identificador', 'Detalle del movimiento', 'Fecha'])
  expect(table.getAttribute('aria-busy')).toBe('true')
  expect(table.querySelector('tbody td').getAttribute('colspan')).toBe('3')
  expect(table.querySelector('tbody [role="status"]')).toBeTruthy()
  view.rerender(<UserMovementsTable records={[record]} />)
  expect(screen.getByRole('table')).toBe(table)
  expect(within(table).getAllByRole('columnheader')[0]).toBe(headers[0])
  expect(table.getAttribute('aria-busy')).toBe('false')
  expect(screen.getByText(record.detail)).toBeTruthy()
})

it('puts scrolling table and pagination in a single card without a separate footer wrapper', () => {
  render(<UserMovementsTable records={[record]} scrollable>
    <TablePagination integrated page={1} pageSize={10} total={1} visibleCount={1} onPageChange={vi.fn()} />
  </UserMovementsTable>)
  const scroller = screen.getByRole('region', { name: 'Movimientos del usuario' })
  const footer = screen.getByRole('navigation').closest('footer')
  expect(scroller.nextElementSibling).toBe(footer)
  expect(footer.parentElement).toBe(scroller.parentElement)
  expect(scroller.contains(footer)).toBe(false)
})

it('distinguishes a completed empty response from an error with explicit retry', () => {
  const onRetry = vi.fn()
  const view = render(<UserMovementsTable records={[]} />)
  expect(screen.getByText('No existen movimientos para esta consulta.')).toBeTruthy()
  view.rerender(<UserMovementsTable error onRetry={onRetry} />)
  expect(screen.queryByText('No existen movimientos para esta consulta.')).toBeNull()
  expect(screen.getAllByRole('columnheader')).toHaveLength(3)
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar actividad' }))
  expect(onRetry).toHaveBeenCalledOnce()
})

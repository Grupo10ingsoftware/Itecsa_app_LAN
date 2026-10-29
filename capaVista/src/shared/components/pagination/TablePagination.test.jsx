import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import TablePagination from './TablePagination'

afterEach(cleanup)
const props = { page: 1, pageSize: 10, total: 50, visibleCount: 10, label: 'Paginación de usuarios',
  onPageChange: vi.fn(), onPageSizeChange: vi.fn() }

it('shows five pages for 50 records and preserves the shared page-size options', () => {
  render(<TablePagination {...props} integrated />)
  expect(screen.getByText('Mostrando 1 a 10 de 50 resultados')).toBeTruthy()
  expect(screen.getAllByRole('button').map(button => button.getAttribute('aria-label'))).toEqual([
    'Página anterior', 'Página 1', 'Página 2', 'Página 3', 'Página 4', 'Página 5', 'Página siguiente',
  ])
  expect(screen.getByRole('button', { name: 'Página 1' }).getAttribute('aria-current')).toBe('page')
  const select = screen.getByRole('combobox', { name: 'Filas por página' })
  expect(select.value).toBe('10')
  expect([...select.options].map(option => option.value)).toEqual(['10', '20', '30', '40', '50'])
})

it.each([[1, 0, 0, '0 a 0'], [1, 7, 7, '1 a 7'], [2, 23, 10, '11 a 20'], [3, 23, 3, '21 a 23']])(
  'shows the actual range for page %s of %s records', (page, total, visibleCount, range) => {
    render(<TablePagination {...props} page={page} total={total} visibleCount={visibleCount} />)
    expect(screen.getByText(`Mostrando ${range} de ${total} resultados`)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Página anterior' }).disabled).toBe(page === 1)
    expect(screen.getByRole('button', { name: 'Página siguiente' }).disabled).toBe(page >= Math.max(1, Math.ceil(total / 10)))
  })

it('navigates and selects the row count without repeating the current page or enabling unavailable actions', () => {
  const onPageChange = vi.fn(), onPageSizeChange = vi.fn()
  const view = render(<TablePagination {...props} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} />)
  fireEvent.click(screen.getByRole('button', { name: 'Página anterior' }))
  fireEvent.click(screen.getByRole('button', { name: 'Página 1' }))
  expect(onPageChange).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }))
  expect(onPageChange).toHaveBeenCalledWith(2)
  fireEvent.change(screen.getByRole('combobox'), { target: { value: '30' } })
  expect(onPageSizeChange).toHaveBeenCalledWith(30)
  view.rerender(<TablePagination {...props} disabled />)
  expect(screen.getAllByRole('button').every(button => button.disabled)).toBe(true)
  expect(screen.getByRole('combobox').disabled).toBe(true)
})

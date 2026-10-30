import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import KanbanFilters from './KanbanFilters'

afterEach(cleanup)

it('applies both searches and product as one draft, preserves it on collapse, then clears all', () => {
  const apply = vi.fn(), clear = vi.fn()
  render(<KanbanFilters onApplyFilters={apply} onClearFilters={clear} />)
  expect(screen.queryByRole('searchbox')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Expandir filtros del tablero' }))
  fireEvent.change(screen.getByLabelText('Número de pedido'), { target: { value: '24038' } })
  fireEvent.change(screen.getByLabelText('Nombre del cliente'), { target: { value: 'Colegio Andes' } })
  fireEvent.change(screen.getByLabelText('Tipo de producto'), { target: { value: 'mixto' } })
  expect(apply).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Contraer filtros del tablero' }))
  fireEvent.click(screen.getByRole('button', { name: 'Expandir filtros del tablero' }))
  expect(screen.getByLabelText('Tipo de producto').value).toBe('mixto')
  fireEvent.click(screen.getByRole('button', { name: 'Buscar por nombre del cliente' }))
  expect(apply).toHaveBeenCalledExactlyOnceWith({ salesNoteNumber: '24038', clientName: 'Colegio Andes', productType: 'mixto' })
  fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
  expect(clear).toHaveBeenCalledOnce()
  expect(screen.getByLabelText('Número de pedido').value).toBe('')
  expect(screen.getByLabelText('Nombre del cliente').value).toBe('')
  expect(screen.getByLabelText('Tipo de producto').value).toBe('')
})

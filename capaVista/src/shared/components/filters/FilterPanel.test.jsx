import { useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import FilterPanel from './FilterPanel'
import { FilterChipGroup, FilterDateRange, FilterRow, FilterSearch, FilterSelect } from './FilterControls'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

function Fixture({ onApply, onClear, disabled = false }) {
  const [value, setValue] = useState({ search: '', status: '', from: '', to: '' })
  const change = (name, next) => setValue(current => ({ ...current, [name]: next }))
  return <FilterPanel label="Filtros de prueba" disabled={disabled} onApply={() => onApply(value)}
    onClear={() => { setValue({ search: '', status: '', from: '', to: '' }); onClear() }}>
    <FilterRow>
      <FilterSearch label="Pedido" searchLabel="Buscar pedidos" value={value.search} onChange={next => change('search', next)} />
      <FilterSelect label="Producto" value={value.status} onChange={next => change('status', next)}
        options={[{ value: '', label: 'Todos' }, { value: 'lanyard', label: 'Lanyard' }]} />
      <FilterDateRange from={value.from} to={value.to} onFromChange={next => change('from', next)} onToChange={next => change('to', next)} />
    </FilterRow>
  </FilterPanel>
}

function renderOpen(ui) {
  const view = render(ui)
  const toggle = screen.getByRole('button', { name: 'Expandir filtros de prueba' })
  expect(toggle.getAttribute('aria-expanded')).toBe('false')
  expect(screen.queryByRole('form')).toBeNull()
  fireEvent.click(toggle)
  return view
}

it('starts closed without exposing controls or applying criteria and closes again on a new mount', () => {
  const onApply = vi.fn(), onClear = vi.fn()
  const view = render(<Fixture onApply={onApply} onClear={onClear} />)
  expect(screen.getByRole('button', { name: 'Expandir filtros de prueba' }).getAttribute('aria-expanded')).toBe('false')
  expect(screen.queryByRole('searchbox')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Aplicar filtros' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Expandir filtros de prueba' }))
  expect(screen.getByRole('searchbox')).toBeTruthy()
  view.unmount()
  render(<Fixture onApply={onApply} onClear={onClear} />)
  expect(screen.queryByRole('searchbox')).toBeNull()
  expect(onApply).not.toHaveBeenCalled()
  expect(onClear).not.toHaveBeenCalled()
})

it('keeps draft values through accessible collapse without applying or clearing', () => {
  const onApply = vi.fn(), onClear = vi.fn()
  renderOpen(<Fixture onApply={onApply} onClear={onClear} />)
  fireEvent.change(screen.getByLabelText('Pedido'), { target: { value: 'NV-1' } })
  const toggle = screen.getByRole('button', { name: 'Contraer filtros de prueba' })
  expect(document.getElementById(toggle.getAttribute('aria-controls'))).toBeTruthy()
  fireEvent.click(toggle)
  expect(toggle.getAttribute('aria-expanded')).toBe('false')
  expect(screen.queryByRole('searchbox')).toBeNull()
  fireEvent.click(toggle)
  expect(screen.getByRole('searchbox').value).toBe('NV-1')
  expect(onApply).not.toHaveBeenCalled(); expect(onClear).not.toHaveBeenCalled()
})

it('applies all draft controls together from the integrated search or the footer', () => {
  const onApply = vi.fn()
  renderOpen(<Fixture onApply={onApply} onClear={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('Pedido'), { target: { value: 'NV-2' } })
  fireEvent.change(screen.getByLabelText('Producto'), { target: { value: 'lanyard' } })
  fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-01' } })
  fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-31' } })
  expect(onApply).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Buscar pedidos' }))
  expect(onApply).toHaveBeenCalledExactlyOnceWith({ search: 'NV-2', status: 'lanyard', from: '2026-10-01', to: '2026-10-31' })
  fireEvent.submit(screen.getByRole('form'))
  expect(onApply).toHaveBeenCalledTimes(2)
  const footer = screen.getByRole('button', { name: 'Aplicar filtros' }).parentElement
  expect(within(footer).getAllByRole('button').map(button => button.textContent)).toEqual(['Limpiar filtros', 'Aplicar filtros'])
  expect(footer.querySelector('svg')).toBeNull()
})

it('clear resets every control, including both boundaries, without also submitting', () => {
  const onApply = vi.fn(), onClear = vi.fn()
  renderOpen(<Fixture onApply={onApply} onClear={onClear} />)
  fireEvent.change(screen.getByLabelText('Pedido'), { target: { value: 'NV-2' } })
  fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-01' } })
  fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
  expect(screen.getByLabelText('Pedido').value).toBe('')
  expect(screen.getByLabelText('Desde').value).toBe('')
  expect(onClear).toHaveBeenCalledOnce(); expect(onApply).not.toHaveBeenCalled()
})

it('does not apply an invalid native date range', () => {
  const onApply = vi.fn()
  renderOpen(<Fixture onApply={onApply} onClear={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-30' } })
  fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-01' } })
  fireEvent.submit(screen.getByRole('form'))
  expect(onApply).not.toHaveBeenCalled()
})

it('disables controls and actions together while retaining the expansion control', () => {
  const onApply = vi.fn(), onClear = vi.fn()
  renderOpen(<Fixture onApply={onApply} onClear={onClear} disabled />)
  expect(screen.getByLabelText('Pedido').matches(':disabled')).toBe(true)
  expect(screen.getByRole('button', { name: 'Aplicar filtros' }).matches(':disabled')).toBe(true)
  fireEvent.submit(screen.getByRole('form'))
  expect(onApply).not.toHaveBeenCalled(); expect(onClear).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Contraer filtros de prueba' }))
  expect(screen.queryByRole('form')).toBeNull()
})

it('uses the same callback for explicit search click and Enter outside a panel form', () => {
  const search = vi.fn()
  render(<FilterSearch label="Actividad" value="texto" onChange={vi.fn()} onSearch={search} error="Consulta inválida" />)
  const input = screen.getByRole('searchbox')
  fireEvent.keyDown(input, { key: 'Enter' })
  fireEvent.click(screen.getByRole('button', { name: 'Actividad' }))
  expect(search).toHaveBeenCalledTimes(2)
  expect(input.getAttribute('aria-invalid')).toBe('true')
  expect(document.getElementById(input.getAttribute('aria-describedby')).textContent).toBe('Consulta inválida')
  expect(input.nextElementSibling.tagName).toBe('BUTTON')
})

it('exposes selection and counts without inventing multiple selection', () => {
  function Chips() {
    const [value, setValue] = useState('pending')
    return <FilterChipGroup label="Estado" value={value} onChange={setValue}
      options={[{ value: 'pending', label: 'Pendientes', count: 5 }, { value: 'done', label: 'Confirmados', count: 2 }]} />
  }
  render(<Chips />)
  expect(screen.getByRole('button', { pressed: true }).textContent).toBe('Pendientes 5')
  fireEvent.click(screen.getByRole('button', { name: 'Confirmados 2' }))
  expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(1)
  expect(screen.getByRole('button', { pressed: true }).textContent).toBe('Confirmados 2')
})

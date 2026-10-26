import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DeliveryChangeCredentialsModal } from './DeliveryChangeModals'

afterEach(cleanup)
const change = { item: { orderNumber: 'NV-fixture' } }
describe('operaciones de calendario protegidas por PIN', () => {
  it('rechaza doble submit y cierre por botón o Escape hasta terminar', async () => {
    let resolve
    const onConfirm = vi.fn(() => new Promise(yes => { resolve = yes })), onCancel = vi.fn()
    render(<DeliveryChangeCredentialsModal change={change} onConfirm={onConfirm} onCancel={onCancel} />)
    fireEvent.change(screen.getByPlaceholderText('000000'), { target: { value: '123456' } })
    const form = screen.getByRole('dialog')
    fireEvent.submit(form); fireEvent.submit(form)
    expect(onConfirm).toHaveBeenCalledOnce()
    expect(screen.getByRole('status').textContent).toContain('Cargando...')
    expect(screen.getByRole('button', { name: 'Cerrar validacion' }).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar validacion' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).not.toHaveBeenCalled()
    await act(async () => resolve())
    expect(screen.queryByRole('status')).toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledOnce()
  })
  it('libera la espera y permite corregir un error sin perder el contexto', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<DeliveryChangeCredentialsModal change={change} onConfirm={vi.fn().mockRejectedValue(Error('fixture'))} onCancel={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('000000'), { target: { value: '123456' } })
    fireEvent.submit(screen.getByRole('dialog'))
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
    expect(screen.getByText('No fue posible cambiar la fecha de entrega.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Confirmar' }).disabled).toBe(false)
    vi.restoreAllMocks()
  })
})

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { StrictMode, useEffect, useState } from 'react'
import ToastProvider from './ToastProvider'
import { useToast } from './useToast'
import PinModal from '../components/pin/PinModal'
import NotificationSession from './NotificationSession'

const identity = vi.hoisted(() => ({ provider: 'keycloak', isAuthenticated: true, user: { sub: 'one' } }))
vi.mock('../../app/providers/identityContext', () => ({ useIdentity: () => identity }))
afterEach(() => { cleanup(); vi.useRealTimers() })
function Controls() {
  const notify = useToast(), navigate = useNavigate(), location = useLocation()
  const [modal, setModal] = useState(false)
  return <><p>{location.pathname}</p>
    {['success', 'error', 'warning', 'info'].map(type => <button key={type} onClick={() => notify[type](`Resultado ${type}`)}>{type}</button>)}
    <button onClick={() => navigate('/otra')}>Navegar</button>
    <button onClick={() => setModal(true)}>Modal</button>
    {modal && <PinModal onClose={() => setModal(false)} title="Prueba contextual" actions={<button onClick={() => setModal(false)}>Volver</button>}><p>Corrige tu PIN aquí.</p></PinModal>}
  </>
}
function mount() { return render(<MemoryRouter><ToastProvider><Controls /></ToastProvider></MemoryRouter>) }
describe('presentación oficial', () => {
  it('usa un portal global, títulos y regiones de prioridad diferenciada; conserva el foco', () => {
    mount()
    const trigger = screen.getByRole('button', { name: 'success' })
    trigger.focus(); fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('button', { name: 'error' }))
    const viewport = screen.getByRole('region', { name: 'Notificaciones del sistema' })
    expect(viewport.parentElement).toBe(document.body)
    expect(within(viewport).getByRole('status').textContent).toContain('Éxito')
    expect(within(viewport).getByRole('alert').textContent).toContain('Resultado error')
    expect(document.activeElement).toBe(trigger)
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar notificación: Error' }))
    expect(within(viewport).queryByRole('alert')).toBeNull()
  })
  it('conserva avisos al navegar y no anuncia dos veces al rerenderizar', () => {
    mount()
    fireEvent.click(screen.getByText('info', { selector: 'button' }))
    fireEvent.click(screen.getByText('Navegar'))
    expect(screen.getByText('/otra')).toBeTruthy()
    expect(screen.getAllByText('Resultado info')).toHaveLength(1)
  })
  it('pausa con hover y teclado y libera todos los timers al desmontar', () => {
    vi.useFakeTimers()
    const view = mount()
    fireEvent.click(screen.getByText('warning', { selector: 'button' }))
    const card = screen.getByText('Resultado warning').closest('article')
    act(() => vi.advanceTimersByTime(3000))
    fireEvent.mouseEnter(card)
    act(() => vi.advanceTimersByTime(10000))
    const close = screen.getByRole('button', { name: 'Cerrar notificación: Advertencia' })
    act(() => close.focus())
    fireEvent.mouseLeave(card)
    act(() => vi.advanceTimersByTime(10000))
    expect(card.isConnected).toBe(true)
    act(() => screen.getByText('success', { selector: 'button' }).focus())
    act(() => vi.advanceTimersByTime(4140))
    expect(card.isConnected).toBe(false)
    view.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
  it('mantiene los avisos accesibles junto al modal y el PIN contextual', () => {
    mount()
    fireEvent.click(screen.getByText('error', { selector: 'button' }))
    fireEvent.click(screen.getByText('Modal', { selector: 'button' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('Resultado error')
    expect(screen.getByText('Corrige tu PIN aquí.').closest('[role="dialog"]')).toBeTruthy()
  })
  it('vacía la cola al cambiar de identidad y al terminar la sesión', () => {
    const renderTree = () => <MemoryRouter><NotificationSession><Controls /></NotificationSession></MemoryRouter>
    const view = render(renderTree())
    fireEvent.click(screen.getByText('success', { selector: 'button' }))
    identity.user = { sub: 'two' }
    view.rerender(renderTree())
    expect(screen.queryByText('Resultado success')).toBeNull()
    fireEvent.click(screen.getByText('info', { selector: 'button' }))
    identity.isAuthenticated = false
    view.rerender(renderTree())
    expect(screen.queryByText('Resultado info')).toBeNull()
    identity.isAuthenticated = true
  })
  it('ignora un resultado tardío cuando su productor ya salió de la página', () => {
    let finish
    function Producer() {
      const notify = useToast()
      return <button onClick={() => { finish = () => notify.success('Resultado anterior') }}>Comenzar</button>
    }
    const view = render(<ToastProvider><Producer /></ToastProvider>)
    fireEvent.click(screen.getByText('Comenzar'))
    view.rerender(<ToastProvider><p>Otra página</p></ToastProvider>)
    act(() => finish())
    expect(screen.queryByText('Resultado anterior')).toBeNull()
  })
  it('StrictMode conserva una emisión de montaje sin duplicarla o descartarla', () => {
    function Producer() {
      const notify = useToast()
      useEffect(() => { notify.info('Aviso de montaje', { source: 'test', operation: 'mount' }) }, [notify])
      return null
    }
    render(<StrictMode><ToastProvider><Producer /></ToastProvider></StrictMode>)
    expect(screen.getAllByText('Aviso de montaje')).toHaveLength(1)
  })
})

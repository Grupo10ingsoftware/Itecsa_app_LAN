import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import ProtectedRoute from './ProtectedRoute'

const { auth } = vi.hoisted(() => ({ auth: {} }))
vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => auth }))
afterEach(() => { cleanup(); vi.useRealTimers() })
describe('ciclos de inicialización protegidos', () => {
  it('una espera vencida no expulsa una nueva verificación antes de su límite', async () => {
    vi.useFakeTimers()
    Object.assign(auth, { isLoading: true, isAuthenticated: false, authStatus: 'loading' })
    const view = render(<MemoryRouter><ProtectedRoute fallback={<p>Salida de sesión</p>}><p>Contenido protegido</p></ProtectedRoute></MemoryRouter>)
    expect(screen.getByRole('status')).toBeTruthy()
    await act(() => vi.advanceTimersByTimeAsync(10_000))
    expect(screen.getByText('Salida de sesión')).toBeTruthy()
    Object.assign(auth, { isLoading: false, isAuthenticated: true, authStatus: 'authenticated' })
    view.rerender(<MemoryRouter><ProtectedRoute fallback={<p>Salida de sesión</p>}><p>Contenido protegido</p></ProtectedRoute></MemoryRouter>)
    expect(screen.getByText('Contenido protegido')).toBeTruthy()
    Object.assign(auth, { isLoading: true, isAuthenticated: false, authStatus: 'loading' })
    view.rerender(<MemoryRouter><ProtectedRoute fallback={<p>Salida de sesión</p>}><p>Contenido protegido</p></ProtectedRoute></MemoryRouter>)
    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.queryByText('Salida de sesión')).toBeNull()
    await act(() => vi.advanceTimersByTimeAsync(9_999))
    expect(screen.getByRole('status')).toBeTruthy()
  })
})

import { act, cleanup, screen, within, fireEvent } from '@testing-library/react'
import { render } from '../../../test/renderWithToast'
import { afterEach, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import NotificationBell from './NotificationBell'

const api = vi.hoisted(() => ({ getNotifications: vi.fn() }))
vi.mock('../hooks/useMessagesApi', () => ({ useMessagesApi: () => api }))
afterEach(() => { cleanup(); vi.useRealTimers() })
it('detecta mensajes nuevos FIFO, usa contenido genérico y conserva navegación autorizada', async () => {
  vi.useFakeTimers()
  api.getNotifications.mockResolvedValueOnce({ notifications: [{ id_mensaje: 1, contenido: 'privado inicial' }], unreadCount: 1 })
    .mockResolvedValue({ notifications: [{ id_mensaje: 3, contenido: 'contenido empresarial reservado' }, { id_mensaje: 2, contenido: 'otro contenido reservado' }], unreadCount: 2 })
  render(<MemoryRouter><NotificationBell /><Routes><Route path="/" element={null} /><Route path="/mensajes/:messageId" element={<p>Detalle autorizado</p>} /></Routes></MemoryRouter>)
  await act(() => vi.advanceTimersByTimeAsync(0))
  expect(document.querySelector('[data-toast-viewport] article')).toBeNull()
  await act(() => vi.advanceTimersByTimeAsync(5000))
  const host = screen.getByRole('region', { name: 'Notificaciones del sistema' })
  expect(within(host).getAllByText('Nuevo mensaje recibido.')).toHaveLength(2)
  expect(host.textContent).not.toContain('reservado')
  expect(host.textContent).not.toContain('privado')
  expect([...host.querySelectorAll('article')].map(node => node.dataset.severity)).toEqual(['info', 'info'])
  fireEvent.click(within(host).getAllByRole('button', { name: 'Leer mensaje' })[0])
  expect(screen.getByText('Detalle autorizado')).toBeTruthy()
  // A later poll containing the same IDs never enqueues them again.
  await act(() => vi.advanceTimersByTimeAsync(5000))
  expect(host.querySelectorAll('article').length).toBeLessThan(2)
})

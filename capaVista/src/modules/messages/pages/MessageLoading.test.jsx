import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom'
import MessageInboxPage from './MessageInboxPage'
import MessageDetailPage from './MessageDetailPage'

const { api } = vi.hoisted(() => ({ api: {} }))
vi.mock('../hooks/useMessagesApi', () => ({ useMessagesApi: () => api }))
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const message = (id, title) => ({ id_mensaje: id, Asunto: title, contenido: title, leido: true, fecha_publicacion: '2026-01-01' })
beforeEach(() => { api.getInbox = vi.fn(); api.getMessage = vi.fn(); api.openMessage = vi.fn(); api.markAsRead = vi.fn() })
afterEach(cleanup)

describe('lecturas de mensajes fuera de orden', () => {
  it('una respuesta anterior no oculta la carga ni sustituye el filtro nuevo', async () => {
    const first = deferred(), second = deferred()
    api.getInbox.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    render(<MemoryRouter><MessageInboxPage /></MemoryRouter>)
    await waitFor(() => expect(api.getInbox).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: 'No leídos' }))
    await waitFor(() => expect(api.getInbox).toHaveBeenCalledTimes(2))
    await act(async () => first.resolve({ messages: [message(1, 'Antiguo')] }))
    expect(screen.getByRole('status').textContent).toContain('Cargando...')
    expect(screen.queryByText('Antiguo')).toBeNull()
    await act(async () => second.resolve({ messages: [message(2, 'Actual')], total: 1 }))
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByRole('button', { name: /Actual/ })).toBeTruthy()
  })
  it('un error antiguo no pisa el resultado más reciente', async () => {
    const first = deferred(), second = deferred()
    api.getInbox.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    render(<MemoryRouter><MessageInboxPage /></MemoryRouter>)
    await waitFor(() => expect(api.getInbox).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: 'Leídos' }))
    await waitFor(() => expect(api.getInbox).toHaveBeenCalledTimes(2))
    await act(async () => second.resolve({ messages: [message(2, 'Nuevo')], total: 1 }))
    await act(async () => first.reject(Error('obsolete')))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('button', { name: /Nuevo/ })).toBeTruthy()
  })
  it('al cambiar de ruta descarta la apertura antigua sin repetir el marcado', async () => {
    const first = deferred(), second = deferred()
    api.openMessage.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    function Switch() { const navigate = useNavigate(); return <button onClick={() => navigate('/messages/2')}>Siguiente mensaje</button> }
    render(<MemoryRouter initialEntries={['/messages/1']}><Switch /><Routes><Route path="/messages/:messageId" element={<MessageDetailPage />} /></Routes></MemoryRouter>)
    await waitFor(() => expect(api.openMessage).toHaveBeenCalledWith('1'))
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente mensaje' }))
    await waitFor(() => expect(api.openMessage).toHaveBeenCalledWith('2'))
    await act(async () => first.resolve({ message: message(1, 'Anterior'), markedAsRead: true }))
    expect(api.markAsRead).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toBeTruthy()
    await act(async () => second.resolve({ message: message(2, 'Actual'), markedAsRead: false }))
    expect(screen.getByRole('heading', { name: 'Actual' })).toBeTruthy()
  })
  it('impide dos navegaciones y centraliza el marcado en el detalle', async () => {
    api.getInbox.mockResolvedValue({ messages: [{ ...message(1, 'Abrir'), leido: false }], total: 1 })
    api.openMessage.mockResolvedValue({ message: message(1,'Abrir'), markedAsRead: true })
    render(<MemoryRouter><Routes><Route path="/" element={<MessageInboxPage />} /><Route path="/mensajes/:messageId" element={<MessageDetailPage />} /></Routes></MemoryRouter>)
    const button = await screen.findByRole('button', { name: /Abrir/ })
    fireEvent.click(button); fireEvent.click(button)
    expect(api.markAsRead).not.toHaveBeenCalled()
    await waitFor(() => expect(api.openMessage).toHaveBeenCalledExactlyOnceWith('1'))
    expect(api.getMessage).not.toHaveBeenCalled()
  })
})

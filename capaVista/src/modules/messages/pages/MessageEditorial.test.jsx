import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import MessageDetailPage from './MessageDetailPage'
import { readFileSync } from 'node:fs'
const css = readFileSync('src/modules/messages/pages/MessageDetailPage.module.css', 'utf8')
const state = vi.hoisted(() => ({ api: {}, allowed: true }))
vi.mock('../hooks/useMessagesApi', () => ({ useMessagesApi: () => state.api }))
vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => ({ hasPermission: () => state.allowed }) }))
const message = { id_mensaje: 1, Asunto: 'Asunto extenso '.repeat(15), contenido: 'Mensaje breve.', leido: true, fecha_publicacion: '2026-10-29T12:00:00Z' }
function mount(extra = {}) {
 state.api.openMessage = vi.fn().mockResolvedValue({ message: { ...message, ...extra }, markedAsRead: false })
 return render(<MemoryRouter initialEntries={['/mensajes/1']}><Routes>
 <Route path="/mensajes/:messageId" element={<MessageDetailPage />} />
 <Route path="/mensajes" element={<h1>Bandeja</h1>} />
 </Routes></MemoryRouter>)
}
beforeEach(() => { state.allowed = true })
afterEach(cleanup)
it.each([[true, 'Leído'], [false, 'Sin leer']])('muestra asunto, fecha, categoría genérica y lectura %s', async (leido, label) => {
 mount({ leido }); await screen.findByRole('heading', { name: message.Asunto.trim() })
 expect(screen.getByText(label)).toBeTruthy(); expect(screen.getByText('Mensaje recibido')).toBeTruthy()
 expect(document.querySelector('time').dateTime).toBe(message.fecha_publicacion)
 expect(screen.queryByText('Pedido relacionado')).toBeNull()
 fireEvent.click(screen.getByRole('link', { name: 'Volver a la bandeja' }))
 expect(screen.getByRole('heading', { name: 'Bandeja' })).toBeTruthy()
})
it('conserva texto multilínea y HTML literal sin ejecutarlo', async () => {
 const contenido = 'Primera línea\n\n<img src=x onerror=alert(1)>\n' + 'Texto largo '.repeat(100)
 mount({ contenido }); await screen.findByText(/Primera línea/)
 const region = screen.getByRole('region', { name: 'Contenido del mensaje' })
 expect(region.querySelector('p').textContent).toBe(contenido)
 expect(region.querySelector('img')).toBeNull()
})
it('muestra NV y fecha del modelo, enlazando únicamente por ID interno', async () => {
 mount({ id_pedido: 85, pedido: { numero_nota_venta: '29049', fecha_estimada_termino: '2026-11-02' } })
 await screen.findByText('Nota de Venta 29049')
 expect(screen.getByText(/Entrega estimada:/)).toBeTruthy()
 expect(screen.getByRole('link', { name: /Ver pedido en Kanban/ }).getAttribute('href')).toBe('/kanban?pedido=85')
})
it('sin número comercial usa fallback y sin permisos conserva información sin acción', async () => {
 state.allowed = false; mount({ id_pedido: 85, pedido: null })
 await screen.findByText('Nota de Venta no disponible')
 expect(screen.queryByRole('link', { name: /Ver pedido en Kanban/ })).toBeNull()
})
it('estilos ajustan contenido sin altura mínima, envuelven texto y usan tokens corporativos', () => {
 const content = css.match(/\.content \{([^}]+)\}/)[1]
 expect(content).not.toMatch(/min-height:|(?<!line-)height:/)
 expect(content).toContain('white-space: pre-wrap')
 expect(content).toContain('overflow-wrap: anywhere')
 expect(css).toContain('@media (max-width: 575.98px)')
 expect(css).toContain('.orderLink { width: 100%; }')
 expect(css).toContain(':focus-visible')
 expect(css).toContain('border: 2px solid var(--page-brand-orange)')
 expect(css).not.toMatch(/#[\da-f]{3,8}\b|linear-gradient/i)
})

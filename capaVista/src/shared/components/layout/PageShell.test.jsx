import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import PageShell, { PageSurface } from './PageShell'
import PageHeader from './PageHeader'

afterEach(cleanup)

describe('Marco de página compartido', () => {
  it('conecta el banner y el contenido sin anidar main ni modificar el formulario', () => {
    const action = vi.fn()
    const { container } = render(<main><PageShell><PageSurface>
      <PageHeader title="Registro de pedido" titleId="order-title" actions={<button onClick={action}>Mostrar filtros</button>} />
      <form aria-label="Pedido"><input aria-label="Nota de venta" defaultValue="NV-123" /></form>
    </PageSurface></PageShell></main>)
    expect(container.querySelectorAll('main')).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 }).id).toBe('order-title')
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar filtros' }))
    expect(action).toHaveBeenCalledOnce()
    expect(screen.getByLabelText('Nota de venta').value).toBe('NV-123')
  })

  it('admite tarjetas separadas y límites de lectura sin truncar el título', () => {
    const title = 'SOLICITUDES SOBRE MIS DATOS Y UN TÍTULO EXTENSO'
    const { container } = render(<PageShell maxWidth="56rem"><PageHeader title={title} />
      <article>Mensaje recibido</article></PageShell>)
    expect(container.firstChild.style.getPropertyValue('--page-max-width')).toBe('56rem')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(title)
    expect(screen.getByRole('article').textContent).toBe('Mensaje recibido')
  })

  it('conserva indicaciones funcionales y estados condicionales en el banner', () => {
    const { rerender } = render(<PageHeader title="Usuarios"><p role="status">Autoriza con tu PIN.</p></PageHeader>)
    expect(screen.getByRole('status').textContent).toBe('Autoriza con tu PIN.')
    rerender(<PageHeader title="Usuarios" />)
    expect(screen.queryByRole('status')).toBeNull()
  })
})

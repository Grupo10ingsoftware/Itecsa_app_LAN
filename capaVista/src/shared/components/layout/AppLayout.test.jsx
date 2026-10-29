import { StrictMode } from 'react'
import { createPortal } from 'react-dom'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import AppLayout from './AppLayout'
import styles from './Layout.module.css'
vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => ({ hasPermission: () => true, hasRole: () => true }) }))
vi.mock('../../../app/informationPageLoaders', () => ({ preloadInformationPage: vi.fn(), preloadInformationPages: vi.fn() }))
vi.mock('../../../modules/profile/components/ProfileSummary', () => ({ default: () => null }))
vi.mock('../../../modules/messages/components/NotificationBell', () => ({ default: () => null }))
vi.mock('../../../modules/auth/components/LogoutButton', () => ({ default: () => <button>Salir</button> }))
let mobile, hoverCapable
beforeEach(() => {
 mobile = false
 hoverCapable = true
 vi.stubGlobal('matchMedia', vi.fn(query => ({ matches: query.includes('hover: hover') ? !mobile && hoverCapable : mobile })))
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
function mount(content = <button>Contenido</button>) {
 return render(<StrictMode><MemoryRouter><Routes><Route element={<AppLayout />}>
 <Route path="/" element={content} /><Route path="/metricas" element={<h1>Métricas</h1>} />
 </Route></Routes></MemoryRouter></StrictMode>)
}
const sidebar = () => document.getElementById('main-sidebar')
const collapsed = () => sidebar().classList.contains(styles.sidebarCollapsed)
const mobileOpen = () => sidebar().classList.contains(styles.sidebarMobileOpen)
function click(element) { fireEvent.pointerDown(element); fireEvent.pointerUp(element); fireEvent.click(element) }
it('cierra fuera, conserva clics internos y alterna sin doble cierre', () => {
 mount()
 expect(collapsed()).toBe(false)
 click(screen.getByRole('navigation', { name: 'Menú principal' }))
 expect(collapsed()).toBe(false)
 click(screen.getByRole('button', { name: 'Cerrar barra lateral' }).querySelector('i'))
 expect(collapsed()).toBe(true)
 click(screen.getByRole('button', { name: 'Abrir barra lateral' }).querySelector('i'))
 expect(collapsed()).toBe(false)
 click(screen.getByRole('button', { name: 'Contenido' }))
 expect(collapsed()).toBe(true)
 click(screen.getByRole('button', { name: 'Contenido' }))
 expect(collapsed()).toBe(true)
})
it('Escape cierra sin consumir el evento y otras teclas no cierran', () => {
 const onKeyDown = vi.fn(); mount(<input aria-label="Campo" onKeyDown={onKeyDown} />)
 fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' }); expect(collapsed()).toBe(false)
 fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' }); expect(collapsed()).toBe(true)
 expect(onKeyDown).toHaveBeenCalledTimes(2)
 expect(onKeyDown.mock.calls[1][0].defaultPrevented).toBe(false)
 fireEvent.keyDown(document, { key: 'Escape' }); expect(collapsed()).toBe(true)
})
it('conserva formulario y clics externos aunque un componente detenga la propagación', () => {
 const onSubmit = vi.fn(event => event.preventDefault())
 mount(<form onSubmit={onSubmit} onPointerDown={event => event.stopPropagation()}><input aria-label="Nombre" /><button>Guardar</button></form>)
 click(screen.getByRole('textbox')); expect(collapsed()).toBe(true)
 fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Texto' } })
 click(screen.getByRole('button', { name: 'Guardar' }))
 expect(screen.getByRole('textbox').value).toBe('Texto'); expect(onSubmit).toHaveBeenCalledTimes(1)
})
it('detecta interacciones en modales renderizados en un portal sin bloquearlas', () => {
 const action = vi.fn()
 mount(createPortal(<div role="dialog"><button onClick={action}>Acción modal</button></div>, document.body))
 click(screen.getByRole('button', { name: 'Acción modal' }))
 expect(collapsed()).toBe(true); expect(action).toHaveBeenCalledTimes(1)
})
it('conserva navegación desktop y cierre de navegación móvil', () => {
 mount(); click(screen.getByRole('link', { name: 'Reportes y estadísticas' }))
 expect(screen.getByRole('heading', { name: 'Métricas' })).toBeTruthy(); expect(collapsed()).toBe(false)
 mobile = true
 click(screen.getByRole('button', { name: 'Abrir menú lateral' }))
 expect(mobileOpen()).toBe(true)
 click(screen.getByRole('link', { name: 'Reportes y estadísticas' }))
 expect(mobileOpen()).toBe(false)
})
it('móvil y tablet: excluye apertura, conserva interior, cierra fuera y con Escape', () => {
 mobile = true; mount()
 click(screen.getByRole('button', { name: 'Contenido' }))
 expect(mobileOpen()).toBe(false); expect(collapsed()).toBe(false)
 const opener = screen.getByRole('button', { name: 'Abrir menú lateral' })
 click(opener.querySelector('i')); expect(mobileOpen()).toBe(true)
 click(opener); expect(mobileOpen()).toBe(true)
 click(sidebar()); expect(mobileOpen()).toBe(true)
 click(screen.getByRole('button', { name: 'Cerrar menú lateral' })); expect(mobileOpen()).toBe(false)
 click(opener); fireEvent.keyDown(document, { key: 'Escape' }); expect(mobileOpen()).toBe(false)
 click(opener); click(screen.getByRole('button', { name: 'Contenido' })); expect(mobileOpen()).toBe(false)
 expect(collapsed()).toBe(false)
})
it('consulta el breakpoint actual después de cambiar de tamaño', () => {
 mount(); mobile = true
 click(screen.getByRole('button', { name: 'Contenido' })); expect(collapsed()).toBe(false)
 mobile = false
 click(screen.getByRole('button', { name: 'Contenido' })); expect(collapsed()).toBe(true)
 mobile = true
 click(screen.getByRole('button', { name: 'Abrir menú lateral' })); expect(mobileOpen()).toBe(true)
 fireEvent.keyDown(document, { key: 'Escape' }); expect(mobileOpen()).toBe(false)
})
it('limpia todos los listeners propios incluso bajo StrictMode', () => {
 const add = vi.spyOn(document, 'addEventListener'), remove = vi.spyOn(document, 'removeEventListener')
 const view = mount()
 click(screen.getByRole('button', { name: 'Contenido' }))
 click(screen.getByRole('button', { name: 'Abrir barra lateral' }))
 view.unmount()
 const registrations = add.mock.calls.filter(([type, , capture]) => ['pointerdown', 'keydown'].includes(type) && capture === true)
 expect(registrations.length).toBeGreaterThan(0)
 for (const registration of registrations) expect(remove).toHaveBeenCalledWith(...registration)
})

function enter(pointerType = 'mouse') { fireEvent.pointerEnter(sidebar(), { pointerType }) }
function leave(pointerType = 'mouse') { fireEvent.pointerLeave(sidebar(), { pointerType }) }
it('hover abre temporalmente sin desplazar contenido y salir cierra', () => {
 mount(); click(screen.getByRole('button', { name: 'Cerrar barra lateral' }))
 const content = document.querySelector('main').parentElement
 expect(collapsed()).toBe(true)
 enter(); expect(collapsed()).toBe(false)
 expect(content.classList.contains(styles.contentAreaSidebarCollapsed)).toBe(true)
 click(screen.getByRole('navigation', { name: 'Menú principal' })); expect(collapsed()).toBe(false)
 leave(); expect(collapsed()).toBe(true)
})
it('el botón fija la apertura temporal y conserva el cierre manual', () => {
 mount(); click(screen.getByRole('button', { name: 'Cerrar barra lateral' }))
 enter(); click(screen.getByRole('button', { name: 'Abrir barra lateral' }))
 leave(); expect(collapsed()).toBe(false)
 expect(screen.getByRole('button', { name: 'Cerrar barra lateral' })).toBeTruthy()
 click(screen.getByRole('button', { name: 'Cerrar barra lateral' })); expect(collapsed()).toBe(true)
})
it.each(['externo', 'Escape', 'manual'])('cierre %s exige salir y entrar de nuevo para reabrir por hover', method => {
 mount(); click(screen.getByRole('button', { name: 'Cerrar barra lateral' })); enter()
 if (method === 'externo') click(screen.getByRole('button', { name: 'Contenido' }))
 if (method === 'Escape') fireEvent.keyDown(document, { key: 'Escape' })
 if (method === 'manual') {
  click(screen.getByRole('button', { name: 'Abrir barra lateral' }))
  click(screen.getByRole('button', { name: 'Cerrar barra lateral' }))
 }
 expect(collapsed()).toBe(true)
 enter(); expect(collapsed()).toBe(true)
 leave(); enter(); expect(collapsed()).toBe(false)
})
it('la apertura manual por teclado permanece al salir y Escape la cierra', () => {
 mount(); click(screen.getByRole('button', { name: 'Cerrar barra lateral' }))
 fireEvent.click(screen.getByRole('button', { name: 'Abrir barra lateral' }), { detail: 0 })
 enter(); leave(); expect(collapsed()).toBe(false)
 fireEvent.keyDown(document, { key: 'Escape' }); expect(collapsed()).toBe(true)
})
it('no activa hover con tacto, lápiz, sin capacidad hover o en móvil', () => {
 mount(); click(screen.getByRole('button', { name: 'Cerrar barra lateral' }))
 enter('touch'); expect(collapsed()).toBe(true)
 enter('pen'); expect(collapsed()).toBe(true)
 hoverCapable = false; enter(); expect(collapsed()).toBe(true); leave()
 hoverCapable = true; mobile = true; enter(); expect(collapsed()).toBe(true); leave()
 click(screen.getByRole('button', { name: 'Abrir menú lateral' })); expect(mobileOpen()).toBe(true)
 leave(); expect(mobileOpen()).toBe(true)
 click(screen.getByRole('button', { name: 'Cerrar menú' })); expect(mobileOpen()).toBe(false)
})
it('hover en contenido principal no expande el menú', () => {
 mount(); click(screen.getByRole('button', { name: 'Cerrar barra lateral' }))
 fireEvent.pointerEnter(screen.getByRole('button', { name: 'Contenido' }), { pointerType: 'mouse' })
 expect(collapsed()).toBe(true)
})

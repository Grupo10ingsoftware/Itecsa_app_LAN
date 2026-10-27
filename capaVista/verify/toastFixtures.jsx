import { createRoot } from 'react-dom/client'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { useEffect, useState } from 'react'
import AppLayout from '../src/shared/components/layout/AppLayout'
import ToastProvider from '../src/shared/notifications/ToastProvider'
import { useToast } from '../src/shared/notifications/useToast'
import PinModal from '../src/shared/components/pin/PinModal'
import { pages } from './pageFixtures'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap-icons/font/bootstrap-icons.css'
import '../src/styles/theme.css'
import '../src/styles/global.css'
import '../src/styles/bootstrap-overrides.css'

const id = new URLSearchParams(location.search).get('page') || 'users'
const [, route, file] = pages.find(page => page[0] === id)
const modules = import.meta.glob('../src/modules/**/pages/*.jsx')
const { default: Page } = await modules[`../src/modules/${file}.jsx`]()

export function Review() {
  const notify = useToast(), [modal, setModal] = useState(false)
  useEffect(() => {
    window.reviewToasts = notify
    window.reviewModal = setModal
  }, [notify])
  return <><Routes><Route element={<AppLayout />}><Route path={route.replace('/123', '/:orderId').replace('/1', '/:messageId')} element={<Page />} /></Route></Routes>
    {modal && <PinModal title="Validación contextual" description="La validación del formulario permanece en el modal."
      onClose={() => setModal(false)} actions={<button type="button" onClick={() => setModal(false)}>Volver</button>}>
      <label>PIN personal<input type="password" inputMode="numeric" /></label><p role="alert">El PIN ingresado no es válido.</p>
    </PinModal>}
  </>
}
createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={[route]}><ToastProvider><Review /></ToastProvider></MemoryRouter>)

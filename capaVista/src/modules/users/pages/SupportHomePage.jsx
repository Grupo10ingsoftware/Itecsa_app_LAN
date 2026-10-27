import { Link } from 'react-router-dom'
import { APP_ROUTES } from '../../../config/routes'
import IdentityPreparationPanel from '../components/IdentityPreparationPanel.jsx'

export default function SupportHomePage() {
  return (
    <section className="container-fluid py-4" aria-labelledby="support-title">
      <h1 id="support-title">Gestión de usuarios</h1>
      <p>Bienvenido al espacio de Soporte.</p>
      {import.meta.env?.VITE_IDENTITY_PREPARATION === 'true'
        ? <IdentityPreparationPanel />
        : <p role="status">La administración de cuentas aún no está disponible. Podrás gestionar usuarios cuando el servicio esté habilitado.</p>}
      <div className="d-flex flex-wrap gap-3">
        <Link className="btn btn-outline-primary" to={APP_ROUTES.MESSAGES}>Mis mensajes</Link>
        <Link className="btn btn-outline-secondary" to={APP_ROUTES.PROFILE}>Mi perfil</Link>
      </div>
    </section>
  )
}

import { Link } from 'react-router-dom'
import { APP_ROUTES } from '../../../config/routes'
import styles from './PasswordResetPage.module.css'

export default function PasswordResetPage() {
  return (
    <main className={styles.page}><section className={styles.panel}>
      <h1 className={styles.title}>Recuperar contraseña</h1>
      <p>La recuperación supervisada de credenciales todavía no está habilitada. Contacta al administrador.</p>
      <Link to={APP_ROUTES.LOGIN}>Volver al inicio de sesión</Link>
    </section></main>
  )
}

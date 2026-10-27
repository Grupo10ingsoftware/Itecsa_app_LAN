import { useState } from 'react'
import PinModal from '../../../shared/components/pin/PinModal'
import styles from '../../../shared/components/pin/PinModal.module.css'
import { useToast } from '../../../shared/notifications/useToast'

export default function TemporaryPasswordModal({ initialCredential, onClose }) {
  return initialCredential ? <InitialCredentialModal key={initialCredential.username} credential={initialCredential} onAccept={onClose} /> : null
}

function InitialCredentialModal({ credential, onAccept }) {
  const notify = useToast()
  const [visible, setVisible] = useState(false)
  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(credential.temporaryPassword)
      notify.success('Contraseña copiada.')
    } catch { notify.error('No fue posible copiar. Puedes visualizar y seleccionar la contraseña.') }
  }
  return <PinModal title="Usuario creado correctamente" canClose={false}
    actions={<button className={styles.primary} type="button" onClick={onAccept}>Aceptar</button>}>
    <p>Nombre de acceso: <strong>{credential.username}</strong></p>
    <label className={styles.field}>Contraseña inicial
      <input className={styles.input} readOnly autoComplete="off"
        type={visible ? 'text' : 'password'} value={credential.temporaryPassword} />
    </label>
    <div className={styles.footer}>
      <button className={styles.secondary} type="button" onClick={() => setVisible(value => !value)}>{visible ? 'Ocultar' : 'Visualizar'}</button>
      <button className={styles.secondary} type="button" onClick={copyPassword}>Copiar</button>
    </div>
    <p>Debe cambiarla al iniciar sesión. Al aceptar confirmas que registraste la credencial; no volverá a mostrarse.</p>
    <p>En caso de olvidar la contraseña, se debe crear una credencial temporal a través de Keycloak</p>
  </PinModal>
}

import { useRef, useState } from 'react'
import { useModalDialog } from '../hooks/useModalDialog.js'
import modalStyles from '../../payments/components/PaymentActionConfirmModal.module.css'
import formStyles from './UserCreateForm.module.css'

export default function TemporaryPasswordModal(props) {
  return props.initialCredential
    ? <InitialCredentialModal credential={props.initialCredential} onAccept={props.onClose} />
    : null
}

function InitialCredentialModal({ credential, onAccept }) {
  const [visible, setVisible] = useState(false)
  const [copyMessage, setCopyMessage] = useState('')
  const ref = useRef(null)
  const focus = useRef(null)
  useModalDialog({ containerRef: ref, initialFocusRef: focus, isOpen: true, canClose: false, onClose: onAccept })

  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(credential.temporaryPassword)
      setCopyMessage('Contraseña copiada.')
    } catch { setCopyMessage('No fue posible copiar. Puedes visualizar y seleccionar la contraseña.') }
  }

  return <div className={`${modalStyles.credentialsModalLayer} ${formStyles.credentialLayer}`} data-modal-layer="true" role="presentation">
    <section className={modalStyles.credentialsModal} ref={ref} role="dialog" aria-modal="true" aria-labelledby="created-user-title" tabIndex={-1}>
      <header className={modalStyles.credentialsModalHeader}>
        <h3 id="created-user-title" ref={focus} tabIndex={-1}>Usuario creado correctamente</h3>
      </header>
      <div className={modalStyles.credentialsModalBody}>
        <p>Nombre de acceso: <strong>{credential.username}</strong></p>
        <label className={modalStyles.credentialsField}>
          <span>Contraseña inicial</span>
          <input className={`${modalStyles.credentialsPinInput} ${formStyles.credentialPassword}`} readOnly autoComplete="off"
            type={visible ? 'text' : 'password'} value={credential.temporaryPassword} />
        </label>
        <div className={formStyles.credentialActions}>
          <button className={modalStyles.credentialsSecondaryButton} type="button" onClick={() => setVisible(value => !value)}>
            {visible ? 'Ocultar' : 'Visualizar'}
          </button>
          <button className={modalStyles.credentialsSecondaryButton} type="button" onClick={copyPassword}>Copiar</button>
        </div>
        {copyMessage && <p role="status">{copyMessage}</p>}
        <p className={formStyles.fieldHelp}>Debe cambiarla al iniciar sesión. Al aceptar confirmas que registraste la credencial; no volverá a mostrarse.</p>
      </div>
      <footer className={formStyles.credentialFooter}>
        <button className={modalStyles.credentialsPrimaryButton} type="button" onClick={onAccept}>Aceptar</button>
        <p className={formStyles.fieldHelp}>En caso de olvidar la contraseña, se debe crear una credencial temporal a través de Keycloak</p>
      </footer>
    </section>
  </div>
}

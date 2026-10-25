import { useEffect, useRef, useState } from 'react'
import { useAdminUsersApi } from '../hooks/useAdminUsersApi.js'
import { useModalDialog } from '../hooks/useModalDialog.js'
import { runtimeConfig } from '../../../config/runtimeConfig.js'
import modalStyles from '../../payments/components/PaymentActionConfirmModal.module.css'
import formStyles from './UserCreateForm.module.css'

export default function TemporaryPasswordModal(props) {
  return props.initialCredential
    ? <InitialCredentialModal credential={props.initialCredential} onAccept={props.onClose} />
    : <PasswordResetModal {...props} />
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

function PasswordResetModal({ user, onClose }) {
  const api = useAdminUsersApi()
  const [pin, setPin] = useState('')
  const [verified, setVerified] = useState(false)
  const [credential, setCredential] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const ref = useRef(null)
  const focus = useRef(null)
  const secure = window.location.protocol === 'https:' && runtimeConfig.apiBaseUrl.startsWith('https://')
  useModalDialog({ containerRef: ref, initialFocusRef: focus, isOpen: true, canClose: !busy, onClose })
  useEffect(() => {
    if (!credential) return
    const timer = window.setTimeout(() => { setCredential(null); setError('La credencial se oculto. Si no fue entregada, inicia un nuevo procedimiento.') }, 90000)
    return () => window.clearTimeout(timer)
  }, [credential])
  async function submit(event) {
    event.preventDefault()
    if (!secure || !verified || !/^\d{6}$/.test(pin)) return
    setBusy(true); setError(''); setCredential(null)
    try {
      const result = await api.setTemporaryPassword({ userId: user.idUsuarioAutenticacionExterna, pin, identityVerified: verified })
      if (typeof result?.temporaryPassword !== 'string' || result.mustChangePassword !== true) throw Error('Respuesta de credenciales incompleta.')
      setCredential(result)
    } catch (failure) {
      setError(failure?.payload?.message || 'No fue posible completar el procedimiento. Revisa el estado de la cuenta antes de reintentar.')
    } finally { setPin(''); setVerified(false); setBusy(false) }
  }
  return <div className="modal d-block" role="presentation" style={{ background: 'rgba(0,0,0,.5)' }}>
    <section className="modal-dialog modal-dialog-centered" role="dialog" aria-modal="true" aria-labelledby="credentials-title" ref={ref} tabIndex={-1}>
      <form className="modal-content" onSubmit={submit}>
        <header className="modal-header"><h2 className="h5" id="credentials-title" ref={focus} tabIndex={-1}>Credenciales de {user.nombreCompleto}</h2></header>
        <div className="modal-body">
          <p>Verifica personalmente la identidad del destinatario y entrega la contraseña por un canal seguro. No se enviara correo.</p>
          {!secure && <p role="alert" className="alert alert-warning">Este procedimiento requiere HTTPS tanto en la aplicacion como en la API.</p>}
          {credential ? <div role="status">
            <p>Usuario: <strong>{credential.username}</strong></p>
            <label className="form-label w-100">Contraseña temporal<input className="form-control" readOnly value={credential.temporaryPassword} autoComplete="off" /></label>
            <p>Debe cambiarla al entrar. Se ocultara al cerrar o tras 90 segundos. No la guardes en tickets ni capturas.</p>
          </div> : <>
            <label className="form-label w-100">Tu PIN administrativo<input className="form-control" type="password" inputMode="numeric" autoComplete="off" maxLength={6}
              value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, ''))} disabled={busy || !secure} /></label>
            <label><input type="checkbox" checked={verified} onChange={event => setVerified(event.target.checked)} disabled={busy || !secure} /> He verificado la identidad del destinatario.</label>
          </>}
          {error && <p className="alert alert-danger" role="alert">{error}</p>}
        </div>
        <footer className="modal-footer">
          <button className="btn btn-secondary" type="button" disabled={busy} onClick={onClose}>Cerrar</button>
          {!credential && <button className="btn btn-primary" type="submit" disabled={busy || !secure || !verified || !/^\d{6}$/.test(pin)}>Establecer contraseña temporal</button>}
        </footer>
      </form>
    </section>
  </div>
}

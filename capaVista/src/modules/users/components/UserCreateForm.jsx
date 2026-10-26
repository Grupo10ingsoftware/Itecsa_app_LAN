import { LoadingAction } from '../../../shared/components/loading/LoadingIndicator'
import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import PaymentCredentialsModal from '../../payments/components/PaymentCredentialsModal.jsx'
import TemporaryPasswordModal from './TemporaryPasswordModal.jsx'
import { getRoleLabel, manageableRoles } from '../../../config/roles'
import { API_ERROR_CODES } from '../../../services/api/apiClient'
import { useAuth } from '../../../hooks/useAuth'
import { useAdminUsersApi } from '../hooks/useAdminUsersApi'
import { hasValidationErrors, validateUserCreateForm } from '../utils/userValidation'
import styles from './UserCreateForm.module.css'
import { generateUsername } from '../utils/generateUsername.js'

const INITIAL_VALUES = Object.freeze({ nombreUsuario: '', apellidoUsuario: '', rutUsuario: '', correoUsuario: '', rolUsuario: '', username: '' })
const INITIAL_ERRORS = Object.freeze({ nombreUsuario: [], apellidoUsuario: [], rutUsuario: [], correoUsuario: [], rolUsuario: [], username: [] })
const MESSAGE_TYPES = Object.freeze({ WARNING: 'warning', DANGER: 'danger', INFO: 'info' })

function FieldErrors({ errors, id }) {
  return errors.length ? <div className={styles.fieldErrors} id={id}>{errors.map(error => <p key={error}>{error}</p>)}</div> : null
}
function getErrorMessage(error) {
  if (error?.payload?.code?.startsWith('PIN_')) return { type: MESSAGE_TYPES.DANGER, text: error.payload.message }
  if (error?.code === API_ERROR_CODES.SESSION_INVALID || error?.status === 401) {
    return { type: MESSAGE_TYPES.WARNING, text: 'La sesion no es valida o expiro. Vuelve a iniciar sesion.', requiresLogin: true }
  }
  if (error?.status === 403) return { type: MESSAGE_TYPES.DANGER, text: 'Acceso denegado. No tienes permisos para preparar esta cuenta.' }
  if (error?.status === 409) return { type: MESSAGE_TYPES.WARNING, text: 'La cuenta o la operacion tiene un conflicto. Revisa su estado antes de repetir el alta.' }
  return { type: MESSAGE_TYPES.DANGER, text: error?.payload?.message || 'No se pudo confirmar la preparacion. Revisa el estado antes de repetirla.' }
}
function preparationMessage(result) {
  return { type: result.outcome === 'user_created' ? MESSAGE_TYPES.INFO : MESSAGE_TYPES.WARNING,
    text: result.outcome === 'user_created'
      ? 'Usuario creado. Si no registraste la contraseña inicial, crea una nueva credencial temporal a través de Keycloak.'
      : 'Creación incompleta. No repitas el alta. Referencia: ' + result.operationId + '.' }
}
export default function UserCreateForm({ mode = 'page', onBusyChange, onCancel, onCreated } = {}) {
  const { loginWithRedirect, user: actor } = useAuth()
  const adminUsersApi = useAdminUsersApi()
  const [values, setValues] = useState(INITIAL_VALUES)
  const [fieldErrors, setFieldErrors] = useState(INITIAL_ERRORS)
  const [message, setMessage] = useState(null)
  const [createdUser, setCreatedUser] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [pinAction, setPinAction] = useState(null)
  const [pinError, setPinError] = useState('')
  const [credential, setCredential] = useState(null)
  const submitting = useRef(false)
  function handleFieldChange({ target: { name, value } }) {
    if (createdUser || pinAction || isSubmitting) return
    setValues(current => {
      const next = { ...current, [name]: value }
      if (name === 'nombreUsuario' || name === 'apellidoUsuario') {
        next.username = generateUsername(next.nombreUsuario, next.apellidoUsuario)
      }
      return next
    })
    if (!createdUser) setMessage(null)
  }
  async function handleSubmit(event) {
    event.preventDefault()
    if (isSubmitting || createdUser || pinAction || credential) return
    const nextErrors = validateUserCreateForm(values)
    nextErrors.username = values.username && values.username === values.username.trim().toLowerCase()
      && values.username.length <= 255 && !/\s/u.test(values.username)
      && [...values.username].every(char => char.codePointAt(0) > 32) ? [] : ['Ingresa un nombre de acceso en minusculas, sin espacios.']
    if (!manageableRoles(actor?.rolUsuario).includes(values.rolUsuario)) nextErrors.rolUsuario = ['No puedes asignar ese rol.']
    setFieldErrors(nextErrors)
    setMessage(null)
    if (hasValidationErrors(nextErrors)) return
    openPin('create')
  }
  function openPin(action) {
    setPinError('')
    setPinAction(action)
    onBusyChange?.(true)
  }
  function cancelPin() {
    if (submitting.current) return
    setPinAction(null)
    setPinError('')
    onBusyChange?.(false)
  }
  async function confirmPin({ pin }) {
    if (submitting.current) return
    submitting.current = true
    setIsSubmitting(true)
    setPinError('')
    try {
      const response = pinAction === 'reconcile'
        ? await adminUsersApi.reconcile({ operationId: createdUser.operationId, pin })
        : await adminUsersApi.createUser({ nombreUsuario: values.nombreUsuario.trim(),
          apellidoUsuario: values.apellidoUsuario.trim(), correoUsuario: values.correoUsuario.trim().toLowerCase(),
          rutUsuario: values.rutUsuario.trim(), rolUsuario: values.rolUsuario, username: values.username, pin })
      const { temporaryPassword, ...result } = response
      setCreatedUser(result)
      setFieldErrors(INITIAL_ERRORS)
      setPinAction(null)
      setMessage(preparationMessage(result))
      if (result.outcome === 'user_created' && result.mustChangePassword && typeof temporaryPassword === 'string' && temporaryPassword) {
        setCredential({ username: values.username, temporaryPassword })
      } else {
        onBusyChange?.(false)
        onCreated?.(result)
      }
    } catch (error) {
      setPinError(getErrorMessage(error).text)
    } finally {
      submitting.current = false
      setIsSubmitting(false)
    }
  }
  function acceptCredential() {
    setCredential(null)
    setValues(INITIAL_VALUES)
    onBusyChange?.(false)
    onCreated?.(createdUser)
  }
  const isSessionInvalid = message?.requiresLogin === true
  const nombreUsuarioErrors = fieldErrors.nombreUsuario ?? []
  const apellidoUsuarioErrors = fieldErrors.apellidoUsuario ?? []
  const rutUsuarioErrors = fieldErrors.rutUsuario ?? []
  const correoUsuarioErrors = fieldErrors.correoUsuario ?? []
  const rolUsuarioErrors = fieldErrors.rolUsuario ?? []
  const isModalMode = mode === 'modal'
  const isBusy = isSubmitting || Boolean(pinAction) || Boolean(credential)

  return (
    <>
    <form
      className={`${styles.form} ${isModalMode ? styles.modalForm : ''}`}
      noValidate
      onSubmit={handleSubmit}
    >
      <div className={styles.formContent}>
        {message && (
          <div className={`${styles.messageBox} ${styles[`message${message.type}`]}`} role="status">
            <p>{message.text}</p>
            {isSessionInvalid && (
              <button className={styles.messageButton} onClick={() => loginWithRedirect()} type="button">
                Iniciar sesion
              </button>
            )}
          </div>
        )}
        <div className={styles.nameRow}>
          <div className={`${styles.fieldCard} ${nombreUsuarioErrors.length > 0 ? styles.fieldCardInvalid : ''}`}>
            <div className={styles.fieldContent}>
              <label htmlFor="user-first-name">Nombre <span>*</span></label>
              <input
                aria-describedby="user-first-name-errors"
                aria-invalid={nombreUsuarioErrors.length > 0}
                autoComplete="given-name"
                required
                maxLength={100}
                id="user-first-name"
                name="nombreUsuario"
                onChange={handleFieldChange}
                placeholder="Ingresa el nombre"
                type="text"
                value={values.nombreUsuario}
              />
              <FieldErrors errors={nombreUsuarioErrors} id="user-first-name-errors" />
            </div>
          </div>

          <div className={`${styles.fieldCard} ${apellidoUsuarioErrors.length > 0 ? styles.fieldCardInvalid : ''}`}>
            <div className={styles.fieldContent}>
              <label htmlFor="user-last-name">Apellido <span>*</span></label>
              <input
                aria-describedby="user-last-name-errors"
                aria-invalid={apellidoUsuarioErrors.length > 0}
                autoComplete="family-name"
                required
                maxLength={100}
                id="user-last-name"
                name="apellidoUsuario"
                onChange={handleFieldChange}
                placeholder="Ingresa el apellido"
                type="text"
                value={values.apellidoUsuario}
              />
              <FieldErrors errors={apellidoUsuarioErrors} id="user-last-name-errors" />
            </div>
          </div>

        </div>

        <div className={`${styles.fieldCard} ${styles.fieldCardWide}`}>
          <div className={styles.fieldContent}>
            <label htmlFor="user-username">Nombre de acceso <span>*</span></label>
            <input id="user-username" name="username" value={values.username} readOnly required
              autoComplete="off" maxLength={255} disabled={Boolean(createdUser)} aria-invalid={Boolean(fieldErrors.username?.length)} aria-describedby="user-username-errors" />
            <FieldErrors errors={fieldErrors.username ?? []} id="user-username-errors" />
          </div>
        </div>

        <div className={`${styles.fieldCard} ${correoUsuarioErrors.length > 0 ? styles.fieldCardInvalid : ''}`}>
          <div className={styles.fieldContent}>
            <label htmlFor="user-email">Correo electronico <span>*</span></label>
            <input
              aria-describedby="user-email-errors"
              aria-invalid={correoUsuarioErrors.length > 0}
              autoComplete="email"
              required
              maxLength={255}
              id="user-email"
              name="correoUsuario"
              onChange={handleFieldChange}
              placeholder="nombre@correo.cl"
              type="email"
              value={values.correoUsuario}
            />
            <FieldErrors errors={correoUsuarioErrors} id="user-email-errors" />
          </div>
        </div>

        <div className={`${styles.fieldCard} ${rutUsuarioErrors.length > 0 ? styles.fieldCardInvalid : ''}`}>
          <div className={styles.fieldContent}>
            <label htmlFor="user-rut">RUT <span>*</span></label>
            <input
              aria-describedby="user-rut-errors"
              aria-invalid={rutUsuarioErrors.length > 0}
              autoComplete="off"
              id="user-rut"
              name="rutUsuario"
              onChange={handleFieldChange}
              placeholder="Ej: 12.345.678-9"
              type="text"
              value={values.rutUsuario}
              required
              maxLength={12}
            />
            <FieldErrors errors={rutUsuarioErrors} id="user-rut-errors" />
          </div>
        </div>

        <div className={`${styles.fieldCard} ${styles.fieldCardWide} ${rolUsuarioErrors.length > 0 ? styles.fieldCardInvalid : ''}`}>
          <div className={styles.fieldContent}>
            <label htmlFor="user-role">Rol <span>*</span></label>
            <select
              aria-describedby="user-role-errors"
              aria-invalid={rolUsuarioErrors.length > 0}
              id="user-role"
              name="rolUsuario"
              onChange={handleFieldChange}
              value={values.rolUsuario}
            >
              <option value="">Selecciona un rol</option>
              {manageableRoles(actor?.rolUsuario).map((role) => (
                <option key={role} value={role}>
                  {getRoleLabel(role)}
                </option>
              ))}
            </select>
            <FieldErrors errors={rolUsuarioErrors} id="user-role-errors" />
          </div>
        </div>

        <div className={`${styles.fieldCard} ${styles.fieldCardWide}`}>
          <div className={styles.fieldContent}>
            <label htmlFor="user-password">Contraseña</label>
            <input
              aria-describedby="user-password-help"
              disabled
              id="user-password"
              name="password"
              placeholder="Generada automáticamente al crear el usuario"
              type="password"
            />
            <p className={styles.fieldHelp} id="user-password-help">
              Se generará una contraseña temporal. El usuario deberá cambiarla al iniciar sesión.
            </p>
          </div>
        </div>

      </div>

      <footer className={styles.actions}>
        {onCancel && (
          <button className={styles.cancelButton} disabled={isBusy} onClick={onCancel} type="button">
            Cancelar
          </button>
        )}

        {createdUser?.outcome === 'needs_reconciliation' && <button className={styles.secondaryButton}
          type="button" disabled={isBusy} onClick={() => openPin('reconcile')}>Conciliar preparacion</button>}

        <button
          className={styles.submitButton}
          disabled={isBusy || Boolean(createdUser)}
          type="submit"
         aria-busy={isSubmitting}>
          <i className="bi bi-plus-circle" aria-hidden="true" />
          <LoadingAction busy={isSubmitting} context="Crear usuario">Crear usuario</LoadingAction>
        </button>
      </footer>
    </form>
    {pinAction && createPortal(<PaymentCredentialsModal
      description="Ingrese su PIN personal para autorizar la creación del usuario."
      kicker="Creación de usuario" manageFocus layerClassName={styles.credentialLayer}
      isSubmitting={isSubmitting} onCancel={cancelPin} onConfirm={confirmPin} errorMessage={pinError}
    />, document.body)}
    {credential && createPortal(<TemporaryPasswordModal initialCredential={credential} onClose={acceptCredential} />, document.body)}
    </>
  )
}

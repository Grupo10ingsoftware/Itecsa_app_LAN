import { useState } from 'react'
import { getRoleLabel, manageableRoles } from '../../../config/roles'
import { API_ERROR_CODES } from '../../../services/api/apiClient'
import { useAuth } from '../../../hooks/useAuth'
import { useAdminUsersApi } from '../hooks/useAdminUsersApi'
import { hasValidationErrors, validateUserCreateForm } from '../utils/userValidation'
import styles from './UserCreateForm.module.css'

const INITIAL_VALUES = Object.freeze({ nombreUsuario: '', apellidoUsuario: '', rutUsuario: '', correoUsuario: '', rolUsuario: '', username: '', pin: '' })
const INITIAL_ERRORS = Object.freeze({ nombreUsuario: [], apellidoUsuario: [], rutUsuario: [], correoUsuario: [], rolUsuario: [], username: [], pin: [] })
const MESSAGE_TYPES = Object.freeze({ WARNING: 'warning', DANGER: 'danger', INFO: 'info' })

function FieldErrors({ errors, id }) {
  return errors.length ? <div className={styles.fieldErrors} id={id}>{errors.map(error => <p key={error}>{error}</p>)}</div> : null
}
function getErrorMessage(error) {
  if (error?.code === API_ERROR_CODES.SESSION_INVALID || error?.status === 401) {
    return { type: MESSAGE_TYPES.WARNING, text: 'La sesion no es valida o expiro. Vuelve a iniciar sesion.', requiresLogin: true }
  }
  if (error?.status === 403) return { type: MESSAGE_TYPES.DANGER, text: 'Acceso denegado. No tienes permisos para preparar esta cuenta.' }
  if (error?.status === 409) return { type: MESSAGE_TYPES.WARNING, text: 'La cuenta o la operacion tiene un conflicto. Revisa su estado antes de repetir el alta.' }
  return { type: MESSAGE_TYPES.DANGER, text: error?.payload?.message || 'No se pudo confirmar la preparacion. Revisa el estado antes de repetirla.' }
}
function preparationMessage(result) {
  return { type: result.outcome === 'identity_prepared' ? MESSAGE_TYPES.INFO : MESSAGE_TYPES.WARNING,
    text: result.outcome === 'identity_prepared'
      ? 'Cuenta preparada, pendiente y deshabilitada. La entrega de credenciales aun no esta habilitada.'
      : 'Preparacion incompleta. No repitas el alta. Referencia: ' + result.operationId + '.' }
}
export default function UserCreateForm({ mode = 'page', onBusyChange, onCancel, onCreated } = {}) {
  const { loginWithRedirect, user: actor } = useAuth()
  const adminUsersApi = useAdminUsersApi()
  const [values, setValues] = useState(INITIAL_VALUES)
  const [fieldErrors, setFieldErrors] = useState(INITIAL_ERRORS)
  const [message, setMessage] = useState(null)
  const [createdUser, setCreatedUser] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  function handleFieldChange({ target: { name, value } }) {
    if (createdUser && name !== 'pin') return
    setValues(current => ({ ...current, [name]: value }))
    if (!createdUser) setMessage(null)
  }
  async function handleSubmit(event) {
    event.preventDefault()
    if (isSubmitting || createdUser) return
    const nextErrors = validateUserCreateForm(values, { optionalEmail: true, requireRut: false })
    nextErrors.username = values.username && values.username === values.username.trim().toLowerCase()
      && values.username.length <= 255 && !/\s/u.test(values.username)
      && [...values.username].every(char => char.codePointAt(0) > 32) ? [] : ['Ingresa un nombre de acceso en minusculas, sin espacios.']
    nextErrors.pin = /^\d{6}$/.test(values.pin) ? [] : ['Ingresa tu PIN de 6 digitos.']
    if (!manageableRoles(actor?.rolUsuario).includes(values.rolUsuario)) nextErrors.rolUsuario = ['No puedes asignar ese rol.']
    setFieldErrors(nextErrors)
    setMessage(null)
    if (hasValidationErrors(nextErrors)) return
    setIsSubmitting(true)
    onBusyChange?.(true)
    try {
      const result = await adminUsersApi.createUser({ nombreUsuario: values.nombreUsuario.trim(),
        apellidoUsuario: values.apellidoUsuario.trim(), correoUsuario: values.correoUsuario.trim().toLowerCase() || null,
        rolUsuario: values.rolUsuario, username: values.username, pin: values.pin })
      setCreatedUser(result)
      setMessage(preparationMessage(result))
      if (result.outcome === 'identity_prepared') setValues(INITIAL_VALUES)
      setFieldErrors(INITIAL_ERRORS)
      onCreated?.(result)
    } catch (error) { setMessage(getErrorMessage(error)) }
    finally { setValues(current => ({ ...current, pin: '' })); setIsSubmitting(false); onBusyChange?.(false) }
  }
  async function handleReconcile() {
    if (!/^\d{6}$/.test(values.pin)) {
      setFieldErrors(current => ({ ...current, pin: ['Ingresa tu PIN de 6 digitos.'] }))
      return
    }
    setIsSubmitting(true)
    onBusyChange?.(true)
    try {
      const result = await adminUsersApi.reconcile({ operationId: createdUser.operationId, pin: values.pin })
      setCreatedUser(result)
      setMessage(preparationMessage(result))
      onCreated?.(result)
    } catch (error) { setMessage(getErrorMessage(error)) }
    finally { setValues(current => ({ ...current, pin: '' })); setIsSubmitting(false); onBusyChange?.(false) }
  }
  const isSessionInvalid = message?.requiresLogin === true
  const nombreUsuarioErrors = fieldErrors.nombreUsuario ?? []
  const apellidoUsuarioErrors = fieldErrors.apellidoUsuario ?? []
  const rutUsuarioErrors = fieldErrors.rutUsuario ?? []
  const correoUsuarioErrors = fieldErrors.correoUsuario ?? []
  const rolUsuarioErrors = fieldErrors.rolUsuario ?? []
  const isModalMode = mode === 'modal'
  const isBusy = isSubmitting

  return (
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
        <div className={styles.fieldCard}>
          <div className={styles.fieldContent}>
            <label htmlFor="user-username">Nombre de acceso <span>*</span></label>
            <input id="user-username" name="username" value={values.username} onChange={handleFieldChange}
              autoComplete="off" maxLength={255} disabled={Boolean(createdUser)} aria-invalid={Boolean(fieldErrors.username?.length)} aria-describedby="user-username-errors" />
            <FieldErrors errors={fieldErrors.username ?? []} id="user-username-errors" />
          </div>
        </div>

        <div className={`${styles.fieldCard} ${nombreUsuarioErrors.length > 0 ? styles.fieldCardInvalid : ''}`}>
          <div className={styles.fieldContent}>
            <label htmlFor="user-first-name">Nombres <span>*</span></label>
            <input
              aria-describedby="user-first-name-errors"
              aria-invalid={nombreUsuarioErrors.length > 0}
              autoComplete="given-name"
              id="user-first-name"
              name="nombreUsuario"
              onChange={handleFieldChange}
              placeholder="Ingresa los nombres"
              type="text"
              value={values.nombreUsuario}
            />
            <FieldErrors errors={nombreUsuarioErrors} id="user-first-name-errors" />
          </div>
        </div>

        <div className={`${styles.fieldCard} ${apellidoUsuarioErrors.length > 0 ? styles.fieldCardInvalid : ''}`}>
          <div className={styles.fieldContent}>
            <label htmlFor="user-last-name">Apellidos <span>*</span></label>
            <input
              aria-describedby="user-last-name-errors"
              aria-invalid={apellidoUsuarioErrors.length > 0}
              autoComplete="family-name"
              id="user-last-name"
              name="apellidoUsuario"
              onChange={handleFieldChange}
              placeholder="Ingresa los apellidos"
              type="text"
              value={values.apellidoUsuario}
            />
            <FieldErrors errors={apellidoUsuarioErrors} id="user-last-name-errors" />
          </div>
        </div>

        <div className={`${styles.fieldCard} ${correoUsuarioErrors.length > 0 ? styles.fieldCardInvalid : ''}`}>
          <div className={styles.fieldContent}>
            <label htmlFor="user-email">Correo electronico </label>
            <input
              aria-describedby="user-email-errors"
              aria-invalid={correoUsuarioErrors.length > 0}
              autoComplete="email"
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
            <label htmlFor="user-rut">RUT </label>
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
              disabled
            />
            <p className={styles.fieldHelp}>La preparacion actual no registra RUT.</p>
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
              placeholder="Gestionada por el proveedor de identidad"
              type="password"
            />
            <p className={styles.fieldHelp} id="user-password-help">
              La cuenta quedara deshabilitada y pendiente. La activacion y entrega de credenciales aun no estan habilitadas.
            </p>
          </div>
        </div>
        <div className={styles.fieldCard}>
          <div className={styles.fieldContent}>
            <label htmlFor="user-prepare-pin">Tu PIN de autorizacion <span>*</span></label>
            <input id="user-prepare-pin" name="pin" type="password" inputMode="numeric" maxLength={6} autoComplete="off"
              value={values.pin} onChange={handleFieldChange} aria-invalid={Boolean(fieldErrors.pin?.length)} aria-describedby="user-prepare-pin-errors" />
            <FieldErrors errors={fieldErrors.pin ?? []} id="user-prepare-pin-errors" />
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
          type="button" disabled={isBusy} onClick={handleReconcile}>Conciliar preparacion</button>}

        <button
          className={styles.submitButton}
          disabled={isSubmitting || Boolean(createdUser)}
          type="submit"
        >
          <i className="bi bi-plus-circle" aria-hidden="true" />
          {isSubmitting ? 'Preparando cuenta...' : 'Preparar cuenta pendiente'}
        </button>
      </footer>
    </form>
  )
}

import { LoadingAction } from '../../../shared/components/loading/LoadingIndicator'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import PinAuthorizationModal from '../../../shared/components/pin/PinAuthorizationModal'
import TemporaryPasswordModal from './TemporaryPasswordModal.jsx'
import { getRoleLabel, manageableRoles } from '../../../config/roles'
import { API_ERROR_CODES } from '../../../services/api/apiClient'
import { useAuth } from '../../../hooks/useAuth'
import { useAdminUsersApi } from '../hooks/useAdminUsersApi'
import { hasValidationErrors, validateUserCreateForm } from '../utils/userValidation'
import styles from './UserCreateForm.module.css'
import { useToast } from '../../../shared/notifications/useToast'
import { publicOperationMessage, uncertainOperation } from '../../../shared/notifications/operationFeedback'
import { userCreationFeedback } from '../utils/userCreationFeedback.js'
import { generateUsername } from '../utils/generateUsername.js'

const INITIAL_VALUES = Object.freeze({ nombreUsuario: '', apellidoUsuario: '', rutUsuario: '', correoUsuario: '', rolUsuario: '', username: '' })
const INITIAL_ERRORS = Object.freeze({ nombreUsuario: [], apellidoUsuario: [], rutUsuario: [], correoUsuario: [], rolUsuario: [], username: [] })
const MESSAGE_TYPES = Object.freeze({ WARNING: 'warning', DANGER: 'danger' })

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
  return { type: MESSAGE_TYPES.DANGER, text: publicOperationMessage(error, 'No se pudo confirmar la preparación. Revisa el estado antes de repetirla.') }
}

export default function UserCreateForm(props) {
  const { user } = useAuth()
  return <UserCreateFormContent key={user?.sub ?? ''} {...props}
    recovery={props.recovery?.actor === user?.sub ? props.recovery : null} />
}

function UserCreateFormContent({ mode = 'page', onBusyChange, onCancel, onCreated, recovery, onRecoveryChange } = {}) {
  const notify = useToast()
  const { loginWithRedirect, user: actor } = useAuth()
  const adminUsersApi = useAdminUsersApi()
  const [values, setValues] = useState(recovery?.values ?? INITIAL_VALUES)
  const [fieldErrors, setFieldErrors] = useState(INITIAL_ERRORS)
  const [requiresLogin, setRequiresLogin] = useState(false)
  const [createdUser, setCreatedUser] = useState(recovery?.result ?? null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [pinAction, setPinAction] = useState(null)
  const [pinError, setPinError] = useState('')
  const [credential, setCredential] = useState(null)
  const submitting = useRef(false)
  const active = useRef(false)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  function handleFieldChange({ target: { name, value } }) {
    if (createdUser || pinAction || isSubmitting) return
    setValues(current => {
      const next = { ...current, [name]: value }
      if (name === 'nombreUsuario' || name === 'apellidoUsuario') {
        next.username = generateUsername(next.nombreUsuario, next.apellidoUsuario)
      }
      return next
    })
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
    setRequiresLogin(false)
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
      if (!active.current) return
      const { temporaryPassword, ...result } = response
      setFieldErrors(INITIAL_ERRORS)
      setPinAction(null)
      applyResult(result)
      if (result.outcome === 'user_created' && result.mustChangePassword && typeof temporaryPassword === 'string' && temporaryPassword) {
        setCredential({ username: values.username, temporaryPassword })
      } else {
        onBusyChange?.(false)
        if (result.outcome === 'user_created') onCreated?.(result)
      }
    } catch (error) {
      if (active.current) {
        if (error?.payload?.code?.startsWith('PIN_')) {
          setPinError(getErrorMessage(error).text)
        } else {
          setPinAction(null)
          onBusyChange?.(false)
          if (error?.payload?.outcome) applyResult(error.payload)
          else if (error?.payload?.operation) applyResult({ ...error.payload.operation,
            ...(error.payload.code === 'IDENTITY_OPERATION_PAYLOAD_CONFLICT' ? { outcome: 'identity_conflict' } : {}), code: error.payload.code })
          else if (uncertainOperation(error) || error?.status === 409 || pinAction === 'reconcile') {
            applyResult({ ...createdUser, outcome: createdUser?.outcome ?? 'unknown',
              operationId: createdUser?.operationId ?? error?.payload?.operationId, code: error?.payload?.code })
          } else {
            const feedback = getErrorMessage(error)
            setRequiresLogin(feedback.requiresLogin === true)
            notify.error(feedback.text)
          }
        }
      }
    } finally {
      submitting.current = false
      if (active.current) setIsSubmitting(false)
    }
  }
  function applyResult(result) {
    const feedback = userCreationFeedback(result)
    const pending = feedback.blocked ? result : null
    setCreatedUser(pending)
    onRecoveryChange?.(pending && result.outcome !== 'user_created' ? { actor: actor?.sub, values, result: pending } : null)
    notify[feedback.type](feedback.text)
  }
  async function checkStatus() {
    if (submitting.current) return
    submitting.current = true
    setIsSubmitting(true)
    onBusyChange?.(true)
    try {
      const result = await adminUsersApi.creationStatus(values)
      if (!active.current) return
      applyResult(result ?? { ...createdUser, outcome: 'unknown' })
      if (result?.outcome === 'user_created') onCreated?.(result)
    } catch {
      if (active.current) notify.warning('No fue posible consultar el estado. No repitas el alta hasta verificar la operación.' +
        (createdUser?.operationId ? ' Referencia: ' + createdUser.operationId + '.' : ''))
    } finally {
      submitting.current = false
      if (active.current) { setIsSubmitting(false); onBusyChange?.(false) }
    }
  }
  function acceptCredential() {
    setCredential(null)
    setValues(INITIAL_VALUES)
    onBusyChange?.(false)
    onCreated?.(createdUser)
  }
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
        {requiresLogin && <button className={styles.messageButton} onClick={() => loginWithRedirect()} type="button">Iniciar sesion</button>}
        {createdUser && createdUser.outcome !== 'user_created' && <p className={styles.fieldHelp}>
          {createdUser.operationId ? 'Referencia de operación: ' + createdUser.operationId : 'Consulta pendiente para: ' + values.username}
        </p>}
        <div className={styles.nameRow}>
          <div className={`${styles.fieldCard} ${nombreUsuarioErrors.length > 0 ? styles.fieldCardInvalid : ''}`}>
            <div className={styles.fieldContent}>
              <label htmlFor="user-first-name">Nombre <span>*</span></label>
              <input
                aria-describedby="user-first-name-errors"
                disabled={Boolean(createdUser)}
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
                disabled={Boolean(createdUser)}
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
            <input id="user-username" name="username" value={values.username} onChange={handleFieldChange} required
              autoComplete="off" maxLength={255} disabled={Boolean(createdUser)} aria-invalid={Boolean(fieldErrors.username?.length)} aria-describedby="user-username-errors" />
            <FieldErrors errors={fieldErrors.username ?? []} id="user-username-errors" />
          </div>
        </div>

        <div className={`${styles.fieldCard} ${correoUsuarioErrors.length > 0 ? styles.fieldCardInvalid : ''}`}>
          <div className={styles.fieldContent}>
            <label htmlFor="user-email">Correo electronico <span>*</span></label>
            <input
              aria-describedby="user-email-errors"
              disabled={Boolean(createdUser)}
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
              disabled={Boolean(createdUser)}
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
              disabled={Boolean(createdUser)}
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

        {createdUser && createdUser.outcome !== 'user_created' && <button className={styles.secondaryButton}
          type="button" disabled={isBusy} onClick={checkStatus}>Verificar estado</button>}

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
    {pinAction && <PinAuthorizationModal contextKey={pinAction} disableUntilValid
      description="Ingrese su PIN personal para autorizar la creación del usuario."
      isSubmitting={isSubmitting} onCancel={cancelPin} onConfirm={confirmPin} errorMessage={pinError}
    />}
    {credential && createPortal(<TemporaryPasswordModal initialCredential={credential} onClose={acceptCredential} />, document.body)}
    </>
  )
}

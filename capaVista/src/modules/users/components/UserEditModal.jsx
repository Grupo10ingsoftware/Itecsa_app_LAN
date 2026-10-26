import { useAuth } from "../../../hooks/useAuth";
import { useEffect, useMemo, useRef, useState } from 'react'
import { getRoleLabel, manageableRoles } from '../../../config/roles'
import UserButton from './UserButton'
import { useModalDialog } from '../hooks/useModalDialog'
import styles from '../pages/UserManagementPage.module.css'
import editStyles from './UserEditModal.module.css'
import { validatePersonName, validateEmail } from '../utils/userValidation.js'

const SELF_ROLE_EDIT_MESSAGE = 'No puedes cambiar tu propio rol.'

function createFormState(user) {
  return {
    nombreUsuario: user.nombreUsuario ?? '',
    apellidoUsuario: user.apellidoUsuario ?? '',
    correoUsuario: user.correoUsuario ?? '',
    rolUsuario: user.rolUsuario ?? '',
    estadoUsuario: user.estadoUsuario === 'Vinculado' ? 'Activo' : user.estadoUsuario ?? '',
  }
}

export default function UserEditModal({ isCurrentUser = false, isOpen, onClose, onSave, onUnlink, onCredentials, user, readOnly = false }) {
  const [values, setValues] = useState(() => (user ? createFormState(user) : null))
  const { user: actor, provider } = useAuth()
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const firstInputRef = useRef(null)
  const modalRef = useRef(null)

  useModalDialog({
    canClose: !isSubmitting,
    containerRef: modalRef,
    initialFocusRef: firstInputRef,
    isOpen: Boolean(isOpen && user),
    onClose,
  })

  useEffect(() => {
    if (!isOpen || !user) {
      return undefined
    }

    const resetTimer = window.setTimeout(() => { setPin(''); setPinError('') }, 0)
    return () => {
      window.clearTimeout(resetTimer)
    }
  }, [isOpen, user])

  const canSubmit = useMemo(() => {
    if (!values) {
      return false
    }

    const currentRole = user?.rolUsuario ?? ''

    return (
      Object.values(values).every(value => String(value).trim().length > 0) &&
      /^\d{6}$/.test(pin.trim()) &&
      !(isCurrentUser && values.rolUsuario !== currentRole)
    )
  }, [isCurrentUser, pin, user?.rolUsuario, values])

  if (!isOpen || !user || !values) {
    return null
  }

  function handleChange(event) {
    const { name, value } = event.target
    setValues((currentValues) => ({
      ...currentValues,
      [name]: value,
    }))
  }

  function handleBackdropMouseDown(event) {
    if (event.target === event.currentTarget && !isSubmitting) {
      onClose()
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (readOnly || isSubmitting) return

    const errors = [...validatePersonName(values.nombreUsuario, 'El nombre'),
      ...validatePersonName(values.apellidoUsuario, 'El apellido'), ...validateEmail(values.correoUsuario)]
    if (!manageableRoles(actor?.rolUsuario).includes(values.rolUsuario)) errors.push('No puedes asignar ese rol.')
    if (errors.length) { setSaveError(errors[0]); return }

    const trimmedPin = pin.trim()

    if (!/^\d{6}$/.test(trimmedPin)) {
      setPinError('Ingrese un PIN valido de 6 digitos.')
      return
    }

    if (isCurrentUser && values.rolUsuario !== (user.rolUsuario ?? '')) {
      return
    }

    setIsSubmitting(true)
    setSaveError('')

    try {
      await onSave({
        ...user,
        nombreUsuario: values.nombreUsuario.trim(),
        apellidoUsuario: values.apellidoUsuario.trim(),
        correoUsuario: values.correoUsuario.trim().toLowerCase(),
        rolUsuario: values.rolUsuario,
        estadoUsuario: values.estadoUsuario,
        pin: trimmedPin,
      })
    } catch (error) {
      setSaveError(error?.message || 'No fue posible guardar los cambios. Intenta nuevamente.')
    } finally {
      setPin('')
      setIsSubmitting(false)
    }
  }

  return (
    <div className={styles.modalLayer} data-modal-layer="true" onMouseDown={handleBackdropMouseDown} role="presentation">
      <form
        aria-describedby="user-edit-modal-description"
        aria-labelledby="user-edit-modal-title"
        aria-modal="true"
        className={editStyles.modal}
        noValidate
        onSubmit={handleSubmit}
        ref={modalRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={editStyles.header}>
          <div>
            <span className={editStyles.kicker}>Usuario</span>
            <h2 id="user-edit-modal-title">{readOnly ? 'Consultar usuario' : 'Editar usuario'}</h2>
            <p id="user-edit-modal-description">{readOnly ? 'Consulta la identidad. La edicion y las acciones de cuenta aun no estan habilitadas.' : 'Modifica la informacion del usuario en el sistema.'}</p>
          </div>
          <button
            aria-label="Cerrar modal de edicion"
            className={editStyles.closeButton}
            disabled={isSubmitting}
            onClick={onClose}
            type="button"
          >
            <i className="bi bi-x-lg" aria-hidden="true" />
          </button>
        </header>

        <div className={editStyles.body}>
          <div className={editStyles.identityCard}>
            <span className={editStyles.identityAvatar} aria-hidden="true">
              <i className="bi bi-person-fill" />
            </span>
            <div>
              <h3>{user.nombreCompleto}</h3>
              <p>{user.rutUsuario}</p>
              {readOnly && <p>{user.username} · Keycloak: {user.enabled ? 'Habilitado' : 'Deshabilitado'} · {user.estadoUsuario}</p>}
            </div>
          </div>

          <div className={editStyles.fieldsGrid}>
            <label className={editStyles.field} htmlFor="edit-user-first-name">
              <span className={editStyles.fieldLabel}>Nombre</span>
              <span className={editStyles.controlWrap}>
                <i className="bi bi-person" aria-hidden="true" />
                <input
                  autoComplete="given-name"
                  id="edit-user-first-name"
                  name="nombreUsuario"
                  onChange={handleChange}
                  ref={firstInputRef}
                  required
                  type="text"
                  value={values.nombreUsuario}
                  disabled={readOnly || isSubmitting}
                  maxLength={100}
                />
              </span>
            </label>

            <label className={editStyles.field} htmlFor="edit-user-last-name">
              <span className={editStyles.fieldLabel}>Apellido</span>
              <span className={editStyles.controlWrap}>
                <i className="bi bi-person" aria-hidden="true" />
                <input
                  autoComplete="family-name"
                  id="edit-user-last-name"
                  name="apellidoUsuario"
                  onChange={handleChange}
                  required
                  type="text"
                  value={values.apellidoUsuario}
                  disabled={readOnly || isSubmitting}
                  maxLength={100}
                />
              </span>
            </label>

            <label className={editStyles.field} htmlFor="edit-user-email">
              <span className={editStyles.fieldLabel}>Correo electronico</span>
              <span className={editStyles.controlWrap}>
                <i className="bi bi-envelope" aria-hidden="true" />
                <input
                  autoComplete="email"
                  id="edit-user-email"
                  name="correoUsuario"
                  onChange={handleChange}
                  required
                  maxLength={255}
                  type="email"
                  value={values.correoUsuario}
                  disabled={readOnly || isSubmitting}
                />
              </span>
            </label>

            <label className={editStyles.field} htmlFor="edit-user-role">
              <span className={editStyles.fieldLabel}>Rol</span>
              <span className={editStyles.controlWrap}>
                <i className="bi bi-people" aria-hidden="true" />
                <select
                  aria-describedby={isCurrentUser ? 'edit-user-role-help' : undefined}
                  disabled={isCurrentUser || readOnly || isSubmitting}
                  id="edit-user-role"
                  name="rolUsuario"
                  onChange={handleChange}
                  value={values.rolUsuario}
                >
                  <option value="">Selecciona un rol</option>
                  {manageableRoles(actor?.rolUsuario).map((role) => (
                    <option key={role} value={role}>
                      {getRoleLabel(role)}
                    </option>
                  ))}
                </select>
              </span>
              {isCurrentUser && <small className={editStyles.fieldHelp} id="edit-user-role-help">{SELF_ROLE_EDIT_MESSAGE}</small>}
            </label>

            <label className={editStyles.field} htmlFor="edit-user-state">
              <span className={editStyles.fieldLabel}>Estado</span>
              <span className={editStyles.controlWrap}>
                <i className="bi bi-person-check" aria-hidden="true" />
                <select id="edit-user-state" name="estadoUsuario" value={values.estadoUsuario} onChange={handleChange}
                  disabled={isCurrentUser || readOnly || isSubmitting}>
                  <option value="Activo">Activo</option>
                  <option value="Desvinculado">Desvinculado</option>
                  {['Pendiente', 'Pendiente rol'].includes(user.estadoUsuario) &&
                    <option value={user.estadoUsuario}>{user.estadoUsuario}</option>}
                </select>
              </span>
            </label>

            {!readOnly && <label className={`${editStyles.field} ${editStyles.fieldWide}`} htmlFor="edit-user-pin">
              <span className={editStyles.fieldLabel}>PIN de autorizacion</span>
              <span className={`${editStyles.controlWrap} ${pinError ? editStyles.controlInvalid : ''}`}>
                <i className="bi bi-lock" aria-hidden="true" />
                <input
                  aria-describedby={pinError ? 'edit-user-pin-error' : undefined}
                  aria-invalid={Boolean(pinError)}
                  autoComplete="off"
                  disabled={isSubmitting}
                  id="edit-user-pin"
                  inputMode="numeric"
                  maxLength={6}
                  onChange={(event) => {
                    setPin(event.target.value.replace(/\D/g, '').slice(0, 6))
                    setPinError('')
                  }}
                  placeholder="000000"
                  required
                  type="password"
                  value={pin}
                />
              </span>
              {pinError && <small className={editStyles.fieldError} id="edit-user-pin-error">{pinError}</small>}
            </label>}
          </div>
        </div>

        {saveError && (
          <div className={`${styles.feedbackMessage} ${styles.feedbackdanger} ${editStyles.saveError}`} role="alert">
            {saveError}
          </div>
        )}
        <footer className={editStyles.actions}>
          {!readOnly && provider === 'keycloak' && onCredentials && <UserButton disabled={isSubmitting || isCurrentUser || !['Activo', 'Vinculado', 'Pendiente'].includes(user.estadoUsuario)}
            onClick={() => onCredentials(user)} variant="secondary">Establecer credenciales</UserButton>}
          {!readOnly && onUnlink && <UserButton
            className={`${editStyles.actionButton} ${editStyles.unlinkButton}`}
            disabled={isSubmitting || isCurrentUser || user.estadoUsuario === 'Desvinculado'}
            onClick={() => onUnlink(user)}
            title={isCurrentUser ? 'No puedes desvincular tu propia cuenta.' : undefined}
            variant="danger"
          >
            Desvincular
          </UserButton>}
          <div className={editStyles.primaryActions}>
            <UserButton className={editStyles.actionButton} disabled={isSubmitting} onClick={onClose} variant="secondary">
              {readOnly ? 'Cerrar' : 'Cancelar'}
            </UserButton>
            {!readOnly && <UserButton
              busy={isSubmitting}
              className={`${editStyles.actionButton} ${editStyles.saveButton}`}
              disabled={isSubmitting || !canSubmit}
              type="submit"
              variant="primary"
            >
              Guardar cambios
            </UserButton>}
          </div>
        </footer>
      </form>
    </div>
  )
}

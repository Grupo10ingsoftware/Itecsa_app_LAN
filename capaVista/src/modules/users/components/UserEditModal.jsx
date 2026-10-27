import { useAuth } from "../../../hooks/useAuth";
import { useEffect, useRef, useState } from 'react'
import { getRoleLabel, manageableRoles } from '../../../config/roles'
import PinModal, { PinField, PinError } from '../../../shared/components/pin/PinModal'
import pinStyles from '../../../shared/components/pin/PinModal.module.css'
import { LoadingAction } from '../../../shared/components/loading/LoadingIndicator'
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

export default function UserEditModal(props) {
  const { user: actor } = useAuth()
  if (!props.isOpen || !props.user) return null
  return <UserEditForm key={`${actor?.sub}:${props.user.idUsuarioAutenticacionExterna ?? props.user.id}`} {...props} />
}

function UserEditForm({ isCurrentUser = false, onClose, onSave, onUnlink, onCredentials, user, readOnly = false }) {
  const [values, setValues] = useState(() => (user ? createFormState(user) : null))
  const { user: actor, provider } = useAuth()
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const firstInputRef = useRef(null)
  const pending = useRef(false)
  const active = useRef(false)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])

  function close() {
    if (pending.current) return
    setPin('')
    onClose()
  }

  const canSubmit = Object.values(values).every(value => String(value).trim().length > 0)
    && /^\d{6}$/.test(pin) && !(isCurrentUser && values.rolUsuario !== user.rolUsuario)

  function handleChange({ target: { name, value } }) {
    setValues(current => ({ ...current, [name]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (readOnly || pending.current) return
    const trimmedPin = pin.trim()
    setPin('')
    const errors = [...validatePersonName(values.nombreUsuario, 'El nombre'),
      ...validatePersonName(values.apellidoUsuario, 'El apellido'), ...validateEmail(values.correoUsuario)]
    if (!manageableRoles(actor?.rolUsuario).includes(values.rolUsuario)) errors.push('No puedes asignar ese rol.')
    if (errors.length) { setSaveError(errors[0]); return }
    if (!/^\d{6}$/.test(trimmedPin)) { setPinError('Ingrese un PIN valido de 6 digitos.'); return }
    if (isCurrentUser && values.rolUsuario !== (user.rolUsuario ?? '')) return
    pending.current = true
    setIsSubmitting(true)
    setSaveError('')
    try {
      await onSave({ ...user, nombreUsuario: values.nombreUsuario.trim(), apellidoUsuario: values.apellidoUsuario.trim(),
        correoUsuario: values.correoUsuario.trim().toLowerCase(), rolUsuario: values.rolUsuario,
        estadoUsuario: values.estadoUsuario, pin: trimmedPin })
    } catch (error) {
      if (active.current) setSaveError(error?.message || 'No fue posible guardar los cambios. Intenta nuevamente.')
    } finally {
      pending.current = false
      if (active.current) setIsSubmitting(false)
    }
  }

  return <PinModal title={readOnly ? 'Consultar usuario' : 'Editar usuario'}
    description={readOnly ? 'Consulta la identidad. La edicion y las acciones de cuenta aun no estan habilitadas.' : 'Modifica la informacion del usuario en el sistema.'}
    busy={isSubmitting} onClose={close} onSubmit={handleSubmit} initialFocusRef={readOnly ? undefined : firstInputRef}
    actions={<>
      {!readOnly && provider === 'keycloak' && onCredentials && <button type="button" className={pinStyles.secondary}
        disabled={isSubmitting || isCurrentUser || !['Activo', 'Vinculado', 'Pendiente'].includes(user.estadoUsuario)}
        onClick={() => { setPin(''); onCredentials(user) }}>Establecer credenciales</button>}
      {!readOnly && onUnlink && <button type="button" className={pinStyles.secondary}
        disabled={isSubmitting || isCurrentUser || user.estadoUsuario === 'Desvinculado'}
        onClick={() => { setPin(''); onUnlink(user) }}>Desvincular</button>}
      <button type="button" className={pinStyles.secondary} disabled={isSubmitting} onClick={close}>{readOnly ? 'Cerrar' : 'Cancelar'}</button>
      {!readOnly && <button className={pinStyles.primary} disabled={isSubmitting || !canSubmit} type="submit" aria-busy={isSubmitting}>
        <LoadingAction busy={isSubmitting} surface="light" context="Guardar cambios">Guardar cambios</LoadingAction>
      </button>}
    </>}>
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

          </div>
          {!readOnly && <PinField label="PIN de autorizacion" value={pin} disabled={isSubmitting} error={pinError}
            onChange={value => { setPin(value); setPinError('') }} />}
          <PinError>{saveError}</PinError>
    </PinModal>
}

import LoadingIndicator, { LoadingAction } from '../../../shared/components/loading/LoadingIndicator'
import { useEffect, useMemo, useRef, useState } from 'react'
import { beginPinRecovery, getPinRecoveryOutcome, clearPinRecoveryOutcome } from '../../auth/pinRecoveryBrowser'
import { useAuth } from '../../../hooks/useAuth'
import { useAuthApi } from '../../auth/hooks/useAuthApi'
import RoleBadge from '../../../shared/components/data/RoleBadge'
import styles from './ProfilePage.module.css'
import PageShell from '../../../shared/components/layout/PageShell'
import PageHeader from '../../../shared/components/layout/PageHeader'
import { formatProfileDate } from '../utils/profileFormatters'
import { displayUserStatus, isActiveUserStatus } from '../../../config/userLifecycle'
import UserMovementsModal from '../../users/components/UserMovementsModal'
import UserMovementsTable from '../../users/components/UserMovementsTable'
import confirmationStyles from '../../../shared/styles/ConfirmationModal.module.css'
import PinModal, { PinError } from '../../../shared/components/pin/PinModal'
import pinStyles from '../../../shared/components/pin/PinModal.module.css'

function getDisplayValue(value, fallback = 'No informado') {
  return String(value ?? '').trim() || fallback
}

export default function ProfilePage() {
  const { user } = useAuth()
  return <ProfileContent key={user?.sub ?? ''} />
}

function ProfileContent() {
  const { identityUser, pinStatus, refreshSession, user, provider } = useAuth()
  const authApi = useAuthApi()
  const recoveryTask = useRef(null)
  const acknowledgementPending = useRef(false)
  const acknowledged = useRef(false)
  const active = useRef(false)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const [recoveryVerified, setRecoveryVerified] = useState(() => getPinRecoveryOutcome(user?.sub)?.recovered ?? false)
  const [pinSuccess, setPinSuccess] = useState('')
  useEffect(() => () => { recoveryTask.current?.cancel(); recoveryTask.current = null }, [user?.sub])
  const [historyOpen, setHistoryOpen] = useState(false)
  const historyApi = useMemo(() => ({ getMovements: (_subject, query) => authApi.getProfileMovements(query) }), [authApi])
  const historyUser = { idUsuarioAutenticacionExterna: user?.sub }
  const [profileData, setProfileData] = useState(null)
  const [profileAttempt, setProfileAttempt] = useState(0)
  useEffect(() => {
    let current = true
    authApi.getProfile().then((data) => {
      if (current) setProfileData({ subject: user?.sub, api: authApi, attempt: profileAttempt, data })
    }).catch((error) => {
      if (current) setProfileData({ subject: user?.sub, api: authApi, attempt: profileAttempt,
        error: error?.payload?.message ?? 'No fue posible cargar tu perfil.' })
    })
    return () => { current = false }
  }, [authApi, user?.sub, profileAttempt])
  const profileCurrent = profileData?.subject === user?.sub && profileData?.api === authApi && profileData?.attempt === profileAttempt
  const loadedProfile = profileCurrent ? profileData?.data : null
  const profileError = profileCurrent ? profileData?.error : ''
  const [visiblePin, setVisiblePin] = useState('')
  const [pinError, setPinError] = useState(() => getPinRecoveryOutcome(user?.sub)?.message ?? '')
  const [isPinBusy, setIsPinBusy] = useState(false)
  const [recoveryOpen, setRecoveryOpen] = useState(false)
  const profile = useMemo(() => {
    const firstName = loadedProfile?.primerNombre ?? user?.primerNombre
    const lastName = loadedProfile?.apellidoPaterno ?? user?.apellidoPaterno
    const email = loadedProfile ? loadedProfile.email : user?.email
    const role = loadedProfile?.rolUsuario ?? user?.rolUsuario
    const status = loadedProfile?.estadoUsuario ?? user?.estadoUsuario

    return {
      firstName,
      lastName,
      email,
      role,
      status,
      rut: loadedProfile?.rutUsuario ?? user?.rutUsuario,
      picture: identityUser?.picture,
    }
  }, [identityUser, user, loadedProfile])

  useEffect(() => {
    if (pinStatus !== 'pending_acknowledgement' || visiblePin || acknowledged.current) return

    let current = true
    authApi.revealPin()
      .then(({ pin }) => {
        if (current) { setPinError(''); setVisiblePin(pin) }
      })
      .catch((error) => {
        if (current) setPinError(error?.payload?.message ?? 'No fue posible mostrar el PIN.')
      })

    return () => {
      current = false
    }
  }, [authApi, pinStatus, visiblePin])

  async function acknowledgePin() {
    if (acknowledgementPending.current) return
    acknowledgementPending.current = true
    setIsPinBusy(true)
    setPinError('')

    try {
      if (!acknowledged.current) await authApi.acknowledgePin()
      if (!active.current) return
      acknowledged.current = true
      if (recoveryVerified) { setPinSuccess('Tu PIN se ha actualizado correctamente'); setRecoveryVerified(false); clearPinRecoveryOutcome() }
      setVisiblePin('')
      await refreshSession()
    } catch (error) {
      if (active.current) setPinError(error?.payload?.message ?? 'No fue posible confirmar la recepcion del PIN.')
    } finally {
      acknowledgementPending.current = false
      if (active.current) setIsPinBusy(false)
    }
  }

  async function recoverPin() {
    if (recoveryTask.current || isPinBusy) return
    setPinError('')
    setPinSuccess('')
    setIsPinBusy(true)
    setRecoveryOpen(true)
    const task = beginPinRecovery(authApi)
    recoveryTask.current = task
    try {
      await task.result
    } catch (error) {
      if (recoveryTask.current === task) setPinError(error?.payload?.message ?? error.message ?? 'No fue posible recuperar el PIN.')
    } finally {
      if (recoveryTask.current === task) {
        recoveryTask.current = null
        setRecoveryOpen(false)
        setIsPinBusy(false)
      }
    }
  }

  return (
    <PageShell className={styles.page} maxWidth="90rem" aria-labelledby="profile-title">
      <section className={styles.shell}>
        <PageHeader title="Mi perfil" titleId="profile-title" />

        {profileError && (
          <div className="alert alert-danger" role="alert">
            {profileError}{' '}
            <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => {
              setProfileAttempt((attempt) => attempt + 1)
            }}>Reintentar</button>
          </div>
        )}

        <section className={styles.profileGrid} aria-label="Datos del usuario">
          <aside className={styles.photoPanel}>
            <div className={styles.identityBlock}>
            {profile.picture ? <img alt="" className={styles.profilePhoto} src={profile.picture} />
              : <div className={styles.profilePhotoFallback} aria-hidden="true"><i className="bi bi-person" /></div>}
            <h2>{getDisplayValue(`${getDisplayValue(profile.firstName, '')} ${getDisplayValue(profile.lastName, '')}`.trim(), 'Usuario sin nombre')}</h2>
            </div>
            <div className={styles.roleBlock}>
              <div className={styles.roleContent}>
              <span className={styles.cardIcon}><i className="bi bi-briefcase" aria-hidden="true" /></span>
              <div><h3>Rol del usuario</h3><RoleBadge role={profile.role} provider={provider} /></div>
              </div>
            </div>
          </aside>

          <section className={styles.infoPanel} aria-labelledby="personal-information-title">
            <header className={styles.cardHeader}>
              <span className={styles.cardIcon}><i className="bi bi-person" aria-hidden="true" /></span>
              <div><h2 id="personal-information-title">Información personal</h2></div>
            </header>
            <dl className={styles.infoList}>
              <div><dt>Primer nombre</dt><dd>{getDisplayValue(profile.firstName)}</dd></div>
              <div><dt>Apellido paterno</dt><dd>{getDisplayValue(profile.lastName)}</dd></div>
              <div><dt>RUT</dt><dd>{getDisplayValue(profile.rut)}</dd></div>
              <div><dt>Correo electrónico</dt><dd>{getDisplayValue(profile.email)}</dd></div>
              <div><dt>Estado</dt><dd><span className={`${styles.statusBadge} ${isActiveUserStatus(profile.status) ? styles.accepted : styles.neutral}`}>
                <i className="bi bi-circle-fill" aria-hidden="true" />{getDisplayValue(displayUserStatus(profile.status))}
              </span></dd></div>
              <div><dt>Fecha de registro</dt><dd>{loadedProfile?.fechaRegistro ? formatProfileDate(loadedProfile.fechaRegistro, { includeTime: true }) : 'No informada'}</dd></div>
            </dl>
          </section>

          <section className={styles.pinPanel} aria-labelledby="personal-pin-title">
            <header className={styles.cardHeader}>
              <span className={styles.cardIcon}><i className="bi bi-shield" aria-hidden="true" /></span>
              <div><h2 id="personal-pin-title">PIN personal</h2></div>
            </header>
            <div className={styles.pinState}>
              <span className={`${styles.pinIcon} ${pinStatus === 'active' ? styles.accepted : styles.pending}`}><i className={`bi ${pinStatus === 'active' ? 'bi-lock' : 'bi-shield-lock'}`} aria-hidden="true" /></span>
              <span className={`${styles.statusBadge} ${pinStatus === 'active' ? styles.accepted : styles.pending}`}>
                <i className="bi bi-circle-fill" aria-hidden="true" />{pinStatus === 'active' ? 'Aceptado' : 'Pendiente de entrega'}
              </span>
            </div>
            {pinStatus === 'active' && <button className={styles.outlineButton} disabled={isPinBusy} type="button"
              onClick={recoverPin}><i className="bi bi-arrow-clockwise" aria-hidden="true" />Recuperar PIN</button>}

          </section>
        </section>

        {pinSuccess && <div className="alert alert-success" role="status">{pinSuccess}</div>}
        {pinError && pinStatus === 'active' && !recoveryOpen && <div className="alert alert-danger" role="alert">{pinError}</div>}

        <section className={styles.movementsPanel} aria-labelledby="movements-title">
          <header className={styles.movementsHeader}>
            <div className={styles.cardHeader}>
              <span className={styles.cardIcon}><i className="bi bi-clock" aria-hidden="true" /></span>
              <div><h2 id="movements-title">Actividad reciente</h2><p>Últimos movimientos y cambios realizados en tu cuenta.</p></div>
            </div>
            <button className={styles.outlineButton} type="button" disabled={!loadedProfile || pinStatus !== 'active'}
              onClick={() => setHistoryOpen(true)}><i className="bi bi-calendar3" aria-hidden="true" />Ver historial completo</button>
          </header>
          {!loadedProfile ? <>{profileError ? <p role="status">Actividad no disponible.</p> : <LoadingIndicator context="Actividad reciente" />}</>
            : !loadedProfile.records?.length ? <p role="status">Aún no tienes registros asociados.</p>
              : <UserMovementsTable records={loadedProfile.records} label="Actividad reciente del usuario" />}
        </section>
      </section>

      {historyOpen && pinStatus === 'active' && <UserMovementsModal key={user?.sub}
        user={historyUser} api={historyApi} onClose={() => setHistoryOpen(false)} title="Historial completo"
        description="Consulta el registro completo de movimientos de tu cuenta." />}

      {pinStatus === 'pending_acknowledgement' && (
        <PinModal title="Tu PIN personal" canClose={false} busy={isPinBusy}
          description="Guardalo en un lugar seguro. Despues de aceptar no volvera a mostrarse."
          actions={<button className={pinStyles.primary} disabled={(!visiblePin && !acknowledged.current) || isPinBusy}
            onClick={acknowledgePin} type="button" aria-busy={isPinBusy}>
            <LoadingAction busy={isPinBusy} surface="light" context="Aceptar">{acknowledged.current ? 'Continuar' : 'Aceptar'}</LoadingAction>
          </button>}>
          <div className={pinStyles.secret}>
            {visiblePin || (acknowledged.current ? 'PIN aceptado' : pinError ? 'PIN no disponible' : <LoadingIndicator scope="action" context="PIN operativo" />)}
          </div>
          <PinError>{pinError}</PinError>
        </PinModal>
      )}

      {recoveryOpen && (
        <>
          <div className="modal d-block" role="dialog" aria-modal="true" aria-labelledby="pin-recovery-title">
            <div className="modal-dialog modal-dialog-centered">
              <div className={`modal-content ${confirmationStyles.content}`}>
                <div className="modal-body" aria-live="polite">
                  <h2 className="fs-5" id="pin-recovery-title">Para recuperar tu PIN, debes autenticarte nuevamente</h2>
                  <p>Redirigiendo al inicio de sesión seguro...</p>
                  <LoadingIndicator scope="action" context="Recuperación de PIN" />
                </div>
                <div className="modal-footer">
                  <button className="btn btn-outline-secondary" onClick={() => recoveryTask.current?.cancel()} type="button">Cancelar</button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop show" />
        </>
      )}
    </PageShell>
  )
}

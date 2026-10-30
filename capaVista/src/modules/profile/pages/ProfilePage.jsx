import LoadingIndicator from '../../../shared/components/loading/LoadingIndicator'
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
import TablePagination from '../../../shared/components/pagination/TablePagination'
import { publicOperationMessage } from '../../../shared/notifications/operationFeedback'
import UserMovementsTable from '../../users/components/UserMovementsTable'
import confirmationStyles from '../../../shared/styles/ConfirmationModal.module.css'
import PendingPinModal from '../components/PendingPinModal'

import { useToast } from '../../../shared/notifications/useToast'

function getDisplayValue(value, fallback = 'No informado') {
  return String(value ?? '').trim() || fallback
}

export default function ProfilePage() {
  const { user } = useAuth()
  const api = useAuthApi()
  return <ProfileContent key={profileScope(api, user?.sub)} authApi={api} />
}

const scopes = new WeakMap()
let nextScope = 0
function profileScope(api, subject) {
  if (!scopes.has(api)) scopes.set(api, ++nextScope)
  return [scopes.get(api), subject].join(':')
}

function ProfileContent({ authApi }) {
  const notify = useToast()
  const { identityUser, pinStatus, refreshSession, user, provider } = useAuth()
  const recoveryTask = useRef(null)

  const [recoveryVerified, setRecoveryVerified] = useState(() => getPinRecoveryOutcome(user?.sub)?.recovered ?? false)
  useEffect(() => () => { recoveryTask.current?.cancel(); recoveryTask.current = null }, [user?.sub])
  const [historyPage, setHistoryPage] = useState(1)
  const [historyAttempt, setHistoryAttempt] = useState(0)
  const [history, setHistory] = useState(null)
  useEffect(() => {
    if (pinStatus !== 'active') return
    let current = true
    const controller = new AbortController()
    // Discard StrictMode's first setup before issuing a read.
    queueMicrotask(() => {
      if (!current) return
      authApi.getProfileMovements({ page: historyPage, perPage: 10 }, { signal: controller.signal })
        .then(data => {
          if (!current) return
          const lastPage = Math.max(1, Math.ceil(data.total / 10))
          if (historyPage > lastPage) { setHistoryPage(lastPage); return }
          setHistory({ page: historyPage, attempt: historyAttempt, data })
        }).catch(error => {
          if (!current) return
          setHistory({ page: historyPage, attempt: historyAttempt, error: true })
          notify.error(publicOperationMessage(error, 'No fue posible cargar tu actividad. Intenta nuevamente.'))
        })
    })
    return () => { current = false; controller.abort() }
  }, [authApi, historyPage, historyAttempt, pinStatus, notify])
  const currentHistory = history?.page === historyPage && history?.attempt === historyAttempt ? history : null
  const historyLoading = pinStatus === 'active' && !currentHistory
  const historyData = currentHistory?.data
  const recoveryNoticeShown = useRef(false)
  useEffect(() => {
    const result = getPinRecoveryOutcome(user?.sub)
    if (!result?.message || recoveryNoticeShown.current) return
    recoveryNoticeShown.current = true
    notify.error(result.message)
    clearPinRecoveryOutcome()
  }, [notify, user?.sub])
  const [profileData, setProfileData] = useState(null)
  const [profileAttempt, setProfileAttempt] = useState(0)
  useEffect(() => {
    let current = true
    authApi.getProfile().then((data) => {
      if (current) setProfileData({ subject: user?.sub, api: authApi, attempt: profileAttempt, data })
    }).catch((error) => {
      if (current) {
        setProfileData({ subject: user?.sub, api: authApi, attempt: profileAttempt, error: true })
        notify.error(publicOperationMessage(error, 'No fue posible cargar tu perfil.'))
      }
    })
    return () => { current = false }
  }, [authApi, user?.sub, profileAttempt, notify])
  const profileCurrent = profileData?.subject === user?.sub && profileData?.api === authApi && profileData?.attempt === profileAttempt
  const loadedProfile = profileCurrent ? profileData?.data : null
  const profileError = profileCurrent ? profileData?.error : ''

  const [isPinBusy, setIsPinBusy] = useState(false)
  const [recoveryOpen, setRecoveryOpen] = useState(false)
  const profile = useMemo(() => {
    const firstName = loadedProfile?.primerNombre ?? user?.primerNombre
    const lastName = loadedProfile?.apellidoPaterno ?? user?.apellidoPaterno
    const email = loadedProfile ? loadedProfile.email : user?.email
    const role = loadedProfile?.rolUsuario ?? user?.rolUsuario
    const status = loadedProfile?.estadoUsuario ?? user?.estadoUsuario

    return {
      username: identityUser?.username,
      firstName,
      lastName,
      email,
      role,
      status,
      rut: loadedProfile?.rutUsuario ?? user?.rutUsuario,
      picture: identityUser?.picture,
    }
  }, [identityUser, user, loadedProfile])

  async function recoverPin() {
    if (recoveryTask.current || isPinBusy) return
    setIsPinBusy(true)
    setRecoveryOpen(true)
    const task = beginPinRecovery(authApi)
    recoveryTask.current = task
    try {
      await task.result
    } catch (error) {
      if (recoveryTask.current === task) notify.error(publicOperationMessage(error,
        error.message === 'Recuperación cancelada.' ? error.message : 'No fue posible iniciar la recuperación del PIN. Intenta nuevamente.'))
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

        {profileError && <button type="button" className={styles.outlineButton}
          onClick={() => setProfileAttempt(attempt => attempt + 1)}>Reintentar carga del perfil</button>}

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
              <div><dt>Nombre de usuario</dt><dd>{getDisplayValue(profile.username)}</dd></div>
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


        <section className={styles.movementsPanel} aria-labelledby="movements-title">
          <header className={styles.movementsHeader}>
            <div className={styles.cardHeader}>
              <span className={styles.cardIcon}><i className="bi bi-clock" aria-hidden="true" /></span>
              <div><h2 id="movements-title">Actividad reciente</h2><p>Últimos movimientos y cambios realizados en tu cuenta.</p></div>
            </div>
          </header>
          <UserMovementsTable records={historyData?.records} label="Actividad reciente del usuario"
            isLoading={historyLoading} error={Boolean(currentHistory?.error)}
            onRetry={() => setHistoryAttempt(attempt => attempt + 1)}>
          <TablePagination page={historyPage} pageSize={10} total={historyData?.total ?? history?.data?.total ?? 0}
            visibleCount={historyData?.records?.length ?? 0} integrated
            statusLabel={historyLoading ? 'Cargando resultados…' : currentHistory?.error ? 'Consulta no disponible' : undefined}
            disabled={historyLoading || Boolean(currentHistory?.error) || pinStatus !== 'active'}
            onPageChange={setHistoryPage} label="Paginación de actividad" />
          </UserMovementsTable>
        </section>
      </section>

      {pinStatus === 'pending_acknowledgement' && <PendingPinModal api={authApi} refreshSession={refreshSession}
        onAcknowledged={() => {
          if (recoveryVerified) {
            notify.success('Tu PIN se ha actualizado correctamente')
            setRecoveryVerified(false)
            clearPinRecoveryOutcome()
          }
        }} />}
      {recoveryOpen && (
        <>
          <div className="modal d-block" role="dialog" aria-modal="true" aria-labelledby="pin-recovery-title">
            <div className="modal-dialog modal-dialog-centered">
              <div className={`modal-content ${confirmationStyles.content}`}>
                <div className="modal-body" aria-live="polite">
                  <h2 className="fs-5" id="pin-recovery-title">Para recuperar tu PIN, debes autenticarte nuevamente</h2>
                  <p>Redirigiendo al inicio de sesión seguro...</p>
                  <LoadingIndicator scope="dialog" context="Recuperación de PIN" />
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

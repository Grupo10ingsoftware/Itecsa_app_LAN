import { useCallback, useEffect, useRef, useState } from 'react'
import { API_ERROR_CODES } from '../../../services/api/apiClient'
import { useAuth } from '../../../hooks/useAuth'
import { useAdminUsersApi } from '../hooks/useAdminUsersApi'
import UserButton from '../components/UserButton'
import UserCreateModal from '../components/UserCreateModal'
import UserEditModal from '../components/UserEditModal'
import UserManagementFilters from '../components/UserManagementFilters'
import UserManagementTable from '../components/UserManagementTable'
import UserMovementsModal from '../components/UserMovementsModal'
import UserSummaryCards from '../components/UserSummaryCards'
import { createLatestRequestTracker } from '../utils/latestRequestTracker'
import { displayUserStatus } from '../../../config/userLifecycle.js'
import styles from './UserManagementPage.module.css'
import PageShell from '../../../shared/components/layout/PageShell'
import PageHeader from '../../../shared/components/layout/PageHeader'
import { useToast } from '../../../shared/notifications/useToast'
import { FEEDBACK_HANDLED, publicOperationMessage, requiresContext, uncertainOperation, operationFailureMessage } from '../../../shared/notifications/operationFeedback'

const EMPTY_SUMMARY = Object.freeze({
  totalUsuarios: 0,
  vinculados: 0,
  desvinculados: 0,
  pendientes: 0,
  pendientesRol: 0,
})

const DEFAULT_PAGE_SIZE = 10
const SEARCH_DEBOUNCE_MS = 350

function firstWord(value) {
  return String(value ?? '').trim().split(/\s+/).filter(Boolean)[0] ?? ''
}

function mapApiUser(user) {
  const nombreUsuario = user.nombreUsuario ?? ''
  const apellidoUsuario = user.apellidoUsuario ?? ''
  const nombreCompleto =
    user.nombreCompleto ?? (`${nombreUsuario} ${apellidoUsuario}`.trim() || 'Usuario sin nombre')
  const nombreListado =
    `${firstWord(nombreUsuario)} ${firstWord(apellidoUsuario)}`.trim() || nombreCompleto

  return {
    id: user.idUsuarioAutenticacionExterna ?? user.idUsuario,
    idUsuario: user.idUsuario,
    idUsuarioAutenticacionExterna: user.idUsuarioAutenticacionExterna,
    nombreUsuario,
    apellidoUsuario,
    nombreCompleto,
    nombreListado,
    rutUsuario: user.rutUsuario ?? 'No disponible',
    correoUsuario: user.correoUsuario ?? '',
    rolUsuario: user.rolUsuario ?? 'Sin rol asignado',
    estadoUsuario: displayUserStatus(user.estadoUsuario ?? 'Vinculado'),
    username: user.username,
    identityBindingConflict: user.identityBindingConflict === true,
  }
}

function getErrorText(error) {
  if (['USER_UPDATE_PENDING_RECONCILIATION', 'USER_STATUS_PENDING_RECONCILIATION', 'CREDENTIAL_SETUP_PENDING_RECONCILIATION'].includes(error?.payload?.code)) {
    return 'La operacion quedo pendiente de conciliacion. Revisa el estado de la cuenta antes de continuar.'
  }
  if (error?.payload?.code === 'SECURE_TRANSPORT_REQUIRED') return 'Este procedimiento requiere una conexion HTTPS.'
  if (error?.code === API_ERROR_CODES.SESSION_INVALID || error?.status === 401) {
    return 'La sesion no es valida o expiro. Vuelve a iniciar sesion para gestionar usuarios.'
  }

  if (error?.status === 403) {
    return publicOperationMessage(error, 'Acceso denegado. Se requiere autorizacion administrativa para gestionar usuarios.')
  }

  if (error?.code === API_ERROR_CODES.NETWORK_ERROR) {
    return 'No fue posible contactar la API. Revisa la conexion e intenta nuevamente.'
  }

  if (error?.payload?.message) {
    return publicOperationMessage(error, 'No fue posible completar la operación. Intenta nuevamente.')
  }

  if (error?.status === 409) {
    return 'Ya existe un usuario con ese correo.'
  }

  return 'No fue posible completar la operacion. Intenta nuevamente.'
}

export default function UserManagementPage() {
  const notify = useToast()
  const { identityUser, loginWithRedirect } = useAuth()
  const adminUsersApi = useAdminUsersApi()
  const latestRequestRef = useRef(0)
  const latestSummaryRequestRef = useRef(createLatestRequestTracker())
  const [users, setUsers] = useState([])
  const [activeStatus, setActiveStatus] = useState('')
  const [activeRole, setActiveRole] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('')
  const [page, setPage] = useState(1)
  const [totalUsers, setTotalUsers] = useState(0)
  const [summary, setSummary] = useState(EMPTY_SUMMARY)
  const [summaryState, setSummaryState] = useState({
    error: '',
    hasData: false,
    isLoading: true,
  })
  const [isFiltersOpen, setIsFiltersOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [actionMessage, setActionMessage] = useState(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [movementsUser, setMovementsUser] = useState(null)
  const [editingUser, setEditingUser] = useState(null)
  const [inspectingId, setInspectingId] = useState(null)
  const inspection = useRef({ busy: false, version: 0 })
  useEffect(() => {
    const tracker = inspection.current
    return () => { tracker.version++ }
  }, [adminUsersApi])
  const currentExternalUserId = identityUser?.sub ?? null

  useEffect(() => {
    const debounceTimer = window.setTimeout(() => {
      setDebouncedSearchTerm(searchTerm.trim())
      setPage(1)
    }, SEARCH_DEBOUNCE_MS)

    return () => window.clearTimeout(debounceTimer)
  }, [searchTerm])

  const loadUsers = useCallback(
    async ({ preserveMessage = false, requestedPage = page } = {}) => {
      const requestId = latestRequestRef.current + 1
      latestRequestRef.current = requestId
      setIsLoading(true)

      if (!preserveMessage) {
        setActionMessage(null)
      }

      try {
        const response = await adminUsersApi.listUsers({
          page: requestedPage,
          perPage: DEFAULT_PAGE_SIZE,
          search: debouncedSearchTerm,
          estadoUsuario: activeStatus,
          rolUsuario: activeRole,
        })

        if (requestId !== latestRequestRef.current) {
          return
        }

        setUsers(
          (response.usuarios ?? []).map((user) => {
            const mappedUser = mapApiUser(user)

            return {
              ...mappedUser,
              isCurrentUser: Boolean(
                currentExternalUserId &&
                  mappedUser.idUsuarioAutenticacionExterna === currentExternalUserId,
              ),
            }
          }),
        )
        setTotalUsers(response.total ?? 0)
      } catch (error) {
        if (requestId !== latestRequestRef.current) {
          return
        }

        setUsers([])
        setTotalUsers(0)
        setActionMessage({ type: 'danger', text: getErrorText(error), requiresLogin: error?.status === 401 })
      } finally {
        if (requestId === latestRequestRef.current) {
          setIsLoading(false)
        }
      }
    },
    [activeRole, activeStatus, adminUsersApi, currentExternalUserId, debouncedSearchTerm, page],
  )

  const loadSummary = useCallback(async () => {
    const tracker = latestSummaryRequestRef.current
    const requestId = tracker.begin()
    setSummaryState((current) => ({ ...current, error: '', isLoading: true }))

    try {
      const response = await adminUsersApi.getSummary()

      if (!tracker.isLatest(requestId)) return

      setSummary({
        totalUsuarios: response.totalUsuarios ?? 0,
        vinculados: response.vinculados ?? 0,
        desvinculados: response.desvinculados ?? 0,
        pendientes: response.pendientes ?? 0,
        pendientesRol: response.pendientesRol ?? 0,
      })
      setSummaryState({ error: '', hasData: true, isLoading: false })
    } catch (error) {
      if (!tracker.isLatest(requestId)) return

      setSummaryState((current) => ({
        ...current,
        error: getErrorText(error),
        isLoading: false,
      }))
    }
  }, [adminUsersApi])

  useEffect(() => {
    const requestTimer = window.setTimeout(() => {
      loadUsers()
    }, 0)

    return () => window.clearTimeout(requestTimer)
  }, [loadUsers])

  useEffect(() => {
    const tracker = latestSummaryRequestRef.current
    const requestTimer = window.setTimeout(() => {
      loadSummary()
    }, 0)

    return () => {
      window.clearTimeout(requestTimer)
      tracker.invalidate()
    }
  }, [loadSummary])

  const totalPages = Math.max(1, Math.ceil(totalUsers / DEFAULT_PAGE_SIZE))

  function handleStatusChange(status) {
    setActiveStatus(status)
    setPage(1)
  }

  function handleRoleChange(role) {
    setActiveRole(role)
    setPage(1)
  }

  function handleClearFilters() {
    setActiveStatus('')
    setActiveRole('')
    setSearchTerm('')
    setDebouncedSearchTerm('')
    setPage(1)
  }

  async function refreshAfterMutation(message) {
    if (message.type === 'success') notify.success(message.text)
    else setActionMessage(message)
    await Promise.all([loadUsers({ preserveMessage: true }), loadSummary()])
  }

  async function handleSaveUser(updatedUser) {
    setActionMessage(null)

    try {
      await adminUsersApi.updateUser(updatedUser)
      setEditingUser(null)
      await refreshAfterMutation({ type: 'success', text: 'Usuario actualizado correctamente.' })
    } catch (error) {
      if (requiresContext(error) || uncertainOperation(error)) {
        // The dialog owns correctable PIN/session/reconciliation feedback.
        throw new Error(operationFailureMessage(error, getErrorText(error)), { cause: error })
      }
      notify.error(getErrorText(error))
      return FEEDBACK_HANDLED
    }
  }

  async function handleCreatedUser(user) {
    if (user.outcome === 'user_created') setIsCreateModalOpen(false)
    setPage(1)
    await refreshAfterMutation({ type: user.outcome === 'user_created' ? 'success' : 'warning',
      text: user.outcome === 'user_created'
        ? 'Usuario creado. Deberá cambiar su contraseña temporal al iniciar sesión.'
        : 'Preparacion incompleta. No repitas el alta con otro nombre. Referencia: ' + user.operationId + '.' })
  }
  async function handleInspectUser(user) {
    if (inspection.current.busy) return
    const version = inspection.current.version
    inspection.current.busy = true
    setInspectingId(user.id)
    try {
      const detail = await adminUsersApi.inspectUser(user.idUsuarioAutenticacionExterna)
      if (version !== inspection.current.version) return
      setEditingUser({ ...user, username: detail.username, enabled: detail.enabled,
        nombreUsuario: detail.firstName, apellidoUsuario: detail.lastName, correoUsuario: detail.email,
        rolUsuario: detail.role, estadoUsuario: detail.localState })
    } catch (error) {
      if (version === inspection.current.version) {
        if (requiresContext(error)) setActionMessage({ type: 'danger', text: getErrorText(error), requiresLogin: error?.status === 401 })
        else notify.error(getErrorText(error))
      }
    } finally {
      inspection.current.busy = false
      if (version === inspection.current.version) setInspectingId(null)
    }
  }

  return (
    <PageShell className={styles.page} aria-labelledby="user-management-title">
      <section className={styles.dashboardShell}>
        <PageHeader title="Gestion de usuarios" titleId="user-management-title" />

        <UserSummaryCards
          isLoading={summaryState.isLoading}
          summary={summaryState.hasData ? summary : null}
        />

        {summaryState.error && (
          <div className={`${styles.feedbackMessage} ${styles.feedbackdanger}`} role="alert">
            <span>{summaryState.error} {summaryState.hasData ? 'Se conservan los ultimos valores disponibles.' : ''}</span>
            <UserButton disabled={summaryState.isLoading} onClick={() => { void loadSummary() }} variant="secondary">
              Reintentar resumen
            </UserButton>
          </div>
        )}

        <div className={styles.content}>
          {actionMessage && (
            <div className={`${styles.feedbackMessage} ${styles[`feedback${actionMessage.type}`]}`} role="status">
              <span>{actionMessage.text}</span>
              {actionMessage.requiresLogin && (
                <UserButton onClick={() => loginWithRedirect()} variant="secondary">
                  Iniciar sesion
                </UserButton>
              )}
            </div>
          )}

          <UserManagementFilters
            activeRole={activeRole}
            activeStatus={activeStatus}
            isOpen={isFiltersOpen}
            onClear={handleClearFilters}
            onCreateUser={() => setIsCreateModalOpen(true)}
            onRoleChange={handleRoleChange}
            onSearchChange={setSearchTerm}
            onStatusChange={handleStatusChange}
            onToggle={() => setIsFiltersOpen((currentValue) => !currentValue)}
            searchTerm={searchTerm}
            summary={summaryState.hasData ? summary : null}
          />

          <UserManagementTable
            inspectingId={inspectingId}
            currentPage={page}
            isLoading={isLoading}
            onEditUser={handleInspectUser}
            onViewMovements={setMovementsUser}
            onPageChange={setPage}
            totalPages={totalPages}
            totalUsers={totalUsers}
            users={users}
          />
        </div>
      </section>

      {movementsUser && (
        <UserMovementsModal
          key={movementsUser.id}
          user={movementsUser}
          api={adminUsersApi}
          onClose={() => setMovementsUser(null)}
        />
      )}
      <UserCreateModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={handleCreatedUser}
      />
      <UserEditModal
        key={editingUser?.id ?? 'user-edit-modal'}
        isOpen={Boolean(editingUser)}
        onClose={() => setEditingUser(null)}
        onSave={handleSaveUser}
        isCurrentUser={Boolean(editingUser?.isCurrentUser)}
        user={editingUser}
      />
    </PageShell>
  )
}

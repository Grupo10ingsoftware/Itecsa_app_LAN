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
import { displayUserStatus } from '../../../config/userLifecycle.js'
import styles from './UserManagementPage.module.css'
import PageShell, { PageSurface } from '../../../shared/components/layout/PageShell'
import PageHeader from '../../../shared/components/layout/PageHeader'
import FilterContent from '../../../shared/components/filters/FilterContent'
import { useToast } from '../../../shared/notifications/useToast'
import { FEEDBACK_HANDLED, publicOperationMessage, requiresContext, uncertainOperation, operationFailureMessage } from '../../../shared/notifications/operationFeedback'

const DEFAULT_PAGE_SIZE = 10
const EMPTY_FILTERS = Object.freeze({ status: '', department: '', search: '' })

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
  const listController = useRef(null)
  const preserveNextListMessage = useRef(false)
  const [users, setUsers] = useState([])
  const [activeStatus, setActiveStatus] = useState('')
  const [activeDepartment, setActiveDepartment] = useState('')
  const [draftFilters, setDraftFilters] = useState(EMPTY_FILTERS)
  const [appliedSearch, setAppliedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [totalUsers, setTotalUsers] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [actionMessage, setActionMessage] = useState(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [movementsUser, setMovementsUser] = useState(null)
  const [editingUser, setEditingUser] = useState(null)
  const [inspectingId, setInspectingId] = useState(null)
  const inspection = useRef({ busy: false, version: 0, active: false, controller: null })
  useEffect(() => {
    const tracker = inspection.current
    tracker.active = true
    return () => {
      tracker.active = false
      tracker.version++
      tracker.busy = false
      tracker.controller?.abort()
    }
  }, [adminUsersApi])
  const currentExternalUserId = identityUser?.sub ?? null

  const loadUsers = useCallback(
    async ({ preserveMessage = false, requestedPage = page } = {}) => {
      const requestId = latestRequestRef.current + 1
      latestRequestRef.current = requestId
      listController.current?.abort()
      const controller = new AbortController()
      listController.current = controller
      setIsLoading(true)

      if (!preserveMessage) {
        setActionMessage(null)
      }

      try {
        const response = await adminUsersApi.listUsers({
          page: requestedPage,
          perPage: pageSize,
          search: appliedSearch,
          estadoUsuario: activeStatus,
          department: activeDepartment,
        }, { signal: controller.signal })

        if (controller.signal.aborted || requestId !== latestRequestRef.current) {
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
        const lastPage = Math.max(1, Math.ceil((response.total ?? 0) / pageSize))
        if (requestedPage > lastPage) {
          preserveNextListMessage.current = preserveMessage
          setPage(lastPage)
        }
      } catch (error) {
        if (controller.signal.aborted || requestId !== latestRequestRef.current) {
          return
        }

        setUsers([])
        setTotalUsers(0)
        setActionMessage({ type: 'danger', text: getErrorText(error), requiresLogin: error?.status === 401 })
      } finally {
        if (!controller.signal.aborted && requestId === latestRequestRef.current) {
          setIsLoading(false)
        }
      }
    },
    [activeDepartment, activeStatus, adminUsersApi, currentExternalUserId, appliedSearch, page, pageSize],
  )

  useEffect(() => {
    const requestTimer = window.setTimeout(() => {
      const preserveMessage = preserveNextListMessage.current
      preserveNextListMessage.current = false
      loadUsers({ preserveMessage })
    }, 0)

    return () => {
      window.clearTimeout(requestTimer)
      latestRequestRef.current++
      listController.current?.abort()
    }
  }, [loadUsers])

  const totalPages = Math.max(1, Math.ceil(totalUsers / pageSize))

  function handleApplyFilters() {
    setActiveStatus(draftFilters.status)
    setActiveDepartment(draftFilters.department)
    setAppliedSearch(draftFilters.search.trim())
    setPage(1)
  }

  function handleClearFilters() {
    setDraftFilters(EMPTY_FILTERS)
    setActiveStatus('')
    setActiveDepartment('')
    setAppliedSearch('')
    setPage(1)
  }

  async function refreshAfterMutation(message, { resetPage = false } = {}) {
    if (message.type === 'success') notify.success(message.text)
    else setActionMessage(message)
    if (resetPage && page !== 1) {
      // The page effect owns this single reload; do not also fetch the old page.
      latestRequestRef.current++
      listController.current?.abort()
      preserveNextListMessage.current = true
      setPage(1)
    } else await loadUsers({ preserveMessage: true })
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
    await refreshAfterMutation({ type: user.outcome === 'user_created' ? 'success' : 'warning',
      text: user.outcome === 'user_created'
        ? 'Usuario creado. Deberá cambiar su contraseña temporal al iniciar sesión.'
        : 'Preparacion incompleta. No repitas el alta con otro nombre. Referencia: ' + user.operationId + '.' }, { resetPage: true })
  }
  async function handleInspectUser(user) {
    if (inspection.current.busy) return
    const version = inspection.current.version
    const controller = new AbortController()
    inspection.current.controller = controller
    inspection.current.busy = true
    setInspectingId(user.id)
    try {
      const detail = await adminUsersApi.inspectUser(user.idUsuarioAutenticacionExterna, { signal: controller.signal })
      if (controller.signal.aborted || version !== inspection.current.version) return
      setEditingUser({ ...user, username: detail.username, enabled: detail.enabled,
        nombreUsuario: detail.firstName, apellidoUsuario: detail.lastName, correoUsuario: detail.email,
        rolUsuario: detail.role, estadoUsuario: detail.localState })
    } catch (error) {
      if (!controller.signal.aborted && version === inspection.current.version) {
        if (requiresContext(error)) setActionMessage({ type: 'danger', text: getErrorText(error), requiresLogin: error?.status === 401 })
        else notify.error(getErrorText(error))
      }
    } finally {
      if (inspection.current.controller === controller) {
        inspection.current.busy = false
        if (inspection.current.active) setInspectingId(null)
      }
    }
  }

  return (
    <PageShell className={styles.page} aria-labelledby="user-management-title">
      <PageSurface>
        <PageHeader title="Gestion de usuarios" titleId="user-management-title" />

        <FilterContent>
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

          <div className={styles.filterToolbar}>
            <UserManagementFilters
              value={draftFilters}
              onChange={(change) => setDraftFilters(current => ({ ...current, ...change }))}
              onApply={handleApplyFilters}
              onClear={handleClearFilters}
              loading={isLoading}
            />
            <div className={styles.createUserActions}>
              <UserButton icon="bi-plus-lg" onClick={() => setIsCreateModalOpen(true)} variant="primary">
                Crear usuario
              </UserButton>
            </div>
          </div>

          <UserManagementTable
            inspectingId={inspectingId}
            currentPage={page}
            isLoading={isLoading}
            onEditUser={handleInspectUser}
            onViewMovements={setMovementsUser}
            onPageChange={nextPage => {
              if (nextPage === page || nextPage < 1 || nextPage > totalPages) return
              setIsLoading(true)
              setPage(nextPage)
            }}
            pageSize={pageSize}
            onPageSizeChange={nextSize => {
              if (nextSize === pageSize) return
              setIsLoading(true)
              setPage(1)
              setPageSize(nextSize)
            }}
            totalPages={totalPages}
            totalUsers={totalUsers}
            users={users}
          />
        </FilterContent>
      </PageSurface>

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

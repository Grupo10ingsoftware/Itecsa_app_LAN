import FilterContent from '../../../shared/components/filters/FilterContent'
import LoadingIndicator from '../../../shared/components/loading/LoadingIndicator'
import { useToast } from '../../../shared/notifications/useToast'
import { operationFailureMessage, requiresContext, uncertainOperation } from '../../../shared/notifications/operationFeedback'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPaymentPreviewCache } from '../api/paymentPreviewCache'
import { PERMISSIONS } from '@/config/permissions'
import { PAYMENT_STATUS } from '@/config/status'
import { useAuth } from '@/hooks/useAuth'
import PaymentActionConfirmModal from '../components/PaymentActionConfirmModal'
import PaymentCredentialsModal from '../components/PaymentCredentialsModal'
import PaymentFilters from '../components/PaymentFilters'
import PaymentOrderMobileList from '../components/PaymentOrderMobileList'
import PaymentOrdersTable from '../components/PaymentOrdersTable'
import PaymentPagination from '../components/PaymentPagination'
import { usePaymentsApi } from '../hooks/usePaymentsApi'
import {
  getPaymentStatusIdByName,
  mergePaymentPreview,
  normalizePaymentOrders,
} from '../utils/paymentOrders'
import styles from './PaymentConfirmationPage.module.css'
import PageShell, { PageSurface } from '../../../shared/components/layout/PageShell'
import PageHeader from '../../../shared/components/layout/PageHeader'

const FILTERS = [
  { key: PAYMENT_STATUS.PENDIENTE, label: 'Pendientes' },
  { key: PAYMENT_STATUS.RECHAZADO, label: 'Rechazados' },
  { key: PAYMENT_STATUS.CONFIRMADO, label: 'Confirmados' },
]
const COUNT_KEY_BY_STATUS = { Pendiente: 'pending', Rechazado: 'rejected', Confirmado: 'confirmed' }

export default function PaymentConfirmationPage() {
  const { hasPermission } = useAuth()
  const paymentsApi = usePaymentsApi()
  const canRead = hasPermission(PERMISSIONS.READ_PAYMENTS)
  const canUpdate = hasPermission(PERMISSIONS.UPDATE_PAYMENT_STATUS)
  const canRevise = hasPermission(PERMISSIONS.REVISE_PAYMENT_STATUS)
  return <PaymentWorkspace key={`${paymentsApi.scopeId}:${canRead}:${canUpdate}:${canRevise}`}
    paymentsApi={paymentsApi} canRead={canRead} canUpdatePaymentStatus={canUpdate} canRevise={canRevise} />
}

function PaymentWorkspace({ paymentsApi, canRead, canUpdatePaymentStatus, canRevise }) {
  const notify = useToast()
  const [orders, setOrders] = useState([])
  const [counters, setCounters] = useState({ pending: 0, rejected: 0, confirmed: 0 })
  const [{ page, pageSize }, setPagination] = useState({ page: 1, pageSize: 10 })
  const loadRequestId = useRef(0)
  const [paymentStatuses, setPaymentStatuses] = useState([])
  const [activeFilter, setActiveFilter] = useState(PAYMENT_STATUS.PENDIENTE)
  const [editingStatus, setEditingStatus] = useState({})
  const [pendingTransition, setPendingTransition] = useState(null)
  const [credentialsTransition, setCredentialsTransition] = useState(null)
  const [previewState, setPreviewState] = useState(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [draftFilters, setDraftFilters] = useState({ status: PAYMENT_STATUS.PENDIENTE, search: '', from: '', to: '' })
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [updateError, setUpdateError] = useState(null)
  const [isUpdatingPaymentStatus, setIsUpdatingPaymentStatus] = useState(false)
  const [isLoadingActionDetails, setIsLoadingActionDetails] = useState(false)
  const [actionDetailsError, setActionDetailsError] = useState(null)
  const [isLoadingPreviewDetails, setIsLoadingPreviewDetails] = useState(false)
  const [previewDetailsError, setPreviewDetailsError] = useState(null)
  const previewRequestId = useRef(0)
  const detailPreviewRequestId = useRef(0)
  const [previewCache] = useState(() => createPaymentPreviewCache(paymentsApi))
  const listController = useRef(null)
  const summaryController = useRef(null)
  const writePending = useRef(false)
  const mounted = useRef(true)
  const summaryScope = useRef(null)
  const [settledSearch, setSettledSearch] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const queryScope = `${settledSearch}\n${dateFrom}\n${dateTo}`
  const currentScope = useRef(queryScope)

  useEffect(() => {
    mounted.current = true
    const actionRequests = previewRequestId
    const detailRequests = detailPreviewRequestId
    return () => {
      mounted.current = false
      actionRequests.current++
      detailRequests.current++
      listController.current?.abort()
      summaryController.current?.abort()
      previewCache.clear()
    }
  }, [previewCache])

  useEffect(() => {
    const refresh = () => {
      previewCache.clear()
      summaryScope.current = null
      setRefreshKey(value => value + 1)
    }
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [previewCache])

  useEffect(() => {
    if (canUpdatePaymentStatus) return

    const resetTimer = window.setTimeout(() => {
      setEditingStatus({})
      setPendingTransition(null)
      setCredentialsTransition(null)
    }, 0)

    return () => window.clearTimeout(resetTimer)
  }, [canUpdatePaymentStatus])

  const loadPaymentData = useCallback(async (forceSummary = true) => {
    if (!canRead) { setIsLoading(false); return }
    listController.current?.abort()
    summaryController.current?.abort()
    const controller = new AbortController()
    listController.current = controller
    const requestId = ++loadRequestId.current
    currentScope.current = queryScope
    const includeSummary = forceSummary || !summaryScope.current
      || summaryScope.current.key !== queryScope || Date.now() >= summaryScope.current.expires
    previewCache.clear()
    if (!writePending.current) {
      previewRequestId.current++
      detailPreviewRequestId.current++
      setPendingTransition(null)
      setCredentialsTransition(null)
      setPreviewState(null)
    }
    setIsLoading(true)
    setLoadError(null)

    try {
      const workspace = await paymentsApi.getPaymentWorkspace({ status: activeFilter, search: settledSearch, from: dateFrom, to: dateTo, page, limit: pageSize,
        ...(includeSummary ? {} : { includeSummary: false }) }, { signal: controller.signal })
      if (controller.signal.aborted || !mounted.current || requestId !== loadRequestId.current) return
      const ordersResponse = workspace?.items
      const statusesResponse = workspace?.paymentStatuses

      setOrders(normalizePaymentOrders(ordersResponse))
      if (includeSummary) {
        setCounters(workspace?.counts ?? { pending: 0, rejected: 0, confirmed: 0 })
        setPaymentStatuses(Array.isArray(statusesResponse) ? statusesResponse : [])
        summaryScope.current = { key: queryScope, expires: Date.now() + 30000 }
      }
      if (includeSummary) {
        const key = COUNT_KEY_BY_STATUS[activeFilter]
        const lastPage = Math.max(1, Math.ceil((workspace.counts?.[key] ?? 0) / pageSize))
        if (page > lastPage) setPagination(current => ({ ...current, page: lastPage }))
      }
    } catch (error) {
      if (controller.signal.aborted || !mounted.current || requestId !== loadRequestId.current) return
      summaryScope.current = null
      setOrders([])
      setPaymentStatuses([])
      setLoadError(
        error?.payload?.message ??
          'No fue posible cargar los pedidos de pago.',
      )
    } finally {
      if (!controller.signal.aborted && mounted.current && requestId === loadRequestId.current) setIsLoading(false)
    }
  }, [activeFilter, canRead, dateFrom, dateTo, paymentsApi, settledSearch, queryScope, previewCache, page, pageSize])

  useEffect(() => {
    const requests = loadRequestId
    const loadTimer = window.setTimeout(() => {
      loadPaymentData(false)
    }, 0)

    return () => { window.clearTimeout(loadTimer); requests.current++; listController.current?.abort(); summaryController.current?.abort() }
  }, [loadPaymentData, refreshKey])

  const filteredOrders = orders

  const getFilterCount = useCallback(
    (filterKey) => {
      return counters[COUNT_KEY_BY_STATUS[filterKey]] ?? 0
    },
    [counters],
  )

  const handleUpdatePaymentStatus = useCallback(async (orderId, newStatus, credentials) => {
    if (!canUpdatePaymentStatus || writePending.current) return false

    const paymentStatusId = getPaymentStatusIdByName(paymentStatuses, newStatus)

    if (!paymentStatusId) {
      notify.error('No fue posible resolver el estado de pago seleccionado.')
      return false
    }

    writePending.current = true
    listController.current?.abort()
    const requestId = ++loadRequestId.current
    const scope = queryScope
    setIsLoading(false)
    setIsUpdatingPaymentStatus(true)
    setUpdateError(null)

    try {
      const confirmed = await paymentsApi.updatePaymentStatus(orderId, {
        pin: credentials.pin,
        paymentStatusId,
        observacion:
          credentials.comment ||
          `Cambio de estado a ${newStatus} desde modulo de pagos.`,
      })

      if (!mounted.current) return false
      previewCache.invalidate(orderId)
      previewRequestId.current++
      detailPreviewRequestId.current++
      summaryScope.current = null
      if (confirmed?.id !== orderId || confirmed.paymentStatus !== newStatus) throw new Error('Respuesta de pago incompleta')
      if (requestId === loadRequestId.current && currentScope.current === scope) {
        const normalized = normalizePaymentOrders([confirmed])[0]
        setOrders(current => current.map(order => order.id === orderId ? { ...order, ...normalized } : order)
          .filter(order => order.paymentStatus === activeFilter))
        const controller = new AbortController()
        summaryController.current = controller
        try {
          const summary = await paymentsApi.getPaymentWorkspace({ status: activeFilter, page, limit: pageSize, search: settledSearch, from: dateFrom, to: dateTo }, { signal: controller.signal })
          if (!controller.signal.aborted && mounted.current && requestId === loadRequestId.current) {
            setOrders(normalizePaymentOrders(summary.items))
            setCounters(summary.counts)
            setPaymentStatuses(summary.paymentStatuses)
            summaryScope.current = { key: scope, expires: Date.now() + 30000 }
            const key = COUNT_KEY_BY_STATUS[activeFilter]
            const lastPage = Math.max(1, Math.ceil((summary.counts?.[key] ?? 0) / pageSize))
            if (page > lastPage) setPagination(current => ({ ...current, page: lastPage }))
          }
        } catch {
          if (!controller.signal.aborted && mounted.current) setLoadError('El pago fue actualizado, pero no se pudo reconciliar el resumen. Reintenta la lectura.')
        }
      } else {
        setRefreshKey(value => value + 1)
      }

      setEditingStatus((prev) => ({ ...prev, [orderId]: false }))
      return true
    } catch (error) {
      if (!mounted.current) return false
      previewCache.invalidate(orderId)
      summaryScope.current = null
      const message = operationFailureMessage(error, 'No fue posible actualizar el estado de pago.')
      if (requiresContext(error) || uncertainOperation(error)) setUpdateError(message)
      else notify.error(message)
      if (error?.status === 409 || uncertainOperation(error)) {
        // Resolve uncertainty with reads only; never resend a financial mutation.
        if (requestId === loadRequestId.current && currentScope.current === scope) await loadPaymentData(true)
        else setRefreshKey(value => value + 1)
        if (mounted.current && error?.status === 409) {
          setCredentialsTransition(null)
          setUpdateError(message)
        }
      }
      return false
    } finally {
      writePending.current = false
      if (mounted.current) setIsUpdatingPaymentStatus(false)
    }
  }, [
    canUpdatePaymentStatus,
    loadPaymentData,
    paymentStatuses,
    paymentsApi,
    notify,
    activeFilter, dateFrom, dateTo, settledSearch, queryScope, previewCache, page, pageSize,
  ])

  function applyFilters() {
    setActiveFilter(draftFilters.status)
    setSettledSearch(draftFilters.search.trim())
    setDateFrom(draftFilters.from)
    setDateTo(draftFilters.to)
    setEditingStatus({})
    setPagination(current => current.page === 1 ? current : { ...current, page: 1 })
  }

  function clearFilters() {
    setDraftFilters({ status: PAYMENT_STATUS.PENDIENTE, search: '', from: '', to: '' })
    setActiveFilter(PAYMENT_STATUS.PENDIENTE)
    setSettledSearch('')
    setDateFrom('')
    setDateTo('')
    setEditingStatus({})
    setPagination(current => current.page === 1 ? current : { ...current, page: 1 })
  }

  const getPaymentPreview = useCallback((orderId) => previewCache.get(orderId), [previewCache])

  const prefetchPaymentPreview = useCallback((order) => {
    if (!canRead || !order?.id || writePending.current) return
    previewCache.get(order.id, { prefetch: true }).catch(() => {})
  }, [canRead, previewCache])

  const openPaymentEditor = useCallback((orderId) => {
    if (!canUpdatePaymentStatus || isUpdatingPaymentStatus) {
      setEditingStatus({})
      return
    }

    setEditingStatus((prev) => ({
      [orderId]: !prev[orderId],
    }))
  }, [canUpdatePaymentStatus, isUpdatingPaymentStatus])

  const closePaymentEditor = useCallback(() => {
    setEditingStatus({})
  }, [])

  const openPaymentActionConfirmation = useCallback(async (order, targetStatus) => {
    if (!canUpdatePaymentStatus || isUpdatingPaymentStatus) {
      setEditingStatus({})
      setPendingTransition(null)
      setCredentialsTransition(null)
      return
    }

    if (
      order.paymentStatus !== PAYMENT_STATUS.PENDIENTE &&
      targetStatus === PAYMENT_STATUS.PENDIENTE
    ) {
      setEditingStatus({})
      setPendingTransition(null)
      setCredentialsTransition(null)
      notify.warning('Un pago resuelto no puede volver al estado Pendiente.')
      return
    }

    if (order.paymentStatus === targetStatus) {
      setEditingStatus({})
      return
    }
    if (order.paymentStatus !== PAYMENT_STATUS.PENDIENTE && !canRevise) {
      notify.warning('No tienes permiso para revisar una decisión de pago resuelta.')
      return
    }

    const requestId = previewRequestId.current + 1
    previewRequestId.current = requestId
    setPendingTransition({ order, targetStatus })
    setEditingStatus({})
    setActionDetailsError(null)
    setIsLoadingActionDetails(true)

    try {
      const preview = await getPaymentPreview(order.id)

      if (previewRequestId.current !== requestId) return

      setPendingTransition((currentTransition) => {
        if (
          currentTransition?.order?.id !== order.id ||
          currentTransition?.targetStatus !== targetStatus
        ) {
          return currentTransition
        }

        return {
          ...currentTransition,
          order: mergePaymentPreview(currentTransition.order, preview),
        }
      })
    } catch (error) {
      if (previewRequestId.current !== requestId) return

      console.error('Error cargando detalle de pago:', error)
      setActionDetailsError(
        error?.payload?.message ??
          'No fue posible cargar la información completa del pedido.',
      )
    } finally {
      if (previewRequestId.current === requestId) {
        setIsLoadingActionDetails(false)
      }
    }
  }, [
    canUpdatePaymentStatus,
    isUpdatingPaymentStatus,
    getPaymentPreview,
    notify,
    canRevise,
  ])

  const closePaymentActionConfirmation = useCallback(() => {
    if (isUpdatingPaymentStatus) return

    previewRequestId.current += 1
    setPendingTransition(null)
    setActionDetailsError(null)
    setIsLoadingActionDetails(false)
  }, [isUpdatingPaymentStatus])

  const openCredentialsValidation = useCallback(() => {
    if (!pendingTransition || isLoadingActionDetails || actionDetailsError) return

    previewRequestId.current += 1
    setCredentialsTransition(pendingTransition)
    setPendingTransition(null)
    setActionDetailsError(null)
    setIsLoadingActionDetails(false)
  }, [actionDetailsError, isLoadingActionDetails, pendingTransition])

  const closeCredentialsValidation = useCallback(() => {
    if (isUpdatingPaymentStatus) return

    setCredentialsTransition(null)
  }, [isUpdatingPaymentStatus])

  const completeCredentialsValidation = useCallback(async (credentials) => {
    if (!canUpdatePaymentStatus || !credentialsTransition) {
      setCredentialsTransition(null)
      return
    }

    const wasUpdated = await handleUpdatePaymentStatus(
      credentialsTransition.order.id,
      credentialsTransition.targetStatus,
      credentials,
    )

    if (wasUpdated && mounted.current) {
      setCredentialsTransition(null)
      notify.success('Estado de pago actualizado correctamente.')
      setPreviewState((currentPreview) =>
        currentPreview?.order?.id === credentialsTransition.order.id
          ? null
          : currentPreview,
      )
    }
  }, [
    canUpdatePaymentStatus,
    credentialsTransition,
    handleUpdatePaymentStatus,
    notify,
  ])

  const openPaymentDetail = useCallback(async (order) => {
    if (!canRead) return
    const requestId = detailPreviewRequestId.current + 1
    detailPreviewRequestId.current = requestId
    setPreviewState({ order })
    setPreviewDetailsError(null)
    setIsLoadingPreviewDetails(true)

    try {
      const preview = await getPaymentPreview(order.id)

      if (detailPreviewRequestId.current !== requestId) return

      setPreviewState((currentPreview) => {
        if (currentPreview?.order?.id !== order.id) return currentPreview

        return {
          ...currentPreview,
          order: mergePaymentPreview(currentPreview.order, preview),
        }
      })
    } catch (error) {
      if (detailPreviewRequestId.current !== requestId) return

      console.error('Error cargando detalle de pago:', error)
      setPreviewDetailsError(
        error?.payload?.message ??
          'No fue posible cargar la información completa del pedido.',
      )
    } finally {
      if (detailPreviewRequestId.current === requestId) {
        setIsLoadingPreviewDetails(false)
      }
    }
  }, [canRead, getPaymentPreview])

  const closePaymentDetail = useCallback(() => {
    detailPreviewRequestId.current += 1
    setPreviewState(null)
    setPreviewDetailsError(null)
    setIsLoadingPreviewDetails(false)
  }, [])

  return (
    <PageShell className={styles.page}>
      <PageSurface className={styles.dashboardShell}>
        <PageHeader title="Confirmacion de pago" />

        <FilterContent>
          <PaymentFilters
            value={draftFilters}
            filters={FILTERS}
            getFilterCount={getFilterCount}
            onChange={next => setDraftFilters(current => ({ ...current, ...next }))}
            onApply={applyFilters}
            onClear={clearFilters}
            disabled={!canRead}
            loading={isLoading}
          />

          <div className={styles.results}>
            {loadError && (
              <div className={`alert alert-danger ${styles.stateMessage}`} role="alert">
                <span>{loadError}</span>
                <button
                  className="btn btn-sm btn-outline-danger"
                  onClick={loadPaymentData}
                  type="button"
                >
                  Reintentar
                </button>
              </div>
            )}
            {updateError && !credentialsTransition && <div className="alert alert-danger mb-0" role="alert">{updateError}</div>}

            <div className={styles.tableCard}>
              <PaymentOrdersTable
                canUpdatePaymentStatus={canUpdatePaymentStatus}
                editingStatus={editingStatus}
                isLoading={isLoading}
                isUpdatingPaymentStatus={isUpdatingPaymentStatus}
                onCloseEditor={closePaymentEditor}
                onPrefetchDetails={prefetchPaymentPreview}
                onSelectStatus={openPaymentActionConfirmation}
                onToggleEditor={openPaymentEditor}
                onViewDetail={openPaymentDetail}
                orders={filteredOrders}
              />

              {isLoading ? (
                <div className="d-lg-none"><LoadingIndicator context="pedidos de pago" /></div>
              ) : (
                <PaymentOrderMobileList
                  canUpdatePaymentStatus={canUpdatePaymentStatus}
                  editingStatus={editingStatus}
                  isUpdatingPaymentStatus={isUpdatingPaymentStatus}
                  onCloseEditor={closePaymentEditor}
                  onPrefetchDetails={prefetchPaymentPreview}
                  onSelectStatus={openPaymentActionConfirmation}
                  onToggleEditor={openPaymentEditor}
                  onViewDetail={openPaymentDetail}
                  orders={filteredOrders}
                />
              )}
              <PaymentPagination integrated page={page} pageSize={pageSize} total={getFilterCount(activeFilter)}
                visibleCount={isLoading ? 0 : filteredOrders.length}
                disabled={isLoading || isUpdatingPaymentStatus || !canRead || Boolean(loadError)}
                onPageChange={nextPage => {
                  if (nextPage === page) return
                  setIsLoading(true)
                  setEditingStatus({})
                  setPagination(current => ({ ...current, page: nextPage }))
                }}
                onPageSizeChange={nextSize => {
                  if (nextSize === pageSize) return
                  setIsLoading(true)
                  setEditingStatus({})
                  setPagination({ page: 1, pageSize: nextSize })
                }} />
            </div>
          </div>
        </FilterContent>
      </PageSurface>

      <PaymentActionConfirmModal
        detailsError={previewDetailsError}
        isLoadingDetails={isLoadingPreviewDetails}
        key={`detail-${previewState?.order?.id || 'closed'}`}
        mode="detail"
        onCancel={closePaymentDetail}
        order={previewState?.order}
      />

      <PaymentActionConfirmModal
        detailsError={actionDetailsError}
        isLoadingDetails={isLoadingActionDetails}
        isUpdating={isUpdatingPaymentStatus}
        onCancel={closePaymentActionConfirmation}
        onValidate={openCredentialsValidation}
        order={pendingTransition?.order}
        targetStatus={pendingTransition?.targetStatus}
      />

      {credentialsTransition && (
        <PaymentCredentialsModal
          key={`${credentialsTransition.order.id}:${credentialsTransition.targetStatus}`}
          isSubmitting={isUpdatingPaymentStatus}
          errorMessage={updateError}
          onCancel={closeCredentialsValidation}
          onConfirm={completeCredentialsValidation}
          order={credentialsTransition.order}
          targetStatus={credentialsTransition.targetStatus}
        />
      )}
    </PageShell>
  )
}

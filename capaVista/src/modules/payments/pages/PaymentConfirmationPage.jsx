import LoadingIndicator, { LoadingAction } from '../../../shared/components/loading/LoadingIndicator'
import { useToast } from '../../../shared/notifications/useToast'
import { operationFailureMessage, requiresContext, uncertainOperation } from '../../../shared/notifications/operationFeedback'
import { useCallback, useEffect, useRef, useState } from 'react'
import { PERMISSIONS } from '@/config/permissions'
import { PAYMENT_STATUS } from '@/config/status'
import { useAuth } from '@/hooks/useAuth'
import PaymentActionConfirmModal from '../components/PaymentActionConfirmModal'
import PaymentCredentialsModal from '../components/PaymentCredentialsModal'
import PaymentFilters from '../components/PaymentFilters'
import PaymentOrderMobileList from '../components/PaymentOrderMobileList'
import PaymentOrdersTable from '../components/PaymentOrdersTable'
import PaymentSummaryCards from '../components/PaymentSummaryCards'
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

export default function PaymentConfirmationPage() {
  const notify = useToast()
  const { hasPermission } = useAuth()
  const paymentsApi = usePaymentsApi()
  const [orders, setOrders] = useState([])
  const [counters, setCounters] = useState({ pending: 0, rejected: 0, confirmed: 0 })
  const [pageInfo, setPageInfo] = useState({ nextCursor: null, hasMore: false })
  const [loadingMore, setLoadingMore] = useState(false)
  const loadRequestId = useRef(0)
  const [paymentStatuses, setPaymentStatuses] = useState([])
  const [activeFilter, setActiveFilter] = useState(PAYMENT_STATUS.PENDIENTE)
  const [editingStatus, setEditingStatus] = useState({})
  const [pendingTransition, setPendingTransition] = useState(null)
  const [credentialsTransition, setCredentialsTransition] = useState(null)
  const [previewState, setPreviewState] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
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
  const paymentPreviewCache = useRef(new Map())
  const canUpdatePaymentStatus = hasPermission(PERMISSIONS.UPDATE_PAYMENT_STATUS)

  useEffect(() => {
    if (canUpdatePaymentStatus) return

    const resetTimer = window.setTimeout(() => {
      setEditingStatus({})
      setPendingTransition(null)
      setCredentialsTransition(null)
    }, 0)

    return () => window.clearTimeout(resetTimer)
  }, [canUpdatePaymentStatus])

  const loadPaymentData = useCallback(async () => {
    const requestId = ++loadRequestId.current
    setIsLoading(true)
    setLoadingMore(false)
    setLoadError(null)
    setUpdateError(null)

    try {
      const workspace = await paymentsApi.getPaymentWorkspace({ status: activeFilter, search: searchTerm.trim(), from: dateFrom, to: dateTo, limit: 50 })
      if (requestId !== loadRequestId.current) return
      const ordersResponse = workspace?.items
      const statusesResponse = workspace?.paymentStatuses

      setOrders(normalizePaymentOrders(ordersResponse))
      setCounters(workspace?.counts ?? { pending: 0, rejected: 0, confirmed: 0 })
      setPageInfo(workspace?.pageInfo ?? { nextCursor: null, hasMore: false })
      setPaymentStatuses(Array.isArray(statusesResponse) ? statusesResponse : [])
    } catch (error) {
      if (requestId !== loadRequestId.current) return
      console.error('Error cargando pagos:', error)
      setOrders([])
      setPaymentStatuses([])
      setLoadError(
        error?.payload?.message ??
          'No fue posible cargar los pedidos de pago.',
      )
    } finally {
      if (requestId === loadRequestId.current) setIsLoading(false)
    }
  }, [activeFilter, dateFrom, dateTo, paymentsApi, searchTerm])

  async function loadMorePayments() {
    if (!pageInfo.hasMore || !pageInfo.nextCursor || loadingMore || isLoading) return
    const requestId = loadRequestId.current
    setLoadingMore(true)
    try {
      const workspace = await paymentsApi.getPaymentWorkspace({ status: activeFilter, search: searchTerm.trim(), from: dateFrom, to: dateTo, limit: 50, cursor: pageInfo.nextCursor })
      if (requestId !== loadRequestId.current) return
      setOrders((current) => [...current, ...normalizePaymentOrders(workspace.items).filter((next) => !current.some((item) => item.id === next.id))])
      setPageInfo(workspace.pageInfo)
    } catch (error) {
      if (requestId === loadRequestId.current) setLoadError(error?.payload?.message ?? 'No fue posible cargar más pedidos de pago.')
    } finally {
      if (requestId === loadRequestId.current) setLoadingMore(false)
    }
  }

  useEffect(() => {
    const requests = loadRequestId
    const loadTimer = window.setTimeout(() => {
      loadPaymentData()
    }, 0)

    return () => { window.clearTimeout(loadTimer); requests.current++ }
  }, [loadPaymentData])

  const filteredOrders = orders

  const getFilterCount = useCallback(
    (filterKey) => {
      if (filterKey === PAYMENT_STATUS.PENDIENTE) return counters.pending
      if (filterKey === PAYMENT_STATUS.RECHAZADO) return counters.rejected
      if (filterKey === PAYMENT_STATUS.CONFIRMADO) return counters.confirmed

      return 0
    },
    [counters],
  )

  const handleUpdatePaymentStatus = useCallback(async (orderId, newStatus, credentials) => {
    if (!canUpdatePaymentStatus || isUpdatingPaymentStatus) return false

    const paymentStatusId = getPaymentStatusIdByName(paymentStatuses, newStatus)

    if (!paymentStatusId) {
      notify.error('No fue posible resolver el estado de pago seleccionado.')
      return false
    }

    setIsUpdatingPaymentStatus(true)
    setUpdateError(null)

    try {
      await paymentsApi.updatePaymentStatus(orderId, {
        pin: credentials.pin,
        paymentStatusId,
        observacion:
          credentials.comment ||
          `Cambio de estado a ${newStatus} desde modulo de pagos.`,
      })

      await loadPaymentData()

      setEditingStatus((prev) => ({ ...prev, [orderId]: false }))
      return true
    } catch (error) {
      const message = operationFailureMessage(error, 'No fue posible actualizar el estado de pago.')
      if (requiresContext(error) || uncertainOperation(error)) setUpdateError(message)
      else notify.error(message)
      return false
    } finally {
      setIsUpdatingPaymentStatus(false)
    }
  }, [
    canUpdatePaymentStatus,
    isUpdatingPaymentStatus,
    loadPaymentData,
    paymentStatuses,
    paymentsApi,
    notify,
  ])

  const handleFilterChange = useCallback((filterKey) => {
    setActiveFilter(filterKey)
    setEditingStatus({})
  }, [])

  const handleSearchChange = useCallback((nextSearchTerm) => {
    setSearchTerm(nextSearchTerm)
    setEditingStatus({})
  }, [])

  const handleDateFromChange = useCallback((nextDate) => {
    setDateFrom(nextDate)
    setEditingStatus({})
  }, [])

  const handleDateToChange = useCallback((nextDate) => {
    setDateTo(nextDate)
    setEditingStatus({})
  }, [])

  const clearDateRange = useCallback(() => {
    setDateFrom('')
    setDateTo('')
    setEditingStatus({})
  }, [])

  const getPaymentPreview = useCallback((orderId) => {
    const cachedRequest = paymentPreviewCache.current.get(orderId)
    if (cachedRequest) return cachedRequest

    const previewRequest = paymentsApi.getPaymentPreview(orderId).catch((error) => {
      if (paymentPreviewCache.current.get(orderId) === previewRequest) {
        paymentPreviewCache.current.delete(orderId)
      }

      throw error
    })

    paymentPreviewCache.current.set(orderId, previewRequest)
    return previewRequest
  }, [paymentsApi])

  const prefetchPaymentPreview = useCallback((order) => {
    if (!order?.id) return

    getPaymentPreview(order.id).catch(() => {})
  }, [getPaymentPreview])

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

    if (wasUpdated) {
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
  }, [getPaymentPreview])

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

        <div className={styles.summaryBoundary}>
          <PaymentSummaryCards counters={counters} />
        </div>

        <PaymentFilters
          activeFilter={activeFilter}
          dateFrom={dateFrom}
          dateTo={dateTo}
          filters={FILTERS}
          getFilterCount={getFilterCount}
          onClearDateRange={clearDateRange}
          onDateFromChange={handleDateFromChange}
          onDateToChange={handleDateToChange}
          onFilterChange={handleFilterChange}
          onSearchChange={handleSearchChange}
          searchTerm={searchTerm}
        />

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

        {isLoading ? (
          <LoadingIndicator context="pedidos de pago" />
        ) : (
          <>
            <PaymentOrdersTable
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
            {pageInfo.hasMore && <button disabled={loadingMore} onClick={loadMorePayments} type="button" aria-busy={loadingMore}><LoadingAction surface="light" busy={loadingMore} context="Cargar más pedidos">Cargar más pedidos</LoadingAction></button>}
          </>
        )}
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

import LoadingIndicator, { LoadingAction } from '../../../shared/components/loading/LoadingIndicator'
import {
  baseColumns,
  STAGE_BACKWARD_MESSAGE,
  STAGE_SKIP_MESSAGE,
  KANBAN_EN_PRODUCCION_STEP,
  MOVE_TO_PRODUCTION_PERMISSION_MESSAGE,
  KANBAN_REVISION_STEP,
} from '../utils/kanbanColumns.js';
import { normalizeOrder, normalizeStatus } from '../utils/kanbanOrderMapping.js';
import { normalizeText, isItemReadyForDelivery, isPaymentConfirmed, hasOrderLabel, sortOrdersForColumn } from '../utils/kanbanOrderRules.js';
import { DroppableColumn } from './DroppableColumn.jsx';
import { MoveToProductionModal } from './MoveToProductionModal.jsx';
import { useState, useEffect, useRef } from 'react';
import { useKanbanApi } from '../hooks/useKanbanApi';
import { useAuth } from '../../../hooks/useAuth';
import { applyOrderStagePatch } from '../utils/orderStagePatch';
import { PERMISSIONS } from '../../../config/permissions';
import styles from '../styles/Kanban.module.css';
import { useToast } from '../../../shared/notifications/useToast'
import { publicOperationMessage } from '../../../shared/notifications/operationFeedback'
import { DragDropProvider } from '@dnd-kit/react';
import KanbanCard from './KanbanCard';
import KanbanOffCanvas from './KanbanOffCanvas';
import KanbanDetailBoundary from './KanbanDetailBoundary.jsx';

function KanbanColumn({ filters, refreshKey = 0 }) {
  const notify = useToast()
  const [orders, setOrders] = useState([])
  const [columns, setColumns] = useState(baseColumns)
  const [loading, setLoading] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [detailScope, setDetailScope] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState(null)
  const detailRequestId = useRef(0)
  const [loadError, setLoadError] = useState(null)
  const [pageInfo, setPageInfo] = useState({ nextCursor: null, hasMore: false })
  const [loadingMore, setLoadingMore] = useState(false)
  const listRequestId = useRef(0)
  const morePending = useRef(false)
  const moveValidation = useRef(false)
  const moreController = useRef(null)
  const detailController = useRef(null)
  const moveController = useRef(null)
  const sessionVersion = useRef(0)
  const pendingLabels = useRef(new Set())
  const [busyLabels, setBusyLabels] = useState({ api: null, ids: new Set() })
  const [validatingMove, setValidatingMove] = useState(false)
  const [pendingProductionMove, setPendingProductionMove] = useState(null)
  const kanbanApi = useKanbanApi()
  const { hasPermission } = useAuth()
  const canFinishProduction = hasPermission(PERMISSIONS.MOVE_ORDERS)

  useEffect(() => {
    const requests = detailRequestId
    const version = sessionVersion
    const labels = pendingLabels.current
    return () => {
      requests.current++
      version.current++
      detailController.current?.abort()
      moveController.current?.abort()
      labels.clear()
    }
  }, [kanbanApi])

  useEffect(() => {
    const requests = listRequestId
    const id = ++requests.current
    const controller = new AbortController()
    const loadOrders = async () => {
      setLoading(true)
      setLoadingMore(false)
      morePending.current = false
      try {
        setLoadError(null)

        const orderWork = kanbanApi.getOrders({
          limit: 50,
          search: filters?.salesNoteNumber || filters?.clientName || '',
          productType: filters?.productType || '',
        }, { signal: controller.signal }).then(result => {
          if (controller.signal.aborted || id !== listRequestId.current) return
          const orderItems = result?.items ?? []
          const normalizedOrders = Array.isArray(orderItems)
            ? orderItems
                .filter((order) => order?.salesNoteNumber)
                .map(normalizeOrder)
                .filter((order) => Number(order.generalStepId) !== 4 && !['terminado', 'cancelado'].includes(normalizeText(order.orderStatus)))
            : []
          setOrders(normalizedOrders)
          setPageInfo(result?.pageInfo ?? { nextCursor: null, hasMore: false })
        }).catch(() => {
          if (!controller.signal.aborted && id === listRequestId.current) setLoadError('No fue posible cargar las ordenes.')
        }).finally(() => {
          if (!controller.signal.aborted && id === listRequestId.current) setLoading(false)
        })
        const statusWork = kanbanApi.getOrderStatuses().then(result => {
          if (controller.signal.aborted || id !== listRequestId.current) return
          if (!Array.isArray(result)) { setColumns(baseColumns); return }
          const normalizedStatuses = result
            .map(normalizeStatus)
            .filter((status) => Number(status.generalStepId) !== 4 && !['terminado', 'cancelado'].includes(normalizeText(status.title)))
            .sort((a, b) => a.order - b.order)

          setColumns(normalizedStatuses.length > 0 ? normalizedStatuses : baseColumns)
        }).catch(() => {
          if (!controller.signal.aborted && id === listRequestId.current) {
            setLoadError((current) => current || 'No fue posible cargar los estados del kanban.')
            setColumns(baseColumns)
          }
        })
        await Promise.allSettled([orderWork, statusWork])
      } catch {
        if (id !== listRequestId.current) return
        setLoadError('No fue posible cargar las ordenes.')
        setColumns(baseColumns)
      } finally {
        if (id === listRequestId.current) setLoading(false)
      }
    }

    loadOrders()
    return () => {
      requests.current++
      controller.abort()
      moreController.current?.abort()
      moveController.current?.abort()
    }
  }, [filters?.clientName, filters?.salesNoteNumber, filters?.productType, kanbanApi, refreshKey])

  async function loadMoreOrders() {
    if (!pageInfo.hasMore || !pageInfo.nextCursor || loading || morePending.current) return
    const id = listRequestId.current
    const controller = new AbortController()
    moreController.current = controller
    morePending.current = true
    setLoadingMore(true)
    try {
      const result = await kanbanApi.getOrders({
        limit: 50,
        cursor: pageInfo.nextCursor,
        search: filters?.salesNoteNumber || filters?.clientName || '',
        productType: filters?.productType || '',
      }, { signal: controller.signal })
      if (id !== listRequestId.current) return
      const nextOrders = (result.items ?? [])
        .filter((order) => order?.salesNoteNumber)
        .map(normalizeOrder)
        .filter((order) => Number(order.generalStepId) !== 4 && !['terminado', 'cancelado'].includes(normalizeText(order.orderStatus)))
      setOrders((current) => {
        const ids = new Set(current.map(item => item.id))
        return [...current, ...nextOrders.filter(next => {
          if (ids.has(next.id)) return false
          ids.add(next.id)
          return true
        })]
      })
      setPageInfo(result.pageInfo ?? { nextCursor: null, hasMore: false })
    } catch {
      if (id === listRequestId.current) setLoadError('No fue posible cargar más ordenes.')
    } finally {
      if (id === listRequestId.current) { morePending.current = false; setLoadingMore(false) }
    }
  }

  async function applyOrderMove(order, targetColumn, audit = {}) {
    const version = sessionVersion.current
    const patch = await kanbanApi.moveOrder(order.id, targetColumn.generalStepId, audit)
    if (version !== sessionVersion.current) return false
    setOrders((prevOrders) =>
      prevOrders.map((currentOrder) => applyOrderStagePatch(currentOrder, patch)).filter(item => Number(item.generalStepId) !== 4),
    )
    setSelectedOrder((currentOrder) => applyOrderStagePatch(currentOrder, patch))
    return true
  }

  async function handleDragEnd(event) {
    if (moveValidation.current || event.canceled || !hasPermission(PERMISSIONS.MOVE_ORDERS)) return

    const { source, target } = event.operation
    if (!source || !target) return

    const order = orders.find((currentOrder) => currentOrder.salesNoteNumber === source.id)
    const targetColumn = columns.find((column) => column.title === target.id)

    if (!order || !targetColumn || Number(order.generalStepId) === Number(targetColumn.generalStepId)) return

    const currentStep = Number(order.generalStepId)
    const targetStep = Number(targetColumn.generalStepId)
    if (targetStep === 3 && !canFinishProduction) {
      notify.warning('No tienes autorización para finalizar la producción.'); return
    }
    if (!((currentStep === 1 && targetStep === 2) || (currentStep === 2 && targetStep === 3) || (currentStep === 3 && targetStep === 4))) {
      notify.warning('Esta transición es automática o no está permitida.'); return
    }
    let transitionOrder = order
    if (targetStep === 3) {
      const version = listRequestId.current
      const controller = new AbortController()
      moveController.current = controller
      moveValidation.current = true
      setValidatingMove(true)
      try {
        transitionOrder = normalizeOrder(await kanbanApi.getOrderDetail(order.id, { precheck: true, signal: controller.signal }))
        if (controller.signal.aborted || version !== listRequestId.current) return
      }
      catch { if (version === listRequestId.current) notify.error('No fue posible validar el detalle del pedido.'); return }
      finally { if (moveController.current === controller) { moveValidation.current = false; setValidatingMove(false) } }
    }
    if (targetStep === 3 && (!transitionOrder.items?.length || transitionOrder.items.some((item) => !isItemReadyForDelivery(item)))) {
      notify.warning('Todos los detalles deben completar sus subprocesos y los lanyards deben llegar al 100% antes de pasar a Listo para Entrega.')
      return
    }
    const isForwardMove = targetStep > currentStep

    // Prechecks de UX; el backend vuelve a validar etapa, pago y permisos.
    if (targetStep < currentStep) {
      notify.warning(STAGE_BACKWARD_MESSAGE)
      return
    }

    if (targetStep !== currentStep + 1) {
      notify.warning(STAGE_SKIP_MESSAGE)
      return
    }

    if (isForwardMove && !isPaymentConfirmed(order)) {
      notify.warning('Debes confirmar el pago antes de mover esta orden.')
      return
    }

    if (isForwardMove && order.paymentDeconfirmationRequested) {
      notify.warning('Este pedido tiene una solicitud de desconfirmación pendiente.')
      return
    }

    const isMoveToProduction = isForwardMove && targetStep === KANBAN_EN_PRODUCCION_STEP

    if (isMoveToProduction && !hasPermission(PERMISSIONS.MOVE_KANBAN_TO_PRODUCTION)) {
      notify.warning(MOVE_TO_PRODUCTION_PERMISSION_MESSAGE)
      return
    }

    setPendingProductionMove({ order: transitionOrder, targetColumn, api: kanbanApi })
  }

  function handleUpdateOrder(updatedOrder) {
    setOrders((prevOrders) =>
      prevOrders.map((order) => (order.id === updatedOrder.id ? updatedOrder : order)),
    )
    setSelectedOrder(current => current?.id === updatedOrder.id ? updatedOrder : current)
  }

  async function openOrderDetail(order) {
    setDetailScope(kanbanApi)
    const requestId = ++detailRequestId.current
    detailController.current?.abort()
    const controller = new AbortController()
    detailController.current = controller
    setSelectedOrder(order)
    setDetailError(null)
    setDetailLoading(true)
    try {
      const detail = await kanbanApi.getOrderDetail(order.id, { signal: controller.signal })
      if (requestId === detailRequestId.current) setSelectedOrder(normalizeOrder(detail))
    } catch (error) {
      if (requestId === detailRequestId.current) setDetailError(error?.payload?.message ?? 'No fue posible cargar el detalle del pedido.')
    } finally {
      if (requestId === detailRequestId.current) setDetailLoading(false)
    }
  }

  function closeOrderDetail() {
    detailRequestId.current += 1
    detailController.current?.abort()
    setSelectedOrder(null)
    setDetailError(null)
    setDetailLoading(false)
  }

  async function handleToggleIndicator(orderId, indicator) {
    if (pendingLabels.current.has(orderId)) return
    const order = orders.find((item) => item.id === orderId)
    if (!order) return
    const config = {
      urgent: ['Urgencia', !order.isUrgent],
      contractPriority: ['Prioridad por contrato', !order.hasContractPriority],
      producing: ['PRODUCIÉNDOSE', !order.isProducing],
    }[indicator]
    if (!config) return
    const version = sessionVersion.current
    pendingLabels.current.add(orderId)
    setBusyLabels({ api: kanbanApi, ids: new Set(pendingLabels.current) })
    try {
      const result = await kanbanApi.setLabel(orderId, config[0], config[1])
      if (version !== sessionVersion.current) return
      const updatedLabels = result.labels ?? []
      const patchOrder = (current) => ({
        ...current,
        labels: updatedLabels,
        isUrgent: hasOrderLabel({ labels: updatedLabels }, ['Urgencia']),
        hasContractPriority: hasOrderLabel({ labels: updatedLabels }, ['Prioridad por contrato']),
        isProducing: hasOrderLabel({ labels: updatedLabels }, ['PRODUCIÉNDOSE', 'PRODUCIENDOSE']),
      })
      setOrders((current) => current.map((item) => item.id === orderId ? patchOrder(item) : item))
      setSelectedOrder((current) => current?.id === orderId ? patchOrder(current) : current)
      notify.success('Etiqueta del pedido actualizada correctamente.')
    } catch (error) {
      if (version === sessionVersion.current) notify.error(publicOperationMessage(error, 'No fue posible actualizar la etiqueta.'))
    } finally {
      if (version === sessionVersion.current) {
        pendingLabels.current.delete(orderId)
        setBusyLabels({ api: kanbanApi, ids: new Set(pendingLabels.current) })
      }
    }
  }

  async function confirmProductionMove(audit) {
    if (!pendingProductionMove || pendingProductionMove.api !== kanbanApi) return

    const { order, targetColumn } = pendingProductionMove
    if (await applyOrderMove(order, targetColumn, audit) === false) return
    setPendingProductionMove(null)
    notify.success('Etapa del pedido actualizada correctamente.')
  }

  async function handleCompleteSubprocess(order, item, process, payload) {
    const version = sessionVersion.current
    const updatedOrder = await kanbanApi.completeSubprocess(order.id, item.id, process.id, payload)
    if (version !== sessionVersion.current) return false
    const normalizedOrder = normalizeOrder(updatedOrder)
    setOrders(prevOrders => prevOrders.map(currentOrder => currentOrder.id === normalizedOrder.id ? normalizedOrder : currentOrder))
    setSelectedOrder(current => current?.id === normalizedOrder.id ? normalizedOrder : current)
    notify.success('Subproceso completado correctamente.')
    return true
  }

  async function handleSendToReview(order, comment) {
    const version = sessionVersion.current
    const updatedOrder = await kanbanApi.sendToReview(order.id, comment)
    if (version !== sessionVersion.current) return false
    handleUpdateOrder(normalizeOrder(updatedOrder))
    notify.success('Pedido enviado a revisión correctamente.')
    return true
  }

  async function handleFinishProduction(order, payload) {
    const finishingOrder = Number(order.generalStepId) === 3
    const patch = await kanbanApi.moveOrder(order.id, finishingOrder ? 4 : 3, payload)
    setOrders(current => current.map(item => applyOrderStagePatch(item, patch)).filter(item => Number(item.generalStepId) !== 4))
    setSelectedOrder(current => applyOrderStagePatch(current, patch))
    notify.success(finishingOrder ? 'Pedido terminado correctamente.' : 'Producción finalizada correctamente.')
    // The persisted stage is authoritative even if refreshing audit metadata fails.
    const requestId = ++detailRequestId.current
    kanbanApi.getOrderDetail(order.id).then(detail => {
      if (requestId === detailRequestId.current) setSelectedOrder(normalizeOrder(detail))
    }).catch(() => {})
  }

  async function handleCancelProduction(order, payload) {
    const version = sessionVersion.current
    await kanbanApi.cancelProduction(order.id, payload)
    if (version !== sessionVersion.current) return false
    setOrders((currentOrders) => currentOrders.filter((item) => item.id !== order.id))
    setSelectedOrder(current => current?.id === order.id ? null : current)
    notify.success('Producción cancelada correctamente.')
    return true
  }

  async function handleRollbackSubprocess(order, item, process, payload) {
    const version = sessionVersion.current
    const updated = await kanbanApi.rollbackSubprocess(order.id, item.id, process.id, payload)
    if (version !== sessionVersion.current) return false
    handleUpdateOrder(normalizeOrder(updated))
    notify.success('Subproceso retrocedido correctamente.')
    return true
  }

  async function handleReevaluate(order) {
    const version = sessionVersion.current
    const updated = normalizeOrder(await kanbanApi.reevaluate(order.id))
    if (version !== sessionVersion.current) return false
    handleUpdateOrder(updated)
    notify.success('Pedido reevaluado correctamente.')
    return true
  }

  return (
    <>
      {loadError && <div className={styles.kanbanError} role="alert">{loadError}</div>}
      {validatingMove && <LoadingIndicator scope="action" context="Validación del pedido antes del traslado" />}
      <DragDropProvider onDragEnd={handleDragEnd}>
        <div className={styles.kanbanWrapper}>
          {columns.map((column) => {
            const columnOrders = sortOrdersForColumn(
              orders.filter(
                (order) => Number(column.generalStepId) === Number(order.generalStepId),
              ),
              column,
              filters,
            )

            return (
              <DroppableColumn
                accent={column.accent}
                count={columnOrders.length}
                icon={column.icon}
                id={column.title}
                key={column.title}
              >
                {loading && <LoadingIndicator context="Pedidos de la columna" />}
                {!loading && columnOrders.length > 0
                  ? columnOrders.map((order) => (
                      <KanbanCard
                        isMoveBlocked={!isPaymentConfirmed(order)}
                        isCorrectionRequested={order.correctionRequested}
                        isPaymentDeconfirmationRequested={order.paymentDeconfirmationRequested}
                        isProducing={order.isProducing}
                        canMove={hasPermission(PERMISSIONS.MOVE_ORDERS) && (
                          [2, 3].includes(Number(order.generalStepId)) ||
                          (Number(order.generalStepId) === 1 && hasPermission(PERMISSIONS.START_PRODUCTION))
                        )}
                        canManageIndicators={hasPermission(PERMISSIONS.MANAGE_TAGS)}
                        indicatorsBusy={busyLabels.api === kanbanApi && busyLabels.ids.has(order.id)}
                        key={order.id}
                        onOpenDetail={() => openOrderDetail(order)}
                        onToggleIndicator={(indicator) => handleToggleIndicator(order.id, indicator)}
                        {...order}
                      />
                    ))
                  : !loading && <div className={styles.emptyColumn}>Arrastra una orden hacia esta columna.</div>}
              </DroppableColumn>
            )
          })}
        </div>
      </DragDropProvider>
      {pageInfo.hasMore && (
        <div className="d-flex justify-content-center mt-3">
          <button className="btn btn-outline-primary" disabled={loadingMore} onClick={loadMoreOrders} type="button" aria-busy={loadingMore}>
            <LoadingAction surface="light" busy={loadingMore} context="Cargar más pedidos">Cargar más pedidos</LoadingAction>
          </button>
        </div>
      )}
      <KanbanDetailBoundary key={selectedOrder?.id ?? 'closed'} onClose={closeOrderDetail}>
      <KanbanOffCanvas
        isOpen={detailScope === kanbanApi && selectedOrder !== null}
        isLoading={detailLoading}
        loadError={detailError}
        onClose={closeOrderDetail}
        onCompleteSubprocess={handleCompleteSubprocess}
        onFinishProduction={handleFinishProduction}
        canFinishProduction={canFinishProduction}
        canCompleteSubprocess={hasPermission(PERMISSIONS.UPDATE_SUBPROCESSES)}
        canReview={hasPermission(PERMISSIONS.REVIEW_ORDERS)}
        canRollbackSubprocess={hasPermission(PERMISSIONS.ROLLBACK_SUBPROCESSES)}
        canCancelProduction={hasPermission(PERMISSIONS.CANCEL_ORDERS)}
        canReevaluate={hasPermission(PERMISSIONS.REEVALUATE_ORDERS) && Number(selectedOrder?.generalStepId) === KANBAN_REVISION_STEP}
        onCancelProduction={handleCancelProduction}
        onRollbackSubprocess={handleRollbackSubprocess}
        onReevaluate={handleReevaluate}
        onSendToReview={handleSendToReview}
        order={detailScope === kanbanApi ? selectedOrder : null}
      />
      </KanbanDetailBoundary>
      <MoveToProductionModal
        isOpen={pendingProductionMove?.api === kanbanApi}
        onClose={() => setPendingProductionMove(null)}
        onConfirm={confirmProductionMove}
        order={pendingProductionMove?.order}
      />
    </>
  )
}

export default KanbanColumn

import { PRODUCT_ID, isValidLanyardCapacity } from '../../../../../shared/businessCatalog.js'
import FilterContent from '../../../shared/components/filters/FilterContent'
import LoadingIndicator, { LoadingAction } from '../../../shared/components/loading/LoadingIndicator'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import KanbanColumn from '../components/KanbanColumn'
import KanbanFilters from '../components/KanbanFilters'
import styles from './KanbanBoardPage.module.css'
import PageShell, { PageSurface } from '../../../shared/components/layout/PageShell'
import PageHeader from '../../../shared/components/layout/PageHeader'
import { useAuth } from '../../../hooks/useAuth'
import { PERMISSIONS } from '../../../config/permissions'
import { useKanbanApi } from '../hooks/useKanbanApi'
import { createProductionLoadRefresh } from '../utils/productionLoadRefresh.js'
import { updateLoadDraft, loadDraftConflicts, loadDraftEntries } from '../utils/productionLoadDrafts.js'
import { useToast } from '../../../shared/notifications/useToast'
import { operationFailureMessage, requiresContext, uncertainOperation } from '../../../shared/notifications/operationFeedback'

function toInteger(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : fallback
}

function formatDate(value) {
  if (!value) return 'Hoy'
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`)

  if (Number.isNaN(date.getTime())) return String(value)

  return new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

function normalizeLoad(result = {}) {
  if (!isValidLanyardCapacity(result.capacity)) {
    throw new Error('Configuración inconsistente: capacidad de Lanyard inválida.')
  }
  return {
    date: result.date ?? null,
    capacity: result.capacity,
    lanyardsInProduction: toInteger(result.lanyardsInProduction, 0),
    percentage: toInteger(result.percentage, 0),
    details: Array.isArray(result.details) ? result.details : [],
  }
}

function getEditableMax(detail) {
  return toInteger(detail.remainingQuantity) + toInteger(detail.dailyQuantity)
}

function getProgressPercentage(detail) {
  const percentage = Number(detail.progressPercentage ?? 0)

  return Number.isFinite(percentage) ? Math.round(percentage) : 0
}

export default function KanbanBoardPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedOrderId = searchParams.getAll('pedido').length > 1 ? '' : searchParams.get('pedido')
  function clearRequestedOrder() {
    setSearchParams(current => {
      const next = new URLSearchParams(current)
      next.delete('pedido')
      return next
    }, { replace: true })
  }
  const notify = useToast()
  const api = useKanbanApi()
  const { hasPermission } = useAuth()
  const [capacityApi, setCapacityApi] = useState(null)
  const isCapacityOpen = capacityApi === api
  const [draftCapacity, setDraftCapacity] = useState(null)
  const [capacityError, setCapacityError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [refreshingLoad, setRefreshingLoad] = useState({ api: null, busy: false })
  const isRefreshingLoad = refreshingLoad.api === api && refreshingLoad.busy
  const loadRefresh = useRef(null)
  const [savingCapacity, setSavingCapacity] = useState({ api: null, busy: false })
  const isSavingCapacity = savingCapacity.api === api && savingCapacity.busy
  const capacityPending = useRef(false)
  const operationScope = useRef(0)
  const [loadedCapacityApi, setLoadedCapacityApi] = useState(null)
  const isLoadingCapacity = loadedCapacityApi !== api
  const [appliedFilters, setAppliedFilters] = useState({})
  const [kanbanRefreshKey, setKanbanRefreshKey] = useState(0)
  const [loadSnapshot, setOperationalLoad] = useState({
    date: null,
    capacity: null,
    lanyardsInProduction: 0,
    percentage: 0,
    details: [],
  })
  const operationalLoad = loadedCapacityApi === api ? loadSnapshot : {
    date: null, capacity: null, lanyardsInProduction: 0, percentage: 0, details: [],
  }
  const [draftQuantities, setDraftQuantities] = useState({})
  const canManageProductionLoad =
    hasPermission(PERMISSIONS.MANAGE_PRODUCTION_LOAD) ||
    hasPermission(PERMISSIONS.MANAGE_CAPACITY)
  const loadLevel =
    operationalLoad.percentage > 100
      ? 'overloaded'
      : operationalLoad.percentage >= 71
        ? 'warning'
        : 'normal'
  const progressWidth = `${Math.min(operationalLoad.percentage, 100)}%`
  const draftDetails = useMemo(() => operationalLoad.details.map((detail) => ({
    ...detail,
    draftQuantity: draftQuantities[detail.detailId]?.quantity ?? toInteger(detail.dailyQuantity),
  })), [draftQuantities, operationalLoad.details])

  const draftConflict = loadDraftConflicts(draftQuantities, operationalLoad)[0]
  const refreshOperationalLoad = useCallback(() => {
    if (loadRefresh.current?.api === api) loadRefresh.current.controller.refresh()
  }, [api])

  useEffect(() => {
    let firstLoad = true
    const scope = operationScope
    const pending = capacityPending
    const refresh = loadRefresh
    const controller = createProductionLoadRefresh({
      read: async options => normalizeLoad(await api.getProductionLoad(options)),
      onPending: () => {
        setRefreshingLoad({ api, busy: true })
        if (firstLoad) {
          setOperationalLoad({ date: null, capacity: null, lanyardsInProduction: 0, percentage: 0, details: [] })
          setDraftQuantities({})
          setDraftCapacity(null)
          setCapacityError('')
          setLoadError('')
          firstLoad = false
        }
      },
      onLoad: nextLoad => {
        setOperationalLoad(nextLoad)
        setLoadError('')
      },
      onError: () => setLoadError('La carga operativa no está actualizada. Reintenta la consulta; los cambios de pedidos confirmados se mantienen.'),
      onSettled: () => {
        setLoadedCapacityApi(api)
        setRefreshingLoad({ api, busy: false })
      },
    })
    refresh.current = { api, controller }
    controller.refresh()
    return () => {
      controller.dispose()
      if (refresh.current?.controller === controller) refresh.current = null
      scope.current++
      pending.current = false
    }
  }, [api])

  function updateDraftQuantity(detail, rawValue) {
    const max = getEditableMax(detail)
    const value = Math.min(max, toInteger(rawValue))
    setDraftQuantities(current => updateLoadDraft(current, detail, value, operationalLoad.date))
    setCapacityError('')
  }

  async function saveDailyCapacity() {
    const capacity = Number(draftCapacity ?? operationalLoad.capacity)
    if (!isValidLanyardCapacity(capacity)) {
      notify.error('La capacidad debe ser un entero entre 1 y 10000.')
      return
    }
    if (capacityPending.current || isLoadingCapacity || isRefreshingLoad || loadError) return
    capacityPending.current = true
    const version = operationScope.current
    const resumeRefresh = loadRefresh.current.controller.suspend()
    setSavingCapacity({ api, busy: true })
    try {
      await api.updateCapacities([{ id: PRODUCT_ID.LANYARD, capacity }])
      if (version !== operationScope.current) return
      setDraftCapacity(null)
      notify.success('Capacidad de Lanyard guardada.')
    } catch (error) {
      if (version === operationScope.current) notify.error(operationFailureMessage(error, 'No fue posible guardar la capacidad.'))
    } finally {
      resumeRefresh()
      if (version === operationScope.current) {
        capacityPending.current = false
        setSavingCapacity({ api, busy: false })
      }
    }
  }

  async function saveProductionLoad(event) {
    event.preventDefault()
    if (capacityPending.current || isLoadingCapacity || isRefreshingLoad || loadError || draftConflict) return
    capacityPending.current = true
    const version = operationScope.current
    const resumeRefresh = loadRefresh.current.controller.suspend()
    setSavingCapacity({ api, busy: true })
    try {
      const entries = loadDraftEntries(draftQuantities, operationalLoad)
      const result = normalizeLoad(await api.updateProductionLoad(entries))
      if (version !== operationScope.current) return
      setOperationalLoad(result)
      setDraftQuantities({})
      setKanbanRefreshKey((current) => current + 1)
      setCapacityApi(null)
      setCapacityError('')
      notify.success('Carga operativa guardada correctamente.')
    } catch (error) {
      if (version !== operationScope.current) return
      const message = operationFailureMessage(error, 'No fue posible guardar la carga operativa.')
      if (requiresContext(error) || uncertainOperation(error)) setCapacityError(message)
      else notify.error(message)
    } finally {
      resumeRefresh()
      if (version === operationScope.current) {
        capacityPending.current = false
        setSavingCapacity({ api, busy: false })
      }
    }
  }

  return (
    <PageShell className={styles.page}>
      <PageSurface className={styles.dashboardShell}>
        <PageHeader title="Kanban" />

        <FilterContent>
          <div className={styles.filterToolbar}>
            <KanbanFilters
              onApplyFilters={(nextFilters) => setAppliedFilters(nextFilters)}
              onClearFilters={() => setAppliedFilters({})}
            />
            <aside className={`${styles.capacityMeter} ${styles[loadLevel]}`} aria-label="Carga Operativa">
              <div className={styles.capacityProgress}>
                <div className={styles.capacityTrack} role="progressbar" aria-label="Carga operativa del día"
                  aria-valuemin={0} aria-valuemax={100} aria-valuenow={isLoadingCapacity ? undefined : Math.min(operationalLoad.percentage, 100)}
                  aria-valuetext={isLoadingCapacity ? 'Cargando' : `${operationalLoad.percentage}%`}>
                  <span className={styles.capacityFill} style={{ width: progressWidth }} />
                </div>
                <div className={styles.capacityNumbers}>
                  <strong>{operationalLoad.lanyardsInProduction}</strong> / {operationalLoad.capacity ?? '—'} lanyards por día
                </div>
              </div>
              <strong className={styles.capacityPercentage}>{isLoadingCapacity ? <LoadingIndicator scope="action" surface="dark" context="Carga operativa" /> : operationalLoad.capacity ? `${operationalLoad.percentage}%` : 'No disponible'}</strong>
              {canManageProductionLoad && (
                <button className={styles.capacitySettings} aria-label="Configurar carga operativa" disabled={isLoadingCapacity} onClick={() => { setCapacityApi(api); refreshOperationalLoad() }} title="Configurar carga operativa" type="button">
                  <i className="bi bi-gear" aria-hidden="true" />
                </button>
              )}
            </aside>
          </div>
          {loadedCapacityApi === api && loadError && (
            <div className={styles.loadNotice} role="alert">
              <span>{loadError}</span>
              <button type="button" disabled={isRefreshingLoad} onClick={refreshOperationalLoad}>Reintentar carga operativa</button>
            </div>
          )}
          <KanbanColumn filters={appliedFilters} refreshKey={kanbanRefreshKey}
            onProductionLoadChange={refreshOperationalLoad}
            requestedOrderId={requestedOrderId}
            onClearRequestedOrder={clearRequestedOrder}
          />
        </FilterContent>
      </PageSurface>
      {isCapacityOpen && (
        <div className={styles.modalLayer} role="presentation">
          <form className={styles.capacityModal} onSubmit={saveProductionLoad} role="dialog" aria-modal="true" aria-labelledby="capacity-title">
            <header>
              <div>
                <span>Produccion</span>
                <h2 id="capacity-title">Carga diaria de Lanyard</h2>
              </div>
              <button disabled={isSavingCapacity} onClick={() => setCapacityApi(null)} type="button">
                <i className="bi bi-x-lg" aria-hidden="true" />
              </button>
            </header>
            <div className={styles.capacityFields}>
              <div className={styles.capacityModalSummary}>
                <span>{formatDate(operationalLoad.date)}</span>
                <strong>{operationalLoad.lanyardsInProduction} / {operationalLoad.capacity ?? '—'} lanyards asignados para la jornada</strong>
              </div>
              {isRefreshingLoad && <LoadingIndicator scope="action" context="Actualizando carga operativa" />}
              {loadError && <div role="alert">
                <p className={styles.capacityError}>{loadError}</p>
                <button type="button" disabled={isRefreshingLoad} onClick={refreshOperationalLoad}>Reintentar carga operativa</button>
              </div>}
              {draftConflict && <p className={styles.capacityError} role="alert">{draftConflict}</p>}
              {(Object.keys(draftQuantities).length > 0 || draftCapacity !== null) && (
                <button type="button" disabled={isSavingCapacity} onClick={() => {
                  setDraftQuantities({}); setDraftCapacity(null); setCapacityError('')
                }}>Descartar cambios pendientes</button>
              )}
              {hasPermission(PERMISSIONS.MANAGE_CAPACITY) && (
                <div className={styles.volumeControl}>
                  <label className={styles.volumeHeading}>
                    <span>Capacidad diaria de Lanyard</span>
                    <input type="number" min="1" max="10000" step="1"
                      value={draftCapacity ?? operationalLoad.capacity ?? ''}
                      onChange={event => setDraftCapacity(event.target.value)} disabled={isSavingCapacity} />
                  </label>
                  <button type="button" disabled={isSavingCapacity || isRefreshingLoad || !!loadError || !operationalLoad.capacity} onClick={saveDailyCapacity}>
                    Guardar capacidad
                  </button>
                </div>
              )}
              {draftDetails.length === 0 && (
                <p className={styles.capacityEmpty}>No hay detalles Lanyard en En produccion.</p>
              )}
              {draftDetails.map((detail) => {
                const max = getEditableMax(detail)
                const value = toInteger(detail.draftQuantity)
                const progressPercentage = getProgressPercentage(detail)

                return (
                  <label className={styles.volumeControl} key={detail.detailId}>
                    <span className={styles.volumeHeading}>
                      <i className="bi bi-box-seam" aria-hidden="true" />
                      <span className={styles.orderLoadInfo}>
                        <strong>Pedido numero: {detail.salesNoteNumber ?? `Detalle ${detail.detailId}`} / Cliente: {detail.clientName ?? 'Cliente sin nombre'}</strong>
                        <span>
                          <small>{detail.accumulatedQuantity} / {detail.quantity} producidos</small>
                          <small>{progressPercentage}%</small>
                        </span>
                      </span>
                      <input
                        aria-label={`Carga diaria para ${detail.salesNoteNumber ?? detail.detailId}`}
                        max={max}
                        disabled={isSavingCapacity}
                        min="0"
                        onChange={(event) => updateDraftQuantity(detail, event.target.value)}
                        step="1"
                        type="number"
                        value={value}
                      />
                    </span>
                    <span className={styles.sliderRow}>
                      <input
                        aria-label={`Selector de carga diaria para ${detail.salesNoteNumber ?? detail.detailId}`}
                        max={max}
                        disabled={isSavingCapacity}
                        min="0"
                        onChange={(event) => updateDraftQuantity(detail, event.target.value)}
                        step="1"
                        type="range"
                        value={value}
                      />
                    </span>
                    <span className={styles.sliderLimits}>
                      <small>0</small>
                      <small>{max}</small>
                    </span>
                  </label>
                )
              })}
              {capacityError && <p className={styles.capacityError} role="alert">{capacityError}</p>}
            </div>
            <footer>
              <button disabled={isSavingCapacity} onClick={() => setCapacityApi(null)} type="button">Cancelar</button>
              <button disabled={isSavingCapacity || isRefreshingLoad || !!loadError || !!draftConflict || draftDetails.length === 0} type="submit" aria-busy={isSavingCapacity}>
                <LoadingAction busy={isSavingCapacity} context="Confirmar carga">Confirmar carga</LoadingAction>
              </button>
            </footer>
          </form>
        </div>
      )}
    </PageShell>
  )
}

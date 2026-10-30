import FilterContent from '../../../shared/components/filters/FilterContent'
import LoadingIndicator from '../../../shared/components/loading/LoadingIndicator'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CalendarFilters from '../components/CalendarFilters'
import CalendarHeader from '../components/CalendarHeader'
import PageShell, { PageSurface } from '../../../shared/components/layout/PageShell'
import CalendarToolbar from '../components/CalendarToolbar'
import ProductionCalendarGrid from '../components/ProductionCalendarGrid'
import { useOrdersCalendarApi } from '../hooks/useOrdersCalendarApi'
import { loadCalendarMonth, loadUnscheduledOrders } from '../api/ordersCalendarApi'
import { getCalendarOrderQuantity, getCalendarOrderStatus } from '../utils/calendarOrder'
import styles from './ProductionCalendarPage.module.css'
import { calendarScope, mergeCalendarCollections, reconcileCalendarRead } from '../utils/calendarReads'
import { useToast } from '../../../shared/notifications/useToast'

const DEFAULT_FILTERS = Object.freeze({
  search: '',
  status: '',
  productType: '',
})

function toCalendarDateKey(value) {
  return value ? String(value).slice(0, 10) : ''
}

function monthRange(monthDate) {
  const year = monthDate.getFullYear()
  const month = monthDate.getMonth()
  const first = new Date(year, month, 1)
  const last = new Date(year, month + 1, 0)
  const key = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  return { from: key(first), to: key(last) }
}

function normalizeText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function getOrderProductNames(order) {
  const sourceItems = Array.isArray(order.items) ? order.items : []

  const productNames = sourceItems
    .map((item) => item.product)
    .filter(Boolean)

  return [...new Set([
    order.product,
    ...productNames,
  ].filter(Boolean))]
}

function normalizeCalendarOrder(order) {
  const productNames = getOrderProductNames(order)
  const items = (Array.isArray(order.items) ? order.items : []).map((item) => ({
    ...item,
    dueDate: toCalendarDateKey(item.dueDate),
  }))

  return {
    ...order,
    id: order.id,
    orderNumber: order.salesNoteNumber,
    clientName: order.clientName ?? 'Cliente sin nombre',
    productType: productNames[0] ?? 'Producto no definido',
    productTypes: productNames,
    quantity: getCalendarOrderQuantity(items),
    items,
    status: getCalendarOrderStatus(order),
    dueDate: toCalendarDateKey(order.dueDate),
  }
}

export default function ProductionCalendarPage() {
  const ordersCalendarApi = useOrdersCalendarApi()
  const [initialLoaded, setInitialLoaded] = useState(false)
  const handleInitialLoaded = useCallback(() => setInitialLoaded(true), [])
  return (
    <CalendarContent
      key={calendarScope(ordersCalendarApi)}
      ordersCalendarApi={ordersCalendarApi}
      initialLoaded={initialLoaded}
      onInitialLoaded={handleInitialLoaded}
    />
  )
}

function CalendarContent({ ordersCalendarApi, initialLoaded, onInitialLoaded }) {
  const notify = useToast()
  const active = useRef(false)
  const pendingReads = useRef(new Set())
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const [calendarItems, setCalendarItems] = useState([])
  const [unscheduledItems, setUnscheduledItems] = useState([])
  const [monthDate, setMonthDate] = useState(() => {
    const today = new Date()

    return new Date(today.getFullYear(), today.getMonth(), 1)
  })
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const currentMonth = useRef(monthDate)
  useEffect(() => { currentMonth.current = monthDate }, [monthDate])
  const [draftFilters, setDraftFilters] = useState(DEFAULT_FILTERS)
  const [draggedItemId, setDraggedItemId] = useState(null)
  const [loadedMonth, setLoadedMonth] = useState(null)
  const [loadedPendingApi, setLoadedPendingApi] = useState(null)
  const isLoading = loadedMonth !== monthDate || loadedPendingApi !== ordersCalendarApi

  useEffect(() => {
    if (!initialLoaded && loadedMonth !== null && loadedPendingApi === ordersCalendarApi) {
      onInitialLoaded?.()
    }
  }, [initialLoaded, loadedMonth, loadedPendingApi, ordersCalendarApi, onInitialLoaded])

  useEffect(() => {
    let isMounted = true
    const controller = new AbortController()
    const read = { overrides: new Map(), range: monthRange(monthDate) }
    const reads = pendingReads.current
    reads.add(read)

    async function loadOrders() {
      try {
        const orders = await loadCalendarMonth(ordersCalendarApi, read.range, () => isMounted, { signal: controller.signal })

        if (isMounted) {
          setCalendarItems(reconcileCalendarRead(Array.isArray(orders)
            ? orders
                .filter((order) => order?.salesNoteNumber)
                .map(normalizeCalendarOrder)
            : [], read.overrides, read.range))
        }
      } catch {
        if (isMounted) {
          notify.error('No fue posible cargar los pedidos compartidos del calendario.')
        }
      } finally {
        reads.delete(read)
        if (isMounted) setLoadedMonth(monthDate)
      }
    }

    loadOrders()

    return () => {
      isMounted = false
      reads.delete(read)
      controller.abort()
    }
  }, [monthDate, ordersCalendarApi, notify])

  useEffect(() => {
    let isMounted = true
    const controller = new AbortController()
    const read = { overrides: new Map(), range: { unscheduled: true } }
    const reads = pendingReads.current
    reads.add(read)
    loadUnscheduledOrders(ordersCalendarApi, () => isMounted, { signal: controller.signal })
      .then((orders) => {
        if (isMounted) setUnscheduledItems(reconcileCalendarRead(orders.filter((order) => order?.salesNoteNumber).map(normalizeCalendarOrder), read.overrides, read.range))
      })
      .catch(() => {
        if (isMounted) notify.error('No fue posible cargar los pedidos pendientes de fecha.')
      })
      .finally(() => { reads.delete(read); if (isMounted) setLoadedPendingApi(ordersCalendarApi) })
    return () => { isMounted = false; reads.delete(read); controller.abort() }
  }, [ordersCalendarApi, notify])

  useEffect(() => {
    if (!draggedItemId) return undefined

    function clearDraggedItem() {
      setDraggedItemId(null)
    }

    window.addEventListener('dragend', clearDraggedItem)
    window.addEventListener('drop', clearDraggedItem)

    return () => {
      window.removeEventListener('dragend', clearDraggedItem)
      window.removeEventListener('drop', clearDraggedItem)
    }
  }, [draggedItemId])

  const filteredItems = useMemo(() => {
    const normalizedSearch = normalizeText(filters.search)
    const normalizedProductType = normalizeText(filters.productType)

    return calendarItems.filter((item) => {
      const searchableProductNames = Array.isArray(item.productTypes) ? item.productTypes : [item.productType]
      const matchesSearch =
        normalizedSearch.length === 0 ||
        normalizeText([item.orderNumber, item.clientName, ...searchableProductNames].join(' ')).includes(normalizedSearch)
      const matchesStatus = !filters.status || item.status === filters.status
      const matchesProduct =
        !normalizedProductType ||
        searchableProductNames.some((productName) => normalizeText(productName) === normalizedProductType)

      return matchesSearch && matchesStatus && matchesProduct
    })
  }, [calendarItems, filters])

  function changeMonth(offset) {
    setMonthDate((currentDate) => new Date(currentDate.getFullYear(), currentDate.getMonth() + offset, 1))
  }

  function updateFilters(nextFilters) {
    setDraftFilters((currentFilters) => ({
      ...currentFilters,
      ...nextFilters,
    }))
  }

  async function updateItemDeliveryDate(itemId, nextDate, credentials) {
    const normalizedOrder = normalizeCalendarOrder(await ordersCalendarApi.updateDeliveryDate(itemId, nextDate, credentials))
    if (!active.current) return
    const overrides = new Map([[String(itemId), normalizedOrder]])
    for (const read of pendingReads.current) read.overrides.set(String(itemId), normalizedOrder)
    setCalendarItems(current => reconcileCalendarRead(current, overrides, monthRange(currentMonth.current)))
    setUnscheduledItems(current => reconcileCalendarRead(current, overrides, { unscheduled: true }))
  }

  if (!initialLoaded) {
    return <LoadingIndicator scope="page" context="Calendario de producción" />
  }

  async function getOrderDetail(orderId) {
    return normalizeCalendarOrder(await ordersCalendarApi.getOrderDetail(orderId))
  }

  return (
    <PageShell className={styles.page}>
      <PageSurface className={styles.dashboardShell}>
        <CalendarHeader />

        <FilterContent>
          <CalendarFilters
            filters={draftFilters}
            onChange={updateFilters}
            onApply={() => setFilters(draftFilters)}
            onClear={() => { setDraftFilters(DEFAULT_FILTERS); setFilters(DEFAULT_FILTERS) }}
          />

          <section className={styles.calendarPanel}>
            <ProductionCalendarGrid
              isLoading={isLoading}
              getOrderDetail={getOrderDetail}
              allItems={mergeCalendarCollections(calendarItems, unscheduledItems)}
              draggedItemId={draggedItemId}
              items={filteredItems}
              monthDate={monthDate}
              onChangeDeliveryDate={updateItemDeliveryDate}
              onDragEnd={() => setDraggedItemId(null)}
              onDragStart={setDraggedItemId}
              toolbar={<CalendarToolbar monthDate={monthDate} onNextMonth={() => changeMonth(1)} onPreviousMonth={() => changeMonth(-1)} onToday={() => {
                const today = new Date()
                setMonthDate(new Date(today.getFullYear(), today.getMonth(), 1))
              }} />}
            />
          </section>
        </FilterContent>
      </PageSurface>
    </PageShell>
  )
}

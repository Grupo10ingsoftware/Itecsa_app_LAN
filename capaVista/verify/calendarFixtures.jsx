import FilterContent from '../src/shared/components/filters/FilterContent'
import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { AuthContext } from '../src/app/providers/authContext'
import ToastProvider from '../src/shared/notifications/ToastProvider'
import PageShell, { PageSurface } from '../src/shared/components/layout/PageShell'
import CalendarHeader from '../src/modules/productionCalendar/components/CalendarHeader'
import CalendarToolbar from '../src/modules/productionCalendar/components/CalendarToolbar'
import CalendarFilters from '../src/modules/productionCalendar/components/CalendarFilters'
import ProductionCalendarGrid from '../src/modules/productionCalendar/components/ProductionCalendarGrid'
import styles from '../src/modules/productionCalendar/pages/ProductionCalendarPage.module.css'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap-icons/font/bootstrap-icons.css'
import '../src/styles/theme.css'
import '../src/styles/global.css'
import '../src/styles/bootstrap-overrides.css'

const auth = { user: { sub: 'calendar-preview' }, hasPermission: () => true }
const rows = Array.from({ length: 13 }, (_, index) => ({
  id: index + 1, orderNumber: String(24101 + index),
  clientName: index === 8 ? 'Cliente de prueba con una razón social extensa para comprobar el ajuste de textos' : `Cliente Demo ${String(index + 1).padStart(3, '0')}`,
  productTypes: index % 3 === 0 ? ['Tarjeta', 'Lanyard', 'Yoyo'] : ['Lanyard'],
  status: ['Confirmación de Pago', 'Listo para Producción', 'En producción', 'Listo para Entrega'][index % 4],
  dueDate: index < 6 ? `2026-10-${['02', '06', '08', '15', '19', '23'][index]}` : '',
  labels: index === 0 || index === 7 ? [{ name: 'Urgencia' }] : index === 3 || index === 8 ? [{ name: 'Prioridad por contrato' }, { name: 'Urgencia' }] : [],
}))

export function CalendarPreview() {
  const [monthDate, setMonthDate] = useState(new Date(2026, 9, 1))
  const [items, setItems] = useState(rows)
  const [draggedItemId, setDraggedItemId] = useState(null)
  const [draftFilters, setDraftFilters] = useState({ search: '', status: '', productType: '' })
  const [filters, setFilters] = useState({ search: '', status: '', productType: '' })
  const visible = items.filter(item => (!filters.search || `${item.clientName} ${item.orderNumber}`.toLowerCase().includes(filters.search.toLowerCase()))
    && (!filters.status || item.status === filters.status) && (!filters.productType || item.productTypes.includes(filters.productType)))
  return <PageShell className={styles.page}><PageSurface className={styles.dashboardShell}>
    <CalendarHeader />
    <FilterContent>
      <CalendarFilters filters={draftFilters} onChange={next => setDraftFilters(current => ({ ...current, ...next }))}
        onApply={() => setFilters(draftFilters)} onClear={() => {
          const empty = { search: '', status: '', productType: '' }
          setDraftFilters(empty); setFilters(empty)
        }} />
      <ProductionCalendarGrid allItems={items} items={visible} monthDate={monthDate} draggedItemId={draggedItemId}
        onDragStart={setDraggedItemId} onDragEnd={() => setDraggedItemId(null)} getOrderDetail={async id => items.find(item => item.id === id)}
        onChangeDeliveryDate={async (id, dueDate) => setItems(current => current.map(item => String(item.id) === String(id) ? { ...item, dueDate } : item))}
        toolbar={<CalendarToolbar monthDate={monthDate} onPreviousMonth={() => setMonthDate(date => new Date(date.getFullYear(), date.getMonth() - 1, 1))}
          onNextMonth={() => setMonthDate(date => new Date(date.getFullYear(), date.getMonth() + 1, 1))} onToday={() => { const now = new Date(); setMonthDate(new Date(now.getFullYear(), now.getMonth(), 1)) }} />} />
    </FilterContent>
  </PageSurface></PageShell>
}
createRoot(document.getElementById('root')).render(<AuthContext.Provider value={auth}><ToastProvider><CalendarPreview /></ToastProvider></AuthContext.Provider>)

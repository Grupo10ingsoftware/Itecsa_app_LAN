import { createRoot } from 'react-dom/client'
import { MetricsContent } from '../src/modules/metrics/pages/MetricsPage'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap-icons/font/bootstrap-icons.css'
import '../src/styles/theme.css'
import '../src/styles/global.css'
import '../src/styles/bootstrap-overrides.css'

// Development-only visual fixture. It never calls an API or uses real records.
const products = ['Yoyo', 'Lanyard', 'Credencial', 'Sticker', 'Pulsera', 'Otros'].map((productType, index) => ({ productType, quantity: [520, 860, 310, 480, 260, 190][index] }))
const duration = (name, hours, sampleSize, productType) => ({ name, averageSeconds: hours * 3600, sampleSize, productType })
const fixture = {
  production: { total: products.reduce((sum, product) => sum + product.quantity, 0), products },
  dwellTime: {
    stages: [duration('En producción', 67, 9), duration('Confirmación de pago', 74, 8), duration('En revisión', 50, 4), duration('Listo para producción', 29, 12), duration('Listo para entrega', 262, 6)],
    subprocesses: [duration('Corte', 17, 12, 'Lanyard'), duration('Ensamblado', 0, 4, 'Yoyo'), duration('Empaquetado', 0, 6, 'Lanyard'), duration('Impresión', 173, 7, 'Credencial'), duration('Sublimación', 38, 8, 'Lanyard'), duration('Costura', 18.5, 6, 'Lanyard'), duration('Revisión info', 43, 5, 'Credencial'), duration('Orden info', 106, 7, 'Credencial'), duration('Carga info', 18, 3, 'Credencial')],
  },
  sellerCompliance: Array.from({ length: 23 }, (_, index) => ({ seller: `Vendedor de prueba ${index + 1}`, salesNotes: index + 2, deliveredOnTime: index, deliveredLate: 1, enteredDuringHighLoad: 0 })),
}
const scenario = new URLSearchParams(window.location.search).get('scenario')
if (scenario === 'many') fixture.production.products = Array.from({ length: 25 }, (_, index) => ({ productType: `Producto con un nombre extenso ${index + 1}`, quantity: index * 11 }))
if (scenario === 'many') fixture.production.total = fixture.production.products.reduce((total, product) => total + product.quantity, 0)
const api = {
  getSummary: async () => {
    if (scenario === 'error') throw Error('Error de prueba')
    if (scenario === 'empty') return { production: { total: 0, products: [] }, dwellTime: { stages: [], subprocesses: [] }, sellerCompliance: [] }
    return fixture
  },
  getProductionPerformance: async ({ from, to }) => ({ period: { from, to }, totalOrders: 100, deliveredOnTime: 60, deliveredLate: 25, missingDeadline: 15 }),
}
createRoot(document.getElementById('root')).render(<MetricsContent api={api} />)

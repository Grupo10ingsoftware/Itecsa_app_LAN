export const EMPTY_METRICS_SUMMARY = Object.freeze({
  production: Object.freeze({ total: 0, products: Object.freeze([]) }),
  dwellTime: Object.freeze({ stages: Object.freeze([]), subprocesses: Object.freeze([]) }),
})

export function getCurrentMonth(today = new Date()) {
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
}

export function createInitialPeriod(today = new Date()) {
  return { mode: 'month', month: getCurrentMonth(today), from: '', to: '' }
}

function isValidDateInput(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return false

  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))

  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day
}

export function getPeriodQuery(period) {
  if (period?.mode === 'month') {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period.month ?? '')) {
      return {
        from: '',
        to: '',
        queryKey: '',
        validationMessage: 'Selecciona un mes para consultar las métricas.',
      }
    }

    const [year, month] = period.month.split('-').map(Number)
    const lastDay = new Date(year, month, 0).getDate()
    const from = `${period.month}-01`
    const to = `${period.month}-${String(lastDay).padStart(2, '0')}`

    return { from, to, queryKey: `${from}|${to}`, validationMessage: '' }
  }

  const from = period?.from ?? ''
  const to = period?.to ?? ''

  if (!from || !to) {
    return {
      from: '',
      to: '',
      queryKey: '',
      validationMessage: 'Selecciona las fechas Desde y Hasta para consultar las métricas.',
    }
  }

  if (!isValidDateInput(from) || !isValidDateInput(to)) {
    return {
      from: '',
      to: '',
      queryKey: '',
      validationMessage: 'El rango de fechas no es válido.',
    }
  }

  if (from > to) {
    return {
      from: '',
      to: '',
      queryKey: '',
      validationMessage: 'La fecha Desde no puede ser posterior a la fecha Hasta.',
    }
  }

  const days = (new Date(`${to}T00:00:00.000Z`) - new Date(`${from}T00:00:00.000Z`)) / 86400000 + 1
  if (days > 366) {
    return {
      from: '',
      to: '',
      queryKey: '',
      validationMessage: 'El intervalo de métricas no puede superar 366 días.',
    }
  }

  return { from, to, queryKey: `${from}|${to}`, validationMessage: '' }
}

export function buildProductionChart(production, colors) {
  const parsedTotal = Number(production?.total ?? 0)
  const total = Number.isFinite(parsedTotal) && parsedTotal > 0 ? parsedTotal : 0
  const products = Array.isArray(production?.products) ? production.products : []
  const palette = Array.isArray(colors) && colors.length > 0 ? colors : ['#64748b']
  const result = products.reduce((accumulator, product, index) => {
    const parsedQuantity = Number(product.quantity)
    const quantity = Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 0
    const percentage = total ? (quantity / total) * 100 : 0
    const segment = {
      ...product,
      percentage,
      start: accumulator.end,
      end: accumulator.end + percentage,
      color: palette[index % palette.length],
    }

    accumulator.segments.push(segment)
    return {
      end: segment.end,
      segments: accumulator.segments,
    }
  }, { end: 0, segments: [] })

  return { total, segments: result.segments }
}

const scopes = new WeakMap()
let nextScope = 0
export function getMetricsScope(api) {
  if (!scopes.has(api)) scopes.set(api, ++nextScope)
  return scopes.get(api)
}

// Only in-flight reads are shared within this API/session. No completed cache.
const pendingSummaries = new WeakMap()
export function subscribeMetricsSummary({ api, from, to, onSuccess, onError }) {
  let requests = pendingSummaries.get(api)
  if (!requests) { requests = new Map(); pendingSummaries.set(api, requests) }
  const key = `${from}|${to}`
  let entry = requests.get(key)
  if (!entry) {
    entry = { controller: new AbortController(), listeners: new Set() }
    requests.set(key, entry)
    queueMicrotask(async () => {
      if (!entry.listeners.size) return
      try {
        const result = await api.getSummary({ from, to, signal: entry.controller.signal })
        for (const listener of entry.listeners) listener.onSuccess(result)
      } catch (error) {
        if (!entry.controller.signal.aborted) for (const listener of entry.listeners) listener.onError(error)
      } finally {
        if (requests.get(key) === entry) requests.delete(key)
      }
    })
  }
  const listener = { onSuccess, onError }
  entry.listeners.add(listener)
  return () => {
    entry.listeners.delete(listener)
    queueMicrotask(() => {
      if (!entry.listeners.size) {
        entry.controller.abort()
        if (requests.get(key) === entry) requests.delete(key)
      }
    })
  }
}

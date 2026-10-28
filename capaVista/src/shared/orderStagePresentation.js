// Visual metadata only; never derives a business stage from scheduling or labels.
export const ORDER_STAGE_PRESENTATION = {
  0: { token: 'payment', short: 'Pago' },
  1: { token: 'ready', short: 'Listo prod.' },
  2: { token: 'production', short: 'Producción' },
  3: { token: 'delivery', short: 'Entrega' },
  6: { token: 'review', short: 'Revisión' },
}

const stepsByName = {
  'confirmacion de pago': 0,
  'listo para produccion': 1,
  'en produccion': 2,
  'listo para entrega': 3,
  'en revision': 6,
}

export function getOrderStagePresentation(name) {
  const normalized = String(name ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return ORDER_STAGE_PRESENTATION[stepsByName[normalized]] ?? { token: 'unknown', short: name || 'Sin etapa' }
}

export function getOrderStageAccent(step) {
  return `var(--stage-${ORDER_STAGE_PRESENTATION[step]?.token ?? 'unknown'}-accent)`
}

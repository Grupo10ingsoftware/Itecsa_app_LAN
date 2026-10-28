const options = { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: 'numeric' }
const dateFormatter = new Intl.DateTimeFormat('es-CL', options)
const timeFormatter = new Intl.DateTimeFormat('es-CL', { ...options, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

export function formatProfileDate(value, { includeTime = false } = {}) {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) return 'Fecha no disponible'
  const parts = (includeTime ? timeFormatter : dateFormatter).formatToParts(date)
  const part = (type) => parts.find((item) => item.type === type).value
  return `${part('day')}-${part('month')}-${part('year')}${includeTime ? ` ${part('hour')}:${part('minute')}` : ''}`
}

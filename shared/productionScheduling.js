export const PRODUCTION_SCHEDULE_REQUIRED_MESSAGE = 'No puedes iniciar la producción de este pedido porque aún no tiene una fecha programada. Asigna una fecha en el calendario de producción antes de continuar.';

// The calendar persists the order-level fecha_estimada_termino (DTO: dueDate).
// Dates on sales-note lines or production progress do not schedule the order.
export function hasValidProductionSchedule(value) {
  const text = value instanceof Date
    ? (Number.isFinite(value.getTime()) ? value.toISOString() : '')
    : value;
  if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/.test(text)) return false;
  const date = new Date(text);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text.slice(0, 10)
    && date.getUTCDay() !== 0 && date.getUTCDay() !== 6;
}

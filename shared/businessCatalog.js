// Functional catalog v1. IDs are contracts; capacity is an editable installation setting.
export const BUSINESS_CATALOG_VERSION = 1;
export const PRODUCT_ID = Object.freeze({ LANYARD: 1, TARJETA: 2, YOYO: 3 });
export const PRODUCT_TYPE = Object.freeze({ LANYARD: "Lanyard", TARJETA: "Tarjeta", YOYO: "Yoyo" });
export const DEFAULT_LANYARD_CAPACITY = 1200;
export const ORDER_STATUS_ID = Object.freeze({
  CONFIRMACION_PAGO: 1, LISTO_PRODUCCION: 2, EN_PRODUCCION: 3,
  LISTO_ENTREGA: 4, TERMINADO: 5, CANCELADO: 6, EN_REVISION: 7,
});
export const ORDER_STATUS = Object.freeze({
  CONFIRMACION_PAGO: "Confirmación de Pago", LISTO_PRODUCCION: "Listo para Producción",
  EN_PRODUCCION: "En producción", LISTO_ENTREGA: "Listo para Entrega",
  TERMINADO: "Terminado", CANCELADO: "Cancelado", EN_REVISION: "En revisión",
});
export const PRODUCT_FLOW = Object.freeze({
  1: Object.freeze([1, 2, 3, 4, 5]),
  2: Object.freeze([6, 7, 8, 9, 5]),
  3: Object.freeze([10, 5]),
});
export function isValidLanyardCapacity(value) {
  return Number.isInteger(value) && value >= 1 && value <= 10000;
}

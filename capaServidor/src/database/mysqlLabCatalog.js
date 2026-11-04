import { ORDER_STATUS, PAYMENT_STATUS } from "../config/status.js";
import { PRODUCT_TYPE } from "../modules/orders/service/salesNoteSource.service.js";
import { PRIORITY_LABEL } from "../modules/orders/service/salesOrderCreation.service.js";
import { DEFAULT_LANYARD_CAPACITY, PRODUCT_FLOW, BUSINESS_CATALOG_VERSION } from "../../../shared/businessCatalog.js";
export { BUSINESS_CATALOG_VERSION };

export const MYSQL_LAB_CATALOG = Object.freeze({
  paymentStatuses: Object.freeze([
    { id_estado_pago: 1, nombre_estado_pago: PAYMENT_STATUS.PENDIENTE },
    { id_estado_pago: 2, nombre_estado_pago: PAYMENT_STATUS.CONFIRMADO },
    { id_estado_pago: 3, nombre_estado_pago: PAYMENT_STATUS.RECHAZADO },
  ]),
  orderStatuses: Object.freeze([
    { id_estado_pedido: 1, nombre_etapa: ORDER_STATUS.CONFIRMACION_PAGO, orden_kanban: 0 },
    { id_estado_pedido: 2, nombre_etapa: ORDER_STATUS.LISTO_PRODUCCION, orden_kanban: 1 },
    { id_estado_pedido: 3, nombre_etapa: ORDER_STATUS.EN_PRODUCCION, orden_kanban: 2 },
    { id_estado_pedido: 4, nombre_etapa: ORDER_STATUS.LISTO_ENTREGA, orden_kanban: 3 },
    { id_estado_pedido: 5, nombre_etapa: ORDER_STATUS.TERMINADO, orden_kanban: 4 },
    { id_estado_pedido: 6, nombre_etapa: ORDER_STATUS.CANCELADO, orden_kanban: 5 },
    { id_estado_pedido: 7, nombre_etapa: ORDER_STATUS.EN_REVISION, orden_kanban: 6 },
  ]),
  productTypes: Object.freeze([
    { id_tipo_producto: 1, nombre_producto: PRODUCT_TYPE.LANYARD, capacidad_diaria: DEFAULT_LANYARD_CAPACITY },
    { id_tipo_producto: 2, nombre_producto: PRODUCT_TYPE.TARJETA, capacidad_diaria: null },
    { id_tipo_producto: 3, nombre_producto: PRODUCT_TYPE.YOYO, capacidad_diaria: null },
  ]),
  labels: Object.freeze([
    { id_etiqueta: 1, nombre_etiqueta: PRIORITY_LABEL.URGENT, esta_activa: 1 },
    { id_etiqueta: 2, nombre_etiqueta: PRIORITY_LABEL.CONTRACT, esta_activa: 1 },
  ]),
  subprocesses: Object.freeze([
    "Impresion", "Sublimacion", "Corte", "Costura", "Empaquetado",
    "Revision info", "Orden info", "Carga info", "Confeccion", "Ensamblado",
  ].map((nombre_estado, index) => ({ id_estado_subproceso: index + 1, nombre_estado }))),
  productSubprocesses: Object.freeze(Object.entries(PRODUCT_FLOW).flatMap(([product, steps]) =>
    steps.map((id_estado_subproceso, index) => ({
      id_tipo_producto: Number(product), id_estado_subproceso, orden_flujo: index + 1,
    })))),
});

export const MYSQL_LAB_CATALOG_DIAGNOSTICS = Object.freeze([]);

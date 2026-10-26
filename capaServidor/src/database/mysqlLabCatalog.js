import { ORDER_STATUS, PAYMENT_STATUS } from "../config/status.js";
import { PRODUCT_TYPE } from "../modules/orders/service/salesNoteSource.service.js";
import { PRIORITY_LABEL } from "../modules/orders/service/salesOrderCreation.service.js";
import { LANYARD_DAILY_CAPACITY } from "../modules/productionLoad/repo/productionLoad.repo.js";

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
    { id_estado_pedido: 5, nombre_etapa: ORDER_STATUS.ENTREGADO, orden_kanban: 4 },
    { id_estado_pedido: 6, nombre_etapa: ORDER_STATUS.CANCELADO, orden_kanban: 5 },
    { id_estado_pedido: 7, nombre_etapa: ORDER_STATUS.EN_REVISION, orden_kanban: 6 },
  ]),
  productTypes: Object.freeze([
    { id_tipo_producto: 1, nombre_producto: PRODUCT_TYPE.YOYO, capacidad_diaria: null },
    { id_tipo_producto: 2, nombre_producto: PRODUCT_TYPE.LANYARD, capacidad_diaria: LANYARD_DAILY_CAPACITY },
    { id_tipo_producto: 3, nombre_producto: PRODUCT_TYPE.TARJETA, capacidad_diaria: null },
  ]),
  labels: Object.freeze([
    { id_etiqueta: 1, nombre_etiqueta: PRIORITY_LABEL.URGENT, esta_activa: 1 },
    { id_etiqueta: 2, nombre_etiqueta: PRIORITY_LABEL.CONTRACT, esta_activa: 1 },
  ]),
  subprocesses: Object.freeze([
    { id_estado_subproceso: 1, nombre_estado: "Impresión" },
    { id_estado_subproceso: 2, nombre_estado: "Corte" },
    { id_estado_subproceso: 3, nombre_estado: "Empaquetado" },
  ]),
  productSubprocesses: Object.freeze([
    ...[1, 2, 3].map((id_estado_subproceso, index) => ({ id_tipo_producto: 2, id_estado_subproceso, orden_flujo: index + 1 })),
    ...[1, 2, 3].map((id_estado_subproceso, index) => ({ id_tipo_producto: 3, id_estado_subproceso, orden_flujo: index + 1 })),
  ]),
});

export const MYSQL_LAB_CATALOG_DIAGNOSTICS = Object.freeze([
  Object.freeze({
    code: "YOYO_WITHOUT_VERSIONED_SUBPROCESS_FLOW",
    message: "Yoyo no tiene una relación Producto_Subproceso versionada; una línea nueva conserva id_estado_subproceso=null.",
  }),
]);

# Finalización de producción y PIN de Notas de Venta

Implementación: 27 de octubre de 2026.

## Decisiones y reutilización

- El cierre productivo usa la transición existente `En produccion` (orden Kanban 2) → `Listo para entrega` (3). Listo para entrega permanece en el Kanban; no equivale a Terminado.
- En Listo para entrega, la sección verde ofrece **Finalizar pedido**. Solicita el PIN con el modal sencillo existente y pasa explícitamente al estado de catálogo **Terminado**. El backend revalida permisos, PIN, etapa y subprocesos; estado e historial se guardan en la misma transacción. Cada cierre exitoso registra pedido, responsable, fecha/hora y transición, sin duplicar registros por reintentos. La tarjeta desaparece del Kanban y permanece consultable en el historial.
- Se reutilizan `PATCH /orders/:orderId/move`, `requireCapability`, `requirePin`, `PinService`, `runInTransaction`, `lockProductionOrder`, `transitionGeneralStage`, los registros de etapas y la notificación existente de pedido listo.
- La finalización respeta la política existente de `move:orders`: Operario Producción, Administrador Producción y Desarrollador, siempre que la sesión incluya esa capacidad. Se eliminó una restricción adicional por nombre de rol que ocultaba el botón a Desarrollador. No se modifica la matriz de permisos; PIN y autorización del backend siguen siendo obligatorios.
- El tablero activo conserva la etapa 3 y excluye la etapa terminal 4 y los estados Terminado/Cancelado antes de paginar. Terminado se consulta en el historial. Se retiró la opción adicional de consultar finalizados del Kanban.
- Se reutilizan `PinAuthorizationModal`, `PinModal`, `PinField`, `PinActions`, `useToast` y `operationFailureMessage`. La opción `feedbackMode="toast"` solo se activa en las dos acciones nuevas; los demás consumidores conservan el comportamiento anterior.
- El registro conserva la confirmación previa del formulario y después pide un PIN sin observación. El PIN se envía con la petición protegida; no se conserva una autorización reutilizable entre operaciones.
- La búsqueda previa de Nota de Venta obtiene una vista de la fuente; no crea pedidos, clientes ni detalles. Se conserva la auditoría de seguridad existente de consultas. No hay una carga de archivos previa al registro en este flujo.
- `POST /orders` valida permisos y PIN antes del controlador. El middleware elimina el PIN del cuerpo antes de ejecutar la creación. El responsable proviene de `req.pinActor`.
- No se modifican el esquema, las migraciones ni las dependencias. No hay cierres automáticos ni borrado de pedidos.

## Archivos de implementación

Rutas relativas a la raíz del repositorio:

| Archivo | Propósito |
| --- | --- |
| `capaServidor/src/modules/orders/routes/order.routes.js` | Exigir el middleware de PIN en el registro. |
| `capaServidor/src/modules/orders/controller/orders.controller.js` | Pasar el responsable validado por PIN a la creación existente. |
| `capaServidor/src/modules/orders/service/orderProduction.service.js` | Restringir roles del cierre, rechazar cierres repetidos y registrar una observación de cambio de estado, conservando comentarios anteriores. |
| `capaServidor/src/modules/orders/repo/orderStageOperations.js` | Revalidar etapa y pago bajo bloqueo; exigir detalles con flujo configurado, fecha de término y último subproceso; exigir 100% para lanyards. Reutilizar actualización condicional e historial transaccional. |
| `capaServidor/src/modules/orders/repo/orderViewOperations.js` | Mantener Listo para entrega en consultas activas, excluir Terminado y leer fecha y responsable del cierre desde el historial existente. |
| `capaServidor/src/modules/orders/dto/order.dto.js` | Exponer los datos mínimos del cierre en el detalle. |
| `capaVista/src/modules/kanban/components/KanbanOffCanvas.jsx` | Sección de finalización entre resumen y subprocesos, autorización sencilla y estado del cierre. |
| `capaVista/src/modules/kanban/components/KanbanColumn.jsx` | Ejecutar el cierre, mantener la tarjeta en Listo para entrega, refrescar el detalle, aplicar permisos y excluir Terminado. |
| `capaVista/src/modules/kanban/styles/Kanban.module.css` | Presentación verde de la sección de finalización. |
| `capaVista/src/modules/kanban/utils/kanbanOrderMapping.js` | Conservar los metadatos del cierre en el modelo visual. |
| `capaVista/src/hooks/useOrderCreateFlow.js` | Separar confirmación de autorización; preservar borrador y payload ante fallo/cancelación; impedir envíos repetidos. |
| `capaVista/src/modules/orders/pages/OrderCreatePage.jsx` | Montar el modal de PIN sencillo antes del registro. |
| `capaVista/src/shared/components/pin/PinAuthorizationModal.jsx` | Añadir manejo de errores por Toast como opción sin modificar el comportamiento predeterminado. |

## Pruebas

Archivos nuevos:

- `capaServidor/test/productionCompletion.test.js`: transición y auditoría, estados incompatibles, subprocesos pendientes o ausentes, lanyard incompleto, permisos, PIN obligatorio, estado obsoleto, concurrencia, filtros de consulta y protección HTTP de ambas operaciones.
- `capaVista/src/hooks/useOrderCreateFlow.test.jsx`: ausencia de escritura antes del PIN, cancelación, conservación del borrador, reintento con PIN nuevo y prevención de doble envío.
- `capaVista/src/modules/kanban/components/ProductionCompletion.test.jsx`: botón y elegibilidad, PIN sencillo, cancelación, doble envío, Toast de error, permisos y datos de cierre.

Pruebas existentes adaptadas:

- `capaVista/src/modules/kanban/components/KanbanLoading.test.jsx`: identidad del operario, permanencia de Listo para entrega tras el cierre y exclusión de Terminado.
- `capaVista/src/shared/notifications/NotificationMigration.test.jsx`: confirmación seguida de PIN y errores delegados al modal.

Resultados:

- Finalizar pedido: **16/16 pruebas backend**, **19/19 pruebas frontend de Kanban** y lint aprobados, incluidos PIN previo, cambio explícito a Terminado, retiro de la tarjeta e historial único ante solicitudes simultáneas.

- Corrección de visibilidad: **14/14 pruebas backend**, **18/18 pruebas frontend de Kanban** y lint aprobados. Verifican que cerrar producción conserva la tarjeta en Listo para entrega y que Terminado se excluye del tablero.

- Backend: `node --test test/productionCompletion.test.js test/phase1Security.test.js`: **21/21 aprobadas**. Incluye pruebas existentes de JWT, identidad, autorización y bloqueo de PIN.
- Frontend dirigido: siete archivos (los nuevos y las suites de KanbanLoading, PinModals, PinAuthorizationModal, NotificationMigration y UserCreateForm): **46/46 aprobadas**.
- `npm.cmd run lint`: aprobado.
- `npm.cmd run build`: aprobado.
- `git diff --check`: aprobado.
- La suite completa de frontend no está totalmente verde: dos casos de `PageMigration.test.jsx` buscan el texto «Puedes crear usuarios y editar sus datos», ausente del componente de Gestión de usuarios también en HEAD. Estos archivos no se modificaron.
- Una ejecución amplia adicional presentó un fallo intermitente de accesibilidad en `UserCreateForm.test.jsx` al buscar «Conciliar preparacion»; el mismo archivo pasó en la ejecución dirigida. No se modificó ese módulo para ocultar el fallo.

## Alcance de la verificación y revisión manual

Las pruebas de persistencia y concurrencia nuevas emplean dobles de repositorio; las pruebas HTTP usan Express local. No se ejecutó una prueba integral contra una instancia real de MySQL y Keycloak ni una revisión visual en navegador autenticado.

Validar en el entorno de integración: cerrar un pedido real con dos sesiones simultáneas, comprobar una sola entrada de historial y la notificación, recargar el tablero y verificar que sigue en Listo para entrega. Comprobar que un pedido Terminado aparece en el historial y no en el Kanban. Probar también un registro real de Nota de Venta con PIN incorrecto, cancelación y PIN válido, verificando sus relaciones y auditoría.

Un pedido histórico que ya esté en etapa 3 o 4 muestra su estado aunque no tenga disponible un registro de entrada en etapa 3; fecha y responsable se presentan únicamente cuando existen. Los pedidos antiguos todavía en etapa 2 requieren cierre manual.

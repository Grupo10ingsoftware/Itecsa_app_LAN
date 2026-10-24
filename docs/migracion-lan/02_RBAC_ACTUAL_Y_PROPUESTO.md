# RBAC actual verificado y propuesta de nueve roles

Revisión estática 24-10-2026 sobre `34dfd7c09f876285c1ea84d9020a44a1414ba468`. **La matriz propuesta no está aprobada ni aplicada.** Fuente canónica: `shared/authorization.js:1-55`; reexports en `capaServidor/src/config/roles.js`, `capaVista/src/config/roles.js` y permisos de UI en `capaVista/src/config/permissions.js`.

## 1. Contrato actual y nombres exactos

| Clave técnica | Valor token / BD | Función actual y alcance de gestión |
| --- | --- | --- |
| ADMINISTRADOR | Administrador Produccion | Gestión de Producción; administra solo administrador/operario de Producción |
| ADMIN_VENTAS | Administrador Ventas | Gestión de Ventas; administra solo administrador/operario de Ventas |
| ADMIN_COBRANZAS | Administrador Cobranzas | Gestión de Cobranzas; administra solo administrador/operario de Cobranzas |
| PRODUCCION | Operario Produccion | Operación de producción; no administra cuentas |
| VENTAS | Operario Ventas | Operación de ventas; no administra cuentas |
| COBRANZAS | Operario Cobranzas | Operación de cobranzas; no administra cuentas |
| GERENCIA | Gerencia | Lectura común y métricas; no administra cuentas |
| SOPORTE | Soporte | Rol técnico actual con **las 25 capacidades** y gestión de los siete roles funcionales; no crea/gestiona otro Soporte mediante el flujo funcional |

Las etiquetas visibles agregan tildes a Producción; no son otros valores de identidad. Los siete roles funcionales excluyen al Soporte técnico. `ADMIN_ROLES` incluye tres administradores y Soporte. No hay rol Desarrollador implementado ni nuevo Soporte restringido.

`roleFromPayload` exige exactamente un rol reconocido en `https://itecsa.local/roles`. `can` exige pertenencia a `ROLE_PERMISSIONS[rol]` y presencia en `payload.permissions`. El browser no decide la autoridad efectiva. `requireCapability(...capacidades)` permite cualquiera de las capacidades recibidas; no todas simultáneamente. No confundir ese OR con omisión de la intersección rol/token.

### Matriz actual de 25 capacidades

AP = Administrador Produccion; AV = Administrador Ventas; AC = Administrador Cobranzas; OP = Operario Produccion; OV = Operario Ventas; OC = Operario Cobranzas; G = Gerencia; ST = Soporte técnico actual. Sí/— expresa pertenencia al catálogo; **todavía se requiere permiso emitido, estado local y controles de operación**.

| Capacidad | AP | AV | AC | OP | OV | OC | G | ST |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `read:own-profile` | Sí | Sí | Sí | Sí | Sí | Sí | Sí | Sí |
| `manage:own-pin` | Sí | Sí | Sí | Sí | Sí | Sí | Sí | Sí |
| `read:orders` | Sí | Sí | Sí | Sí | Sí | Sí | Sí | Sí |
| `read:production-capacity` | Sí | Sí | Sí | Sí | Sí | Sí | Sí | Sí |
| `read:own-messages` | Sí | Sí | Sí | Sí | Sí | Sí | Sí | Sí |
| `update:own-messages` | Sí | Sí | Sí | Sí | Sí | Sí | Sí | Sí |
| `manage:users` | Sí | Sí | Sí | — | — | — | — | Sí |
| `read:sales-notes` | — | Sí | — | — | Sí | — | — | Sí |
| `create:orders` | — | Sí | — | — | Sí | — | — | Sí |
| `reevaluate:orders` | — | Sí | — | — | Sí | — | — | Sí |
| `read:payments` | — | — | Sí | — | — | Sí | — | Sí |
| `update:payment-status` | — | — | Sí | — | — | Sí | — | Sí |
| `revise:payment-status` | — | — | Sí | — | — | — | — | Sí |
| `move:orders` | Sí | — | — | Sí | — | — | — | Sí |
| `start:production` | Sí | — | — | — | — | — | — | Sí |
| `update:production-subprocesses` | Sí | — | — | Sí | — | — | — | Sí |
| `rollback:production-subprocesses` | Sí | — | — | — | — | — | — | Sí |
| `manage:production-capacity` | Sí | — | — | — | — | — | — | Sí |
| `manage:production-load` | Sí | — | — | — | — | — | — | Sí |
| `manage:order-tags` | Sí | — | — | — | — | — | — | Sí |
| `review:orders` | Sí | — | — | — | — | — | — | Sí |
| `cancel:orders` | Sí | — | — | — | — | — | — | Sí |
| `read:production-calendar` | Sí | Sí | — | — | Sí | — | — | Sí |
| `update:order-delivery-date` | Sí | — | — | — | — | — | — | Sí |
| `view:metrics` | Sí | — | — | — | — | — | Sí | Sí |


## 2. Aplicación de controles: frontend, API y negocio

| Superficie | Regla actual verificada | Evidencia | Efecto requerido en la migración |
| --- | --- | --- | --- |
| Sesión y rutas privadas | verify backend, mismo sujeto/generación, estado autenticado | AuthProvider.jsx:40-162; ProtectedRoute.jsx:8-69 | Preservar controles y acuse PIN |
| Menú y administración SPA | permiso + roles administrativos; piloto oculta/redirige gestión | router.jsx:89-102; NavigationMenu.jsx:18-27 | Nueva política en rutas/menú, además de backend |
| Kanban | read:orders; controles por capacidad dentro de componentes | router.jsx:55-61; KanbanBoardPage.jsx | Conservar acciones disponibles por rol |
| Ventas / nueva orden | create:orders; reevaluación exige reevaluate:orders | router.jsx:73-82; order.routes.js; requireSalesRole.js | No extender por ser Soporte nuevo |
| Pagos | read:payments; modificar exige update:payment-status | router.jsx:64-72; order.routes.js | Preservar PIN y estados |
| Revisión pago resuelto | revise:payment-status además de update y reglas de estado | orderPayment.service.js:8-166 | No equiparar una lectura con autorización de revisión |
| Inicio de producción | start:production además de transición, pago y PIN | orderProduction.service.js:27-129 | Conservar autoridad de inicio y denegaciones |
| Subprocesos | update/rollback:production-subprocesses y PIN | order.routes.js; orderProduction.service.js | No confundir avance con retroceso |
| Cancelar / fecha entrega | cancel:orders o update:order-delivery-date, respectivamente, y PIN | order.routes.js | Conservar motivo, actor e histórico |
| Capacidad y carga | read/manage capacity; carga admite manage:production-load o manage:production-capacity | productionCapacity.routes.js; productionLoad.routes.js | Preservar OR actual y reglas de negocio |
| Historial | read:orders; datos financieros condicionados a read:payments | orderHistory.controller.js:5-8,27-42 | Un rol con historial no obtiene pagos implícitamente |
| Métricas | view:metrics; UI lista AP/G/ST | router.jsx:105-114; metrics.routes.js | Añadir nombre Desarrollador donde corresponda solo tras aprobar matriz |
| Perfil/PIN | read:own-profile / manage:own-pin; sujeto del JWT | auth.routes.js; auth.controller.js | Usuario solo opera su identidad |
| Mensajes | read/update:own-messages y pertenencia por id_usuario | message.routes.js:12-17; message.service.js:45-165 | Nuevo Soporte solo recibe avisos autorizados |
| Privacidad/incidentes | sesión activa, cuota y validación propios | privacy.routes.js; incidentReport.routes.js | Conservar canales; no atribuirles capacidad inventada |
| Gestión usuarios | manage:users + alcance objetivo; PIN en PATCH | adminUsers.routes.js:31-76; adminUsers.controller.js:26-31,203-436 | Denegar directamente API a administradores departamentales en propuesta |
| Auditoría técnico | Todos los requests del Soporte actual; mutaciones administrativas de otros roles | supportAudit.js:5-31 | Separar eventos Desarrollador, Soporte y administración sin perder actor |

Rutas protegidas heredan JWT, identidad local y cuota de `checkJwt`. Los estados Desvinculado/Pendiente rol niegan acceso; Pendiente puede activarse con rol coincidente. Un permiso antiguo en el JWT no supera el catálogo local vigente. La discrepancia local/externa Auth0 tiene conciliación remota; Keycloak hoy deniega, sin consultar Auth0.

### Inventario de rutas propio y controles declarados

La tabla siguiente proviene de declaraciones reales y sus montajes. El router de registros de pago se monta anidado en `/api/orders/:orderId/payment-records`, no directamente en server.js; detalles tiene montaje directo y anidado. Las reglas adicionales dentro de servicios siguen siendo obligatorias aunque no aparezcan en la declaración de ruta.

| Método y ruta efectiva | Evidencia actual | Autenticación / capacidades declaradas | PIN / condición adicional |
| --- | --- | --- | --- |
| GET `/api/auth/profile` | `capaServidor/src/modules/auth/routes/auth.routes.js:35` | JWT + identidad + cuota; read:own-profile | — |
| GET `/api/auth/profile/movements` | `capaServidor/src/modules/auth/routes/auth.routes.js:36` | JWT + identidad + cuota; read:own-profile | — |
| GET `/api/auth/verify` | `capaServidor/src/modules/auth/routes/auth.routes.js:38` | JWT + identidad + cuota; read:own-profile | — |
| POST `/api/auth/pin/debug-reset` | `capaServidor/src/modules/auth/routes/auth.routes.js:45` | JWT + identidad + cuota; manage:own-pin | solo demo/desarrollo y Soporte propio |
| POST `/api/auth/pin/reveal` | `capaServidor/src/modules/auth/routes/auth.routes.js:47` | JWT + identidad + cuota; manage:own-pin | — |
| POST `/api/auth/pin/acknowledge` | `capaServidor/src/modules/auth/routes/auth.routes.js:48` | JWT + identidad + cuota; manage:own-pin | — |
| POST `/api/auth/pin-recovery/request` | `capaServidor/src/modules/auth/routes/auth.routes.js:49` | JWT + identidad + cuota; manage:own-pin | — |
| POST `/api/auth/pin-recovery/confirm` | `capaServidor/src/modules/auth/routes/auth.routes.js:56` | JWT + identidad + cuota; manage:own-pin | — |
| POST `/api/auth/password-reset/request` | `capaServidor/src/modules/auth/routes/auth.routes.js:63` | Pública | cuotas IP/cuenta; piloto Keycloak: 503 |
| POST `/api/clients` | `capaServidor/src/modules/clients/routes/clients.routes.js:14` | JWT + identidad + cuota | Operación interna: 403 tras autenticar |
| GET `/api/clients/rut/:rutCliente` | `capaServidor/src/modules/clients/routes/clients.routes.js:15` | JWT + identidad + cuota; read:sales-notes | — |
| GET `/api/clients/:clientId` | `capaServidor/src/modules/clients/routes/clients.routes.js:16` | JWT + identidad + cuota; read:sales-notes | — |
| GET `/api/health/live` | `capaServidor/src/modules/health/routes/health.routes.js:8` | Pública | — |
| GET `/internal/ready` | `capaServidor/src/modules/health/routes/health.routes.js:31` | Token interno de readiness, si habilitado | — |
| GET `/api/history/orders` | `capaServidor/src/modules/history/routes/orderHistory.routes.js:11` | JWT + identidad + cuota; read:orders | — |
| GET `/api/history/orders/:orderId/events` | `capaServidor/src/modules/history/routes/orderHistory.routes.js:12` | JWT + identidad + cuota; read:orders | — |
| GET `/api/history/orders/:orderId` | `capaServidor/src/modules/history/routes/orderHistory.routes.js:13` | JWT + identidad + cuota; read:orders | — |
| GET `/api/messages` | `capaServidor/src/modules/messages/routes/message.routes.js:12` | JWT + identidad + cuota; read:own-messages | — |
| GET `/api/messages/notifications` | `capaServidor/src/modules/messages/routes/message.routes.js:13` | JWT + identidad + cuota; read:own-messages | — |
| PATCH `/api/messages/notifications` | `capaServidor/src/modules/messages/routes/message.routes.js:14` | JWT + identidad + cuota; update:own-messages | — |
| PATCH `/api/messages/notifications/:messageId` | `capaServidor/src/modules/messages/routes/message.routes.js:15` | JWT + identidad + cuota; update:own-messages | — |
| PATCH `/api/messages/:messageId/read` | `capaServidor/src/modules/messages/routes/message.routes.js:16` | JWT + identidad + cuota; update:own-messages | — |
| GET `/api/messages/:messageId` | `capaServidor/src/modules/messages/routes/message.routes.js:17` | JWT + identidad + cuota; read:own-messages | — |
| GET `/api/metrics/summary` | `capaServidor/src/modules/metrics/routes/metrics.routes.js:12` | JWT + identidad + cuota; view:metrics | — |
| GET `/api/metrics/production-performance` | `capaServidor/src/modules/metrics/routes/metrics.routes.js:13` | JWT + identidad + cuota; view:metrics | — |
| GET `/api/orders` | `capaServidor/src/modules/orders/routes/order.routes.js:54` | JWT + identidad + cuota; read:orders | — |
| GET `/api/orders/kanban` | `capaServidor/src/modules/orders/routes/order.routes.js:55` | JWT + identidad + cuota; read:orders | — |
| GET `/api/orders/kanban-summary` | `capaServidor/src/modules/orders/routes/order.routes.js:56` | JWT + identidad + cuota; read:orders | — |
| GET `/api/orders/calendar-summary` | `capaServidor/src/modules/orders/routes/order.routes.js:57` | JWT + identidad + cuota; read:production-calendar | — |
| GET `/api/orders/payments` | `capaServidor/src/modules/orders/routes/order.routes.js:58` | JWT + identidad + cuota; read:payments | — |
| GET `/api/orders/sales-notes/:numeroNota` | `capaServidor/src/modules/orders/routes/order.routes.js:59` | JWT + identidad + cuota; read:sales-notes | — |
| GET `/api/orders/:orderId/kanban-detail` | `capaServidor/src/modules/orders/routes/order.routes.js:62` | JWT + identidad + cuota; read:orders | — |
| GET `/api/orders/:orderId/calendar-detail` | `capaServidor/src/modules/orders/routes/order.routes.js:63` | JWT + identidad + cuota; read:production-calendar | — |
| GET `/api/orders/:orderId` | `capaServidor/src/modules/orders/routes/order.routes.js:64` | JWT + identidad + cuota; read:orders | — |
| POST `/api/orders` | `capaServidor/src/modules/orders/routes/order.routes.js:65` | JWT + identidad + cuota; create:orders | — |
| PATCH `/api/orders/:orderId/payment-status` | `capaServidor/src/modules/orders/routes/order.routes.js:66` | JWT + identidad + cuota; update:payment-status | PIN del actor |
| PATCH `/api/orders/:orderId/move` | `capaServidor/src/modules/orders/routes/order.routes.js:73` | JWT + identidad + cuota; move:orders | PIN del actor |
| PATCH `/api/orders/:orderId/review` | `capaServidor/src/modules/orders/routes/order.routes.js:74` | JWT + identidad + cuota; review:orders | — |
| PATCH `/api/orders/:orderId/cancel-production` | `capaServidor/src/modules/orders/routes/order.routes.js:80` | JWT + identidad + cuota; cancel:orders | PIN del actor |
| PATCH `/api/orders/:orderId/reevaluate` | `capaServidor/src/modules/orders/routes/order.routes.js:87` | JWT + identidad + cuota; reevaluate:orders | — |
| PATCH `/api/orders/:orderId/labels` | `capaServidor/src/modules/orders/routes/order.routes.js:88` | JWT + identidad + cuota; manage:order-tags | — |
| PATCH `/api/orders/:orderId/delivery-date` | `capaServidor/src/modules/orders/routes/order.routes.js:89` | JWT + identidad + cuota; update:order-delivery-date | PIN del actor |
| PATCH `/api/orders/:orderId/details/:detailId/subprocesses/:subprocessId/complete` | `capaServidor/src/modules/orders/routes/order.routes.js:90` | JWT + identidad + cuota; update:production-subprocesses | PIN del actor |
| PATCH `/api/orders/:orderId/details/:detailId/subprocesses/:subprocessId/rollback` | `capaServidor/src/modules/orders/routes/order.routes.js:97` | JWT + identidad + cuota; rollback:production-subprocesses | PIN del actor |
| GET `/api/order-details` | `capaServidor/src/modules/orders/routes/orderDetail.routes.js:13` | JWT + identidad + cuota; read:orders | — |
| GET `/api/orders/:orderId/details` | `capaServidor/src/modules/orders/routes/orderDetail.routes.js:13` | JWT + identidad + cuota; read:orders | — |
| GET `/api/order-details/:detailId` | `capaServidor/src/modules/orders/routes/orderDetail.routes.js:14` | JWT + identidad + cuota; read:orders | — |
| GET `/api/orders/:orderId/details/:detailId` | `capaServidor/src/modules/orders/routes/orderDetail.routes.js:14` | JWT + identidad + cuota; read:orders | — |
| POST `/api/order-details` | `capaServidor/src/modules/orders/routes/orderDetail.routes.js:15` | JWT + identidad + cuota | Operación interna: 403 tras autenticar |
| POST `/api/orders/:orderId/details` | `capaServidor/src/modules/orders/routes/orderDetail.routes.js:15` | JWT + identidad + cuota | Operación interna: 403 tras autenticar |
| GET `/api/order-status` | `capaServidor/src/modules/orders/routes/orderStatus.routes.js:14` | JWT + identidad + cuota; read:orders | — |
| POST `/api/order-status` | `capaServidor/src/modules/orders/routes/orderStatus.routes.js:15` | JWT + identidad + cuota | Operación interna: 403 tras autenticar |
| GET `/api/orders/:orderId/payment-records/preview` | `capaServidor/src/modules/payments/routes/paymentRecord.routes.js:13` | JWT + identidad + cuota; read:payments | — |
| GET `/api/orders/:orderId/payment-records` | `capaServidor/src/modules/payments/routes/paymentRecord.routes.js:14` | JWT + identidad + cuota; read:payments | — |
| GET `/api/orders/:orderId/payment-records/:paymentRecordId` | `capaServidor/src/modules/payments/routes/paymentRecord.routes.js:15` | JWT + identidad + cuota; read:payments | — |
| POST `/api/orders/:orderId/payment-records` | `capaServidor/src/modules/payments/routes/paymentRecord.routes.js:16` | JWT + identidad + cuota | Operación interna: 403 tras autenticar |
| GET `/api/payment-status` | `capaServidor/src/modules/payments/routes/paymentStatus.routes.js:14` | JWT + identidad + cuota; read:payments | — |
| GET `/api/payment-status/:id` | `capaServidor/src/modules/payments/routes/paymentStatus.routes.js:15` | JWT + identidad + cuota; read:payments | — |
| POST `/api/payment-status` | `capaServidor/src/modules/payments/routes/paymentStatus.routes.js:16` | JWT + identidad + cuota | Operación interna: 403 tras autenticar |
| GET `/api/privacy/documents` | `capaServidor/src/modules/privacy/routes/privacy.routes.js:9` | Pública | — |
| POST `/api/privacy/requests` | `capaServidor/src/modules/privacy/routes/privacy.routes.js:13` | JWT + identidad + cuota | — |
| GET `/api/production-capacity` | `capaServidor/src/modules/productionCapacity/routes/productionCapacity.routes.js:8` | JWT + identidad + cuota; read:production-capacity | — |
| PATCH `/api/production-capacity` | `capaServidor/src/modules/productionCapacity/routes/productionCapacity.routes.js:9` | JWT + identidad + cuota; manage:production-capacity | — |
| GET `/api/production-load/today` | `capaServidor/src/modules/productionLoad/routes/productionLoad.routes.js:13` | JWT + identidad + cuota; read:production-capacity | — |
| PATCH `/api/production-load/today` | `capaServidor/src/modules/productionLoad/routes/productionLoad.routes.js:14` | JWT + identidad + cuota; manage:production-load / manage:production-capacity | — |
| GET `/api/products` | `capaServidor/src/modules/products/routes/product.routes.js:13` | JWT + identidad + cuota; read:orders | — |
| GET `/api/products/name/:nombreProducto` | `capaServidor/src/modules/products/routes/product.routes.js:14` | JWT + identidad + cuota; read:orders | — |
| GET `/api/products/:productTypeId` | `capaServidor/src/modules/products/routes/product.routes.js:15` | JWT + identidad + cuota; read:orders | — |
| POST `/api/products` | `capaServidor/src/modules/products/routes/product.routes.js:16` | JWT + identidad + cuota | Operación interna: 403 tras autenticar |
| GET `/api/security/incident-reports/config` | `capaServidor/src/modules/security/routes/incidentReport.routes.js:10` | JWT + identidad + cuota | — |
| POST `/api/security/incident-reports` | `capaServidor/src/modules/security/routes/incidentReport.routes.js:11` | JWT + identidad + cuota | — |
| GET `/api/admin/users` | `capaServidor/src/modules/users/routes/adminUsers.routes.js:31` | JWT + identidad + cuota; manage:users | alcance objetivo; piloto Keycloak: 503 |
| GET `/api/admin/users/summary` | `capaServidor/src/modules/users/routes/adminUsers.routes.js:37` | JWT + identidad + cuota; manage:users | alcance objetivo; piloto Keycloak: 503 |
| GET `/api/admin/users/:userId/movements` | `capaServidor/src/modules/users/routes/adminUsers.routes.js:43` | JWT + identidad + cuota; manage:users | alcance objetivo; piloto Keycloak: 503 |
| POST `/api/admin/users` | `capaServidor/src/modules/users/routes/adminUsers.routes.js:49` | JWT + identidad + cuota; manage:users | alcance objetivo; piloto Keycloak: 503 |
| POST `/api/admin/users/password-setup-email` | `capaServidor/src/modules/users/routes/adminUsers.routes.js:55` | JWT + identidad + cuota; manage:users | alcance objetivo; piloto Keycloak: 503 |
| PATCH `/api/admin/users/:userId` | `capaServidor/src/modules/users/routes/adminUsers.routes.js:61` | JWT + identidad + cuota; manage:users | PIN del actor; alcance objetivo; piloto Keycloak: 503 |
| PATCH `/api/admin/users/:userId/status` | `capaServidor/src/modules/users/routes/adminUsers.routes.js:68` | JWT + identidad + cuota; manage:users | PIN del actor; alcance objetivo; piloto Keycloak: 503 |


## 3. Propuesta de nueve roles, sin aprobación implícita

Los siete roles funcionales conservan sus nombres. Se propone trasladar las identidades del Soporte técnico actual a **Desarrollador** y crear un **Soporte nuevo** dedicado a cuentas. No basta conservar el string Soporte y reducir permisos: eso reasignaría silenciosamente personas técnicas al rol nuevo. Se requiere correspondencia explícita por identidad, renovación de sesiones y revisión de históricos.

Leyenda de cambios respecto del rol de origen: **M** mantiene, **R** retira, **A** añade para un rol nuevo, **P** pendiente de aprobación, **—** sin concesión. D proviene de ST; S es el nuevo Soporte, sin rol de origen. Para S se presentan como candidatas cinco capacidades: perfil propio, PIN propio, lectura/actualización de mensajes propios y manage:users. Lecturas de pedidos/capacidad quedan P, porque ser comunes hoy no las convierte en necesarias para atender cuentas. Ninguna celda A implica implementación.

| Capacidad | AP | AV | AC | OP | OV | OC | G | D | S |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `read:own-profile` | M | M | M | M | M | M | M | M | A |
| `manage:own-pin` | M | M | M | M | M | M | M | M | A |
| `read:orders` | M | M | M | M | M | M | M | M | P |
| `read:production-capacity` | M | M | M | M | M | M | M | M | P |
| `read:own-messages` | M | M | M | M | M | M | M | M | A |
| `update:own-messages` | M | M | M | M | M | M | M | M | A |
| `manage:users` | R | R | R | — | — | — | — | P | A |
| `read:sales-notes` | — | M | — | — | M | — | — | M | — |
| `create:orders` | — | M | — | — | M | — | — | M | — |
| `reevaluate:orders` | — | M | — | — | M | — | — | M | — |
| `read:payments` | — | — | M | — | — | M | — | M | — |
| `update:payment-status` | — | — | M | — | — | M | — | M | — |
| `revise:payment-status` | — | — | M | — | — | — | — | M | — |
| `move:orders` | M | — | — | M | — | — | — | M | — |
| `start:production` | M | — | — | — | — | — | — | M | — |
| `update:production-subprocesses` | M | — | — | M | — | — | — | M | — |
| `rollback:production-subprocesses` | M | — | — | — | — | — | — | M | — |
| `manage:production-capacity` | M | — | — | — | — | — | — | M | — |
| `manage:production-load` | M | — | — | — | — | — | — | M | — |
| `manage:order-tags` | M | — | — | — | — | — | — | M | — |
| `review:orders` | M | — | — | — | — | — | — | M | — |
| `cancel:orders` | M | — | — | — | — | — | — | M | — |
| `read:production-calendar` | M | M | — | — | M | — | — | M | — |
| `update:order-delivery-date` | M | — | — | — | — | — | — | M | — |
| `view:metrics` | M | — | — | — | — | — | M | M | — |


La exclusividad de administración ordinaria de cuentas del Soporte nuevo es un requisito de la solicitud: retirar `manage:users` a AP/AV/AC y no concederlo silenciosamente a D. La celda P de D señala la decisión entre alternativas, no una autorización transitoria de administración rutinaria.

### Alternativas para Desarrollador

| Alternativa | Capacidades y límite | Riesgo / decisión pendiente |
| --- | --- | --- |
| D1 | Mantener las 24 capacidades actuales restantes; retirar administración ordinaria | Conserva alcance técnico y de negocio histórico, aunque es amplio; requiere aprobación expresa |
| D2 | D1 + procedimiento excepcional de emergencia separado de manage:users ordinario | Exigir aprobación independiente, acceso temporal, identidad verificada y auditoría específica; no usar bypass permanente |
| D3 | Reducir también facultades comerciales a necesidades técnicas demostradas | Mejor segregación potencial, pero cambia alcance funcional y exige aprobación por capacidad; no adoptarla por defecto |

No se selecciona una alternativa. El rol aplicativo Desarrollador no será realm-admin ni recibirá el secreto del cliente administrativo. Las credenciales de emergencia del IdP constituyen otra responsabilidad, fuera de los permisos del trabajador.

### Nuevo Soporte y controles contra escalamiento

Debe poder atender altas, datos autorizados, roles permitidos, desactivación/reactivación, provisión incompleta, credenciales temporales y expedientes de recuperación. No obtiene modificación de pagos, pedidos, producción, capacidad o cancelaciones por ese cometido.

Antes de implementar se debe aprobar si puede asignar Gerencia, otro Soporte o Desarrollador y bajo qué segunda autorización. No reutilizar `FUNCTIONAL_ROLES` o `manageableRoles` sin revisar sus exclusiones actuales. Mantener prohibición de autocambio de rol y autodesvinculación; evaluar protección del último Soporte activo y concurrencia de dos bajas. La creación del primer Soporte debe ser bootstrap administrativo controlado, sin habilitar registro público.

`manage:users` es hoy grueso: no diferencia edición de datos, reseteo de credenciales y lectura de auditoría. Se proponen, **sin añadirlas al catálogo en esta fase**, capacidades separadas para gestión de credenciales, resolución de recuperaciones y lectura de auditoría de cuentas. Deben definirse nombres y alcance con aprobación; el inventario actual sigue teniendo 25, no 28.

### Retiro efectivo a administradores departamentales

La implementación futura deberá cambiar matriz central, alcance de roles objetivo, guards/listas de rutas, menú, formularios y validaciones, backend, mappers/asignaciones del IdP, generador y fixtures. Conservar todos los permisos comerciales restantes. No limitarse a ocultar el menú ni confiar en tokens recién emitidos: llamadas directas con JWT antiguo que contiene manage:users deben recibir 403 por matriz local.

`scripts/rbac.mjs` genera matriz/Auth0 expected/Action; no ejecutarlo en esta fase. La captura `rbac.observed.json` es histórica y contiene 23 permisos: no acredita el tenant actual de 25. Conservarla como evidencia fechada, no corregirla para aparentar conformidad.

## 4. Pruebas requeridas y pendientes de decisión

- Matriz positiva/negativa de **cada una de las 25 capacidades**, ocho roles actuales y nueve candidatos aprobados; incluir permisos extra directos, token sin permisos, rol inválido y dos roles ITECSA.
- Peticiones directas de AP/AV/AC a las siete rutas administrativas con token anterior: denegadas en la propuesta sin alterar sus operaciones departamentales.
- Nuevo Soporte: altas/reset permitidos según alcance aprobado; movimientos comerciales y financieros denegados; PIN, actor e identidad verificada obligatorios donde se diseñen.
- Desarrollador: solo las facultades de la alternativa aprobada; no leer secretos administrativos desde SPA ni usar endpoints de emergencia como vía ordinaria.
- Roles distintos entre token/BD/IdP; rol retirado, cuenta bloqueada, bajas concurrentes y último Soporte; preservar fail closed y evitar autoconcederse privilegios.
- Sesión inicial sin PIN reconocido, recuperación PIN, historial y notificaciones por pertenencia. Cerrar sesión en otra pestaña y renovaciones concurrentes.

Estas pruebas **no se ejecutaron**. Son parte de [la matriz de aceptación](03_AUTH0_VS_KEYCLOAK.md), junto con pruebas de servicios, integridad y aislamiento offline. Pendientes de aprobación: D1/D2/D3, facultades comunes de S, roles que S puede asignar, protección de última cuenta, auditoría y proceso de emergencia.

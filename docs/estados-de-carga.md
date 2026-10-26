# Estandarización de los estados de carga de ITECSA

Implementación local, 26 de octubre de 2026. Base: auditoría previa de 74 puntos de uso, incluidos consumidores repetidos y ramas desconectadas. Esos puntos no representaban 74 componentes diferentes.

## Solución y arquitectura

Los estados de espera usan un anillo gris con un segmento naranja corporativo `--page-brand-orange` (`#FE5A00`) sobre superficies claras. En superficies oscuras el segmento y el texto son blancos. El texto visible es **Cargando...**. Hay una sola animación giratoria, de 800 ms por vuelta; con `prefers-reduced-motion: reduce` sigue girando, a 3,2 segundos por vuelta.

- `shared/loading/indicator.css` es la fuente de presentación compartida. No depende de Bootstrap ni de bibliotecas nuevas.
- `LoadingIndicator` renderiza el SVG decorativo y una región `status`, con contexto adicional accesible cuando corresponde.
- `LoadingAction` conserva espacio para la etiqueta normal del botón y presenta el mismo indicador durante la operación. El componente que realiza la operación conserva la responsabilidad de deshabilitarla, validar y finalizarla.
- `ModuleLoadingState` queda como adaptador de Suspense hacia el componente central, sin un spinner propio.
- Keycloak conserva sus formularios y POST nativos. Su script genera el mismo marcado visual; `scripts/sync-loading-theme.mjs` copia el CSS compartido a los recursos del tema. `npm run build` ejecuta esa sincronización mediante `prebuild`. No se mantiene otro CSS escrito a mano para el tema.

API de presentación:

| Propiedad | Uso |
| --- | --- |
| `scope="screen"` | Inicialización o espera que reemplaza la pantalla. |
| `scope="page"` | Suspense y contenido principal de una vista. |
| `scope="section"` | Sección, tabla, listado o card; valor predeterminado. |
| `scope="dialog"` | Cuerpo de modal o panel lateral. |
| `scope="action"` | Operación puntual; disposición horizontal y anillo pequeño. |
| `surface="light" / "dark"` | Contraste según la superficie; no según el módulo. |
| `size="small"` | Indicador compacto. |
| `context` | Información adicional accesible sobre la operación. |
| `announce={false}` | Evita un segundo anuncio cuando otro indicador de la misma operación ya lo realiza. |

```jsx
<LoadingIndicator scope="section" context="Pedidos" />
<button disabled={busy} aria-busy={busy}>
  <LoadingAction busy={busy}>Guardar cambios</LoadingAction>
</button>
```

Los indicadores heredan el fondo de su contenedor; no agregan overlays globales ni inician solicitudes. Los errores, los resultados vacíos y las esperas de intervención humana conservan sus mensajes propios.

El segmento activo del anillo recorre una vuelta completa de forma continua, con el centro fijado al `viewBox` del SVG. La base gris permanece fija. Esta animación se aplica desde el CSS compartido a cada indicador, incluidos los botones de validación PIN; no requiere animaciones ni cambios funcionales por módulo.

## Alcance por módulo

| Módulo | Estados migrados y alcance |
| --- | --- |
| Navegación y layout | Suspense exterior/interior, guard de sesión, guards de permisos. |
| Autenticación | Inicialización, redirección automática, cierre y verificación de acceso. No se agrega un paso de login. |
| Keycloak | Submit de login, actualización y recuperación de contraseña. |
| Ventas | Búsqueda de Nota de Venta, registro y confirmación dentro de su modal. |
| Kanban | Columnas, recarga por filtros, paginación, detalle lateral, validación previa al traslado, PIN, corrección, cancelación, retroceso, reevaluación y carga operativa. |
| Pagos | Listado, paginación, detalle/preview, gestión y confirmación por PIN. |
| Usuarios | Resumen, tabla, móvil, inspección previa a edición, creación/conciliación, edición y movimientos. |
| Perfil | Actividad, entrega del PIN, aceptación, generación y validación de recuperación. |
| Historial | Listado, detalle, filtro de eventos y carga adicional. |
| Mensajes | Bandeja, detalle y apertura/marcado de lectura. |
| Notificaciones | Carga del panel y acciones de abrir/limpiar. El polling sigue siendo silencioso. |
| Métricas | Consulta general y generación de reporte. |
| Documentos y solicitudes | Consulta de documentos/canal y envío del formulario. |
| Seguridad | Comprobación del canal y envío del reporte; el formulario sigue disponible durante la comprobación. |
| Calendario | Carga mensual y pendientes, detalle en modal y confirmación de fecha mediante PIN. |

Los componentes compartidos alcanzan también sus consumidores auxiliares; no se crearon rutas ni endpoints nuevos.

## Implementaciones anteriores reemplazadas y limpieza

- Se retiraron todos los usos de `spinner-border`, incluidos los amarillos y los pequeños embebidos en formularios y previews.
- Los textos visuales dispersos de búsqueda, carga, guardado, envío, creación, confirmación, paginación y procesamiento usan ahora el sistema común.
- Se reemplazaron los puntos suspensivos de las cards de resumen y el placeholder del PIN mientras se consulta.
- Se eliminaron reglas de carga sin consumidores en mensajes, notificaciones y pagos. Las clases que siguen presentando errores o estados vacíos se conservaron para esos usos.
- Se retiraron `completedLabel` y los atributos/mensajes de carga antiguos de las tres plantillas de Keycloak.
- Se eliminó `UserUnlinkConfirmModal.jsx` y su rama desconectada en Gestión de usuarios: no había ninguna apertura del modal y la API estaba declarada no disponible.
- Se eliminó la rama desconectada de restablecimiento dentro de `TemporaryPasswordModal.jsx`, junto con sus imports y estado de cierre en Gestión. Se conserva íntegramente el modal que entrega la contraseña inicial después de crear un usuario, que sí tiene un consumidor activo.
- Los componentes de negocio reutilizables que aún tienen consumidores o contratos de callback conservan su funcionalidad con el indicador común.

## Correcciones funcionales

1. **Solicitudes sin fin:** el cliente API tiene un límite predeterminado de 45 segundos que cubre token, fetch y lectura del cuerpo. Acepta `signal` y `timeoutMs` por solicitud y limpia temporizadores/listeners. Solicita abortar el fetch al interrumpirse. No reintenta mutaciones. Un timeout no significa que el servidor haya cancelado la operación.
2. **Mensajes fuera de orden:** bandeja y detalle invalidan respuestas anteriores y sus `finally` al cambiar filtros, ruta o desmontarse. Un detalle antiguo no inicia el marcado de lectura después de haber quedado obsoleto.
3. **Apertura de mensajes:** el marcado de lectura tiene feedback y bloqueo de doble apertura; una navegación pendiente no sustituye un filtro o ruta nuevos.
4. **Kanban:** una recarga vuelve a mostrar su estado de espera. Respuestas antiguas y paginaciones pendientes no se mezclan con otro filtro ni apagan su carga. Se invalidan consultas de detalle al desmontar.
5. **Correcciones y operaciones de Kanban:** se agregaron feedback, exclusión de doble envío y liberación en `finally`. Los fallos de callbacks se presentan sin dejar el indicador activo. El panel no se cierra durante una operación pendiente.
6. **Validación previa al traslado:** muestra una carga de acción, evita duplicarla y descarta el resultado si cambió la consulta antes de abrir la confirmación.
7. **Pagos:** la paginación y su `finally` pertenecen a la consulta vigente. Las recargas invalidan cargas anteriores. Los botones de gestión reflejan su estado pendiente. El preview bloquea cierre/backdrop durante la mutación y la validación PIN administra foco y Escape.
8. **Inspección de usuarios:** hay feedback en el botón de la fila/card y bloqueo de consultas duplicadas antes de abrir el editor.
9. **Resumen de usuarios:** las actualizaciones conservan los valores ya disponibles y agregan su indicador local; la carga inicial muestra el indicador en cada card.
10. **Calendario:** se distinguen las cargas del mes y de pedidos pendientes. El detalle se abre con su estado local y descarta respuestas obsoletas al cerrarse o cambiar de pedido. El modal de PIN evita doble submit y cierre por botón/Escape mientras confirma.
11. **Carga operativa:** ya no presenta el porcentaje inicial como un resultado confirmado mientras consulta. El guardado tiene exclusión de doble envío.
12. **Guard de sesión:** cada nuevo ciclo de espera comienza con su propio límite; un timeout previo no provoca una redirección inmediata en el siguiente ciclo. Se mantienen las decisiones existentes de autenticación, PIN y permisos.
13. **PIN del perfil:** los errores de consulta dejan un mensaje de indisponibilidad; no simulan una carga permanente. La recuperación muestra carga en sus acciones.
14. **Notificaciones:** las acciones tienen feedback/exclusión de duplicados y descartan resultados de lecturas anteriores que podrían restaurar elementos recién limpiados.
15. **Keycloak y BFCache:** los formularios y enlaces restaurados al volver atrás recuperan su interacción. Se mantienen los controles exitosos, incluidos botones nombrados, en el POST nativo; se usa `aria-disabled` sin eliminar esos controles del envío.
16. **Accesibilidad y contención:** se incorporaron estados `aria-busy`, anuncios contextualizados, administración de foco/Escape en los modales intervenidos y eliminación del anuncio duplicado en el pie de movimientos. El texto accesible queda posicionado dentro de su indicador para que no produzca desbordamiento desde columnas desplazables.
17. **Responsive y contraste:** la espera inicial del calendario ya no hereda el ancho mínimo de la grilla completa. Los botones de registro, Kanban y calendario conservan su fondo oscuro mientras cargan, incluso bajo hover. La carga de acción hereda la tipografía del botón; en Keycloak conserva el tamaño y peso necesarios para el contraste sobre naranja. El modal PIN compartido tiene fallbacks a tokens globales, de modo que su botón conserva el fondo oscuro cuando se reutiliza fuera de Pagos o mediante un portal.

## Casos especiales preservados

- Las verificaciones de identidad y autorización exigidas por el flujo actual siguen bloqueando el acceso mientras se resuelven. No se reutilizan permisos anteriores para ocultar esa espera.
- La renovación de token, los identificadores de sesión/verificación, la expiración y las reglas PKCE no se modificaron.
- Las solicitudes e incidentes con resultado de entrega incierto conservan su referencia, congelación y estrategia de reintento. Finalizar el indicador no los convierte en éxitos ni crea otro identificador.
- La conciliación de usuarios y la entrega de credenciales conservan su tratamiento especial y sus pasos humanos.
- Los porcentajes de producción y las cuentas regresivas de notificaciones representan datos de negocio/tiempo visible, no progreso de una petición; se conservaron.
- El polling de notificaciones no abre loaders globales.
- Keycloak usa su renderer nativo y la misma fuente CSS; no carga React dentro del tema.
- No se agregaron retrasos artificiales ni porcentajes de progreso simulados.

## Pruebas y resultados

Desde `capaVista`:

```text
npm.cmd run lint
npm.cmd test
npm.cmd run build
```

Desde la raíz:

```text
node scripts/verify-loading.mjs
git diff --check
```

- **99 pruebas frontend pasan**, frente a 78 existentes: token/red/cuerpo sin respuesta, cancelación, solicitudes simultáneas, conservación de errores 401, respuestas de mensajes fuera de orden, cambios de ruta, doble apertura, recarga y paginación Kanban, errores, doble corrección, validación previa a traslado, PIN de calendario, bloqueo de cierre/Escape y reinicio del timeout del guard. Se conservan las pruebas de autenticación, flujos y páginas existentes.
- Las pruebas del tema validan sus reglas de contraseña, POST y cancelación nativos, restauración BFCache, igualdad exacta del CSS y reducción de movimiento.
- **76 escenarios visuales pasan** en Edge local a 320, 375, 768 y 1440 px: las 14 vistas, guard, modal PIN, formulario nativo, superficies claras/oscuras y acción normal/ocupada.
- Se añadió una matriz específica de **14 casos de PIN**: pagos, creación y conciliación de usuarios mediante el modal compartido, edición, traslado a producción, completar/retroceder subproceso, cancelación, desconfirmación, calendario, consulta del PIN, aceptación y las dos acciones de recuperación. Comprueba los componentes reales con callbacks/API sintéticos, sus cuatro anchos y el cambio efectivo de ángulo en todos sus indicadores, tanto en modo normal como con movimiento reducido. La evidencia queda en `dist/loading-review/results-pin.json`.
- La matriz verifica texto común, colores computados, animación, contención, ausencia de desbordamiento horizontal del documento, finalización de esperas sintéticas, estabilidad del ancho del botón y movimiento reducido. El scroll horizontal funcional de Kanban/calendario permanece dentro de su contenedor.
- Las capturas revisadas muestran el anillo y el texto de ambas superficies. Evidencia local regenerable: `dist/loading-review/*.png` y `dist/loading-review/results.json`, ignorados por Git.
- El servidor de revisión solo escucha en localhost. El navegador bloquea solicitudes fuera del origen de fixtures; no utiliza una sesión real ni permite escrituras de negocio. La búsqueda de ventas usa una respuesta sintética fallida al liberar la espera, para verificar también su finalización con error.
- No quedan referencias de presentación a spinners Bootstrap ni a las etiquetas antiguas retiradas en el código de aplicación y el tema. Las bibliotecas instaladas no se modificaron.

## Límites y entrega

Los cambios están implementados en el repositorio y compilados localmente. No se ha desplegado este cambio en Docker ni en el Keycloak de Ubuntu, ni se ha creado un commit o push de esta tarea. Para publicar el tema se debe instalar su carpeta actualizada, incluido `resources/css/loading.css`, junto con las plantillas, mensajes, JavaScript y `theme.properties` modificados.

La revisión visual y las pruebas asíncronas usan fixtures; no equivalen a una prueba integral contra la instalación real. Quedan para esa instalación la comprobación de login/logout/expiración/recuperación con sesión real y la revisión manual con lector de pantalla. La disponibilidad de recuperación de contraseña continúa dependiendo de la configuración del realm. No se cambiaron servicios, políticas ni permisos del backend.

El límite del cliente libera la espera local y solicita abortar la conexión; no cancela llamadas internas del SDK Keycloak ya iniciadas ni garantiza la interrupción de una operación que el servidor haya recibido. Esa incertidumbre se conserva en los flujos existentes.

## Inventario de archivos

La siguiente lista distingue archivos creados, modificados y eliminados respecto de la base de esta intervención.

| Estado | Archivo |
| --- | --- |
| Creado | [capaVista/src/modules/kanban/components/KanbanLoading.test.jsx](../capaVista/src/modules/kanban/components/KanbanLoading.test.jsx) |
| Creado | [capaVista/src/modules/messages/pages/MessageLoading.test.jsx](../capaVista/src/modules/messages/pages/MessageLoading.test.jsx) |
| Creado | [capaVista/src/modules/productionCalendar/components/DeliveryLoading.test.jsx](../capaVista/src/modules/productionCalendar/components/DeliveryLoading.test.jsx) |
| Creado | [capaVista/src/services/api/apiClient.test.js](../capaVista/src/services/api/apiClient.test.js) |
| Creado | [capaVista/src/shared/components/loading/LoadingIndicator.jsx](../capaVista/src/shared/components/loading/LoadingIndicator.jsx) |
| Creado | [capaVista/src/shared/components/navigation/ProtectedLoading.test.jsx](../capaVista/src/shared/components/navigation/ProtectedLoading.test.jsx) |
| Creado | [deploy/keycloak/themes/itecsa/login/resources/css/loading.css](../deploy/keycloak/themes/itecsa/login/resources/css/loading.css) |
| Creado | [docs/estados-de-carga.md](../docs/estados-de-carga.md) |
| Creado | [scripts/sync-loading-theme.mjs](../scripts/sync-loading-theme.mjs) |
| Creado | [scripts/verify-loading.mjs](../scripts/verify-loading.mjs) |
| Creado | [shared/loading/indicator.css](../shared/loading/indicator.css) |
| Modificado | [capaVista/package.json](../capaVista/package.json) |
| Modificado | [capaVista/src/modules/auth/keycloakTheme.test.js](../capaVista/src/modules/auth/keycloakTheme.test.js) |
| Modificado | [capaVista/src/modules/auth/pages/AccessDeniedPage.jsx](../capaVista/src/modules/auth/pages/AccessDeniedPage.jsx) |
| Modificado | [capaVista/src/modules/auth/pages/LoginRedirect.jsx](../capaVista/src/modules/auth/pages/LoginRedirect.jsx) |
| Modificado | [capaVista/src/modules/auth/pages/LoginRedirect.test.jsx](../capaVista/src/modules/auth/pages/LoginRedirect.test.jsx) |
| Modificado | [capaVista/src/modules/kanban/components/CancelProductionModal.jsx](../capaVista/src/modules/kanban/components/CancelProductionModal.jsx) |
| Modificado | [capaVista/src/modules/kanban/components/KanbanColumn.jsx](../capaVista/src/modules/kanban/components/KanbanColumn.jsx) |
| Modificado | [capaVista/src/modules/kanban/components/KanbanOffCanvas.jsx](../capaVista/src/modules/kanban/components/KanbanOffCanvas.jsx) |
| Modificado | [capaVista/src/modules/kanban/components/MoveToProductionModal.jsx](../capaVista/src/modules/kanban/components/MoveToProductionModal.jsx) |
| Modificado | [capaVista/src/modules/kanban/components/PaymentDeconfirmationModal.jsx](../capaVista/src/modules/kanban/components/PaymentDeconfirmationModal.jsx) |
| Modificado | [capaVista/src/modules/kanban/components/SubprocessAuthModal.jsx](../capaVista/src/modules/kanban/components/SubprocessAuthModal.jsx) |
| Modificado | [capaVista/src/modules/kanban/pages/KanbanBoardPage.jsx](../capaVista/src/modules/kanban/pages/KanbanBoardPage.jsx) |
| Modificado | [capaVista/src/modules/messages/components/MessageList.jsx](../capaVista/src/modules/messages/components/MessageList.jsx) |
| Modificado | [capaVista/src/modules/messages/components/MessageList.module.css](../capaVista/src/modules/messages/components/MessageList.module.css) |
| Modificado | [capaVista/src/modules/messages/components/NotificationBell.jsx](../capaVista/src/modules/messages/components/NotificationBell.jsx) |
| Modificado | [capaVista/src/modules/messages/components/NotificationBell.module.css](../capaVista/src/modules/messages/components/NotificationBell.module.css) |
| Modificado | [capaVista/src/modules/messages/pages/MessageDetailPage.jsx](../capaVista/src/modules/messages/pages/MessageDetailPage.jsx) |
| Modificado | [capaVista/src/modules/messages/pages/MessageInboxPage.jsx](../capaVista/src/modules/messages/pages/MessageInboxPage.jsx) |
| Modificado | [capaVista/src/modules/metrics/components/ProductionPerformance.jsx](../capaVista/src/modules/metrics/components/ProductionPerformance.jsx) |
| Modificado | [capaVista/src/modules/metrics/pages/MetricsPage.jsx](../capaVista/src/modules/metrics/pages/MetricsPage.jsx) |
| Modificado | [capaVista/src/modules/orderHistory/pages/OrderHistoryDetailPage.jsx](../capaVista/src/modules/orderHistory/pages/OrderHistoryDetailPage.jsx) |
| Modificado | [capaVista/src/modules/orderHistory/pages/OrderHistoryPage.jsx](../capaVista/src/modules/orderHistory/pages/OrderHistoryPage.jsx) |
| Modificado | [capaVista/src/modules/orders/components/OrderCreateConfirmModal.jsx](../capaVista/src/modules/orders/components/OrderCreateConfirmModal.jsx) |
| Modificado | [capaVista/src/modules/orders/components/SalesNoteStep.jsx](../capaVista/src/modules/orders/components/SalesNoteStep.jsx) |
| Modificado | [capaVista/src/modules/orders/pages/OrderCreatePage.jsx](../capaVista/src/modules/orders/pages/OrderCreatePage.jsx) |
| Modificado | [capaVista/src/modules/orders/pages/OrderCreatePage.module.css](../capaVista/src/modules/orders/pages/OrderCreatePage.module.css) |
| Modificado | [capaVista/src/modules/payments/components/DocumentPreviewModalLayout.jsx](../capaVista/src/modules/payments/components/DocumentPreviewModalLayout.jsx) |
| Modificado | [capaVista/src/modules/payments/components/PaymentActionConfirmModal.jsx](../capaVista/src/modules/payments/components/PaymentActionConfirmModal.jsx) |
| Modificado | [capaVista/src/modules/payments/components/PaymentCredentialsModal.jsx](../capaVista/src/modules/payments/components/PaymentCredentialsModal.jsx) |
| Modificado | [capaVista/src/modules/payments/components/PaymentRowActions.jsx](../capaVista/src/modules/payments/components/PaymentRowActions.jsx) |
| Modificado | [capaVista/src/modules/payments/pages/PaymentConfirmationPage.jsx](../capaVista/src/modules/payments/pages/PaymentConfirmationPage.jsx) |
| Modificado | [capaVista/src/modules/payments/pages/PaymentConfirmationPage.module.css](../capaVista/src/modules/payments/pages/PaymentConfirmationPage.module.css) |
| Modificado | [capaVista/src/modules/payments/utils/paymentDocuments.js](../capaVista/src/modules/payments/utils/paymentDocuments.js) |
| Modificado | [capaVista/src/modules/privacy/components/DataRequestForm.jsx](../capaVista/src/modules/privacy/components/DataRequestForm.jsx) |
| Modificado | [capaVista/src/modules/privacy/pages/DataRequestsPage.jsx](../capaVista/src/modules/privacy/pages/DataRequestsPage.jsx) |
| Modificado | [capaVista/src/modules/privacy/pages/DocumentsPage.jsx](../capaVista/src/modules/privacy/pages/DocumentsPage.jsx) |
| Modificado | [capaVista/src/modules/productionCalendar/components/CalendarOrderDetailModal.jsx](../capaVista/src/modules/productionCalendar/components/CalendarOrderDetailModal.jsx) |
| Modificado | [capaVista/src/modules/productionCalendar/components/DeliveryChangeModals.jsx](../capaVista/src/modules/productionCalendar/components/DeliveryChangeModals.jsx) |
| Modificado | [capaVista/src/modules/productionCalendar/components/ProductionCalendarGrid.jsx](../capaVista/src/modules/productionCalendar/components/ProductionCalendarGrid.jsx) |
| Modificado | [capaVista/src/modules/productionCalendar/components/ProductionCalendarGrid.module.css](../capaVista/src/modules/productionCalendar/components/ProductionCalendarGrid.module.css) |
| Modificado | [capaVista/src/modules/productionCalendar/pages/ProductionCalendarPage.jsx](../capaVista/src/modules/productionCalendar/pages/ProductionCalendarPage.jsx) |
| Modificado | [capaVista/src/modules/productionCalendar/pages/ProductionCalendarPage.module.css](../capaVista/src/modules/productionCalendar/pages/ProductionCalendarPage.module.css) |
| Modificado | [capaVista/src/modules/profile/pages/ProfilePage.jsx](../capaVista/src/modules/profile/pages/ProfilePage.jsx) |
| Modificado | [capaVista/src/modules/security/components/IncidentReportForm.jsx](../capaVista/src/modules/security/components/IncidentReportForm.jsx) |
| Modificado | [capaVista/src/modules/users/components/TemporaryPasswordModal.jsx](../capaVista/src/modules/users/components/TemporaryPasswordModal.jsx) |
| Modificado | [capaVista/src/modules/users/components/UserButton.jsx](../capaVista/src/modules/users/components/UserButton.jsx) |
| Modificado | [capaVista/src/modules/users/components/UserCreateForm.jsx](../capaVista/src/modules/users/components/UserCreateForm.jsx) |
| Modificado | [capaVista/src/modules/users/components/UserEditModal.jsx](../capaVista/src/modules/users/components/UserEditModal.jsx) |
| Modificado | [capaVista/src/modules/users/components/UserManagementMobileList.jsx](../capaVista/src/modules/users/components/UserManagementMobileList.jsx) |
| Modificado | [capaVista/src/modules/users/components/UserManagementTable.jsx](../capaVista/src/modules/users/components/UserManagementTable.jsx) |
| Modificado | [capaVista/src/modules/users/components/UserMovementsModal.jsx](../capaVista/src/modules/users/components/UserMovementsModal.jsx) |
| Modificado | [capaVista/src/modules/users/components/UserSummaryCards.jsx](../capaVista/src/modules/users/components/UserSummaryCards.jsx) |
| Eliminado | `capaVista/src/modules/users/components/UserUnlinkConfirmModal.jsx` |
| Modificado | [capaVista/src/modules/users/pages/UserManagementPage.jsx](../capaVista/src/modules/users/pages/UserManagementPage.jsx) |
| Modificado | [capaVista/src/services/api/apiClient.js](../capaVista/src/services/api/apiClient.js) |
| Modificado | [capaVista/src/shared/components/navigation/ModuleLoadingState.jsx](../capaVista/src/shared/components/navigation/ModuleLoadingState.jsx) |
| Modificado | [capaVista/src/shared/components/navigation/ProtectedRoute.jsx](../capaVista/src/shared/components/navigation/ProtectedRoute.jsx) |
| Modificado | [capaVista/src/shared/components/navigation/RoleGuard.jsx](../capaVista/src/shared/components/navigation/RoleGuard.jsx) |
| Modificado | [deploy/keycloak/themes/itecsa/login/login-reset-password.ftl](../deploy/keycloak/themes/itecsa/login/login-reset-password.ftl) |
| Modificado | [deploy/keycloak/themes/itecsa/login/login-update-password.ftl](../deploy/keycloak/themes/itecsa/login/login-update-password.ftl) |
| Modificado | [deploy/keycloak/themes/itecsa/login/login.ftl](../deploy/keycloak/themes/itecsa/login/login.ftl) |
| Modificado | [deploy/keycloak/themes/itecsa/login/messages/messages_es.properties](../deploy/keycloak/themes/itecsa/login/messages/messages_es.properties) |
| Modificado | [deploy/keycloak/themes/itecsa/login/resources/js/itecsa.js](../deploy/keycloak/themes/itecsa/login/resources/js/itecsa.js) |
| Modificado | [deploy/keycloak/themes/itecsa/login/theme.properties](../deploy/keycloak/themes/itecsa/login/theme.properties) |
| Modificado | [capaVista/src/modules/kanban/styles/Kanban.module.css](../capaVista/src/modules/kanban/styles/Kanban.module.css) |
| Modificado | [capaVista/src/modules/payments/components/PaymentActionConfirmModal.module.css](../capaVista/src/modules/payments/components/PaymentActionConfirmModal.module.css) |
| Creado | [capaVista/verify/pinLoadingFixtures.jsx](../capaVista/verify/pinLoadingFixtures.jsx) |

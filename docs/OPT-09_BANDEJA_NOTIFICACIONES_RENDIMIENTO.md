# OPT-09 — Bandeja de entrada, mensajes y notificaciones

Fecha: 27 de octubre de 2026. Rama: `optimizacion`. Referencia: `755ce1e21e9ed4f757215d5587ff8364d5ce0a0a`. Árbol limpio al comenzar. Sin commit, push o despliegue.

## A. Resumen ejecutivo

Se optimizaron lecturas, apertura, marcado, campana y refrescos, conservando el actor validado de Fase 1. La bandeja mantiene su transacción de página/count y paginación numerada. Notificaciones y contador se obtienen en un solo SELECT; el detalle usa un JOIN autorizado por asignación. La campana solicita explícitamente un resumen y un marcador de revisión, sin caché global de mensajes, identidades o permisos.

Resultados internos: bandeja 2415,224 → 1534,288 ms, cuatro SELECT → dos; notificaciones 1963,526 → 663,334 ms, cuatro → uno; detalle 1968,204 → 658,336 ms, tres → uno. HTTP de notificaciones pasa de 2547,383 a 1320,899 ms y aún supera el segundo. No se certifica p95 ni E2E.

El flujo de apertura se concentra en un POST explícito: comprueba destinatario y marca solo con permiso, respondiendo después de persistir. Los endpoints anteriores siguen disponibles. Ocultar/limpiar reconcilian el contador real, evitan aplicar lecturas anteriores y preservan avisos posteriores al borrado lógico. Toasts genéricos y sonido conservan su comportamiento.

La cadencia sigue en cinco segundos. No se eliminan los doce sondeos ordinarios por minuto y pestaña visible: se reduce SQL y payload y se agrupan ráfagas. Se añadieron 45 pruebas aprobadas; frontend completo 252/252. Backend conserva tres fallos de entorno ya reproducidos en la referencia. No se modificaron mensajes empresariales para medir.

## B. Bandeja de entrada

| Operación | Problema | Cambio | Resultado |
|---|---|---|---|
| PERF-079, carga | Hidratación por varias consultas | JOIN parametrizado de asignación, mensaje y pedido | Página en un SELECT; mismo DTO |
| PERF-080, filtros | Lecturas viejas solo descartadas | AbortController y generaciones; filtros/página reiniciados juntos | Un GET por cambio efectivo, respuesta anterior descartada |
| PERF-081, página | Hidratación de cada página | Misma proyección JOIN | Se conserva OFFSET y navegación anterior/siguiente |
| Total | Transacción de página/count existente | Se conserva `$transaction([page,count])` | Dos SELECT dentro de la misma frontera; no se sustituyó por lecturas independientes |
| Sesión | Datos podían permanecer al cambiar API | Workspace remontado con scope API | Estado y cargas de otra sesión descartados |

Se conservan estado all/read/unread, orden latest/oldest, fecha/publicación con ID como desempate, total, totalPages, perPage máximo 100 y mensajes ocultos en la bandeja. Oculto solo excluye de la campana. Las fechas siguen usando el parser existente: inicio y final inclusivos, con final de día UTC 23:59:59.999 para YYYY-MM-DD. No se modifican zona horaria ni validaciones existentes.

Los DTO predeterminados mantienen contenido completo y los cuatro campos del pedido relacionado. No se añadió búsqueda ni se cambiaron páginas numeradas por cursor. La muestra de página inicial conserva 4828 bytes antes/después. Se comprobaron página vacía/profunda, ambos órdenes, filtros y rangos.

## C. Detalle de mensajes

PERF-082/083/084/085 pasan por `POST /api/messages/:messageId/open` al entrar al detalle desde bandeja, campana, toast o URL directa. La respuesta nueva es `{ message, markedAsRead }`. Se comprueba READ_MESSAGES; el controlador obtiene UPDATE_MESSAGES de la política/claims validados, nunca del body. Un lector sin permiso de modificación recibe su mensaje sin marcar y la interfaz muestra “Sin leer”.

El servicio reutiliza y valida currentUser, comprueba ID positivo y consulta la asignación usuario/mensaje. Si no existe devuelve 404. Si corresponde marcar, espera update y relectura autorizada; no muestra “Leído” antes de la respuesta. Una apertura repetida de un mensaje leído evita otra escritura. Si la asignación desaparece durante la operación, el resultado falla cerrado. No se presume una instantánea más fuerte ni se introducen bloqueos que no existían.

Antes, la apertura desde bandeja/campana esperaba PATCH y luego GET; una entrada directa no leída hacía GET y después PATCH. Ahora el navegador navega al estado de carga y emite un POST, sin una segunda solicitud de detalle/marcado. Abrir desde toast sigue el mismo detalle autorizado, sin precargar contenido privado. El GET existente continúa siendo de solo lectura y el PATCH anterior sigue protegido por UPDATE_MESSAGES.

Un error deja el estado de error y permite reintento explícito idempotente; no hay reintentos automáticos de escritura. Una respuesta atrasada de otra ruta/sesión no se muestra ni emite el evento de marcado en esa vista. Una petición ya enviada puede persistir la lectura aunque se abandone la ruta: descartar su respuesta no implica deshacer esa acción del usuario.

El JOIN de detalle conserva asunto, contenido, fecha, flags y pedido, siempre filtrando por ambos IDs. Lectura medida: tres SELECT → uno y 1968,204 → 658,336 ms, 388 bytes en ambos casos. La apertura completa con escritura no se midió contra datos reales.

## D. Campana

El repositorio obtiene página de no leídos/no ocultos y contador global mediante una sola sentencia: agregado total LEFT JOIN a la página limitada. Devuelve el cero correcto incluso sin filas. No calcula el contador contando las 50 filas visibles. Se conservan orden, límite máximo 50 y relaciones del contrato predeterminado.

La opción explícita `view=bell` devuelve asunto, fecha, ID, flags, preview normalizado de 82 caracteres y flag de truncamiento; omite cuerpo completo y pedido que el panel no usa. El texto mostrado coincide con el helper anterior, incluidos whitespace, Unicode y elipsis. El default del endpoint no cambia. El SQL todavía lee el cuerpo necesario para construir el excerpt: no se atribuye una reducción del tráfico DB a la truncación HTTP.

Se calcula SHA-256 de la vista pública compacta, contador y destinatario. El cliente puede enviar `revision`; si coincide, recibe `{ unchanged:true, revision, unreadCount }`. Cada petición sigue autenticando y consultando DB: no es una caché de autorización ni una respuesta 304 sin revalidación. Detecta reemplazo con igual contador, cambios visibles, lectura/ocultación y pertenencia. Un cambio fuera de la página que no afecta presentación ni contador no exige reenviar el mismo contenido.

En la muestra real (48 avisos visibles): default 19276 bytes; compacto 12261; sin cambios 113. El servicio pasa de cuatro SELECT a uno y 1963,526 → 663,334 ms. El HTTP medido utilizó un binding activo distinto, sin avisos: default 36 bytes, compacto 114, sin cambios 112. No se presenta ese caso vacío como medida de una campana poblada.

## E. Polling

Se mantiene intervalo 5000 ms. `createNotificationRefresh` permite una lectura en vuelo, reutiliza peticiones concurrentes y agrupa activaciones sin cambios dentro de 500 ms. Ese margen evita ráfagas de foco/visibilidad/apertura, no retrasa el sondeo ordinario de cinco segundos.

Un evento `messages:changed` marca invalidación pendiente. Durante una acción se aborta/descarta la lectura anterior y se pospone un refresco; al terminar se reconcilia inmediatamente, sin perder el evento hasta el siguiente intervalo. El bit pendiente se consume al iniciar la siguiente lectura y no genera un bucle autónomo. Cambios recibidos durante una lectura pueden justificar una sola continuación pendiente.

No se sondea mientras el documento está oculto, incluida su primera carga. Al volver visible/foco se consulta según las guardas y se consume la invalidación. Desmontaje aborta lecturas y retira listeners/intervalo. 401/403 vacían el estado y detienen polling hasta otra API/sesión; fallos de red permiten el siguiente sondeo ordinario, sin reintentos recursivos. 429 conserva la política del backend y no se usa para acelerar fallos.

El marcador no reemplaza IDs ni es un detector basado solo en el total. Una respuesta sin cambios conserva la lista, no reproduce sonido ni reanuncia toasts. El backend sigue siendo la fuente del contador.

## F. Múltiples pestañas

No se implementó líder, BroadcastChannel, SSE o WebSocket. La simulación de una/dos/tres instancias visibles conserva 12/24/36 lecturas ordinarias por minuto, con estado independiente y sin compartir cuerpos/tokens/permisos. Una coordinación solo de señales no eliminaría el sondeo de cada pestaña; compartir datos o liderazgo requiere probar aislamiento, permisos, expiración y recuperación. No se adoptó una plataforma de sincronización sin verificar esas garantías.

El beneficio demostrado se aplica por solicitud y por pestaña: menos SQL y payload. Las pruebas de scheduler/React comprueban aislamiento, desmontaje, cambios de API y resultados viejos. La matriz de pestañas es de tiempo virtual, no una certificación de varias ventanas reales del navegador ni de suspensión/elección de líder. Esa limitación no se oculta.

## G. Ocultar y limpiar

PERF-090 conserva validación de actor, asignación usuario/mensaje, idempotencia y ocultación lógica. La actualización usa updateMany acotado por ambos IDs y relee con el JOIN autorizado. El servicio devuelve 404 si ya no existe la asignación. No se elimina la comprobación de propiedad ni se afecta a otros destinatarios.

La fila desaparece visualmente solo tras confirmación. No se decrementa un contador potencialmente obsoleto: se consulta el snapshot exacto. Ante error/timeout se informa y se reconcilia por lectura, sin reenviar la mutación. Una lectura previa no puede reaparecer sobre el resultado de la acción.

PERF-091 conserva un único updateMany por usuario y oculto=false, incluyendo asignaciones leídas según el contrato previo. No hay bucle por aviso ni borrado de mensajes. En UI solo se retiran IDs conocidos tras confirmación, no se fuerza contador cero, y se lee el snapshot final. Un aviso posterior al corte del UPDATE permanece disponible; los que existen al ejecutar el UPDATE siguen su semántica original. Cerrar el panel no cancela la escritura ni vuelve a abrirlo con su respuesta.

Se probaron repetición, actor distinto, fallos de actualización, doble clic y aviso concurrente tras limpiar. Las duraciones de escritura y concurrencia InnoDB reales no se certifican sin base aislada.

## H. Toasts y sonido

PERF-092 conserva `collectNewNotifications`: inicializa watermark sin avisar por todo el histórico y anuncia IDs nuevos FIFO una vez. El marcador de polling detecta cambios aunque el total coincida. Cada toast mantiene texto genérico “Nuevo mensaje recibido.” y navegación al detalle; no contiene cuerpo privado. Un callback de un scope desmontado no navega en otra sesión. Se conserva el límite de la página y la política previa de watermark creciente: no se reconstruye historial de toasts por asignaciones tardías de IDs antiguos; los mensajes completos siguen en bandeja.

PERF-093 no se reescribió: AudioContext se desbloquea tras interacción, se respeta suspensión del navegador, se reproduce una señal por lote y se desconectan oscilador/gain al terminar. Cleanup retira listeners y cierra el contexto. Se probaron desbloqueo, reproducción, cierre y navegador sin audio; no se fuerza audio bloqueado.

La campana permite cerrar con Escape y devuelve foco al botón. Se conservan indicadores de carga/error y diseño. La revisión con 50 avisos detectó un problema previo a 576 px (panel 24 px fuera por la izquierda): el posicionamiento fijo que ya se usaba en móvil se extiende hasta 991,98 px dentro del CSS de la campana, sin estilos globales ni cambios cosméticos.

## I. Tabla de rendimiento

Medianas de diez muestras calientes secuenciales por serie, pausa de 250 ms fuera del reloj. Proceso Node 24.19.0 en Windows con cliente/adaptador Prisma 7.10.0, TLS estricto y pool 10 existentes. Docker no estaba disponible; los diagnósticos usaron procesos nativos de lectura. No se modificó infraestructura.

| Operación | Antes (ms) | Después (ms) | Mejora | Muestras | ¿Cumple 1 s? |
|---|---:|---:|---:|---:|---|
| Bandeja, servicio | 2415,224 | 1534,288 | 36,5 % | 10 + 10 | No |
| Filtro unread/oldest, servicio | 2387,155 | 1534,745 | 35,7 % | 10 + 10 | No |
| Página 2, servicio | 2413,822 | 1535,202 | 36,4 % | 10 + 10 | No |
| Notificaciones pobladas, servicio | 1963,526 | 663,334 | 66,2 % | 10 + 10 | Mediana interna <1 s; p95/E2E sin certificar |
| Notificaciones vacías, repositorio | 1964,905 | 659,738 | 66,4 % | 10 + 10 | Solo mediana de lectura |
| Detalle autorizado, repositorio | 1968,204 | 658,336 | 66,6 % | 10 + 10 | Solo mediana de lectura |
| Campana compacta, servicio | — | 659,433 | Contrato optativo | 10 | Solo mediana de lectura |
| Poll sin cambios, servicio | — | 658,889 | Menos payload, mismo SQL | 10 | Solo mediana de lectura |
| Bandeja vacía, HTTP | 3083,429 | 2206,403 | 28,4 % | 10 + 10 | No |
| Notificaciones vacías, HTTP | 2547,383 | 1320,899 | 48,1 % | 10 + 10 | No |
| Campana compacta vacía, HTTP | — | 1333,844 | Optativo | 10 | No |
| Sin cambios, HTTP | — | 1326,849 | Menos payload | 10 | No |
| Abrir/marcar leído, flujo con escritura real | No medido | No medido | Una solicitud de apertura en UI | 0 reales | Sin certificar |
| Ocultar/limpiar, escritura real | No medido | No medido | Relecturas menores y contador reconciliado | 0 reales | Sin certificar |

La referencia tiene 49 asignaciones, 12 mensajes en la primera página y 48 no leídos visibles. No se presenta como un volumen productivo. Se compararon ocho combinaciones de bandeja, tres límites de notificaciones y un acceso no asignado: doce casos etiquetados con igualdad estricta. La prueba sintética cubre 0/1/10/50/500/5000 asignaciones con página acotada y contador completo; no es una medición de rendimiento SQL con miles de filas.

[SQL](OPT-09_RENDIMIENTO_SQL.json) conserva valores individuales, mínimo/media/mediana/máximo, SELECT, bytes, planes e índices, sin cuerpos/IDs de usuarios en resultados. La [captura preliminar](OPT-09_LINEA_BASE.json) se tomó antes de modificar la implementación. Su control vacío serializado no representa Promise.all y está explícitamente excluido: la comparación final usa el paralelismo original.

[HTTP](OPT-09_RENDIMIENTO_HTTP.json) usa rutas/controladores reales, JWT/JWKS RS256 sintéticos locales, binding activo real de DB, capacidades y cuota de memoria 120/minuto. Excluye login/sesión real Keycloak, navegador/render, auditoría global de soporte y escrituras de cuota SQL. El destinatario HTTP no tenía avisos; no se extrapola esa captura a 50 mensajes.

La base de desarrollo es compartida y no se garantizó ausencia de otra actividad. El arranque HTTP coincidió con la fase final del diagnóstico SQL; no se atribuyen mejoras a pequeñas diferencias de sus muestras compactas. No se calcula p95 con diez muestras ni se suman series distintas como E2E. Token, adquisición de conexión, espera de transacción, SQL de escritura, commit y render no se cronometraron por separado.

## J. Reducción de consultas

| Función | SELECT antes | SELECT después | Cambio |
|---|---:|---:|---|
| Página de bandeja | 3 | 1 | JOIN autorizado |
| Página + total en transacción | 4 | 2 | Count y frontera transaccional conservados |
| listNotifications + count en servicio | 4 | 1 | Snapshot de página/count en una sentencia |
| findUserMessage | 3 | 1 | JOIN filtrado por par usuario/mensaje |
| countUnreadNotifications aislado | 1 | 1 | Ya era apropiado; sin cambio |
| HTTP bandeja | 5 | 3 | Incluye identidad validada una vez |
| HTTP notificaciones | 5 | 2 | Incluye identidad validada una vez |
| Marcado/ocultación completos | No medidos físicamente | No medidos físicamente | Lectura previa y posterior usan el JOIN; no se inventa conteo de escrituras |
| hideAllNotifications | Sin lectura propia | Sin lectura propia | Un updateMany conservado |

Son conteos físicos observados en esta versión/fixture, no una regla universal de todo Prisma. El contador no procede de la longitud de la página. La hidratación anterior agrupaba relaciones: no se la denomina N+1 sin evidencia por fila. La nueva sentencia tiene coste fijo en cantidad de viajes, aunque su trabajo interno crezca con asignaciones.

Se obtuvieron ocho EXPLAIN completos: acceso por prefijo de PRIMARY de MENSAJE_USUARIO, eq_ref a PK de Mensaje/Pedidos y consulta de detalle por el par. Hay temporary/filesort por orden entre tablas y un plan de fecha que escanea aproximadamente 92 mensajes. No demuestra necesidad de índices sobre este fixture. No se agregaron índices de flags ni DDL. Las interpolaciones utilizan Prisma.sql; dirección/fragmentos estáticos son constantes controladas y los valores del usuario se parametrizan. Los nombres físicos de flags son `leido?` y `oculto?`, conforme al @map de Prisma.

## K. Tráfico recurrente

Tabla **sintética**, ventana virtual [0,60000) con carga inicial; GET representa invocaciones del scheduler que producirían una petición. SELECT/min es una estimación derivada de esos GET y del conteo HTTP real 5 → 2, incluyendo identidad. No son una prueba de carga ni un minuto real de tráfico MySQL.

| Escenario | HTTP/min antes | HTTP/min después | SELECT/min antes | SELECT/min después |
|---|---:|---:|---:|---:|
| Una pestaña visible | 12 | 12 | 60 | 24 |
| Dos visibles | 24 | 24 | 120 | 48 |
| Tres visibles | 36 | 36 | 180 | 72 |
| Oculta desde montaje | 1 | 0 | 5 | 0 |
| Visible + ráfaga de tres eventos tras tick | 15 | 12 | 75 | 24 |

[Experimento reproducible](OPT-09_TRAFICO_SINTETICO.json): cincuenta mensajes sintéticos de cuerpo largo, 215017 bytes default, 11395 compacto y 113 sin cambios. En un minuto estable de una pestaña: 2580204 → 12638 bytes simulados (primera respuesta compacta y once sin cambios); dos: 5160408 → 25276; tres: 7740612 → 37914. No se extrapolan esos cuerpos sintéticos a mensajes reales.

Introducir una novedad virtual en 12001 ms lleva al tick de 15000 ms: espera 2999 ms antes de solicitar, tanto antes como después. Excluye latencia HTTP/SQL/render y no es tiempo real de entrega medido. El HTTP real por sondeo quedó en 1320–1334 ms. No se alargó el intervalo para reducir tráfico. Reconexión, visibilidad, ráfaga, invalidación pendiente y nuevos IDs con el mismo contador están cubiertos por pruebas. No se ejecutó una prueba de saturación ni se promete coordinación real entre pestañas.

## L. Seguridad

La reutilización de req.currentUser de Fase 1 permanece en las seis operaciones anteriores y en la apertura nueva: actor separado de query/body, ID válido, subject coincidente y estado activo. Las llamadas internas sin contexto conservan resolución de repositorio. No se creó otro caché de identidad/permisos ni se modificó su JOIN.

Cada lectura/escritura usa el destinatario validado. GET no marca; POST open solo marca si la política concede UPDATE_MESSAGES. Los PATCH anteriores conservan su capability. Crear/asignar mantiene transacción y deduplicación de destinatarios; limpiar sigue siendo batch por usuario. No se elimina auditoría ni creación de mensajes de negocio.

Las pruebas de Fase 1 vuelven a comprobar firma JWT, issuer/audience/expiry, subject, binding removido/deshabilitado, roles, pertenencia y 429. Las nuevas prueban inyección por body, ID manipulado, usuario distinto, lectura sin permiso de marcado, repetición, fallo de persistencia y rollback de creación/asignación. No se hicieron escrituras empresariales ni intentos con cuentas/PIN reales.

## M. Compatibilidad

Se conservan GET `/api/messages`, GET `/notifications`, GET `/:messageId`, PATCH `/:messageId/read`, PATCH `/notifications/:messageId` y PATCH `/notifications`, sus DTO por defecto y controles. El método getNotifications admite repositorios inyectados anteriores mediante su par list/count si carecen del snapshot nuevo; no modifica resolución de actor.

Extensiones explícitas: GET notifications `view=bell` y `revision`; POST `/:messageId/open`, con `{message,markedAsRead}`. Se actualizaron los consumidores reales (Inbox, Detail, Bell y factory API). El cliente conserva GET de detalle y PATCH de lectura para consumidores antiguos, no guarda cuerpos globalmente y solo pasa señales a lecturas; el POST/PATCH no se cancela como si garantizara rollback ni se reintenta automáticamente.

El scope numérico de API no contiene datos personales. Al cambiar API se remonta el estado, abortan GET y se descartan respuestas previas. Toasts no incluyen contenido privado. La fuente de mensajes de pagos, Kanban, usuarios, producción y pedidos no cambia: relación pedido, fecha, contenido, flags iniciales, asignaciones y transacciones permanecen. Las suites completas ejercitan sus regresiones existentes. Fuera de Mensajes solo se adaptaron fixtures/test de layout al endpoint nuevo; no se modificó arquitectura de identidad.

## N. Pruebas

| Comprobación | Referencia 755ce1e | OPT-09 |
|---|---|---|
| Backend completo | 216: 213 pasan, 3 fallan | 239: 236 pasan, mismos 3 fallos |
| Frontend completo | 230/230 | 252/252 |
| Pruebas nuevas | — | 45/45: 23 backend + 22 frontend |
| Fase 1 + pruebas nuevas iniciales | — | 34/34 en ejecución focalizada |
| Equivalencia real | — | 12 casos estrictos |
| Lint / build / Prisma validate | — | Aprobados |
| Responsive página, Edge | — | 34 escenarios, cero overflow |
| Campana con 50 avisos, Edge | — | 34 escenarios, cero overflow tras corrección tablet |
| Diff protegido / diff --check | — | Sin cambios ajenos / aprobado |

Comandos desde cada carpeta:

```text
# capaServidor
node --test
node --test test/messagePerformance.test.js test/phase1Identity.test.js test/phase1Security.test.js
npm.cmd run prisma:validate
node --env-file=.env scripts/benchmarkMessagesOpt09.mjs --allow-development-reads --reference-root=<checkout-755ce1e> --baseline-only --output=<baseline.json>
node --env-file=.env scripts/benchmarkMessagesOpt09.mjs --allow-development-reads --reference-root=<checkout-755ce1e> --output=<sql.json>
node --env-file=.env scripts/benchmarkMessagesOpt09.mjs --allow-development-reads --reference-root=<checkout-755ce1e> --http-only --output=<http.json>
node scripts/benchmarkMessageTrafficOpt09.mjs --output=<trafico-sintetico.json>

# capaVista
npm.cmd test
npm.cmd test -- src/modules/messages
npm.cmd run lint
npm.cmd run build

# raíz
node scripts/verify-page-layout.mjs inbox,message-detail
git diff --check
```

Las lecturas requieren APP_ENV=development y opt-in, mismo perfil TLS/pool y checkout compatible. Los JSON no guardan cuerpos privados, subjects, tokens o credenciales. Las matrices sintéticas no abren DB.

Los tres fallos se reprodujeron antes de modificar: mysqlDeployment (texto LF frente a CRLF), mysqlLabAccounts (modo POSIX 0600 en Windows) y mysqlLabMigrationHistory (hash sensible a CRLF). No se alteraron esos tests, compose o migraciones. No se observaron nuevas regresiones.

MessageLoading conserva las aserciones de respuesta fuera de orden y ahora verifica una apertura única en lugar de PATCH previo + GET. PageMigration inyecta también fallo de POST, manteniendo sus aserciones de error y banner. El fixture visual responde únicamente a la apertura de un mensaje sintético; el resto de escrituras de revisión visual sigue rechazado. No se eliminaron aserciones de autorización para obtener verde.

La verificación nativa cubre 320–1920 px, sidebar, títulos/zoom y panel con cincuenta avisos. La campana conserva cierre exterior y añade Escape/foco. No se certifica manualmente lector de pantalla ni experiencia auditiva física: se prueban roles, etiquetas, foco, ausencia de cuerpo en toast y recursos de audio con dobles.

Docker no estaba disponible; no hubo MySQL aislado ni usuario de ensayo para marcar/ocultar/limpiar reales, probar contención o caída después de commit. Los casos de persistencia fallida y creación transaccional son dobles restaurables. Los escenarios de varias pestañas son instancias/tiempo virtual, no ventanas reales bajo suspensión del navegador. Las limitaciones se mantienen explícitas y no impidieron implementar/validar el resto del alcance.

## O. Archivos modificados

Editados:

- `capaServidor/src/modules/messages/repo/message.repo.js`: lecturas JOIN, snapshot, actualizaciones acotadas; transacciones conservadas.
- `capaServidor/src/modules/messages/service/message.service.js`: vista compacta/revisión, apertura explícita y 404 ante asignación desaparecida.
- `capaServidor/src/modules/messages/controller/message.controller.js`: permiso de marcado derivado del request validado.
- `capaServidor/src/modules/messages/routes/message.routes.js`: POST open protegido; rutas anteriores intactas.
- `capaVista/src/modules/messages/api/messagesApi.js`: scope, GET cancelables, opciones compactas y POST explícito.
- `capaVista/src/modules/messages/components/NotificationBell.jsx`: scheduler, reconciliación, sesión, apertura, toasts y Escape.
- `capaVista/src/modules/messages/components/NotificationBell.module.css`: corrección acotada del panel a 576–991,98 px.
- `capaVista/src/modules/messages/pages/MessageInboxPage.jsx`: GET cancelables, scope y navegación sin PATCH previo.
- `capaVista/src/modules/messages/pages/MessageDetailPage.jsx`: apertura única, respuesta confirmada y estado de lectura real.
- `capaVista/src/modules/messages/pages/MessageLoading.test.jsx`: regresiones adaptadas a apertura consolidada.
- `capaVista/src/modules/messages/utils/messageFormatters.js`: excerpt compacto equivalente al anterior.
- `capaVista/src/shared/components/layout/PageMigration.test.jsx`: conserva error de detalle con POST.
- `capaVista/verify/pageFixtures.js`: respuesta de apertura exclusivamente sintética.

Nuevos:

- `capaServidor/src/modules/messages/repo/messageRead.repo.js`: SQL parametrizado y mapper equivalente.
- `capaServidor/test/messagePerformance.test.js`: 23 pruebas backend.
- `capaServidor/scripts/benchmarkMessagesOpt09.mjs`: baseline/comparación de lecturas, planes y equivalencia.
- `capaServidor/scripts/messageHttpProbeOpt09.mjs`: HTTP protegido, solo lectura.
- `capaServidor/scripts/benchmarkMessageTrafficOpt09.mjs`: simulación recurrente acotada.
- `capaVista/src/modules/messages/utils/notificationRefresh.js`: lectura única, coalescencia e invalidación pendiente.
- `capaVista/src/modules/messages/utils/notificationRefresh.test.js`: cinco casos de scheduler/excerpt.
- `capaVista/src/modules/messages/components/NotificationPerformance.test.jsx`: nueve casos de campana.
- `capaVista/src/modules/messages/pages/MessagePerformance.test.jsx`: cuatro casos de detalle/bandeja.
- `capaVista/src/modules/messages/api/messagesApi.test.js`: dos casos de contratos/señales.
- `capaVista/src/modules/messages/hooks/useMessageSound.test.jsx`: dos casos de audio/cleanup.
- `docs/OPT-09_BANDEJA_NOTIFICACIONES_RENDIMIENTO.md`: este informe.
- `docs/OPT-09_LINEA_BASE.json`: captura previa, con control vacío serializado identificado.
- `docs/OPT-09_RENDIMIENTO_SQL.json`: lecturas antes/después, equivalencia, planes e índices.
- `docs/OPT-09_RENDIMIENTO_HTTP.json`: rutas protegidas de lectura.
- `docs/OPT-09_TRAFICO_SINTETICO.json`: llamadas/bytes y detección virtual.
- `docs/OPT-09_RESPONSIVE.json`: geometría de bandeja/detalle.
- `docs/OPT-09_CAMPANA_RESPONSIVE.json`: geometría del panel con cincuenta avisos.

No se eliminan archivos versionados. Se retiran checkout, junctions, zip y arnés temporal. Los procesos nativos cierran Prisma/HTTP/navegador; no se creó ni inició un contenedor. La limpieza del contenedor OPT-02 anteriormente pendiente no forma parte de una acción nueva sobre Docker.

## P. Alternativas descartadas

No se añadió caché global de identidades, permisos o mensajes; no hay localStorage de cuerpos. Un contador por sí solo no sirve como detector: se descartó en favor del hash de la vista autorizada. No se eligió ETag/304 sin leer DB ni se pretendió que “sin cambios” elimina SQL.

Se conservaron OFFSET, transacción de bandeja, count global y batch clear. No se cambiaron TLS, pool, protocolo, schema, timeout, Keycloak o índices sin evidencia. No se activó relationJoins Preview ni se añadieron dependencias. No se reescribió sonido ni se usó React.memo/virtualización indiscriminadamente. Se descartó coordinación de líder/BroadcastChannel por no tener beneficio y recuperación/aislamiento suficientemente probados; no se transmiten datos privados entre pestañas.

Referencias contrastadas: [Prisma 7, select](https://www.prisma.io/docs/orm/v7/prisma-client/queries/select-fields), [paginación](https://www.prisma.io/docs/orm/v7/prisma-client/queries/pagination), [MySQL EXPLAIN](https://dev.mysql.com/doc/refman/8.4/en/explain.html), [Page Visibility](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API) y [BroadcastChannel](https://developer.mozilla.org/en-US/docs/Web/API/Broadcast_Channel_API).

## Q. Conclusión

Abrir bandeja mejora 36,5 % en servicio y 28,4 % en HTTP vacío. Consultar notificaciones mejora 66,2 % en servicio poblado y 48,1 % en HTTP vacío. El detalle autorizado mejora 66,6 % en su lectura; abrir/marcar se concentra en una solicitud, pero su escritura real no se cronometró. Marcar/ocultar reducen las hidrataciones previas/posteriores y limpiar conserva su batch; no se inventan mejoras temporales de esas escrituras.

Se eliminan dos SELECT de bandeja, tres de notificaciones y dos de detalle en las muestras. El polling ordinario permanece en doce oportunidades por minuto/pestaña, con menor SQL/bytes y tres llamadas menos en la ráfaga sintética probada. La estimación de SQL completo recurrente cae de 60 a 24/min por pestaña visible, no una medición de saturación. La detección conserva cinco segundos y se recuperan invalidaciones antes perdidas durante acciones.

Las medianas internas de notificaciones/detalle están bajo un segundo; la bandeja y todos los HTTP medidos siguen sobre él. Ningún flujo se certifica con p95 ≤1000 ms. MySQL remoto, identidad secuencial, frontera transaccional, render, escrituras y contención reales requieren mediciones adicionales en un entorno aislado adecuado.

Listo para revisión e integración controlada en desarrollo con tres fallos de entorno documentados, sin nuevas regresiones observadas. No equivale a certificación E2E, de múltiples ventanas reales o de concurrencia MySQL. Se entregan cambios locales y evidencias, sin commit/push/despliegue.

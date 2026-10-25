# Fase 05: Ventas, Cobranzas, historial, métricas, PIN y mensajes

Fecha: **25-10-2026**, America/Santiago. Repositorio empresarial Itecsa_app_LAN; rama POC/KEYCLOAK; base **e74a9142a8fc4dda00bf8c14bce07bf4f1557ad3**, árbol inicialmente limpio. Autorización actual: «ya ahora seguimos con la fase 5». Este documento registra únicamente esa fase y la regresión acumulada. No se reanuda la integración con Ubuntu descartada anteriormente ni se continúa a 06.

**Resultado:** fase implementada y verificada en laboratorio aislado. Se conservan contratos de negocio, matriz, actores, PIN y dependencias externas. Se corrigieron defectos de estado visual entre sujetos, contacto local y manejo de conflictos concurrentes. Quedan pendientes aceptación empresarial, configuración del servidor real, pruebas offline e incidente original de refresh. Cambios locales revisables, sin nuevo commit, push o despliegue.

## Alcance, procedencia y aislamiento

La fase sigue el apartado 05 del plan maestro: ventas y fuente comercial, cobranzas y revisiones, historial, métricas, PIN, mensajes y contacto de privacidad/incidentes. La política continúa siendo la de [07](07_DECISIONES_APROBADAS.md), sin cambiar ninguna de sus 225 celdas ni los 25 identificadores de capacidades. El estado general está en [06](06_PLAN_MAESTRO_Y_ESTADO.md) y las pruebas acumuladas en [09](09_MATRIZ_PRUEBAS_ACUMULADAS.md).

Las pruebas reales usan Keycloak 26.8.1 y MySQL 8.4.13 efímeros, red Docker interna, bases tmpfs y cuentas sintéticas. Los runners reciben fuentes/test/shared/scripts de solo lectura. No leen .env ni Compose empresariales, no publican puertos de Keycloak/MySQL, no contactan Ubuntu, Aiven, Manager, Auth0 o Resend. La prueba de navegador usa Vite con envDir:false, puerto aleatorio en loopback y perfil propio; su API/contexto de identidad son sintéticos. No se presenta como login SSO completo.

Las nueve notas de prueba se escriben únicamente en la capa efímera de la imagen runner, en /app/capaServidor/data/demo/sales-notes-fixture.json. Ese archivo no se monta desde el host; se restauran sus bytes y SALES_NOTE_SOURCE al terminar. La guarda exige APP_ENV=test, RUN_KEYCLOAK_BUSINESS_INTEGRATION=true, DB_HOST=phase02-mysql y la base itecsa_identity_phase02_test. Se usa la fuente fixture ya existente únicamente en ese laboratorio. La integración Manager y los datos comerciales del repositorio y de la empresa permanecen intactos.

## Correcciones y justificación

| ID | Archivo / símbolo | Antes y evidencia | Cambio y efecto |
|---|---|---|---|
| F05-01 | capaVista/src/shared/components/layout/Topbar.jsx; Topbar / NotificationBell | Al cambiar de sujeto con el mismo encabezado montado, seguían visibles notificaciones de la cuenta anterior hasta el siguiente polling. Reproducción roja en navegador | La key de la campana incluye proveedor y sub. React desmonta su estado y efectos al cambiar de identidad; desaparecen contenido/popup previos y una respuesta pendiente antigua no contamina la cuenta nueva. No cambia intervalos ni contratos HTTP |
| F05-02 | capaServidor/src/modules/auth/controller/auth.controller.js; createVerifyAuthSessionHandler | Keycloak no sintetiza el claim de correo Auth0. Verify podía devolver email:null aunque la identidad local validada tuviera contacto; DataRequestsPage consume user.email | Keycloak devuelve correoUsuario local validado, recortado o null. Auth0 conserva su claim previo. Caso focal compara ambos orígenes; laboratorio comprueba contacto de los nueve roles y navegador verifica campo readonly. No se inventa correo ni se actualiza el registro |
| F05-03 | capaServidor/src/modules/clients/service/clients.service.js; findOrCreateClient | Dos creaciones de la misma nota con cliente nuevo devolvían 201/500. Error real P2002: modelo Cliente, constraint.index rut_cliente_UNIQUE | Solo ese conflicto conocido produce 409 con código CLIENT_CREATE_CONFLICT. La transacción revierte y el usuario puede actualizar/reintentar. No se sobrescribe ni reasigna un cliente, no se reintenta silenciosamente |
| F05-04 | capaServidor/src/modules/orders/service/salesOrderCreation.service.js; create; capaServidor/src/database/uniqueConstraint.js; isUniqueConstraint | El detector anterior contemplaba meta.target; el adapter actual informa el índice en meta.driverAdapterError.cause.constraint. Caso focal de duplicado falló antes del arreglo | Helper reconoce modelo/índice/campo exactos, conservando formatos anteriores. La nota duplicada mantiene el mensaje y 409 existentes. Errores desconocidos se propagan; no se clasifican todos los P2002 como duplicado de nota |
| F05-05 | capaServidor/src/modules/orders/service/orderPayment.service.js; updPaymentStateOperation | El rechazo de revisión resuelta mencionaba al antiguo Soporte también en modo Keycloak | Mensaje de permiso genérico para Keycloak; Auth0 conserva literalmente su texto anterior. La capacidad y las reglas de revisión permanecen iguales: AC/D revisan en la política nueva |

F05-03 y F05-04 tienen pruebas focales fallidas antes de corregir producción y comprobación SQL posterior. F05-02 se identificó por lectura del contrato y se verificó después del cambio; no se presenta como un test inicialmente rojo. El helper de unicidad rechaza modelos distintos, índices desconocidos, errores no P2002 y targets multicolumna. Sus límites son deliberados: no convierte deadlocks, desconexiones o fallos arbitrarios de SQL en conflictos de negocio.

El API client ya rechaza respuestas de otra sesión. F05-01 resuelve además el estado que la campana conservaba al estar montada, que ese control por sí solo no descartaba. Aplica a ambos proveedores; no modifica login, renovación, almacenamiento de tokens o logout.

## Recorrido revisado por módulo

Los nombres siguientes son relativos a capaServidor/src/modules o capaVista/src/modules. Cada fila identifica la cadena activa revisada; no cuenta coincidencias textuales como nuevas dependencias.

| Módulo | Entrada frontend y recorrido servidor | Resultado y cobertura |
|---|---|---|
| Ventas | orders/pages/OrderCreatePage.jsx → hooks/useOrdersApi.js → api/ordersApi.js; orders/routes/order.routes.js → controller/orders.controller.js → service/order.service.js, salesNoteSource.service.js, salesOrderCreation.service.js, salesOrder.validator.js, salesOrder.snapshot.js, salesOrder.transaction.js → repo/orderSalesNoteOperations.js | AV/OV/D consultan e ingresan notas y reevalúan. Nota duplicada 409, actor del sujeto autenticado, snapshots y destinatarios persistidos; fallo de mensaje revierte creación. Fuente indisponible 503 para actor autorizado y 403 para Soporte antes de consultar fuente |
| Clientes / productos | Consumo desde creación; clients/routes/clients.routes.js → service/clients.service.js → repo/clients.repo.js; products/routes/product.routes.js → service/product.service.js | Cliente por ID restringido a Ventas/D; catálogo de productos conserva read:orders. Carrera RUT conocida 409, no 500. Manager no se consulta |
| Cobranzas | payments/pages/PaymentConfirmationPage.jsx → hooks/usePaymentsApi.js → api/paymentsApi.js; orders/routes/order.routes.js → orders.controller.js → orderPayment.service.js → repo/orderPaymentOperations.js y orderNotificationOperations.js; catálogos payments/routes/paymentStatus.routes.js y paymentRecord.routes.js con sus controllers/services/repos | Lectura AC/OC/D; cambio ordinario AC/OC/D y revisión resuelta AC/D. PIN y actor local independientes del body; dueño original permanece; un registro concurrente, reglas de resolución y rollback conservados |
| Historial | orderHistory/pages/OrderHistoryPage.jsx y OrderHistoryDetailPage.jsx → hooks/useOrderHistoryApi.js → api/orderHistoryApi.js; history/routes/orderHistory.routes.js → controller/orderHistory.controller.js → service/orderHistory.service.js → repo/orderHistory.repo.js | Soporte denegado. Observaciones financieras restringidas a Cobranzas/D; actor histórico no se reemplaza. Dos páginas reales sin repetir evento, cursor inválido 400; filtros/DTOs mantienen regresión existente |
| Métricas | metrics/pages/MetricsPage.jsx → hooks/useMetricsApi.js → api/metricsApi.js; metrics/routes/metrics.routes.js → controller/metrics.controller.js → service/metrics.service.js → repo/metrics.repo.js | AP/G/D autorizados, resto denegado. SQL devuelve 17 unidades en rango conocido y rechaza fecha imposible. Los otros filtros/DTOs conservan sus pruebas previas; no acredita exactitud contra datos comerciales reales |
| PIN | payments/components/PaymentCredentialsModal.jsx y flujo PIN existente; auth/routes/auth.routes.js → auth.controller.js → pin.service.js / pinDelivery.service.js; middlewares/requirePin.js | Algoritmos, llaves, PIN_SECRET, hash/cifrado, acuse, intentos, bloqueo y actor intactos. Se comparte en memoria el PIN legítimo ya obtenido en 04, sin revelarlo otra vez después del acuse. Debug reset denegado a los nueve roles Keycloak. No se utiliza como contraseña Keycloak ni se rediseña recuperación |
| Mensajes | messages/pages/MessageInboxPage.jsx y MessageDetailPage.jsx; components/NotificationBell.jsx y MessagePopup.jsx → hooks/useMessagesApi.js → api/messagesApi.js; messages/routes/message.routes.js → controller/message.controller.js → service/message.service.js → repo/message.repo.js | Todos los roles tienen bandeja propia, incluido Soporte. Creación automática y destinatarios AP/AC comprobados; consulta/marcado/ocultación de notificación ajena 404. Lectura y limpieza propias funcionan. Polling/popup conservados; nuevo ensayo descarta estado y respuestas del sujeto anterior. No se añade chat |
| Privacidad | privacy/pages/DataRequestsPage.jsx → hooks/useDataRequestForm.js / usePrivacyApi.js → api/privacyApi.js; privacy/routes/privacy.routes.js → controller/privacy.controller.js → service/privacyRequest.service.js → validators/privacyRequest.validator.js / repo/privacySubmission.repo.js | Contacto local validado, campo readonly, contacto ajeno 400. Canal apagado 503. Con delivery doble y SQL/JWT reales: sujeto local, solicitud sent, repetición propia no reenvía y mismo ID de otro sujeto 409 |
| Incidentes | security/pages/IncidentReportPage.jsx → hooks/useIncidentConfiguration.js / useIncidentReportForm.js / useIncidentReportsApi.js → api/incidentReportsApi.js; security/routes/incidentReport.routes.js → controller/incidentReport.controller.js → service/incidentReport.service.js → validators/incidentReport.validator.js / repo/incidentReport.repo.js | Configuración devuelve contacto local; canal apagado 503. Con delivery doble se comprueban deduplicación y eventos de auditoría vinculados al actor. No cambia transporte Resend, retención ni recuperación |

Los controllers obtienen actor del sujeto/usuario local validado o req.pinActor según la operación. La prueba envía IDs y objetos de actor ajenos; los registros persistidos conservan al usuario autenticado, y Pedidos.id_usuario sigue representando al responsable original. El nombre heredado id_auth0 sigue siendo el campo de sujeto: no se renombra el esquema ni se migran identidades históricas por nombre.

Los destinatarios automáticos se contrastan contra todas las filas locales AP/AC no Desvinculado del fixture, incluida una cuenta adicional válida de pruebas de permisos excesivos. No se restringió el resultado artificialmente a las nueve cuentas principales. Esto verifica el contrato actual, sin aprobar una nueva política de envío a cuentas inactivas.

## Matriz observada: 15 operaciones por nueve roles

AP/AV/AC: administradores Producción/Ventas/Cobranzas; OP/OV/OC: operarios; G: Gerencia; D: Desarrollador; S: nuevo Soporte. ✓ significa respuesta válida con identidad y datos de prueba correctos; — significa 403. Las mutaciones siguen exigiendo PIN y estado cuando corresponde. Un permiso por rol no sustituye los otros controles.

| Operación HTTP del fixture | AP | AV | AC | OP | OV | OC | G | D | S |
|---|---|---|---|---|---|---|---|---|---|
| GET /orders/sales-notes/:numero | — | ✓ | — | — | ✓ | — | — | ✓ | — |
| GET /clients/:id | — | ✓ | — | — | ✓ | — | — | ✓ | — |
| GET /products | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| GET /orders/payments | — | — | ✓ | — | — | ✓ | — | ✓ | — |
| GET /history/orders | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| GET /metrics/summary | ✓ | — | — | — | — | — | ✓ | ✓ | — |
| GET /metrics/production-performance | ✓ | — | — | — | — | — | ✓ | ✓ | — |
| GET /messages | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| GET /messages/notifications | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| GET /auth/verify | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| POST /auth/pin/debug-reset | — | — | — | — | — | — | — | — | — |
| POST /orders | — | ✓ | — | — | ✓ | — | — | ✓ | — |
| PATCH /orders/:id/reevaluate | — | ✓ | — | — | ✓ | — | — | ✓ | — |
| PATCH /orders/:id/payment-status, pendiente | — | — | ✓ | — | — | ✓ | — | ✓ | — |
| PATCH /orders/:id/payment-status, resuelto | — | — | ✓ | — | — | — | — | ✓ | — |

**135 decisiones: 69 permitidas, 66 denegadas.** No son 135 endpoints diferentes: los dos casos de pago comparten ruta y difieren por estado. El resto de escenarios negativos, concurrencia y SQL se agrega aparte; no infla este conteo. El catálogo de capacidades canónico no cambia.

## Persistencia, atomicidad y fallos

Se comprueban en SQL real Pedidos, Cliente, detalles/snapshots, Registros, mensajes y sus destinatarios, PrivacySubmission y SecurityAuditEvent mediante los modelos Prisma actuales. La autorización del proveedor no reasigna las PK/FK de actores o responsables. Las nuevas identidades del laboratorio se vinculan explícitamente, no por coincidencia del nombre visible.

- Creación concurrente con cliente nuevo: una respuesta 201 y otra 409; un pedido y un registro, actor del ganador.
- Creación concurrente con cliente existente: 201/409 y un pedido; la detección del índice de nota conserva el mensaje de duplicado.
- Error de creación del mensaje de ventas: rollback del pedido; error de notificación de pago: rollback del estado y su registro. Se inyecta únicamente ese fallo para verificar la transacción real, sin sustituir repositorios por mocks.
- Dos confirmaciones concurrentes de pago: respuestas 200 o 409 conforme al contrato idempotente existente, un solo registro. Pago resuelto no vuelve a Pendiente; OC no revisa una decisión resuelta.
- PIN ausente devuelve 400; PIN de otra persona 403, sin registros de negocio. El contador de intentos de seguridad puede cambiar ante PIN erróneo y se conserva.
- Historial con dos registros financieros: el cursor no repite evento; filtrado financiero se mantiene también en la segunda página. No se demuestra una migración histórica real que no se ha ejecutado.
- Privacidad/incidentes: SQL y JWT reales, delivery externo inyectado como doble. Se verifica sujeto y deduplicación; no se afirma envío real por Resend ni entrega offline.

Los límites de [12](12_EVIDENCIA_Y_VERIFICACION_FASE_04.md) siguen abiertos: capacidad operativa Lanyard constante frente a capacidad configurada, atomicidad no acreditada de fecha con auditoría, relectura después de commit que puede fallar y respuestas perdidas no ensayadas en todos los endpoints. Esta fase no promete rollback universal ni resuelve esas reglas ajenas a identidad.

## Archivos de esta fase

| Archivo | Motivo |
|---|---|
| capaServidor/src/database/uniqueConstraint.js (nuevo) | Reconocimiento estricto compartido de conflictos de unicidad conocidos |
| capaServidor/src/modules/clients/service/clients.service.js | Conflicto concurrente del RUT a 409 |
| capaServidor/src/modules/orders/service/salesOrderCreation.service.js | Compatibilidad con metadatos de índice del adapter actual |
| capaServidor/src/modules/orders/service/orderPayment.service.js | Mensaje correcto para la política Keycloak, conservando Auth0 |
| capaServidor/src/modules/auth/controller/auth.controller.js | Contacto local en verify Keycloak |
| capaVista/src/shared/components/layout/Topbar.jsx | Descartar estado de notificaciones al cambiar proveedor/sujeto |
| capaServidor/test/businessIdentity.test.js (nuevo) | Cuatro regresiones focales de conflictos y contacto por proveedor |
| capaServidor/test/fixtures/keycloakBusiness.mjs (nuevo) | Matriz de negocio, SQL, PIN, concurrencia, rollback, privacidad y fallos |
| capaServidor/test/fixtures/keycloakProduction.mjs | Retornar actores/PIN legítimos en memoria al fixture 05, sin resetearlos |
| capaServidor/test/keycloak.real.integration.test.js | Invocar 05 solo con opt-in y después de 04 |
| scripts/keycloak-phase02-lab.mjs | Opción --business dependiente de --production; preserva los modos anteriores |
| capaVista/test/business.browser.html y business.browser.jsx (nuevos) | Pagos por nueve roles, cambio de sujeto/respuesta tardía y contacto verificado |
| scripts/keycloak-phase03-browser.mjs | Añadir las dos pasadas de negocio, manteniendo regresiones anteriores |
| docs/migracion-lan/06_PLAN_MAESTRO_Y_ESTADO.md, 07_DECISIONES_APROBADAS.md, 09_MATRIZ_PRUEBAS_ACUMULADAS.md y este 13 | Autorización, estado, evidencia, justificación y reproducción |

Son **18 archivos: 12 modificados y 6 nuevos**; seis contienen cambios de ejecución de aplicación, los restantes son pruebas, orquestación y documentación. No se modifican dependencias/lockfiles, esquema Prisma, migraciones, Dockerfiles/Compose/workflows, .env, matriz compartida, algoritmos/secretos PIN, servicios Auth0, pruebas físicas originales ni evidencias históricas 01–05/08/10–12. No se escribe en el repositorio universitario.

## Resultados finales y límites de los conteos

| Ejecución | Resultado observado |
|---|---|
| Suite backend completa, contenedor sin red | **1124 contabilizadas: 1120 aprobadas, 4 omitidas, 0 fallos** |
| Cuatro pruebas focales nuevas | Incluidas en las 1120; no se vuelven a sumar |
| Keycloak/MySQL real, ejecución inicial acumulada | **58 aprobadas**, 0 fallos; incluye padres, las pruebas 02–04 y 17 subtests de negocio de 05 |
| Reinicio del Keycloak efímero y nuevo Code+PKCE | **2 aprobadas** |
| Regresión física original MySQL | **1 aprobada** en segundo MySQL efímero |
| Cuotas/rollback físicos originales MySQL | **2 aprobadas** en esa base separada |
| Suite frontend | **51 node:test aprobadas** y SSR acumulados: 411 verificaciones de navegación, 251 de identidad y SSR previo |
| Browser nuevo de 05 | **29 checks a 1440×1000 y 29 a 390×844**, nueve roles, cero errores JS |
| Browser acumulado | Producción: 70 + 70; navegación: 243 + 243; authSession, metrics y paymentPin: PASS |
| Scripts | **25 aprobadas**, sin llamadas a servicios empresariales |
| ESLint / build production | Exit 0 / exit 0; **564 módulos**, chunk principal **499,08 kB**; salida temporal dentro del contenedor |
| Sintaxis | **148** fuentes backend/shared/scripts y cuatro tests/helpers revisados sin errores |
| Integridad y documentación | 18 archivos previstos; índice sin cambios staged; HEAD e74a914. Enlaces locales válidos en **72 documentos**, git diff --check sin errores |
| Limpieza Docker | Sin contenedores/redes residuales con etiquetas de laboratorio; API/web preexistentes siguen ejecutándose en sus puertos loopback 3000/5173 |

Las cuatro omitidas de la suite sin red son opt-in y se ejecutaron por separado satisfactoriamente: integración Keycloak y tres físicas MySQL. Node cuenta además el nuevo módulo fixture como entrada TAP sin assertions propias; el aumento de 1119 a 1124 no significa cinco tests focales nuevos. No se suman padres TAP, decisiones HTTP y verificaciones DOM/SSR como si fueran una única medida.

Versiones verificadas sin actualizar paquetes: Keycloak 26.8.1, MySQL 8.4.13, Node imagen 22.23.4 y host 24.19.0, keycloak-js 26.2.4, navegador Chrome/156.0.8078.48 mediante Brave. La versión del SDK es independiente de la del servidor. Nada de esto acredita automáticamente la versión o configuración desplegada en Ubuntu.

Los logs de trabajo de esta ejecución quedaron fuera del repositorio, en TEMP: itecsa-phase05-real.log, itecsa-phase05-api.log, itecsa-phase05-web.log, itecsa-phase05-browser.log e itecsa-phase05-scripts.log. Son auxiliares locales temporales, sin garantía de conservación. La evidencia versionable es este documento y los fixtures reproducibles; no se copian tokens, passwords o PIN.

### Fallos anteriores conservados

| Ensayo | Resultado anterior | Resolución |
|---|---|---|
| Preparación del PIN | PIN_NOT_REVEALABLE después del acuse de 04 | Compartir el PIN legítimo ya en memoria, sin restablecerlo ni relajar la regla |
| Destinatarios | Expectativa omitía una cuenta AP adicional válida | Comparar todos los destinatarios locales elegibles; sin cambiar producción |
| PIN ausente | Expectativa inicial 403 frente al contrato 400 | Corregir expectativa; PIN ajeno sigue 403 |
| Fixture browser | Faltaba prop editingStatus; import React sin uso detectado por lint | Completar el fixture y retirar el import; sin alterar componentes para ocultar el error |
| Estado entre sujetos | Mensajes de A seguían visibles al cambiar a B | Reproducción roja; F05-01; nuevas pasadas con respuesta de A pendiente y cuenta B |
| Carrera real de ventas | 201/500; P2002 del índice RUT del cliente | F05-03 y test focal rojo antes del arreglo; después 201/409 real |
| Nota duplicada con adapter | Test focal no reconocía constraint.index | F05-04; se preservan formatos y errores ajenos; carrera real con cliente existente 201/409 |

No se reemplazó un fallo de integración real por un mock para declarar éxito. El doble de entrega externa se explicita y no acredita que Resend funcione.

## Repetir la verificación paso a paso

### 1. Revisar base y alcance

Abrir PowerShell en la raíz empresarial. Docker Desktop, las imágenes locales fijadas a digest de [10](10_EVIDENCIA_Y_CONFIGURACION_FASE_02.md) y Node deben estar disponibles. Los scripts no descargan imágenes. No hace falta habilitar SSH ni tocar Ubuntu.

~~~powershell
git log -1 --oneline
git status --short
git diff --stat
git diff --check
~~~

La base de esta entrega es e74a914. Revisar también los seis archivos nuevos, que git diff --stat no incluye mientras estén sin seguimiento. El árbol contiene únicamente los 18 archivos enumerados arriba.

### 2. Ejecutar identidad, producción y negocio reales de laboratorio

~~~powershell
node scripts/keycloak-phase02-lab.mjs --run --production --business
~~~

Esperar exit 0, **58 aprobadas iniciales**, **2 tras reinicio**, **1 física** y **2 de seguridad**. El marcador PHASE05_BUSINESS:EXECUTED informa 135 decisiones, 69 permitidas y 66 denegadas. Ese marcador no basta: comprobar TAP sin fallos. Se conserva el mensaje final histórico de producción/regresiones físicas. Los modos --run y --run --production anteriores siguen disponibles; --business requiere exactamente el orden mostrado y no funciona solo.

El segundo MySQL sirve únicamente a las pruebas físicas originales, preservando sus guardas 127.0.0.1:33307 e itecsa_physical_test dentro del namespace del contenedor, sin publicar ese puerto del host. El cleanup verifica nombres/etiquetas propios antes de eliminar recursos.

### 3. Ejecutar la interfaz en navegador

~~~powershell
node scripts/keycloak-phase03-browser.mjs --run --production --business
~~~

Requiere Brave/Edge/Chromium; puede definirse ITECSA_BROWSER_BIN solo en esa consola. Esperar business PASS con 29 checks en ambos tamaños, production PASS con 70 cada uno, navigation PASS con 243 cada uno y los tres fixtures originales PASS. No reutiliza cookies personales ni los puertos empresariales actuales. La emulación a 390×844 no sustituye un teléfono físico.

La prueba comprueba acciones de pago visibles por rol/estado, campana con notificaciones cargadas, cambio de sujeto, una respuesta anterior pendiente y correo readonly del formulario. La API y el contexto de autenticación son dobles; el ensayo HTTP/SQL del paso 2 es la evidencia de persistencia/autorización real.

### 4. Ejecutar regresión general y calidad

Reutilizar los montajes y contenedores seguros sin red de [08](08_EVIDENCIA_FASES_00_01.md), actualizados a las fuentes actuales, y las instrucciones de [10](10_EVIDENCIA_Y_CONFIGURACION_FASE_02.md). No lanzar estos flags contra contenedores empresariales. Las dependencias del laboratorio ya están en imágenes locales; no se necesita npm install.

~~~text
# Contenedor API, APP_ENV/NODE_ENV=test, integraciones externas deshabilitadas:
npm test -- --test-concurrency=4
node --test test/businessIdentity.test.js

# Contenedor web de pruebas, fuentes/test/shared readonly, sin .env:
npm test
npm run lint

# Solo para el build, NODE_ENV/APP_ENV=production en ese contenedor temporal:
npm run build -- --outDir /tmp/itecsa-phase05-build
~~~

Desde la raíz del host:

~~~powershell
node --test scripts/check-docs.test.mjs scripts/deploy-northflank.test.mjs scripts/keycloak-phase02-realm.test.mjs
node scripts/check-docs.mjs
git diff --check
docker ps -a --filter label=itecsa.phase02.lab
docker ps -a --filter label=itecsa.phase03.browser
docker network ls --filter label=itecsa.phase02.lab
~~~

Los filtros no deben mostrar recursos residuales de laboratorio al finalizar. Los servicios API/web preexistentes no se detienen ni se recrean.

### 5. Aceptación manual futura en una instalación de pruebas configurada

Esto queda **pendiente**, no es una instrucción de aplicar fixtures sobre Ubuntu. Preparar primero contrato de [10](10_EVIDENCIA_Y_CONFIGURACION_FASE_02.md), subjects y roles coherentes, datos sintéticos, backup recuperable y frontend/API de esta revisión. No importar el realm de pruebas con usuarios/passwords sintéticos a un realm existente.

1. Con AV, OV y D consultar una nota de prueba e ingresar pedido. Recargar: una fila, responsable correcto y mensajes AP/AC. Repetir nota y comprobar 409 sin duplicados; un error real de Manager se clasifica aparte.
2. Con AC/OC/D confirmar un pago pendiente usando el PIN propio. Solo AC/D deben revisar resuelto; OC no debe ver ni ejecutar esa opción. Comprobar actor del registro y dueño original. PIN ajeno y falta de PIN no deben cambiar negocio.
3. Abrir historial con un rol de Producción y con Cobranzas: comparar restricción de observaciones, filtros y cursor; el actor histórico debe permanecer. Nuevo Soporte debe recibir denegación del módulo y de API.
4. Abrir métricas con AP/G/D y comparar contra SQL/control de datos sintéticos. Soporte y los otros roles denegados deben recibir 403 también mediante URL/API directa.
5. Consultar mensajes de una cuenta, cambiar a otra en la misma pestaña y comprobar que la campana descarta la bandeja/popup anteriores inmediatamente. Verificar lectura/ocultación propias, notificaciones automáticas y polling; nunca acceso a mensajes de otra cuenta.
6. Abrir solicitud de datos e incidentes: contacto local correcto o ausencia explícita; envío solo con canal de pruebas configurado. Documentar Resend como dependencia externa. No enviar reportes de prueba a destinatarios empresariales.
7. Repetir aceptación en puestos LAN y teléfonos físicos con el servidor real revisado. Registrar por separado refresco de sesión, pérdida de conectividad, CA/HTTPS, DNS y servicios externos.

## Documentación oficial y continuidad

Se contrastó el [adaptador JavaScript Keycloak](https://www.keycloak.org/securing-apps/javascript-adapter), que documenta flujo OIDC y tratamiento en memoria de tokens. El cambio de campana no introduce persistencia de tokens ni otro cliente de autenticación. Se conserva la validación de access tokens en la API descrita por [Auth0](https://auth0.com/docs/secure/tokens/access-tokens/validate-access-tokens); las comprobaciones de permisos no se trasladan al navegador.

La configuración de roles/composites/mappers de laboratorio sigue generada por scripts/keycloak-phase02-realm.mjs desde la política canónica. **No hay en esta entrega un aplicador/reconciliador aprobado para el realm Ubuntu con usuarios existentes.** Se podrá reutilizar el contrato y código, pero su integración exige inventario, diff de configuración, respaldo/restauración comprobables y correspondencia individual de sujetos preservando PK/FK; no un import sustitutivo del realm. El cliente administrativo de 06 y las credenciales de 07 todavía no están implementados.

Siguen pendientes el incidente empresarial refresh_token=undefined, configuración y versión verificable de Ubuntu, bootstrap y asignaciones privilegiadas, política de username/correo, correspondencia de sujetos y preservación de datos, HTTPS/DNS/CA y pruebas offline completas. Aiven/MySQL externo, Manager y Resend/PIN/privacidad/incidentes son condicionantes independientes. Cambiar de IdP no acredita autonomía LAN.

## Revisión, reversión y siguiente fase

HEAD permanece en e74a914; el índice Git no contiene archivos staged. Guardar primero una copia revisable del diff y de los archivos nuevos si se decide descartar esta fase. Restaurar únicamente los archivos 05 después de comprobar que no hay cambios ajenos; si se versiona más adelante, revertir el commit específico mediante revisión. No usar reset/clean global ni restaurar otros commits. No hay cambios de esquema, datos o realm empresarial que revertir.

00–04 pasan en regresión; 05 queda lista para revisión del código y aceptación del equipo con los límites descritos. **06 requiere autorización expresa**. Esta entrega no hace commit/push, no despliega ni modifica servicios existentes.

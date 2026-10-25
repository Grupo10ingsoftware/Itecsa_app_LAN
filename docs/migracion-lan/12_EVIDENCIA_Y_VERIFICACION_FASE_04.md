# Fase 04: Kanban, pedidos, producción y calendario

Fecha local: **24-10-2026**. Repositorio empresarial, rama `POC/KEYCLOAK`. Base limpia: **`594140465b3d097618e353e19b2e40a4af618b14`**, commit de 03 creado por petición expresa «commit y siguiente fase». Sin push. La fase 04 queda **verificada y aprobable en laboratorio**, pendiente revisión humana y commit de estos cambios. No se inicia 05, no se despliega y no se modifican identidades o datos empresariales.

## Resultado y corrección mínima

Se probaron operaciones productivas con tokens firmados por Keycloak 26.8.1, los nueve roles, PIN real de ITECSA y MySQL 8.4.13 desechable. A diferencia de los routers con controladores sintéticos de 03, aquí se ejecutan controllers, services, repositorios, SQL y transacciones de negocio existentes. Los siete roles funcionales mantienen sus permisos; Desarrollador conserva los del técnico antiguo en este ámbito y nuevo Soporte no lee ni modifica producción.

Se encontró un defecto anterior a esta fase: `sendToReviewOperation` intentaba obtener `id_usuario` desde el DTO devuelto por la transición. El DTO público ya no incluye ese campo, por lo que se guardaban transición y auditoría pero se omitía la notificación. La corrección lee únicamente `Pedidos.id_usuario` con el cliente de la transacción existente antes de crear el mensaje. **Actor y destinatario siguen siendo identidades distintas**: el actor proviene del sujeto autenticado/PIN; el destinatario es el responsable persistido del pedido. No se amplía el DTO ni se acepta el actor enviado en el body.

La corrección beneficia a ambas ramas de identidad; no demuestra que Keycloak causara el defecto. No se cambian algoritmos de PIN, pago, capacidad, flujo Lanyard, estados, departamentos o reglas de movimiento. La matriz de nueve roles y 25 capacidades de [07](07_DECISIONES_APROBADAS.md) permanece intacta. Auth0, SDK, servicios, Actions/templates y documentación histórica se conservan.

## Recorrido y evidencia de código

Rutas relativas a la raíz empresarial. Las referencias de código estable se interpretan sobre 5941404; los símbolos corregidos/nuevos corresponden al árbol de 04. Esta lista identifica el recorrido revisado, no equipara coincidencias textuales con consumidores activos.

| Capa / archivos principales | Símbolos y controles revisados |
|---|---|
| `capaVista/src/modules/kanban/pages/KanbanBoardPage.jsx` | Carga operativa, apertura por `manage:production-load`/`manage:production-capacity`, validación y guardado |
| `modules/kanban/components/KanbanColumn.jsx` | Listado/columnas, paginación, detalle, `handleDragEnd`, confirmación PIN, patch compacto, revisión, etiquetas, avance/retroceso y cancelación |
| `modules/kanban/components/{KanbanCard,KanbanOffCanvas,KanbanSubprocesses,MoveToProductionModal,SubprocessAuthModal}.jsx` | Draggable por capacidad/etapa, avance separado de retroceso, observaciones, PIN y bloqueo Lanyard |
| `modules/kanban/api/kanbanApi.js`, `utils/{kanbanOrderMapping,kanbanOrderRules,orderStagePatch}.js` | Contratos HTTP/DTO, etapas, pago confirmado, filtros y conservación de datos al parchear |
| `modules/productionCalendar/pages/ProductionCalendarPage.jsx`, `api/ordersCalendarApi.js` | Carga mensual y pendientes paginados, filtros, actualización de evento y detalle |
| `modules/productionCalendar/components/{ProductionCalendarGrid,CalendarDayCell,CalendarEvent,CalendarOrderTrays,DayOrdersModal,DeliveryChangeModals}.jsx` | Lectura/arrastre, drop sujeto a permiso, confirmación de fecha, PIN y bandejas; utils de fechas/estado |
| `capaServidor/src/modules/orders/routes/{order,orderDetail,orderStatus}.routes.js` | JWT/identidad, capacidad y PIN; rutas internas de escritura de detalles/estados cerradas |
| `modules/orders/controller/orders.controller.js` | Propaga `req.identityProvider`, rol/permissions, `req.pinActor` y sub; DTOs diferenciados Kanban/Calendario |
| `modules/orders/service/{order,orderProduction}.service.js` | Estado/pago, transiciones consecutivas, `start:production`, actor local, comentario de revisión/cancelación/retroceso y transacciones |
| `modules/orders/repo/{orders.repo,orderStageOperations,orderSubprocessOperations,orderReadOperations,orderViewOperations,orderReadSelect,orderMapping,orderWriteOperations,orderNotificationOperations,orderProductionRules}.js` | CAS/locks, auditoría, destinatarios, joins/DTOs, fechas, subprocesos y ciclo Lanyard |
| `modules/productionCapacity/{routes,controller,service,repo}` | Solo AP/D escriben; validación de capacidad y transacción existente |
| `modules/productionLoad/{routes,controller,service,repo}` | Usuario local por sub, cantidad, etapa/producto, upsert por detalle/día, transacción y actor persistido |
| `middlewares/{checkJwt,requireActiveIdentity,requireCapability,requirePin}.js`, `modules/auth/service/pin.service.js` | Validación acumulada de 02, coherencia local/rol/sujeto y PIN asociado al mismo sub |

Las abreviaturas `modules/...` de frontend y backend pertenecen a la raíz de su capa indicada en las filas anteriores. Los tests acumulados cubren además mapeos de snapshots/DTO, auditoría y reglas de pago; la revisión exhaustiva de Ventas, Cobranzas y Mensajes como módulos corresponde a 05, no se anticipa aquí.

## Operación, permisos y equivalencia Auth0/Keycloak

AP/AV/AC son administradores Producción/Ventas/Cobranzas; OP/OV/OC sus operarios; G Gerencia; D Desarrollador; S nuevo Soporte; T antiguo Soporte técnico Auth0. `F` = los siete funcionales AP/AV/AC/OP/OV/OC/G. Las 18 filas se probaron para los nueve roles con datos válidos para la operación: **162 decisiones, 73 respuestas 200 y 89 respuestas 403**. Las respuestas observadas coinciden con los grupos esperados siguientes.

| Operación / endpoint | Auth0 anterior | Keycloak esperado = observado | Capacidad y validaciones adicionales |
|---|---|---|---|
| GET `/orders/kanban-summary` | F, T | F, D | `read:orders`; cursor firmado, límite, filtros/columnas; excluye cerrados antes de paginar |
| GET `/orders/:id/kanban-detail` | F, T | F, D | `read:orders`; pedido existente; proyección de detalle |
| GET `/order-status` | F, T | F, D | `read:orders`; listado de columnas/etapas |
| GET `/orders/calendar-summary` | AP, AV, OV, T | AP, AV, OV, D | `read:production-calendar`; rango o pendientes, paginación |
| GET `/orders/:id/calendar-detail` | AP, AV, OV, T | AP, AV, OV, D | Misma capacidad; sin datos financieros/PIN en DTO |
| GET `/production-capacity` | F, T | F, D | `read:production-capacity` |
| GET `/production-load/today` | F, T | F, D | `read:production-capacity`; fecha normalizada |
| PATCH `/orders/:id/move`, inicio 1→2 | AP, T | AP, D | `move:orders` + `start:production`; pago confirmado, actor PIN y etapa consecutiva |
| Misma ruta, listo para entrega 2→3 | AP, OP, T | AP, OP, D | `move:orders`; PIN, pago confirmado y todos los detalles terminados |
| Misma ruta, entregado 3→4 | AP, OP, T | AP, OP, D | `move:orders`; PIN, pago y consecutividad |
| PATCH `/orders/:id/review` | AP, T | AP, D | `review:orders`; etapa listo para producción, comentario obligatorio, actor por sub |
| PATCH `/orders/:id/cancel-production` | AP, T | AP, D | `cancel:orders`; PIN, comentario obligatorio, no cancelado previamente |
| PATCH `/orders/:id/labels` | AP, T | AP, D | `manage:order-tags`; etiquetas admitidas y actor por sub |
| PATCH `/orders/:id/delivery-date` | AP, T | AP, D | `update:order-delivery-date`; fecha válida/hábil, PIN; actualiza pedido y detalles |
| PATCH `/orders/:id/details/:detail/subprocesses/:process/complete` | AP, OP, T | AP, OP, D | `update:production-subprocesses`; PIN, proceso actual del producto, producción y pago confirmado |
| Misma familia, `/rollback` | AP, T | AP, D | `rollback:production-subprocesses`; PIN, observación obligatoria y proceso inmediatamente anterior |
| PATCH `/production-capacity` | AP, T | AP, D | `manage:production-capacity`; un valor entero 1–10000, sin PIN en contrato existente |
| PATCH `/production-load/today` | AP, T | AP, D | `manage:production-load`; cantidad/producto/etapa válidos y usuario local; sin PIN en contrato existente |

Los grupos Auth0 provienen de la matriz/routers históricos conservados y sus regresiones, **no de llamadas nuevas a Auth0 real**. Los grupos Keycloak sí se ejecutaron con tokens reales. Nuevo S se deniega en todas las filas. OP puede avanzar subprocesos/mover una producción terminada, pero no puede iniciar producción, retroceder ni gestionar capacidad. AV/OV pueden visualizar calendario pero no arrastrar ni guardar fechas.

## Actor, efectos y fallos

| Familia | Actor / destinatario | Persistencia y eventos | Fallo y concurrencia comprobados |
|---|---|---|---|
| Movimiento | Actor `req.pinActor.idUsuario`; dueño original se conserva | `Pedidos`, `Registros`, `Registro_Etapas`; al pasar a listo para entrega, mensaje al responsable | CAS de estado/pago; dos solicitudes no duplican registro/mensaje; pago pendiente/salto/detalles pendientes rechazan |
| Revisión | Actor resuelto por sub local; destinatario `Pedidos.id_usuario` | Misma frontera transaccional: etapa, registro, mensaje y vínculo destinatario | Mensaje observado para AP/D; error de inserción de mensaje revierte etapa y auditoría reales |
| Cancelación | Actor PIN, nunca `body.actor` | Etapa Cancelado + auditoría/comentario | Sin comentario/PIN válido no se modifica negocio; el PIN ajeno es rechazado |
| Subprocesos | Actor PIN | Detalle, `Registros`, `registro_subprocesos`; no adelanta automáticamente a entrega | Lock del pedido y actualización condicional; avance/retroceso concurrente deja un registro; no salta procesos |
| Lanyard/carga | Actor local del sub | `Avance_Lanyard`, cantidad/porcentaje y `id_usuario_registra`; fila única por detalle/día | Repite antes de empaquetado hasta 100%; dos actores no duplican el avance; cantidad excesiva rechazada |
| Etiquetas | Actor local del sub | `Pedido_Etiqueta.id_usuario_asigna` y `Registros` | Actor enviado por el cliente no sustituye al autenticado; denegación sin vínculos/registros |
| Fecha | Actor PIN | Fecha en pedido y todos sus detalles + registro | Misma fecha persistida en ambos; domingo rechazado; límites de atomicidad heredados más abajo |
| Capacidad | El contrato actual no registra actor de esta configuración | `Tipo_Producto.capacidad_diaria`, transacción existente | Se comprueban valores realmente distintos guardados por AP/D y conservación ante denegaciones |
| Lecturas | Sujeto/rol local comprobados por middleware | Sin escrituras de negocio | Paginación sin repetir IDs, cursor inválido 400, rango incompatible 400 y calendario sin secretos/datos financieros |

La prueba envía deliberadamente un `body.actor` y un `idUsuario` distintos del actor real; los registros y cargas siempre conservan el usuario autenticado. El responsable de Ventas original mantiene su PK/FK. Un PIN incorrecto sí incrementa su contador de seguridad: «sin efectos de negocio» no significa borrar ese intento. No se confunden fallos de autorización, PIN y reglas productivas.

## Límites heredados y aceptación pendiente

Se registran sin atribuirlos a Keycloak ni alterar reglas ajenas al alcance:

- La carga operativa usa `LANYARD_DAILY_CAPACITY=1200` en `ProductionLoadRepository.getCapacity`; la configuración guardada en `Tipo_Producto.capacidad_diaria` es otro dato y hoy no alimenta ese cálculo. La ruta de capacidad valida forma/rango, pero no comprueba por sí sola que el ID enviado sea un producto Lanyard. No se declara corregida esa incoherencia funcional heredada.
- `updateDeliveryDateOperation` actualiza pedido y detalles mediante una escritura Prisma anidada, y después crea el registro. La lectura estática no acredita atomicidad conjunta con auditoría; falta ensayar el fallo específico entre ambas operaciones antes del corte. Esta fase prueba la actualización válida/denegada y la coherencia de fechas, no promete rollback de todas las operaciones del sistema.
- Las mutaciones cuyos controllers releen el detalle después del commit pueden devolver error aunque la acción se haya guardado si falla esa lectura. Se debe verificar el estado antes de repetir una acción ambigua. No se ha ensayado pérdida de conexión del cliente en cada endpoint.
- La carga diaria usa cantidades absolutas y upsert por detalle/día. La prueba verifica fila única y actor local; no convierte el contrato heredado en un bloqueo entre operadores ni aprueba una política nueva de conciliación entre días.
- El navegador prueba Kanban/acciones/PIN/paginación y drop HTML de calendario con API sintética. Los movimientos Kanban se verifican con HTTP/SQL real y revisión del handler; falta aceptación de gestos físicos del DnD de Kanban en cada dispositivo corporativo. La emulación responsive no sustituye teléfonos físicos.

No hay un fallo nuevo sin corregir en los escenarios ejecutados. La aceptación empresarial mantiene estos límites abiertos. Manager no se consultó: los casos nuevos usan pedidos sintéticos y la prueba física original usa su fuente `fixture` ya existente. La fuente y la integración comercial permanecen intactas; su indisponibilidad real debe clasificarse aparte de identidad. Siguen pendientes el incidente empresarial `refresh_token=undefined`, despliegue/configuración, DNS/HTTPS/CA, correspondencia de sujetos, decisiones privilegiadas y funcionamiento integral offline (Aiven, Resend/PIN, Manager y otros canales).

## Artefactos modificados

| Archivo | Cambio |
|---|---|
| `capaServidor/src/modules/orders/repo/orderStageOperations.js` | Única modificación productiva: resolver responsable desde persistencia dentro de la transacción de revisión |
| `capaServidor/test/productionIdentity.test.js` (nuevo) | Tres casos de regresión de destinatario/DTO/no transición/sin responsable |
| `capaServidor/test/orderTransitions.repo.test.js` | Conserva la expectativa original del destinatario; adapta el doble a la lectura real y retira el ID ficticio del DTO |
| `capaServidor/test/fixtures/keycloakProduction.mjs` (nuevo) | Escenarios con SQL, PIN, roles y fallos reales; fixtures exclusivamente sintéticos |
| `capaServidor/test/keycloak.real.integration.test.js` | Invoca casos 04 únicamente con opt-in, reutilizando login/verificación de 02 |
| `scripts/keycloak-phase02-lab.mjs` | Opción `--production`; añade MySQL físico separado y conserva modo 02 original |
| `scripts/keycloak-phase04-physical.mjs` (nuevo) | Verifica destino/esquema vacío, prepara DDL efímero y ejecuta los dos archivos físicos originales sin modificarlos |
| `capaVista/test/production.browser.{html,jsx}` (nuevos) | Browser por nueve roles, Kanban/PIN/calendario/drop y API sintética |
| `scripts/keycloak-phase03-browser.mjs` | Opción `--production`, dos pasadas nuevas y diagnóstico de excepciones de módulos; conserva las cinco pasadas anteriores |
| `docs/migracion-lan/{06,07,09}` y este `12` | Autorización, estado, matriz acumulada y evidencia nueva |

No se modifican fuentes frontend productivas, esquemas, dependencias/lockfiles, Compose/Dockerfiles/workflows, `.env`, algoritmos PIN ni los documentos históricos 01–05/08/10/11. Las tres pruebas físicas originales permanecen idénticas. Las únicas escrituras de datos se hacen en bases tmpfs propias; no se cambia la base empresarial ni la universitaria.

## Pruebas, resultados y fallos anteriores

| Ejecución | Resultado final |
|---|---|
| Suite backend aislada sin red | **1119 contabilizadas: 1115 aprobadas, 4 omitidas, 0 fallos** |
| Focal repositorio/transiciones y regresión de destinatario | 22 aprobadas, incluidas las tres nuevas |
| Integración real inicial | **40 aprobadas**, incluidos 23 subtests productivos y sus padres; 162 decisiones nuevas dentro de ellos |
| Reinicio de Keycloak efímero | **2 aprobadas** |
| Regresión física original MySQL | **1 aprobada** con fuente fixture existente |
| Cuotas y rollback de seguridad MySQL originales | **2 aprobadas** |
| Frontend completo | 51 node:test y SSR acumulados aprobados; 411 checks de navegación, 251 de identidad y regresiones anteriores |
| Browser productivo | **70 checks a 1440×1000 y 70 a 390×844**, nueve roles, cero errores JS |
| Browser acumulado | 243 + 243 checks de navegación y fixtures de sesión/SDK, métricas y PIN: PASS |
| Scripts / lint / build | 25 aprobadas / exit 0 / exit 0; Vite 8.0.16, 564 módulos, chunk 499,03 kB |
| Sintaxis | 147 fuentes/scripts y cuatro tests/helpers sin errores |
| Integridad final | 596 hashes base: ocho archivos previstos modificados, 588 intactos y seis nuevos; matriz compartida, esquema, dependencias, tests físicos originales y evidencia histórica preservados |
| Documentación / limpieza | Enlaces válidos en 71 documentos; diff sin errores; sin contenedores/redes de laboratorio ni puertos publicados residuales; API/web preexistentes continúan en ejecución |

Las cuatro omitidas del script general son integraciones opt-in y **se ejecutaron por separado satisfactoriamente** en esta fase. Las 40 contabilizaciones de integración incluyen padres; no son 40 escenarios independientes ni se suman a checks SSR/DOM como si fueran la misma unidad. Los 162 casos prueban operaciones existentes con datos sintéticos, no una migración de pedidos reales.

| Ensayo anterior | Fallo observado | Corrección / clasificación |
|---|---|---|
| Primeras pasadas productivas | Revisión con cero mensajes donde se esperaba uno; un subtest fallido propagaba fallo a dos padres | Reproducción unitaria roja, resolución del destinatario persistido y posterior verificación real positiva |
| Regresión general después del arreglo | Test original simulaba `id_usuario` en el DTO y carecía de la nueva consulta | Adaptar el doble de persistencia; la expectativa del destinatario sigue siendo la misma |
| Browser inicial | Fixture importaba como named export un componente default; resultado no terminaba | Corregir import del fixture y registrar excepciones CDP; sin cambiar la UI para aprobar |
| Arranque físico inicial | MariaDB adapter no obtenía clave RSA en la autenticación inicial de MySQL; el runner agotaba tiempo | Preparar conexión con Prisma CLI como en el laboratorio de identidad, luego verificar esquema vacío; sin cambiar el driver ni sus opciones de seguridad |
| Herramientas del laboratorio | Aviso heredado de OpenSSL en Prisma CLI | DDL/consultas completados; no se añadieron paquetes ajenos |

## Repetir la verificación paso a paso

### 1. Revisar el commit y la fase actual

Desde PowerShell en la raíz empresarial:

```powershell
git log -3 --oneline
git show --stat 5941404
git status --short
git diff --check
```

5941404 contiene 03. Los archivos de 04 quedan locales para revisión; no hay commit automático adicional ni push. La matriz canónica compartida permanece idéntica.

### 2. Ejecutar producción real y las regresiones físicas

Requiere las imágenes locales fijadas a digest de [10](10_EVIDENCIA_Y_CONFIGURACION_FASE_02.md), Docker Desktop y Node local. No descarga imágenes, no lee `.env` ni utiliza Compose.

```powershell
node scripts/keycloak-phase02-lab.mjs --run --production
```

El script conserva su procedencia de 02. Esperar 40 aprobadas iniciales, 2 tras reinicio, 1 física y 2 de seguridad; finaliza con `Producción y regresiones físicas aprobadas.` El marcador `PHASE04_PRODUCTION:EXECUTED` solo confirma ejecución: el resultado vinculante es TAP sin fallos y exit 0. Una pasada sin `--production` mantiene el laboratorio de identidad original.

La red interna no publica puertos. Una base sirve identidad/producción sintética; un **segundo MySQL tmpfs** sirve únicamente las pruebas físicas originales. El runner físico comparte el namespace de red de ese segundo contenedor para conservar sus guardas exactas `127.0.0.1:33307`, `itecsa_physical_test`, usuario de pruebas y fuente fixture. El puerto 33307 del host no se usa. Se comprueban destino y esquema vacío antes del DDL. Todo recurso se elimina verificando nombres/etiquetas propios.

No ejecutar estos flags en contenedores empresariales ni importar el realm de laboratorio con sus cuentas sintéticas al realm real. En otra máquina se necesitan las imágenes equivalentes revisadas; los IDs de imagen locales documentados no son tags publicados portables.

### 3. Ejecutar navegador y regresiones anteriores

Requiere la imagen web de [10](10_EVIDENCIA_Y_CONFIGURACION_FASE_02.md), Node con WebSocket y Brave/Edge/Chromium. Puede indicarse el ejecutable mediante `ITECSA_BROWSER_BIN` en esa consola.

```powershell
node scripts/keycloak-phase03-browser.mjs --run --production
```

Salida esperada: `production` PASS en ambos tamaños (70 cada uno), `navigation` PASS en ambos (243 cada uno), `authSession`, `metrics` y `paymentPin` PASS. Usa fuentes/test/shared de solo lectura, `envDir:false`, puerto Vite aleatorio solo en loopback y perfil temporal propio; no reutiliza cookies personales ni los puertos actuales 3000/5173.

### 4. Repetir suites seguras

Usar los contenedores/montajes sin red descritos en [10](10_EVIDENCIA_Y_CONFIGURACION_FASE_02.md), sobre el árbol actual:

```text
# Contenedor API de pruebas sin red y flags externos en false:
npm test -- --test-concurrency=4
node --test test/productionIdentity.test.js test/orderTransitions.repo.test.js

# Contenedor web de pruebas sin .env:
npm test
npm run lint
npm run build -- --outDir /tmp/itecsa-phase04-build
```

Para el build usar NODE_ENV=production en ese contenedor temporal. Desde la raíz:

```powershell
node --test scripts/check-docs.test.mjs scripts/deploy-northflank.test.mjs scripts/keycloak-phase02-realm.test.mjs
node scripts/check-docs.mjs
git diff --check
```

### 5. Aceptación manual en una instalación de pruebas configurada

Primero revisar el contrato de realm/sujetos de 02 y disponer de frontend/API de este árbol, HTTPS/contexto seguro, usuarios y pedidos sintéticos. Esta fase no prepara ni modifica una instalación empresarial.

1. Comparar cada rol con las 18 filas de la matriz. Soporte no debe abrir módulos productivos ni leerlos mediante API. AV/OV ven calendario sin edición; OP avanza pero no retrocede ni inicia producción.
2. Con AP o Desarrollador y un pedido sintético pagado, iniciar producción mediante PIN. Comprobar etapa, actor de auditoría y que el dueño original siga intacto.
3. Con OP completar el subproceso actual; intentar saltar uno y retroceder. Con AP/D retroceder con observación. Repetir una solicitud concurrente desde dos cuentas sintéticas y comprobar un solo registro.
4. Completar todos los detalles y mover a listo para entrega: verificar el mensaje al responsable una sola vez. Enviar otro pedido a revisión y comprobar el mismo destinatario esperado con el actor distinto.
5. En calendario mover un evento hábil, confirmar y validar PIN. Recargar y comprobar la misma fecha en pedido y detalles. AV/OV no deben poder abrir el flujo mediante un drop forzado.
6. Consultar paginación, filtros, pendientes de fecha y detalles; comprobar que no se entregan hashes/PIN/identificadores internos en DTOs. Registrar por separado fallos de Manager o infraestructura. Nunca probar mutaciones con pedidos empresariales.

## Fuentes oficiales y versiones

Se contrastaron [Keycloak: roles y grupos](https://www.keycloak.org/docs/latest/server_admin/index.html#assigning-permissions-using-roles-and-groups), [adapter JavaScript](https://www.keycloak.org/securing-apps/javascript-adapter) y [validación de access tokens Auth0](https://auth0.com/docs/secure/tokens/access-tokens/validate-access-tokens). Se mantienen roles de cliente explícitos y validación de permisos en API; el PIN es un control propio conservado y no se sustituye por el rol.

El [manual MySQL 8.4 de caching SHA-2](https://dev.mysql.com/doc/refman/8.4/en/caching-sha2-pluggable-authentication.html) describe el intercambio inicial y el uso de RSA/caché. El diagnóstico concreto del laboratorio devolvió `ER_CANNOT_RETRIEVE_RSA_KEY`; el orden CLI→adapter permitió ejecutar las pruebas sin modificar controles productivos. No se generaliza ese problema a la base empresarial.

Versiones verificadas, sin actualizar dependencias: Keycloak **26.8.1**, MySQL **8.4.13**, Node de imagen **22.23.4**, Node host **24.19.0**, keycloak-js **26.2.4**, React **19.2.6**, React Router resuelto **7.18.2** (declarado ^7.15.1), Vite **8.0.16** y CDP navegador **Chrome/156.0.8078.48**. La versión desplegada empresarial sigue sin acreditarse.

## Reversión y condición de avance

Guardar primero una copia revisable de los cambios 04 y verificar que no hay trabajo ajeno. Restaurar exclusivamente sus archivos desde 5941404 o, si se versiona después, revertir el commit específico mediante revisión. No ejecutar reset destructivo ni borrar cambios de otras fases. No hay migraciones, datos o realm empresarial que deshacer. El laboratorio elimina únicamente sus recursos propios y conserva las imágenes locales para repetirlo.

00–03 continúan verificadas en regresión. La matriz no cambió; la corrección, pruebas, fallos y limitaciones están separados arriba. Las decisiones corporativas de 02 y los límites heredados siguen pendientes. **La fase 05 requiere revisión y autorización expresa**; no se comienza automáticamente al aprobar los tests de 04.

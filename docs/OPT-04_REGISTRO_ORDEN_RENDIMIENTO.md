# OPT-04 — Registro de orden: implementación de rendimiento

Fecha: 27-10-2026. Rama `optimizacion`, referencia `0be21bb3f156d852b36ba59da293740ffd817941`. Árbol limpio al comenzar. Sin commit, push ni despliegue.

## A. Resumen ejecutivo

Se optimizó el recorrido del POST de Registro de orden mediante un modo interno explícito de recibo: conserva el contrato público `{ id, salesNoteNumber }`, omite la recuperación final del grafo completo, inserta detalles y accesorios en lotes y comparte la resolución de destinatarios. El servicio conserva su retorno completo predeterminado para consumidores internos. No se modificaron rutas, permisos, PIN, recuperación, esquema, TLS, pool ni tiempos de transacción.

Las lecturas reales de desarrollo muestran:

- Contexto de producto: **3 → 1 SELECT**, aproximadamente **1.890 → 660 ms** por tipo distinto.
- Destinatarios de avisos: **2 → 1 SELECT**, **1.231,424 → 659,619 ms**, con los mismos conjuntos de destinatarios.
- La hidratación completa de un pedido existente costó **13 SELECT y 3.097,446 ms**. El POST optimizado ya no la invoca. Esta cifra mide una etapa de lectura, **no el tiempo anterior de creación**.

Los modelos transaccionales aislados comprobaron igualdad de datos, snapshots, accesorios, etiquetas, estado inicial, avisos y auditoría; rollback en cada fase; exclusión de duplicados y espera del commit. **No se ejecutó una creación real en MySQL ni se midió su HTTP/E2E**: Docker está instalado pero su motor no está disponible y no hay un MySQL aislado provisionado. No se escribieron pedidos, PIN, auditorías ni mensajes en la base compartida. Por tanto, **p95 de registro ≤1.000 ms no está certificado**.

La tarea cubre PERF-034, PERF-035 y PERF-036. Se revisaron la auditoría global, Fase 1 y las intervenciones ya integradas OPT-01/02/03/09/07. Se mantuvieron sus contratos; no se hizo otra auditoría general.

## B. Consulta de Nota de Venta

| Operación | Problema/estado verificado | Cambio | Resultado |
|---|---|---|---|
| Fuente | Fixture local; TTL de cinco minutos, Map y comprobación mtime/tamaño existentes | Se conservan | No se inventó ni sustituyó un proveedor externo |
| Clasificación | Repetía filtros y resolución de tipo por línea | Un recorrido, una clasificación por línea importable | Misma salida completa y orden de productos/accesorios |
| Duplicado | Consulta mínima indexada existente | Sin cambios | Un SELECT, mediana 660,986 ms en desarrollo |
| Observación | Auditoría, contadores y posibles alertas | Sin cambios | Se conserva su ejecución y política best effort |
| Frontend | Descartaba respuestas antiguas pero dejaba HTTP activo y admitía invocaciones repetidas antes del render | AbortSignal y exclusión inmediata de búsqueda simultánea | Sin mezcla A/B ni errores tardíos tras reset/desmontaje |

Se mantiene el paralelismo entre fuente y duplicado. No se añade una segunda caché ni se reutiliza la comprobación del GET para autorizar el POST. La creación vuelve a obtener y validar la fuente.

**Diferencia respecto de la descripción histórica:** el controlador actual llama `res.json` antes de `await observeSalesNote`, tanto para éxito como error. El handler sí espera el observador, pero el cliente HTTP puede haber recibido la respuesta. Se comprobó ese orden en el código y con una prueba; se conserva, sin mover trabajo a una promesa sin espera ni atribuir una mejora a omitirlo. Un tiempo HTTP del GET por sí solo no incluiría necesariamente la finalización de la observación. No se midió ese endpoint contra la base compartida porque ejecuta escrituras de seguridad.

El monitor conserva hash/HMAC de identificadores, actores validados, contadores por ventana, señales de velocidad/no encontrados, espera con `Promise.allSettled` y registro del fallo. No se convirtió su política de fallo en otra política de autorización.

## C. Formulario

La entrada a la página no genera una búsqueda. Se conservan campos, nombres, diseño, productos, accesorios, prioridades y límite de 300 caracteres de observación. Las listas de productos/accesorios ya usaban memoización focalizada; no se reemplazaron ni virtualizaron.

La búsqueda conserva el contador de versión y añade AbortController. Editar el número, resetear o desmontar aborta solo la lectura. Una respuesta antigua no restaura el formulario, no sustituye otra Nota de Venta y no instala un error obsoleto. El bloqueo mediante ref evita dos GET por doble invocación antes de que React deshabilite el botón.

La página se aísla por instancia de API, que el cliente existente renueva por sesión. Cambiar de cuenta/sesión remonta el flujo y elimina productos, accesorios, borrador y modales anteriores. Una respuesta tardía del POST anterior no limpia ni notifica en la nueva sesión. No se guarda información del pedido en localStorage.

## D. Confirmación

Se conserva la validación local y el payload congelado de tres campos: Nota de Venta, observación interna y prioridad. Abrir/reabrir el modal no consulta al servidor. Cambiar prioridad/comentarios invalida la confirmación anterior. Cancelar conserva los datos sin persistir.

El contrato actual **sí requiere PIN**: confirmación → modal de autorización → POST con PIN. Se conservan `requirePin`, su validación y eliminación del PIN del body antes del controlador. No se modifica el algoritmo, bloqueo, recuperación o estado del PIN. No se crea un pedido antes de autorizarlo.

Ante resultado incierto del POST se conserva el borrador y el contexto de autorización, se invalida el payload para otro envío y se requiere cerrar la autorización y usar «Comprobar estado». No hay GET ni POST automáticos de recuperación. Una comprobación disponible recupera una previsualización fresca y exige confirmar de nuevo; un 409 conserva el contexto y bloquea la recreación. Un GET disponible no demuestra que una escritura anterior aún en vuelo no pueda terminar: UNIQUE sigue siendo la barrera definitiva.

Los rechazos de PIN conservan el reintento explícito con un PIN nuevo, como antes. Reset/edición no actúan durante un POST en curso. El POST no recibe AbortSignal ni se reintenta automáticamente.

## E. Transacción

Antes: duplicado → cliente → etiqueta → pedido → asignación de etiqueta → registro/etapa → resolución de tipo/flujo y creación por línea → accesorios individuales → dos grupos de avisos → auditoría → grafo completo → commit.

Después, para el recibo del POST: duplicado → cliente → etiqueta → pedido → asignación de etiqueta → registro/etapa → contexto mínimo por tipo distinto y preparación de detalles → lote de detalles → lote de accesorios → destinatarios conjuntos, mensajes y asignaciones → auditoría → retorno de dos escalares del pedido creado → commit.

Todas las escrituras siguen dentro de `createSalesOrderTransaction`, con el mismo cliente transaccional. La inyección de fuente/repositorio no desactiva esta unidad de trabajo. Se mantienen **timeout 20.000 ms y maxWait 10.000 ms**, sin aumentar el pool ni lanzar Promise.all sobre escrituras dependientes de esa conexión.

El controlador solicita `response: 'receipt'` como opción interna; el body del navegador no elige la autoridad ni el modo de respuesta. La promesa del servicio espera el commit y después se emite el mismo HTTP 201. Un fallo del commit no puede convertirse en éxito. No se trasladan lecturas finales después del commit para reconstruir datos cambiables.

Duración transaccional MySQL, espera de pool/bloqueos e inicio/commit reales: **No medido**. El JSON sintético registra duración del modelo, claramente separada; no se presenta como reducción porcentual de una transacción MySQL.

## F. Detalles productivos

Se conserva el Map por `tipoProducto`: cada tipo distinto se resuelve una vez por operación. La nueva proyección usa el mismo nombre de catálogo y devuelve solo el ID y el primer estado de `Producto_Subproceso`, ordenado por `orden_flujo`. No recupera la descripción del estado ni todo el catálogo para quedarse con el primer ID. Un tipo ausente sigue produciendo 404; la ausencia permitida de flujo sigue dejando estado inicial null.

En el modo recibo, cada detalle se prepara con las mismas validaciones obligatorias, snapshot, tipo, cantidad, pedido, fechas null y estado inicial. `createMany` evita la escritura individual de cada línea. No usa `skipDuplicates`, no inventa IDs, no presupone que AUTO_INCREMENT sea contiguo y no requiere `createManyAndReturn`, que no está soportado para MySQL en esta versión de Prisma. Se verifica `count === número de líneas`; una diferencia aborta toda la transacción.

Los IDs los genera MySQL. No se necesitan para relacionar subprocesos nuevos: el flujo actual crea el detalle con `id_estado_subproceso`, no una fila de registro por cada subproceso del catálogo. Se conserva ese modelo; no se inventan registros productivos iniciales. El retorno completo predeterminado mantiene las creaciones individuales y sus IDs para los consumidores internos que los requieren.

La reducción de llamadas de inserción por líneas es comprobada por el modelo. El número físico de INSERT que Prisma emite para un lote, incluyendo sus eventuales particiones, **no fue instrumentado en MySQL aislado**. No se anuncia como una medición física.

## G. Snapshots

No se modifica `salesOrder.snapshot.js`, su hash v2, normalización, identidad por código/derivación ni sus consumidores de reevaluación. Se conservan los cinco campos de origen por línea, cantidades y productos de la fuente autorizada. Las líneas repetidas permitidas siguen siendo filas diferentes.

Se mantiene `supportsOrderSnapshots` y su comprobación de columnas por cliente transaccional, con `snapshotData` para esquemas anteriores. No se agregó una caché global de capacidades ni se infirió compatibilidad de un error P2022. La comprobación sigue una vez por cliente transaccional; dentro de la operación ya estaba reutilizada. Evitar la hidratación final no justifica eliminar esta comprobación.

Pruebas comparan la versión anterior y nueva con esquema completo y sin columnas de snapshot, y verifican hash/campos por línea. No se ejecutó DDL ni migración.

## H. Registros, avisos y auditoría

El registro inicial y la entrada de etapa siguen usando el mismo actor, observación y objeto `now`; se conservan estado de pedido 1, pago 1 y fecha productiva sin programar. La resolución del cliente sigue usando RUT, UNIQUE y el mapeo de conflicto concurrente existente; no hay caché de clientes ni creación fuera de la transacción.

La prioridad conserva los nombres «Urgencia» y «Prioridad por contrato», comprobación activa y asignación al pedido/actor. La prioridad permite una sola etiqueta, así que no se añadió otro batching para una única fila.

Los accesorios se insertan con sus mismos campos, cantidades y relación mediante un lote separado. Nunca se convierten en detalles productivos. Los defaults de fecha/ID de MySQL permanecen; las horas de inserción naturalmente pueden variar al hacer menos viajes.

Para los avisos se obtienen ambos conjuntos de destinatarios con una lectura. Las comparaciones de rol se calculan **en MySQL**, conservando collation y tratamiento de NULL del filtro anterior. No se sustituyen por comparaciones JS sensibles a mayúsculas. Se mantienen exclusión de «Desvinculado», destinatarios, dos asuntos y contenidos, pedido, fechas, flags de leído/oculto y `skipDuplicates` de las asignaciones.

Se crea cada mensaje que tenga destinatarios y se agrupan sus asignaciones después de obtener IDs reales. No se crea un mensaje sin destinatarios. Un fallo revierte ambos avisos, las asignaciones y el pedido. `order.imported` conserva actor, requestId, recurso y outcome, y sigue siendo esperado antes del commit. No se usa un envío externo ni una promesa sin espera.

## I. Respuesta final

`toOrderCreatedDTO` y su parser frontend permanecen intactos: `{ id, salesNoteNumber }`. Se reutilizan `id_pedido` y `numero_nota_venta` devueltos por la creación del pedido, no un valor posterior enviado por el navegador. No se recuperan cliente, catálogos, diseños, avances, detalles e historia solo para descartarlos en el DTO.

La opción predeterminada del servicio sigue devolviendo el pedido completo con detalles y accesorios. No se modifican las lecturas de Kanban, pagos, calendario, historial, mensajes ni métricas. Se verifican shapes consumidores sobre el grafo sintético persistido y se ejecutan sus suites de regresión. La apertura de un pedido recién creado en MySQL real queda pendiente de un entorno aislado de escritura.

## J. Rendimiento

[Línea base previa](OPT-04_LINEA_BASE.json), [lecturas reales comparadas](OPT-04_LECTURAS_SQL.json) y [CPU/modelo sintético](OPT-04_CREACION_SINTETICA.json).

Lecturas de desarrollo: cinco muestras calientes secuenciales por serie, pausa 250 ms fuera del reloj, misma conexión/configuración TLS estricto, pool 10. Node 24.19.0, Prisma Client/adapter 7.10.0, mariadb 3.5.4; no se cambian dependencias. Los tiempos del driver incluyen transporte/adaptador; CPU y ejecución pura del servidor MySQL no se midieron.

| Operación | Antes (ms) | Después (ms) | Mejora | Muestras por versión | ¿Cumple 1 s? |
|---|---:|---:|---|---:|---|
| Contexto Yoyo, lectura real | 1.890,783 | 660,878 | 65,0 % | 5 | Mediana sí |
| Contexto Lanyard, lectura real | 1.890,090 | 660,067 | 65,1 % | 5 | Mediana sí |
| Contexto Tarjeta, lectura real | 1.892,142 | 659,374 | 65,2 % | 5 | Mediana sí |
| Destinatarios, lecturas reales | 1.231,424 | 659,619 | 46,4 % | 5 | Mediana sí |
| Hidratación final de pedido existente, etapa de referencia | 3.097,446 | No se invoca en modo recibo | Trabajo eliminado; no es un POST medido | 5 anteriores | No certifica creación |
| Duplicado, lectura real sin cambio | 660,986 | 660,986 | Sin cambio | 5 | Mediana sí |
| GET de NV completo con observación | No medido | No medido | No certificado | 0 | No certificado |
| Creación transaccional MySQL | No medido | No medido | No certificado | 0 | No certificado |
| POST HTTP real + JWT/PIN/MySQL | No medido | No medido | No certificado | 0 | No certificado |
| E2E hasta confirmación visual real | No medido | No medido | No certificado | 0 | No certificado |

La proyección en memoria del recibo dio 0,040 ms y 35 bytes en el fixture real de lectura. No se compara ese tiempo como si fuese el POST completo ni se suman medianas de etapas para inventar E2E. La lectura completa interna devolvía 1.573 bytes en ese pedido; el DTO público ya era mínimo antes de OPT-04.

CPU de normalización sintética, 20 series de 100 repeticiones: 20 líneas, 0,002776 → 0,001683 ms; 1.000 líneas, 0,134546 → 0,045773 ms. Los valores pequeños tienen ruido/resolución importante: una línea incluso fue más lenta; no son el cuello demostrado de SQL. Se conserva la mejora de un único recorrido y equivalencia, sin atribuirle segundos.

Fixture de archivo actual, sin duplicado/observación/HTTP: caché fría/caliente de una línea 0,315/0,041 ms; cinco líneas 0,276/0,039 ms; veinte líneas 0,251/0,058 ms, veinte muestras por condición. La política de caché no cambia; no se afirma una mejora antes/después de ella. Expiración, archivo cambiado, desactivación, Map y errores se prueban aparte.

Modelo transaccional **sin I/O**, veinte muestras calientes por versión:

| Líneas / accesorios / tipos | Cliente | Mediana antes/después (ms) | Llamadas de modelo antes/después |
|---|---|---:|---:|
| 1 / 0 / 1 | Existente | 0,163 / 0,136 | 19 / 15 |
| 1 / 0 / 1 | Nuevo | 0,083 / 0,084 | 20 / 16 |
| 5 / 3 / 1 | Existente | 0,140 / 0,129 | 26 / 16 |
| 5 / 3 / 1 | Nuevo | 0,151 / 0,162 | 27 / 17 |
| 20 / 30 / 3 | Existente | 0,251 / 0,231 | 72 / 18 |
| 20 / 30 / 3 | Nuevo | 0,215 / 0,204 | 73 / 19 |

Estos tiempos solo miden CPU y el modelo de persistencia. Incluyen equivalencia del grafo en cada ejecución. La hidratación anterior está representada por una llamada de modelo, no sus trece SELECT reales. No se usa el pequeño p95 del JSON para declarar alcanzada la meta del sistema. Los deltas de heap incluyen GC, no memoria máxima; los tiempos transaccionales del modelo no son tiempos MySQL. Tampoco se extrapola latencia de cinco líneas a veinte.

Responsive: [17 escenarios iniciales](OPT-04_RESPONSIVE.json), [17 poblados](OPT-04_RESPONSIVE_POBLADO.json), anchos 320–1.920 px, sidebar, título largo y revisión adicional de zoom CSS 200 %. Fixture poblado con veinte productos y treinta accesorios. Sin overflow del documento.

[Modal de confirmación](OPT-04_CONFIRMACION_RESPONSIVE.json): 320/576/768/1.440 px, dentro del viewport, foco dentro, Escape cierra, una única búsqueda previa y cero POST. Apertura hasta dos frames observada entre 38,3 y 59,7 ms. Son cuatro observaciones de navegador de desarrollo, no un p95 ni una comparación antes/después. Se preservan atributos de accesibilidad y estilos; no se certifica una evaluación humana de lector de pantalla ni contraste instrumental.

## K. SQL

| Etapa | SELECT antes | SELECT después | Escrituras antes | Escrituras después |
|---|---:|---:|---|---|
| Duplicado, lectura aislada | 1 | 1 | No ejecutadas | No ejecutadas |
| Contexto por tipo, lectura aislada | 3 | 1 | No ejecutadas | No ejecutadas |
| Destinatarios, lectura aislada | 2 | 1 | No ejecutadas | No ejecutadas |
| Hidratación del pedido de referencia | 13 observados | 0, llamada eliminada del recibo | No aplica | No aplica |
| POST completo / escrituras MySQL | No medido | No medido | No medido | No medido |

Llamadas de escritura ORM verificadas en el modelo: N `detalle.create` → un `detalle.createMany`; M `accesorio.create` → cero o un `accesorio.createMany`; dos asignaciones de destinatarios → cero o un `createMany`, conservando las creaciones de mensajes que correspondan. No equivalen a un conteo físico instrumentado. Las entradas vacías no generan lotes.

Se consultaron índices actuales de Pedidos/Cliente/Tipo_Producto/Producto_Subproceso y dos EXPLAIN. Se conserva UNIQUE de Nota de Venta y RUT; no se agrega un índice duplicado. El catálogo tiene estimación de cinco filas; el subproceso usa PRIMARY por tipo y filesort para elegir el primero; destinatarios recorre unas 36 filas estimadas. No se atribuyen segundos a esos escaneos pequeños. EXPLAIN no mide filas efectivamente examinadas ni CPU real. No se ejecutó EXPLAIN ANALYZE, DDL, cambio de pool o TLS.

## L. Concurrencia

- Doble clic: refs de búsqueda/envío cierran la ventana previa al render. La validación del servidor y UNIQUE siguen siendo necesarias.
- Dos administradores/pestañas: se prueba dos operaciones simultáneas en un modelo transaccional serializado; solo una persiste y la otra devuelve 409, sin avisos duplicados. **No certifica bloqueos/deadlocks reales de InnoDB.**
- UNIQUE: se fuerza precheck fallido/omitido en el modelo y error P2002 de `numero_nota_venta`; conserva mapeo a 409 y rollback. No se deshabilita la restricción real.
- Cliente: se conserva lectura por RUT, creación transaccional y manejo de conflicto concurrente del servicio existente; no se infiere seguridad de un cache local.
- Rollback: fallos en precheck, cliente, etiquetas, pedido, registro, etapa, contexto, detalle, accesorio, mensaje, asignación, auditoría y commit dejan el estado original sin huérfanos.
- Commit: prueba con puerta de commit mantiene la promesa sin resolver y el estado sin publicar hasta liberarla.
- Timeout/pérdida de respuesta: no se reintenta el POST ni se muestra éxito; se conserva el borrador y se exige comprobación explícita. La nueva consulta no permite duplicar un número protegido por UNIQUE aunque compita con una operación anterior.

No se implementa una infraestructura nueva de idempotencia. Un conflicto al repetir una operación confirmada sigue siendo un 409, no se convierte silenciosamente en otro pedido ni en éxito atribuible a esta sesión.

## M. Seguridad

Conservados JWT/firma/issuer/audience, identidad activa, capacidades READ_SALES_NOTES/CREATE_ORDERS, roles, PIN y su actor validado, cuotas y observación. Fase 1 de identidad permanece. El actor de creación procede de `req.pinActor`, no de `actorId/id_usuario` enviados por el cliente; el fallback interno por subject sigue verificando binding.

Se ejecutó un test HTTP con JWT/JWKS de loopback y middleware real; el validador PIN está inyectado con datos sintéticos y errores `PinServiceError`, sin usar cuentas reales. Comprueba ausente/malformado, permisos faltantes, cuenta inactiva, PIN inválido antes de transacción, POST manipulado, 201 mínimo, actor correcto, duplicado 409 y observación de lookup. Las suites PIN y Fase 1 existentes se conservan.

El backend vuelve a leer/validar la fuente y toma de ella cliente, productos, accesorios y cantidades; solo admite los campos editables ya autorizados. Se prueban cantidades/tipos inválidos y un body con actor, cliente, líneas, estados y fechas manipulados. Las consultas nuevas son parametrizadas; una entrada con sintaxis de SQL no se concatena. No hay caché de autorización ni datos sensibles nuevos en DTO/logs. Los JSON de lectura contienen formas SQL y métricas, no parámetros, nombres, RUT, PIN ni registros empresariales.

Documentación oficial contrastada con las versiones instaladas: [Prisma 7, transacciones y dependencias](https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions), [Prisma 7, createMany y soporte de retorno](https://www.prisma.io/docs/orm/v7/prisma-client/queries/crud), [MySQL 8.4, AUTO_INCREMENT](https://dev.mysql.com/doc/refman/8.4/en/innodb-auto-increment-handling.html). No se habilitan funciones Preview ni se presume contigüidad de IDs.

## N. Equivalencia

La referencia congelada `0be21bb` y el servicio nuevo se ejecutan sobre unidades de trabajo/modelos separados. Se compara el estado completo normalizado y el mismo DTO público para 1/5/20 líneas, varios tipos, repetidos, 0/3/8/30 accesorios, cliente nuevo/existente y snapshots disponibles/ausentes. Las fechas generadas durante ejecuciones diferentes se normalizan para esa comparación; se prueba por separado que registro y etapa comparten el mismo instante. No se normalizan cantidades, hashes, tipos, relaciones, estados ni textos.

Se comprueban equivalencia de los tres contextos de catálogo y conjuntos de destinatarios mediante SELECT reales. La normalización de fuente compara objetos completos para 1/5/20/1.000 líneas. No se modifican expectativas anteriores para admitir resultados distintos. La ausencia de integración de escritura MySQL limita la certificación física de estos grafos y de su concurrencia.

## O. Pruebas

**46 pruebas backend nuevas y 10 frontend nuevas**. Final:

- Backend: **313 tests; 310 aprobados, 3 fallos preexistentes**, frente a 267/264/3 antes.
- Fallos previos: `mysqlDeployment.test.js` (comparación CRLF/LF), `mysqlLabAccounts.test.js` (permisos POSIX en Windows), `mysqlLabMigrationHistory.test.js` (hash sensible a CRLF). Archivos sin cambios.
- Una ejecución simultánea de ambas suites y Edge agotó memoria virtual (`VirtualAlloc failed`) en un worker backend. Se repitió backend completo con concurrencia dos y desapareció ese fallo; no se debilitó ningún test ni se cambió configuración global.
- Frontend final: **276/276**, frente a 266/266. Una primera ejecución detectó que se cerraba el modal ante incertidumbre, contrariamente al contrato previo. Se corrigió el código para conservar ese contexto; el test existente sigue intacto y pasa.
- ESLint, build Vite y Prisma validate aprobados. `node --check` de operaciones/scripts aprobado. `git diff --check` aprobado.
- 34 escenarios responsive de página y cuatro tamaños de modal, más foco/Escape/zoom descritos en J.
- Sin benchmark real de escritura, rollback InnoDB, bloqueos concurrentes, POST HTTP completo o E2E real. `docker info` confirmó que falta `dockerDesktopLinuxEngine`; no se inició/modificó infraestructura para ocultar esa limitación.

Comandos reproducibles:

```powershell
# capaServidor
$tests = rg --files src test -g '*.test.js'
node --test --test-concurrency=2 $tests
node --test test/orderCreationPerformance.test.js test/orderCreationSecurity.test.js test/orderCreationSource.test.js
node ../tooling/prisma/node_modules/prisma/build/index.js validate
node --env-file=.env scripts/benchmarkOrderReadsOpt04.mjs --allow-development-reads --baseline-only --output=../docs/OPT-04_LINEA_BASE.json
node --env-file=.env scripts/benchmarkOrderReadsOpt04.mjs --allow-development-reads --output=../docs/OPT-04_LECTURAS_SQL.json
node scripts/benchmarkOrderCreationSyntheticOpt04.mjs
# capaVista
npm.cmd test -- --maxWorkers=2 --reporter=dot
npm.cmd run lint
npm.cmd run build
# raíz
node scripts/verify-page-layout.mjs orders
git diff --check
```

El script de lecturas requiere APP_ENV=development y opt-in explícito; no llama al endpoint de lookup porque produciría observaciones reales. Los únicos archivos de fixture escritos para caché/benchmark son sintéticos y se eliminan. El verificador poblado/modal fue temporal y se retira conservando los JSON; no se deja instrumentación productiva.

## P. Archivos

Modificados:

- `capaServidor/src/modules/orders/controller/orders.controller.js`
- `capaServidor/src/modules/orders/repo/orders.repo.js`
- `capaServidor/src/modules/orders/service/salesNoteSource.service.js`
- `capaServidor/src/modules/orders/service/salesOrderCreation.service.js`
- `capaVista/src/hooks/useOrderCreateFlow.js`
- `capaVista/src/modules/orders/api/ordersApi.js`
- `capaVista/src/modules/orders/pages/OrderCreatePage.jsx`

Creados:

- `capaServidor/src/modules/orders/repo/orderCreationOperations.js`
- `capaServidor/test/orderCreationPerformance.test.js`
- `capaServidor/test/orderCreationSecurity.test.js`
- `capaServidor/test/orderCreationSource.test.js`
- `capaServidor/test/fixtures/opt04/creationHarness.js`
- `capaServidor/test/fixtures/opt04/salesOrderCreation.before.js`
- `capaServidor/test/fixtures/opt04/salesNoteNormalization.before.js`
- `capaServidor/scripts/benchmarkOrderReadsOpt04.mjs`
- `capaServidor/scripts/benchmarkOrderCreationSyntheticOpt04.mjs`
- `capaVista/src/hooks/useOrderCreatePerformance.test.jsx`
- Este informe; `OPT-04_LINEA_BASE.json`, `OPT-04_LECTURAS_SQL.json`, `OPT-04_CREACION_SINTETICA.json`, `OPT-04_RESPONSIVE.json`, `OPT-04_RESPONSIVE_POBLADO.json`, `OPT-04_CONFIRMACION_RESPONSIVE.json` en `docs`.

Sin archivos productivos eliminados. Se retiran copias/logs/verificador temporales propios, sin tocar módulos ajenos.

## Q. Alternativas descartadas

- `createManyAndReturn`, cálculo de IDs a partir del primero o recuperación por rango de AUTO_INCREMENT: soporte/relaciones no garantizados. Solo se usa batching cuando el recibo no requiere IDs de cada detalle/accesorio.
- Cambiar el retorno predeterminado de `createOrderFromSalesNote`: rompería consumidores internos. El modo recibo es explícito desde el controlador.
- Un índice nuevo en Nota de Venta/RUT: ya tienen UNIQUE. Índices nuevos para catálogos diminutos sin benchmark aislado representativo no se justifican.
- Promise.all indiscriminado de escrituras: la conexión transaccional y dependencias no prometen paralelismo útil.
- Caché global de clientes, roles, flujos o capacidades de esquema: invalida garantías frente a cambios concurrentes/despliegues. Se mantiene Map local y prueba de esquema existente.
- Auditoría/avisos fuera de transacción o sin espera: arriesga trazabilidad y avisos falsos.
- Reintento automático de POST o interpretar un error de red como rollback: resultado incierto. Se exige comprobación explícita y UNIQUE.
- Búsquedas/creaciones masivas sobre la base compartida, inicio de Docker o DDL empresarial: no se usaron para suplir el entorno aislado ausente.
- Memoización global, store nuevo o virtualización: no hay cuello demostrado de render que lo justifique; se conservan componentes/estilos.

## R. Conclusión

La consulta de fuente conserva caché/Map y duplica menos trabajo por línea; no se midió una mejora del GET completo con observación. Preparar sigue siendo local, sin HTTP: apertura de modal observada en decenas de milisegundos, sin comparación anterior ni p95 certificado.

El registro usa un camino con menos lecturas e inserciones individuales: dos SELECT menos por tipo distinto, una lectura menos de destinatarios y eliminación del grafo final en el recibo. Se agrupan detalles, accesorios y asignaciones de avisos sin inferir IDs. **Tiempo real total de registro y disminución de duración transaccional: No medido**, por falta de MySQL aislado de escritura.

Datos, snapshots, estados, actor, etiquetas, accesorios, avisos y auditoría coinciden en los modelos probados. Duplicados y rollback están cubiertos por modelo y error UNIQUE, con la restricción real conservada; concurrencia InnoDB y lectura de pedidos recién creados requieren la integración aislada pendiente.

Las lecturas optimizadas medidas tienen mediana inferior a un segundo. El flujo completo GET/POST/E2E y su p95 no están certificados; dependen de identidad/PIN, observación, transacción y red remota que no se eliminaron para forzar la cifra.

El código queda listo para revisión e integración en desarrollo con esas limitaciones explícitas y las suites pertinentes aprobadas salvo los tres fallos previos. La validación transaccional física aislada es requisito antes de considerar certificado el nuevo camino de escritura para producción. Sin commit, push ni despliegue.

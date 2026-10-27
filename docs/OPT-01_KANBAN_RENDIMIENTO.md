# OPT-01 — Rendimiento del Kanban y sus subprocesos

Fecha: 27 de octubre de 2026. Referencia de las mediciones: `e7c65e3` (incluye Fase 1 y OPT-03). Publicación solicitada en la rama `opt-kanban`, basada en `origin/main` actualizado (`87f4248`); sin despliegue.

Al preparar la publicación se incorporaron los cambios recientes de finalización y PIN de ventas de main. Se conservó la exclusión SQL y visual de la etapa terminal 4, además de la deduplicación de páginas. Se adaptaron los dobles de pruebas al SQL y a los permisos/validaciones más estrictos de finalización. Tras integrar la base, pasaron 56 pruebas backend (OPT-01 y productionCompletion), 38 frontend (OPT-01, carga, finalización y creación con PIN) y lint. Los tiempos y resultados de suites completas que siguen corresponden a la captura anterior sobre `e7c65e3`; no se presentan como una nueva medición de `87f4248`.

## A. Resumen ejecutivo

Se sustituyeron las lecturas relacionales costosas del Kanban por proyecciones SQL parametrizadas específicas. Se redujeron las consultas físicas del tablero de 8 a 1, del detalle de 17 a 4 concurrentes y de carga operativa de 6 a 1 en las muestras medidas. Se eliminaron hidrataciones completas descartadas al completar, retroceder y ejecutar operaciones complementarias desde sus controladores. Se preservó la respuesta completa por defecto para consumidores internos.

El frontend muestra las tarjetas sin esperar al catálogo, comparte este catálogo durante 30 segundos por instancia de API, cancela lecturas obsoletas y aplica cambios confirmados sin reabrir detalles cerrados ni contaminar otra sesión. No se modificaron estilos, reglas de negocio, PIN, recuperación, permisos, esquema, infraestructura o configuración de conexiones.

Las lecturas de repositorio medidas bajaron a unos 665 ms; HTTP con identidad real de base de datos permanece entre 1,25 y 1,33 s. Por tanto, no se declara cumplido el objetivo de un segundo para el flujo completo. Se añadieron 53 pruebas aprobadas. Permanecen cinco fallos preexistentes en las suites completas y falta certificar mutaciones/concurrencia contra una base aislada y sesiones reales de Keycloak.

## B. Tablero

| Operación | Problema | Cambio | Resultado |
|---|---|---|---|
| Listar tarjetas | Hidratación de relaciones mediante 8 SELECT | CTE con página de padres acotada, JOIN de relaciones singulares y detalles; etiquetas agregadas | 1 SELECT; mediana 1985,202 → 665,243 ms |
| Filtrar y paginar | Respuestas tardías y duplicados al anexar páginas | AbortController, identificadores de petición y Set de IDs | Lecturas antiguas descartadas; deduplicación entre y dentro de páginas |
| Catálogo de estados | Solicitudes repetidas y espera del catálogo antes de mostrar tarjetas | Solicitud compartida en curso y TTL de 30 s, independiente de las tarjetas | Una solicitud por instancia/vigencia; fallo permite reintento |
| Actualización confirmada | Una respuesta tardía podía sustituir otra selección o sesión | Comprobación de instancia de API, sesión e ID seleccionado | Sin reapertura de detalles cerrados ni aplicación de respuestas a otra sesión |

Se conservaron cursor descendente, `limit + 1`, exclusiones de estados, búsquedas de NV/cliente/producto y límites de fechas. No se cambió cursor por OFFSET. La ordenación final de etiquetas conserva la del identificador de su clave compuesta. No se añadió caché de pedidos o permisos ni se atribuyen mejoras a memoización de React.

## C. Detalle

Antes se observaron 17 SELECT físicos. Ahora se ejecutan cuatro lecturas independientes en paralelo: cabecera con cliente/etapa/pago/etiquetas; detalles con producto/flujo/último avance; registros de subprocesos; comentarios de producción. Cada lectura expande una sola colección, evitando multiplicar detalles por registros y comentarios.

Se seleccionan los campos requeridos por los mapeadores existentes, incluidas observaciones y nombres del historial. No se cargan snapshots que el DTO Kanban descarta. Las fechas siguen siendo Date internamente; se conserva la conversión decimal del avance, la ordenación del historial y todos los comentarios. Las consultas de calendario y pagos mantienen su implementación.

Mediana de repositorio: 3294,610 → 665,350 ms (79,8 %). HTTP: 3882,466 → 1322,493 ms (65,9 %). El objeto interno del pedido medido ocupa 1332 bytes antes y después; el cuerpo HTTP, 1236 bytes en ambos casos. Estos tamaños corresponden al pedido de la muestra, que no tiene comentarios de producción; no se extrapolan a todos los pedidos.

Se comprobaron 21 equivalencias reales entre referencia y cambio: 13 variantes de listado, cuatro detalles con validación del precheck, pedido inexistente y tres fechas de carga. Incluyen filtros, cursor, comodines y entrada con aspecto de inyección. Se compararon los JSON HTTP completos antes/después dentro del arnés. Una prueba sintética adicional con 200 detalles, 600 registros y 700 comentarios verifica cuatro lecturas fijas y ausencia de pérdidas. No sustituye una prueba de volumen real en MySQL.

## D. Subprocesos

### Completar

Se conserva la transacción, el bloqueo del pedido y las comprobaciones de detalle, etapa, pago, flujo y avance. La lectura crítica utiliza el estado mínimo, que incluye fecha de creación para conservar el fallback del inicio. Las escrituras condicionales, fechas, registros y comentarios permanecen dentro de la transacción. Lanyard conserva la repetición de subproceso mientras el avance sea inferior al 100 %.

El controlador solicita internamente `response: 'receipt'`; el repositorio evita hidratar un pedido completo que se descartaba. Tras el commit se consulta una vez la proyección pública Kanban. Los consumidores que no solicitan recibo mantienen la respuesta hidratada anterior. La respuesta final del endpoint conserva su DTO.

Pruebas: primer/intermedio/último subproceso, pago/etapa incorrectos, detalle o actor inválido, Lanyard incompleto/completo, rollback transaccional y dos avances normales serializados que producen un solo registro. El caso de fallo de la proyección posterior al commit devuelve error sin repetir la escritura. La interfaz no reintenta automáticamente una mutación incierta.

### Retroceder

Se conserva el bloqueo, la validación del orden de flujo y el historial. La opción interna de recibo evita la hidratación final descartada; el controlador hace la misma proyección pública después del commit. Se cubren pedido terminado, retroceso anterior, primer subproceso, estados salteados, ausencia de historial y retroceso excesivo. El retorno hidratado por defecto permanece disponible.

Las mediciones de estas mutaciones utilizan servicios/repositorios reales con un doble transaccional y 5 ms por operación lógica. No son tiempos SQL ni tiempos de PIN o HTTP reales: completar primero 156,302 → 139,731 ms; completar último 155,653 → 140,545 ms; repetición Lanyard 171,904 → 155,556 ms; retroceso previo 124,155 → 108,715 ms; retroceso desde terminado 124,396 → 109,423 ms. La mejora sintética de 9,5–12,4 % confirma trabajo eliminado, pero no certifica el segundo en producción.

## E. Movimientos

`getTransitionState` pasa de tres SELECT a un JOIN parametrizado. Mantiene los campos de validación y añade fecha de creación/NV para usos internos que antes dependían de un pedido completo. Mediana de lectura mínima: 1318,391 → 660,773 ms.

Para el precheck de producción a listo se añadió `GET /:orderId/kanban-precheck`, protegido por la misma autenticación y READ_ORDERS del detalle. Devuelve los datos de disponibilidad sin consultar historiales ni comentarios: dos SELECT en paralelo. El detalle público habitual sigue incluyendo esos historiales. La interfaz solicita el precheck antes de abrir la confirmación PIN y cancela la lectura si deja de ser pertinente.

El PIN se sigue verificando en la mutación protegida, con el middleware y la política existentes. No se omitieron comprobaciones de rol, pago, estado esperado ni la verificación bajo bloqueo de todos los detalles para pasar a listo. Se probaron movimientos 1→2, 2→3 y 3→4; no se agregó una columna de finalización a la interfaz. El estado local cambia únicamente al recibir confirmación; se mantienen las notificaciones y la prevención de doble movimiento por conflicto de estado.

## F. Operaciones complementarias

- **Etiquetas:** la lectura final usa JOIN de la relación y devuelve los mismos campos de etiqueta. Se conservan auditoría, asignación y retirada. La interfaz espera confirmación, bloquea el doble envío por pedido y aplica solo el parche de indicadores; una respuesta fallida no restaura una tarjeta antigua sobre un cambio de etapa concurrente.
- **Corrección:** lectura inicial mínima y transición compacta optativa. La consulta del destinatario conserva el usuario e incluye NV para que la notificación siga usando los datos persistidos correctos. La respuesta pública se hidrata una vez tras el commit.
- **Cancelación:** mismo patrón de lectura mínima/recibo interno; se mantienen controles y el DTO público completo aunque la interfaz no utilice todos sus campos.
- **Reevaluación:** lectura mínima y respuesta compacta optativa. Mapas locales a la operación reutilizan la búsqueda de producto por nombre exacto y el primer subproceso por tipo. No se normalizan nombres en JavaScript, preservando la comparación de MySQL. No se eliminan líneas con historia; snapshots y escrituras conservan su lógica.
- **Carga operativa:** una consulta reemplaza seis, buscando el último avance hasta la fecha UTC solicitada y el avance exacto de ese día mediante la relación única. Conserva cantidades cero, null, acumulados, restantes, IDs y ordenación. El guardado masivo no cambia: una transacción y un upsert parametrizado por lote, cálculo histórico previo y última entrada duplicada prevaleciente. La interfaz espera confirmación y refresca el tablero una vez; una respuesta incierta no se reintenta. El GET se cancela al cambiar de sesión. El catálogo compartido evita repetir estados durante ese refresco.

## G. Tabla de rendimiento

Medianas de 10 muestras calientes por serie; pausa de 250 ms fuera del reloj. Referencia y cambio usan la misma base de desarrollo remota, TLS estricto y pool 10 en un contenedor diagnóstico aislado, Node 22.23.4. Se registran también mínimo, promedio, máximo, SELECT y bytes en los JSON. No se estima p95 con diez muestras.

| Operación | Antes (ms) | Después (ms) | Mejora | Muestras | Cumple 1 s |
|---|---:|---:|---:|---:|---|
| Tablero, repositorio | 1985,202 | 665,243 | 66,5 % | 10 + 10 | Solo esta lectura |
| Detalle, repositorio | 3294,610 | 665,350 | 79,8 % | 10 + 10 | Solo esta lectura |
| Carga, repositorio | 1973,083 | 663,750 | 66,4 % | 10 + 10 | Solo esta lectura |
| Estado mínimo, repositorio | 1318,391 | 660,773 | 49,9 % | 10 + 10 | Solo esta lectura |
| Precheck, repositorio | — | 663,392 | Endpoint nuevo | 10 | Solo esta lectura |
| Tablero, HTTP del arnés | 2609,923 | 1330,630 | 49,0 % | 10 + 10 | No |
| Detalle, HTTP del arnés | 3882,466 | 1322,493 | 65,9 % | 10 + 10 | No |
| Carga, HTTP del arnés | 2561,837 | 1252,633 | 51,1 % | 10 + 10 | No |
| Precheck, HTTP del arnés | — | 1323,414 | Endpoint nuevo | 10 | No |
| Completar/retroceder, flujo real | No medido | No medido | Ver doble sintético en D | 0 reales | Sin certificar |

HTTP usa routers, controladores, DTO, middleware de identidad, capabilities y binding real de MySQL. La autoridad JWT/JWKS es sintética y local, con cuota de memoria de 120/minuto. Excluye sesión real de Keycloak, navegador/render, middleware global de auditoría de soporte y escrituras de cuota SQL. Es más completo que medir el repositorio, pero tampoco representa toda la navegación de producción.

Evidencias: [SQL](OPT-01_RENDIMIENTO_SQL.json), [HTTP](OPT-01_RENDIMIENTO_HTTP.json), [estado mínimo](OPT-01_RENDIMIENTO_TRANSICION.json), [flujos sintéticos](OPT-01_RENDIMIENTO_WORKFLOWS_SINTETICOS.json). Se descartó una captura HTTP fallida: Docker conservaba comillas del issuer del `.env`; se corrigió únicamente el cargador del arnés y la captura válida utilizó el binding real. No era un fallo de identidad de la aplicación.

## H. SQL

| Función | SELECT anteriores | SELECT posteriores | Cambio |
|---|---:|---:|---|
| Listado Kanban | 8 | 1 | Página de padres y proyección específica |
| Detalle Kanban | 17 | 4 | Cuatro relaciones separadas en paralelo |
| Precheck | 17 usando detalle previo | 2 | Omite historial y comentarios |
| Estado de transición | 3 | 1 | JOIN mínimo |
| Lectura carga operativa | 6 | 1 | Último avance acotado y avance del día |
| HTTP listado | 9 | 2 | Incluye lectura fresca de identidad |
| HTTP detalle | 18 | 5 | Incluye lectura fresca de identidad |
| HTTP carga | 7 | 2 | Incluye lectura fresca de identidad |
| HTTP precheck | — | 3 | Incluye lectura fresca de identidad |

Los conteos son eventos físicos medidos para las muestras, incluidas consultas CTE iniciadas con WITH. No son constantes universales del ORM para cualquier pedido vacío o sin relaciones. El trabajo descartado de las escrituras se describe como llamadas lógicas en el doble, sin convertirlas en cifras SQL inventadas.

El JSON SQL contiene 12 EXPLAIN de las consultas completas ejecutadas, parámetros preservados dentro del arnés e inventario de índices sin valores personales. Se utilizan, entre otros, `id_pedido_idx`, claves primarias del flujo, `Registros_Pedidos_FK` y `uq_avance_lanyard_detalle_fecha`. La consulta con cursor usa rango sobre PRIMARY. El optimizador puede elegir ALL/filesort para los 49 padres de la muestra o la tabla de un comentario; eso no demuestra un cuello de botella ni justifica DDL. La última fila de avance usa el índice de detalle/fecha; algunos planes conservan filesort sobre un conjunto pequeño. No se añadieron índices.

Las entradas se interpolan mediante Prisma.sql y consultas tagged; no se concatena texto del usuario. La página se limita antes de expandir detalles, evitando que LIMIT recorte hijos. No se incorporó un JOIN único de todas las colecciones.

Referencias técnicas: [Prisma: relation queries](https://www.prisma.io/docs/orm/prisma-client/queries/relation-queries), [selección de campos](https://www.prisma.io/docs/orm/prisma-client/queries/select-fields), [consultas raw parametrizadas](https://www.prisma.io/docs/orm/prisma-client/using-raw-sql/raw-queries), [MySQL EXPLAIN](https://dev.mysql.com/doc/refman/8.4/en/explain.html).

## I. Seguridad

Se mantienen autenticación, binding activo, capacidades, PIN, bloqueos PIN, validación del actor, comprobaciones bajo bloqueo, transacciones, condiciones de actualización, auditoría y notificaciones. La nueva ruta devuelve 401 sin autenticación y 403 sin capacidad. La mutación con PIN bloqueado devuelve el 423 existente y no ejecuta escritura. No se hicieron intentos de PIN reales ni se modificó recuperación.

Los nuevos tests ejercitan pagos/etapas/actores inválidos, conflictos, rollback de fallos, SQL parametrizado, respuesta posterior al commit y respuestas obsoletas de sesión. Se conservaron Fase 1 y OPT-03. La revisión de diff de auth, users, messages, middleware, DB, esquema, shared y compose no muestra cambios. No hay caché compartida de identidad o permisos; las escrituras siguen validando datos actuales.

## J. Contratos

Se mantienen los endpoints existentes y sus DTO de listado, detalle, movimiento, subprocesos, etiquetas, corrección, cancelación, reevaluación y carga. Las opciones de recibo son internas del controlador, no controladas por el cuerpo del usuario. Las llamadas internas existentes conservan hidratación por defecto.

La única ruta añadida es el precheck: reutiliza el mapeador del detalle, pero sus historiales/comentarios están vacíos deliberadamente porque solo sirve a disponibilidad; no reemplaza la ruta de detalle. La equivalencia del precheck se comprueba sobre campos de disponibilidad. Se comparan fechas, nombres, ordenaciones, valores null/cero y JSON públicos completos de las rutas existentes. No se altera la semántica de snapshots utilizada por otros consumidores.

## K. Pruebas

| Comprobación | Resultado |
|---|---|
| Nuevas pruebas backend | 39/39 aprobadas, dos archivos |
| Nuevas pruebas frontend | 14/14 aprobadas, dos archivos |
| Backend completo | 176 pruebas: 173 aprobadas, 3 fallos preexistentes |
| Frontend completo | 187 pruebas: 185 aprobadas, 2 fallos preexistentes |
| Regresiones existentes KanbanLoading y PinModals | 9/9 aprobadas |
| Regresiones Fase 1 y usuarios | 69/69 aprobadas |
| Equivalencia real de repositorios | 21 verificaciones aprobadas |
| Estado mínimo real | Cuatro pedidos con campos comunes equivalentes |
| Lint y build frontend | Aprobados |
| Prisma validate y sintaxis JS/MJS | Aprobados |
| Responsive Edge nativo | 17 escenarios, cero overflow |
| git diff --check | Aprobado |

Comandos ejecutados desde las carpetas correspondientes:

```text
node --test
node --test test/kanbanPerformance.test.js test/kanbanWorkflows.test.js
npm.cmd run test -- --run
npm.cmd run lint
npm.cmd run build
npm.cmd run prisma:validate
node --check <archivo.js/mjs>
node scripts/verify-page-layout.mjs kanban
```

Los nombres exactos del comando frontend deben ejecutarse según los scripts de package.json (`vitest run` mediante su script de pruebas). El arnés de medición de lecturas requiere `APP_ENV=development`, `--allow-development-reads` y `--reference-root` apuntando al checkout `e7c65e3`. Sus variantes `--http-only` y `--transition-only` generan las otras capturas. `benchmarkKanbanWorkflowsOpt01.mjs` usa exclusivamente el doble transaccional, sin DB real.

Los tres fallos backend existentes corresponden a `mysqlDeployment.test.js` (texto sensible a CRLF), `mysqlLabAccounts.test.js` (permisos POSIX en Windows) y `mysqlLabMigrationHistory.test.js` (hash sensible a CRLF). Los dos frontend pertenecen a `PageMigration.test.jsx`, que espera el texto ausente “Puedes crear usuarios y editar sus datos”. No se modificaron esas pruebas ni se agregó texto artificial para hacerlas pasar. No se observaron nuevas regresiones en las pruebas del alcance.

La verificación responsive cubre anchos 320–1920, variantes de sidebar, título, zoom y modal de carga. Evidencia: [OPT-01_RESPONSIVE.json](OPT-01_RESPONSIVE.json). Las pruebas funcionales de orquestación mockean hijos; no equivalen a una sesión de navegador contra Keycloak y mutaciones reales.

No se realizaron mutaciones sobre pedidos/carga reales por carecer de una base aislada autorizada para datos de prueba. Los bloqueos y la concurrencia de escritura se prueban con dobles serializados; no se certifica contención real InnoDB. Los casos de PIN usan middleware/dobles, sin intentos reales. No se debilitó una validación para obtener métricas.

## L. Archivos modificados

Editados, bajo `capaServidor/src/modules/`:

- `orders/controller/orders.controller.js`
- `orders/repo/orderReadOperations.js`
- `orders/repo/orderSalesNoteOperations.js`
- `orders/repo/orderStageOperations.js`
- `orders/repo/orderSubprocessOperations.js`
- `orders/repo/orderViewOperations.js`
- `orders/repo/orderWriteOperations.js`
- `orders/routes/order.routes.js`
- `orders/service/order.service.js`
- `orders/service/orderProduction.service.js`
- `productionLoad/repo/productionLoad.repo.js`

Editados, bajo `capaVista/src/modules/kanban/`:

- `api/kanbanApi.js`
- `components/KanbanCard.jsx`
- `components/KanbanColumn.jsx`
- `pages/KanbanBoardPage.jsx`

Nuevos:

- `capaServidor/src/modules/orders/repo/kanbanRead.repo.js`
- `capaServidor/scripts/benchmarkKanbanOpt01.mjs`
- `capaServidor/scripts/kanbanHttpProbeOpt01.mjs`
- `capaServidor/scripts/benchmarkKanbanWorkflowsOpt01.mjs`
- `capaServidor/scripts/fixtures/kanbanProductionFixture.mjs`
- `capaServidor/test/kanbanPerformance.test.js`
- `capaServidor/test/kanbanWorkflows.test.js`
- `capaServidor/test/productionCompletion.test.js` (archivo existente de main adaptado a la lectura SQL, conservando las aserciones de exclusión de terminados y disponibilidad del calendario)
- `capaVista/src/modules/kanban/components/KanbanPerformance.test.jsx`
- `capaVista/src/modules/kanban/pages/KanbanLoadPerformance.test.jsx`
- `docs/OPT-01_KANBAN_RENDIMIENTO.md`
- `docs/OPT-01_RENDIMIENTO_SQL.json`
- `docs/OPT-01_RENDIMIENTO_HTTP.json`
- `docs/OPT-01_RENDIMIENTO_TRANSICION.json`
- `docs/OPT-01_RENDIMIENTO_WORKFLOWS_SINTETICOS.json`
- `docs/OPT-01_RESPONSIVE.json`

No se eliminan archivos versionados. Las copias del checkout, paquetes temporales y el contenedor de diagnóstico se retiran al finalizar; los contenedores originales que estaban detenidos permanecen detenidos.

## M. Mejoras descartadas

No se activó `relationJoins` Preview ni se cambió Prisma, pool, TLS o infraestructura. Se descartó reunir todas las colecciones en un megajoin por multiplicación de filas, reducir payload eliminando comentarios o cambiar contratos de detalle. No se conservaron cachés de pedidos/permisos, rollback optimista de tarjetas completas, eliminación de PIN/bloqueos, cambio a OFFSET o índices sin medición representativa. No se implementó PERF-058 fuera del alcance. Los mapas de productos son locales y respetan la comparación de nombres de MySQL.

## N. Limitaciones

La base remota impone aproximadamente 660 ms por oleada de consulta. La identidad debe consultarse antes del controlador, por lo que el HTTP conserva dos oleadas incluso donde el repositorio tiene una sola. No se alteraron infraestructura, ubicación de MySQL, red, conexiones ni políticas de identidad para intentar ocultar ese coste.

La muestra real es pequeña y no certifica volumen de producción, p95, sesiones reales de Keycloak, coste total de auditoría/cuotas, navegador o contención concurrente de InnoDB. Las cuatro lecturas paralelas del detalle no prometen una instantánea transaccional más fuerte que la lectura previa. La equivalencia de un fixture sin comentarios se complementa con pruebas sintéticas de comentarios/volumen, pero queda pendiente una muestra real representativa autorizada.

Las mutaciones reales y la carga masiva no tienen tiempos antes/después certificados. La serialización sintética del avance normal no implica idempotencia universal de repeticiones Lanyard, ni se añadió una clave de idempotencia. Tras una escritura confirmada cuyo DTO falle, la interfaz no reintenta automáticamente; se conserva el comportamiento de error del endpoint.

No se requiere una nueva autorización para revisar estos cambios locales. Crear datos de ensayo reales, migrar índices, cambiar servicios/infraestructura o desplegar requiere un alcance explícito y un entorno adecuado. No se realizó ninguna de esas acciones.

## O. Conclusión

El listado reduce 66,5 % su mediana de repositorio y 49,0 % el HTTP del arnés; abrir un pedido reduce 79,8 % y 65,9 %, respectivamente. Desaparecen siete SELECT del listado, trece del detalle, cinco de carga y dos del estado mínimo en las muestras. Completar y retroceder eliminan hidrataciones completas descartadas y mejoran 9,5–12,4 % en el doble; falta medir esas escrituras en un entorno aislado real.

Las lecturas individuales de repositorio cumplen un segundo en estas mediciones. Ningún flujo HTTP medido cumple ese objetivo; los restantes siguen sin certificar. El cambio está preparado para revisión e integración controlada en desarrollo, con cinco fallos de suite preexistentes documentados y verificación de mutaciones/concurrencia real pendiente. No constituye una certificación del SLO completo ni un despliegue.

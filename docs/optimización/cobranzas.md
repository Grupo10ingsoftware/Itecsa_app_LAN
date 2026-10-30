# Cobranzas — implementación y verificación

30 de octubre de 2026. Rama `optimizacion-final`; HEAD de partida y de cierre `554734f6c5aef2fdc075c0cd76e79ed14be0413d`. Cambios locales, sin commit, push, merge ni despliegue. El árbol estaba limpio al comenzar. `git merge-base HEAD b90afab762200da0b0ca6b426a7d17648b441ec1` devuelve ese commit histórico: es ancestro, con 18 commits posteriores hasta HEAD.

## Resultado y límite real

Cobranzas utiliza `PaymentConfirmationPage`, la misma pantalla y dominio de Confirmación de pago. Se implementaron reutilización de previews durante paginación, recuperación de páginas vacías por decisiones remotas, presentación del vendedor real, validación previa de IDs y eliminación del JOIN innecesario de clientes en contadores sin búsqueda. No se creó otro módulo ni se inventaron importes, conciliación bancaria, PDF o firma.

**La meta de 1.000 ms no queda lograda para las lecturas HTTP remotas ni para las escrituras medidas.** Las lecturas de servicio quedan debajo de un segundo en las muestras, pero HTTP alcanza 1.342,182 ms y los rechazos confirmados 5.735,497 ms. El preview reutilizado en memoria no hace HTTP/SQL. No se midió acción del usuario → contenido visible en un navegador real.

El usuario amplió expresamente la autorización inicial: permitió escribir en Aiven y limpiar posteriormente. Se crearon exclusivamente registros ficticios identificados por `COB-TEST-1793360400000`; no se modificaron pedidos/clientes previos, esquema, migraciones, configuración de despliegue, pool, TLS ni Keycloak operativo. Los datos de prueba se conservaron para esa limpieza posterior.

## Contexto recuperado y estado anterior

Se leyó el [informe OPT-02](../OPT-02_CONFIRMACION_PAGOS_RENDIMIENTO.md), sus pruebas y scripts, la implementación vigente y el informe previo de [gestión de usuarios](gestion-usuarios.md), especialmente sus mediciones de transporte/driver. Se conservan íntegros esos registros. Los archivos `docs/auditoria-mysql/INFORME_AUDITORIA_MYSQL.md`, `CHECKPOINT.md`, `ANEXO_TRAZABILIDAD_MYSQL.md`, `DICCIONARIO_MYSQL.md`, `AUDITORIA_MAESTRA_RENDIMIENTO.md` y `PLAN_MAESTRO_OPTIMIZACION_ITECSA.md` no están en este checkout. No se atribuyen defectos vigentes a perfiles DATA-PAYMENTS, DATA-PAYMENT-PREVIEW o F06/F24/F26 sin comprobarlos en el código/pruebas actuales.

| Acción/ruta vigente | Función y SQL antes de editar | Hecho comprobado |
| --- | --- | --- |
| GET `/api/orders/payments` | `OrderService.getPagedPaymentWorkspace` → `listPaymentViewsOperation` → `readPaymentPage` y `readPaymentCounts`, concurrentes | Ya paginado; proyección explícita; 2 SELECT calientes de dominio. No se recuperaba todo el universo. |
| Estado/búsqueda/fechas | `status`, `search`, `from`, `to`; `Prisma.sql` y `Prisma.join` | `status` es el parámetro que usa React. `paymentStatus` no es su sustituto. Búsqueda parcial en NV, nombre, razón social y RUT. |
| Paginación | `page`, `limit`, `LIMIT limit+1`, `OFFSET (page-1)*limit`; cursor descendente alternativo | Tamaños 10/20/30/40/50. Página y cursor no se combinan. La pantalla actual tiene páginas numeradas, a diferencia de partes del informe histórico. |
| Contadores | Agregación condicional de Pendiente/Rechazado/Confirmado | Excluyen deliberadamente estado seleccionado, página y cursor. Incluyen búsqueda y fechas. El JOIN con Cliente se hacía también sin búsqueda. |
| Catálogo | `PaymentStatusRepo.getAll/get`; GET `/api/payment-status` y `/:id` | TTL 5 minutos y promesa concurrente ya implementados. Workspace parcial omite catálogo; no había 2 GET iniciales separados en React. |
| Preview | GET `/api/orders/:orderId/payment-records/preview` → `PaymentRecordService.getConfirmationDetails` → `PaymentRecordRepo.getConfirmationSource` | SELECT parametrizado con relaciones y fallback compatible con esquema sin snapshots. Precarga bajo demanda y deduplicación ya existían. |
| Historial/detalle | GET `/api/orders/:orderId/payment-records` y `/:paymentRecordId` | Capacidad READ_PAYMENTS; la búsqueda de un registro exige también su pedido. IDs no vacíos pero inválidos podían llegar a Prisma. |
| Lista → detalle → paginar → volver | `loadPaymentData` ejecutaba `previewCache.clear()` en toda lectura | Se perdía un preview válido aunque solo cambiara la página. Prueba nueva falló antes del cambio: 2 GET en vez de 1. |
| Página cuyo último pedido resuelve otro usuario | Lectura `includeSummary=false` reutilizaba contador durante 30 s | Respuesta vacía no reconciliaba ese contador; se quedaba en una página inexistente. Prueba nueva reprodujo el fallo antes de corregirlo. |
| Detalle del vendedor | API devuelve `sellerName`; `mergePaymentPreview`/modal leían `sellerEmail` | El vendedor disponible no se mostraba. No faltaba el dato en SQL. |
| Rechazo de pago | PATCH existente → PIN/actor en ruta → `updPaymentStateOperation` → lock, relectura, update, Registros y Registro_Pago, commit | Se mantiene el contrato y transacción. Tras respuesta confirmada, React reconcilia **la página completa y contadores** para rellenar filas: conducta actual, no el resumen solo descrito en OPT-02 antiguo. |

Fechas conservadas: inicio UTC inclusivo y final UTC del día siguiente exclusivo, sobre `fecha_creacion`. No se cambió la interpretación de DST. `%`, `_` y comodines mantienen su semántica previa; las entradas no se concatenan al SQL.

## Hallazgos y decisiones

| Gravedad | Estado | Hallazgo/decisión |
| --- | --- | --- |
| Grave | No identificado en este recorrido | No se encontró una vulneración confirmada que justificara cambiar autorización o transacciones. Esto no certifica toda la aplicación. |
| Medio | Confirmado | Página vacía con resumen obsoleto tras una decisión externa. Se lee resumen focalizado y se ajusta a la última página válida; no se deducen totales desde filas parciales. |
| Medio | Confirmado | IDs inválidos llegaban al repositorio en historial/catálogo; preview tampoco limitaba al INT de DB. Se rechazan antes de DB con 400. Una prueba negativa nueva falló antes de implementar la validación. |
| Medio | Confirmado | Paginación descartaba previews vigentes y añadía GET remoto al volver. Se conserva la caché solamente dentro del mismo estado/búsqueda/fechas y su TTL original. |
| Bajo | Confirmado | Modal omitía vendedor recibido. Se propaga `sellerName` y se conserva fallback de email para consumidores anteriores. |
| Bajo | Confirmado | COUNT sin búsqueda hacía lookup de Cliente por cada pedido. Se retira ese JOIN únicamente cuando ningún predicado lo necesita. |
| Medio, rendimiento | Confirmado; causa completa pendiente | Lecturas HTTP y rechazo real exceden 1 s. Los spans muestran dos fases de lectura autenticada y trabajo SQL secuencial de escritura. No se atribuye el remanente a CPU, red, pool o RAM sin instrumentación que lo separe. |

No estaba mal: filtrado backend, resumen independiente del estado, `LIMIT+1`, catálogo deduplicado, SQL parametrizado, caché acotada por sesión/workspace, descarte de respuestas antiguas, control de PIN, locking e idempotencia. No se reimplementaron ni eliminaron.

Alternativas consideradas:

- Quitar toda invalidación del preview: descartado. Filtros, foco, reintento explícito, escritura, errores 401/403, permisos/sesión y desmontaje siguen invalidando. Se mantiene TTL 15 s, máximo 30 entradas y 2 precargas especulativas simultáneas.
- Recalcular COUNT en cada página: descartado. Se conserva reutilización durante 30 s; una **página parcial vacía** solicita `summaryOnly=true`. Si el total bajó, se carga la última página. En recuperación pueden ser 3 GET en total: página vacía, resumen y página corregida. El caso normal sigue haciendo 1 GET de página.
- Cambiar a cursor como única navegación: descartado porque eliminaría la navegación numerada vigente. Cursor y OFFSET permanecen disponibles con su validación actual.
- Índice nuevo, caché global de cartera, caché de identidad o cambio global del driver: descartados aquí. El EXPLAIN usa índices existentes y la muestra es pequeña; cachear identidad cambia vigencia de acceso. El análisis previo de usuarios tampoco certificó trasladar a endpoints el beneficio del caché de prepared statements. No se aplicaron DDL ni ajustes globales especulativos.
- Reducir lecturas/validaciones de la transacción de pago: fuera del cambio dedicado de Cobranzas. Se verificó la regresión y se deja el coste medido para el prompt especializado; no se adelantó éxito al commit.

## Cambios por archivo y consumidores

| Archivo/función | Cambio aplicado y efecto |
| --- | --- |
| `capaVista/src/modules/payments/pages/PaymentConfirmationPage.jsx` / `loadPaymentData` | Scope del preview separado de página/tamaño. Conserva datos vigentes al paginar, refresca resumen si una página parcial llega vacía y descarta también respuestas antiguas de esa recuperación. Limpia caché ante 401/403 del listado. |
| `capaVista/src/modules/payments/utils/paymentOrders.js` / normalización y merge | Propaga `sellerName` real, manteniendo `sellerEmail`. No agrega importes ni datos inventados. |
| `capaVista/src/modules/payments/components/PaymentActionConfirmModal.jsx` | Muestra nombre real del vendedor, con fallback compatible. Aplica tanto al detalle como a Confirmación de pago. |
| `capaServidor/src/modules/orders/repo/paymentWorkspaceRead.repo.js` / `readPaymentCounts` | Omite Cliente sin `search`. Conserva agregación, collation, fechas, parámetros, ceros y contrato público. Listado y demás vistas de pedidos no cambian. |
| `capaServidor/src/modules/payments/service/paymentId.js` | Validador común del dominio: IDs positivos representables en MySQL INT firmado. No hay otro parser equivalente compartido en el recorrido inspeccionado. |
| `paymentRecord.service.js` / lecturas y `paymentStatus.service.js` / `getPaymentStatus` | Validan antes de llamar al repositorio. DTO/404 de IDs válidos y asociación pedido/registro se conservan. Entradas inválidas producen 400 en lugar de error de Prisma o consulta inútil. |
| `capaServidor/test/paymentPerformance.test.js` | COUNT sin JOIN, IDs negativos/malformados/fuera de rango y autorización de las 6 rutas; conserva regresión transaccional, roles y PIN. |
| `PaymentPerformance.test.jsx`, `PaymentModals.test.jsx` | Preview al volver de otra página; invalidación por filtros/escritura; recuperación de página y su cancelación; 403/404; selección que cambia antes de responder; vendedor real y fallback. |
| `capaServidor/scripts/diagnoseCollections.mjs`, `collectionsHttpProbe.mjs` | Diagnóstico opt-in acotado; TLS y destino verificados, fixture propio, mediciones SQL/HTTP, persistencia física, carrera de 2 operaciones y rollback. Sin credenciales/tokens/PIN/filas empresariales en evidencia. |

No cambian CSS, acciones visibles, orden de pedidos, endpoints, contratos válidos, roles, Keycloak, PIN, bloqueo o política por fila. READ_PAYMENTS habilita la cartera según la política compartida vigente; no se inventó un filtro de propietario. El detalle de un registro sí conserva la relación obligatoria con su pedido.

Reversión: retirar los cambios de estos archivos y sus pruebas restaura el comportamiento anterior, sin migración. Revertir código no elimina la auditoría ni los fixtures persistidos: su limpieza es una operación separada, pendiente del usuario.

## Mediciones ANTES / DESPUÉS

Windows/Node v24.19.0 → Aiven MySQL 8.4.8, TLS con CA y comprobación de identidad, pool 10 sin cambios. Diez muestras secuenciales calientes por serie, después de calentamiento. **p95 no calculado con n=10; tampoco con n=3 de escritura**. Los máximos incluyen todos los valores de cada serie. No son producción LAN ni carga representativa; no hubo simulación de 40 usuarios.

Base de código anterior: HEAD indicado arriba. Posterior: diff local de este trabajo. El proceso de línea base cargó la implementación anterior antes de cambiar el COUNT. La verificación final de IDs se incorporó después de cargar el proceso de medición posterior; solo afecta entradas inválidas, verificadas por pruebas, y no se le atribuye ahorro en los tiempos de lecturas válidas.

Para la comparación de lecturas se recapturó el ANTES después de los primeros 3 rechazos de prueba: así ANTES y DESPUÉS usan los mismos 39 pedidos ficticios, con 20 pendientes, 8 confirmados y 11 rechazados. Las siguientes escrituras se ejecutaron **después** de terminar las lecturas posteriores. Mismo perfil de lectura activo para el harness. No se controla actividad externa sobre el universo global de la base; las verificaciones exhaustivas de filtros están acotadas al fixture. Las primeras mediciones anteriores a esos 3 rechazos se conservan separadas y no se mezclan con esta comparación.

Los bytes son JSON UTF-8 serializado, sin cabeceras, compresión ni tamaño físico del protocolo MySQL. `SQL` significa SELECT de dominio/identidad en las filas de lectura; no es una estimación de paquetes. Los eventos del driver incluyen transporte y pueden solaparse: sumar los dos SELECT concurrentes del workspace **no** da su tiempo total. Los JSON conservan cada span del driver, filas de resultado, bytes y muestra.

| Operación y tramo | n antes/después | ANTES p50 / máximo ms | DESPUÉS p50 / máximo ms | SQL antes→después | JSON bytes antes→después | Meta en el tramo medido |
| --- | --- | --- | --- | --- | --- | --- |
| Carga inicial, servicio | 10/10 | 656,680 / 915,817 | 661,481 / 663,488 | 2→2 | 2732→2732 | Cumple en muestra; usuario completo no medible |
| Aplicar status+search+fechas, servicio | 10/10 | 658,434 / 661,794 | 661,096 / 663,602 | 2→2 | 2731→2731 | Cumple en muestra |
| Página parcial, servicio | 10/10 | 657,425 / 661,948 | 660,741 / 662,850 | 1→1 | 2554→2554 | Cumple en muestra |
| Resumen focalizado, servicio | 10/10 | 657,463 / 661,739 | 661,234 / 662,943 | 1→1 | 227→227 | Cumple en muestra |
| COUNT sin búsqueda, driver/repositorio | 10/10 | 661,193 / 666,079 | 659,982 / 662,273 | 1→1 | 43→43 | Cumple en muestra; sin mejora HTTP demostrada |
| COUNT con búsqueda, driver/repositorio | 10/10 | 657,433 / 662,262 | 661,572 / 669,065 | 1→1 | 42→42 | Cumple en muestra |
| Catálogo frío, repositorio | 10/10 | 656,935 / 660,513 | 660,057 / 661,678 | 1→1 | 314→314 | Cumple en muestra |
| Catálogo caliente, repositorio | 10/10 | 0,001 / 0,005 | 0,001 / 0,004 | 0→0 | 314→314, memoria | Cumple; mejora previa conservada |
| Preview de fixture, servicio | 10/10 | 657,764 / 662,299 | 661,399 / 663,524 | 1→1 | 243→243 | Cumple en muestra |
| Carga inicial HTTP autenticada | 10/10 | 1318,681 / 1336,078 | 1332,332 / 1342,182 | 3→3 | 2732→2732 | **No cumple** |
| Aplicar filtro HTTP autenticado | 10/10 | 1321,904 / 1342,490 | 1333,027 / 1341,045 | 3→3 | 2731→2731 | **No cumple** |
| Página parcial HTTP autenticada | 10/10 | 1309,718 / 1334,002 | 1333,389 / 1340,940 | 2→2 | 2554→2554 | **No cumple** |
| Preview HTTP autenticado sin caché UI | 10/10 | 1311,157 / 1334,970 | 1325,532 / 1336,903 | 2→2 | 243→243 | **No cumple** |
| Preview caliente, helper real tras carga HTTP | —/10 | Sin medición comparable de política anterior | 0,005 / 0,010 | —→0 | 243 en memoria; 0 transferidos en hits | Cumple helper; render no medible |

HTTP: 1 GET por muestra en las cuatro series HTTP. Incluye routers/controladores/DTO, JWT RS256/JWKS de autoridad local sintética, consulta **real** de identidad activa en Aiven, capacidades y cuota en memoria de 120/minuto. Excluye login/sesión de Keycloak operativo, navegador/render, auditoría global de soporte y persistencia SQL de cuota. Ningún JWT del diagnóstico sirve en la API operativa. El warmup de preview procede de un GET HTTP real; sus 10 hits posteriores registran **0 HTTP y 0 SQL**, no respuestas simuladas.

La prueba React de ir a página 2 y volver acredita **2 GET de preview antes → 1 después**, mientras dura el TTL, para la secuencia completa abrir/paginar/volver/reabrir. Los GET de listado siguen siendo los necesarios para ambas páginas. No se presenta el microbenchmark del helper como tiempo hasta modal visible ni como una comparación E2E. La precarga y la apertura simultánea comparten la misma promesa; filtros, foco y escritura fuerzan la lectura pertinente.

### SQL, filas y tiempo fuera de meta

- Listado: 10 pedidos públicos por página en estas muestras; SQL trae como máximo 11 por `LIMIT+1`. No hay JOIN de colecciones que multiplique pedidos. La matriz real recorre páginas y comprueba IDs únicos y orden.
- Preview: 1 producto de prueba con cantidad **0**, vendedor ficticio y campos opcionales nulos; 243 bytes. El catálogo frío y el probe de capacidad de snapshots son calentamientos separados, no SELECT ocultos en las series calientes.
- EXPLAIN/ANALYZE de COUNT sin búsqueda: antes 91 búsquedas de PK en Cliente; después no accede a Cliente y usa lectura cubierta por `id_estado_pago_idx` sobre Pedidos. La captura puntual del motor fue **0,294 → 0,147 ms (n=1 por versión)**. No prueba una mejora porcentual reproducible. El driver sigue alrededor de 660 ms; no se adjudica toda esa diferencia a la red ni se equipara duración de driver a tiempo de motor.
- HTTP conserva identidad activa → lectura de dominio. Los spans están en el JSON; el máximo posterior de carga inicial es **1.342,182 ms**, 342,182 ms sobre la meta, aun excluyendo navegador/Keycloak real. No se quitó la comprobación de identidad para ahorrar una fase.
- Las series muestran variación y pequeñas regresiones en p50 de varias lecturas, también en consultas que no cambiaron. **No hay mejora fiable de latencia HTTP atribuible al JOIN retirado.** Sí hay menos trabajo de motor verificado por plan y una solicitud evitada al reutilizar preview.

### Inserción y actualización crítica reales

El módulo de consulta no tiene una inserción comercial propia. Se midió el rechazo desde el servicio real, que incluye UPDATE de estado y las dos inserciones auditables, esperando commit. Son **3 pedidos pendientes nuevos por cohorte**, del mismo fixture/actor/etapa, nunca el retorno idempotente de un pedido resuelto como sustituto de escritura nueva. Cohortes distintas: **Sin medición comparable de mejora del PATCH**, que no fue modificado.

| Operación/tramo | n antes/después | ANTES p50 / máximo ms | DESPUÉS p50 / máximo ms | Trabajo observado | Meta |
| --- | --- | --- | --- | --- | --- |
| Rechazo: UPDATE + Registros + Registro_Pago + commit, servicio | 3/3 | 5083,965 / 5715,039 | 5735,410 / 5735,497 | 8 SELECT, 1 UPDATE, 2 INSERT y 1 marcador transaccional del driver por muestra; 390 bytes internos | **No cumple** |
| Suma de spans del driver en esa escritura secuencial | 3/3 | 4692,218 / 5272,954 | 5290,461 / 5291,410 | No es tiempo exclusivo del motor | **No cumple** |
| Dos rechazos simultáneos del mismo pedido | —/1 par | Sin medición comparable | 7016,518 total del par | 2 operaciones, 1 decisión durable | No cumple total del experimento; no es percentil por operación |
| Inserción aislada de fixture | — | Sin medición comparable | No cronometrada como acción comercial | 1 cliente, 1 actor deshabilitado, 39 pedidos y 1 detalle; transacción real | No medible |

Las escrituras entran por servicio con un actor técnico ficticio preseleccionado; **no prueban HTTP+PIN ni login real de ese actor**, que no tiene credenciales ni binding y permanece Desvinculado. Los controles de ruta/PIN se ejercitan en regresión. Las muestras de rechazo no se etiquetan como latencia del PATCH completo.

El tramo SQL secuencial ya supera ampliamente 1 s; el resto de tiempo incluye trabajo fuera de sus eventos y límites transaccionales no instrumentados por separado. No se separaron adquisición, lock, BEGIN/COMMIT o cómputo en perfiles independientes y no se inventa una causa. No se midió una confirmación real con avisos operativos ni se enviaron notificaciones a terceros. La confirmación, revisión y sus consecuencias se cubren con pruebas de regresión transaccional.

Alternativas restantes: medir la misma topología con API/DB/Keycloak en LAN, correlacionar adquisición/lock/commit y revisar las lecturas e hidrataciones del PATCH en su prompt especializado. Las cifras actuales no justifican omitir PIN, locks, auditoría, confirmación de commit, frescura de identidad ni cambiar durabilidad/TLS para alcanzar 1 s.

## Matriz de verificación

| Caso | Entorno y resultado |
| --- | --- |
| Pendiente/Confirmado/Rechazado + search+fechas | **PASS Aiven real**: los 3 estados × límites 1/10/20/30/40/50, todas sus páginas, counts exactos contra filas físicas, sin duplicados. Se usa `status`, no un HTTP 200 sin verificar filtro. |
| Límites inclusivos de fecha y universo vacío | **PASS Aiven real**: 2026-09-06 y 2026-09-07 por separado; conteos cero y página vacía. UTC y rango invertido/fecha imposible se conservan en unitarias. |
| SQL parametrizado, cursor, OFFSET, catálogo concurrente | **PASS backend**: búsqueda semejante a inyección enlazada como valor, 4 predicados de búsqueda, fechas, LIMIT+1, OFFSET y prohibición de combinar página/cursor. |
| Rutas activas, capacidades y datos de clientes | **PASS**: las 6 rutas rechazan rol de Producción sin READ_PAYMENTS, permiten rol de Cobranzas; no llaman al controlador al denegar. Harness HTTP real devuelve 401 sin JWT. Usuario activo/rol/binding y demás negativos cubiertos por regresión compartida. |
| IDs inválidos | **PASS**: texto, vacío/espacio, cero, negativos, fracciones, fuera de INT, null/undefined; 400 antes del repositorio en historial, registro, preview y estado. |
| Registro bajo otro pedido | **PASS Aiven real**, 404 y sin devolver un registro ajeno al pedido solicitado. |
| Preview: precarga/apertura/TTL/errores | **PASS React/cache**: deduplicación, TTL 15 s, máximo de entradas/precargas, error reintentable y limpieza 401/403. **PASS lectura HTTP real + 10 hits** sin otras solicitudes. |
| Cambiar selección/cerrar modal antes de responder | **PASS React**: ninguna respuesta tardía reabre o sustituye otro detalle. 403/404 impiden continuar a PIN y permiten nuevo intento. |
| Paginación con decisión remota | **PASS React**, prueba que fallaba antes: página parcial vacía → resumen → última página. Cambio de filtro aborta también ese resumen y descarta su resultado tardío. |
| Invalidación y resultado de Confirmación de pago | **PASS React**: esperar commit, un solo PATCH, conteos/página reconciliados, rellenado y retroceso de última página, invalidación de preview, sesión/permisos/foco, 409 e incertidumbre sin reenvío silencioso. |
| Persistencia e idempotencia | **PASS Aiven real**: 6 rechazos nuevos en dos cohortes y repetición de cada uno; 1 decisión por pedido. |
| Carrera | **PASS Aiven real**: exactamente 2 rechazos simultáneos, una sola decisión. Confirmar/rechazar en ambos órdenes y revisiones en etapas 1/2/3 cubiertos con dobles transaccionales, no certificados como carrera InnoDB de esos destinos distintos. |
| Rollback físico | **PASS Aiven real**: fallo inyectado después de UPDATE y de insertar auditoría/decisión, antes del commit; pedido vuelve a Pendiente y no quedan Registros. Ninguna caída real de DB fue inducida. |
| PIN, roles, revisión, avisos y fallos de cada escritura | **PASS regresión backend**: PIN inválido/bloqueado/no aceptado/faltante; capability/motivo de revisión; rollback de update/auditoría/decisión/avisos; control del commit. Son pruebas controladas, sin bloquear PIN de usuarios reales. |
| Tabla, móvil, teclado y apariencia | **PASS pruebas existentes de componentes**: campos, menús, permisos y cantidades. Sin cambios de CSS/maquetación. **Pendiente** verificación visual nueva en navegador/responsive: el runner existente requiere playwright-core, ausente; no se instaló dependencia ni se presenta evidencia histórica como ejecución actual. |

Comandos finales:

- Desde `capaServidor`: `node --test test/*.test.js src/modules/auth/service/*.test.js src/modules/users/service/*.test.js` → **427/427 PASS**. Incluye Pagos, Kanban, creación/historial de pedidos, calendario, usuarios, identidad, PIN y notificaciones. La ejecución dentro del sandbox falló inicialmente por EACCES de HTTP local; fuera del sandbox pasó.
- Desde `capaVista`: `npm test -- --maxWorkers=2` → **503/503 PASS**, 61 archivos. Módulo de pagos: 47 pruebas incluidas en el total.
- `npm run build` → **PASS**, 587 módulos.
- ESLint sobre los 5 JS/JSX modificados de pagos → **PASS**.
- `npm run lint` global → **FAIL previo**: tres imports sin uso (`screen`, `within`, `normalizeProductType`) en `src/modules/metrics/utils/productColors.test.jsx`. Sin cambios en ese archivo.
- `node --check` de ambos scripts y `git diff --check` → **PASS**.

## Evidencia, datos conservados y reproducción

- [Lecturas ANTES comparables](evidencia/cobranzas-before.json).
- [Lecturas DESPUÉS, escrituras, carrera, rollback y planes](evidencia/cobranzas-after.json).
- [Fixture inicial y primera cohorte de escrituras](evidencia/cobranzas-escrituras-iniciales.json); sus lecturas anteriores a las primeras decisiones no se usan como comparación controlada.
- [Preview cargado por HTTP y reutilizado en memoria](evidencia/cobranzas-preview-cache.json).

Los JSON no incluyen credenciales, PIN, tokens, subject del usuario activo ni filas de cartera empresarial. Incluyen IDs de registros **ficticios**, bytes, duraciones, eventos del driver y EXPLAIN. Los intentos iniciales de conexión bloqueada por sandbox y creación fallida por compatibilidad de columnas no forman parte de las muestras exitosas: las transacciones fallidas revirtieron y se adaptó solo el diagnóstico mediante `select` explícito y `supportsOrderSnapshots`, sin DDL. Aiven carece de las columnas snapshot; su fallback existente siguió funcionando.

Registros para limpieza posterior:

- Prefijo único: **`COB-TEST-1793360400000`**.
- Cliente: **75**. Actor ficticio: **51**, estado **Desvinculado**, sin credenciales ni ExternalIdentity/usuario Keycloak creado.
- Pedidos: **164–202 inclusive**, 39 IDs también enumerados en los JSON. Un detalle con cantidad 0 en el pedido 164.
- Estado final comprobado: **16 Pendiente, 8 Confirmado, 15 Rechazado**. Siete pedidos tienen una decisión/auditoría de rechazo nueva (6 de cohortes + 1 de carrera); el pedido usado para rollback conserva Pendiente y cero Registros.
- No se borraron datos ni auditorías, ni se crearon avisos a destinatarios operativos. Para limpiar posteriormente hay que verificar pertenencia al fixture y dependencias antes de borrar; no basta con revertir código ni con borrar un rango de IDs sin comprobarlo.

Diagnóstico de solo lectura reproducible desde `capaServidor`, con el entorno existente y sin secretos en argumentos:

```powershell
node scripts/diagnoseCollections.mjs --phase=after --fixture=COB-TEST-1793360400000 --allow-aiven-reads --measure-only --with-http
node scripts/diagnoseCollections.mjs --phase=after --fixture=COB-TEST-1793360400000 --allow-aiven-reads --cache-only
```

La primera receta vuelve a capturar lecturas **del estado final actual** y sobrescribe su JSON de fase: copiar la evidencia anterior antes de repetirla si se quiere conservar esa comparación. No incluir `--allow-aiven-test-writes` para reproducir lecturas. Las escrituras del diagnóstico exigen ese opt-in explícito, verifican destino Aiven/TLS y solo seleccionan los pedidos del fixture; una nueva cohorte ya resuelta no sirve como benchmark de escritura nueva.

## Estado final y riesgos residuales

Cambios implementados y verificados. La mejora de reutilización evita un GET remoto al volver a una página durante el TTL; los arreglos de paginación/vendedor/IDs están cubiertos por regresión. El plan de COUNT elimina trabajo innecesario, pero no certifica una ganancia de latencia HTTP. **No se declara cumplida la meta integral de 1 s.**

Permanecen la vigencia eventual de contadores hasta 30 s y de preview hasta 15 s, y la ausencia de actualización en tiempo real mientras la ventana está inactiva; foco, escritura y filtros conservan invalidación. OFFSET profundo y mayor volumen requieren otra muestra/plan representativo de LAN. La recuperación de página vacía puede añadir dos lecturas remotas, priorizando totales correctos. No se certifican navegador→visible, login Keycloak operativo, PATCH HTTP+PIN real, pérdida real de respuesta de commit ni carreras de confirmación/rechazo en InnoDB.

Fuera del cambio: esquema sin snapshots, coste remoto/driver, las tres incidencias previas de lint de métricas y las decisiones transaccionales del PATCH especializado. Quedan documentadas sin cambiar contratos, seguridad ni módulos ajenos.

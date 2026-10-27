# OPT-02 — Confirmación de pago y cobranzas

27 de octubre de 2026. Rama: `optimizacion`. Base: `b8e8a94685777e91a8b7b5598824105458bc7099`. Árbol limpio al comenzar. Cambios locales; sin commit, push ni despliegue.

## A. Resumen ejecutivo

Se optimizaron el workspace paginado activo, contadores, búsqueda, paginación, previews y actualización posterior a confirmar, rechazar o revisar. Se conservaron Fase 1, OPT-01 y OPT-03. No se confundió `getPagedPaymentWorkspace` con el método histórico que recupera todos los pedidos.

El workspace caliente pasa de seis SELECT físicos a dos concurrentes y de 1321,338 a 664,111 ms de mediana del servicio. HTTP con identidad real de DB pasa de 1941,776 a 1325,090 ms: mejora de 31,8 %, pero supera un segundo. Las páginas adicionales y cambios de estado con resumen vigente hacen un solo SELECT de datos. El preview ya tenía un JOIN adecuado: no se reescribió ni se le atribuye una mejora de API.

Tras una decisión confirmada se aplica su DTO y se consulta únicamente el resumen. No se deducen totales desde la página ni desde un estado anterior sin versionado. Continúa un GET focalizado; se elimina su listado completo. Se añadieron 47 pruebas: 23 backend y 24 frontend. Permanecen tres fallos backend de entorno reproducidos en la referencia. No se certifican p95, E2E ni escrituras reales: ninguna medición modificó pagos empresariales.

## B. Listado y contadores

| Operación | Problema | Cambio | Resultado |
|---|---|---|---|
| Página | Tres SELECT por hidratación de cliente/estado | JOIN con proyección explícita | Un SELECT y los mismos campos públicos |
| Contadores | Tres COUNT sobre el mismo universo | Agregación condicional SQL | Un SELECT; ceros y collation conservados |
| Página y resumen | Paralelismo ya correcto | Se mantiene Promise.all | Dos consultas concurrentes |
| Cambiar estado | Recalcula contadores independientes del estado | Página parcial si el resumen está vigente | Un SELECT de página |
| Catálogo | TTL existente sin deduplicar primer acceso concurrente | Promesa en curso por repositorio | TTL de cinco minutos y orden por ID conservados |
| Después de decidir | GET completo y sustitución de tabla | Parche confirmado + resumen focalizado | Conserva filas, cursor y orden |

Los contadores representan todos los pedidos que cumplen búsqueda/fechas; no dependen de estado seleccionado, cursor o tamaño de página. Esa semántica se conserva. El resumen se reutiliza durante un máximo de 30 s antes de otra interacción; búsqueda/fechas, foco, escritura y reintento lo invalidan. No autoriza operaciones ni promete actualización en tiempo real mientras la pantalla está inactiva.

El catálogo ya tenía caché: no se añade otra global. Las páginas parciales omiten consultarlo y conservan el conocido. Una lectura completa/del resumen vuelve al repositorio existente, respetando su TTL, nombres, IDs y DTO. Los errores permiten reintento.

## C. Filtros y paginación

| PERF | Antes | Después | Semántica |
|---|---|---|---|
| 059, entrada | Un GET completo | Un GET completo con menos SQL | Contrato predeterminado conservado |
| 060, estado | Un GET completo | Página; completo si resumen falta/venció | Contadores independientes del estado |
| 061, búsqueda | Potencial GET por cambio | Un GET por término estable 250 ms | NV, cliente, razón social y RUT parciales |
| 062, fechas | GET completo por cambio efectivo | GET completo por cambio efectivo | Página y resumen actualizados juntos |
| 063, cargar más | GET completo con cursor | GET de página con cursor | No recalcula resumen/catálogo |

Tres cambios rápidos `a`, `ab`, `abc` generan una búsqueda, frente a tres potenciales; borrar también genera la consulta vacía correcta. No se aplica debounce a escrituras. Mientras se estabiliza el término se muestra carga para no presentar filas antiguas como resultados nuevos.

Se conservan trim/límite de 100 caracteres, búsqueda parcial/comodines, estados válidos, cursor descendente, `limit + 1` y límite máximo existente. No hay OFFSET. Un Set deduplica entre y dentro de páginas sin alterar orden; un ref bloquea cargas simultáneas. AbortController y generaciones descartan lista/página/resumen obsoletos, aunque abortar no garantiza detener SQL ya enviado. Una escritura incierta tras cambiar filtros reconcilia los actuales, no los capturados por el handler anterior.

Se mantiene `fecha_creacion`: inicio UTC inclusivo y día siguiente UTC exclusivo para el final. No se introdujo conversión a fecha local ni cambio de DST. Se prueban día 2026-09-06, fechas inválidas, rango invertido y combinación con filtros.

## D. Previsualización

PERF-064/065/066 conservan endpoint, DTO y prefetch. El repositorio ya hace un SELECT con pedido, cliente, vendedor, detalles/producto. Los snapshots completos evitan la fuente; los incompletos conservan la consulta condicional y fallback 404. No se redujeron campos visibles ni se alteraron cantidades o cálculos monetarios. El DTO actual no contiene importes ni estado de pago: este último procede del listado y no se inventaron campos financieros.

El Map privado de promesas se reemplazó por un único helper con política explícita:

- Caché en memoria por workspace, TTL 15 s desde respuesta y máximo de 30 entradas. Sin PIN ni almacenamiento persistente.
- Prefetch y apertura comparten promesa; máximo dos lecturas especulativas simultáneas. La apertura explícita no queda bloqueada por ese límite.
- Error elimina la entrada; 401/403 vacían la caché. Invalidar elimina antes de abortar; una respuesta tardía no puebla otra generación.
- Workspace/filtros, foco, decisión confirmada, error de mutación, sesión/permisos y desmontaje invalidan lo pertinente. La API tiene un scope numérico sin datos personales y la página se remonta al cambiar API o capacidades relevantes.

El preview es presentación. La autorización y el estado vigente se comprueban de nuevo bajo lock. Un cambio externo con el modal abierto no se recibe en tiempo real: al volver al foco se reconcilia y al enviar se revalida. No se promete una instantánea financiera fuerte basada en la caché.

La lectura real mantiene un SELECT y 264 bytes en el pedido medido: 663,154 → 662,024 ms; HTTP 1243,235 → 1242,775 ms, sin mejora atribuida. Tres previews reales resultan equivalentes. Se prueban snapshots/fuente, vendedor, cantidades cero y opcionales.

La comparación de caché con API sintética de 5 ms conserva el beneficio previo: frío 15,5773/15,2679 ms; prefetch completado 0,0529/0,0294 ms; reapertura 0,0275/0,0239 ms. El temporizador de Windows puede superar 5 ms. Son tiempos del helper, no API/render/E2E: una lectura simulada en frío y ninguna al reutilizar. La mejora nueva es la invalidación y vigencia, no esos microsegundos. [Evidencia](OPT-02_PREVIEW_SINTETICO.json).

## E. Confirmación

PERF-067 conserva JWT, identidad activa, UPDATE_PAYMENT_STATUS y PIN de cada petición. El actor proviene del middleware y se retira el PIN del body. No cambian hashing, aceptación, intentos, bloqueo o expiración.

Se conserva la consulta inicial concurrente de estado destino/pedido observado, transacción interactiva (timeout 20 s, maxWait 10 s), `FOR UPDATE` como primera lectura dentro de ella y relectura del pedido bloqueado. Mismo destino es idempotente; otro destino concurrente causa conflicto. Ninguna de estas lecturas se eliminó.

El update solicita solo `id_pedido`, porque su objeto completo se descartaba. La creación del registro solicita internamente `response: 'receipt'`, evitando hidratar otra vez Registros. Las escrituras de auditoría y decisión con actor/fecha/estados/observación permanecen durables. El retorno completo por defecto del servicio de registros se conserva.

Confirmar sigue pasando a listo para producción y creando aviso y asignaciones a administradores dentro de la transacción. El DTO se ensambla con datos leídos/escritos y el controlador responde después del commit. La interfaz bloquea doble envío, comprueba ID/estado destino y aplica únicamente la respuesta confirmada. Invalida preview y obtiene contadores reales, sin deducirlos de datos incompletos. No reintenta PATCH automáticamente.

Se prueban confirmación válida/idempotente, dos administradores, confirmación/rechazo en ambos órdenes, auditoría/avisos, rollback ante fallos de update/auditoría/decisión/mensaje/asignación, espera del controlador y PIN inválido/bloqueado/no aceptado/faltante. Son pruebas sintéticas; no intentos con PIN reales.

## F. Rechazo

PERF-068 conserva su rama: rechazar pendiente mantiene el flujo de confirmación de pago y no genera el aviso de confirmación. Se comparte únicamente la proyección/recibo sin alterar la decisión de negocio.

Se prueban rechazo válido, repetido sin otra decisión, dos rechazos concurrentes, conflicto con confirmación y rollback. La interfaz retira de Pendientes solo la fila rechazada confirmada, conserva cursor/páginas y lee totales del backend. Un error PIN conserva diálogo y no modifica fila/contador. Un resultado incierto se consulta sin suponer rollback ni reintentar.

## G. Revisión

PERF-069 conserva REVISE_PAYMENT_STATUS y motivo no vacío. Un pago resuelto no vuelve a Pendiente. El frontend también comprueba la capability, sin sustituir al servidor. El diálogo PIN real conserva motivo obligatorio hasta 2000 caracteres, foco y borrado del PIN tras enviar.

Confirmado → Rechazado desde listo para producción cancela y avisa; desde producción conserva etapa y solicita a Producción cancelar; en las demás etapas conserva la lógica anterior. Rechazado → Confirmado vuelve a listo y mantiene aviso. Auditoría, cambios y mensajes permanecen en la transacción; no hay promesas sin esperar ni cola nueva.

Se prueban etapas 1/2/3, motivo/capability ausentes, retorno a pendiente prohibido, repetición y conflicto. Los dobles serializados no certifican contención InnoDB. La respuesta pública y reconciliación son compatibles con confirmar/rechazar, conservando efectos de producción.

## H. Rendimiento

Diez muestras calientes secuenciales por serie, calentamiento y pausa de 250 ms fuera del reloj. Node 22.23.4 en contenedor diagnóstico sin puertos; MySQL 8.4.8 remoto, TLS estricto y pool 10 sin cambios. Fixture: 50 pedidos en los tres estados; 14 variantes del workspace y tres previews equivalentes. No se calcula p95 con diez muestras ni se certifica volumen productivo.

| Operación | Antes (ms) | Después (ms) | Mejora | Muestras | ¿Cumple 1 s? |
|---|---:|---:|---:|---:|---|
| PERF-059, servicio | 1321,338 | 664,111 | 49,7 % | 10 + 10 | Solo mediana de etapa; p95/E2E sin certificar |
| PERF-060, servicio | 1320,351 | 662,044 | 49,9 % | 10 + 10 | Solo mediana de etapa |
| PERF-061, servicio | 1321,388 | 662,463 | 49,9 % | 10 + 10 | Excluye debounce/token/render |
| PERF-062, servicio | 1321,550 | 663,130 | 49,8 % | 10 + 10 | Solo mediana de etapa |
| PERF-063, servicio | 1320,143 | 661,740 | 49,9 % | 10 + 10 | Solo mediana de etapa |
| PERF-064/065/066, preview servicio frío de caché UI | 663,154 | 662,024 | Sin mejora atribuida | 10 + 10 | Solo mediana de lectura |
| Resumen parcial, servicio | — | 661,376 | Operación optativa | 10 | Solo mediana de lectura |
| Workspace HTTP | 1941,776 | 1325,090 | 31,8 % | 10 + 10 | No |
| Preview HTTP | 1243,235 | 1242,775 | Sin mejora atribuida | 10 + 10 | No |
| Página parcial HTTP | — | 1243,506 | Menos SQL/payload | 10 | No |
| Resumen parcial HTTP | — | 1242,385 | Omite listado | 10 | No |
| PERF-067, doble transaccional | 171,673 | 155,291 | 9,5 % sintético | 10 + 10 | Flujo real no medido |
| PERF-068, doble transaccional | 124,236 | 108,768 | 12,4 % sintético | 10 + 10 | Flujo real no medido |
| PERF-069, listo, doble | 171,857 | 155,471 | 9,5 % sintético | 10 + 10 | Flujo real no medido |
| PERF-069, producción, doble | 155,761 | 139,757 | 10,3 % sintético | 10 + 10 | Flujo real no medido |

HTTP usa routers/controladores/DTO reales, autoridad JWT/JWKS RS256 local sintética, identidad con binding real DB, capabilities y cuota de memoria 120/minuto. Excluye login/sesión real Keycloak, navegador/render, auditoría global de soporte y escrituras de cuota SQL. No representa E2E productivo.

Las mutaciones usan servicios/repositorios reales sobre fixtures nuevos restaurables y 5 ms por operación lógica, sin SQL, PIN, HTTP o efectos reales. Una llamada de doble no es un SELECT. No se usó el retorno idempotente de una decisión resuelta como benchmark de confirmación nueva.

Token, PIN criptográfico, adquisición/lock/commit reales y render no se cronometraron por separado. No se suman series distintas o etapas paralelas para inventar latencia final. [SQL](OPT-02_RENDIMIENTO_SQL.json), [HTTP](OPT-02_RENDIMIENTO_HTTP.json) y [flujos sintéticos](OPT-02_WORKFLOWS_SINTETICOS.json) incluyen mínimo, media, mediana, máximo, muestras y bytes. Ambas capturas reales: cero errores.

## I. Consultas SQL

| Función | SELECT anteriores | SELECT posteriores | Cambio | Resultado |
|---|---:|---:|---|---|
| Página workspace | 3 | 1 | JOIN de cliente/estado | Mismos campos públicos |
| Tres contadores | 3 | 1 | Agregación condicional | Mismo universo búsqueda/fechas |
| Workspace caliente | 6 | 2 | Lecturas concurrentes | 11350 bytes antes/después |
| Estado con resumen vigente | 6 | 1 | Solo página | Muestra: 2446 → 2324 bytes |
| Cargar más | 6 | 1 | Solo página | Muestra límite 1: 501 → 379 bytes |
| Resumen focalizado | Workspace 6 | 1 | Omite listado | HTTP: 227 bytes en la muestra |
| Preview caliente | 1 | 1 | JOIN existente conservado | 264 bytes antes/después |
| HTTP workspace | 7 | 3 | Incluye identidad | Dos oleadas por seguridad |
| HTTP página/resumen | Workspace anterior 7 | 2 | Identidad + lectura | Middleware preservado |
| HTTP preview | 2 | 2 | Identidad + preview | Sin mejora atribuida |
| Auditoría de decisión | No instrumentado en DB | No instrumentado en DB | Recibo evita relación descartada | Una hidratación lógica menos en el doble |

Los conteos reales proceden del listener Prisma con el mismo cliente inyectado al catálogo. Son series calientes: el TTL existente evita su SELECT en las muestras. El catálogo frío agrega trabajo, pero no se midió como serie independiente. Los seis SELECT anteriores son tres de página y tres COUNT, no una extrapolación del contador incompleto de la auditoría.

La agregación compara nombres dentro de MySQL para conservar collation, usa COALESCE sobre conjunto vacío y convierte enteros a Number como los COUNT originales. Prisma.sql parametriza búsqueda, fechas, cursor y límite. No hay entradas concatenadas ni JOIN de colecciones que multiplique filas.

Se obtuvieron 11 EXPLAIN de consultas completas y metadatos de índices. El cursor usa rango/backward scan sobre PRIMARY; otros planes usan `id_estado_pago_idx`, PK de Cliente/Estado e `id_pedido_idx` para detalles. El optimizador estima unos 49 pedidos y tres estados y elige ALL/hash join/temporary/filesort en algunos casos. Eso no justifica índices sobre una muestra pequeña. No se ejecutó DDL ni se cambió `%texto%` por búsqueda exacta.

## J. Actualizaciones después de escrituras

Antes: PATCH confirmado → GET completo → sustituir tabla, contadores y catálogo. Ahora, con filtros vigentes: PATCH confirmado → aplicar DTO/retirar fila fuera de estado → GET de resumen → actualizar totales/catálogo → terminar visualmente.

Por cada éxito normal se sustituye un GET **completo** por uno focalizado. El total sigue siendo PATCH + GET; no se afirma que baje a una sola solicitud. La espera de reconciliación permanece indicada y no se cierra anticipadamente. Los contadores siempre proceden de una lectura real.

Se conservan filas ajenas, orden, cursor y páginas cargadas; no se rellena automáticamente una fila retirada. Si cambiaron filtros se recarga el workspace actual. Si falla resumen después del commit, se informa que el pago se actualizó pero falta reconciliar, sin tratarlo como escritura fallida ni reenviarlo. Reintentar solo vuelve a leer.

409 recupera datos actuales y exige otra decisión. Timeout/error incierto conserva contexto y consulta resultado, sin inferir éxito o rollback ni reintentar PATCH. Una respuesta de otra sesión no genera éxito/refresco/modal en la cuenta actual. Se invalidan los previews afectados y se bloquean dobles envíos.

## K. Seguridad

Sin cambios en auth/PIN/recuperación, middlewares, permisos compartidos, esquema, pool, TLS, certificados, secretos, infraestructura o Keycloak. Sin dependencias nuevas ni funciones Preview. Se conserva Fase 1/OPT-03 y la funcionalidad integrada de OPT-01.

Las variantes parciales pasan por la misma ruta READ_PAYMENTS. La mutación mantiene UPDATE_PAYMENT_STATUS, PIN fresco, identidad activa y capability especial de revisión. La opción de recibo se fija internamente, no desde el body del cliente. No se hizo ninguna confirmación/rechazo real ni intentos de PIN de usuarios.

Se ejercitan capabilities, PIN inválido/bloqueado/no aceptado/faltante, motivo, conflicto, idempotencia, rollback y avisos. Las suites existentes vuelven a comprobar identidad/PIN/autorización. No existe una sesión real de prueba revocada/deshabilitada de Keycloak para certificar esos casos E2E: se verifican errores/cambios de sesión/capacidades mediante dobles y se conservan los controles existentes.

## L. Contratos y regresiones

Se mantienen GET `/api/orders/payments`, GET `/api/orders/:orderId/payment-records/preview` y PATCH `/api/orders/:orderId/payment-status`, permisos, DTO y errores por defecto. El controlador de workspace/mutación no cambia. Consumidores: cliente de Pagos, tablas/modales y métodos internos/históricos de pedidos y registros. No se eliminan `getPaymentWorkspace` ni `getPaymentOrders`.

Extensión optativa del GET: `includeSummary=false` devuelve página/pageInfo, counts=null y paymentStatuses=[]; `summaryOnly=true` devuelve items=[] y pageInfo vacío, con resumen/catálogo. Sin parámetros sigue completo. El parser existente admite presencia de counts=null; la página conserva datos previos solo cuando pidió explícitamente página. Consumidores antiguos no reciben respuestas parciales sin solicitarlas.

Se compararon 14 variantes reales y sus respuestas parciales: estados, búsqueda, comodines, barra inversa, entrada con aspecto de inyección, fechas, combinación, límite y cursor. Más tres previews: 17 casos etiquetados con varias aserciones cada uno. Se comparan JSON públicos, fechas, nulls y productos sin guardar datos personales en la evidencia.

La respuesta del update sigue ensamblándose con el pedido bloqueado. El servicio de registros conserva hidratación por defecto. Suites existentes cubren Kanban, creación/finalización, historial, mensajes/notificaciones, reportes existentes, autenticación y permisos; no se optimizan esos módulos ni se cambian contratos de otras vistas.

## M. Archivos modificados

Editados:

- `capaServidor/src/modules/orders/repo/orderViewOperations.js`: delega lectura de pagos; otras vistas conservadas.
- `capaServidor/src/modules/orders/repo/orderPaymentOperations.js`: proyección del update descartado.
- `capaServidor/src/modules/orders/service/order.service.js`: opciones parciales, validaciones existentes.
- `capaServidor/src/modules/orders/service/orderPayment.service.js`: recibo interno de auditoría.
- `capaServidor/src/modules/payments/repo/paymentRecord.repo.js`: recibo optativo con retorno completo predeterminado.
- `capaServidor/src/modules/payments/repo/paymentStatus.repo.js`: promesa compartida dentro del TTL existente.
- `capaServidor/src/modules/payments/service/paymentRecord.service.js`: paso de opción interna.
- `capaVista/src/modules/payments/api/paymentsApi.js`: señales de GET y scope API; PATCH sin señal/reintento.
- `capaVista/src/modules/payments/pages/PaymentConfirmationPage.jsx`: debounce, cancelación, ciclos de página/resumen, invalidación, guardas de sesión y resultado confirmado.

Nuevos:

- `capaServidor/src/modules/orders/repo/paymentWorkspaceRead.repo.js`: lecturas parametrizadas.
- `capaServidor/scripts/fixtures/paymentWorkflowFixture.mjs`: doble transaccional serial/restaurable sin DB.
- `capaServidor/test/paymentPerformance.test.js`: 23 pruebas backend.
- `capaServidor/scripts/benchmarkPaymentsOpt02.mjs`: SELECT, equivalencia y EXPLAIN acotados.
- `capaServidor/scripts/paymentHttpProbeOpt02.mjs`: HTTP de lectura con autoridad local/binding real.
- `capaServidor/scripts/benchmarkPaymentWorkflowsOpt02.mjs`: servicios/repositorios con fixtures sintéticos.
- `capaServidor/scripts/benchmarkPaymentPreviewOpt02.mjs`: comparación de caché con API sintética.
- `capaVista/src/modules/payments/api/paymentPreviewCache.js`: única caché acotada del workspace.
- `capaVista/src/modules/payments/api/paymentPreviewCache.test.js`: cinco pruebas API/caché.
- `capaVista/src/modules/payments/pages/PaymentPerformance.test.jsx`: 17 pruebas de orquestación.
- `capaVista/src/modules/payments/components/PaymentModals.test.jsx`: dos pruebas de modales reales.
- `docs/OPT-02_CONFIRMACION_PAGOS_RENDIMIENTO.md`: informe.
- `docs/OPT-02_RENDIMIENTO_SQL.json`: tiempos, equivalencias, planes e índices.
- `docs/OPT-02_RENDIMIENTO_HTTP.json`: HTTP con identidad DB.
- `docs/OPT-02_WORKFLOWS_SINTETICOS.json`: decisiones nuevas en dobles.
- `docs/OPT-02_PREVIEW_SINTETICO.json`: frío/prefetch/reapertura.
- `docs/OPT-02_RESPONSIVE.json`: 17 escenarios de página.
- `docs/OPT-02_MODALES_RESPONSIVE.json`: 85 escenarios de modales.

Ningún archivo versionado eliminado. Se retiraron checkout temporal, junctions, tar/zip y arnés temporal de modales. Al intentar retirar `itecsa-opt02-diagnostic`, Docker dejó de estar disponible (pipe del daemon ausente). Su eliminación queda pendiente para cuando Docker esté activo: `docker rm -f itecsa-opt02-diagnostic`. No se reinició Docker ni se iniciaron/modificaron los dos contenedores originales, que estaban detenidos al comenzar.

## N. Pruebas

| Comprobación | Referencia b8e8a94 | OPT-02 |
|---|---|---|
| Backend completo | 193: 190 aprobadas, 3 fallidas | 216: 213 aprobadas, mismos 3 fallos |
| Frontend completo | 206/206 | 230/230 |
| Nuevas del alcance | — | 47/47: 23 backend + 24 frontend |
| Equivalencia real | — | 17 casos completos/parciales |
| Lint y build frontend | — | Aprobados |
| Prisma validate y sintaxis JS/MJS | — | Aprobados |
| Responsive Edge | — | 17 página + 85 modales; cero overflow |
| Diff protegido / diff --check | — | Sin cambios ajenos / aprobado |

Comandos principales desde cada carpeta:

```text
# capaServidor
node --test
node --test test/paymentPerformance.test.js
npm.cmd run prisma:validate
node scripts/benchmarkPaymentsOpt02.mjs --allow-development-reads --reference-root=<checkout-b8e8a94> --output=<captura.json>
node scripts/benchmarkPaymentsOpt02.mjs --allow-development-reads --reference-root=<checkout-b8e8a94> --http-only --output=<captura-http.json>
node scripts/benchmarkPaymentWorkflowsOpt02.mjs --reference-root=<checkout-b8e8a94> --output=<captura-sintetica.json>
node scripts/benchmarkPaymentPreviewOpt02.mjs --output=<captura-cache.json>

# capaVista
npm.cmd test
npm.cmd test -- src/modules/payments
npm.cmd run lint
npm.cmd run build

# raíz
node scripts/verify-page-layout.mjs payments
git diff --check
```

Las lecturas requieren APP_ENV=development, opt-in y checkout compatible, con el mismo TLS/pool para ambas versiones. Los benchmarks sintéticos no leen `.env` ni abren DB. Se registran muestras/tipos de SQL sin parámetros personales, PIN o tokens.

Los tres fallos se reprodujeron en la referencia antes de modificar: `mysqlDeployment.test.js` depende de LF en compose; `mysqlLabAccounts.test.js` exige permisos POSIX 0600 en Windows; `mysqlLabMigrationHistory.test.js` compara hash sensible a CRLF. No se alteraron esos tests, compose o migraciones. Los fallos PageMigration históricos de OPT-01 ya estaban corregidos en esta base; no se trasladan como fallos vigentes. No se observaron nuevas regresiones.

Las pruebas de orquestación mockean hijos; PaymentModals monta componentes reales y comprueba foco PIN, motivo requerido, borrado del PIN, alertas, aria-modal y bloqueo durante carga/error. Edge revisó 320–1920 px, sidebar/títulos/zoom. Un arnés temporal derivado del verificador montó detalle, confirmar, rechazar, revisar y PIN con seis productos sintéticos: límites horizontales y nombre de diálogo conservados. No es certificación manual con lector de pantalla. Se corrigió una aserción de margen de banner que no aplicaba al arnés de componentes, sin cambiar diseño. Un build coincidió con el directorio de revisión abierto por Edge y falló EPERM; tras retirar el artefacto temporal se repitió correctamente.

No hay MySQL aislado disponible entre los recursos locales (solo imágenes API/web), ni sesión Keycloak de prueba para medir escritura/PIN/revocación reales. No se descargó infraestructura ni se escribieron pagos empresariales. Concurrencia, rollback y resultado incierto usan dobles restaurables; no certifican contención InnoDB, pérdida de respuesta en red real o recuperación tras caída de servidor.

## O. Alternativas descartadas

Se descartó modificar contadores por aritmética: el DTO no incluye estado previo/versionado y hay otros administradores. Se usa lectura focalizada. No se mantienen previews indefinidos, cachés de permisos/pedidos compartidos ni autorización basada en datos cacheados.

No se eliminaron lock, relectura, auditoría, mensajes o transacciones; no se cambió aislamiento/timeout, no hay cola ni reintento PATCH. No se activó relationJoins Preview ni cambió Prisma, protocolo, pool, TLS, esquema o infraestructura. No se introdujeron virtualización, React.memo o librería de caché sin evidencia; se preservaron CSS/diseño e información visible. No se añadieron índices para `%texto%` sin una muestra representativa.

Referencias contrastadas: [Prisma 7: relaciones](https://www.prisma.io/docs/orm/v7/prisma-client/queries/relation-queries), [transacciones](https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions), [MySQL 8.4: EXPLAIN](https://dev.mysql.com/doc/refman/8.4/en/explain.html), [React: limpieza de efectos](https://react.dev/reference/react/useEffect).

## P. Conclusión

Cargar mejora 49,7 % en servicio y 31,8 % en HTTP del arnés. Buscar, cambiar fechas y paginar mejoran aproximadamente 49,8–49,9 % en servicio; escribir tres caracteres rápidos genera una búsqueda estabilizada. Abrir detalle conserva coste API/SQL; las reutilizaciones siguen evitando una lectura y ahora tienen invalidación/vigencia explícitas.

Confirmar, rechazar y revisar eliminan una hidratación descartada y el listado completo posterior. Los dobles mejoran 9,5–12,4 %, sin certificar tiempos reales. Por éxito normal se sustituye un GET completo por uno parcial; el workspace reduce seis SELECT a dos y las páginas parciales a uno. Preview sigue en uno.

Las medianas internas están bajo un segundo, pero no certifican p95. Los HTTP medidos siguen en 1,24–1,33 s por identidad previa y otra oleada hacia MySQL remoto. Red/infraestructura, login/PIN/commit reales, volumen y contención necesitan un entorno aislado adecuado. No se modificaron para forzar la meta.

Preparado para revisión e integración controlada en desarrollo, con tres fallos de entorno documentados y sin nuevas regresiones observadas. No es cumplimiento integral del SLO ni certificación MySQL/E2E. Los cambios permanecen locales, sin commit, push o despliegue.

# OPT-05 — Rendimiento del Historial de pedidos y trazabilidad

Fecha: 28-10-2026. Rama: `optimizacion`. Referencia: `d9e67ac873c00f00e36709907f431fdabe7e1e7b`; los archivos de Historial no tenían modificaciones. Se conservaron íntegramente los cambios pendientes de OPT-07, comprobados por SHA-256 antes y después. Sin commit, push, despliegue, DDL ni escrituras de datos empresariales.

## A. Resumen ejecutivo

El listado pasa de tres SELECT a uno, sustituyendo la hidratación de cliente/estado por un JOIN parametrizado con el mismo filtro y keyset. La mediana de servicio inicial pasa de **1.321,046 a 659,625 ms**; búsqueda, estados, fechas y navegación presentan reducciones cercanas al 50 %. El DTO completo coincide con la referencia, incluidos cursores, tipos, nulos y orden.

La cabecera pasa de cuatro lecturas paralelas a dos: una cabecera y un UNION ALL disjunto de productos, accesorios y etiquetas. Apertura completa: cinco → tres SELECT, con cabecera y eventos todavía paralelos. La latencia de servicio de apertura permanece aproximadamente igual, **665,554 → 666,182 ms**. El beneficio demostrado es reducir consultas y solicitudes simultáneas al pool, sin fan-out; no se afirma mejora de latencia ni de throughput bajo carga.

Frontend: cancelación y deduplicación de lecturas pendientes, aislamiento por API/sesión/pedido, reintentos de la misma página fallida, validación local de fechas, formateadores Intl reutilizados y tarjetas de eventos que no se vuelven a renderizar al añadir otra página. Se corrigieron desbordes de referencias extensas sin recortar contenido.

HTTP protegido sigue cerca de **1,3 segundos**. No cumple el objetivo aspiracional de p95 ≤ 1.000 ms ni certifica E2E real. Se cubrieron PERF-070 a PERF-078 y se conservaron autenticación, redacción financiera, cronología e historia persistida.

Documentación consultada: [auditoría](AUDITORIA_RENDIMIENTO_ITECSA.md), [Fase 1](IMPLEMENTACION_RENDIMIENTO_FASE1_ITECSA.md) y estado de las optimizaciones modulares integradas. No se repitió una auditoría general. La consulta compartida de identidad de Fase 1 sigue ejecutándose una vez en cada solicitud protegida.

## B. Listado

| Operación | Problema | Cambio | Resultado |
|---|---|---|---|
| PERF-070, carga inicial | Tres SELECT de pedidos/cliente/estado | Un JOIN con proyección explícita | 659,625 ms de servicio; mismo JSON |
| PERF-071, búsqueda | Hidratación repetida tras contains | Mismo LIKE parcial en una lectura | 659,289 ms; búsqueda solo al enviar |
| PERF-072, estado | Relación y lecturas de catálogos | JOIN y predicado de nombre parametrizado | 660,269 ms; estados conservados |
| PERF-073, fechas | Viajes adicionales y validación solo remota | Misma fecha de creación; rango inválido también local | 659,330 ms; extremos sin cambios |
| PERF-074, siguiente | Tres SELECT por página | Un SELECT y protección de doble clic | 657,833 ms; cursor keyset intacto |
| PERF-075, anterior | Nueva lectura de tres SELECT | Lectura fresca de un SELECT con stack anterior | 662,266 ms; sin caché obsoleta |
| PERF-076, ficha | Cuatro lecturas de cabecera más eventos | Dos de cabecera más eventos | Cinco → tres SELECT; mismo DTO |
| PERF-077, tipo | Una consulta de eventos ya eficiente | Se conserva SQL; cancelación y aislamiento visual | No vuelve a consultar cabecera |
| PERF-078, cargar más | Re-render de eventos anteriores; cursor fallido sin reintento efectivo | Tarjetas memoizadas, intento renovado, dedupe por ID | Reintenta la misma página; una lectura pendiente |

El listado sigue recuperando como máximo `limit + 1` filas y mostrando `limit`. Límite predeterminado 50, máximo 100. No carga productos ni eventos. La implementación previa ya usaba proyección resumida y keyset; no se la describe como descarga completa ni como N+1. Se comprobaron límites de 1, 10 y 50: el nuevo repositorio usa un SELECT independiente del número de pedidos.

## C. Búsqueda y filtros

`orderListQuery` aplica LEFT JOIN a Cliente y Estado_Pedido. Conserva el OR sobre `numero_nota_venta`, `nombre_cliente` y `razon_social`, la collation de MySQL y la coincidencia parcial. No usa LOWER, búsqueda exacta, normalización adicional ni nuevas categorías de estado. Incluye cancelados/finalizados cuando corresponde. Cliente o estado ausente siguen produciendo los mismos nulos.

Todos los valores están enlazados mediante `Prisma.sql`/`Prisma.join`; la entrada nunca se incorpora al texto SQL. Una prueba real con el texto sintético `SYN%_\literal` confirmó que Prisma emite `LIKE CONCAT('%', ?, '%')`. El patrón efectivo coincide con el nuevo `%valor%`, incluidos comodines y barra inversa. No se cambió silenciosamente el comportamiento existente de `%` y `_`. Se comprobaron Unicode, espacios normalizados por el servicio, búsqueda inexistente y entradas sintéticas de inyección sin escrituras.

Fechas: se conserva `fecha_creacion >= start AND < selectedEnd + 1 día`, con límites UTC y la columna SQL DATE. Desde/Hasta son opcionales, sin nuevo límite de amplitud. La detección de fecha escrita en la búsqueda y su combinación con la búsqueda textual permanecen intactas; no se sustituyó creación por entrega o evento. Se comprobaron fecha inválida, rango invertido, bisiesto y límites de mes. La validación del backend permanece autoritativa.

Frontend no consulta por cada tecla. Cambiar búsqueda enviada, estado o fecha reinicia el stack de cursores, elimina resultados anteriores y cancela la suscripción abandonada. Restablecer fechas ya vacías no genera otro GET.

## D. Paginación

Pedidos: `id_pedido < cursor.id`, orden descendente, `limit + 1`, cursor firmado HMAC existente. Se conserva el stack de cursores de la interfaz; Anterior vuelve a consultar datos actuales. No se implementó caché completada ni OFFSET profundo. Pulsaciones dobles no añaden dos páginas al stack.

Eventos: se mantiene el cursor firmado de tipo `history-event`, con `(FECHA_HORA, ID_REGISTRO)` descendentes y el predicado lexicográfico original. Con siete eventos del mismo timestamp, MySQL devuelve exactamente `7, 6, 5, 4, 3, 2, 1` al recorrer páginas de dos. Un ensayo adicional recorre 10.000 eventos sintéticos, incluidos empates, sin perder ni duplicar IDs.

El cursor existente contiene instante/ID, no pedido ni filtro. Se conserva ese contrato: un cursor de otro pedido no evita el `WHERE r.id_pedido = ?`, comprobado con el fixture MySQL. No se añade una garantía de rechazo por pertenencia que antes no existía. Los filtros de la interfaz restablecen su cursor. Un ID firmado inexistente sigue siendo un límite keyset, sin una consulta extra de existencia.

Los eventos nuevos posteriores al cursor no se incorporan artificialmente a páginas antiguas; se consultan al abrir nuevamente la primera página. No se promete un snapshot global durante navegación concurrente.

Se comprobaron variantes CTE entre solicitudes: un pedido y un evento nuevos no se mezclan en la continuación anterior; la primera página fresca sí los incluye, y la cabecera nueva refleja el cambio de estado. Es una simulación de cambios concurrentes con lecturas reales de SQL sobre fixtures, no una prueba de transacciones de escritura en la base empresarial.

## E. Cabecera

Antes: cuatro consultas paralelas sobre cabecera, detalles, accesorios y etiquetas. Después: cabecera y una consulta disjunta de los tres conjuntos hijos, ambas paralelas. El servicio sigue ejecutando cabecera y eventos con `Promise.all`, sin transacción nueva.

UNION ALL separa las filas por `kind`, conserva todos los detalles/accesorios y ordena por sus IDs; las etiquetas conservan el orden SQL por nombre. No hay multiplicación de productos por etiquetas. Incluso etiquetas repetidas permanecen en el DTO. Se conserva el mapper existente: números, fechas, nulos, vendedor, cliente, estados, productos y accesorios, incluidas fechas de finalización. La consulta no elimina eventos ni modifica registros.

Escenario real: un pedido con dos detalles, cero accesorios y una etiqueta. El DTO de repositorio permanece en 975 bytes. Las representaciones internas de las cuatro lecturas sumaban 769 bytes; las dos nuevas suman 1.087, por las columnas nulas del UNION: **318 bytes adicionales**. No se presenta como reducción de payload. La mediana de cabecera fue 661,032 → 660,022 ms, sin mejora relevante de latencia. Se conservó por eliminar dos consultas, con costo de transferencia acotado y sin regresión relevante observada.

La apertura completa conserva un DTO de 11.864 bytes y `pageInfo` para los eventos restantes. Servicio 665,554 → 666,182 ms; HTTP 1.322,731 → 1.332,929 ms. No se suman tiempos de ramas paralelas ni se atribuye esa variación pequeña a una mejora.

Cabecera, hijos y eventos pueden observar estados distintos ante escrituras concurrentes, como en la referencia. No se promete una instantánea transaccional de la ficha. Los hijos del UNION se leen en una sola sentencia; eso no convierte todas las lecturas en una transacción compartida.

## F. Línea de tiempo

El SQL de `listEvents` se conserva. Sigue siendo una sentencia parametrizada, con LEFT JOIN para actores y relaciones opcionales, whitelist `all/stage/payment/subprocess/calendar/general`, cursor compuesto y `limit + 1`. No se descartaron registros incompletos ni se sustituyeron LEFT JOIN por INNER JOIN.

La atribución del actor sigue resolviéndose en el JOIN, sin consulta por evento ni filtro por usuario activo histórico. Etapa, pago y subproceso mantienen la prioridad de clasificación original. Calendario/general conservan sus predicados SQL y el prefijo descriptivo, incluidas las diferencias preexistentes entre collation SQL y `startsWith` de JS.

Se conservan observaciones, títulos, fechas, responsables, avance Lanyard, cantidades, porcentajes, estados de pago permitidos y fórmulas de duración. Las etapas abiertas siguen calculando hasta el instante actual del servidor al consultar; no se creó un temporizador ni se reconstruye el pasado con el estado actual. Las comparaciones de DTO con etapas abiertas usan el mismo reloj congelado únicamente dentro del benchmark, no en producción ni en las mediciones de latencia.

El filtro y Cargar más llaman únicamente al endpoint de eventos. El encabezado permanece en pantalla. Cambiar pedido o API/sesión remonta el contenido privado y cancela los listeners anteriores. Un fallo al continuar permite tanto Reintentar como volver a pulsar Cargar más con el mismo cursor; se renueva el intento para que React ejecute la lectura. La unión de páginas evita repetir el mismo ID y conserva eventos distintos aunque compartan timestamp; no modifica ni deduplica historia en MySQL.

## G. Seguridad financiera

Se conserva `mayReadPayments`: capability READ_PAYMENTS según rol y permisos del token, después de la comprobación de identidad vigente. Un parámetro `includePaymentDetails=true` del navegador no otorga acceso.

Para eventos de pago sin esa capability, el SQL sigue proyectando NULL para el identificador/nombre del actor y observaciones del registro y del pago. El DTO omite `responsible` y `description`. Se comprobó con SELECT ejecutado por MySQL, no solo con un mock visual. Con permiso, los datos originales se conservan. Los estados de pago anterior/nuevo y el estado resumido de cabecera permanecen visibles según el contrato anterior de READ_ORDERS; no se añadieron importes u otros campos financieros.

La matriz HTTP cubre lector sin permiso financiero, rol financiero sin capability en el token y rol/capability financiera presentes. El SQL recibe respectivamente flags 0, 0 y 1. Se prueban permisos falsificados para un rol que no los admite, acceso directo a las tres rutas, usuario desvinculado, rol cambiado, token inválido/expirado y capability de historial ausente. Los rechazos no consultan historial.

No existe caché completada compartida. Las tres respuestas autorizadas agregan `Cache-Control: no-store`. Los logs de error conservan el mecanismo seguro existente; las pruebas comprueban ausencia de token y observación financiera sintética. No se registraron datos privados reales en los artefactos.

## H. Rendimiento

Cinco muestras calientes por versión. Versiones instaladas: Node 24.19.0, Prisma/adapter 7.10.0, mariadb 3.5.4, React 19.2.6 y Vite 8.3.5. TLS estricto y pool 10 sin cambios. Series antes/después en el mismo entorno, no exclusivo. Se registran mínimo, media, mediana, máximo, número de SELECT, bytes de representación, tiempos del driver, CPU de Node y delta de heap. No hay p95 fiable con cinco muestras. Los deltas incluyen GC y no son memoria máxima.

Fuentes: [línea base capturada antes de modificar](OPT-05_LINEA_BASE.json), [comparación servicio/SQL y equivalencia](OPT-05_RENDIMIENTO.json), [HTTP](OPT-05_RENDIMIENTO_HTTP.json), [ensayo sintético](OPT-05_SINTETICO.json), [responsive/render](OPT-05_RESPONSIVE_RENDER.json).

| Operación de servicio | Antes (ms) | Después (ms) | Mejora observada | Muestras/versión | ¿Cumple 1 s? |
|---|---:|---:|---:|---:|---|
| PERF-070, listado | 1.321,046 | 659,625 | 50,1 % | 5 | Mediana sí; p95 no certificado |
| PERF-071, búsqueda | 1.323,640 | 659,289 | 50,2 % | 5 | Mediana sí |
| PERF-072, estado | 1.321,681 | 660,269 | 50,0 % | 5 | Mediana sí |
| PERF-073, fechas | 1.322,113 | 659,330 | 50,1 % | 5 | Mediana sí |
| PERF-074, siguiente | 1.323,711 | 657,833 | 50,3 % | 5 | Mediana sí |
| PERF-075, anterior | 1.321,071 | 662,266 | 49,9 % | 5 | Mediana sí |
| PERF-076, ficha completa | 665,554 | 666,182 | Sin mejora relevante | 5 | Mediana sí |
| PERF-077, eventos de etapa | 660,120 | 664,580 | SQL/cálculo conservados | 5 | Mediana sí |
| PERF-078, otra página | 660,616 | 660,346 | SQL/cálculo conservados | 5 | Mediana sí |

| Operación HTTP protegida | Antes (ms) | Después (ms) | Interpretación | Muestras/versión | ¿Cumple 1 s? |
|---|---:|---:|---|---:|---|
| Listado | 2.152,099 | 1.330,830 | 38,2 % menos | 5 | No |
| Búsqueda | 1.975,680 | 1.322,159 | 33,1 % menos | 5 | No |
| Estado | 1.985,756 | 1.319,781 | 33,5 % menos | 5 | No |
| Fechas | 1.977,699 | 1.320,984 | 33,2 % menos | 5 | No |
| Siguiente | 1.976,579 | 1.322,584 | 33,1 % menos | 5 | No |
| Anterior | 1.977,237 | 1.320,275 | 33,2 % menos | 5 | No |
| Ficha | 1.322,731 | 1.332,929 | Sin mejora relevante | 5 | No |
| Filtro de eventos | 1.327,801 | 1.322,770 | Sin cambio SQL | 5 | No |
| Otra página de eventos | 1.320,475 | 1.324,498 | Sin cambio SQL | 5 | No |

HTTP usa router/controlador reales, JWT RS256 y JWKS locales, resolución de identidad activa desde la base, capability y cuota de memoria de 200/minuto. Excluye login/sesión de Keycloak real, navegador, auditoría global y escrituras SQL de cuota. No se reemplazó la seguridad de la aplicación. La mediana inicial HTTP tuvo más variación que otras series; no se atribuye toda esa variación a la consulta.

**SQL puro del motor, filas efectivamente examinadas, carga inicial E2E con sesión real y tiempo hasta datos reales visibles: No medido.** Los tiempos del driver incluyen adaptador/red. El RTT remoto sigue siendo un costo sustancial y no se modificó infraestructura.

Render local en Edge 155 con AppLayout y datos/API sintéticos, Vite de desarrollo, cinco observaciones calientes:

- React Profiler, listado inicial, suma de renders del montaje: mediana 38,6 → 32,4 ms.
- React Profiler, ficha inicial: mediana 40,5 → 32,4 ms.
- Cargar más, 50 → 100 eventos, clic hasta dos animation frames: 75,2 → 34,2 ms.
- React Profiler de esa interacción, suma `actualDuration`: 59,4 → 25,2 ms.

Profiler mide render React; la ventana hasta dos cuadros incluye trabajo de presentación y comunicación local del fixture. No equivalen a producción ni a E2E autenticado. Los mismos datos se usan en ambas versiones, incluido texto extenso; el CSS también fue corregido. No se atribuye todo el cambio a una función individual ni se construye un E2E sumando medianas.

## I. Consultas SQL

| Función/recorrido | SELECT antes | SELECT después | Cambio |
|---|---:|---:|---|
| list, con resultados relacionados | 3 | 1 | JOIN y mismo keyset/proyección |
| getById | 4 | 2 | Cabecera más hijos disjuntos |
| listEvents | 1 | 1 | SQL conservado |
| getOrderHistory completo | 5 | 3 | Cabecera ∥ eventos |
| HTTP listado con identidad | 4 | 2 | Sin duplicar identidad |
| HTTP ficha con identidad | 6 | 4 | Sin omitir autorización |
| HTTP eventos con identidad | 2 | 2 | Sin omitir autorización |

Listados vacíos pueden evitar hidrataciones de Prisma; no se anuncia que antes siempre ejecutasen tres SELECT. La cantidad nueva es una consulta por página, también con cero resultados.

El DTO inicial sigue en 6.821 bytes; búsqueda 319, estado 1.471, fechas 1.305; páginas siguiente/anterior 1.479/1.499. La representación interna del listado cambia de grafo Prisma a filas planas (13.047/12.497 bytes en el primer caso); son capas diferentes y **no una captura de bytes de red ni conteo físico de filas de cada SELECT de Prisma**. Las lecturas raw de cabecera sí se registran separadamente; su aumento de bytes se declara en E.

Se conservaron 19 EXPLAIN de consultas raw y 20 planes físicos adicionales, incluidos SELECT emitidos por Prisma y el nuevo listado. La consulta inicial nueva usa PRIMARY descendente y JOIN eq_ref a catálogos; fechas recorre PRIMARY con filtro; cursor usa range. El filtro de estado puede usar `id_estado_pedido_idx`, con temporal/filesort. Estimaciones del conjunto pequeño: Pedidos aproximadamente 49 filas; no son filas examinadas reales.

Se conserva `idx_records_order_cursor` y no se duplica. En el escenario real elegido el optimizador también usa `Registros_Pedidos_FK` con ordenamiento o PRIMARY al filtrar etapas; la mera existencia del índice compuesto no implica que se elija en todos los planes. No se aplicaron hints ni DDL para forzarlo. Sin MySQL aislado de volumen no hay evidencia que justifique un índice adicional de fechas o su costo de escritura.

## J. Escalabilidad

Fixtures locales: 0/50/500/5.000 pedidos, páginas de hasta 51 filas; cabeceras con 1/10/1.000/5.000 detalles, accesorios y etiquetas repetidas; historiales de 0/10/100/1.000/10.000 eventos con empates. Se comprueba igualdad completa o secuencia completa de IDs contra la referencia. Son datos preparados fuera del reloj, sin escrituras empresariales y sin ejecución del motor SQL.

El costo de las páginas permanece acotado al límite. Para 5.000 detalles y 500 accesorios, la reconstrucción local de ficha tiene mediana 0,493 → 0,835 ms: hay un costo extra pequeño de clasificar las filas del UNION. No se presenta como una mejora de CPU. El recorrido simulado de 10.000 eventos toma 515,154/456,154 ms; la consulta y el mapper de eventos no cambiaron y no se atribuye una mejora algorítmica a esa variación.

Reutilizar Intl evita crear un formateador por campo/evento. Para 1.000 valores: fechas 113,657 → 1,903 ms; fecha/hora 136,610 → 2,722 ms, con cadenas idénticas. Se conservaron UTC para DATE y zona local del navegador para fecha/hora; no se forzó America/Santiago donde antes se usaba la zona local. Se comprobó equivalencia en procesos con UTC y America/Santiago, bisiesto, medianoche y cambios de horario. Solo se comparten formateadores, no datos personales.

No se certificaron planes SQL con 50.000 pedidos, saturación del pool, memoria máxima ni p95 de carga sostenida. Docker no dispone de motor Linux en este entorno; no se pobló un clon MySQL. El fixture SQL de cuatro pedidos/siete eventos comprueba semántica del motor mediante CTE de solo lectura, no rendimiento físico a escala.

## K. Seguridad

JWT, issuer, audiencia, identidad activa, rol actual, capabilities, cuotas, cursores firmados y rutas se mantienen. Los nuevos filtros usan Prisma.sql; el SQL de eventos ya usa valores enlazados y fragmentos internos de whitelist. No se incorpora entrada arbitraria a esos fragmentos. No se modifican el cliente HTTP global, Keycloak, PIN, recuperación, TLS, certificados, pool ni otros módulos.

Las suscripciones se comparten solo mientras están pendientes y por objeto API/sesión, operación, pedido y parámetros. Al finalizar se eliminan; el último listener aborta tras una microtarea compatible con StrictMode. Cambiar cuenta/pedido desmonta el contenido anterior y los callbacks tardíos no pueden restaurarlo. La frontera existente AuthProvider/ProtectedRoute sigue retirando contenido durante revocación/revalidación de permisos. Abortar HTTP no garantiza cancelar SQL ya iniciado.

Una lectura autorizada tiene el alcance empresarial READ_ORDERS existente; no se inventó una nueva restricción por vendedor. Cada consulta de eventos filtra el pedido solicitado, incluso si el cursor procediera de otro. Tokens y payloads privados reales no se guardan en los informes.

## L. Equivalencia histórica

31 comparaciones reales: nueve operaciones, cabecera, seis tipos de evento con/sin permiso financiero y casos de búsqueda/fechas/límites. El fixture SQL añade 21 comparaciones de listado/cabecera/ficha, recorrido de timestamps repetidos y cursor usado en otro pedido sin filtración.

Se conservan IDs, orden, campos, tipos, nulos, actores, observaciones, etapas abiertas/cerradas, productos, accesorios, etiquetas repetidas, fechas y datos de pago permitidos. El servicio de historial no se modificó. Los servicios/repositorios de referencia son copias congeladas de d9e67ac con imports relativos adaptados, no código productivo alternativo.

Las pruebas representan creación, avance Lanyard, cambio de etapa, retroceso/corrección, calendarización y cancelación usando los tipos y descripciones existentes. No se alteraron sus módulos de origen ni se produjeron operaciones reales para fabricar eventos de prueba. No se corrige ni reescribe historia durante la lectura.

## M. Pruebas

- Línea base backend: 318 tests, 315 aprobados, tres fallos previos. Resultado: **347 tests, 344 aprobados y los mismos tres fallos**. Nuevos tests: 28 de rendimiento/equivalencia y uno HTTP de seguridad con matriz de escenarios.
- Fallos previos: `mysqlDeployment.test.js` (CRLF/LF), `mysqlLabAccounts.test.js` (permisos POSIX en Windows) y `mysqlLabMigrationHistory.test.js` (hash sensible a CRLF). No se modifican sus pruebas ni expectativas.
- Frontend: base 288/288; resultado final **304/304**, con 16 tests nuevos del módulo. Cubren StrictMode, señales, búsquedas, fechas, navegación, errores, reintento con ambos botones, stale responses, cambios de pedido/cuenta, aislamiento financiero y render de tarjetas anteriores.
- ESLint y build: aprobados. Prisma validate: esquema válido. Diff sin errores de whitespace.
- Responsive: 17 escenarios por página, 320–1.920 px/sidebar, título largo, zoom CSS 200 %, foco/Tab y controles dentro del viewport. Referencia: 17 desbordes de ficha con texto extenso; versión final: cero en 34 escenarios. Tabla de listado conserva scroll local. No certifica lector de pantalla ni contraste instrumental.
- No ejecutado: E2E de sesión Keycloak real, benchmark MySQL de volumen aislado, p95 fiable de concurrencia y revisión humana de accesibilidad. No se marcan como aprobados.

Comandos principales:

```powershell
# capaServidor
$tests = rg --files src test -g '*.test.js'
node --test --test-concurrency=2 $tests
node --test test/historyPerformance.test.js test/historySecurity.test.js
npm.cmd run prisma:validate
node --env-file=.env scripts/benchmarkHistoryOpt05.mjs --allow-development-reads --baseline-only
node --env-file=.env scripts/benchmarkHistoryOpt05.mjs --allow-development-reads
node --env-file=.env scripts/benchmarkHistoryOpt05.mjs --allow-development-reads --http-only --output=../docs/OPT-05_RENDIMIENTO_HTTP.json
New-Item -ItemType Directory -Force -Path ../tmp/opt05 | Out-Null
node --env-file=.env scripts/benchmarkHistoryOpt05.mjs --allow-development-reads --fixtures-only --output=../tmp/opt05/sql-fixtures.json
node --env-file=.env scripts/benchmarkHistoryOpt05.mjs --allow-development-reads --plans-only --output=../tmp/opt05/list-plans.json
node scripts/benchmarkHistorySyntheticOpt05.mjs
# capaVista
npm.cmd test -- --maxWorkers=2 --reporter=dot
npm.cmd run lint
npm.cmd run build
# raíz
git diff --check
```

El benchmark exige APP_ENV=development y opt-in de lectura. Los resultados de los probes SQL se incorporaron al JSON principal sin parámetros privados. El verificador visual se generó temporalmente desde `scripts/verify-page-layout.mjs`, con páginas de referencia leídas desde Git y APIs sintéticas; se retiró tras conservar la evidencia. No se instaló ninguna dependencia ni se inició infraestructura global.

## N. Archivos

Modificados:

- `capaServidor/src/modules/history/repo/orderHistory.repo.js`
- `capaServidor/src/modules/history/controller/orderHistory.controller.js`
- `capaVista/src/modules/orderHistory/api/orderHistoryApi.js`
- `capaVista/src/modules/orderHistory/pages/OrderHistoryPage.jsx`
- `capaVista/src/modules/orderHistory/pages/OrderHistoryDetailPage.jsx`
- `capaVista/src/modules/orderHistory/pages/OrderHistoryPage.module.css`
- `capaVista/src/modules/orderHistory/pages/OrderHistoryDetailPage.module.css`
- `capaVista/src/modules/orderHistory/utils/orderHistoryFormatters.js`

Creados:

- `capaServidor/src/modules/history/repo/historyRead.repo.js`
- `capaServidor/test/historyPerformance.test.js`, `historySecurity.test.js`
- `capaServidor/test/fixtures/opt05/orderHistory.before.repo.js`, `orderHistory.before.service.js`, `historyFixture.js`
- `capaServidor/scripts/benchmarkHistoryOpt05.mjs`, `historyHttpProbeOpt05.mjs`, `historySqlFixtureProbeOpt05.mjs`, `benchmarkHistorySyntheticOpt05.mjs`
- `capaVista/src/modules/orderHistory/components/HistoryEvent.jsx`
- `capaVista/src/modules/orderHistory/utils/historyReads.js`, `historyPerformance.test.jsx`, `fixtures/formatters.before.js`
- Este informe, `OPT-05_LINEA_BASE.json`, `OPT-05_RENDIMIENTO.json`, `OPT-05_RENDIMIENTO_HTTP.json`, `OPT-05_SINTETICO.json`, `OPT-05_RESPONSIVE_RENDER.json` dentro de `docs`.

Sin archivos productivos eliminados. Se retira instrumentación/verificador temporal. Los cambios anteriores de OPT-07 permanecen sin alteraciones.

## O. Alternativas descartadas

- Caché de páginas/fichas completadas: no hay invalidación completa ante Kanban, pagos, calendario o cambios de permisos. Se mantienen lecturas frescas; solo se comparte trabajo pendiente.
- JOIN de productos × etiquetas: fan-out incompatible con costo acotado y conservación de cantidades/listas. Se usa UNION ALL disjunto.
- Una fila JSON con agregaciones de hijos: conversión de fechas, orden de arrays y tipos agregaría complejidad sin evidencia de latencia mejor que las dos lecturas paralelas.
- Reescritura del SQL de eventos: ya es una consulta compacta, con proyección y redacción adecuadas. No hay mejora demostrada que justifique arriesgar trazabilidad.
- Forzar índice, agregar índice de creación, OFFSET profundo o transacción serializada: no sustentados por pruebas aisladas de volumen; no se modifica infraestructura ni consistencia contractual.
- Virtualización, biblioteca de timeline y store global: la paginación más Intl reutilizado y memoización de tarjetas ya muestran beneficio local sin alterar foco/scroll ni agregar dependencias.
- Reducir autorización, TTL de identidad o TLS para conseguir un segundo: descartado; controles se conservan por solicitud.

## P. Conclusión

Listado, búsqueda, filtros y navegación reducen sus medianas de servicio aproximadamente a la mitad, eliminando dos SELECT por página poblada. La apertura elimina dos SELECT adicionales de cabecera, sin mejora relevante de latencia. Eventos mantienen su único SELECT, su cronología y todos los datos autorizados; la mejora de cargar más está en solicitudes/reintentos y render incremental.

Servicio queda alrededor de 658–666 ms en los escenarios observados. HTTP protegido permanece alrededor de 1.320–1.333 ms tras la optimización y sigue superando el segundo. El perfilado local y los formateadores quedan muy por debajo del segundo; no equivalen a cumplir p95/E2E empresarial. La latencia remota, el volumen SQL no certificado y la infraestructura aislada ausente limitan las conclusiones.

La equivalencia se comprobó contra referencia real y fixtures; fechas, actores, observaciones, cantidades, privacidad y permisos se conservan. Listo para revisión e integración en desarrollo con los tres fallos previos identificados y las limitaciones indicadas. Sin commit, push ni despliegue.

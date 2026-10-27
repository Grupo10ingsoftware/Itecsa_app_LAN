# OPT-07 — Implementación de rendimiento de Reportes y estadísticas

Fecha: 27-10-2026. Rama: `optimizacion`. Referencia: `51a4d8971e8242dd219ecfd40fd12aa0d677ef64`. Árbol limpio al comenzar. Sin commit, push ni despliegue.

## A. Resumen ejecutivo

Se implementaron proyecciones SQL parametrizadas para las tres ramas del resumen y para desempeño, manteniendo los cálculos públicos en JavaScript. El resumen pasa de **15 a 4 SELECT**, con mediana de servicio **1.981,834 → 663,299 ms**; desempeño pasa de **3 a 1 SELECT**, **1.895,935 → 661,994 ms**. Ambos DTO completos coinciden con la referencia en las comparaciones ejecutadas.

HTTP protegido sigue sobre un segundo: resumen **2.805,582 → 1.331,429 ms**, desempeño **2.546,089 → 1.239,664 ms**. No se omitió identidad para alcanzar el objetivo. El recorrido de navegador con sesión real y MySQL **no se midió** y no se certifica como inferior a un segundo.

Frontend: cancelación de lecturas, deduplicación de solicitudes simultáneas idénticas dentro de la misma instancia de API, eliminación inmediata de datos al cambiar de sesión, derivación lineal del gráfico y exportadores verificables con el mismo contenido. Se cubren PERF-094 a PERF-100; no se alteraron autenticación, PIN, recuperación, Kanban, pagos, usuarios, esquema, pool ni TLS.

Fuentes previas consultadas: [auditoría](AUDITORIA_RENDIMIENTO_ITECSA.md), [Fase 1](IMPLEMENTACION_RENDIMIENTO_FASE1_ITECSA.md) e informes OPT-01, OPT-02, OPT-03 y OPT-09 disponibles. Las optimizaciones anteriores permanecen integradas. No se repitió una auditoría global.

## B. Resumen de métricas

| Operación | Problema anterior | Cambio | Resultado |
|---|---|---|---|
| PERF-094, resumen | 15 SELECT e hidratación relacional | JOINs y proyección disjunta de pedidos | 4 SELECT; mismo DTO; servicio 663,299 ms |
| PERF-095, período | Ignoraba respuestas antiguas; HTTP seguía activo | AbortSignal, suscripciones compartidas solo mientras están pendientes | Una lectura por API/período simultáneo; sin caché de resultados |
| PERF-096, desempeño | 3 SELECT | EXISTS y selección correlacionada de la última entrada válida | 1 SELECT; servicio 661,994 ms |
| PERF-097, gráficos | Copia acumulativa de segmentos en cada iteración | Acumulación lineal sin modificar el input | 10.000 categorías: 104,301 → 0,346 ms de derivación sintética |
| PERF-098, CSV | Generación local ya eficiente | Serializador puro comprobado contra la referencia | Contenido idéntico; cero GET de exportación |
| PERF-099, Excel | Texto tabulado `.xls`, no XLSX | Conservación de formato, MIME y celdas | Contenido idéntico; sin biblioteca nueva |
| PERF-100, impresión/PDF | HTML local y diálogo de navegador | Serialización comprobable y escape conservado | Mismo HTML; popup bloqueado manejado; sin PDF de backend |

## C. Producción

Antes: `Detalle_pedido.findMany` con `Tipo_Producto`, dos SELECT. Después: un LEFT JOIN con `cantidad` y `nombre_producto`; filtro idéntico `fecha_real_termino >= start AND < end`. No se usa fecha de creación ni se filtran estados adicionales.

Se mantiene el reduce original: ignora nombres vacíos, suma `Number(cantidad ?? 0)` y conserva claves, tipos y orden de aparición. No se agrupa por la collation de MySQL: `Lanyard`, `lanyard` y nombres con/sin acentos siguen siendo claves diferentes como en JS. La ordenación por PK reproduce el recorrido observado del ORM sin ORDER BY; no se agregaron índices que alteren ese recorrido. El orden que el ORM no especificaba no es una garantía contractual de MySQL para futuros planes.

Lectura del mes poblado: 3 detalles; representación JSON interna 185 → 131 bytes. La salida de la rama sigue en 27 bytes en ese fixture. La salida HTTP del resumen permanece en 3.799 bytes: no se recortó el resultado público.

## D. Duraciones

Se conservan dos lecturas paralelas: etapas y subprocesos. Cada una usa LEFT JOIN a sus catálogos y, para subprocesos, al detalle/producto. Solo se filtran entradas del período y salida no nula, igual que antes. No se excluyen pedidos por estado ni se deduplican reingresos.

Fórmula sin cambios, por registro:

```js
seconds = Math.max(0, Math.round((new Date(exit) - new Date(entry)) / 1000))
averageSeconds = Math.round(sumOfRoundedSeconds / sampleSize)
```

Se mantiene la clave `nombre::producto`, el denominador por registros válidos y el tratamiento de nombres/fechas ausentes. No se reemplazó por `TIMESTAMPDIFF`, AVG SQL ni redondeo del promedio de milisegundos. Se probaron fechas iguales, negativas, fracciones, abiertos, repetidos, medianoche, cambio de mes, bisiesto y cambio horario de Chile. Se mantienen incluso las peculiaridades de las claves originales: corregirlas sería otro cambio funcional.

Lecturas pobladas: 10 etapas, 19 subprocesos. Sus representaciones internas pasan de 1.500 a 1.320 bytes y de 4.044 a 2.904 bytes. La rama conserva su resultado de 1.283 bytes y pasa de seis SELECT a dos.

## E. Pedidos y eventos

`reportOrders` ahora ejecuta una sentencia con CTE de pedidos del rango y `UNION ALL` de tres tipos de filas: pedido/vendedor, detalle/producto y eventos de «Listo para entrega». Se reconstruyen las relaciones mínimas con un Map. No hay producto cartesiano de detalles × eventos, lista IN sin límite, paginación oculta ni límite arbitrario de pedidos.

Se retienen **todos los detalles** y **todos los eventos candidatos** del estado relevante, con fechas de entrada nulas incluidas. Se eliminan de la transferencia los eventos de otros estados que `buildFlowTime` nunca utiliza. Sigue siendo JS quien encuentra el primer evento con nombre exactamente igual a «Listo para entrega». Esto conserva su igualdad estricta aunque la comparación SQL del catálogo sea menos estricta por collation. No se cambió por el último evento ni se descartó un primer evento de entrada nula en favor de otro posterior.

Orden: pedidos por creación/PK, detalles por PK, eventos por `FECHA_HORA`/PK. La PK desempata ordenaciones que antes no tenían desempate declarado; coincide con las lecturas de referencia comprobadas. No se borró historia. La lectura pasa a una sola instantánea de sentencia, sin abrir transacciones durante cálculos de presentación.

Mes poblado: 9 pedidos; la sentencia devuelve 20 filas disjuntas, en vez de un grafo que incluía todos los eventos. El grafo útil reconstruido pasa de 8.531 a 3.607 bytes. La representación plana SQL contiene columnas nulas por el UNION y ocupa 7.038 bytes; no se presenta esa cifra como bytes físicos de red.

Cumplimiento por vendedor sigue agrupando por nombre visible, no por identificador. Mantiene máximo de fechas de detalles/pedido, condición «todos los detalles finalizados», comparación de instantes y carga de lanyards **mayor que 900**, con los mismos días y denominadores. No se agregaron reglas especiales para cancelados o estados abiertos: la implementación original no filtraba esos estados en estas ramas.

## F. Desempeño de producción

La nueva consulta mantiene dos condiciones distintas:

1. EXISTS de una entrada al estado listo dentro de los límites UTC amplios originales (`end + 1 día`).
2. Selección de la **última** entrada no nula al mismo estado, entre todas las fechas, ordenada por entrada descendente e ID_REGISTRO descendente.

La segunda condición no queda restringida al período. Si la última entrada cae fuera del mes, el servicio sigue excluyendo el pedido aunque existiera una entrada anterior dentro de él.

El servicio original no cambia: convierte esa entrada al día calendario de `America/Santiago`, aplica inclusivamente `from/to`, compara el plazo SQL DATE sin desplazarlo de zona y separa `missingDeadline`. Mantiene total, a tiempo, atrasados y ausencia de plazo. La consulta no devuelve vendedores ni nuevos datos privados. Tres filas internas en el mes; representación plana 415 → 274 bytes, DTO público 124 bytes en ambas versiones.

## G. Frontend

`subscribeMetricsSummary` conserva su protección lógica y añade AbortController. Las suscripciones idénticas comparten una petición pendiente por objeto API/período. La baja del último suscriptor aborta; una microtarea permite el cleanup/remontaje de StrictMode sin duplicar HTTP. Al finalizar o fallar se elimina la entrada. Volver a un período solicita datos frescos. No existe almacenamiento en localStorage, caché global de estadísticas ni reutilización entre cuentas.

`MetricsPage` se remonta por instancia de API, que el hook compartido ya renueva al cambiar la sesión. La pantalla elimina inmediatamente resumen, reporte, filtros y opciones anteriores. `ProductionPerformance` se aísla por API y período, mantiene generación manual y exclusión de doble clic, y aborta al desmontarse. No confirma resultados hasta recibir el DTO. Las lecturas abortadas pueden haber iniciado SQL: abortar HTTP no promete cancelar trabajo MySQL.

`buildProductionChart` conserva porcentajes, colores, etiquetas, acumulación y entradas inválidas; sustituye la copia creciente de arrays por push en un array privado. La búsqueda del máximo de estadía usa reduce en vez de expandir todos los valores como argumentos. No se aplicó memoización general ni se incorporaron gráficos, virtualización o estilos nuevos.

Responsive: [17 escenarios vacíos](OPT-07_RESPONSIVE.json) y [17 escenarios poblados/expandidos](OPT-07_RESPONSIVE_POBLADO.json), 320–1.920 px, variantes de sidebar, título largo y revisión adicional de zoom CSS 200 %. Sin overflow del documento. Fixture poblado: 100 vendedores y 30 indicadores de subprocesos, con tabla desplazable local. Se comprobó foco en botones y estados expandibles; no se certifica una revisión humana de lector de pantalla ni contraste instrumental. No se modificaron colores ni movimiento.

[Interacción sintética en Edge](OPT-07_RENDER_SINTETICO.json): una observación de apertura de grupos hasta dos animation frames, 139,2 ms. Incluye comunicación de diagnóstico; no es React Profiler, no es percentil, no es carga inicial autenticada y no se utiliza como mejora antes/después. El primer intento del verificador poblado quedó desplazado por la prueba de foco y falló la geometría del encabezado; se corrigió el scroll del verificador y se repitió sin modificar la aplicación por ese falso positivo.

## H. Exportaciones

`buildSellerReport` extrae las mismas expresiones del componente para probarlas sin navegador. La referencia congelada de `51a4d89` exige igualdad de cadenas para CSV, Excel e impresión en los tests y fixtures de 10/100/1.000/10.000 filas.

- CSV: mismo BOM, encabezados españoles, columnas, comillas dobles escapadas y saltos de línea entre filas.
- Excel: mismo texto tabulado, BOM, extensión `.xls` y MIME `application/vnd.ms-excel`. No se genera ni se afirma generar XLSX.
- Celdas: se conserva la normalización de tabulaciones/CR/LF y el prefijo apóstrofo ante `= + - @`, incluidos espacios iniciales. Se prueban comillas, comas y Unicode. No se afirma seguridad después de reeditar/reexportar el archivo en cualquier versión de Excel.
- HTML: mismo documento, títulos, tablas, fechas y escape de `& < > " '`. Las pruebas incluyen contenido sintético con `<script>`.
- Navegador: Blob, nombre de descarga, URL revocada, popup bloqueado, `document.close()` y `print()` comprobados. No se cierran ventanas del usuario mientras utiliza impresión. No se midió apertura en Excel de escritorio ni interacción humana del diálogo PDF.
- No hay GET al exportar; una selección pendiente/inválida o una nueva sesión elimina los controles con datos viejos. No se añadieron permisos distintos de los existentes.

## I. Comparación de rendimiento

Medianas, cinco muestras calientes por serie, pausa de 250 ms fuera del reloj, mismo proceso/configuración y TLS estricto/pool 10. Node 24.19.0, Prisma y adapter 7.10.0, mariadb 3.5.4; sin cambio de dependencias. La [línea base anterior a cambios](OPT-07_LINEA_BASE.json) se conserva aparte. Comparación final: [servicio/SQL](OPT-07_RENDIMIENTO_SQL.json), [HTTP](OPT-07_RENDIMIENTO_HTTP.json).

| Operación | Antes (ms) | Después (ms) | Mejora | Muestras por versión | ¿Cumple 1 s? |
|---|---:|---:|---:|---:|---|
| Resumen, servicio | 1.981,834 | 663,299 | 66,5 % | 5 | Sí, mediana observada |
| Desempeño, servicio | 1.895,935 | 661,994 | 65,1 % | 5 | Sí, mediana observada |
| Resumen, HTTP protegido | 2.805,582 | 1.331,429 | 52,5 % | 5 | No |
| Desempeño, HTTP protegido | 2.546,089 | 1.239,664 | 51,3 % | 5 | No |
| Navegador + sesión real + MySQL | No medido | No medido | No medido | 0 | No certificado |

HTTP utiliza router/controlador reales, JWT RS256/JWKS de loopback, binding activo de la base y capacidades reales, con cuota en memoria 120/minuto. Excluye login/sesión Keycloak real, auditoría global de soporte y escrituras SQL de cuota. No se omite la resolución de identidad: resumen HTTP 16 → 5 SELECT, desempeño HTTP 4 → 2. No se atribuye toda la diferencia HTTP/servicio a una etapa individual.

Ramas del resumen (medianas, **no se suman porque se solapan**): producción 1.317,296 → 660,352 ms; estadías 1.667,453 → 662,099 ms; pedidos 1.981,377 → 580,200 ms. La ruta crítica final es aproximadamente la lectura más lenta, más la transformación final.

El JSON registra tiempos de consulta del adaptador, lecturas, ramas, CPU del proceso y deltas de heap. Los tiempos del driver incluyen recorrido del adaptador/red; **CPU interna del servidor MySQL y tiempo de ejecución puro SQL: No medido**. CPU Windows muestra resolución gruesa, incluso ceros; no se usa para concluir que la CPU cuesta cero. La instrumentación de conteo/serialización está incluida en ambos tiempos. Los deltas de heap pueden incluir GC y no son memoria máxima. No hay p95 significativo con cinco muestras.

Volumen [sintético aislado en memoria](OPT-07_VOLUMEN_SINTETICO.json):

| Pedidos / categorías | Resumen antes/después (ms) | Derivación gráfico antes/después (ms) |
|---:|---:|---:|
| 10 | 0,257 / 0,257 | 0,007 / 0,004 |
| 100 | 1,270 / 1,292 | 0,038 / 0,018 |
| 1.000 | 11,878 / 12,392 | 1,422 / 0,148 |
| 10.000 | 130,009 / 130,018 | 104,301 / 0,346 |

Cada pedido tiene dos detalles y doce eventos, además de doce subprocesos; 10.000 pedidos representan 120.000 eventos y 120.000 registros de subprocesos. Los dobles devuelven datos preparados fuera del reloj. No ejecutan SQL ni simulan el costo real de hidratación ORM. El nuevo repositorio sí reconstruye el grafo útil en su función. Este ensayo demuestra equivalencia y costo acotado de los cálculos, **no mejora SQL a escala ni tiempos HTTP con 10.000 pedidos**. No se detectó mejora relevante del cálculo general JS y no se anuncia una.

Con 10.000 vendedores, serialización antes/después: CSV 11,129/11,727 ms, tabulado 5,733/5,560 ms, HTML 9,854/8,472 ms. Variaciones pequeñas sin atribución de mejora: se conservó el algoritmo. Se descarta introducir workers o una biblioteca por estos resultados. Estas cifras excluyen layout del documento grande, diálogo y apertura de Excel.

## J. SQL

| Función | SELECT anteriores | SELECT posteriores | Cambio |
|---|---:|---:|---|
| production | 2 | 1 | JOIN a producto |
| dwellTime | 6 | 2 | Una proyección por tipo, ambas paralelas |
| reportOrders | 7 | 1 | CTE + UNION ALL sin fan-out |
| summary completo | 15 | 4 | Tres ramas conservadas |
| performanceOrders | 3 | 1 | EXISTS + última entrada correlacionada |

Se eliminan once consultas separadas de hidratación en el resumen. Las relaciones necesarias siguen resolviéndose mediante JOIN; no se eliminaron catálogos ni asociaciones del negocio. Los grafos completos de eventos no relevantes dejan de transferirse.

La suma de representaciones JSON de lecturas del mes pasa de 14.260 a 11.393 bytes; es una aproximación de representación interna, **no captura de bytes de protocolo**. ReportOrders tiene menos información histórica útil transferida aunque el UNION usa columnas nulas. El DTO público permanece idéntico.

Se ejecutaron cinco EXPLAIN de las proyecciones y se consultaron índices reales. Producción recorre PRIMARY estimada en 71 filas; etapas 61 y subprocesos 106, con JOINs de catálogo eq_ref. Pedidos tiene estimación de 49 filas. UNION usa tabla temporal/filesort; desempeño también presenta temporales/ordenamiento en subconsultas. Las cifras de EXPLAIN son **estimaciones**, no filas efectivamente examinadas. No se ejecutó EXPLAIN ANALYZE ni carga agresiva.

No se introdujeron índices. No hay evidencia con MySQL aislado de volumen que justifique DDL sobre fechas, ni se midió su costo de escritura. Las demoras observadas no se atribuyen al escaneo de esas tablas pequeñas. Planes y columnas de índices, sin parámetros ni registros personales, están en el JSON SQL.

## K. Equivalencia matemática

| Indicador | Resultado anterior | Resultado nuevo | Equivalencia |
|---|---|---|---|
| Producción con `Lanyard` repetido, `lanyard`, acento, null y cantidad negativa | Claves separadas; suma JS original | Mismo objeto | Igualdad estricta |
| Promedio de estadías, repetidos/reingresos | Redondeo por muestra y al promediar | Misma fórmula | Igualdad estricta |
| Primera entrada a listo con fecha nula y posterior entrada válida | Duración null | Duración null | Igualdad estricta |
| Cumplimiento vendedor / carga alta | Mismo grafo útil y cálculo original | Misma salida completa | Igualdad estricta |
| Desempeño a tiempo, tarde y sin plazo | Mismos contadores y período | Mismo DTO completo | Igualdad estricta |
| Cambios DST/medianoche y última entrada fuera del mes | Misma interpretación de días de Chile | Misma interpretación | Igualdad estricta |
| Mes poblado, mes vacío y año bisiesto máximo de 366 días | DTO original | DTO nuevo | 6 comparaciones reales aprobadas |
| Fixtures de 10 a 10.000 pedidos | DTO referencia y digest | DTO nuevo y mismo digest | 4 comparaciones sintéticas aprobadas |
| Exportaciones CSV/tabulado/HTML | Cadena de referencia | Misma cadena | Igualdad exacta, sin tolerancia |

Los servicios de referencia se conservaron como fixtures congelados, no como código productivo. No se cambiaron sus expectativas para aprobar la implementación. Las pruebas sintéticas de repositorio usan dobles: no sustituyen una certificación de planes SQL a gran escala. Los casos de estados cancelados/abiertos preservan la ausencia de filtro original; no se inventó un tratamiento estadístico nuevo.

## L. Seguridad

JWT, identidad activa, comprobación de capacidades VIEW_METRICS, roles, cuotas y rutas no se modifican. Un test HTTP nuevo recorre ambas rutas con firma real y verifica ausencia/token malformado, binding ausente, usuario desvinculado, capacidad ausente, período inválido, consulta válida con una nueva lectura de identidad y respuesta 429. Los rechazos ocurren antes de consultar métricas.

SQL utiliza exclusivamente `Prisma.sql` y parámetros para fechas/estado. No hay `$queryRawUnsafe`, concatenación de filtros ni datos del navegador usados como autoridad. La validación de formato real YYYY-MM-DD, orden y máximo 366 días permanece en el servicio original. No se amplían datos del DTO. Las pruebas Fase 1 de autenticación y contratos de consumidores se conservan y se ejecutaron.

No hay caché completada de estadísticas ni almacenamiento persistente del frontend. Cambio de API/sesión elimina resultados, aborta lecturas y evita restauración tardía. Se mantienen escaping HTML y protección de fórmulas existente. Referencias oficiales consultadas: [Prisma 7, SQL parametrizado](https://www.prisma.io/docs/orm/v7/prisma-client/using-raw-sql/raw-queries), [MySQL 8.4, EXPLAIN](https://dev.mysql.com/doc/refman/8.4/en/explain.html), [React, cleanup de efectos](https://react.dev/reference/react/useEffect), [OWASP, CSV Injection y sus limitaciones](https://community.owasp.org/attacks/CSV_Injection). No se habilitan funciones Preview ni se actualiza el stack.

## M. Pruebas

Resultado: **28 pruebas backend nuevas y 14 frontend nuevas**.

- Backend completo: **267 tests, 264 aprobados, 3 fallos previos**. Antes: 239, 236 aprobados y los mismos tres fallos.
- Fallos previos: `mysqlDeployment.test.js` por texto CRLF/LF; `mysqlLabAccounts.test.js` por permisos POSIX 0600 en Windows; `mysqlLabMigrationHistory.test.js` por hash de migración sensible a CRLF. No se tocaron esos archivos ni se debilitaron sus expectativas.
- Frontend completo: **266/266**, frente a 252/252 antes.
- ESLint: aprobado. Build Vite: aprobado. Prisma validate: esquema válido. PowerShell muestra el mensaje de configuración de Prisma en stderr como NativeCommandError; el contenido confirma la validación correcta, no un error de esquema.
- Responsive: 17 escenarios vacíos + 17 poblados, sin overflow del documento; zoom/títulos/foco adicionales descritos en G.
- Equivalencia de DTO real: seis casos. Fixtures de volumen: cuatro. Cinco EXPLAIN.

Comandos (desde la carpeta correspondiente):

```powershell
# capaServidor
$tests = rg --files src test -g '*.test.js'
node --test $tests
node --test test/metricsPerformance.test.js test/metricsSecurity.test.js
npm.cmd run prisma:validate
node --env-file=.env scripts/benchmarkMetricsOpt07.mjs --allow-development-reads --baseline-only --output=../docs/OPT-07_LINEA_BASE.json
node --env-file=.env scripts/benchmarkMetricsOpt07.mjs --allow-development-reads --output=../docs/OPT-07_RENDIMIENTO_SQL.json
node --env-file=.env scripts/benchmarkMetricsOpt07.mjs --allow-development-reads --http-only --output=../docs/OPT-07_RENDIMIENTO_HTTP.json
node scripts/benchmarkMetricsSyntheticOpt07.mjs
# capaVista
npm.cmd test -- --reporter=dot
npm.cmd run lint
npm.cmd run build
# raíz
node scripts/verify-page-layout.mjs metrics
git diff --check
```

El benchmark real exige APP_ENV=development y opt-in explícito; solo realiza SELECT/EXPLAIN. El harness poblado se generó temporalmente a partir del verificador existente, sustituyendo solo su API sintética; se retira al terminar. Los reportes JSON conservan sus resultados. No se insertaron fixtures en la base empresarial ni se generaron reportes escribiendo registros reales.

No ejecutable en el alcance disponible: benchmark SQL con miles de registros en base MySQL aislada; sesión E2E real de Keycloak; Excel de escritorio; impresión PDF manual; revisión humana de lector de pantalla; saturación concurrente/pool. No se presentan como aprobados.

## N. Archivos

Modificados:

- `capaServidor/src/modules/metrics/repo/metrics.repo.js`
- `capaVista/src/modules/metrics/api/metricsApi.js`
- `capaVista/src/modules/metrics/components/ProductionPerformance.jsx`
- `capaVista/src/modules/metrics/pages/MetricsPage.jsx`
- `capaVista/src/modules/metrics/utils/metricsPage.js`
- `capaVista/src/modules/metrics/utils/reportFormatting.js`

Creados:

- `capaServidor/src/modules/metrics/repo/metricsRead.repo.js`
- `capaServidor/test/metricsPerformance.test.js`
- `capaServidor/test/metricsSecurity.test.js`
- `capaServidor/test/fixtures/opt07/metrics.before.repo.js`
- `capaServidor/test/fixtures/opt07/metrics.before.service.js`
- `capaServidor/scripts/benchmarkMetricsOpt07.mjs`
- `capaServidor/scripts/metricsHttpProbeOpt07.mjs`
- `capaServidor/scripts/benchmarkMetricsSyntheticOpt07.mjs`
- `capaVista/src/modules/metrics/utils/metricsPerformance.test.jsx`
- `capaVista/src/modules/metrics/utils/fixtures/chart.before.js`
- `capaVista/src/modules/metrics/utils/fixtures/export.before.js`
- Este informe y `docs/OPT-07_LINEA_BASE.json`, `OPT-07_RENDIMIENTO_SQL.json`, `OPT-07_RENDIMIENTO_HTTP.json`, `OPT-07_VOLUMEN_SINTETICO.json`, `OPT-07_RESPONSIVE.json`, `OPT-07_RESPONSIVE_POBLADO.json`, `OPT-07_RENDER_SINTETICO.json`.

No se eliminan archivos productivos. Se retiran copias y verificador temporales propios. No se cambian módulos compartidos ni dependencias.

## O. Alternativas descartadas

- GROUP BY/AVG SQL: collation, orden, redondeo por muestra y fechas no garantizan equivalencia exacta. Las proyecciones ya reducen la ruta crítica sin trasladar esas reglas.
- Tres consultas para pedidos/detalles/eventos: primera variante correcta, pero resumen aún alrededor de 1.903 ms. Se sustituyó por UNION ALL de conjuntos disjuntos; no se sumaron detalles con eventos.
- Un JOIN cartesiano de pedidos/detalles/eventos: duplicaría filas/cantidades y perjudicaría transferencia.
- Último evento para tiempo de flujo: regla incorrecta; usa primero. Restringir la última entrada de desempeño al mes: también incorrecto.
- Caché completada, TTL o localStorage: falta un contrato de invalidación por cambios productivos; se comparte solo trabajo pendiente por sesión.
- Más conexiones, transacción prolongada, TLS desactivado, omitir identidad o consultas ilimitadas en paralelo: no necesarios ni adoptados.
- Bibliotecas de Excel/gráficos, workers y virtualización: sin beneficio demostrado que justifique compatibilidad, accesibilidad y complejidad adicionales.
- Índices sobre fechas: no adoptados sin ensayo SQL aislado representativo y análisis de escritura.

## P. Limitaciones

MySQL remoto mantiene un costo de recorrido cercano a cientos de milisegundos por consulta; no se cambió infraestructura. El conjunto real observado es pequeño. Cinco muestras por serie no certifican percentiles ni carga sostenida. Las series se ejecutaron secuencialmente; el entorno no garantiza ausencia de actividad de otros usuarios.

Los volúmenes grandes prueban CPU, memoria aproximada, integridad y serialización en memoria, no ejecución física MySQL. No se inicializó ni pobló una base aislada para medir planes con 10.000 pedidos. UNION y subconsultas correlacionadas conservan riesgos de ordenamiento/escaneo a gran escala, explícitos en J. No se recomienda extrapolar tiempos linealmente ni desplegar índices a partir de estos datos.

Los servicios conservan límites y reglas existentes, incluidas sus diferencias: resumen filtra por fechas UTC/DATE de cada rama; desempeño aplica día chileno después del rango amplio. No se unificaron esas reglas. Una ordenación SQL sin desempate en el código anterior no definía un orden estable entre empates; las nuevas proyecciones lo explicitan con PK y coinciden con los casos de referencia medidos.

## Q. Conclusión

El resumen mejora **66,5 %** en la mediana de servicio y elimina **11 SELECT**; once hidrataciones separadas se sustituyen por proyecciones y JOIN, y no se descargan eventos ajenos al cálculo de flujo. Desempeño mejora **65,1 %** y elimina dos SELECT. Las métricas son exactamente equivalentes en los DTO reales y fixtures probados, con fechas, unidades, redondeos y reglas conservados. Las tres exportaciones mantienen el mismo contenido de referencia.

Cumplen un segundo las medianas medidas de servicio, derivación del gráfico y serialización local. HTTP protegido todavía supera el objetivo (1.331/1.240 ms); E2E real no está medido. Alcanzarlo requiere trabajo/infraestructura adicional sustentado en mediciones, sin retirar identidad ni exactitud.

El cambio está listo para revisión e integración en desarrollo, con los tres fallos previos separados y las limitaciones de volumen SQL y navegador real declaradas. No constituye una certificación de rendimiento productivo a escala. Sin commit, push ni despliegue.

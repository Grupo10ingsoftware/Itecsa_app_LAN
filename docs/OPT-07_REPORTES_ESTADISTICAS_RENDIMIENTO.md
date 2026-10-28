# OPT-07 — Implementación de rendimiento de Reportes y estadísticas

Fecha: 27-10-2026. Rama: `optimizacion`. Segunda intervención sobre `d9e67ac873c00f00e36709907f431fdabe7e1e7b`, con árbol limpio al comenzar. Sin commit, push ni despliegue en esta intervención.

La primera implementación ya estaba integrada en `0be21bb`. Se conservan sus mediciones históricas contra `51a4d8971e8242dd219ecfd40fd12aa0d677ef64`; no son mejoras nuevas de esta segunda intervención. La nueva comparación usa exclusivamente `d9e67ac` como referencia y se conserva en [OPT-07_SEGUNDA_PASADA.json](OPT-07_SEGUNDA_PASADA.json).

## A. Resumen ejecutivo

**Segunda intervención:** la lectura del resumen selecciona ahora únicamente el primer evento exacto «Listo para entrega» de cada pedido. Conserva todos los pedidos y detalles, el primer evento aunque tenga entrada nula y los mismos DTO. En el mes real, la rama pasa de 20 a 19 filas y de 7.038 a 6.668 bytes de representación interna; no cambia la salida pública de 3.799 bytes ni los cuatro SELECT del servicio. Mediana de servicio: **662,209 → 663,149 ms**, sin mejora relevante de latencia; HTTP: **1.332,785 → 1.328,566 ms**, todavía sobre un segundo.

Con 10.000 pedidos y veinte reingresos por pedido, el ensayo en memoria de reconstrucción/cálculo pasa de **111,478 a 67,398 ms**, con 230.000 → 40.000 filas preparadas. Este resultado no mide SQL a escala. En frontend se añadieron reintento manual del resumen, validación local del límite existente de 366 días y correcciones de ancho de la tabla y del selector de productos en móviles. Se corrigió además la restauración temporal de datos anteriores al volver a un período mientras otra consulta estaba pendiente. Las otras operaciones mantienen las optimizaciones integradas y se vuelven a comprobar con pruebas funcionales, de seguridad y equivalencia.

**Primera implementación, cifras históricas:**

Se implementaron proyecciones SQL parametrizadas para las tres ramas del resumen y para desempeño, manteniendo los cálculos públicos en JavaScript. El resumen pasa de **15 a 4 SELECT**, con mediana de servicio **1.981,834 → 663,299 ms**; desempeño pasa de **3 a 1 SELECT**, **1.895,935 → 661,994 ms**. Ambos DTO completos coinciden con la referencia en las comparaciones ejecutadas.

HTTP protegido sigue sobre un segundo: resumen **2.805,582 → 1.331,429 ms**, desempeño **2.546,089 → 1.239,664 ms**. No se omitió identidad para alcanzar el objetivo. El recorrido de navegador con sesión real y MySQL **no se midió** y no se certifica como inferior a un segundo.

Frontend: cancelación de lecturas, deduplicación de solicitudes simultáneas idénticas dentro de la misma instancia de API, eliminación inmediata de datos al cambiar de sesión, derivación lineal del gráfico y exportadores verificables con el mismo contenido. Se cubren PERF-094 a PERF-100; no se alteraron autenticación, PIN, recuperación, Kanban, pagos, usuarios, esquema, pool ni TLS.

Fuentes previas consultadas: [auditoría](AUDITORIA_RENDIMIENTO_ITECSA.md), [Fase 1](IMPLEMENTACION_RENDIMIENTO_FASE1_ITECSA.md) e informes OPT-01, OPT-02, OPT-03 y OPT-09 disponibles. Las optimizaciones anteriores permanecen integradas. No se repitió una auditoría global.

## B. Resumen de métricas

Primera implementación, ya integrada:

| Operación | Problema anterior | Cambio | Resultado |
|---|---|---|---|
| PERF-094, resumen | 15 SELECT e hidratación relacional | JOINs y proyección disjunta de pedidos | 4 SELECT; mismo DTO; servicio 663,299 ms |
| PERF-095, período | Ignoraba respuestas antiguas; HTTP seguía activo | AbortSignal, suscripciones compartidas solo mientras están pendientes | Una lectura por API/período simultáneo; sin caché de resultados |
| PERF-096, desempeño | 3 SELECT | EXISTS y selección correlacionada de la última entrada válida | 1 SELECT; servicio 661,994 ms |
| PERF-097, gráficos | Copia acumulativa de segmentos en cada iteración | Acumulación lineal sin modificar el input | 10.000 categorías: 104,301 → 0,346 ms de derivación sintética |
| PERF-098, CSV | Generación local ya eficiente | Serializador puro comprobado contra la referencia | Contenido idéntico; cero GET de exportación |
| PERF-099, Excel | Texto tabulado `.xls`, no XLSX | Conservación de formato, MIME y celdas | Contenido idéntico; sin biblioteca nueva |
| PERF-100, impresión/PDF | HTML local y diálogo de navegador | Serialización comprobable y escape conservado | Mismo HTML; popup bloqueado manejado; sin PDF de backend |

Avance de la segunda intervención:

| Operación | Problema restante | Cambio | Resultado nuevo |
|---|---|---|---|
| PERF-094 | Todos los reingresos al estado listo seguían transfiriéndose | Selección SQL del primer evento exacto por pedido | Como máximo una fila de evento por pedido, mismo DTO |
| PERF-095 | Rangos superiores a 366 días viajaban hasta ser rechazados | Validación local con el mismo límite inclusivo del servidor | Cero GET con ese rango inválido; límite de 366 días permitido |
| PERF-094/095 | Un error requería cambiar de período para volver a consultar | Botón Reintentar con solicitud pendiente compartida | Reintento explícito, sin caché ni respuestas antiguas |
| PERF-095 | A cargado → B pendiente → A mostraba temporalmente A anterior | Versión nueva de solicitud al cambiar el período efectivo | Datos y exportación ocultos hasta recibir A fresco |
| PERF-097 | Tabla abierta y selector ensanchaban el panel móvil | Columna de mínimo cero y controles ajustables | Tabla con desplazamiento local y selector visible |
| PERF-096/098/099/100 | Ya optimizados en la referencia actual | Verificación sin cambios de cálculo ni exportador | Un SELECT de desempeño; exportaciones locales equivalentes |

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

Segunda intervención: `reportOrdersQuery` selecciona por subconsulta correlacionada el identificador del primer registro con nombre exactamente igual a «Listo para entrega», ordenado por `FECHA_HORA, ID_REGISTRO`. El LIMIT 1 corresponde al único evento consumido por el indicador; no limita pedidos ni detalles. No filtra por fecha de entrada ni por entrada no nula. Seleccionar el identificador evita confundir ausencia de evento con primer evento de entrada nula. El cálculo de desempeño sigue usando su propia última entrada global, sin adoptar esta regla del resumen.

La igualdad usa `CAST(... AS BINARY)` sin longitud para distinguir mayúsculas, acentos y espacios finales, como la igualdad estricta de JS para el nombre ASCII esperado. Se comprobó en MySQL con un fixture de cinco pedidos/nueve eventos, mediante CTE que reemplaza tablas solo dentro del SELECT, sin escrituras. La referencia devuelve 16 filas disjuntas y la propuesta 10; mismo resumen completo. Se conservan el orden por fecha/PK y los detalles sin fan-out. [Referencia oficial de CAST y comparación binaria](https://dev.mysql.com/doc/refman/8.4/en/cast-functions.html).

El mes real pasa de 20 a 19 filas y 7.038 → 6.668 bytes internos. La implementación sigue utilizando una sola sentencia para esta rama. La descripción siguiente documenta la primera implementación, conservada como referencia de esta segunda reducción:

`reportOrders` ahora ejecuta una sentencia con CTE de pedidos del rango y `UNION ALL` de tres tipos de filas: pedido/vendedor, detalle/producto y eventos de «Listo para entrega». Se reconstruyen las relaciones mínimas con un Map. No hay producto cartesiano de detalles × eventos, lista IN sin límite, paginación oculta ni límite arbitrario de pedidos.

Se retienen **todos los detalles** y **todos los eventos candidatos** del estado relevante, con fechas de entrada nulas incluidas. Se eliminan de la transferencia los eventos de otros estados que `buildFlowTime` nunca utiliza. Sigue siendo JS quien encuentra el primer evento con nombre exactamente igual a «Listo para entrega». Esto conserva su igualdad estricta aunque la comparación SQL del catálogo sea menos estricta por collation. No se cambió por el último evento ni se descartó un primer evento de entrada nula en favor de otro posterior.

Orden: pedidos por creación/PK, detalles por PK, eventos por `FECHA_HORA`/PK. La PK desempata ordenaciones que antes no tenían desempate declarado; coincide con las lecturas de referencia comprobadas. No se borró historia. La lectura pasa a una sola instantánea de sentencia, sin abrir transacciones durante cálculos de presentación.

Mes poblado: 9 pedidos; la sentencia devuelve 20 filas disjuntas, en vez de un grafo que incluía todos los eventos. El grafo útil reconstruido pasa de 8.531 a 3.607 bytes. La representación plana SQL contiene columnas nulas por el UNION y ocupa 7.038 bytes; no se presenta esa cifra como bytes físicos de red.

Cumplimiento por vendedor sigue agrupando por nombre visible, no por identificador. Mantiene máximo de fechas de detalles/pedido, condición «todos los detalles finalizados», comparación de instantes y carga de lanyards **mayor que 900**, con los mismos días y denominadores. No se agregaron reglas especiales para cancelados o estados abiertos: la implementación original no filtraba esos estados en estas ramas.

## F. Desempeño de producción

Segunda intervención: consulta, proyección y cálculo sin cambios; se repitieron equivalencia, pruebas de fechas/autorización y medición. Sigue en un SELECT de servicio y dos con identidad en el harness HTTP. La variación de 663,076 → 660,925 ms del servicio no se presenta como una nueva optimización.

La nueva consulta mantiene dos condiciones distintas:

1. EXISTS de una entrada al estado listo dentro de los límites UTC amplios originales (`end + 1 día`).
2. Selección de la **última** entrada no nula al mismo estado, entre todas las fechas, ordenada por entrada descendente e ID_REGISTRO descendente.

La segunda condición no queda restringida al período. Si la última entrada cae fuera del mes, el servicio sigue excluyendo el pedido aunque existiera una entrada anterior dentro de él.

El servicio original no cambia: convierte esa entrada al día calendario de `America/Santiago`, aplica inclusivamente `from/to`, compara el plazo SQL DATE sin desplazarlo de zona y separa `missingDeadline`. Mantiene total, a tiempo, atrasados y ausencia de plazo. La consulta no devuelve vendedores ni nuevos datos privados. Tres filas internas en el mes; representación plana 415 → 274 bytes, DTO público 124 bytes en ambas versiones.

## G. Frontend

Segunda intervención: el resumen fallido permite «Reintentar» conservando el período. Una clave de versión muestra carga durante la nueva lectura y mantiene las bajas de suscripciones al cambiar período/API; doble clic no abre dos GET. Se comprueba en StrictMode, incluyendo respuesta tardía tras cambiar período. El rango personalizado valida ahora el máximo inclusivo de 366 días antes de consultar; servidor y reglas de días permanecen intactos.

También se corrige el caso A cargado → B pendiente → A: la identidad del intento cambia al cambiar el período efectivo, por lo que nunca se vuelve a mostrar/exportar el A anterior mientras se espera su nueva lectura. El callback tardío de B queda desconectado. Pulsar el modo ya seleccionado no invalida resultados ni agrega una consulta. Una prueba de integración comprueba todos esos estados.

La verificación poblada descubrió dos problemas reales a 320 px: el ancho mínimo de la tabla ampliaba la columna implícita y el selector de productos salía de su panel. Se añadió `grid-template-columns: minmax(0, 1fr)` al contenido, ajuste de líneas en el encabezado de subprocesos y ancho máximo al selector. La tabla mantiene sus columnas y scroll local; no se ocultan datos. La nueva comprobación revisa también controles dentro del viewport/panel, además del overflow del documento. Resultados actuales en [evidencia de segunda pasada](OPT-07_SEGUNDA_PASADA.json), campo `responsive`.

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

### Segunda intervención contra d9e67ac

Cinco muestras calientes por versión, pares intercalados de servicio/CPU; HTTP en series por versión. Misma configuración de TLS/pool. No se suman medianas de ramas paralelas ni se atribuyen diferencias de pocos milisegundos a una mejora. Evidencia: [segunda pasada](OPT-07_SEGUNDA_PASADA.json).

| Operación | Antes (ms) | Después (ms) | Interpretación | Muestras por versión | ¿Cumple 1 s? |
|---|---:|---:|---|---:|---|
| Resumen, servicio | 662,209 | 663,149 | Sin mejora relevante | 5 | Sí, mediana observada |
| Desempeño, servicio | 663,076 | 660,925 | SQL/cálculo sin cambios | 5 | Sí, mediana observada |
| Resumen, HTTP protegido | 1.332,785 | 1.328,566 | Sin mejora relevante | 5 | No |
| Desempeño, HTTP protegido | 1.330,518 | 1.326,368 | SQL/cálculo sin cambios | 5 | No |
| Navegador + sesión real + MySQL | No medido | No medido | No medido | 0 | No certificado |

Ensayo de pedidos/eventos en memoria, con producción/estadías vacías y filas preparadas fuera del reloj. Incluye reconstrucción del grafo y cálculos del resumen, excluye selección/ejecución SQL y red:

| Pedidos | Eventos listos/pedido | Filas antes/después | Representación interna antes/después (bytes) | Mediana de tiempo local antes/después (ms) |
|---:|---:|---:|---:|---:|
| 10 | 2 | 50 / 40 | 8.326 / 6.855 | 0,172 / 0,183 |
| 100 | 20 | 2.300 / 400 | 349.786 / 68.738 | 0,798 / 0,679 |
| 1.000 | 50 | 53.000 / 4.000 | 7.988.020 / 692.263 | 12,453 / 5,682 |
| 10.000 | 20 | 230.000 / 40.000 | 35.451.406 / 6.972.420 | 111,478 / 67,398 |

Todos los DTO completos son iguales; la última fila reduce el tiempo local observado 39,5 % y las filas preparadas 82,6 %. No demuestra latencia SQL ni memoria máxima para ese volumen. Los payloads son representaciones JSON, no bytes de protocolo. El conjunto pequeño presenta ruido normal; no hay mejora universal de CPU.

### Primera implementación, comparación histórica contra 51a4d89

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

Segunda intervención: **4 → 4 SELECT** del resumen, **1 → 1** de desempeño; HTTP con identidad **5 → 5** y **2 → 2**. No se atribuyen once SELECT eliminados a esta intervención. Lecturas internas del mes del resumen: 11.393 → 11.023 bytes; salida pública idéntica. Dos EXPLAIN adicionales se conservan en `OPT-07_SEGUNDA_PASADA.json`: la subconsulta usa `idx_records_order_cursor` para el pedido (11 filas estimadas), con ordenamiento adicional. El UNION mantiene temporal/filesort. No son filas efectivamente examinadas, no hay EXPLAIN ANALYZE ni benchmark físico de volumen.

La tabla siguiente corresponde a la primera implementación:

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

Segunda intervención: seis comparaciones reales adicionales (resumen/desempeño, mes poblado, vacío y 366 días), cuatro volúmenes en memoria y el fixture ejecutado por MySQL de nombres/empates/nulls. Se verifica igualdad estricta de DTO, no solo totales o digest. Los digests se guardan después de la comparación; no sustituyen los asserts. Cinco tests backend nuevos comprueban proyección y equivalencia hasta 1.000 pedidos/20 reingresos; tres tests frontend comprueban reintento/obsolescencia, retorno a período previo sin restaurar datos antiguos y límites de períodos.

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

Segunda intervención: **5 pruebas backend nuevas y 3 frontend nuevas**. Línea base actual: backend 313 (310 aprobadas, 3 fallos previos); frontend 285/285. Resultado final: backend **318 (315 aprobadas, los mismos 3 fallos)**; frontend **288/288**. Tests focalizados de métricas/seguridad: **33/33 backend y 17/17 frontend**. ESLint, build y Prisma validate aprobados. Comprobación visual actual: 17 escenarios poblados y 17 de error/reintento, con títulos largos, zoom CSS 200 % y foco; incluye control del ancho de botones/inputs/selects. No certifica lector de pantalla ni sesión real.

Comandos nuevos/repetidos de esta intervención:

```powershell
# capaServidor
$tests = rg --files src test -g '*.test.js'
node --test --test-concurrency=2 $tests
node --test test/metricsRefinement.test.js test/metricsPerformance.test.js test/metricsSecurity.test.js
npm.cmd run prisma:validate
node --env-file=.env scripts/benchmarkMetricsRefinementOpt07.mjs --allow-development-reads
# capaVista
npm.cmd test -- --maxWorkers=2 --reporter=dot
npm.cmd run lint
npm.cmd run build
```

El benchmark nuevo no sobrescribe los JSON de la primera intervención. Sin opt-in de desarrollo ejecuta únicamente fixtures en memoria. Con opt-in realiza SELECT/EXPLAIN y HTTP local con la misma identidad/capacidades del harness anterior; el fixture SQL usa CTE de solo lectura, no tablas temporales persistentes ni DDL. Los primeros intentos en sandbox no consiguieron conexión; con permiso de red se completó la medición. Se corrigió la serialización del digest del fixture CTE porque MySQL devuelve sus identificadores sintéticos como BigInt; no se alteró el DTO ni sus tipos para comparar.

La compilación intermedia coincidió con Edge abierto y falló con EPERM al limpiar su perfil dentro de `dist`. Se cerró el verificador, se conservaron sus resultados y se retiró el directorio generado; el build final se ejecutó por separado y terminó correctamente. Los primeros verificadores poblados detectaron el desborde de tabla y selector: se corrigió el CSS y los 34 escenarios finales pasaron con comprobación adicional de controles.

Resultado histórico de la primera implementación: **28 pruebas backend nuevas y 14 frontend nuevas**.

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

Segunda intervención, modificados:

- `capaServidor/src/modules/metrics/repo/metricsRead.repo.js`
- `capaVista/src/modules/metrics/pages/MetricsPage.jsx`
- `capaVista/src/modules/metrics/pages/MetricsPage.module.css`
- `capaVista/src/modules/metrics/utils/metricsPage.js`
- `capaVista/src/modules/metrics/utils/metricsPerformance.test.jsx`
- Este informe.

Segunda intervención, creados:

- `capaServidor/scripts/benchmarkMetricsRefinementOpt07.mjs`
- `capaServidor/test/metricsRefinement.test.js`
- `capaServidor/test/fixtures/opt07/second-pass/metricsRead.before.repo.js` (referencia congelada de d9e67ac, solo import relativo adaptado).
- `capaServidor/test/fixtures/opt07/second-pass/reportFixture.js`
- `docs/OPT-07_SEGUNDA_PASADA.json`

Sin archivos productivos eliminados. Verificador responsive generado temporalmente desde `scripts/verify-page-layout.mjs`, con API sintética y controles adicionales; se retira al terminar. Sus resultados se conservan en el JSON nuevo.

Primera implementación, modificados:

- `capaServidor/src/modules/metrics/repo/metrics.repo.js`
- `capaVista/src/modules/metrics/api/metricsApi.js`
- `capaVista/src/modules/metrics/components/ProductionPerformance.jsx`
- `capaVista/src/modules/metrics/pages/MetricsPage.jsx`
- `capaVista/src/modules/metrics/utils/metricsPage.js`
- `capaVista/src/modules/metrics/utils/reportFormatting.js`

Primera implementación, creados:

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

La segunda intervención no cambia estas limitaciones. El fixture SQL sintético de cinco pedidos demuestra semántica en MySQL, **no planes a escala**. La selección correlacionada puede ordenar candidatos por pedido; requiere una prueba de volumen en MySQL aislado antes de certificar comportamiento productivo con historias masivas. No se introducen índices sobre datos empresariales para forzar un resultado.

MySQL remoto mantiene un costo de recorrido cercano a cientos de milisegundos por consulta; no se cambió infraestructura. El conjunto real observado es pequeño. Cinco muestras por serie no certifican percentiles ni carga sostenida. Las series se ejecutaron secuencialmente; el entorno no garantiza ausencia de actividad de otros usuarios.

Los volúmenes grandes prueban CPU, memoria aproximada, integridad y serialización en memoria, no ejecución física MySQL. No se inicializó ni pobló una base aislada para medir planes con 10.000 pedidos. UNION y subconsultas correlacionadas conservan riesgos de ordenamiento/escaneo a gran escala, explícitos en J. No se recomienda extrapolar tiempos linealmente ni desplegar índices a partir de estos datos.

Los servicios conservan límites y reglas existentes, incluidas sus diferencias: resumen filtra por fechas UTC/DATE de cada rama; desempeño aplica día chileno después del rango amplio. No se unificaron esas reglas. Una ordenación SQL sin desempate en el código anterior no definía un orden estable entre empates; las nuevas proyecciones lo explicitan con PK y coinciden con los casos de referencia medidos.

## Q. Conclusión

La segunda intervención elimina transferencias de reingresos no consumidos y reduce el trabajo local con historias grandes; no aporta una reducción relevante de latencia del mes pequeño ni elimina SELECT adicionales. Conserva los cuatro del resumen y el único de desempeño ya integrados. Las comparaciones reales/sintéticas coinciden exactamente; fechas, redondeos, autorizaciones y exportadores se conservan. Reintentos, rango inválido y ancho móvil quedan comprobados y corregidos.

Servicio actual: resumen 663,149 ms y desempeño 660,925 ms. HTTP protegido: 1.328,566/1.326,368 ms, todavía superior al objetivo; E2E real, SQL de volumen e impresión manual/Excel de escritorio siguen sin medición. Listo para revisión en desarrollo con los tres fallos previos separados; no certifica rendimiento productivo a escala. Sin commit, push ni despliegue.

Conclusión histórica de la primera implementación:

El resumen mejora **66,5 %** en la mediana de servicio y elimina **11 SELECT**; once hidrataciones separadas se sustituyen por proyecciones y JOIN, y no se descargan eventos ajenos al cálculo de flujo. Desempeño mejora **65,1 %** y elimina dos SELECT. Las métricas son exactamente equivalentes en los DTO reales y fixtures probados, con fechas, unidades, redondeos y reglas conservados. Las tres exportaciones mantienen el mismo contenido de referencia.

Cumplen un segundo las medianas medidas de servicio, derivación del gráfico y serialización local. HTTP protegido todavía supera el objetivo (1.331/1.240 ms); E2E real no está medido. Alcanzarlo requiere trabajo/infraestructura adicional sustentado en mediciones, sin retirar identidad ni exactitud.

El cambio está listo para revisión e integración en desarrollo, con los tres fallos previos separados y las limitaciones de volumen SQL y navegador real declaradas. No constituye una certificación de rendimiento productivo a escala. Sin commit, push ni despliegue.

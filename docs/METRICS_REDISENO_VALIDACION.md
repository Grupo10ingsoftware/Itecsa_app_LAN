# Rediseño de métricas — validación

Fecha: 2026-10-29. Alcance: presentación del módulo existente, sin cambios de backend, contratos, autenticación, permisos o dependencias.

## Correspondencia funcional

| Sección | Datos existentes | Representación |
| --- | --- | --- |
| Producción generada | `summary.production.products` y `total`; cantidades por fecha real de término de los detalles | Barras verticales dinámicas, nombres, cantidades y total |
| Rendimiento RF70 | `/metrics/production-performance`; último ingreso a Listo para entrega, fecha solicitada y zona America/Santiago | Tres barras: A tiempo, Fuera de plazo y sin fecha definida (`missingDeadline`), conforme al último ajuste autorizado. Consulta mediante Generar reporte en la cabecera; sin aviso de inconsistencia |
| Estadía | `summary.dwellTime.stages` y `subprocesses`; intervalos registrados de entrada/salida | Dos paneles con escalas independientes, duración, muestras y filtro por producto |
| Vendedores | `summary.sellerCompliance`; reglas existentes de notas, entregas y carga alta | Cinco columnas originales, búsqueda local insensible a tildes y páginas de diez filas |

Se mantienen los modos mes/rango, el límite inclusivo de 366 días, la cancelación de consultas obsoletas y el aislamiento por sesión. Estadía y vendedores comparten una cabecera expandible con flecha naranja. Rendimiento permanece visible, sin acordeón. La carga del resumen utiliza un único indicador compartido con alcance de página antes de mostrar las tarjetas. RF70 nunca se solicita automáticamente.

La búsqueda y paginación conservan el orden y los valores de la respuesta. CSV, Excel y PDF exportan **todos los vendedores del período**, incluso con una búsqueda activa; la interfaz lo indica. Las utilidades de escape HTML y protección de celdas no fueron modificadas.

## Archivos

- `capaVista/src/modules/metrics/pages/MetricsPage.jsx` y `.module.css`: distribución, filtros, estadía, integración de gráficos y tabla.
- `capaVista/src/modules/metrics/components/ProductionPerformance.jsx`: representación de RF70 y estados existentes.
- Nuevos `components/MetricsBarChart.jsx` y `components/SellerTable.jsx`: gráfico compartido por las dos tarjetas y tabla con controles locales.
- Nuevo `utils/metricsRedesign.test.jsx`: seis pruebas de la presentación, búsqueda, paginación, exportación completa y estados vacíos.
- `capaVista/verify/metrics.html` y `metricsFixtures.jsx`: escenario visual de desarrollo con datos sintéticos, sin llamadas al servidor. No forma parte de la entrada del build de producción.

## Verificaciones

- Frontend: `npm test -- src/modules/metrics`: **23 pruebas aprobadas**. Se actualizaron las expectativas de interacción y categorías conforme al ajuste solicitado; se preservaron las comprobaciones de consultas, cancelación, períodos y exportaciones.
- Backend: `node --test test/metricsPerformance.test.js test/metricsRefinement.test.js test/metricsSecurity.test.js`: **33 pruebas aprobadas**. Incluyen RF70, reingresos, fechas, zona horaria, equivalencia de cálculos y autorización de ambas rutas.
- `npm run lint` y `npm run build` del frontend: aprobados.
- Chromium headless: 1536, 1024, 768, 390 y 320 px; cuatro secciones desplegadas, reporte generado, búsqueda y cambio de página, sin desbordamiento de la página. Gráfico de 25 productos con nombres largos: todos presentes, desplazamiento interno. Estados vacío/error verificados. Sin errores JavaScript de página.
- Inspección de capturas de escritorio y móvil: tarjetas, etiquetas y valores legibles; paneles apilados en móvil. La tabla y los gráficos numerosos tienen desplazamiento horizontal propio y acceso por teclado.

## Límites

La revisión visual usa fixtures aislados. No constituye una prueba integral contra una base de datos real o el despliegue del cliente; los contratos y permisos se verificaron con las pruebas existentes. Se mantienen el PDF mediante impresión del navegador y el Excel tabulado `.xls` existentes.

Para reproducir la vista: iniciar el frontend y abrir `/verify/metrics.html`; expandir Estadía y Cumplimiento por vendedor y pulsar Generar reporte. Escenarios adicionales: `?scenario=empty`, `?scenario=error` y `?scenario=many`.

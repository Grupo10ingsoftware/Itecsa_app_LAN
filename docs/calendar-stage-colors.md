# Colores de etapas y calendario compacto

## Archivos de este ajuste

- `capaVista/src/styles/theme.css`: fuente única de colores de etapa (acento, texto y fondo). Pago mostaza, listo para producción naranja institucional, producción azul, entrega verde y revisión rojo intenso. Fondos claros y texto oscuro en las etiquetas.
- `capaVista/src/shared/orderStagePresentation.js`: correspondencia compartida de nombres, pasos, tokens y abreviaturas; no modifica estados del pedido.
- `capaVista/src/modules/kanban/utils/kanbanColumns.js`: reutiliza los tokens para los indicadores de las columnas. Antes Pago era naranja, Listo para Producción azul y En Producción ámbar.
- `capaVista/src/modules/kanban/utils/kanbanOrderMapping.js`: obtiene el indicador por ID de paso; revisión es el paso 6, por lo que usar la posición del array podía asignarle el color de respaldo azul. No cambia IDs, orden ni reglas de transición.
- `capaVista/src/modules/productionCalendar/components/CalendarEvent.jsx` y `CalendarOrderTrays.jsx`: asignan la etapa real a los indicadores y etiquetas de calendario, pendientes y bandeja temporal.
- `capaVista/src/modules/productionCalendar/components/ProductionCalendarGrid.module.css`: variables locales de etapa, etiqueta y borde lateral independientes del fondo especial; reglas de contenedor para presentación compacta.
- `capaVista/src/shared/orderStagePresentation.test.js`: seis casos que verifican concordancia entre calendario y estados del Kanban, incluida revisión y estados desconocidos.

## Responsividad y accesibilidad

La consulta `@container calendar (max-width: 720px)` responde al espacio del calendario, incluso si la ventana de escritorio es amplia. Reduce rellenos, altura mínima y ancho mínimo de la cuadrícula (28 rem). Se conserva el desplazamiento localizado en pantallas menores. Las tarjetas de celdas priorizan número y etapa abreviada; cliente, productos y nombre completo de etapa permanecen accesibles a lectores de pantalla. El detalle mediante doble clic sigue disponible y las tarjetas de pendientes conservan su información visible completa. No hay detección mediante JavaScript ni dependencia exclusiva del color o hover.

Las etiquetas especiales mantienen sus fondos originales y prioridad contrato sobre urgencia. El borde lateral y la etiqueta muestran la etapa, incluso durante hover/foco. No se alteran los manejadores de arrastre, touch-action, sensores, permisos, endpoints ni persistencia.

## Verificaciones y limitaciones

- 58 pruebas aprobadas en ocho archivos: calendario, Kanban y nueva correspondencia compartida.
- ESLint y compilación Vite aprobados.
- Comprobación del diff sin errores de espacios (Git avisa de normalización LF/CRLF).
- No se certifica la ausencia visual de desbordamientos o superposiciones: no se realizó inspección en navegador en esta tarea. Sigue pendiente la revisión manual en escritorio y móvil y el gesto de arrastre real.

Posible causa de la incidencia móvil, sin modificación: el calendario utiliza `draggable`/DataTransfer nativos de HTML y Kanban utiliza `@dnd-kit/react`. El soporte táctil de ambos mecanismos puede diferir, incluida la emulación DevTools; no se confirmó esta hipótesis en un dispositivo físico.

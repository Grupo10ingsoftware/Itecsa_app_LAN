# Rediseño del Calendario de Producción

## Cambios y archivos

Rutas relativas a `capaVista/src/modules/productionCalendar/`:

| Archivos | Cambio |
| --- | --- |
| `components/ProductionCalendarGrid.jsx` y `.module.css` | Bandeja superior horizontal, calendario principal y pendientes a la derecha; paneles apilados en pantallas estrechas y desplazamiento horizontal localizado en la cuadrícula. Tarjetas compactas, textos ajustables y encabezados oscuros. |
| `components/CalendarOrderTrays.jsx` | Pendientes en una sola columna, indicador de arrastre según permisos, contador e instrucciones de la bandeja; etapa real también en pedidos trasladados. |
| `components/CalendarToolbar.jsx` y `.module.css` | Anterior, mes y año, siguiente y Hoy. Sin vistas adicionales. |
| `pages/ProductionCalendarPage.jsx` y `.module.css` | Integración de Hoy, variables compartidas y errores de carga mediante Toast. |
| `utils/calendarPresentation.js` | Corrección de la etapa mostrada, independiente de la fecha programada. |
| `components/CalendarOrderDetailModal.jsx` | Errores de detalle comunicados mediante Toast. |
| `components/DeliveryChangeModals.jsx` | Uso del modo Toast del modal PIN existente. |
| `components/CalendarRedesign.test.jsx` y `DeliveryLoading.test.jsx` | Regresión de etapas, etiquetas, navegación, permisos, bandeja, confirmación, PIN y errores. |

`capaVista/verify/calendar.html`, `calendarScene.html` y `calendarFixtures.jsx` proporcionan una vista local con datos sintéticos y anchos de 1600, 1024 y 390 px. No persiste datos ni valida un PIN real; sirve para revisar la presentación con los componentes reales.

## Reutilización e identidad visual

Se conservan PageShell, PageSurface, CalendarHeader y su encabezado compartido, CalendarFilters, CalendarEvent, los modales de confirmación y PinAuthorizationModal, junto con ToastProvider/useToast. No se incorporan dependencias.

Los colores institucionales proceden de `src/styles/theme.css`: negro `--page-header-black`, blanco `--page-white`, naranja `--page-brand-orange` (#FE5A00), fondo `--page-background` y borde `--page-border`. Los patrones de superficies, radios y sombras siguen Gestión de Usuarios y Confirmación de Pago.

## Etapas y etiquetas

La causa estaba en `formatScheduleState`: sustituía la etapa por un texto de programación cuando faltaba fecha o esta no era laborable. Ahora utiliza `getCalendarOrderStatus`, la normalización existente, con la etapa recibida y el respaldo por paso del pedido. No modifica datos ni transiciones.

Se conserva `getOrderToneClass` y su prioridad: contrato antes que urgencia. Urgencia mantiene fondo #fef08a y borde #eab308; contrato mantiene fondo #fecaca y borde #ef4444. La etapa se muestra por separado y no determina el color especial.

## Funcionalidad y validación

Se mantienen los controladores de drag and drop, las restricciones de días laborables, filtros, permisos y llamadas existentes de persistencia. Llevar un pedido a la bandeja no cambia su fecha: la actualización sigue ocurriendo al confirmar el destino y autorizar mediante PIN. La bandeja conserva los pedidos entre meses y ante cancelaciones o errores.

- 21 pruebas pertinentes aprobadas, en tres archivos (calendario y modal PIN compartido).
- ESLint aprobado.
- Compilación de producción Vite aprobada.
- `git diff --check` sin errores de espacios.
- Pruebas automatizadas cubren etapa con y sin fecha, colores y precedencia, permisos, carga, navegación, conservación de la bandeja al cambiar de mes, cancelación, PIN incorrecto y posterior guardado.

No se ejecutó una revisión visual en navegador: el acceso a la ventana agotó su autorización y el navegador integrado no estaba disponible. Por tanto, no se certifican visualmente ausencia de superposiciones, overflow ni gestos de arrastre en dispositivos físicos. Tampoco se realizó una escritura contra el backend real; la persistencia se comprobó mediante los callbacks de las pruebas. La vista sintética puede abrirse con el servidor Vite en `/verify/calendar.html`.

# Banners y espaciado exterior del frontend ITECSA

Implementación local del 26 de octubre de 2026. Rama `mysqlLAN`; base de trabajo `5525f55`. No se realizaron commits, pushes, reconstrucciones de los servicios de aplicación ni despliegues durante esta tarea.

## A. Inspección y arquitectura compartida

Se contrastaron la imagen aprobada y el inventario de 14 rutas de la especificación con el repositorio actual. El commit de referencia `8ac63f64027b529174382934535463ea5db282e2` existe. Las 14 rutas siguen presentes. Los cambios posteriores incluyen la integración de Keycloak, credenciales de pagos y operaciones de creación/edición de usuarios; se conservaron. Git estaba limpio al comenzar. No se encontraron instrucciones `AGENTS.md` aplicables.

Componentes comunes en `capaVista/src/shared/components/layout/`:

- `PageShell.jsx`: padding exterior, centrado y límite de ancho configurable. No recibe información de negocio ni calcula el ancho del sidebar.
- `PageSurface`, exportado desde el mismo archivo: sección blanca con borde y radio comunes para las composiciones continuas. Conserva los atributos de sus consumidores, incluido `inert`.
- `PageHeader.jsx`: título `h1`, franja inferior, zona de acciones por composición y espacio opcional para información funcional. No implementa callbacks de negocio.
- `PageShell.module.css`: geometría y tipografía compartidas. Las consultas de contenedor están limitadas al wrapper de la cabecera. El cuerpo no establece contención que pueda desplazar sus modales con posición fija.

Se reutilizaron `OrderCreateHeader`, `CalendarHeader` y `PrivacyPageHeader` como adaptadores pequeños de la cabecera compartida. No se creó un `PageBody` obligatorio. Los cuerpos, grids y componentes interiores conservan sus propios padding y controles. En `Layout.module.css` solo se añadió el fondo neutro de `mainContent`, para cubrir también el espacio restante bajo páginas cortas. `AppLayout.jsx`, Sidebar y Topbar no se modificaron.

La infraestructura se comprobó con pruebas, lint y build antes de migrar consumidores. Después se migraron Registro de pedido y Calendario, se verificaron 34 escenarios de navegador y se continuó individualmente con los demás módulos.

## B. Inventario de las 14 páginas

Las rutas de archivos de esta tabla son relativas a `capaVista/src/modules/`. Además, todas utilizan los componentes y tokens compartidos descritos arriba.

Pruebas por página: **U** = renderizado de la página real con API/identidad sintéticas en `PageMigration.test.jsx`; **V** = 17 combinaciones de resolución/sidebar, título largo y zoom CSS en navegador; **A** = comparación del AST con `5525f55`, que verifica código fuera del JSX, eventos, props de componentes interiores y condiciones `disabled`/`inert`. Las verificaciones funcionales adicionales se detallan en H.

| ID y ruta | Caso y banner anterior | Estructura aplicada y elementos conservados | Archivos modificados | Pruebas y estado |
| --- | --- | --- | --- | --- |
| H01 `/kanban` | B. Negro con categoría, descripción y carga operativa. | PageShell + PageSurface + PageHeader. Se conserva íntegro el indicador, porcentaje, cantidades, nivel, botón, condición de permiso y modal de configuración; tablero y filtros sin reconstruir. | `kanban/pages/KanbanBoardPage.jsx`, `KanbanBoardPage.module.css` | U, V, A; migrada. Apertura del modal probada. |
| H02 `/ordenes/nuevo` | A. Banner negro integrado al cuerpo y categoría Ventas. | PageShell + PageSurface + OrderCreateHeader → PageHeader. Formulario, prioridad, acciones, modal e `inert` conservados. | `orders/pages/OrderCreatePage.jsx`, `OrderCreatePage.module.css`, `orders/components/OrderCreateHeader.jsx`; eliminado su CSS exclusivo. | U, V, A y piloto; migrada. Estado de éxito excluido del nuevo banner. |
| H03 `/pagos` | A. Negro con categoría Cobranzas. | PageShell + PageSurface + PageHeader. El contenedor inmediato del resumen neutraliza sus márgenes exteriores negativos de Bootstrap para mantener visible la franja. Resúmenes, filtros, estados, tablas, listas móviles y modales conservados. | `payments/pages/PaymentConfirmationPage.jsx`, `PaymentConfirmationPage.module.css` | U, V, A; migrada. |
| H04 `/historial-pedidos` | B. Negro alternativo con descripción y contador. | PageShell + PageSurface + PageHeader. Contador original en acciones; filtros, búsquedas, fechas, tabla, enlaces y paginación conservados. | `orderHistory/pages/OrderHistoryPage.jsx`, `OrderHistoryPage.module.css` | U, V, A; migrada. Contador cargado y enlace al detalle probados. |
| H05 `/historial-pedidos/:orderId` | B. Negro alternativo con identificador, cliente y regreso. | PageShell + PageHeader; tarjetas separadas. Se mantienen el identificador como título, el cliente como dato funcional y el enlace Volver. Productos, resumen y eventos intactos. | `orderHistory/pages/OrderHistoryDetailPage.jsx`, `OrderHistoryDetailPage.module.css` | U, V, A; migrada. También se probó la excepción de error sin banner. |
| H06 `/calendario-produccion` | B. Negro con categoría, descripción y botón de filtros. | PageShell + PageSurface + CalendarHeader → PageHeader. Mismo callback y estado del botón. Grilla, bandejas, cambios de mes, drag and drop y modales conservan sus componentes y props. | `productionCalendar/pages/ProductionCalendarPage.jsx`, `ProductionCalendarPage.module.css`, `productionCalendar/components/CalendarHeader.jsx`, `CalendarHeader.module.css` | U, V, A y piloto; migrada. Ambos estados del botón y conservación del foco probados. |
| H07 `/metricas` | A. Negro con categoría y descripción. | PageShell + PageSurface + PageHeader. Gráficos, filtros de periodo, paneles, indicadores y exportación conservados. | `metrics/pages/MetricsPage.jsx`, `MetricsPage.module.css` | U, V, A; migrada. |
| H08 `/mensajes` | C. Cabecera clara, título y tarjeta de total. | PageShell de 78rem + PageHeader; bloques separados. Total y etiqueta accesible preservados, junto a filtros, mensajes y paginación. | `messages/pages/MessageInboxPage.jsx`, `MessageInboxPage.module.css` | U, V, A; migrada. Navegación de apertura y regreso probada. |
| H09 `/mensajes/:messageId` | C. Sin banner general; asunto dentro del artículo. | PageShell de 56rem + PageHeader «Detalle del mensaje» cuando hay contenido. Asunto, fecha, estado, cuerpo y pedido relacionado permanecen dentro del artículo. Se conserva Volver a la bandeja. | `messages/pages/MessageDetailPage.jsx`, `MessageDetailPage.module.css` | U, V, A; migrada. Datos del artículo, enlace y excepción de error probados. |
| H10 `/admin/usuarios` | B. Negro con categoría, descripción y aviso de autorización. | PageShell + PageHeader; bloques separados. El banner muestra solo el título; el aviso con `role=status` se conserva en el cuerpo junto a los controles. PIN, condiciones, resúmenes, filtros, tabla, permisos y modales conservados. | `users/pages/UserManagementPage.jsx`, `UserManagementPage.module.css` | U, V, A; migrada. Aviso operativo, control Crear usuario y reintento de error de resumen comprobados. |
| H11 `/perfil` | A. Negro alternativo con categoría y descripción. | PageShell de 90rem + PageHeader. Se mantienen tarjetas, datos personales, actividad, PIN y recuperación existentes. | `profile/pages/ProfilePage.jsx`, `ProfilePage.module.css` | U, V, A; migrada. |
| H12 `/documentos` | A. Banner negro compartido con categoría e introducción. | PageShell + PrivacyPageHeader → PageHeader. Tarjetas, carga, error, reintento y disponibilidad de documentos conservados. | `privacy/pages/DocumentsPage.jsx`, `privacy/components/PrivacyPageHeader.jsx`, `privacy/pages/PrivacyPages.module.css` | U, V, A; migrada. |
| H13 `/solicitudes` | B. Negro compartido con categoría, introducción e indicación de atención. | PageShell + PrivacyPageHeader → PageHeader. El banner muestra solo el título; la indicación de revisión y respuesta por correo pasa al cuerpo. Formulario, disponibilidad y tipos de solicitud conservados. | `privacy/pages/DataRequestsPage.jsx`, `privacy/components/PrivacyPageHeader.jsx`, `privacy/pages/PrivacyPages.module.css` | U, V, A; migrada. Indicación operativa probada. |
| H14 `/reportar-incidente` | A. Negro compartido con categoría y presentación. | PageShell + PrivacyPageHeader → PageHeader. Formulario, contacto, disponibilidad, errores, reintento y tipos de incidente conservados. | `security/pages/IncidentReportPage.jsx`; adaptador y CSS comunes de privacidad. | U, V, A; migrada. |

## C. Páginas sin banner y excepciones

Bandeja de entrada transforma exclusivamente su cabecera de página clara y mantiene la tarjeta del contador como acción lateral. El detalle de mensaje añade un título general independiente; su asunto cambia de `h1` a `h2`, conservando exactamente las declaraciones visuales que tenía ese asunto. El encabezado oscuro del artículo sigue siendo contenido del mensaje y no recibe el banner ni la franja de página.

Los estados iniciales de carga y error del detalle de historial conservan su composición sin banner. En el detalle de mensaje tampoco se añade banner durante carga/error sin mensaje. Las pruebas comprueban los enlaces de regreso y la ausencia del banner en los errores.

El estado exitoso de registro de pedido conserva su componente y geometría anterior mediante `successPage`, junto a las variables que ya necesitaba. Al sustituir los wrappers afectados, se eliminaron los `main` anidados; el `main` de AppLayout sigue siendo el único principal. Login, recuperación de contraseña y acceso denegado no se migraron.

## D. Elementos funcionales protegidos

- Calendario: botón Mostrar/Ocultar filtros, su estado y callback; calendario, navegación mensual, bandejas, drag and drop y modales.
- Kanban: porcentaje, cantidades, capacidad, texto operativo, colores semánticos de carga, permiso de configuración, evento de apertura y modal.
- Historial: contador calculado con `orders.length`, filtros, búsqueda, paginación y enlaces de detalle/regreso.
- Usuarios: información de autorización con PIN, estados y errores, permisos, acciones, edición, creación y modales.
- Mensajes: contador accesible, filtros, paginación, apertura, marcación de lectura existente, regreso, asunto, fecha, estado, cuerpo y pedido relacionado.
- Pedidos, Pagos, Métricas, Perfil, Documentos, Solicitudes e Incidentes: todos los componentes interiores mantienen sus props funcionales, operaciones y condiciones.

No se cambiaron hooks, APIs, endpoints, contratos, permisos, autenticación, Keycloak ni backend. La comparación de AST de las 14 páginas pasó frente a la base `5525f55`; es una comprobación estructural y no sustituye la ejecución de operaciones reales.

## E. Espaciado exterior

PageShell utiliza 20px por cada lado y 20px verticales. Su frame aprovecha el ancho asignado por AppLayout y se centra al alcanzar 1760px. El espacio adicional de centrado se distribuye simétricamente, sin contarlo como padding. Los límites específicos se conservan: Perfil 90rem, Bandeja 78rem y detalle de mensaje 56rem.

No hay cálculos que descuenten nuevamente el sidebar. AppLayout mantiene sus anchos de 16.5rem y 4.75rem, y su superposición móvil. Se retiraron los cálculos de altura exterior basados en `100vh - 4.5rem` de Perfil y Mensajes. El fondo de main utiliza la misma superficie neutra aunque el Topbar tenga una altura distinta.

El banner utiliza 32px horizontales cuando su contenedor alcanza 640px; por debajo, 20px. Los cuerpos conservan sus padding y reglas responsive previas. No se añadió padding global a formularios, tablas ni tarjetas. En Registro se normalizó únicamente el lienzo inmediato a blanco y sus esquinas inferiores al radio común.

## F. Tipografía y tokens

Definidos en `capaVista/src/styles/theme.css`:

| Token | Valor |
| --- | --- |
| `--page-header-black` | `#000000` |
| `--page-brand-orange` / `--page-brand-orange-rgb` | `#FE5A00` / `254, 90, 0` |
| `--page-white` | `#FFFFFF` |
| `--page-background` | `#F5F6F8` |
| `--page-border` | `#D9DEE5` |
| `--page-space-x` / `--page-space-y` | `20px` / `20px` |
| `--page-max-width` | `1760px` |
| `--page-radius` | `16px` |
| `--page-stripe-size` | `4px` |
| `--page-header-space-x` / `--page-header-space-x-small` | `32px` / `20px` |
| `--page-header-space-y` / `--page-header-gap` | `24px` / `24px` |
| `--page-header-min-height` | `100px`; sin altura fija máxima |
| `--page-title-small` / `medium` / `large` | `24px` / `36px` / `48px` |
| `--page-font-family` | `Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` |

Los títulos usan peso 700, mayúsculas, line-height 1.15 y letter-spacing 0.02em. Las consultas de contenedor aplican 36px desde 640px de ancho real y 48px desde 1024px. Un detalle de lectura estrecho puede conservar 36px aun en un monitor amplio. Los títulos pueden ocupar varias líneas y partir identificadores largos; no llevan elipsis ni recorte.

No se encontró Inter empaquetada y no se añadieron fuentes, dependencias ni solicitudes a servicios externos. Se conserva el fallback del proyecto. Los tokens antiguos que utilizan los componentes internos permanecen; no se modificaron los colores semánticos de tablas, gráficos, alertas o estados. Los acentos propios del banner, incluido el contador del historial, usan el naranja corporativo compartido.

## G. Estilos reemplazados

Se comprobaron los consumidores antes de retirar reglas:

- Eliminado `orders/components/OrderCreateHeader.module.css`: sus clases `hero`, `heroInner`, `sectionLabel` y `pageTitle` ya no tienen consumidor.
- `CalendarHeader.module.css`: retiradas `hero`, `sectionLabel`, `pageTitle`, `pageSubtitle` y sus media queries; se mantiene el botón funcional, con acento corporativo y foco visible.
- CSS de Kanban, Pagos, Métricas y Usuarios: retiradas las reglas exclusivas `hero`, `sectionLabel`, `pageTitle`, `pageSubtitle`, así como sus variantes responsive. Se conservaron las reglas de acciones, indicadores, componentes internos y modales.
- CSS de Registro, Calendario, Kanban, Pagos, Métricas, Usuarios, Historial y privacidad: retiradas las geometrías locales de padding/máximo/centrado reemplazadas por PageShell. En las superficies continuas se retiraron borde, radio y sombra exteriores duplicados, conservando las reglas de overflow existentes.
- Historial: el estilo del contador se conserva como `resultCount`; el panel deja de duplicar el borde exterior de PageSurface. Detalle: se conserva el estilo del regreso como `backLink`. La regla compartida con `.timelineSection header span` mantiene ese consumidor interno.
- Perfil: retiradas `header`, `sectionLabel`, `pageTitle`, el párrafo descriptivo y su geometría exterior. El grid `.shell` mantiene su gap y se traslada su límite a PageShell.
- Privacidad: retiradas `hero`, `eyebrow`, `hero h1`, `introduction p` y sus variantes de cabecera; formulario, tipos y documentos conservan sus reglas.
- Bandeja: retiradas la cabecera clara anterior y geometrías exteriores; se mantienen contador, filtros y paginación. Detalle: retirada solo la geometría de página; `.heading h1` se convierte en `.heading h2` con las mismas declaraciones visuales.
- En Métricas, `.panelEyebrow` se mantiene al separar el selector de la categoría retirada. No se limpiaron estilos históricos ajenos a los banners sustituidos.

## H. Pruebas y comandos

Ejecutados desde la raíz del repositorio:

```powershell
npm.cmd test --prefix capaVista
npm.cmd run lint --prefix capaVista
npm.cmd run build --prefix capaVista
node scripts/audit-page-layout-scope.mjs 5525f55
node scripts/verify-page-layout.mjs
git diff --check
```

- Vitest: **78 pruebas, 8 archivos, todas aprobadas**. Se incluyen las pruebas existentes y 29 pruebas nuevas: 3 de marco compartido, 2 de adaptadores piloto y 24 de páginas migradas.
- ESLint: aprobado.
- Build Vite: aprobado; sin dependencias nuevas ni cambios de package/lockfile.
- Auditoría de alcance: las **14 páginas** mantienen código fuera de JSX, eventos, props de componentes interiores y condiciones `disabled`/`inert` frente a `5525f55`.
- Revisión de navegador Edge sin interfaz: **238 escenarios de resolución/sidebar**, más pruebas de títulos largos y zoom CSS al 200% en cada página. Se validan colores calculados, franja de 4px, peso/tamaño de título, simetría, título y acciones dentro del banner, un solo main y ausencia de overflow exterior.
- Se comprobó el botón real de filtros y conservación del foco en Calendario. También se comprobó que el modal real de carga Kanban ocupa el viewport y no queda desplazado por PageShell.
- `git diff --check`: aprobado; Git solo informa advertencias habituales de conversión LF/CRLF.

Las pruebas de página montan los componentes reales y utilizan fixtures con datos sintéticos en `capaVista/verify/pageFixtures.js`. Todas las escrituras están deshabilitadas en ese cliente. La revisión visual abre una instancia temporal local de Vite, sustituye únicamente los hooks de identidad y cliente API en esa instancia y monta el AppLayout original. No modifica el router, autenticación ni servicios desplegados.

Para repetir una página: `node scripts/verify-page-layout.mjs calendar`. Para los pilotos: `node scripts/verify-page-layout.mjs orders,calendar`. El ejecutable de Edge puede configurarse mediante la variable `PAGE_REVIEW_BROWSER`; el valor predeterminado corresponde al Edge instalado en el equipo donde se verificó esta entrega.

Resultados y capturas generados, ignorados por Git: `capaVista/dist/page-layout-review/results.json` y `*-desktop.png` / `*-mobile.png`. Una nueva compilación puede limpiar estos artefactos; se regeneran ejecutando la revisión visual.

## I. Responsive y revisión visual

Por cada página se comprobaron 320, 360, 375, 390, 430, 576, 768, 992, 1024, 1200, 1440 y 1920px. Desde 992px se verificaron sidebar expandido y colapsado: 17 escenarios por página, 238 en total.

Se inspeccionaron capturas de los pilotos y de Kanban móvil, Solicitudes móvil, Bandeja de entrada y detalle de mensaje en escritorio. Se verificaron títulos largos, incluidos identificadores sin espacios; las acciones se envuelven sin ocultarse. Se probó Tab en cabeceras con enlaces/botones y mantenimiento del foco al alternar filtros. El zoom adicional utiliza CSS al 200%; no equivale a una prueba manual del menú de zoom de todos los navegadores.

Los scrolls interiores que ya pertenecían a calendarios, tablas o columnas Kanban se conservan. No se modificaron sus grids para hacerlos caber artificialmente en móvil.

## J. Límites de la verificación

- La matriz utiliza Edge/Chromium local y datos sintéticos. No se validó con Safari, Firefox ni dispositivos físicos.
- No se realizaron escrituras reales: registro de pedidos, confirmaciones de pago, cambios de usuario/PIN, envío de solicitudes/incidentes y cambios de calendario requieren sus pruebas integrales habituales con datos autorizados.
- El arrastre real de pedidos, todos los modales y cada combinación posible de permisos/datos no se automatizaron en esta tarea. Sus componentes, props y eventos permanecen intactos y se comprobó el alcance estructural de los cambios.
- El estado de registro exitoso se dejó fuera de la migración visual, según la especificación. Las excepciones de carga/error se mantuvieron.
- No se cambió el código del backend, Keycloak, autenticación, rutas, Sidebar ni Topbar; no se publicó esta implementación ni se generó un commit.

## Revisión de Solicitudes, Usuarios y Pagos

Tras la observación sobre subtítulos y naranja del banner:

- Solicitudes y Gestión de usuarios muestran únicamente el título en el banner. Las indicaciones operativas se conservan fuera de él, en el cuerpo, sin cambiar condiciones ni acciones.
- En Pagos, el resumen Bootstrap tenía márgenes negativos que cubrían la franja aunque el CSS del banner declaraba el color correcto. Se reprodujo el fallo en 320px y se corrigió únicamente su relación con el contenedor exterior mediante `summaryBoundary`; no se modificó `PaymentSummaryCards` ni sus tarjetas.
- La revisión del navegador ahora utiliza `elementFromPoint` en tres posiciones de la franja para detectar superposiciones, además de comprobar su color y grosor calculados.
- Las 24 pruebas focalizadas de migración aprobaron, incluidas las nuevas comprobaciones de banners sin subtítulos e indicaciones conservadas en el cuerpo. Las tres páginas aprobaron 51 combinaciones de resolución/sidebar con la franja visible, sin overflow exterior. La auditoría estructural de las 14 páginas volvió a aprobar.
- Lint y compilación aprobaron nuevamente. Las capturas y el resultado de esta revisión se conservaron en `dist/banner-review-corrections/`, ignorado por Git, antes de limpiar el directorio de compilación.

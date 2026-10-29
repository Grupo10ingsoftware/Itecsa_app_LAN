# Auditoría técnica y visual del sistema de filtros: estado actual

Fecha: 28 de octubre de 2026 (America/Santiago). Revisión: main, commit 83a3965, «Merge pull request #15 from Grupo10ingsoftware/optimizacion». Entregable informativo: no es una implementación ni una propuesta de arquitectura aprobada.

## 1. Resumen ejecutivo

Se reconstruyeron las interfaces y consultas de los seis módulos solicitados: Kanban, confirmación de pago, gestión de usuarios, historial de pedidos, calendario de producción y bandeja de entrada. El inventario distingue **22 controles de filtrado**, **un control de ordenamiento** y **cuatro mecanismos de navegación/desglose del calendario**. Cada extremo de un rango de fechas tiene ficha individual: dos controles, un mismo criterio temporal combinado. Los botones de opciones de un selector de estado se cuentan como un control de selección simple, no como filtros diferentes.

Se analizaron **116 archivos fuente o de configuración relevantes**, todos incluidos con fragmentos literales en el catálogo de la sección 15. El archivo global bootstrap-overrides.css está vacío y se registra como tal. El conteo no incluye paquetes de terceros, archivos generados, el adjunto de instrucciones ni este informe. La base compartida inventariada comprende **8 componentes utilizados** (PageShell, PageSurface, PageHeader, LoadingIndicator, LoadingAction, ToastProvider, RoleGuard y UserMovementsModal, este último reutilizado también por Perfil). Existen además dos campos compartidos disponibles, TextInput y SelectInput, que los filtros auditados no utilizan. Hooks, servicios y tokens se contabilizan separadamente de los componentes.

Los hallazgos principales son:

- No existe una barra de filtros compartida entre los seis módulos. Se comparten marco, cabecera, indicadores de carga, contexto de identidad y transporte HTTP; cada módulo construye sus propios controles.
- Tres interfaces mantienen siempre visibles sus filtros principales (pagos, historial y mensajes). Usuarios mantiene la búsqueda visible y oculta inicialmente estado/rol. Kanban y calendario ocultan inicialmente los criterios. No se encontró multiselección en estos filtros.
- Kanban diferencia borrador/aplicación mediante botón; historial y movimientos de usuarios confirman búsquedas por submit; pagos espera 250 ms; usuarios 350 ms; calendario aplica inmediatamente sobre datos locales. Esas diferencias son funcionales, no sólo visuales.
- Las fechas representan conceptos distintos: creación del pedido en pagos/historial, publicación del mensaje en bandeja y fecha estimada de término para cargar un mes de calendario. Sus límites UTC no deben confundirse con la fecha local de navegación del calendario.
- El criterio «Mixto» de Kanban no tiene la misma definición en cliente y servidor: el cliente cuenta tipos de producto, pero SQL exige un nombre que contenga «mixto». Es una incompatibilidad observable en el código; el efecto sobre datos reales no se verificó.
- Los filtros del calendario no se aplican a la bandeja de pendientes ni a los elementos ya trasladados a la bandeja temporal. Se documenta el alcance real y queda pendiente determinar si corresponde al diseño de negocio.
- Los naranjas institucionales tampoco son únicos: el marco usa #FE5A00, varios filtros siguen usando #f97316 y algunos estados de foco emplean otros valores literales. Las alturas mínimas de controles van desde 2.25rem para chips de usuarios hasta 3.35rem para búsqueda/fechas agrupadas de pago; no son alturas computadas.
- Hay diferencias de accesibilidad comprobables por código: Usuarios sí declara aria-expanded/aria-controls; Kanban y Calendario no. Historial muestra estado activo mediante clase, sin aria-pressed; pagos, usuarios y mensajes sí lo incluyen. Su impacto práctico con lectores de pantalla no se ensayó.

La auditoría es **estática**, con una comprobación adicional de funciones puras sobre un pedido sintético de Kanban. No hubo revisión visual en navegador ni consultas a datos reales. «Implementado» describe el código existente; «verificado» se reserva a lectura/cotejo concretos o a la ejecución pura expresamente indicada. No se han reparado los hallazgos.

## 2. Alcance y metodología

### 2.1. Restricciones y registro inicial

Se leyó íntegramente la solicitud adjunta. El estado inicial obtenido con git status --short --branch fue main...origin/main, sin cambios. No había un archivo AUDITORIA_FILTROS_ESTADO_ACTUAL.md preexistente. Se conservó en memoria una huella SHA-256 por cada uno de los **734 archivos versionados o no ignorados existentes**, para compararla al cerrar la tarea. Ese registro no es un archivo auxiliar y no inspecciona contenidos de secretos para el informe. Los directorios ignorados, como node_modules, no forman parte de esa comprobación de integridad.

No se hicieron fetch/pull, commits, instalaciones, formateos, migraciones, cambios de configuración, pruebas npm, builds ni arranques de servidores. No se crearon capturas, snapshots, fixtures ni scripts auxiliares. Las únicas operaciones de escritura de esta tarea corresponden al Markdown solicitado.

### 2.2. Investigación y criterio de inclusión

Se exploraron módulos, router, rutas, permisos, componentes compartidos, CSS Modules, estilos globales, hooks y adaptadores API; se buscaron términos filter, search, select, dropdown, date, range, status, reset, clear, toolbar, popover, modal y drawer. Se contrastó el uso de los controles en sus consumidores: un input de creación/edición de datos no se considera filtro.

Se siguió el flujo control → evento → estado → normalización → servicio → query/backend o predicado local → filas/tarjetas → estados de carga/error/vacío. La inspección secundaria incluyó detalle de historial, movimientos de usuarios, detalle de mensajes, notificaciones, paneles de Kanban y desgloses del calendario para evitar omisiones o clasificar acciones operativas como filtros.

Se extrajeron sólo secciones que explican esos flujos. Las secciones omitidas de archivos grandes son, principalmente, mutaciones, edición de pedidos, autorización PIN, configuración de carga productiva y estilos de formularios ajenos. Cada entrada del catálogo indica los intervalos incluidos y los omitidos. No se copió node_modules ni se consultaron servicios privados.

### 2.3. Evidencia y límites de verificación

| Nivel | Significado en este informe | Evidencia disponible |
|---|---|---|
| Implementado / coherencia estática | Hay control, estado, evento y consumidor identificables | Fuentes literales y rangos de la sección 15 |
| Verificado por lectura | Se cotejó un hecho del código, por ejemplo un valor CSS o un parámetro | No equivale a una prueba de interfaz |
| Verificado con función pura | Se ejecutó una función existente con datos sintéticos sin IO de negocio | Sólo normalización y predicado local de producto de Kanban |
| Posible problema | El código presenta una divergencia, riesgo o falta de contexto | Se precisa causa y alcance, sin corregirla |
| No verificado | Requiere navegador, backend, datos o decisión del negocio | No se presenta como ausencia de implementación |

La comprobación pura cargó únicamente kanbanOrderRules.js y sus dependencias de constantes/presentación con Node. Un pedido sintético con items Lanyard y Tarjeta produjo products=["lanyard","tarjeta"], mixedMatches=true, lanyardMatches=false y noFilterSortCount=1. No se ejecutó una suite de tests; no se escribió un archivo ni se contactó la API. El resultado no prueba la integración SQL de «Mixto».

La sesión no expone una herramienta de navegador/computer para inspeccionar la aplicación. No se abrió una sesión real ni se generó una escena de prueba, ya que ello podría crear archivos o marcar mensajes como leídos. Los tamaños son **declaraciones CSS**, en sus unidades originales, no mediciones DOM. Los selects y date pickers son nativos: su menú, ancho, tipografía de opciones y cierre dependen del navegador/SO. No hay afirmaciones de contraste WCAG, overflow real ni accesibilidad ensayada.

### 2.4. Trazabilidad y métricas

Los IDs KAN/PAG/USR/HIS/CAL/MSG identifican controles de filtro. MSG-O01 identifica ordenamiento; CAL-N01–N04 son navegación, no entran en el total de 22. Las fuentes S001–S116 permiten saltar a código y CSS incluidos en este mismo documento; no hace falta abrir el repositorio para entender los fragmentos. Los números de línea corresponden al commit indicado, con líneas contadas desde 1. No dependen del formato visual del editor.

## 3. Arquitectura general del frontend

### 3.1. Plataforma y estructura

[capaVista/package.json](#fuente-S063) declara React ^19.2.6, react-dom ^19.2.6, React Router ^7.15.1, Vite ^8.0.12, Bootstrap ^5.3.8, bootstrap-icons ^1.13.1, react-bootstrap ^2.10.10, keycloak-js 26.2.4 y @dnd-kit/react ^0.4.0. Se consignan rangos declarados, no se infiere la versión instalada ni la versión del servidor Keycloak. Vitest y Testing Library existen para validaciones del proyecto, pero no se ejecutaron en esta tarea. No se declara una librería de formularios, select avanzado, fechas o calendario; los filtros inspeccionados usan elementos HTML nativos y Date/Intl del navegador.

El frontend se organiza en src/modules/{kanban,payments,users,orderHistory,productionCalendar,messages}, con pages, components, hooks, api y utils. Los componentes son funcionales y usan useState, useEffect, useMemo, useRef y useCallback. No se encontró Redux/Zustand ni un store global de filtros en los módulos auditados. Las fábricas de API se memorizan por cliente de sesión; las pantallas de varios módulos se remontan por scope para aislar resultados.

### 3.2. Rutas, permisos y entrada

| Módulo | Ruta | Vista | Permiso comprobado en router |
|---|---|---|---|
| Kanban | /kanban | KanbanBoardPage | VIEW_KANBAN_MODULE → read:orders |
| Pagos | /pagos | PaymentConfirmationPage | VIEW_PAYMENTS_MODULE → read:payments |
| Usuarios | /admin/usuarios | UserManagementPage | MANAGE_USERS_VISUALLY → manage:users |
| Historial | /historial-pedidos | OrderHistoryPage | read:orders |
| Detalle historial | /historial-pedidos/:orderId | OrderHistoryDetailPage | read:orders |
| Calendario | /calendario-produccion | ProductionCalendarPage | read:production-calendar |
| Bandeja | /mensajes | MessageInboxPage | read:own-messages |
| Detalle mensaje | /mensajes/:messageId | MessageDetailPage | read:own-messages |

Evidencia: [capaVista/src/app/router.jsx:43–109](#fuente-S065), [capaVista/src/config/permissions.js](#fuente-S067), [capaVista/src/config/routes.js](#fuente-S066). Los primeros cinco módulos tienen entrada en MAIN_NAVIGATION_ROUTES del menú lateral. Mensajes está en HEADER_NAVIGATION_ROUTES, con bi-envelope-paper y permiso de lectura propia. NavigationMenu filtra entradas por permisos/roles: eso es autorización de navegación, no un filtro de registros del usuario. RoleGuard también restringe la vista y los endpoints vuelven a autorizar.

La política [shared/authorization.js](#fuente-S070) respalda la existencia de Producción, Ventas, Cobranzas, Gerencia, Desarrollador y Soporte. No se inventan necesidades de departamentos adicionales. manage:users corresponde a roles administrativos de soporte/desarrollo; manageableRoles ofrece seis roles asignables, excluyendo Gerencia, Soporte y Desarrollador. Las inferencias sobre por qué localizar datos son explícitas en cada módulo.

### 3.3. Estilos y herencia

[capaVista/src/main.jsx:1–9](#fuente-S064) importa, en este orden, Bootstrap, Bootstrap Icons, global.css, bootstrap-overrides.css y theme.css. El archivo de overrides está vacío. CSS Modules se importa por componente: la carga efectiva de sus reglas puede depender de chunks/rutas, pero sus clases locales evitan colisiones nominales entre módulos. Algunos selectores :global sólo personalizan clases Bootstrap.

global.css asigna Inter/system-ui/-apple-system/BlinkMacSystemFont/"Segoe UI"/sans-serif al body y font:inherit a button, a, input, select y textarea. No se encontró carga de una fuente Inter en los archivos globales inspeccionados: su disponibilidad local no está certificada. No se convierte rem a px sin conocer font-size raíz computado. Bootstrap aporta estilos de elementos y clases form-control/form-select/visually-hidden; no se copia código de terceros. Los controles nativos sin clase Bootstrap conservan parte del estilo de plataforma.

PageShell limita el marco a --page-max-width:1760px con padding 20px. Bandeja lo sobreescribe a 78rem y detalle de mensaje a 56rem. El sidebar consume 16.5rem o 4.75rem en escritorio; bajo 991.98px el área ocupa 100%. Por eso un breakpoint de ventana no equivale al ancho disponible dentro de cada filtro. El PageHeader usa además container queries de 40rem/64rem.

### 3.4. Transporte y estados

[capaVista/src/hooks/useApiClient.js](#fuente-S072) memoiza createApiClient con getAccessToken y vigencia de sesión. [capaVista/src/services/api/apiClient.js](#fuente-S074) resuelve base URL pública configurada, agrega bearer internamente, limita cada solicitud a 45 000 ms por defecto, combina AbortSignal externo con timeout y verifica la sesión antes/después de leer la respuesta. Se documentan los nombres, nunca valores de tokens o secretos.

Todos los adaptadores serializan parámetros con URLSearchParams; no comparten actualmente una única función de queryString. Kanban/historial/pagos usan cursores y limit=50. Usuarios usa page/perPage=10; mensajes page/perPage=12; calendario solicita páginas de 100 hasta agotarlas. La parte servidor usa Express, Prisma y consultas MySQL parametrizadas. Los prefijos reales de ruta /api se montan en server.js; las rutas de los adaptadores se concatenan con apiBaseUrl.

La persistencia de criterios es estado de componente, sin enlace de filtros a search params, localStorage ni sessionStorage en las implementaciones auditadas. Cerrar un panel conserva el estado de su propietario; salir de una página y desmontarla lo reinicia. No se confunde restauración de historial del navegador con persistencia programada.

## 4. Inventario global de filtros

| ID | Módulo/pantalla | Control individual | Estado / parámetro | Origen del resultado |
|---|---|---|---|---|
| KAN-F01 | Tablero | Número de pedido | draftFilters.salesNoteNumber → appliedFilters → search | Servidor + predicado local |
| KAN-F02 | Tablero | Nombre del cliente | draftFilters.clientName → appliedFilters → search | Servidor + predicado local |
| KAN-F03 | Tablero | Tipo de producto | draftFilters.productType → productType | Servidor + clasificación local |
| PAG-F01 | Confirmación | Estado de pago | activeFilter → status | Servidor |
| PAG-F02 | Confirmación | Desde, creación | dateFrom → from | Servidor |
| PAG-F03 | Confirmación | Hasta, creación | dateTo → to | Servidor |
| PAG-F04 | Confirmación | RUT/NV/cliente | searchTerm → settledSearch → search | Servidor |
| USR-F01 | Gestión | Búsqueda de usuario | searchTerm → debouncedSearchTerm → search | BD local ligada a Keycloak |
| USR-F02 | Gestión | Estado de vínculo | activeStatus → estadoUsuario | Servidor |
| USR-F03 | Gestión | Rol | activeRole → rolUsuario | Servidor |
| USR-F04 | Modal movimientos | Identificador/detalle | search → query.search | Servidor, usuario concreto |
| HIS-F01 | Lista historial | Estado actual | status → status | Servidor |
| HIS-F02 | Lista historial | NV/cliente | searchInput → search | Servidor |
| HIS-F03 | Lista historial | Desde, creación | dateRange.from → from | Servidor |
| HIS-F04 | Lista historial | Hasta, creación | dateRange.to → to | Servidor |
| HIS-F05 | Detalle historial | Tipo de registro | type → type | Servidor, pedido concreto |
| CAL-F01 | Calendario | NV/cliente/producto | filters.search | Local, colección mensual |
| CAL-F02 | Calendario | Estado | filters.status | Local, colección mensual |
| CAL-F03 | Calendario | Producto | filters.productType | Local, colección mensual |
| MSG-F01 | Bandeja | Estado de lectura | filters.status → status | Servidor, mensajes propios |
| MSG-F02 | Bandeja | Desde, publicación | filters.from → from | Servidor |
| MSG-F03 | Bandeja | Hasta, publicación | filters.to → to | Servidor |

| ID auxiliar | Control | Clasificación y motivo |
|---|---|---|
| MSG-O01 | Últimos / Más antiguos | Ordenamiento; cambia la secuencia, no el conjunto lógico que cumple los predicados |
| CAL-N01 | Mes anterior | Navegación de período; cambia el rango que se carga |
| CAL-N02 | Mes siguiente | Navegación de período; mismo mecanismo con offset +1 |
| CAL-N03 | Hoy | Navegación al primer día del mes actual local |
| CAL-N04 | +N pedidos más | Desglose/modal del día seleccionado; no crea un criterio nuevo de búsqueda |
| Sin ID de filtro | Cargar más, Anterior/Siguiente, números de página | Continuidad de resultados conservando los criterios |
| Sin ID de filtro | Configurar carga productiva, mover tarjeta, confirmar/rechazar pago, crear/editar usuario | Acciones operativas que pueden escribir datos; fuera de ejecución |
| Sin ID de filtro | Campana, abrir/limpiar notificaciones, abrir mensaje | Navegación/acciones de lectura con posibles efectos persistentes, no filtros de bandeja |
| Sin ID de filtro | Etapas del tablero, prioridad, días hábiles | Restricciones/clasificación automáticas, documentadas en contexto; no hay controles de responsable/subproceso/urgencia en KanbanFilters |

## 5. Auditoría completa de Kanban

### 5.1. Contexto, alcance y contenedor

El módulo presenta pedidos distribuidos por etapas, tarjetas, indicadores y acciones de producción. La ruta requiere read:orders; el movimiento y otras mutaciones añaden permisos propios. El propósito de los filtros se infiere del texto «Busqueda de ordenes» y del predicado sobre tarjetas: localizar órdenes por NV, cliente y composición de producto. No hay controles de responsable, fecha, subproceso, etiqueta, urgencia o estado elegible en KanbanFilters. Las columnas ya separan etapas, y el orden automático prioriza solicitudes de desconfirmación de pago en Listo para producción, contrato, urgencia y producción en las columnas pertinentes; esos criterios son lógica estructural, no filtros manipulables.

La cabecera principal PageHeader «Kanban» incluye Carga Operativa. Debajo, en el contenido, hay otro contenedor independiente negro con eyebrow «Busqueda de ordenes», h2 «Filtros del tablero» a la izquierda y botón bi-funnel «Mostrar filtros» a la derecha. Inicialmente sólo se ve esa franja; showFilters=false. Al pulsar se inserta filterCard **en el flujo normal del documento**, debajo de la franja; no es modal, dropdown, popover ni drawer y no usa portal. No se define posición flotante, z-index, altura máxima ni scrollbar para el panel.

El botón cambia a «Ocultar filtros». Sólo alterna showFilters; no aplica ni borra. No hay listeners de Escape ni clic exterior. El estado draftFilters reside en KanbanFilters, que permanece montado al cerrar la tarjeta; appliedFilters vive en KanbanBoardPage. Al reabrir se conservan los borradores; por ello pueden diferir de los resultados si aún no se pulsó Aplicar. No hay badge ni resumen de criterios aplicados cuando se oculta.

Orden: número → cliente → producto → fila inferior de Aplicar filtros / Limpiar alineada a la derecha. No hay form de búsqueda ni submit por Enter. «Limpiar» borra también el filtro aplicado aunque el usuario tuviera un borrador sin enviar. Configurar carga operativa es otra acción de la cabecera y no depende de estos filtros. Su contador se obtiene por API separada: no representa el número de tarjetas que cumplen los criterios.

### 5.2. Perfil visual V-KAN

Fuentes: [capaVista/src/modules/kanban/styles/Kanban.module.css:1–168,1343–1423](#fuente-S008), [capaVista/src/modules/kanban/pages/KanbanBoardPage.module.css:1–20](#fuente-S009). Variables locales --kanban-border #e5e7eb, --kanban-orange #f97316, rgb249,115,22, --kanban-muted #64748b y --kanban-text #111827.

| Pieza | Valores declarados / estados |
|---|---|
| filtersShell | Fondo #fff; borde1px solid --kanban-border; radio .85rem; sombra 0 14px 32px rgba(15,23,42,.045); overflow:hidden; anchura/altura automáticas |
| filtersTopbar | Flex, center/space-between, gap1rem, mínimo3.5rem, padding .9rem 1rem, #000/#fff |
| h2 / eyebrow | h2 .92rem/850, tracking .055em, uppercase, margin0; eyebrow .72rem/850, tracking .075em, line-height1, margen inferior .28rem, naranja |
| Mostrar/Ocultar | Mínimo2.55rem; padding .55rem .9rem; radio .55rem; peso780; gap .45rem; fondo rgba(naranja,.14), borde1px rgba(naranja,.38), texto blanco; hover/focus naranja/texto#111 y outline:none |
| filterCard / grid | Padding1rem; grid **5 columnas** minmax(0,1fr) para **3 controles** presentes; gap1rem; ancho/alto automáticos; animación filterEnter .18s ease-out, opacity0→1 y translateY(-.4rem)→0 |
| Inputs/select | Mínimo3rem, borde1px #d7dee8, radio .55rem, color --kanban-text; foco borde naranja y sombra0 0 0 .22rem rgba(naranja,.18); padding y tamaño base no redefinidos por este módulo (Bootstrap) |
| Label | Grid gap .45rem, margin0; span .78rem/850, tracking .055em, uppercase, muted |
| Acciones | Flex wrap, gap .75rem, margin-top1rem, justify-content:flex-end; mismos mínimo/padding/radio que toggle; Aplicar #000/#fff, hover naranja/#111; Limpiar #fff/borde#d3d9e2/#111, hover borde y texto naranja |
| Transiciones | background/border/shadow/color/transform .15s ease en botones; translateY(-1px) en hover; inputs border/shadow .15s |
| Responsive | ≤1199.98px: grid2 columnas; ≤767.98px: barra vertical, grid1 y los tres botones a width100%; no se ocultan filtros, sólo depende de showFilters |

No hay reglas específicas :disabled, :focus-visible o validación visual de filtros en ese bloque. :focus usa un cambio de color y elimina outline; su suficiencia visual requiere ensayo. El icono bi-funnel hereda tamaño/color, sin font-size propio. La sombra del shell no implica que el panel sea un popover.

### 5.3. Fichas individuales

#### KAN-F01 — Numero de pedido

**A. Identificación.** Kanban, /kanban, primer campo del panel bajo «Filtros del tablero»; KanbanFilters, [capaVista/src/modules/kanban/components/KanbanFilters.jsx:51–60](#fuente-S001).

**B. Propósito funcional.** Localizar pedidos por nota de venta para consultar su avance. El modelo usa salesNoteNumber: «Numero de pedido» no es el ID interno. Usuarios con read:orders; sin este criterio desaparece la búsqueda explícita por NV.

**C. Tipo de control.** Input text de coincidencia parcial, selección única de texto.

**D. Opciones, valor inicial y restricciones.** Predeterminado ''; placeholder «Ej. 24038»; texto libre sin maxLength en JSX. El backend recorta search a 100 caracteres y aplica LIKE en NV, nombre y razón social.

**E. Comportamiento y combinación.** onChange → updateFilter('salesNoteNumber', value) modifica sólo draftFilters. «Aplicar filtros» llama onApplyFilters y guarda appliedFilters en la página; «Limpiar» vacía borrador y aplicado; ocultar conserva ambos. Se combina mediante AND local con cliente y producto.

**F. Código, flujo y servicio.** [capaVista/src/modules/kanban/components/KanbanFilters.jsx:4–28](#fuente-S001); [capaVista/src/modules/kanban/pages/KanbanBoardPage.jsx:69,205–209](#fuente-S002); [capaVista/src/modules/kanban/components/KanbanColumn.jsx:68–165](#fuente-S003); [capaVista/src/modules/kanban/utils/kanbanOrderRules.js:71–101,121–144](#fuente-S004). La consulta usa salesNoteNumber || clientName; este campo tiene precedencia para el único search remoto.

**G. CSS y presentación.** Perfil V-KAN; [capaVista/src/modules/kanban/styles/Kanban.module.css:98–133](#fuente-S008): form-control, mínimo 3rem, borde 1px #d7dee8, radio .55rem, color --kanban-text; padding/placeholder base proceden de Bootstrap, no están redefinidos aquí.

**H. Particularidades y evidencia.** Preservar borrador/aplicado, coincidencia parcial normalizada localmente y dependencia de páginas remotas. No hay submit por Enter del panel: Aplicar es type=button. Implementado; integración no ensayada.

#### KAN-F02 — Nombre del cliente

**A. Identificación.** Kanban, /kanban, segundo campo del mismo panel; [capaVista/src/modules/kanban/components/KanbanFilters.jsx:62–71](#fuente-S001).

**B. Propósito funcional.** Acotar clientes de las tarjetas sin modificar pedidos. Si se elimina, sólo queda localizar por NV/producto. No hay selector de responsables, vendedores o departamentos en este control.

**C. Tipo de control.** Input text, búsqueda parcial.

**D. Opciones, valor inicial y restricciones.** Predeterminado ''; placeholder «Ej. Colegio Andes»; sin opciones ni maxLength. normalizeText hace trim, minúsculas y elimina diacríticos en el cliente.

**E. Comportamiento y combinación.** Actualiza draftFilters.clientName; se aplica/limpia con los mismos botones del grupo. orderMatchesFilters exige que clientName contenga el texto. Con ambos textos informados, el servidor recibe la NV, y el nombre del cliente se termina filtrando localmente.

**F. Código, flujo y servicio.** [capaVista/src/modules/kanban/components/KanbanFilters.jsx:14–28,62–71](#fuente-S001); [capaVista/src/modules/kanban/components/KanbanColumn.jsx:79–93,141–160](#fuente-S003); [capaVista/src/modules/kanban/utils/kanbanOrderRules.js:30–36,71–101](#fuente-S004). Cada cambio aplicado invalida la carga y el cursor de continuación usado por la nueva consulta.

**G. CSS y presentación.** Perfil V-KAN y [capaVista/src/modules/kanban/styles/Kanban.module.css:104–133](#fuente-S008); etiqueta .78rem, peso 850, tracking .055em y uppercase; mismas dimensiones que KAN-F01.

**H. Particularidades y evidencia.** El servidor también busca razón social, pero el predicado local usa clientName normalizado del DTO. No equiparar texto amplio remoto con coincidencia exacta de una entidad. Sin resumen de filtros activos fuera del panel.

#### KAN-F03 — Tipo de producto

**A. Identificación.** Kanban, /kanban, tercer campo; [capaVista/src/modules/kanban/components/KanbanFilters.jsx:73–86](#fuente-S001).

**B. Propósito funcional.** Distinguir órdenes por composición de productos; afecta tarjetas y conteos visibles por columna, no la carga operativa global de la cabecera. Quitar el criterio elimina esta clasificación.

**C. Tipo de control.** Select nativo simple; no multiselección.

**D. Opciones, valor inicial y restricciones.** Etiqueta/valor: Todos/''; Lanyard/lanyard; Tarjeta/tarjeta; Yoyo/yoyo; Mixto/mixto. Valores estáticos. Sin dependencia de catálogo backend para opciones de este select.

**E. Comportamiento y combinación.** Actualiza draftFilters.productType y sólo se aplica al pulsar Aplicar. El servidor recibe productType. En cliente getOrderCoreProductTypes obtiene tipos únicos; Mixto exige ≥2; un tipo simple exige exactamente uno y que coincida. AND con textos.

**F. Código, flujo y servicio.** [capaVista/src/modules/kanban/components/KanbanFilters.jsx:73–85](#fuente-S001); [capaVista/src/modules/kanban/utils/kanbanOrderRules.js:47–101](#fuente-S004); [capaServidor/src/modules/orders/repo/kanbanRead.repo.js:36–38](#fuente-S089). El origen de la divergencia «Mixto» está en ese EXISTS LIKE del servidor.

**G. CSS y presentación.** Perfil V-KAN; form-select y reglas de [capaVista/src/modules/kanban/styles/Kanban.module.css:118–133](#fuente-S008). El menú de opciones es nativo: tamaño y cierre no medidos. No hay dropdown propio/portal.

**H. Particularidades y evidencia.** Se comprobó con funciones existentes y datos sintéticos que un Lanyard+Tarjeta coincide con mixto y no con lanyard. No se comprobó que el backend entregue esas filas; conservar la definición de composición antes de diseñar una interfaz nueva.


### 5.4. Consulta, resultados y posibles fallos

Aplicar → setAppliedFilters → efecto de KanbanColumn con AbortController/request ID → GET /api/orders/kanban-summary?limit=50&search=...&productType=... → validación/SQL → DTO → normalizeOrder → sortOrdersForColumn → tarjetas por generalStepId. Los dos textos no se envían separados: search=salesNoteNumber || clientName. SQL OR entre NV/nombre/razón social entrega un conjunto candidato; el cliente aplica AND entre los dos campos y producto. El recorte remoto a 100 caracteres y el predicado local sin ese recorte podrían producir semánticas distintas para textos largos; no se ensayó.

Cada columna cuenta las tarjetas cargadas que pasaron el predicado; no es un total global SQL. «Cargar más pedidos» añade páginas sin IDs duplicados y conserva criterios. Puede haber columna aparentemente vacía en una página remota aunque otra continuación contenga coincidencias después del predicado local. Mientras carga hay LoadingIndicator por columna; errores en role=alert; vacío literal «Arrastra una orden hacia esta columna.», aunque el vacío también pueda deberse a filtros.

El servidor excluye terminados/cancelados y el cliente vuelve a excluirlos; no se deben eliminar esas restricciones al separar UI y lógica. El problema de «Mixto» y las diferencias de estados activos se clasifican en la sección 14. No se ejecutaron movimientos, etiquetas, PIN ni carga operativa.

## 6. Auditoría completa de comprobación de pago

### 6.1. Contexto, contenedor y flujo

Ruta /pagos, título «Confirmacion de pago». Las tarjetas de resumen de Pendientes/Rechazados/Confirmados son articles sin onClick: **no son filtros**. Los filtros reales son los tres botones bajo ese resumen, dos date inputs y la búsqueda. La función comercial de lectura/confirmación de pagos y sus permisos de Cobranzas se respaldan en ROLE_PERMISSIONS y el router. La utilidad de los criterios se infiere de la consulta de pedidos por estado, RUT/NV/cliente y fecha de creación.

PaymentFilters es una toolbar **permanente**, sin Mostrar/Ocultar, sin panel avanzado ni menú flotante. Orden DOM: grupo de estados, grupo de controles (Desde, Hasta, X condicional y buscador). El layout usa grid auto-fit minmax(min(100%,38rem),1fr): el grupo de estados y los controles comparten espacio o pasan de fila según ancho real. No hay height/max-height fijos de toolbar ni posición absoluta o z-index propios. Los únicos desplegables son date pickers nativos del navegador; la función showPicker se invoca desde label/input con focus preventScroll y try/catch.

La lista se filtra en servidor. El alias filteredOrders=orders no hace otro Array.filter local. Los filtros combinan status AND search AND fecha_creacion. Se cierra el editor de estado al cambiar cualquiera; se cancelan lecturas previas, se limpian previews de acciones cuando corresponde y se invalida el cursor para cargar la primera página. Los filtros no escriben pagos. Elegir un estado en la acción de una fila es un flujo separado PATCH con confirmación, permisos y PIN; no se clasifica como filtro.

### 6.2. Perfil visual V-PAG

Fuentes completas: [capaVista/src/modules/payments/components/PaymentFilters.module.css](#fuente-S011) y [capaVista/src/modules/payments/pages/PaymentConfirmationPage.module.css](#fuente-S013). Tokens locales --payment-border #e5e7eb; orange #f97316/rgb249,115,22; muted #64748b; text #111827; red #ef121c y green #248f55. Fuente de página Inter y fallbacks globales.

| Pieza | Valores / comportamiento CSS |
|---|---|
| Toolbar | Grid auto-fit de base38rem, gap1.25rem, padding1.25rem 2.55rem 1.05rem; border-top1px #eef2f7/bottom1px --payment-border; altura automática |
| Estados | Grid3, gap .85rem; botón width100%, min-width0, mínimo3.15rem, padding .72rem 1rem, borde1px #e1e7ef, radio .55rem, fondo#fff/texto#111, fuente1rem/600, gap .7rem |
| Hover / activo / focus | Hover borde naranja, sombra0 .55rem 1.2rem rgba(17,24,39,.08), translateY(-1px); activo #000/#fff; focus-visible outline3px rgba(238,117,45,.28), offset2px (literal distinto del token) |
| Contador | Alto1.65rem/ancho mínimo1.65rem, padding0 .35rem, radio999px, .78rem/800, line-height1, fondo#111/#fff; activo fondo naranja/texto#111 |
| Controles | Grid minmax(0,1.2fr) minmax(0,.9fr), gap .85rem, width100%, min-width0, justify-self:end |
| Grupo de fechas | Fondo#f8fafc, borde1px #cbd5e1 y borde izquierdo .22rem naranja; radio .65rem, mínimo3.35rem, gap .6rem, padding .38rem .65rem; grid2 más auto cuando aparece X |
| Etiquetas/inputs de fecha | Label gap .08rem; caption .58rem/850, line-height1, tracking .07em uppercase; input .78rem/750, line-height1.25, padding .08rem 0, border0/outline0, transparente, color-scheme:light, width100% |
| Fechas activas/foco | Grupo activo #fff; focus-within borde naranja/sombra0 0 0 .22rem rgba(naranja,.14); indicador WebKit opacity .72 |
| X | 2rem×2rem, padding0, borde izquierdo1px; hover/focus-visible naranja/#111/radio .4rem, outline:none; aria-label/title presentes |
| Búsqueda | Flex, gap .65rem, mínimo3.35rem, padding0 .9rem, borde1px #d7dee8, radio .55rem; input .92rem cursiva, borde0/outline0, color#111, flex1; placeholder muted; icono1.2rem naranja |
| Focus búsqueda | Borde naranja y sombra0 0 0 .22rem rgba(naranja,.14) en la caja |
| Responsive | ≤1399.98px padding horizontal1.35rem; ≤991.98px estados grid2; ≤767.98px controles1 columna; ≤575.98px toolbar .85rem, estados gap .7rem, botones mínimo2.85rem/padding .58rem .72rem/fuente .9rem, contador1.5rem/.72rem, búsqueda mínimo2.9rem; ≤399.98px fechas se apilan y X ocupa segunda columna; ≤360px estados grid1 |

La superficie de página permite overflow:visible en escritorio y overflow:hidden bajo 991.98px. No se constató recorte real de los popups nativos (su representación no sigue necesariamente el clipping DOM). No hay estilos de error por cada input ni disabled dedicado en filtros; la carga se expresa en el resultado.

### 6.3. Fichas individuales

#### PAG-F01 — Pendientes / Rechazados / Confirmados

**A. Identificación.** Pagos, /pagos, primer grupo de PaymentFilters bajo las tarjetas de resumen; [capaVista/src/modules/payments/components/PaymentFilters.jsx:50–72](#fuente-S010).

**B. Propósito funcional.** Separar el trabajo de confirmación/revisión por estado del pago; acceso read:payments. La política asigna lectura/escritura a Cobranzas y privilegios superiores. El filtro permite localizar registros; sus botones no confirman ni rechazan pagos.

**C. Tipo de control.** Grupo de botones de selección simple con aria-pressed y contador.

**D. Opciones, valor inicial y restricciones.** Pendientes→Pendiente, Rechazados→Rechazado, Confirmados→Confirmado; inicial Pendiente. No hay opción Todos ni deselección al volver a pulsar. Los nombres vienen de PAYMENT_STATUS; los contadores de SQL, no de la página de 50.

**E. Comportamiento y combinación.** onFilterChange→handleFilterChange→setActiveFilter y setEditingStatus({}); efecto recarga primera página. Search/fechas se conservan. Los contadores cubren search/fechas sin restringirse al estado seleccionado y se reutilizan hasta 30s dentro del mismo scope.

**F. Código, flujo y servicio.** [capaVista/src/modules/payments/pages/PaymentConfirmationPage.jsx:25–29,123–221,311–314](#fuente-S012); [capaServidor/src/modules/orders/repo/paymentWorkspaceRead.repo.js:3–38](#fuente-S091). No confundir FILTERS con las acciones PATCH del pago.

**G. CSS y presentación.** Perfil V-PAG; [capaVista/src/modules/payments/components/PaymentFilters.module.css:14–89](#fuente-S011): mínimo 3.15rem, padding .72rem 1rem, radio .55rem, fuente 1rem/600, activo negro/blanco; contador .78rem/800 de 1.65rem, fondo naranja en activo.

**H. Particularidades y evidencia.** Conservar el alcance de los contadores independiente del estado/cursor, acceso por permisos y cierre del editor al filtrar. La edición exige confirmación/PIN por otro flujo y no se ejecutó.

#### PAG-F02 — Desde

**A. Identificación.** Pagos, /pagos, primer extremo de «Filtrar por fecha de creación»; [capaVista/src/modules/payments/components/PaymentFilters.jsx:75–96](#fuente-S010).

**B. Propósito funcional.** Excluir pedidos creados antes de una fecha. Es fecha de creación del pedido, no fecha de abono ni vencimiento. Sin límite inferior no se acota el inicio del período.

**C. Tipo de control.** Input date nativo, extremo inferior de un rango.

**D. Opciones, valor inicial y restricciones.** Inicial ''; label Desde; id payment-date-from; max=dateTo || undefined. Sin placeholder explícito. Date picker nativo con showPicker opcional y fallback.

**E. Comportamiento y combinación.** onChange→handleDateFromChange→dateFrom y limpia editingStatus. Aplicación automática sin botón. Se combina con hasta, status y search; el servidor transforma YYYY-MM-DD a medianoche UTC y exige fecha válida. La X visible al tener cualquier extremo limpia ambos.

**F. Código, flujo y servicio.** [capaVista/src/modules/payments/components/PaymentFilters.jsx:3–28,75–96,114–124](#fuente-S010); [capaVista/src/modules/payments/pages/PaymentConfirmationPage.jsx:321–335](#fuente-S012); [capaServidor/src/modules/orders/service/order.service.js:196–216](#fuente-S088). SQL p.fecha_creacion >= from.

**G. CSS y presentación.** Perfil V-PAG-fechas; [capaVista/src/modules/payments/components/PaymentFilters.module.css:101–191](#fuente-S011): grupo mínimo 3.35rem, padding .38rem .65rem; input .78rem/750, padding .08rem 0, sin borde propio; label .58rem/850 uppercase; foco en el grupo.

**H. Particularidades y evidencia.** Conservar semántica UTC, restricciones cruzadas, posibilidad de sólo un extremo y fallback showPicker. El popup de calendario no es un modal del proyecto.

#### PAG-F03 — Hasta

**A. Identificación.** Pagos, /pagos, segundo extremo de creación; [capaVista/src/modules/payments/components/PaymentFilters.jsx:98–112](#fuente-S010).

**B. Propósito funcional.** Excluir pedidos creados después del día elegido. Sin este criterio no se acota el final. Comparte el rango lógico con PAG-F02, pero es un control independiente.

**C. Tipo de control.** Input date nativo, límite superior.

**D. Opciones, valor inicial y restricciones.** Inicial ''; label Hasta; id payment-date-to; min=dateFrom || undefined. Sin placeholder propio; admite un rango abierto al principio.

**E. Comportamiento y combinación.** onChange→handleDateToChange→dateTo y cierra el editor. El backend convierte el día seleccionado al inicio del día siguiente y usa fecha_creacion < to; por ello el día elegido queda incluido. clearDateRange limpia ambos extremos y conserva estado/texto.

**F. Código, flujo y servicio.** [capaVista/src/modules/payments/components/PaymentFilters.jsx:98–124](#fuente-S010); [capaVista/src/modules/payments/pages/PaymentConfirmationPage.jsx:326–335](#fuente-S012); [capaServidor/src/modules/orders/repo/paymentWorkspaceRead.repo.js:12–13](#fuente-S091). Rango invertido falla en servicio con 400.

**G. CSS y presentación.** Perfil V-PAG-fechas; label contiguo tiene border-left 1px --payment-border y padding-left .6rem. A ≤399.98px cambia a border-top y padding-top .5rem. Estilos completos en [capaVista/src/modules/payments/components/PaymentFilters.module.css](#fuente-S011).

**H. Particularidades y evidencia.** No reemplazar este límite por comparación al inicio del mismo día ni mezclarlo con fecha de entrega. No se ensayaron locale/timezone del date picker.

#### PAG-F04 — Buscar por RUT, NV o cliente

**A. Identificación.** Pagos, /pagos, buscador a la derecha de fechas en escritorio; [capaVista/src/modules/payments/components/PaymentFilters.jsx:127–139](#fuente-S010).

**B. Propósito funcional.** Localizar pagos por datos del cliente o NV antes de revisar comprobantes/estado. El backend incluye RUT, nombre, razón social y NV. Si desaparece, se pierde identificación textual transversal dentro del estado.

**C. Tipo de control.** Input search de texto único con etiqueta accesible oculta y bi-search.

**D. Opciones, valor inicial y restricciones.** Inicial ''; placeholder «Buscar por RUT, NV o cliente»; id payment-search. No hay lista/autocomplete ni selección múltiple. Backend trim y slice(0,100).

**E. Comportamiento y combinación.** onChange→searchTerm; espera 250ms y guarda settledSearch=trim(). searchPending sustituye filas por indicador mientras el texto no está asentado. Cambios reinician consulta/cursor, cancelan peticiones y limpian editor. Vaciar el input elimina sólo texto; no hay botón global para restablecer todo.

**F. Código, flujo y servicio.** [capaVista/src/modules/payments/pages/PaymentConfirmationPage.jsx:75–99,123–208,316–319,566–593](#fuente-S012); [capaVista/src/modules/payments/api/paymentsApi.js:7–12](#fuente-S014); [capaServidor/src/modules/orders/repo/paymentWorkspaceRead.repo.js:5–14](#fuente-S091).

**G. CSS y presentación.** Perfil V-PAG-búsqueda; [capaVista/src/modules/payments/components/PaymentFilters.module.css:193–228](#fuente-S011): mínimo 3.35rem, padding 0 .9rem, radio .55rem, borde #d7dee8; input .92rem cursiva; icono 1.2rem naranja; placeholder --payment-muted.

**H. Particularidades y evidencia.** Conservar debounce, loading del texto pendiente, errores y protección frente a respuestas antiguas. No inferir normalización de RUT: SQL hace LIKE; no se inspeccionó su collation real.


### 6.4. Resultados, errores y concurrencia

GET /api/orders/payments recibe status, search, from, to, limit y cursor; includeSummary:false evita repetir contadores/catálogo. Devuelve items, pageInfo, counts y paymentStatuses, validado por parsePaymentWorkspaceDTO. readPaymentCounts omite status/cursor, de modo que muestra las tres categorías del mismo search/período. Se mantiene un vencimiento de 30s y se actualiza al recuperar foco de ventana; no es un cache permanente de todas las filas.

La nueva consulta aborta las anteriores y comprueba mounted/requestId. La carga de más páginas está bloqueada durante searchPending, petición en curso o escritura pendiente. La tabla y tarjetas móviles reciben el mismo resultado. Vacío: «No hay pedidos que coincidan con los filtros aplicados.»; error: bloque alert con Reintentar; carga: LoadingIndicator para pedidos de pago. No se ensayó ninguna escritura ni comprobante real. La ausencia de botón Todos es implementación actual, no una recomendación a cambiar.

## 7. Auditoría completa de gestión de usuarios

### 7.1. Contexto y superficies diferentes

La pantalla /admin/usuarios administra cuentas locales vinculadas a identidad externa. La autorización visual exige manage:users y el backend valida actor, proveedor, issuer y roles administrables. **Listar no equivale a buscar todo Keycloak:** el listado usa la proyección local Usuario+ExternalIdentity; la inspección de un usuario y el acceso a sus movimientos sí verifican la identidad/roles con el servicio de Keycloak. La disponibilidad de endpoints depende de AUTH_PROVIDER=keycloak e IDENTITY_PREPARATION_ENABLED=true; se documentan nombres sin leer/publicar secretos.

Hay dos superficies: (1) buscador de cuentas más panel de estado/rol en la página; (2) buscador de registros dentro de UserMovementsModal. No comparten criterios ni query. Los selectores de rol/estado de UserEditModal son edición de datos, no filtros; la preparación de identidad es una acción operativa y SupportHomePage no aparece como ruta activa de esta pantalla.

Orden principal: PageHeader → UserSummaryCards → mensajes de estado → filtersShell con search permanente / Mostrar filtros / Crear usuario → panel condicional con Estado, Rol y Limpiar filtros → tabla/lista móvil y paginación. El botón Crear usuario comparte barra pero inicia una mutación, no filtra. isFiltersOpen=false inicialmente. El panel es inline, border-top, sin floating, portal, z-index, máximos de altura ni animación propia; toggle sí tiene aria-expanded y aria-controls. No hay cierre con Escape/clic exterior del panel. Ocultar conserva estado/rol y búsqueda. La acción Limpiar está dentro del panel y deshabilitada cuando no hay ningún criterio activo.

### 7.2. Perfil visual V-USR y modal

Fuente: [capaVista/src/modules/users/pages/UserManagementPage.module.css](#fuente-S022). Tokens --users-border #dfe5ec, --users-orange #f97316, orange-soft rgba(249,115,22,.12), soft #f4f4f5, text #111827 y muted #64748b.

| Pieza | Valores / estados |
|---|---|
| Shell | #fff, borde1px --users-border, radio .75rem, sombra0 8px 24px rgba(15,23,42,.045), padding .85rem |
| Topbar | Grid minmax(16rem,1fr) auto auto, gap .8rem; search primero; sin altura fija |
| Search | Fondo soft, borde1px #dbe3ef, radio .6rem, color#0f172a, flex gap .75rem, padding0 1rem, min-width0; input transparente, mínimo3.15rem, width100%, outline0, color text; placeholder#8190a5; icono1.15rem |
| Focus search | Borde naranja/sombra0 0 0 .18rem orange-soft; transición border/shadow150ms |
| Toggle | Mínimo3.15rem y ancho mínimo10rem; padding .45rem .9rem, radio .55rem, borde1px #cbd5e1, fondo#fff/texto text; peso800; gap .5rem; hover fondo soft/borde#94a3b8 |
| Panel | Grid gap1rem, margin-top1rem/padding-top1rem, border-top1px #edf2f7 |
| Estado/rol | fieldset margin0/padding0/border0; legend .78rem/850 uppercase/tracking .06em/margin-bottom .5rem; opciones flex-wrap gap .5rem |
| Chips | Mínimo2.25rem, padding .35rem .85rem, radio999px, borde1px #dbe3ef, fondo soft/texto text, gap .5rem; activo negro/blanco; font-size/weight generales no declarados en filterChip |
| Limpiar | Base mínimo2.4rem/padding .45rem .9rem/radio .55rem/borde#cbd5e1/#fff; disabled por atributo pero no comparte la regla específica .userButton:disabled; esa distinción es importante |
| Focus botones | Toggle/chips/UserButton/pageButton: outline2px naranja, offset2px, sombra0 0 0 .2rem orange-soft; clearFiltersButton no está en esa lista |
| Responsive de filtros | ≤991.98px: topbar2 columnas; search ocupa fila completa; toggle y Crear width100%; ≤575.98px: topbar1 columna, padding shell .75rem, chips grid1 y width100%/space-between |

**Modal de movimientos:** [capaVista/src/modules/users/components/UserMovementsModal.module.css](#fuente-S024): dialog width66rem, max-width calc(100vw - 2rem), max-height calc(100dvh - 2rem), padding0, border1px #e5e7eb, radio1rem, sombra0 24px 70px #0004, overflow:hidden; top layer nativa al llamar showModal(), sin z-index manual. ::backdrop #0f172a99. Header negro con padding1.4rem 1.6rem, h2 clamp(1.4rem,3vw,2rem)/850. Body flex-column gap1.2rem/padding1.4rem 1.6rem/overflow-y:auto; filtros flex-wrap gap .6rem. Search mínimo2.75rem y ancho mínimo12rem, flex1, padding .5rem .8rem, gap .65rem, borde#dbe3ed/radio .55rem. Input font heredado, placeholder --itexsa-muted. Botones mínimo2.65rem/padding .5rem .8rem/peso750/radio .55rem; hover fondo#fff7ed y borde naranja; disabled opacity .45/cursor not-allowed. Focus de search/buttons outline2px naranja offset3px. Scroll de resultados mínimo12rem/máximo48dvh; bajo575.98px máximo40dvh. A767.98px search ocupa fila, paddings1rem; a575.98px máximos del modal restan1rem, radio .75rem y se oculta icono de header. No se comprobó cierre al clicar backdrop: **no hay handler explícito**; Escape sí onCancel, y X llama onClose. Los filtros del modal se pierden al cerrarlo/desmontarlo. No hay validación PIN para la búsqueda.

### 7.3. Fichas individuales

#### USR-F01 — Buscar usuario

**A. Identificación.** Gestión de usuarios, /admin/usuarios; buscador permanente anterior a Mostrar filtros y Crear usuario; [capaVista/src/modules/users/components/UserManagementFilters.jsx:31–43](#fuente-S020).

**B. Propósito funcional.** Encontrar cuentas administrables; placeholder menciona nombre, apellido, correo o RUT. El repositorio también busca username de ExternalIdentity. Se necesita manage:users; no se consulta todo el directorio remoto de Keycloak para cada pulsación.

**C. Tipo de control.** Input search sin autocomplete.

**D. Opciones, valor inicial y restricciones.** Inicial ''; placeholder «Buscar por nombre, apellido, correo o RUT»; id user-management-search; sin maxLength en JSX ni recorte de search en validateListUsersQuery.

**E. Comportamiento y combinación.** setSearchTerm inmediato; efecto a 350ms actualiza trim a debouncedSearchTerm y page=1. loadUsers solicita 10; actualiza usuarios y total. AND con activeStatus y activeRole. Limpiar filtros elimina las tres condiciones, incluido el texto; ocultar panel mantiene texto y filtros.

**F. Código, flujo y servicio.** [capaVista/src/modules/users/pages/UserManagementPage.jsx:98–110,130–195,268–274](#fuente-S021); [capaServidor/src/modules/users/repo/keycloakIdentity.repo.js:9–55](#fuente-S100); [capaServidor/src/modules/users/service/keycloakIdentityAdministration.service.js:99–103](#fuente-S099).

**G. CSS y presentación.** Perfil V-USR; [capaVista/src/modules/users/pages/UserManagementPage.module.css:123–168](#fuente-S022): caja #f4f4f5, borde #dbe3ef, radio .6rem, gap .75rem, padding 0 1rem; input mínimo 3.15rem, icono 1.15rem; placeholder #8190a5.

**H. Particularidades y evidencia.** Conservar el scope provider=keycloak/issuer y roles asignables; no filtrar identidades ajenas. Requests anteriores se abortan y se descartan por id. No se ensayó con directorio real.

#### USR-F02 — Estado

**A. Identificación.** Gestión, /admin/usuarios; primer fieldset del panel inicialmente cerrado; [capaVista/src/modules/users/components/UserManagementFilters.jsx:61–79](#fuente-S020).

**B. Propósito funcional.** Separar cuentas vinculadas, pendientes de primer acceso y desvinculadas sin cambiar su estado. Permite priorizar administración de acceso. Eliminarlo suprime esa segmentación; no modifica autenticación.

**C. Tipo de control.** Botones/chips de selección simple con aria-pressed.

**D. Opciones, valor inicial y restricciones.** Todos→''; Vinculados→Vinculado; Pendientes→Pendiente; Desvinculados→Desvinculado. «Pendientes de rol» está comentado, no es opción activa. Initial ''. Los contadores usan totalUsuarios/vinculados/pendientes/desvinculados del resumen global.

**E. Comportamiento y combinación.** onStatusChange→handleStatusChange actualiza activeStatus y page=1; aplicación inmediata. El servidor trata Activo y Vinculado como alias incluidos en ACTIVE_USER_STATUSES; displayUserStatus muestra Activo como Vinculado. Repetir chip no alterna vacío; se usa Todos.

**F. Código, flujo y servicio.** [capaVista/src/modules/users/components/UserManagementFilters.jsx:6–12,63–79](#fuente-S020); [capaVista/src/modules/users/pages/UserManagementPage.jsx:258–261](#fuente-S021); [shared/userLifecycle.js](#fuente-S071); [capaServidor/src/modules/users/repo/keycloakIdentity.repo.js:13–15,56–62](#fuente-S100).

**G. CSS y presentación.** Perfil V-USR-chips; [capaVista/src/modules/users/pages/UserManagementPage.module.css:205–250](#fuente-S022): mínimo 2.25rem, padding .35rem .85rem, radio 999px; fondo --users-soft, activo #000/#fff; fieldset sin borde y legend .78rem/850.

**H. Particularidades y evidencia.** Contadores son globales por issuer, no recalculados según búsqueda/rol actual. No deben igualarse a la suma de filas visibles. Conservar alias de estados y no reactivar automáticamente una cuenta.

#### USR-F03 — Rol

**A. Identificación.** Gestión, /admin/usuarios; segundo fieldset del panel; [capaVista/src/modules/users/components/UserManagementFilters.jsx:81–104](#fuente-S020).

**B. Propósito funcional.** Limitar cuentas por función administrable; no asigna roles. Quitar el criterio mezcla las funciones visibles. Las opciones están determinadas por la política del actor, no por roles encontrados en la página.

**C. Tipo de control.** Chips de selección simple, aria-pressed; dependiente de autorización.

**D. Opciones, valor inicial y restricciones.** Todos→''. Para actor Soporte/Desarrollador: Administrador Producción→Administrador Produccion; Administrador Ventas; Administrador Cobranzas; Operario Producción→Operario Produccion; Operario Ventas; Operario Cobranzas. Sin Gerencia/Soporte/Desarrollador. manageableRoles devuelve [] para otros roles.

**E. Comportamiento y combinación.** onRoleChange→setActiveRole y page=1; aplica inmediato en rolUsuario, AND con estado/texto. Limpiar devuelve ''. Cerrar el panel conserva el valor.

**F. Código, flujo y servicio.** [capaVista/src/modules/users/components/UserManagementFilters.jsx:29,81–103](#fuente-S020); [capaVista/src/modules/users/pages/UserManagementPage.jsx:263–266](#fuente-S021); [capaVista/src/config/roles.js](#fuente-S068); [shared/authorization.js:3–18,176–177](#fuente-S070). Backend restringe ASSIGNABLE_ROLES también al consultar.

**G. CSS y presentación.** Perfil V-USR-chips; mismas reglas y foco que USR-F02; chips sin contador para rol. El texto no fija ancho, hace wrap; bajo 575.98px cada chip ocupa una fila.

**H. Particularidades y evidencia.** La limitación de roles es una regla de autorización. No ofrecer todas las etiquetas de ROLES sólo porque se unifique el componente visual. Ausencia de opciones no equivale a un error de red.

#### USR-F04 — Buscar por identificador o detalle

**A. Identificación.** Gestión → Movimientos de un usuario, dialog UserMovementsModal abierto desde tabla; misma ruta /admin/usuarios; [capaVista/src/modules/users/components/UserMovementsModal.jsx:46–65](#fuente-S023).

**B. Propósito funcional.** Consultar actividad histórica del usuario seleccionado. Busca ID_REGISTRO exacto si es numérico y texto en observación/estado de pago/etapa/subproceso; no busca RUT del usuario ni NV del pedido. Sin este control la consulta sólo se puede recorrer por páginas.

**C. Tipo de control.** Input search y form submit, dentro de dialog nativo modal.

**D. Opciones, valor inicial y restricciones.** Inicial search='' y query={page:1,perPage:10,search:''}; maxLength=120; placeholder «Buscar por identificador o detalle…». No selectores de evento/fecha. El servidor elimina prefijos Estado de pago:, Etapa del pedido: o Subproceso: antes de buscar el detalle.

**E. Comportamiento y combinación.** Escribir sólo actualiza search; Buscar/Enter hace trim, sustituye query.search y page=1. «Limpiar filtros» hace lo mismo con ''. useEffect llama getMovements(subject,query,{signal}); se cancela al cerrar/cambiar query. Escape llama onClose; cerrar desmonta y reinicia criterios.

**F. Código, flujo y servicio.** [capaVista/src/modules/users/components/UserMovementsModal.jsx](#fuente-S023); [capaVista/src/modules/users/api/adminUsersApi.js:15–27](#fuente-S025); [capaServidor/src/modules/users/repo/userMovements.repo.js](#fuente-S101); [capaServidor/src/modules/users/repo/users.repo.js:82–99](#fuente-S111). Resultado records,total,page,perPage.

**G. CSS y presentación.** Perfil V-USR-modal; [capaVista/src/modules/users/components/UserMovementsModal.module.css:1–20,29–42](#fuente-S024): modal 66rem con máximos de viewport, search mínimo 2.75rem y 12rem de ancho, padding .5rem .8rem; botones mínimo 2.65rem.

**H. Particularidades y evidencia.** Inspección administrativa valida target/identidad en Keycloak antes de consultar la actividad local. Mantener foco inicial/restauración, scroll del modal, submit explícito y aislamiento por sujeto. Se reutiliza por Perfil; no se creó un quinto filtro USR por esa reutilización.


### 7.4. Resultados y particularidades de cuenta

ListUsers envía page, perPage=10, search, estadoUsuario y rolUsuario a /api/admin/identity/users; recibe usuarios,total,page,perPage. Backend ordena id_usuario DESC y filtra provider/issuer/roles asignables. Se aborta lectura anterior y se comprueba requestId antes de setUsers. El resumen se solicita aparte a /users/summary con su propio tracker: los chips de estado muestran ese resumen global, aunque texto/rol restrinjan las filas. No debe mezclarse una búsqueda paginada con búsquedas remotas por username destinadas a preparar identidades.

Los filtros principales reinician page=1 al cambiar criterio, excepto el texto que lo hace al concluir sus350ms. No hay selección de tamaño de página. El resultado tiene contador «Mostrando X de Y usuarios», tabla en escritorio y lista móvil a ≤991.98px. Vacío: «No se encontraron usuarios para los filtros seleccionados.»; carga: indicador; errores de API muestran feedback y acción de iniciar sesión si fue401. El modal de movimientos tiene búsqueda explícita/120 caracteres,10 registros por página, vacío «No existen movimientos para esta consulta.» y reintento conservando query.

## 8. Auditoría completa de historial de pedidos

### 8.1. Contexto y dos niveles

La lista /historial-pedidos presenta NV, cliente, estado actual, fecha de creación y enlace a detalle; read:orders habilita consulta. El detalle /historial-pedidos/:orderId presenta resumen/productos y línea de eventos. Los cinco controles se reparten en esos dos niveles: cuatro en la lista y uno en el detalle. No existe un único «filtro de historial» que pueda reemplazarlos sin distinguir el sujeto de consulta.

La lista tiene filtros **permanentes**: fila de siete botones (Todos y seis estados) → form de búsqueda con icono/input/Buscar → fila de Desde/Hasta/Restablecer fechas → error o carga/tabla → paginación. No hay Mostrar filtros, dropdown ni panel avanzado. El shell de tabla lleva overflow:hidden; sólo el contenedor de tabla hace overflow-x:auto con tabla min-width900px. No se crean paneles flotantes ni portales. El contador de la cabecera cuenta filas de la página, no todos los resultados de la BD ni filtros activos.

El estado usa aplicación inmediata/toggle. El texto diferencia input y criterio enviado por submit. Las fechas son inmediatas y se validan antes de consultar. Esa combinación evita que texto sin confirmar se aplique al cambiar fechas: se mantiene search confirmado, no searchInput. En el detalle un selector permanente de tipo recarga eventos de ese pedido, manteniendo resumen. No hay filtro por actor ni fecha de evento en esa subvista.

### 8.2. Perfil visual V-HIS

[capaVista/src/modules/orderHistory/pages/OrderHistoryPage.module.css](#fuente-S032) es pequeño y se incluye completo. La sección principal sólo fija color#111827; hereda fuente global. Panel con radio inferior --page-radius=16px y overflow:hidden. Estados flex-wrap, gap .5rem, padding1rem 1.25rem .25rem; chips .82rem/800, padding .48rem .8rem, borde1px #e2e8f0/radio999px; fondo#f8fafc/texto#475569 y activo/hover#111827/#fff. No height/min-height para los chips.

La búsqueda tiene gap .65rem y padding .75rem 1.25rem 1rem. Input borde1px #dbe1e8, radio .75rem, flex1/min-width0, mínimo2.7rem, padding0 .85rem. Buscar usa fondo#111827/texto#fff, border0, radio .7rem, mínimo2.5rem, peso800, padding .5rem .9rem. El icono bi-search no tiene tamaño/color local específico. Sin placeholder/focus local redefinidos. A ≤700px search hace wrap y el input width calc(100% - 2rem).

Fila de fechas flex-wrap/gap .75rem/padding0 1.25rem 1rem/border-top1px #f1f5f9/align-items:end. Labels grid gap .3rem, .78rem/800/#475569. Inputs mínimo2.55rem, padding0 .7rem, borde#dbe1e8/radio .65rem; Restablecer mínimo2.55rem, padding .5rem .8rem, borde#cbd5e1/#fff/texto#334155/radio .65rem. Hover naranja, sin regla de foco dedicada. Errores #fff1f2/#be123c, margin1rem 1.25rem y padding .85rem; vacío muted/padding3rem. Paginación flex-wrap/gap1rem/padding1rem 1.25rem, botones con base de Buscar y disabled fondo#cbd5e1.

En detalle [capaVista/src/modules/orderHistory/pages/OrderHistoryDetailPage.module.css](#fuente-S034): timelineSection fondo#fff/borde1px #e5e7eb/radio .9rem/sombra0 8px 24px rgba(15,23,42,.04), margin-top1rem/padding1.25rem; header flex/space-between, select mínimo2.5rem, max-width100%, min-width0, padding0 .7rem, borde#dbe1e8/radio .7rem. A ≤600px header vertical/align-stretch/gap .5rem. Cargar más mínimo2.65rem, padding .65rem 1.1rem, radio .7rem; disabled cursor wait/opacity .65. Sin foco específico de select. Los breakpoints1000px/600px también reorganizan el resumen; no cambian qué datos se consultan.

### 8.3. Fichas individuales

#### HIS-F01 — Filtros por estado

**A. Identificación.** Historial, /historial-pedidos; fila inicial sobre búsqueda/fechas y tabla; [capaVista/src/modules/orderHistory/pages/OrderHistoryPage.jsx:12–19,108–116](#fuente-S031).

**B. Propósito funcional.** Separar pedidos por etapa actual para consulta retrospectiva con read:orders. Es estado actual del pedido, no el tipo de evento ni estado de pago. Permite incluir terminados/cancelados que Kanban excluye.

**C. Tipo de control.** Botones/chips de selección simple; activo por clase CSS.

**D. Opciones, valor inicial y restricciones.** Todos→''; Confirmación de Pago→Confirmación de Pago; Listo para producción→Listo para Producción; En producción→En producción; Listo para despacho→Listo para Entrega; Finalizado→Terminado; Cancelado→Cancelado. Inicial ''. No hay botón En revisión en esta lista.

**E. Comportamiento y combinación.** selectStatus alterna vacío si se pulsa el estado ya activo; beginRead vacía filas/errores y cursorStack=[null]. Se combina con texto confirmado y fechas. No exige Aplicar; clicar desencadena consulta.

**F. Código, flujo y servicio.** [capaVista/src/modules/orderHistory/pages/OrderHistoryPage.jsx:79–85,43–54](#fuente-S031); [capaServidor/src/modules/history/repo/historyRead.repo.js:3–21](#fuente-S094). SQL ep.nombre_etapa=status; no hay catálogo dinámico de opciones.

**G. CSS y presentación.** Perfil V-HIS; [capaVista/src/modules/orderHistory/pages/OrderHistoryPage.module.css:3–6](#fuente-S032): botones .82rem/800, padding .48rem .8rem, radio 999px; activo/hover #111827 y #fff. Sin min-height explícito para esos chips.

**H. Particularidades y evidencia.** Conservar etiquetas visibles distintas de valores internos, toggle al volver a pulsar, reinicio de cursores y posibilidad de ver estados finales. No tiene aria-pressed aunque el resto de módulos similares sí.

#### HIS-F02 — Buscar pedidos

**A. Identificación.** Historial, /historial-pedidos; form permanente entre estados y fechas; [capaVista/src/modules/orderHistory/pages/OrderHistoryPage.jsx:118–128](#fuente-S031).

**B. Propósito funcional.** Localizar por NV o cliente/razón social. El backend además interpreta texto con formato de fecha como un rango implícito; la interfaz no lo anuncia. Sin control se pierde localización textual en historial.

**C. Tipo de control.** Input search y botón Buscar / submit por Enter.

**D. Opciones, valor inicial y restricciones.** Inicial searchInput='' y search=''; placeholder «Nota de Venta o nombre del cliente»; aria-label «Buscar pedidos»; sin opciones/maxLength. Backend trim sin slice para este endpoint.

**E. Comportamiento y combinación.** onChange modifica sólo searchInput. submitSearch hace trim, compara con search, beginRead, resetea cursorStack y guarda search. Vaciar sin enviar no limpia resultados; vaciar y Buscar sí. AND con estado y rango explícito. No persiste al desmontar la página.

**F. Código, flujo y servicio.** [capaVista/src/modules/orderHistory/pages/OrderHistoryPage.jsx:33–34,70–77](#fuente-S031); [capaServidor/src/modules/history/service/orderHistory.service.js:29–65,257–271](#fuente-S093); [capaServidor/src/modules/history/repo/historyRead.repo.js:7–12](#fuente-S094).

**G. CSS y presentación.** Perfil V-HIS-búsqueda; [capaVista/src/modules/orderHistory/pages/OrderHistoryPage.module.css:7–9,26](#fuente-S032): input mínimo 2.7rem, radio .75rem, borde #dbe1e8, padding 0 .85rem; botón mínimo 2.5rem y radio .7rem; icono tamaño/color heredados.

**H. Particularidades y evidencia.** El rango inferido no sustituye el texto: la consulta conserva LIKE(search) Y el rango. Buscar «2026-10-28» no es una búsqueda puramente temporal salvo que también coincida NV/cliente. Posible problema documentado, no corregido.

#### HIS-F03 — Desde

**A. Identificación.** Historial, /historial-pedidos; primer input de «Rango de fecha de creacion»; [capaVista/src/modules/orderHistory/pages/OrderHistoryPage.jsx:130–134](#fuente-S031).

**B. Propósito funcional.** Limitar creación de pedidos desde un día. Independiente de fecha de entrega y de timestamps de eventos del detalle. Sin este extremo no se limita el inicio.

**C. Tipo de control.** Input date nativo, límite inferior.

**D. Opciones, valor inicial y restricciones.** Inicial ''; max=dateRange.to || undefined; etiqueta envolvente Desde. Sin id/placeholder explícito; tiene nombre accesible por label. historyDateError valida YYYY-MM-DD real y orden.

**E. Comportamiento y combinación.** updateDate('from',value) omite no-cambios, llama beginRead, reinicia cursorStack y actualiza dateRange. El efecto sólo consulta si no hay validationError. «Restablecer fechas» limpia ambos, preservando estado y texto.

**F. Código, flujo y servicio.** [capaVista/src/modules/orderHistory/pages/OrderHistoryPage.jsx:35,41–54,63–68,130–141](#fuente-S031); [capaVista/src/modules/orderHistory/utils/historyReads.js](#fuente-S035); [capaServidor/src/modules/history/service/orderHistory.service.js:47–65](#fuente-S093). SQL fecha_creacion >= start UTC.

**G. CSS y presentación.** Perfil V-HIS-fechas; [capaVista/src/modules/orderHistory/pages/OrderHistoryPage.module.css:10–14](#fuente-S032): mínimo 2.55rem, radio .65rem, borde #dbe1e8, padding 0 .7rem; etiqueta .78rem/800 y gap .3rem.

**H. Particularidades y evidencia.** Conservar validación local que evita consulta inválida, mensaje de error y criterio explícito prioritario sobre el rango inferido por search. No hay botón global de restablecer todos los criterios.

#### HIS-F04 — Hasta

**A. Identificación.** Historial, /historial-pedidos; segundo input temporal; [capaVista/src/modules/orderHistory/pages/OrderHistoryPage.jsx:135–138](#fuente-S031).

**B. Propósito funcional.** Acotar el final inclusivo de creación; mismo criterio compuesto con HIS-F03. Sin control se consultan todos los días posteriores al inicio.

**C. Tipo de control.** Input date nativo, límite superior.

**D. Opciones, valor inicial y restricciones.** Inicial ''; min=dateRange.from || undefined; label Hasta; sin placeholder propio. Campos abiertos o mismo día permitidos; invertido produce validationError.

**E. Comportamiento y combinación.** updateDate('to',value) reinicia filas y cursor; servidor selectedEnd+86400000 y SQL fecha_creacion < end. Restablecer elimina desde y hasta, aunque sólo uno estuviera definido. No hay debounce.

**F. Código, flujo y servicio.** [capaVista/src/modules/orderHistory/pages/OrderHistoryPage.jsx:63–68,130–144](#fuente-S031); [capaServidor/src/modules/history/service/orderHistory.service.js:47–65](#fuente-S093); [capaServidor/src/modules/history/repo/historyRead.repo.js:11–12](#fuente-S094).

**G. CSS y presentación.** Perfil V-HIS-fechas. Botón asociado: mínimo 2.55rem, padding .5rem .8rem, radio .65rem; hover borde #f97316/texto #c2410c; fechas sin foco local explícito (depende de navegador/global).

**H. Particularidades y evidencia.** Debe seguir incluyendo todo el día final. El criterio no se transfiere a la ruta de detalle ni se conserva mediante la URL. Unificar date pickers no justifica cambiar la base UTC.

#### HIS-F05 — Filtrar por tipo de registro

**A. Identificación.** Detalle, /historial-pedidos/:orderId; select junto a «Eventos del pedido»; [capaVista/src/modules/orderHistory/pages/OrderHistoryDetailPage.jsx:13–20,126–140](#fuente-S033).

**B. Propósito funcional.** Separar actividad por clase de registro sin ocultar el resumen/productos del pedido. No es el estado actual HIS-F01; si desaparece hay que recorrer toda la cronología.

**C. Tipo de control.** Select nativo simple con aria-label.

**D. Opciones, valor inicial y restricciones.** Inicial all. Opciones: Todos los registros/all; Etapas generales/stage; Pagos/payment; Subprocesos/subprocess; Calendarizacion/calendar; Generales/general. Lista estática y validación backend del mismo conjunto.

**E. Comportamiento y combinación.** selectType limpia eventos, error, cursor y flags de carga; el primer acceso obtiene resumen+eventos, después listOrderEvents solicita sólo eventos. Cargar más usa cursor compuesto tiempo/ID y appendHistoryEvents evita duplicados. Volver reinicia listado al remontarlo.

**F. Código, flujo y servicio.** [capaVista/src/modules/orderHistory/pages/OrderHistoryDetailPage.jsx:28–94](#fuente-S033); [capaVista/src/modules/orderHistory/api/orderHistoryApi.js:10–18](#fuente-S036); [capaServidor/src/modules/history/repo/orderHistory.repo.js:6–13,127–177](#fuente-S095). Calendar/general se distinguen por presencia de registros asociados y prefijo de observación.

**G. CSS y presentación.** Perfil V-HIS-detalle; [capaVista/src/modules/orderHistory/pages/OrderHistoryDetailPage.module.css:5,9,14–15,28–31](#fuente-S034): select mínimo 2.5rem, padding 0 .7rem, radio .7rem, max-width100%/min-width0. Contenedor padding1.25rem y radio .9rem; a ≤600px cabecera en columna.

**H. Particularidades y evidencia.** Preservar el resumen mientras cambian eventos, cursor compuesto, filtrado en servidor y restricciones de visibilidad de detalles de pago por permisos. Tipo payment no concede esos permisos.


### 8.4. Lectura, continuidad y preservación

La lista usa subscribeHistoryRead, que deduplica solicitudes **pendientes**, por instancia de API y parámetros, con suscriptores; no conserva un caché de resultados completados. Desuscribir el último lector aborta la petición en una microtarea, útil para StrictMode. Las API extraen signal del query para no serializarlo. Cambiar estado/texto confirmado/fechas vacía filas, resetea cursorStack=[null] y lee50. Anterior vuelve a un cursor guardado y solicita otra vez; Siguiente sólo añade nextCursor cuando está habilitado.

Los rangos explícitos tienen precedencia sobre dateRangeFromSearch, pero el texto sigue en SQL junto al rango inferido: eso se documenta como posible sorpresa. Detalle usa cursor por FECHA_HORA e ID_REGISTRO descendentes, evita IDs repetidos, y sólo descarga resumen inicialmente. Su eventPageInfo no debe sustituirse por paginación por número de página. Los tipos calendar/general dependen de registros y del prefijo «Fecha de termino definida para », una convención de datos que una refactorización visual no debe alterar.

No hay persistencia de filtros al hacer click en Ver detalle y volver con el enlace. Las rutas no codifican búsqueda/fechas/estado en query string y no existe almacenamiento del criterio en este módulo. Vacíos y mensajes de error/carga están en las fichas y en código literal.

## 9. Auditoría completa de calendario

### 9.1. Contexto, filtros reales y controles vecinos

Ruta /calendario-produccion, lectura read:production-calendar y autorización separada update:order-delivery-date para reprogramar. El calendario es un componente propio; no se encontró FullCalendar, react-big-calendar, dayjs/date-fns ni un date-range picker instalado para esta vista. Date e Intl('es-CL') construyen títulos/claves locales. buildMonthGrid crea seis semanas de cinco días (Lunes–Viernes); la elegibilidad de arrastre usa días hábiles y mes activo. Una fecha no hábil se lleva a pendientes en la presentación; no cambia por ello su etapa de negocio.

PageHeader «Calendario» tiene botón bi-funnel Mostrar/Ocultar filtros en acciones a la derecha. isFiltersOpen=false. Al abrir se inserta CalendarFilters antes de calendarPanel: búsqueda → estado → producto → Limpiar filtros. Es un **panel inline**, sin portal, modal, floating, posición absoluta, z-index ni animación específica. No maneja clic fuera/Escape; cerrar mantiene filters en CalendarContent. Toggle no declara aria-expanded/aria-controls en esta implementación.

Dentro del panel del calendario se ve navegación mensual y Hoy, que cambian el período cargado, no los criterios search/status/productType. La bandeja temporal y pendientes son superficies funcionales aparte. No hay selector de vista semana/día, responsable, rango arbitrario ni menú de filtros adicionales. El modal del día es un desglose de resultados, sin otro input de filtro.

### 9.2. Perfil visual V-CAL y controles de apertura/navegación

[capaVista/src/modules/productionCalendar/pages/ProductionCalendarPage.module.css](#fuente-S045) usa --calendar-border=--page-border (#D9DEE5), orange=--page-brand-orange (#FE5A00), rgb254,90,0; muted#64748b/text#111827 y font-family --page-font-family. Éste es un override distinto de los naranjas heredados en Kanban/pagos/usuarios.

| Pieza | Valores declarados |
|---|---|
| Toggle | Inline-flex, gap .55rem, peso850, mínimo2.85rem, padding .6rem 1rem, radio .75rem; fondo rgba(--page-brand-orange-rgb,.12), borde1px rgba(...,.42), texto#fff |
| Toggle hover/focus | Fondo/borde naranja, texto#111827, outline2px --page-white/offset3px. ≤991.98px width100% |
| Filter card | Grid 1.4fr 1fr 1fr auto, gap1rem, padding1rem, align-items:end; #fff, borde1px --calendar-border, radio .85rem, sombra0 14px 32px rgba(15,23,42,.045); sin width/height fijos |
| Labels | Grid/gap .45rem/margin0; caption .78rem/850, tracking .055em/uppercase/muted |
| Input/select | Mínimo3rem; padding .55rem .7rem; borde1px #d7dee8/radio .55rem; color --calendar-text; fuente y tamaño general heredados |
| Focus | Borde --calendar-orange y sombra0 0 0 .22rem rgba(--calendar-orange-rgb,.18); outline:none |
| Limpiar | #fff/borde1px #d3d9e2/#111827, radio .55rem, peso780, mínimo3rem, padding .55rem .9rem; hover/focus borde y texto naranja, outline:none |
| Responsive panel | ≤991.98px grid1; no hay modo modal móvil ni ocultación adicional |
| Mes anterior/siguiente/Hoy | Toolbar flex-wrap, gap .75rem; botones mínimo2.6rem×2.6rem, padding .5rem .75rem, radio .5rem, borde --calendar-border/fondo--page-white/text--calendar-text, .85rem/700 |
| Título de mes | 1.2rem/800, centrado/margin0; bajo575.98px 1rem, gaps .5rem/.4rem |
| Navegación foco/hover | Hover borde/texto naranja; focus-visible outline2px naranja/offset2px; flechas sólo icono y title, sin aria-label propio |
| Resultados | calendarLayout2.5fr/minmax19rem,1fr, gap1rem; ≤1199.98px1fr/minmax17rem,.5fr; ≤991.98px una columna. calendarScroll overflow-x:auto; grid base40rem y28rem en container query≤720px |

Fuentes completas de filtros: [capaVista/src/modules/productionCalendar/components/CalendarFilters.module.css](#fuente-S039), [capaVista/src/modules/productionCalendar/components/CalendarHeader.module.css](#fuente-S041), [capaVista/src/modules/productionCalendar/components/CalendarToolbar.module.css](#fuente-S043). El layout de resultados y modal por día se extrae en [capaVista/src/modules/productionCalendar/components/ProductionCalendarGrid.module.css](#fuente-S113); no se afirma ausencia visual de scroll o superposiciones.

### 9.3. Fichas individuales

#### CAL-F01 — Buscar

**A. Identificación.** Calendario, /calendario-produccion; primer campo del panel abierto desde cabecera; [capaVista/src/modules/productionCalendar/components/CalendarFilters.jsx:6–15](#fuente-S038).

**B. Propósito funcional.** Localizar NV, cliente o producto entre pedidos mensuales cargados. Es una búsqueda local; no consulta al servidor por pulsación. Quitar control impide reducir la cuadrícula por texto.

**C. Tipo de control.** Input search directo; sin submit ni debounce.

**D. Opciones, valor inicial y restricciones.** Inicial filters.search=''; placeholder «NV, cliente o producto»; label Buscar. normalizeText elimina espacios extremos, diferencia de mayúsculas y diacríticos. Sin autocomplete ni maxLength.

**E. Comportamiento y combinación.** onChange({search:value})→updateFilters mezcla parciales; useMemo compara includes sobre orderNumber/clientName/productTypes concatenados y AND con estado/producto. Limpiar filtros devuelve DEFAULT_FILTERS; cerrar panel conserva valores.

**F. Código, flujo y servicio.** [capaVista/src/modules/productionCalendar/components/CalendarFilters.jsx:9–14](#fuente-S038); [capaVista/src/modules/productionCalendar/pages/ProductionCalendarPage.jsx:14–39,171–198,222–245](#fuente-S044). La colección es calendarItems del mes; pendingItems deriva de allItems sin este predicado.

**G. CSS y presentación.** Perfil V-CAL; [capaVista/src/modules/productionCalendar/components/CalendarFilters.module.css:1–40](#fuente-S039): input mínimo 3rem, padding .55rem .7rem, radio .55rem, borde #d7dee8; label .78rem/850 uppercase. Font-size de input heredado, no declarado localmente.

**H. Particularidades y evidencia.** Conservar normalización local y alcance sobre cuadrícula. No afirmar que filtra pendientes: se comprobó por lectura que allItems y pendingItems van por otro camino. Al cambiar mes, el texto sigue activo.

#### CAL-F02 — Estado

**A. Identificación.** Calendario, /calendario-produccion; segundo campo del panel; [capaVista/src/modules/productionCalendar/components/CalendarFilters.jsx:16–26](#fuente-S038).

**B. Propósito funcional.** Ver pedidos del mes por etapa de producción/gestión. El criterio es el estado de negocio, independiente de si tiene fecha programada. Sin él no se puede segmentar el mes por etapa.

**C. Tipo de control.** Select nativo simple.

**D. Opciones, valor inicial y restricciones.** Inicial ''. Todos/'' y valores de PRODUCTION_STATUSES: Confirmación de Pago, Listo para Producción, En producción, Listo para Entrega, Terminado, Cancelado, En revisión; etiqueta y valor coinciden. Opciones estáticas, no catálogo remoto.

**E. Comportamiento y combinación.** onChange({status:value}); comparación item.status===filters.status (exacta, a diferencia de búsqueda y producto que normalizan). AND con texto/producto; inmediato sin request ni aplicar. Clear devuelve ''.

**F. Código, flujo y servicio.** [capaVista/src/modules/productionCalendar/components/CalendarFilters.jsx:17–25](#fuente-S038); [capaVista/src/modules/productionCalendar/config/productionCalendar.config.js](#fuente-S046); [capaVista/src/modules/productionCalendar/utils/calendarOrder.js](#fuente-S051); [capaVista/src/modules/productionCalendar/pages/ProductionCalendarPage.jsx:180–185](#fuente-S044).

**G. CSS y presentación.** Perfil V-CAL; mismos min-height, borde, padding y foco que búsqueda. Menú del select nativo no medido; sin portal/dropdown propio.

**H. Particularidades y evidencia.** Conservar respaldo de estado por generalStepId; un estado válido recibido con distinta capitalización puede no coincidir exactamente con la opción. Se identifica como riesgo de contrato, sin evidencia de fila real afectada.

#### CAL-F03 — Producto

**A. Identificación.** Calendario, /calendario-produccion; tercer campo; [capaVista/src/modules/productionCalendar/components/CalendarFilters.jsx:27–35](#fuente-S038).

**B. Propósito funcional.** Acotar pedidos que contienen uno de los productos elegidos. Diferencia funcional con Kanban: un mixto puede coincidir con cada producto presente. Quitar criterio obliga a buscar mediante texto o revisar tarjetas.

**C. Tipo de control.** Select nativo simple.

**D. Opciones, valor inicial y restricciones.** Inicial ''. Todos/''; Lanyard/Lanyard; Tarjeta/Tarjeta; Yoyo/Yoyo. No existe opción Mixto aquí; no hay multiselección. Lista estática.

**E. Comportamiento y combinación.** onChange({productType:value}); normaliza el valor y exige some(productName normalizado === valor). Usa productTypes obtenidos de order.product y order.items[].product. Coincide por igualdad de nombre normalizado, no includes. AND con estado y búsqueda.

**F. Código, flujo y servicio.** [capaVista/src/modules/productionCalendar/components/CalendarFilters.jsx:27–35](#fuente-S038); [capaVista/src/modules/productionCalendar/pages/ProductionCalendarPage.jsx:41–72,171–187](#fuente-S044). El API de calendario no recibe este criterio: carga todo el mes y luego se filtra localmente.

**G. CSS y presentación.** Perfil V-CAL; ancho de la celda 1fr en grid 1.4fr 1fr 1fr auto; a ≤991.98px todos los controles en una columna. clearButton mínimo 3rem.

**H. Particularidades y evidencia.** Preservar que puede incluir mixtos y que nombres extendidos, como un producto con sufijo, no son iguales a «Lanyard». No trasladar automáticamente el criterio exclusivo de KAN-F03.


### 9.4. Navegación relacionada y subconjuntos

| ID | Evento y estado | Consulta/subconjunto | Presentación y cierre |
|---|---|---|---|
| CAL-N01 | onPreviousMonth→changeMonth(-1)→setMonthDate | Primer/último día del mes nuevo; carga completa paginada; criterios locales se conservan | Flecha bi-chevron-left/title Mes anterior; no panel |
| CAL-N02 | onNextMonth→changeMonth(1) | Mismo comportamiento hacia adelante | bi-chevron-right/title Mes siguiente |
| CAL-N03 | onToday→new Date()→primer día del mes actual local | Regresa al mes actual; no hace setFilters | Botón Hoy junto a navegación; no filtro de «sólo pedidos de hoy» |
| CAL-N04 | CalendarDayCell muestra1 tarjeta y +N pedidos mas; onOpenDay→selectedDayKey | selectedDayItems=itemsByDate.get(dayKey) sobre scheduledMonthItems filtrados | DayOrdersModal inline con capa fija; botón X llama onClose; no campos de búsqueda propios |

El modal de día recibe su lista ya filtrada por cuadrícula. Se cierra con X o mouse down en el fondo; el interior detiene propagación. No incorpora handler explícito para Escape en ese componente; iniciar un arrastre programa onClose con setTimeout. El source visible de ese componente no establece un dialog nativo como el de movimientos ni un portal; la capa .modalLayer es fixed/inset0/z-index1070 con fondo rgba(15,23,42,.55), padding1rem. .modalCard es grid y mide width42rem/max-width min(100%,42rem), max-height min(42rem,calc(100vh - 2rem)); .modalBody overflow:auto. Es un desglose, por lo que estos estilos no son los del panel principal de filtros. Valores exactos y handlers se conservan en catálogo.

### 9.5. Origen, fechas, concurrencia y límites de alcance

loadCalendarMonth solicita GET /api/orders/calendar-summary con from/to del mes y páginas100 hasta agotar nextCursor; detecta un cursor repetido y falla para evitar bucle. loadUnscheduledOrders carga todas las páginas sin rango y unscheduled=true. SQL usa fecha_estimada_termino, no fecha_creacion. El backend interpreta días de límites como medianoches UTC y añade un día al límite superior; los meses se construyen con Date local y dueDate se trunca a los diez primeros caracteres. No se ensayó un cambio de zona horaria/DST con datos reales.

Los tres filtros son **locales y AND**, sobre calendarItems ya normalizados. La búsqueda usa includes y normaliza diacríticos; producto some con igualdad normalizada; estado igualdad exacta. No hay request por cambio de esos filtros. Cambiar mes conserva filters pero provoca nueva carga. calendarScope remonta el contenido si cambia API/sesión, evitando revelar un mes de la cuenta anterior. Reads pendientes tienen AbortController y overlays de escrituras confirmadas para que una respuesta atrasada no restaure una fecha vieja; son contratos funcionales que deben conservarse.

CalendarContent entrega items=filteredItems y allItems=mergeCalendarCollections(calendarItems,unscheduledItems). En ProductionCalendarGrid, pendingItems deriva de sourceItems=allItems; por ello el buscador/estado/producto no reducen esa bandeja. transferItems es otro estado conservado al navegar mes: tampoco se deriva de los criterios actuales. El resultado puede mostrar cuadrícula vacía y pendientes que no coinciden; se marca como alcance real y posible inconsistencia, sin afirmar un bug de negocio resuelto. Las tarjetas/contadores de bandeja cuentan esos subconjuntos.

No hay mensaje global equivalente a «No se encontraron pedidos» al filtrar la cuadrícula: se ven celdas sin tarjetas. Pendientes sí muestra «No hay pedidos pendientes de fecha.» y bandeja explica arrastre. Errores de carga se comunican por notify.error/Toast. No se ejecutaron arrastres, confirmaciones ni PIN.

## 10. Auditoría completa de bandeja de entrada

### 10.1. Contexto y contenedor

/mensajes muestra comunicaciones asignadas al usuario; requiere read:own-messages. El backend resuelve userId desde la identidad, no lo toma como filtro editable. La interfaz usa MessageFilters permanente encima de MessageList. No hay buscador textual, categorías/asunto editables, toggle de filtros, dropdown propio ni selección masiva. La campana global de notificaciones no aporta un filtro adicional a esta página: tiene un scope automático de no leídas/no ocultas distinto del inbox.

Orden DOM: grupos Estado y Orden dentro de quickFilters → Desde/Hasta/Restablecer dentro de dateFilters. El contenedor es flex, align-items:flex-end, justify-between. No tiene posicionamiento flotante, z-index, portal, max-height ni animación de apertura. Todos los controles son visibles por defecto y se aplican inmediatamente; las fechas muestran su picker nativo. El contador de cabecera expresa result.total para los criterios actuales, a diferencia de contadores globales de usuarios y multestado de pagos.

### 10.2. Perfil visual V-MSG

[capaVista/src/modules/messages/components/MessageFilters.module.css](#fuente-S056): panel #fff, borde1px #e5e7eb, radio1rem, sombra --itexsa-shadow=0 18px 40px rgba(15,23,42,.06), gap1.25rem/padding1rem. quickFilters flex-wrap/gap1rem; filterGroup grid/gap .45rem. Etiquetas de grupo/fechas .7rem/800, tracking .06em uppercase, color#64748b. Chips flex-wrap/gap .4rem; cada chip mínimo2.35rem, padding .45rem .78rem, radio999px, borde1px #e2e8f0, #f8fafc/#475569, .8rem/700, gap .38rem, transition .15s ease. Hover borde rgba(--itexsa-orange-rgb,.5)/texto#c2410c; activo fondo#fff1e7/borde alpha .55/texto#c2410c. Iconos sin tamaño local propio.

dateFilters flex-wrap/gap .65rem/align-end. Label grid/gap .4rem; input #fff/#334155, borde1px #dbe3ed, radio .65rem, mínimo2.4rem/padding .35rem .65rem; focus borde naranja/sombra3px alpha .12/outline0. Restablecer transparente/border0/muted, mínimo2.4rem, .78rem/700/gap .35rem; hover#c2410c. No :focus-visible específico de chips/restablecer, ni disabled propio de filtros.

≤1199.98px panel vertical/align-stretch; ≤575.98px fechas labels flex1 1 8rem, input width100%, chips flex1 1 auto/center. No aparece un panel móvil separado. La paginación del inbox bajo575.98px oculta texto con font-size0 y conserva iconos .9rem; no añade aria-label a esos botones, por lo que su nombre accesible efectivo requiere revisión. No se atribuye esa regla a los filtros: pertenece a la continuidad de resultados.

### 10.3. Fichas individuales

#### MSG-F01 — Estado: Todos / No leídos / Leídos

**A. Identificación.** Bandeja de entrada, /mensajes; grupo permanente izquierdo; [capaVista/src/modules/messages/components/MessageFilters.jsx:3–7,20–38](#fuente-S055).

**B. Propósito funcional.** Consultar mensajes propios según lectura. No es estado de pedido ni categoría de asunto. La política read:own-messages y la condición userId protegen el destinatario; sin criterio se mezclan mensajes leídos y no leídos.

**C. Tipo de control.** Chips de selección simple con iconos y aria-pressed.

**D. Opciones, valor inicial y restricciones.** Inicial all. Todos/all/bi-inbox; No leídos/unread/bi-envelope; Leídos/read/bi-envelope-open. Sin selección múltiple ni toggle al clicar la opción activa.

**E. Comportamiento y combinación.** update('status',value) reemplaza filtros mezclados; handleFiltersChange hace setPage(1). useEffect ejecuta getInbox con filtros/orden/fechas. Restablecer devuelve all/latest/fechas vacías. No hay buscador de texto.

**F. Código, flujo y servicio.** [capaVista/src/modules/messages/components/MessageFilters.jsx:14–38](#fuente-S055); [capaVista/src/modules/messages/pages/MessageInboxPage.jsx:12–72](#fuente-S057); [capaServidor/src/modules/messages/repo/messageRead.repo.js:12–20](#fuente-S104). SQL filtra leido? 0/1 y siempre usuario.

**G. CSS y presentación.** Perfil V-MSG; [capaVista/src/modules/messages/components/MessageFilters.module.css:1–8](#fuente-S056): chip mínimo 2.35rem, padding .45rem .78rem, radio999px, .8rem/700. Activo #fff1e7, borde naranja alpha .55 y texto #c2410c.

**H. Particularidades y evidencia.** Abrir detalle llama POST /messages/:id/open y puede marcar leído; no es filtrado puro ni se ejecutó. No hay selección masiva por checkbox en MessageList. El vacío genérico puede ser engañoso en Leídos.

#### MSG-F02 — Desde

**A. Identificación.** Bandeja, /mensajes; primer input temporal a la derecha de chips en escritorio; [capaVista/src/modules/messages/components/MessageFilters.jsx:59–63](#fuente-S055).

**B. Propósito funcional.** Limitar fecha de publicación del mensaje, no creación del pedido relacionado ni entrega. Sin este control no se restringe el inicio del período.

**C. Tipo de control.** Input date nativo, límite inferior.

**D. Opciones, valor inicial y restricciones.** Inicial filters.from=''; max=filters.to || undefined; label Desde. Sin placeholder propio, sin selector de período predefinido.

**E. Comportamiento y combinación.** onChange→update('from',value)→filters nuevos/page1; petición inmediata. Backend parseDate con new Date(value); para YYYY-MM-DD inicia en UTC. AND con estado y hasta; MSG-O01 sólo ordena. Restablecer limpia ambos extremos y también status/sort.

**F. Código, flujo y servicio.** [capaVista/src/modules/messages/components/MessageFilters.jsx:59–72](#fuente-S055); [capaVista/src/modules/messages/pages/MessageInboxPage.jsx:38–72](#fuente-S057); [capaServidor/src/modules/messages/service/message.service.js:25–38,70–103](#fuente-S102). SQL fecha_publicacion >= from.

**G. CSS y presentación.** Perfil V-MSG-fechas; [capaVista/src/modules/messages/components/MessageFilters.module.css:9–16](#fuente-S056): input mínimo 2.4rem, padding .35rem .65rem, radio .65rem y borde #dbe3ed; label .7rem/800, tracking .06em, uppercase.

**H. Particularidades y evidencia.** No hay validación local equivalente a historyDateError; un rango inválido se maneja con error de servidor. A ≤575.98px label flex:1 1 8rem y input width100%. No se midió el picker nativo.

#### MSG-F03 — Hasta

**A. Identificación.** Bandeja, /mensajes; segundo extremo de publicación; [capaVista/src/modules/messages/components/MessageFilters.jsx:64–67](#fuente-S055).

**B. Propósito funcional.** Acotar final de publicación inclusivo. Comparte rango lógico con MSG-F02, con estado y orden independientes. Sin extremo se incluyen publicaciones posteriores.

**C. Tipo de control.** Input date nativo, límite superior.

**D. Opciones, valor inicial y restricciones.** Inicial ''; min=filters.from || undefined; label Hasta. Rango de mismo día permitido en el servidor; fecha vacía no añade condición.

**E. Comportamiento y combinación.** update('to',value) aplica de inmediato y page1. Backend, para cadena YYYY-MM-DD, setUTCHours(23,59,59,999) y query <= to. Restablecer elimina todas las opciones, a diferencia de Restablecer fechas del historial.

**F. Código, flujo y servicio.** [capaVista/src/modules/messages/components/MessageFilters.jsx:64–72](#fuente-S055); [capaServidor/src/modules/messages/service/message.service.js:25–38,88–103](#fuente-S102); [capaServidor/src/modules/messages/repo/messageRead.repo.js:16–20](#fuente-S104).

**G. CSS y presentación.** Perfil V-MSG-fechas. Restablecer sin borde y fondo transparente, .78rem/700, gap .35rem, mínimo 2.4rem; hover #c2410c. Focus de inputs: naranja con sombra 0 0 0 3px rgba(...,.12).

**H. Particularidades y evidencia.** Conservar final inclusivo y alcance propio; no copiar sin análisis el límite exclusivo del día siguiente usado por pedidos. No se certifica precisión/subsegundos real de la BD.


### 10.4. MSG-O01: orden, lectura y resultados

MSG-O01 es grupo de botones «Orden», no una restricción del conjunto: Últimos/latest/bi-sort-down (default) o Más antiguos/oldest/bi-sort-up. Usa el mismo chip visual y aria-pressed que Estado. update('sort',value) conserva los tres filtros, reinicia page1 y consulta al servidor. SQL ordena fecha_publicacion e id_mensaje en la misma dirección, para desempatar. No hay orden por asunto/cliente. Se documenta porque comparte la barra y Restablecer lo devuelve a latest.

getInbox→GET /api/messages recibe status,sort,from,to,page,perPage=12 y devuelve messages,total,totalPages (también page/perPage según repositorio). Se usa AbortController y requestId. El servidor admite como máximo100 por página; aquí se fijan12 y no hay selector de tamaño. Las lecturas no añaden un filtro de oculto?: ocultar una notificación y filtrar lectura no son lo mismo. La campana sólo usa no leídas/no ocultas; inbox incluye las asignaciones sin esa exclusión.

No se implementa persistencia de filtros al navegar a detalle y volver mediante el enlace. Abrir un mensaje navega a /mensajes/:id; MessageDetailPage ejecuta openMessage mediante POST y puede marcar leído. Por esa razón no se abrió un mensaje real durante esta auditoría. MessageList muestra «No tienes mensajes nuevos.» para cualquier lista vacía, incluso bajo Leídos o un período sin coincidencias; es una posible confusión de contenido. Carga y errores son explícitos y Reintentar repite los criterios actuales.


## 11. Componentes compartidos actuales

### 11.1. Inventario de componentes utilizados

El conteo de **8 componentes compartidos utilizados** incluye siete piezas de infraestructura usadas por varias pantallas y un modal de negocio reutilizado entre Usuarios y Perfil. Los distintos exports PageShell/PageSurface y LoadingIndicator/LoadingAction cuentan separadamente como componentes React; los hooks, CSS y fábricas no entran en ese número. No implica que haya ocho componentes de filtro: **no se encontró un FilterBar, SearchField o DateRangeField común usado por estos seis módulos**.

| Componente | Ruta/evidencia | Uso y responsabilidad | Props/estilos/dependencias | Límite para filtros |
|---|---|---|---|---|
| PageShell | [capaVista/src/shared/components/layout/PageShell.jsx](#fuente-S075) | Los seis módulos; marco y ancho | children,className,maxWidth,...props; PageShell.module.css y variables --page-* | No conoce filtros, datos ni query |
| PageSurface | Mismo archivo anterior | Kanban, pagos, historial y calendario; superficie | children,className,...props; fondo/borde/radio del tema | Usuarios/mensajes usan secciones propias; no es una barra |
| PageHeader | [capaVista/src/shared/components/layout/PageHeader.jsx](#fuente-S076) | Los seis; título, acciones y detalles | title,titleId,actions,children; container queries en PageShell.module.css | Sólo Calendario aloja Mostrar filtros dentro de actions; Kanban lo coloca en otra barra |
| LoadingIndicator | [capaVista/src/shared/components/loading/LoadingIndicator.jsx](#fuente-S086) | Todos los resultados de consulta | scope,surface,size,context,className,announce; SVG y [shared/loading/indicator.css](#fuente-S109) | Presentación/aria-live; no bloquea operaciones ni limpia criterios |
| LoadingAction | Mismo archivo anterior | Continuidad de Kanban/pagos/historial y acciones | busy,children,surface,context,announce; conserva caja del botón | No aporta un único estilo de botón |
| ToastProvider | [capaVista/src/shared/notifications/ToastProvider.jsx](#fuente-S108) | Infraestructura de notificaciones; calendario la usa para errores, otros módulos para acciones | children; ToastContext y store; viewport por createPortal en document.body | El portal es de notificaciones, no del panel de filtros; no cambia la consulta |
| RoleGuard | [capaVista/src/shared/components/navigation/RoleGuard.jsx](#fuente-S107) | Las seis rutas; permiso/roles de acceso | requiredPermission,requiredRole(s),fallbackPath,children; useAuth/Navigate | Guard visual; los endpoints son la autoridad final |
| UserMovementsModal | [capaVista/src/modules/users/components/UserMovementsModal.jsx](#fuente-S023) | Usuarios y Perfil; búsqueda paginada de movimientos | user,api,onClose,title,description; dialog nativo y CSS propio | Es un componente de negocio, no un buscador genérico; reutilizarlo no duplica USR-F04 |

La reutilización por Perfil se localizó también mediante import y montaje de UserMovementsModal en capaVista/src/modules/profile/pages/ProfilePage.jsx (líneas12,183–). Esta referencia es evidencia de reutilización, no amplía la auditoría a un séptimo módulo ni el catálogo principal de116 fuentes.

### 11.2. Campos disponibles que actualmente no resuelven estas barras

[capaVista/src/shared/components/forms/TextInput.jsx](#fuente-S081) exporta TextInput: label/name/value/onChange/onClick/type/placeholder/disabled/error/id/readOnly/required/maxLength/describedBy/autoComplete; renderiza div.mb-3 y .form-control con feedback Bootstrap y aria-invalid/aria-describedby. [capaVista/src/shared/components/forms/SelectInput.jsx](#fuente-S082) exporta SelectInput: id/name/label/value/onChange/options/placeholder/disabled/className/required/error; usa .form-select y etiqueta envolvente, error y aria-invalid. Sus implementaciones completas están en catálogo. La búsqueda de imports/consumidores no muestra su uso en los controles de filtro aquí inventariados; aparecen en formularios de creación/edición, que no se han contado como filtros.

UserButton se reutiliza entre componentes del módulo Usuarios, con estilos .userButton, variantes primary/secondary/ghost/danger y busy. No es el botón compartido por los seis módulos. Los botones Aplicar/Mostrar/Limpiar de Kanban, calendario, pagos, historial y mensajes son botones HTML con CSS propio.

### 11.3. Hooks, servicios y utilidades compartidos

| Pieza | Fuente | Consumidores/contrato | Límites |
|---|---|---|---|
| useApiClient | [capaVista/src/hooks/useApiClient.js](#fuente-S072) | Los seis hooks de API; memoiza cliente por sesión vigente | No guarda filtros |
| useAuth | [capaVista/src/hooks/useAuth.js](#fuente-S073) | Router/pantallas/acciones; actor y hasPermission | No determina por sí solo scope de SQL |
| createApiClient | [capaVista/src/services/api/apiClient.js](#fuente-S074) | GET/POST/PATCH y errores comunes, timeout/abort/session | Contiene métodos de escritura: esta auditoría no los invocó |
| useKanbanApi/usePaymentsApi/useAdminUsersApi/useOrderHistoryApi/useOrdersCalendarApi/useMessagesApi | Una fuente por módulo en catálogo | Mismo patrón useMemo(factory(client),[client]) | Fábricas y serializadores separados, no filtro universal |
| historyReads | [capaVista/src/modules/orderHistory/utils/historyReads.js](#fuente-S035) | Lista/detalle historial: lecturas pendientes, fecha, append | No lo usan los demás módulos |
| calendarReads | [capaVista/src/modules/productionCalendar/utils/calendarReads.js](#fuente-S049) | Mes y pendientes: merge y overlays de escritura | No es caché permanente ni la misma deduplicación de historial |
| latestRequestTracker | [capaVista/src/modules/users/utils/latestRequestTracker.js](#fuente-S030) | Resumen de Usuarios | Lista de usuarios tiene otro contador/requestId |
| parseLimit/pageResult/cursores | [capaServidor/src/shared/pagination.js](#fuente-S106) | Kanban, pagos, historial y calendario | No reemplaza page/perPage de usuarios/mensajes |
| normalizeText | [capaVista/src/modules/kanban/utils/kanbanOrderRules.js:30–36](#fuente-S004) y [capaVista/src/modules/productionCalendar/pages/ProductionCalendarPage.jsx:33–39](#fuente-S044) | Algoritmo duplicado de trim/minúsculas/NFD en cliente | SQL LIKE depende de collation y comodines; no asumir equivalencia |
| userLifecycle/manageableRoles | [shared/userLifecycle.js](#fuente-S071), [shared/authorization.js](#fuente-S070) | Opciones de Usuarios y restricciones backend | Reglas de identidad, no tokens visuales |
| useToast | [capaVista/src/shared/notifications/useToast.js](#fuente-S087) | API de notificaciones estable en componentes | No es mecanismo de apertura/cierre de filtros |

### 11.4. Similares sin ser compartidos

- KanbanFilters y CalendarFilters comparten rejilla, labels uppercase .78rem/850, input mínimo3rem/borde#d7dee8/radio.55rem y sombra .22rem de foco, pero sólo Kanban tiene borrador y Aplicar.
- Los toggle de Kanban, Usuarios y CalendarHeader comparten bi-funnel y textos Mostrar/Ocultar; tamaños mínimos2.55/3.15/2.85rem, fondos/contextos y atributos ARIA difieren. Están en fuentes distintas, no en una variante de un botón común.
- Inputs search de Pagos/Usuarios/Historial/Calendario/Movimientos tienen cajas, iconos y confirmación diferentes. Mensajes carece de búsqueda, por lo que no debe recibir una sólo por simetría.
- Selectores de fechas de Pagos/Historial/Mensajes usan inputs nativos con min/max cruzados; hay funciones showPicker sólo en Pagos; borrar puede limpiar el rango o todos los criterios.
- Chips de Usuarios/Historial/Mensajes y botones de estado de Pagos comparten intención de selección única, pero no igual alcance de contador ni comportamiento de repetir una selección.

Estas similitudes permiten comparar componentes; no determinan cuál debe sustituir a otro.

## 12. Sistema visual actual

### 12.1. Tokens exactos y ámbitos de definición

Fuente central completa: [capaVista/src/styles/theme.css](#fuente-S078). Las definiciones son :root y se heredan salvo override en la página/componente. No se halló un selector de tema oscuro que cambie estos tokens en los estilos globales inspeccionados.

| Token / familia | Declaración literal | Archivo y contexto | Overrides/consumidores relevantes |
|---|---|---|---|
| --page-brand-orange / rgb | #FE5A00 / 254,90,0 | theme.css:24–25 | Calendar usa estos valores; PageHeader stripe; contador historial |
| --itexsa-orange / rgb | #f97316 / 249,115,22 | theme.css:44–45 | Mensajes y movimientos; distinto del brand-orange |
| --kanban-orange / rgb | #f97316 / 249,115,22 | Kanban.module.css:4–5 en filtersShell/kanbanWrapper | Overrides locales, no alias del brand |
| --payment-orange / rgb | #f97316 / 249,115,22 | PaymentConfirmationPage.module.css:3–4 | Filtros de pagos; KanbanBoardPage.module.css también declara variables con prefijo payment, pero KanbanFilters usa kanban |
| --users-orange / orange-soft | #f97316 / rgba(249,115,22,.12) | UserManagementPage.module.css:4–5 | Buscador, outline chips/toggle; no alias brand |
| --calendar-orange / rgb | var(--page-brand-orange) / var(--page-brand-orange-rgb) | ProductionCalendarPage.module.css:3–4 | #FE5A00 por herencia; estado hover/focus |
| --page-border | #D9DEE5 | theme.css:28 | PageSurface y --calendar-border |
| --kanban-border / --payment-border | #e5e7eb / #e5e7eb | CSS locales respectivos | Shell de Kanban/toolbar pagos |
| --users-border | #dfe5ec | UserManagementPage.module.css:2 | Card filtros/tabla |
| --itexsa-border | #e5e7eb | theme.css:43 | Disponible; varios controles usan literales del mismo color |
| --itexsa-muted / text | #64748b / #111827 | theme.css:48–49 | Movimientos/Mensajes y normalización visual local por módulo |
| --page-white/background/header-black | #FFFFFF / #F5F6F8 / #000000 | theme.css:23,26–27 | Marco compartido; body conserva #f8fafc global, tapado por PageShell según DOM |
| --page-space-x/y | 20px / 20px | theme.css:29–30 | Padding del shell en ambos ejes, no espaciado de cada control |
| --page-max-width | 1760px | theme.css:31 | PageShell; inbox lo cambia a78rem y detalle mensaje56rem mediante style |
| --page-radius / stripe-size | 16px / 4px | theme.css:32–33 | Marco y cabecera, no radio de inputs |
| --page-header-space-x/small/y | 32px /20px /24px | theme.css:34–36 | Header; inline container pequeño reduce sólo horizontal |
| --page-header-min-height/gap | 100px /24px | theme.css:37–38 | Header compartido, no altura de toolbar |
| --page-font-family | Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif | theme.css:39 | Títulos/calendario; body declara misma familia por separado |
| --page-title-small/medium/large | 24px /36px /48px | theme.css:40–42 | Container queries de header40rem/64rem |
| --itexsa-shadow | 0 18px 40px rgba(15,23,42,.06) | theme.css:50 | Panel de mensajes; otros shells repiten sombras distintas |
| --layer-pin-dialog/toast | 2000 /2010 | theme.css:20–22 | Capas de operación/notificación; no abren filtros |
| --stage-* | Pago#ca8a04, listo prod naranja brand, producción#2563eb, entrega#248f55, revisión#dc2626 | theme.css:2–19 | Etapas de tarjetas; no determinan el estado activo de los filtros |

No se confunden color del badge de etapa y color de selección del filtro. Tokens --users-red/green y --payment-red/green son de estado de datos/acciones; no crean opciones de filtro. Hay literales de foco adicionales (p.ej. rgba(238,117,45,.28) en el estado de Pagos) que no se derivan de los tokens.

### 12.2. Tipografía y métricas que no se pueden inventar

global.css:13–19 usa font:inherit para controles. Eso define la cadena de herencia cuando una regla de módulo/Bootstrap no la supera en especificidad; no significa que todos los controles acaben computados idénticos. Se observan pesos 600,700,750,780,800,850 y900; la disponibilidad de esas variantes y su síntesis por el navegador no se verificó.

Los campos Kanban con .form-control/.form-select tienen padding/line-height/fondo/placeholder de Bootstrap más overrides locales. Los otros módulos usan en gran parte input/select sin clases Bootstrap; los menús de select y calendario se renderizan nativamente. El informe incluye todas las declaraciones propias relevantes; **no asigna valores fijos inventados** a font-size, ancho de opción, line-height o altura computada no declarados. «Auto/heredado/no declarado localmente» en matrices conserva esa distinción.

Ningún panel de filtros usa width/height exactos de popup; son bloques normales con ancho disponible. Pagos/Usuarios contienen min-width0 para encogerse, Kanban/Calendario grid minmax y media queries; Historial/Mensajes flex-wrap. El modal de movimientos sí tiene ancho máximo y alto máximo; no es comparable a una toolbar permanente.

### 12.3. Capas, clipping y menús

Las aperturas de Kanban/Usuarios/Calendario insertan un div/section en el flujo normal, por lo que no hay coordenadas de anclaje de un dropdown propio ni offset calculado. Los contenedores con overflow:hidden pueden recortar outlines/sombras en bordes; es **un riesgo a ensayar**, no una superposición observada. El modal de movimientos usa dialog.showModal y top layer nativo; el del día de calendario usa capa fixed1070. ToastProvider creaPortal al body con viewport separado: la existencia de ese portal no convierte los filtros en popovers.

No se encontró un componente de menú de filtros con cierre exterior/Escape entre los seis módulos. El cierre de selectors/date pickers depende de controles nativos, y no está inspeccionado visualmente. La única animación explícita de entrada del panel de filtros es filterEnter .18s en Kanban; sus hover transform .15s son otro fenómeno. Las reglas de indicadores de carga sí contemplan prefers-reduced-motion/forced-colors; eso no acredita que todos los filtros tengan adaptación equivalente.

## 13. Comparación entre módulos

### 13.1. Presentación y estructura

Todos los «Sí/No» siguientes se refieren a lo encontrado en código; la representación real en navegador sigue no verificada.

| Característica | Kanban | Pagos | Usuarios | Historial | Calendario | Mensajes |
|---|---|---|---|---|---|---|
| Filtros visibles por defecto | No; sólo franja | Sí | Search sí; estado/rol no | Sí, en lista y detalle | No; botón en header | Sí |
| Botón para desplegar | Mostrar/Ocultar filtros | No | Mostrar/Ocultar filtros | No | Mostrar/Ocultar filtros | No |
| Modal/popover/dropdown | Panel inline; select nativo | Date picker nativo; toolbar | Panel inline + dialog de movimientos | Select/eventos y fechas nativos; sin panel flotante | Panel inline; modal de día es navegación | Date picker nativo; chips inline |
| Búsqueda | NV y cliente separados | RUT/NV/cliente | Usuario + secundaria en modal | NV/cliente | NV/cliente/producto | No existe |
| Selectores | Producto | Estados con botones, fechas | Estado/rol con chips | Estado con chips; tipo en select | Estado/producto en select | Lectura/orden con chips |
| Selección múltiple | No | No | No | No | No | No |
| Fechas de filtro | No | Desde/Hasta de creación | No | Desde/Hasta de creación | Navegación mes/entrega, no input de rango | Desde/Hasta de publicación |
| Limpiar | Todos los criterios, botón Limpiar | Sólo X del rango; vaciar search | Limpiar filtros completo; modal limpieza propia | Restablecer fechas; Todos y búsqueda vacía por submit | Limpiar filtros completo | Restablecer todo, incluido orden |
| Indicadores de activo | Campos/borrador; sin badge global | Estado, contadores y grupo temporal activo | Chips, valores y botón limpiar enabled | Chip activo, valores, contador página | Valores en panel; sin badge exterior | Chip activo/valores y total |
| Responsive definido | Grid5→2→1; botones100% móvil | Grid auto-fit/3→2→1 y fechas apiladas | Topbar3→2→1; chips1 móvil | Flex-wrap; search a700px; detalle a600px | Filtros1 a992px; resultados tienen container query | Panel vertical a1200px; fechas/chips flex móvil |
| Observación visual real | No verificado | No verificado | No verificado | No verificado | No verificado | No verificado |

### 13.2. Dimensiones y estilos comparados

Se mantienen unidades CSS. «Mín.» es min-height, no height calculada. Perfiles V-* de las secciones5–10 y el catálogo contienen los pseudoselectores completos.

| Característica | Kanban | Pagos | Usuarios | Historial | Calendario | Mensajes |
|---|---|---|---|---|---|---|
| Altura controles | Inputs/select mín.3rem | Search/grupo fechas mín.3.35rem; search móvil2.9rem; input de fecha sin mín. propia | Search mín.3.15rem; chips2.25rem; modal search2.75rem | Search2.7rem; fechas2.55rem; select detalle2.5rem; chips sin mín. | Inputs/select3rem | Fechas2.4rem; chips2.35rem |
| Altura botones | Toggle/Aplicar/Limpiar2.55rem | Estado3.15rem (móvil2.85); X height2rem | Toggle3.15rem; Limpiar2.4rem; modal2.65rem | Buscar2.5rem; restablecer2.55rem; cargar eventos2.65rem | Toggle2.85rem; Limpiar3rem; navegación2.6rem | Restablecer2.4rem |
| Padding input/caja | Bootstrap + override de borde/alto; sin padding local | Search0 .9rem; grupo .38 .65; input fecha .08rem0 | Caja search0 1rem; modal .5 .8rem | Search0 .85rem; fecha0 .7rem | .55rem .7rem | Fecha .35rem .65rem |
| Padding botón | .55rem .9rem | Estado .72rem1rem, móvil .58 .72; X0 | Toggle/Limpiar .45 .9rem; chips .35 .85; modal .5 .8rem | Chip .48 .8rem; Buscar .5 .9; reset .5 .8 | Toggle .6 1rem; clear .55 .9; nav .5 .75 | Chip .45 .78rem; reset sin padding local explícito |
| Gap agrupación | Grid1rem, acciones .75 | Toolbar1.25, estados/controles .85, fechas .6 | Topbar .8, panel1, opciones .5; modal .6 | Estados .5, search .65, fechas .75 | Card1; labels .45; nav .75 | Panel1.25, grupos1, chips .4, fechas .65 |
| Radio controles/botones | .55rem | .55rem botones/search; .65 fechas; badge999px | Search .6; toggle .55; chips999; modal .55 | Search .75; fechas .65; buscar .7; chips999; detalle .7 | Inputs/clear .55; toggle .75; nav .5 | Chips999; fechas .65 |
| Bordes de control | 1px #d7dee8 | Estado#e1e7ef; search#d7dee8; grupo#cbd5e1 | Search/chips#dbe3ef; toggle#cbd5e1; modal#dbe3ed | Inputs#dbe1e8; chips#e2e8f0 | #d7dee8; clear#d3d9e2 | Chips#e2e8f0; fechas#dbe3ed |
| Fondo normal/activo | Shell#fff; toggle negro translúcido/naranja; aplicar negro | Estado#fff→#000; fechas#f8fafc→#fff; search sin fondo local propio | Search/chips#f4f4f5; chip activo#000 | Chip#f8fafc→#111827; inputs herencia/nativo | Panel#fff; toggle naranja alpha.12→naranja | Chip#f8fafc→#fff1e7; panel#fff |
| Tamaño/peso | Labels .78/850; toggle780; controles heredan Bootstrap | Estado1rem/600, search .92 cursiva, fechas .78/750, label .58/850 | Search heredado; legend .78/850; toggle800; chip no especificado; modal botón750 | Chip .82/800; fechas label .78/800; button800 | Label .78/850; control heredado; toggle850; clear780; nav .85/700 | Chip .8/700; label .7/800; clear .78/700; fecha heredado |
| Altura/ancho contenedor | Auto; grid5 aunque3 campos; panel padding1rem | Auto; bases38rem auto-fit/width100% | Auto; topbar search min16rem; modal66rem con límites viewport | Auto; tabla mín900px sólo resultados | Auto; grid1.4fr 1fr 1fr auto; días modal42rem | Auto; PageShell max78rem; panel flex |
| Iconos | Funnel heredado | Search1.2rem; X heredado | Search1.15rem; funnel heredado; modal1.7rem header | Search heredado | Funnel heredado; nav botones .85rem heredable | Chips/reset heredado; total1.35rem fuera de filtros |
| Sombra contenedor | 0 14px 32px alpha.045 | Toolbar sin sombra propia; hover botón0 .55rem1.2rem alpha.08 | 0 8px24px alpha.045; modal0 24px70px #0004 | Sin sombra panel propia; detalle0 8px24px alpha.04 | 0 14px32px alpha.045 | --itexsa-shadow:0 18px40px alpha.06 |
| Foco | Border naranja + .22rem alpha.18 inputs; botones outline none/cambio color | Search/fechas .22rem alpha.14; estado outline3px rgba23811745,.28 | Search .18rem; toggle/chip outline2px+shadow.2rem; clear sin misma regla | Predomina navegador, sin regla local de input | Inputs .22rem alpha.18; toggle outline2px blanco; nav2px naranja | Fecha shadow3px alpha.12; chips sin foco local específico |
| Breakpoints filtros | 1199.98/767.98px | 1399.98/991.98/767.98/575.98/399.98/360px | 991.98/575.98px; modal767.98/575.98 | Search700px; detalle600px | Header/panel991.98px; nav575.98px | 1199.98/575.98px |
| Line-height/tracking | Eyebrow1; label .055em | Count1; label1/.07em; fecha1.25 | Legend .06em; inputs heredado | No line-height local filtros | Label .055em; inputs heredado | Label .06em; inputs heredado |

No hay una medida única por módulo ni una inferencia automática de px. Las medidas de tabla, header global, botones de operación o cards no se presentan como alturas de filtro.

### 13.3. Comparación funcional y persistencia

| Rasgo | Kanban | Pagos | Usuarios | Historial | Calendario | Mensajes |
|---|---|---|---|---|---|---|
| Procesamiento | Servidor candidatos + AND local | Servidor | Servidor | Servidor | Local después de cargar mes/pendientes | Servidor |
| Aplicación texto | Aplicar filtros | Pausa250ms | Pausa350ms; modal submit | Submit Buscar | Inmediata | No texto |
| Otros criterios | Aplicar todos | Inmediatos | Inmediatos | Inmediatos | Inmediatos/local | Inmediatos |
| Fechas significan | No UI de fecha | Creación pedido | No filtros de fecha | Creación pedido; búsqueda temporal implícita; no fecha-evento UI | Período de entrega para carga, fecha local al navegar | Publicación mensaje |
| Combinación | Textos AND local; único search remoto; producto | Estado AND texto AND rango | Estado AND rol AND texto; movimientos separados por sujeto | Estado AND texto AND rango; detalle type dentro de pedido | Texto AND estado AND producto; sólo cuadrícula | Lectura AND rango; orden separado |
| Dependencias de opciones | Producto estático | Estado estático; catálogo backend para mutar | Roles del actor; estados alias | Opciones estáticas | Estados estáticos con fallback por paso | Opciones estáticas |
| Continuidad | Cursor50 y load more | Cursor50 y load more | Page10; modal page10 | Cursor50; detalle cursor tiempo+ID | Cursor100 agotado automáticamente | Page12 |
| Alcance contador | Tarjetas cargadas por columna | Search/rango, tres estados globales | Global issuer para resumen; total de consulta para tabla | Filas de página en header | Pendientes/traslados por su colección | Total de consulta actual |
| Cierre panel | Mantiene borrador/aplicado | No panel | Mantiene estado/rol; modal se destruye al cerrar | No panel | Mantiene filtros | No panel |
| Navegar fuera | Sin persistencia explícita | Sin persistencia explícita | Sin persistencia explícita | Volver de detalle remonta lista | Cambio mes mantiene, salir no | Volver de mensaje remonta inbox |
| Concurrencia | Abort+requestId; catálogo estadosTTL30s | Abort+requestId+scope y controles de escritura | Abort+requestId; tracker resumen | Lecturas pendientes por API/params+abort | Abort+active+overlays confirmados | Abort+requestId |
| Singularidad | Mixto exclusivo y prioridades productivas | Contadores sin status/cursor y editor separado | Scope identidad/roles + modal movimientos | Tipo de evento y cursor compuesto | Bandejas no filtradas; navegación mensual | Mensajes propios; abrir puede marcar leído |

## 14. Inconsistencias y oportunidades detectadas

Clasificación requerida: **C1** elemento común susceptible de estandarización; **C2** diferencia visual que requiere decisión; **C3** particularidad funcional a conservar; **C4** posible problema técnico; **C5** información insuficiente. La columna Evidencia diferencia lectura estática de efectos reales. Ninguna fila autoriza una corrección automática.

| ID / clase | Hallazgo y evidencia precisa | Comparación / posible impacto | Qué considerar después |
|---|---|---|---|
| H01 · C1 | Tres toggles con bi-funnel y textos idénticos: KanbanFilters38–45, UserManagementFilters45–54 y CalendarHeader6–10; CSS distintos | Se repiten evento de apertura y contenido inline, pero altura/contexto/ARIA no son iguales | Separar presentación común de semántica de estado/borrador, sin imponer un toggle a pagos/historial/mensajes |
| H02 · C2 | Naranjas #FE5A00 en theme24 frente #f97316 en Kanban4/PaymentPage3/UsersPage4/Mensajes vía itexsa; focus pago rgba23811745 | Acentos similares con valores distintos; se verifica declaración, no inconsistencia perceptual medida | Decidir paleta de superficie/acción/foco sin confundir etapas/urgencia |
| H03 · C2 | Alturas search Kanban3rem, Pagos3.35, Usuarios3.15, Historial2.7 y Calendario3; etiquetas entre .58 y .78rem | Diferencias cuantificadas en matriz13.2; no prueban incumplimiento por sí solas | Densidades por contexto y tamaño de target con medición real |
| H04 · C4 | Kanban filterGrid repeat(5,...) en styles98–102 contiene sólo3 labels; a1199.98 pasa2 | Espacio potencialmente vacío o inputs estrechos en escritorio; no observado en DOM | Confirmar intención y ancho útil con sidebar antes de proponer grid nuevo |
| H05 · C4 | «Mixto» local getOrderCoreProductTypes/count≥2 en rules57–101, frente SQL product LIKE '%mixto%' en kanbanRead36–38 | Divergencia estática confirmada; un pedido Lanyard+Tarjeta no necesita tener producto llamado Mixto. Función pura comprobada; integración/datos no | Acordar contrato de composición y paginación antes de unificar select |
| H06 · C3/C4 | Kanban envía search=NV||cliente (Column81,144) y luego AND local en rules81–87 | No es consulta AND de dos campos al servidor; puede dejar páginas visualmente escasas y conteos parciales | Preservar condiciones independientes; cualquier cambio de endpoint sería otra tarea |
| H07 · C3 | Kanban tipo simple exige exactamente1; CAL producto usa some igualdad en Page181–183 | Un mixto se excluye de Lanyard en Kanban pero puede incluirse en Calendario | No igualar reglas por compartir etiqueta de opción |
| H08 · C3 | Search se confirma con Aplicar/submit/debounce/inmediato según módulo (ver fichas) | Unificar eventos puede multiplicar requests o aplicar borradores sin permiso del usuario | Una futura UI debe conservar o acordar explícitamente cada política |
| H09 · C4/C5 | CalendarPage234 entrega allItems sin predicado; Grid43–58 deriva pendientes de sourceItems; transferItems separado | Filtros visibles no afectan toda la pantalla. Hecho estático, intención de negocio no confirmada | Decidir alcance y comunicación, no extender filtro ciegamente a la bandeja de trabajo |
| H10 · C4 | CAL estado item.status===filters.status (Page180) y getCalendarOrderStatus devuelve trim sin normalizar (calendarOrder4–8) | Riesgo si API devuelve capitalización/acentos diferentes; search/producto sí normalizan | Verificar datos/contrato antes de clasificarlo como fallo reproducido |
| H11 · C4 | Historial listOrders usa search sin eliminarlo y dateRangeFromSearch(search) (service261–266), SQL AND LIKE(search)+rango | Escribir una fecha puede devolver cero aunque existan pedidos de ese día, salvo coincidencia textual | Confirmar intención del criterio implícito y etiquetas de ayuda; no reparado |
| H12 · C3 | PAG/HIS filtran fecha_creacion, MSG fecha_publicacion; CAL carga fecha_estimada_termino | Un date range visualmente igual limita hechos de negocio distintos | Mantener rótulos, límites inclusivos y zona temporal |
| H13 · C3/C5 | UTC de predicados frente Date local de navegación/dueDate slice(0,10) | No se ensayaron frontera de día/mes, DST ni timezone de BD | Medir con datos sintéticos controlados en otra tarea; no asumir error de un día |
| H14 · C4 | Kanban y Calendar toggle sin aria-expanded/aria-controls; Usuario sí los tiene | Falta información de expansión por código; experiencia asistiva sin ensayar | Verificar accesibilidad de controles equivalentes |
| H15 · C4 | HIS estado activo sólo clase; PAG/USR/MSG aria-pressed | Semántica de selección divergente, aunque los botones HTML son accionables por teclado | No confundir foco con selección persistente |
| H16 · C4 | User clearFiltersButton no aparece en .filterToggleButton:focus-visible/... (Users499–505) ni disabled de .userButton (397–401) | Apariencia de foco/deshabilitado queda a reglas nativas distintas del resto | Comprobar foco y disabled real; no se modificó CSS |
| H17 · C4 | KAN/PAG/CAL algunos botones outline:none en focus; HIS/MSG varios botones sin regla local de foco | No demuestra que no exista foco por navegador, pero no hay tratamiento uniforme propio | Ensayar teclado/alto contraste; no inventar certificación WCAG |
| H18 · C4 | MessageList17 dice «No tienes mensajes nuevos.» para cualquier messages.length===0 | Leídos o período vacío pueden comunicar ausencia incorrectamente; HIS/PAG explican filtros | Distinguir vacío inicial de cero coincidencias en futura redacción |
| H19 · C3 | Contadores KAN/PAG/USR/HIS/CAL/MSG tienen alcances diferentes, fuentes en13.3 | El mismo badge no implica la misma métrica; «total» no siempre es BD completa | Documentar scope junto a API/etiqueta, evitar recomputar desde filas visibles |
| H20 · C1 | URLSearchParams/queryString duplicado en seis adaptadores; hooks useMemo casi idénticos | Código común posible sin que exista actualmente un servicio de filtros único | Analizar compatibilidad de signal y parámetros antes de extraerlo |
| H21 · C1/C3 | Min/max de fecha cruzados en PAG/HIS/MSG, showPicker sólo PAG; validación local estricta sólo HIS | Superficie común con diferencias de fallback/error | Reusar patrones de campo sin cambiar semántica de UTC/submit |
| H22 · C4/C5 | Resumen de usuarios puede incluir Pendiente rol, pero opción UI comentada; total de linked incluye Activo+Vinculado | Hay estados de datos no expuestos como filtro específico; no implica error de autorización | Determinar si se requiere opción o sólo resumen; no habilitarla en esta auditoría |
| H23 · C4 | Backend recorta search/productType a100 en órdenes; KAN/PAG inputs sin maxLength; HIS/USR principal no recortan aquí | Contratos de longitud y riesgo de consultas amplias distintos | Revisar con evidencia de carga; no cambiar dependencias/endpoints ahora |
| H24 · C4/C5 | Predicados SQL LIKE interpolan el patrón parametrizado con %term%; %/_ pueden actuar como comodines; búsquedas locales usan includes | Parametrización evita concatenación insegura de valores, pero no iguala semántica de coincidencia ni collation | Verificar escape literal y collation deseada; no afirmar vulnerabilidad de inyección |
| H25 · C3 | Cerrar panel mantiene criterios y en Kanban mantiene borradores; desmontar/reset de cuenta destruye estado | Uniformar cierre sin separar estado podría perder trabajo o revelar datos de otra sesión | Conservar scopes, abort y requestId en cualquier rediseño |
| H26 · C4 | Inbox pagination mobile font-size0 en botones (MessageInboxPage.module.css15), iconos aria-hidden sin aria-label individual | Posible nombre accesible vacío en continuidad de resultados; no es un nuevo filtro | Verificar en árbol accesible móvil; no corregido |
| H27 · C3/C4 | Users roles dependen de actor; list predicate excludes privileged; estado Vinculado incluye Activo | Cualquier selector genérico que ofrezca ROLES completo expondría opciones no autorizadas | Mantener manageableRoles, backend scope e identidad |
| H28 · C4/C5 | Panels overflow:hidden en KAN y CAL y tabla en HIS; sombra/outline puede extenderse | Posible clipping, no observado; pickers nativos no necesariamente se recortan con DOM | Medir geometría/foco/popup en navegador antes de rediseñar |
| H29 · C3 | Falta de persistencia explícita en URL/storage en los seis flujos | Volver de detalle no reproduce necesariamente filtros; no se exige que lo haga | Decisión funcional futura, no inferir persistencia sólo por navegación SPA |
| H30 · C5 | Sin revisión visual ni ejecución contra API/roles reales | No se certifican accesibilidad, contraste, ancho computado, mobile gestures ni coherencia de datos | Mantener estas limitaciones en cualquier análisis externo del informe |

## 15. Catálogo de archivos y código fuente

### 15.1. Convenciones de este catálogo

Las siguientes **116 entradas** contienen el código original, sin reescritura, refactorización ni pseudocódigo. Cada bloque identifica ruta exacta, responsabilidad/componente/función, filtros relacionados y rango1-based. Se mantiene el texto de cada línea original; sólo se normaliza el separador de línea del Markdown a LF para insertar las extracciones. Las referencias Snnn son anclas internas de este documento.

Los bloques parciales pertenecen a archivos mayores: se incluyen las declaraciones/estados/consumidores relevantes y se enumeran todos los intervalos omitidos para que el analista sepa dónde hay contexto externo. Un extracto de método conserva su indentación y puede necesitar su clase/operaciones vecinas para compilar; no se presenta como un nuevo archivo ejecutable. Los componentes dedicados a filtros y su CSS se incluyen completos.

Las dependencias externas se describen mediante package.json y usos del proyecto: no se copia código de terceros. Los valores de .env, credenciales, tokens y claves quedan excluidos. cursorSecret se explica como dependencia de configuración y no se reproduce su valor de prueba ni valores privados.



### 15.2. Kanban

<a id="fuente-S001"></a>

#### S001 — capaVista/src/modules/kanban/components/KanbanFilters.jsx

**Tipo:** JSX/React. **Responsabilidad, componentes y funciones:** KanbanFilters; estado borrador, apertura, tres controles y botones. **Filtros relacionados:** KAN-F01–KAN-F03.

**Exportaciones declaradas** (línea inicial): 10: export default function KanbanFilters({ onApplyFilters, onClearFilters }) {.

**Relaciones/imports originales:** <code>react</code>, <code>../styles/Kanban.module.css</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 101 líneas originales; incluidos 1–101; cobertura completa. Huella SHA-256 inicial del archivo: C660C05E7D5D3684476B2191E22176B88C9D7A2124D7276A4AE040635F7AE5C7.

**S001: capaVista/src/modules/kanban/components/KanbanFilters.jsx, líneas 1–101.** Componente/función o selectores: KanbanFilters; estado borrador, apertura, tres controles y botones. Filtros: KAN-F01–KAN-F03. Fragmento literal:

```jsx
import { useState } from 'react'
import styles from '../styles/Kanban.module.css'

const EMPTY_FILTERS = Object.freeze({
  clientName: '',
  salesNoteNumber: '',
  productType: '',
})

export default function KanbanFilters({ onApplyFilters, onClearFilters }) {
  const [showFilters, setShowFilters] = useState(false)
  const [draftFilters, setDraftFilters] = useState(EMPTY_FILTERS)

  function updateFilter(field, value) {
    setDraftFilters((currentFilters) => ({
      ...currentFilters,
      [field]: value,
    }))
  }

  function applyFilters() {
    onApplyFilters?.(draftFilters)
  }

  function clearFilters() {
    setDraftFilters(EMPTY_FILTERS)
    onClearFilters?.()
  }

  return (
    <section className={styles.filtersShell}>
      <div className={styles.filtersTopbar}>
        <div>
          <span className={styles.filtersEyebrow}>Busqueda de ordenes</span>
          <h2>Filtros del tablero</h2>
        </div>

        <button
          className={styles.filterToggleButton}
          onClick={() => setShowFilters((currentValue) => !currentValue)}
          type="button"
        >
          <i className="bi bi-funnel" aria-hidden="true" />
          {showFilters ? 'Ocultar filtros' : 'Mostrar filtros'}
        </button>
      </div>

      {showFilters && (
        <div className={styles.filterCard}>
          <div className={styles.filterGrid}>
            <label>
              <span>Numero de pedido</span>
              <input
                className="form-control"
                onChange={(event) => updateFilter('salesNoteNumber', event.target.value)}
                placeholder="Ej. 24038"
                type="text"
                value={draftFilters.salesNoteNumber}
              />
            </label>

            <label>
              <span>Nombre del cliente</span>
              <input
                className="form-control"
                onChange={(event) => updateFilter('clientName', event.target.value)}
                placeholder="Ej. Colegio Andes"
                type="text"
                value={draftFilters.clientName}
              />
            </label>

            <label>
              <span>Tipo de producto</span>
              <select
                className="form-select"
                onChange={(event) => updateFilter('productType', event.target.value)}
                value={draftFilters.productType}
              >
                <option value="">Todos</option>
                <option value="lanyard">Lanyard</option>
                <option value="tarjeta">Tarjeta</option>
                <option value="yoyo">Yoyo</option>
                <option value="mixto">Mixto</option>
              </select>
            </label>
          </div>

          <div className={styles.filterActions}>
            <button className={styles.applyFilterButton} onClick={applyFilters} type="button">
              Aplicar filtros
            </button>
            <button className={styles.resetFilterButton} onClick={clearFilters} type="button">
              Limpiar
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
```

<a id="fuente-S002"></a>

#### S002 — capaVista/src/modules/kanban/pages/KanbanBoardPage.jsx

**Tipo:** JSX/React. **Responsabilidad, componentes y funciones:** KanbanBoardPage; filtros aplicados y conexión con tablero. **Filtros relacionados:** KAN-F01–KAN-F03.

**Exportaciones declaradas** (línea inicial): 56: export default function KanbanBoardPage() {.

**Relaciones/imports originales:** <code>../../../shared/components/loading/LoadingIndicator</code>, <code>react</code>, <code>../components/KanbanColumn</code>, <code>../components/KanbanFilters</code>, <code>./KanbanBoardPage.module.css</code>, <code>../../../shared/components/layout/PageShell</code>, <code>../../../shared/components/layout/PageHeader</code>, <code>../../../hooks/useAuth</code>, <code>../../../config/permissions</code>, <code>../hooks/useKanbanApi</code>, <code>../../../shared/notifications/useToast</code>, <code>../../../shared/notifications/operationFeedback</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 289 líneas originales; incluidos 1–12, 56–70, 175–211. Fuera de extracción: 13–55, 71–174, 212–289; corresponden al contexto restante del archivo y no se sustituyen por código inventado. Huella SHA-256 inicial del archivo: C6DA46FFA9304621C5E6698A1AFE751DA0D2FDEDA67A93CCBC7FA5181666FE9E.

**S002: capaVista/src/modules/kanban/pages/KanbanBoardPage.jsx, líneas 1–12.** Componente/función o selectores: KanbanBoardPage; filtros aplicados y conexión con tablero. Filtros: KAN-F01–KAN-F03. Fragmento literal:

```jsx
import LoadingIndicator, { LoadingAction } from '../../../shared/components/loading/LoadingIndicator'
import { useEffect, useMemo, useRef, useState } from 'react'
import KanbanColumn from '../components/KanbanColumn'
import KanbanFilters from '../components/KanbanFilters'
import styles from './KanbanBoardPage.module.css'
import PageShell, { PageSurface } from '../../../shared/components/layout/PageShell'
import PageHeader from '../../../shared/components/layout/PageHeader'
import { useAuth } from '../../../hooks/useAuth'
import { PERMISSIONS } from '../../../config/permissions'
import { useKanbanApi } from '../hooks/useKanbanApi'
import { useToast } from '../../../shared/notifications/useToast'
import { operationFailureMessage, requiresContext, uncertainOperation } from '../../../shared/notifications/operationFeedback'
```

**S002: capaVista/src/modules/kanban/pages/KanbanBoardPage.jsx, líneas 56–70.** Componente/función o selectores: KanbanBoardPage; filtros aplicados y conexión con tablero. Filtros: KAN-F01–KAN-F03. Fragmento literal:

```jsx
export default function KanbanBoardPage() {
  const notify = useToast()
  const api = useKanbanApi()
  const { hasPermission } = useAuth()
  const [capacityApi, setCapacityApi] = useState(null)
  const isCapacityOpen = capacityApi === api
  const [capacityError, setCapacityError] = useState('')
  const [savingCapacity, setSavingCapacity] = useState({ api: null, busy: false })
  const isSavingCapacity = savingCapacity.api === api && savingCapacity.busy
  const capacityPending = useRef(false)
  const operationScope = useRef(0)
  const [loadedCapacityApi, setLoadedCapacityApi] = useState(null)
  const isLoadingCapacity = loadedCapacityApi !== api
  const [appliedFilters, setAppliedFilters] = useState({})
  const [kanbanRefreshKey, setKanbanRefreshKey] = useState(0)
```

**S002: capaVista/src/modules/kanban/pages/KanbanBoardPage.jsx, líneas 175–211.** Componente/función o selectores: KanbanBoardPage; filtros aplicados y conexión con tablero. Filtros: KAN-F01–KAN-F03. Fragmento literal:

```jsx
  return (
    <PageShell className={styles.page}>
      <PageSurface className={styles.dashboardShell}>
        <PageHeader title="Kanban" actions={
          <div className={styles.heroActions}>
            <aside className={`${styles.capacityMeter} ${styles[loadLevel]}`} aria-label="Carga Operativa">
              <div className={styles.capacityHeader}>
                <span>Carga Operativa</span>
                <div className={styles.capacityHeaderActions}>
                  <strong>{isLoadingCapacity ? <LoadingIndicator scope="action" surface="dark" context="Carga operativa" /> : `${operationalLoad.percentage}%`}</strong>
                  {canManageProductionLoad && (
                    <button aria-label="Configurar carga operativa" disabled={isLoadingCapacity} onClick={() => setCapacityApi(api)} title="Configurar carga operativa" type="button">
                      <i className="bi bi-sliders" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
              <div className={styles.capacityNumbers}>
                <strong>{operationalLoad.lanyardsInProduction}</strong>
                <span>/ {operationalLoad.capacity} lanyards por dia</span>
              </div>
              <div className={styles.capacityTrack} aria-hidden="true">
                <span className={styles.capacityFill} style={{ width: progressWidth }} />
              </div>
              <p>Solo pedidos lanyard en En produccion.</p>
            </aside>
          </div>
        } />

        <div className={styles.content}>
          <KanbanFilters
            onApplyFilters={(nextFilters) => setAppliedFilters(nextFilters)}
            onClearFilters={() => setAppliedFilters({})}
          />
          <KanbanColumn filters={appliedFilters} refreshKey={kanbanRefreshKey} />
        </div>
      </PageSurface>
```

<a id="fuente-S003"></a>

#### S003 — capaVista/src/modules/kanban/components/KanbanColumn.jsx

**Tipo:** JSX/React. **Responsabilidad, componentes y funciones:** KanbanColumn; consultas, cancelación, paginación, clasificación y resultados. **Filtros relacionados:** KAN-F01–KAN-F03.

**Exportaciones declaradas** (línea inicial): 477: export default KanbanColumn.

**Relaciones/imports originales:** <code>../../../shared/components/loading/LoadingIndicator</code>, <code>../utils/kanbanColumns.js</code>, <code>../utils/kanbanOrderMapping.js</code>, <code>../utils/kanbanOrderRules.js</code>, <code>./DroppableColumn.jsx</code>, <code>./MoveToProductionModal.jsx</code>, <code>react</code>, <code>../hooks/useKanbanApi</code>, <code>../../../hooks/useAuth</code>, <code>../utils/orderStagePatch</code>, <code>../../../config/permissions</code>, <code>../styles/Kanban.module.css</code>, <code>../../../shared/notifications/useToast</code>, <code>../../../shared/notifications/operationFeedback</code>, <code>@dnd-kit/react</code>, <code>./KanbanCard</code>, <code>./KanbanOffCanvas</code>, <code>./KanbanDetailBoundary.jsx</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 477 líneas originales; incluidos 1–166, 390–477. Fuera de extracción: 167–389; corresponden al contexto restante del archivo y no se sustituyen por código inventado. Huella SHA-256 inicial del archivo: 1B27FEC3ADC2E7BF2F72B5F30644BD05B54162AD5793B12A7D57489D4C091307.

**S003: capaVista/src/modules/kanban/components/KanbanColumn.jsx, líneas 1–166.** Componente/función o selectores: KanbanColumn; consultas, cancelación, paginación, clasificación y resultados. Filtros: KAN-F01–KAN-F03. Fragmento literal:

```jsx
import LoadingIndicator, { LoadingAction } from '../../../shared/components/loading/LoadingIndicator'
import {
  baseColumns,
  STAGE_BACKWARD_MESSAGE,
  STAGE_SKIP_MESSAGE,
  KANBAN_EN_PRODUCCION_STEP,
  MOVE_TO_PRODUCTION_PERMISSION_MESSAGE,
  KANBAN_REVISION_STEP,
} from '../utils/kanbanColumns.js';
import { normalizeOrder, normalizeStatus } from '../utils/kanbanOrderMapping.js';
import { normalizeText, isItemReadyForDelivery, isPaymentConfirmed, hasOrderLabel, sortOrdersForColumn } from '../utils/kanbanOrderRules.js';
import { DroppableColumn } from './DroppableColumn.jsx';
import { MoveToProductionModal } from './MoveToProductionModal.jsx';
import { useState, useEffect, useRef } from 'react';
import { useKanbanApi } from '../hooks/useKanbanApi';
import { useAuth } from '../../../hooks/useAuth';
import { applyOrderStagePatch } from '../utils/orderStagePatch';
import { PERMISSIONS } from '../../../config/permissions';
import styles from '../styles/Kanban.module.css';
import { useToast } from '../../../shared/notifications/useToast'
import { publicOperationMessage } from '../../../shared/notifications/operationFeedback'
import { DragDropProvider } from '@dnd-kit/react';
import KanbanCard from './KanbanCard';
import KanbanOffCanvas from './KanbanOffCanvas';
import KanbanDetailBoundary from './KanbanDetailBoundary.jsx';

function KanbanColumn({ filters, refreshKey = 0 }) {
  const notify = useToast()
  const [orders, setOrders] = useState([])
  const [columns, setColumns] = useState(baseColumns)
  const [loading, setLoading] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [detailScope, setDetailScope] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState(null)
  const detailRequestId = useRef(0)
  const [loadError, setLoadError] = useState(null)
  const [pageInfo, setPageInfo] = useState({ nextCursor: null, hasMore: false })
  const [loadingMore, setLoadingMore] = useState(false)
  const listRequestId = useRef(0)
  const morePending = useRef(false)
  const moveValidation = useRef(false)
  const moreController = useRef(null)
  const detailController = useRef(null)
  const moveController = useRef(null)
  const sessionVersion = useRef(0)
  const pendingLabels = useRef(new Set())
  const [busyLabels, setBusyLabels] = useState({ api: null, ids: new Set() })
  const [validatingMove, setValidatingMove] = useState(false)
  const [pendingProductionMove, setPendingProductionMove] = useState(null)
  const kanbanApi = useKanbanApi()
  const { hasPermission } = useAuth()
  const canFinishProduction = hasPermission(PERMISSIONS.MOVE_ORDERS)

  useEffect(() => {
    const requests = detailRequestId
    const version = sessionVersion
    const labels = pendingLabels.current
    return () => {
      requests.current++
      version.current++
      detailController.current?.abort()
      moveController.current?.abort()
      labels.clear()
    }
  }, [kanbanApi])

  useEffect(() => {
    const requests = listRequestId
    const id = ++requests.current
    const controller = new AbortController()
    const loadOrders = async () => {
      setLoading(true)
      setLoadingMore(false)
      morePending.current = false
      try {
        setLoadError(null)

        const orderWork = kanbanApi.getOrders({
          limit: 50,
          search: filters?.salesNoteNumber || filters?.clientName || '',
          productType: filters?.productType || '',
        }, { signal: controller.signal }).then(result => {
          if (controller.signal.aborted || id !== listRequestId.current) return
          const orderItems = result?.items ?? []
          const normalizedOrders = Array.isArray(orderItems)
            ? orderItems
                .filter((order) => order?.salesNoteNumber)
                .map(normalizeOrder)
                .filter((order) => Number(order.generalStepId) !== 4 && !['terminado', 'cancelado'].includes(normalizeText(order.orderStatus)))
            : []
          setOrders(normalizedOrders)
          setPageInfo(result?.pageInfo ?? { nextCursor: null, hasMore: false })
        }).catch(() => {
          if (!controller.signal.aborted && id === listRequestId.current) setLoadError('No fue posible cargar las ordenes.')
        }).finally(() => {
          if (!controller.signal.aborted && id === listRequestId.current) setLoading(false)
        })
        const statusWork = kanbanApi.getOrderStatuses().then(result => {
          if (controller.signal.aborted || id !== listRequestId.current) return
          if (!Array.isArray(result)) { setColumns(baseColumns); return }
          const normalizedStatuses = result
            .map(normalizeStatus)
            .filter((status) => Number(status.generalStepId) !== 4 && !['terminado', 'cancelado'].includes(normalizeText(status.title)))
            .sort((a, b) => a.order - b.order)

          setColumns(normalizedStatuses.length > 0 ? normalizedStatuses : baseColumns)
        }).catch(() => {
          if (!controller.signal.aborted && id === listRequestId.current) {
            setLoadError((current) => current || 'No fue posible cargar los estados del kanban.')
            setColumns(baseColumns)
          }
        })
        await Promise.allSettled([orderWork, statusWork])
      } catch {
        if (id !== listRequestId.current) return
        setLoadError('No fue posible cargar las ordenes.')
        setColumns(baseColumns)
      } finally {
        if (id === listRequestId.current) setLoading(false)
      }
    }

    loadOrders()
    return () => {
      requests.current++
      controller.abort()
      moreController.current?.abort()
      moveController.current?.abort()
    }
  }, [filters?.clientName, filters?.salesNoteNumber, filters?.productType, kanbanApi, refreshKey])

  async function loadMoreOrders() {
    if (!pageInfo.hasMore || !pageInfo.nextCursor || loading || morePending.current) return
    const id = listRequestId.current
    const controller = new AbortController()
    moreController.current = controller
    morePending.current = true
    setLoadingMore(true)
    try {
      const result = await kanbanApi.getOrders({
        limit: 50,
        cursor: pageInfo.nextCursor,
        search: filters?.salesNoteNumber || filters?.clientName || '',
        productType: filters?.productType || '',
      }, { signal: controller.signal })
      if (id !== listRequestId.current) return
      const nextOrders = (result.items ?? [])
        .filter((order) => order?.salesNoteNumber)
        .map(normalizeOrder)
        .filter((order) => Number(order.generalStepId) !== 4 && !['terminado', 'cancelado'].includes(normalizeText(order.orderStatus)))
      setOrders((current) => {
        const ids = new Set(current.map(item => item.id))
        return [...current, ...nextOrders.filter(next => {
          if (ids.has(next.id)) return false
          ids.add(next.id)
          return true
        })]
      })
      setPageInfo(result.pageInfo ?? { nextCursor: null, hasMore: false })
    } catch {
      if (id === listRequestId.current) setLoadError('No fue posible cargar más ordenes.')
    } finally {
      if (id === listRequestId.current) { morePending.current = false; setLoadingMore(false) }
    }
  }
```

**S003: capaVista/src/modules/kanban/components/KanbanColumn.jsx, líneas 390–477.** Componente/función o selectores: KanbanColumn; consultas, cancelación, paginación, clasificación y resultados. Filtros: KAN-F01–KAN-F03. Fragmento literal:

```jsx
  return (
    <>
      {loadError && <div className={styles.kanbanError} role="alert">{loadError}</div>}
      {validatingMove && <LoadingIndicator scope="action" context="Validación del pedido antes del traslado" />}
      <DragDropProvider onDragEnd={handleDragEnd}>
        <div className={styles.kanbanWrapper}>
          {columns.map((column) => {
            const columnOrders = sortOrdersForColumn(
              orders.filter(
                (order) => Number(column.generalStepId) === Number(order.generalStepId),
              ),
              column,
              filters,
            )

            return (
              <DroppableColumn
                accent={column.accent}
                count={columnOrders.length}
                icon={column.icon}
                id={column.title}
                key={column.title}
              >
                {loading && <LoadingIndicator context="Pedidos de la columna" />}
                {!loading && columnOrders.length > 0
                  ? columnOrders.map((order) => (
                      <KanbanCard
                        isMoveBlocked={!isPaymentConfirmed(order)}
                        isCorrectionRequested={order.correctionRequested}
                        isPaymentDeconfirmationRequested={order.paymentDeconfirmationRequested}
                        isProducing={order.isProducing}
                        canMove={hasPermission(PERMISSIONS.MOVE_ORDERS) && (
                          [2, 3].includes(Number(order.generalStepId)) ||
                          (Number(order.generalStepId) === 1 && hasPermission(PERMISSIONS.START_PRODUCTION))
                        )}
                        canManageIndicators={hasPermission(PERMISSIONS.MANAGE_TAGS)}
                        indicatorsBusy={busyLabels.api === kanbanApi && busyLabels.ids.has(order.id)}
                        key={order.id}
                        onOpenDetail={() => openOrderDetail(order)}
                        onToggleIndicator={(indicator) => handleToggleIndicator(order.id, indicator)}
                        {...order}
                      />
                    ))
                  : !loading && <div className={styles.emptyColumn}>Arrastra una orden hacia esta columna.</div>}
              </DroppableColumn>
            )
          })}
        </div>
      </DragDropProvider>
      {pageInfo.hasMore && (
        <div className="d-flex justify-content-center mt-3">
          <button className="btn btn-outline-primary" disabled={loadingMore} onClick={loadMoreOrders} type="button" aria-busy={loadingMore}>
            <LoadingAction surface="light" busy={loadingMore} context="Cargar más pedidos">Cargar más pedidos</LoadingAction>
          </button>
        </div>
      )}
      <KanbanDetailBoundary key={selectedOrder?.id ?? 'closed'} onClose={closeOrderDetail}>
      <KanbanOffCanvas
        isOpen={detailScope === kanbanApi && selectedOrder !== null}
        isLoading={detailLoading}
        loadError={detailError}
        onClose={closeOrderDetail}
        onCompleteSubprocess={handleCompleteSubprocess}
        onFinishProduction={handleFinishProduction}
        canFinishProduction={canFinishProduction}
        canCompleteSubprocess={hasPermission(PERMISSIONS.UPDATE_SUBPROCESSES)}
        canReview={hasPermission(PERMISSIONS.REVIEW_ORDERS)}
        canRollbackSubprocess={hasPermission(PERMISSIONS.ROLLBACK_SUBPROCESSES)}
        canCancelProduction={hasPermission(PERMISSIONS.CANCEL_ORDERS)}
        canReevaluate={hasPermission(PERMISSIONS.REEVALUATE_ORDERS) && Number(selectedOrder?.generalStepId) === KANBAN_REVISION_STEP}
        onCancelProduction={handleCancelProduction}
        onRollbackSubprocess={handleRollbackSubprocess}
        onReevaluate={handleReevaluate}
        onSendToReview={handleSendToReview}
        order={detailScope === kanbanApi ? selectedOrder : null}
      />
      </KanbanDetailBoundary>
      <MoveToProductionModal
        isOpen={pendingProductionMove?.api === kanbanApi}
        onClose={() => setPendingProductionMove(null)}
        onConfirm={confirmProductionMove}
        order={pendingProductionMove?.order}
      />
    </>
  )
}

export default KanbanColumn
```

<a id="fuente-S004"></a>

#### S004 — capaVista/src/modules/kanban/utils/kanbanOrderRules.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** normalizeText, hasActiveFilters, orderMatchesFilters, sortOrdersForColumn y tipos de producto. **Filtros relacionados:** KAN-F01–KAN-F03.

**Exportaciones declaradas** (línea inicial): 3: export function isPaymentConfirmed(order) {; 7: export function isLanyardItem(item) {; 11: export function getProductionPriority(order) {; 19: export function compareOrderIds(leftId, rightId) {; 30: export function normalizeText(value) {; 38: export function hasOrderLabel(order, expectedNames = []) {; 47: export function getCoreProductType(value) {; 57: export function getOrderCoreProductTypes(order) {; 66: export function hasActiveFilters(filters = {}) {; 71: export function orderMatchesFilters(order, filters = {}) {; 104: export function getLanyardProgressPercentage(item) {; 111: export function isItemReadyForDelivery(item) {; 121: export function sortOrdersForColumn(orders, column, filters) {.

**Relaciones/imports originales:** <code>./kanbanColumns.js</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 144 líneas originales; incluidos 1–102, 121–144. Fuera de extracción: 103–120; corresponden al contexto restante del archivo y no se sustituyen por código inventado. Huella SHA-256 inicial del archivo: CDBE6369310BB50687B93FF4397BE2B1844801B90CE4CD534A28A08B464677A4.

**S004: capaVista/src/modules/kanban/utils/kanbanOrderRules.js, líneas 1–102.** Componente/función o selectores: normalizeText, hasActiveFilters, orderMatchesFilters, sortOrdersForColumn y tipos de producto. Filtros: KAN-F01–KAN-F03. Fragmento literal:

```javascript
import { KANBAN_LISTO_PRODUCCION_STEP, KANBAN_EN_PRODUCCION_STEP } from './kanbanColumns.js';

export function isPaymentConfirmed(order) {
  return order.paymentStatus === 'Confirmado' || Number(order.paymentStatusId) === 2
}

export function isLanyardItem(item) {
  return String(item.product ?? '').toLowerCase().includes('lanyard')
}

export function getProductionPriority(order) {
  if (order.hasContractPriority) return 0
  if (order.isUrgent) return 1
  if (order.isProducing) return 2

  return 3
}

export function compareOrderIds(leftId, rightId) {
  const leftNumber = Number(leftId)
  const rightNumber = Number(rightId)

  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber
  }

  return String(leftId).localeCompare(String(rightId))
}

export function normalizeText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function hasOrderLabel(order, expectedNames = []) {
  const normalizedExpectedNames = expectedNames.map(normalizeText)
  const labels = Array.isArray(order.labels) ? order.labels : []

  return labels.some((label) =>
    normalizedExpectedNames.includes(normalizeText(label?.name)),
  )
}

export function getCoreProductType(value) {
  const normalizedValue = normalizeText(value)

  if (normalizedValue.includes('lanyard')) return 'lanyard'
  if (normalizedValue.includes('tarjeta')) return 'tarjeta'
  if (normalizedValue.includes('yoyo')) return 'yoyo'

  return ''
}

export function getOrderCoreProductTypes(order) {
  const productValues = [
    order.product,
    ...(Array.isArray(order.items) ? order.items.map((item) => item.product) : []),
  ]

  return [...new Set(productValues.map(getCoreProductType).filter(Boolean))]
}

export function hasActiveFilters(filters = {}) {
  return [filters.clientName, filters.salesNoteNumber, filters.productType]
    .some((value) => normalizeText(value).length > 0)
}

export function orderMatchesFilters(order, filters = {}) {
  const normalizedFilters = {
    clientName: normalizeText(filters.clientName),
    salesNoteNumber: normalizeText(filters.salesNoteNumber),
    productType: normalizeText(filters.productType),
  }

  if (!Object.values(normalizedFilters).some(Boolean)) return false

  const coreProductTypes = getOrderCoreProductTypes(order)
  if (normalizedFilters.clientName && !normalizeText(order.clientName).includes(normalizedFilters.clientName)) {
    return false
  }

  if (normalizedFilters.salesNoteNumber && !normalizeText(order.salesNoteNumber).includes(normalizedFilters.salesNoteNumber)) {
    return false
  }

  if (normalizedFilters.productType === 'mixto' && coreProductTypes.length < 2) {
    return false
  }

  if (
    normalizedFilters.productType &&
    normalizedFilters.productType !== 'mixto' &&
    (coreProductTypes.length !== 1 || coreProductTypes[0] !== normalizedFilters.productType)
  ) {
    return false
  }

  return true
}
```

**S004: capaVista/src/modules/kanban/utils/kanbanOrderRules.js, líneas 121–144.** Componente/función o selectores: normalizeText, hasActiveFilters, orderMatchesFilters, sortOrdersForColumn y tipos de producto. Filtros: KAN-F01–KAN-F03. Fragmento literal:

```javascript
export function sortOrdersForColumn(orders, column, filters) {
  const activeFilters = hasActiveFilters(filters)
  const baseSortedOrders = [KANBAN_LISTO_PRODUCCION_STEP, KANBAN_EN_PRODUCCION_STEP].includes(Number(column.generalStepId))
    ? [...orders].sort((left, right) => {
        if (Number(column.generalStepId) === KANBAN_LISTO_PRODUCCION_STEP) {
          if (left.paymentDeconfirmationRequested !== right.paymentDeconfirmationRequested) {
            return left.paymentDeconfirmationRequested ? -1 : 1
          }
        }

        const priorityDifference = getProductionPriority(left) - getProductionPriority(right)

        if (priorityDifference !== 0) return priorityDifference

        return compareOrderIds(left.id, right.id)
      })
    : orders

  if (!activeFilters) {
    return baseSortedOrders
  }

  return baseSortedOrders.filter((order) => orderMatchesFilters(order, filters))
}
```

<a id="fuente-S005"></a>

#### S005 — capaVista/src/modules/kanban/utils/kanbanColumns.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** baseColumns y constantes de etapa. **Filtros relacionados:** KAN-F01–KAN-F03.

**Exportaciones declaradas** (línea inicial): 4: export const MOVE_TO_PRODUCTION_PERMISSION_MESSAGE = 'Solo un administrador puede mover pedidos a En produccion.'; 6: export const STAGE_SKIP_MESSAGE = 'No puedes saltar etapas del pedido.'; 8: export const STAGE_BACKWARD_MESSAGE = 'No puedes retroceder en las etapas del pedido.'; 10: export const KANBAN_EN_PRODUCCION_STEP = 2; 12: export const KANBAN_LISTO_PRODUCCION_STEP = 1; 14: export const KANBAN_REVISION_STEP = 6; 16: export const baseColumns = [; 48: export function getColumnTitleByStepId(stepId) {.

**Relaciones/imports originales:** <code>../../../shared/orderStagePresentation.js</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 51 líneas originales; incluidos 1–51; cobertura completa. Huella SHA-256 inicial del archivo: D1091C26B28785518B465A4BA9CC262F112847EFD463E04D7E5B94E7E4B09717.

**S005: capaVista/src/modules/kanban/utils/kanbanColumns.js, líneas 1–51.** Componente/función o selectores: baseColumns y constantes de etapa. Filtros: KAN-F01–KAN-F03. Fragmento literal:

```javascript
import { getOrderStageAccent } from '../../../shared/orderStagePresentation.js'


export const MOVE_TO_PRODUCTION_PERMISSION_MESSAGE = 'Solo un administrador puede mover pedidos a En produccion.'

export const STAGE_SKIP_MESSAGE = 'No puedes saltar etapas del pedido.'

export const STAGE_BACKWARD_MESSAGE = 'No puedes retroceder en las etapas del pedido.'

export const KANBAN_EN_PRODUCCION_STEP = 2

export const KANBAN_LISTO_PRODUCCION_STEP = 1

export const KANBAN_REVISION_STEP = 6

export const baseColumns = [
  {
    id: 'confirmacion-pago',
    title: 'Confirmacion de pago',
    generalStepId: 0,
    accent: getOrderStageAccent(0),
    icon: 'bi-cash-coin',
  },
  {
    id: 'listo-produccion',
    title: 'Listo para produccion',
    generalStepId: 1,
    accent: getOrderStageAccent(1),
    icon: 'bi-clipboard-check',
  },
  {
    id: 'en-produccion',
    title: 'En produccion',
    generalStepId: 2,
    accent: getOrderStageAccent(2),
    icon: 'bi-gear-wide-connected',
  },
  {
    id: 'listo-entrega',
    title: 'Listo para entrega',
    generalStepId: 3,
    accent: getOrderStageAccent(3),
    icon: 'bi-check2-circle',
  },
  { id: 'en-revision', title: 'En revision', generalStepId: KANBAN_REVISION_STEP, accent: getOrderStageAccent(6), icon: 'bi-search' },
]

export function getColumnTitleByStepId(stepId) {
  const column = baseColumns.find((item) => Number(item.generalStepId) === Number(stepId))
  return column?.title ?? 'Confirmacion de pago'
}
```

<a id="fuente-S006"></a>

#### S006 — capaVista/src/modules/kanban/api/kanbanApi.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** createKanbanApi; queryString, resumen y catálogo de estados. **Filtros relacionados:** KAN-F01–KAN-F03.

**Exportaciones declaradas** (línea inicial): 8: export function createKanbanApi(apiClient, { now = Date.now, statusTtlMs = 30_000 } = {}) {.

**Relaciones/imports originales:** <code>../../orders/utils/orderDto</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 64 líneas originales; incluidos 1–33, 59–64. Fuera de extracción: 34–58; corresponden al contexto restante del archivo y no se sustituyen por código inventado. Huella SHA-256 inicial del archivo: 21B3C8EB779495E3D503C25A4BBA55C252321BB6B9A8B6152D0BE2E4C3A586B6.

**S006: capaVista/src/modules/kanban/api/kanbanApi.js, líneas 1–33.** Componente/función o selectores: createKanbanApi; queryString, resumen y catálogo de estados. Filtros: KAN-F01–KAN-F03. Fragmento literal:

```javascript
import {
  parseKanbanOrderDetailDTO,
  parseKanbanPageDTO,
  parseOrderLabelsPatchDTO,
  parseOrderStagePatchDTO,
} from '../../orders/utils/orderDto'

export function createKanbanApi(apiClient, { now = Date.now, statusTtlMs = 30_000 } = {}) {
  let statuses, statusesExpireAt = 0, statusFlight
  function getOrderStatuses({ force = false } = {}) {
    if (!force && statuses && now() < statusesExpireAt) return Promise.resolve(statuses)
    if (!statusFlight) statusFlight = apiClient.get('/order-status').then(result => {
      if (Array.isArray(result)) { statuses = result; statusesExpireAt = now() + statusTtlMs }
      return result
    }).catch(error => {
      statuses = undefined
      statusesExpireAt = 0
      throw error
    }).finally(() => { statusFlight = null })
    return statusFlight
  }
  const queryString = (params = {}) => {
    const query = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') query.set(key, String(value))
    })
    return query.size ? `?${query.toString()}` : ''
  }
  return {
    getOrders: (params, options) => apiClient.get(`/orders/kanban-summary${queryString(params)}`, options).then(parseKanbanPageDTO),
    getOrderDetail: (orderId, { precheck = false, ...options } = {}) =>
      apiClient.get(`/orders/${orderId}/${precheck ? 'kanban-precheck' : 'kanban-detail'}`, options).then(parseKanbanOrderDetailDTO),
    getOrderStatuses,
```

**S006: capaVista/src/modules/kanban/api/kanbanApi.js, líneas 59–64.** Componente/función o selectores: createKanbanApi; queryString, resumen y catálogo de estados. Filtros: KAN-F01–KAN-F03. Fragmento literal:

```javascript
    getCapacities: () => apiClient.get('/production-capacity'),
    updateCapacities: (capacities) => apiClient.patch('/production-capacity', { capacities }),
    getProductionLoad: options => apiClient.get('/production-load/today', options),
    updateProductionLoad: (entries) => apiClient.patch('/production-load/today', { entries }),
  }
}
```

<a id="fuente-S007"></a>

#### S007 — capaVista/src/modules/kanban/hooks/useKanbanApi.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** useKanbanApi; instancia por cliente/sesión. **Filtros relacionados:** KAN-F01–KAN-F03.

**Exportaciones declaradas** (línea inicial): 5: export function useKanbanApi() {.

**Relaciones/imports originales:** <code>react</code>, <code>../../../hooks/useApiClient.js</code>, <code>../api/kanbanApi.js</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 8 líneas originales; incluidos 1–8; cobertura completa. Huella SHA-256 inicial del archivo: 86E68CB944994C76243C98E4DE5B675E867E96768D05C21AAA0EE4B40D55D917.

**S007: capaVista/src/modules/kanban/hooks/useKanbanApi.js, líneas 1–8.** Componente/función o selectores: useKanbanApi; instancia por cliente/sesión. Filtros: KAN-F01–KAN-F03. Fragmento literal:

```javascript
import { useMemo } from 'react'
import { useApiClient } from '../../../hooks/useApiClient.js'
import { createKanbanApi } from '../api/kanbanApi.js'

export function useKanbanApi() {
  const client = useApiClient()
  return useMemo(() => createKanbanApi(client), [client])
}
```

<a id="fuente-S008"></a>

#### S008 — capaVista/src/modules/kanban/styles/Kanban.module.css

**Tipo:** CSS propio. **Responsabilidad, componentes y funciones:** CSS de contenedor, botón, inputs, acciones, animación y breakpoints. **Filtros relacionados:** KAN-F01–KAN-F03.

**Cobertura:** 1432 líneas originales; incluidos 1–168, 1343–1423. Fuera de extracción: 169–1342, 1424–1432; corresponden al contexto restante del archivo y no se sustituyen por código inventado. Huella SHA-256 inicial del archivo: F2AF428F67EC3802BEC0E2D4366AFB96DF771C6E8B87089FBBEAC78DF3B4F02B.

**S008: capaVista/src/modules/kanban/styles/Kanban.module.css, líneas 1–168.** Componente/función o selectores: CSS de contenedor, botón, inputs, acciones, animación y breakpoints. Filtros: KAN-F01–KAN-F03. Fragmento literal:

```css
.filtersShell,
.kanbanWrapper {
  --kanban-border: #e5e7eb;
  --kanban-orange: #f97316;
  --kanban-orange-rgb: 249, 115, 22;
  --kanban-muted: #64748b;
  --kanban-text: #111827;
  --kanban-red: #dc2626;     /* URGENTE */
  --kanban-yellow: #ca8a04;   /* ATRASADO */
}

.filtersShell {
  background: #fff;
  border: 1px solid var(--kanban-border);
  border-radius: 0.85rem;
  box-shadow: 0 14px 32px rgba(15, 23, 42, 0.045);
  overflow: hidden;
}

.filtersTopbar {
  align-items: center;
  background: #000;
  color: #fff;
  display: flex;
  gap: 1rem;
  justify-content: space-between;
  min-height: 3.5rem;
  padding: 0.9rem 1rem;
}

.filtersTopbar h2 {
  color: #fff;
  font-size: 0.92rem;
  font-weight: 850;
  letter-spacing: 0.055em;
  margin: 0;
  text-transform: uppercase;
}

.filtersEyebrow {
  color: var(--kanban-orange);
  display: block;
  font-size: 0.72rem;
  font-weight: 850;
  letter-spacing: 0.075em;
  line-height: 1;
  margin-bottom: 0.28rem;
  text-transform: uppercase;
}

.filterToggleButton,
.applyFilterButton,
.resetFilterButton,
.orderCardButton {
  align-items: center;
  border-radius: 0.55rem;
  display: inline-flex;
  font-weight: 780;
  gap: 0.45rem;
  justify-content: center;
  min-height: 2.55rem;
  padding: 0.55rem 0.9rem;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    color 0.15s ease,
    transform 0.15s ease;
}

.filterToggleButton:hover,
.applyFilterButton:hover,
.resetFilterButton:hover,
.orderCardButton:hover {
  transform: translateY(-1px);
}

.filterToggleButton {
  background: rgba(var(--kanban-orange-rgb), 0.14);
  border: 1px solid rgba(var(--kanban-orange-rgb), 0.38);
  color: #fff;
}

.filterToggleButton:hover,
.filterToggleButton:focus {
  background: var(--kanban-orange);
  border-color: var(--kanban-orange);
  color: #111;
  outline: none;
}

.filterCard {
  animation: filterEnter 0.18s ease-out;
  background: #fff;
  padding: 1rem;
}

.filterGrid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.filterGrid label {
  display: grid;
  gap: 0.45rem;
  margin: 0;
}

.filterGrid span {
  color: var(--kanban-muted);
  font-size: 0.78rem;
  font-weight: 850;
  letter-spacing: 0.055em;
  text-transform: uppercase;
}

.filterGrid :global(.form-control),
.filterGrid :global(.form-select) {
  border: 1px solid #d7dee8;
  border-radius: 0.55rem;
  color: var(--kanban-text);
  min-height: 3rem;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.filterGrid :global(.form-control:focus),
.filterGrid :global(.form-select:focus) {
  border-color: var(--kanban-orange);
  box-shadow: 0 0 0 0.22rem rgba(var(--kanban-orange-rgb), 0.18);
}

.filterActions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  justify-content: flex-end;
  margin-top: 1rem;
}

.applyFilterButton {
  background: #000;
  border: 1px solid #000;
  color: #fff;
}

.applyFilterButton:hover,
.applyFilterButton:focus {
  background: var(--kanban-orange);
  border-color: var(--kanban-orange);
  color: #111;
  outline: none;
}

.resetFilterButton {
  background: #fff;
  border: 1px solid #d3d9e2;
  color: #111;
}

.resetFilterButton:hover,
.resetFilterButton:focus {
  border-color: var(--kanban-orange);
  color: var(--kanban-orange);
  outline: none;
}
```

**S008: capaVista/src/modules/kanban/styles/Kanban.module.css, líneas 1343–1423.** Componente/función o selectores: CSS de contenedor, botón, inputs, acciones, animación y breakpoints. Filtros: KAN-F01–KAN-F03. Fragmento literal:

```css
@keyframes filterEnter {
  from {
    opacity: 0;
    transform: translateY(-0.4rem);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 1199.98px) {
  .filterGrid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 767.98px) {
  .filtersTopbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .filterToggleButton,
  .applyFilterButton,
  .resetFilterButton {
    width: 100%;
  }

  .filterGrid {
    grid-template-columns: 1fr;
  }

  .filterActions {
    justify-content: stretch;
  }

  .kanbanWrapper {
    grid-auto-columns: minmax(16rem, 86vw);
    min-height: 30rem;
  }

  .column {
    min-height: 28rem;
  }

  .columnBody {
    min-height: 24rem;
  }

  .offcanvasHeader {
    background-color: #000;
    color: #fff;
    border-bottom: 4px solid #f97316; 
    padding: 1.25rem;
  }

  .offcanvasTitle {
    font-weight: 850;
    font-size: 1.1rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    margin: 0;
  }

  .offcanvasHeader :global(.btn-close) {
    filter: invert(1) grayscale(100%) brightness(200%);
    opacity: 0.8;
  }

  .offcanvasHeader :global(.btn-close):hover {
    opacity: 1;
  }

  .offcanvasBody {
    background-color: #f8fafc; 
    padding: 1.25rem;
  }

}
```

<a id="fuente-S009"></a>

#### S009 — capaVista/src/modules/kanban/pages/KanbanBoardPage.module.css

**Tipo:** CSS propio. **Responsabilidad, componentes y funciones:** CSS de página y marco de filtros. **Filtros relacionados:** KAN-F01–KAN-F03.

**Cobertura:** 230 líneas originales; incluidos 1–20. Fuera de extracción: 21–230; corresponden al contexto restante del archivo y no se sustituyen por código inventado. Huella SHA-256 inicial del archivo: E5BCB5462244E2313A510E4FE8DFCD4572CDFF7832AE322EE0300CA5C90C1F87.

**S009: capaVista/src/modules/kanban/pages/KanbanBoardPage.module.css, líneas 1–20.** Componente/función o selectores: CSS de página y marco de filtros. Filtros: KAN-F01–KAN-F03. Fragmento literal:

```css
.page {
  --payment-border: #e5e7eb;
  --payment-orange: #f97316;
  --payment-orange-rgb: 249, 115, 22;
  --payment-muted: #64748b;
  --payment-text: #111827;

  color: var(--payment-text);
  font-family:
    Inter,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif;
}

.dashboardShell {
  overflow: hidden;
}
```


### 15.3. Pagos

<a id="fuente-S010"></a>

#### S010 — capaVista/src/modules/payments/components/PaymentFilters.jsx

**Tipo:** JSX/React. **Responsabilidad, componentes y funciones:** PaymentFilters; estados, dos fechas nativas y búsqueda. **Filtros relacionados:** PAG-F01–PAG-F04.

**Exportaciones declaradas** (línea inicial): 30: export default function PaymentFilters({.

**Relaciones/imports originales:** <code>./PaymentFilters.module.css</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 143 líneas originales; incluidos 1–143; cobertura completa. Huella SHA-256 inicial del archivo: 60E2FDC973B4340215D92D5A902B21F656FE7018DA9C4873833DEC13A902B1C7.

**S010: capaVista/src/modules/payments/components/PaymentFilters.jsx, líneas 1–143.** Componente/función o selectores: PaymentFilters; estados, dos fechas nativas y búsqueda. Filtros: PAG-F01–PAG-F04. Fragmento literal:

```jsx
import styles from './PaymentFilters.module.css'

function openNativeDatePicker(input) {
  if (!input) return

  input.focus({ preventScroll: true })

  if (typeof input.showPicker === 'function') {
    try {
      input.showPicker()
    } catch {
      // El navegador conserva el comportamiento nativo del input como respaldo.
    }
  }
}

function handleDateFieldClick(event) {
  const input = event.currentTarget.querySelector('input[type="date"]')

  if (event.target === input || typeof input?.showPicker !== 'function') return

  event.preventDefault()
  openNativeDatePicker(input)
}

function handleDateInputClick(event) {
  openNativeDatePicker(event.currentTarget)
}

export default function PaymentFilters({
  activeFilter,
  dateFrom,
  dateTo,
  filters,
  getFilterCount,
  onClearDateRange,
  onDateFromChange,
  onDateToChange,
  onFilterChange,
  onSearchChange,
  searchTerm,
}) {
  const hasDateRange = Boolean(dateFrom || dateTo)

  return (
    <section
      className={styles.toolbar}
      aria-label="Filtros de pago"
    >
      <div className={styles.filterGroup}>
        {filters.map((filter) => {
          const isActive = activeFilter === filter.key

          return (
            <button
              aria-pressed={isActive}
              className={`${styles.filterButton} ${
                isActive ? styles.filterButtonActive : ''
              }`}
              data-filter-key={filter.key}
              key={filter.key}
              onClick={() => onFilterChange(filter.key)}
              type="button"
            >
              <span className={styles.filterLabel}>{filter.label}</span>
              <span className={styles.filterCount}>
                {getFilterCount(filter.key)}
              </span>
            </button>
          )
        })}
      </div>

      <div className={styles.filterControls}>
        <div
          aria-label="Filtrar por fecha de creación"
          className={`${styles.dateRangeGroup} ${
            hasDateRange ? styles.dateRangeGroupActive : ''
          }`}
          role="group"
        >
          <label
            className={styles.dateField}
            htmlFor="payment-date-from"
            onClick={handleDateFieldClick}
          >
            <span>Desde</span>
            <input
              id="payment-date-from"
              max={dateTo || undefined}
              onChange={(event) => onDateFromChange(event.target.value)}
              onClick={handleDateInputClick}
              type="date"
              value={dateFrom}
            />
          </label>

          <label
            className={styles.dateField}
            htmlFor="payment-date-to"
            onClick={handleDateFieldClick}
          >
            <span>Hasta</span>
            <input
              id="payment-date-to"
              min={dateFrom || undefined}
              onChange={(event) => onDateToChange(event.target.value)}
              onClick={handleDateInputClick}
              type="date"
              value={dateTo}
            />
          </label>

          {hasDateRange && (
            <button
              aria-label="Limpiar rango de fechas"
              className={styles.dateRangeClearButton}
              onClick={onClearDateRange}
              title="Limpiar fechas"
              type="button"
            >
              <i aria-hidden="true" className="bi bi-x-lg" />
            </button>
          )}
        </div>

        <label className={styles.searchBox} htmlFor="payment-search">
          <span className="visually-hidden">
            Buscar por RUT, nota de venta o cliente
          </span>
          <input
            id="payment-search"
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Buscar por RUT, NV o cliente"
            type="search"
            value={searchTerm}
          />
          <i aria-hidden="true" className="bi bi-search" />
        </label>
      </div>
    </section>
  )
}
```

<a id="fuente-S011"></a>

#### S011 — capaVista/src/modules/payments/components/PaymentFilters.module.css

**Tipo:** CSS propio. **Responsabilidad, componentes y funciones:** CSS completo de filtros de pago. **Filtros relacionados:** PAG-F01–PAG-F04.

**Cobertura:** 321 líneas originales; incluidos 1–321; cobertura completa. Huella SHA-256 inicial del archivo: C5BEEDB0368B62A54910E2D5D709887D86E1961EF27D51115074EB04BCF43426.

**S011: capaVista/src/modules/payments/components/PaymentFilters.module.css, líneas 1–321.** Componente/función o selectores: CSS completo de filtros de pago. Filtros: PAG-F01–PAG-F04. Fragmento literal:

```css
.toolbar {
  align-items: center;
  border-bottom: 1px solid var(--payment-border);
  border-top: 1px solid #eef2f7;
  display: grid;
  gap: 1.25rem;
  grid-template-columns: repeat(
    auto-fit,
    minmax(min(100%, 38rem), 1fr)
  );
  padding: 1.25rem 2.55rem 1.05rem;
}

.filterGroup {
  display: grid;
  gap: 0.85rem;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  width: 100%;
}

.filterButton {
  align-items: center;
  background: #fff;
  border: 1px solid #e1e7ef;
  border-radius: 0.55rem;
  color: #111;
  display: inline-flex;
  font-size: 1rem;
  font-weight: 600;
  gap: 0.7rem;
  justify-content: space-between;
  min-height: 3.15rem;
  min-width: 0;
  padding: 0.72rem 1rem;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    color 0.15s ease,
    transform 0.15s ease;
  width: 100%;
}

.filterButton:hover {
  border-color: var(--payment-orange);
  box-shadow: 0 0.55rem 1.2rem rgba(17, 24, 39, 0.08);
  color: var(--payment-orange);
  transform: translateY(-1px);
}

.filterButton:focus-visible {
  outline: 3px solid rgba(238, 117, 45, 0.28);
  outline-offset: 2px;
}

.filterButtonActive,
.filterButtonActive:hover {
  background: #000;
  border-color: #000;
  color: #fff;
}

.filterLabel {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.filterCount {
  align-items: center;
  background: #111;
  border-radius: 999px;
  color: #fff;
  display: inline-flex;
  flex: 0 0 auto;
  font-size: 0.78rem;
  font-weight: 800;
  height: 1.65rem;
  justify-content: center;
  line-height: 1;
  min-width: 1.65rem;
  padding: 0 0.35rem;
}

.filterButtonActive .filterCount {
  background: var(--payment-orange);
  color: #111;
}

.filterControls {
  display: grid;
  gap: 0.85rem;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.9fr);
  justify-content: end;
  justify-self: end;
  min-width: 0;
  width: 100%;
}

.dateRangeGroup {
  align-items: center;
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  border-left: 0.22rem solid var(--payment-orange);
  border-radius: 0.65rem;
  display: grid;
  gap: 0.6rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  min-height: 3.35rem;
  min-width: 0;
  padding: 0.38rem 0.65rem;
  transition: background-color 150ms ease, border-color 150ms ease, box-shadow 150ms ease;
}

.dateRangeGroupActive {
  background: #fff;
  grid-template-columns: repeat(2, minmax(0, 1fr)) auto;
}

.dateRangeGroup:focus-within {
  border-color: var(--payment-orange);
  box-shadow: 0 0 0 0.22rem rgba(var(--payment-orange-rgb), 0.14);
}

.dateField {
  cursor: pointer;
  display: grid;
  gap: 0.08rem;
  min-width: 0;
}

.dateField + .dateField {
  border-left: 1px solid var(--payment-border);
  padding-left: 0.6rem;
}

.dateField span {
  color: var(--payment-muted);
  font-size: 0.58rem;
  font-weight: 850;
  letter-spacing: 0.07em;
  line-height: 1;
  text-transform: uppercase;
}

.dateField input {
  accent-color: var(--payment-orange);
  background: transparent;
  border: 0;
  color: var(--payment-text);
  color-scheme: light;
  cursor: pointer;
  font-size: 0.78rem;
  font-weight: 750;
  line-height: 1.25;
  min-width: 0;
  outline: 0;
  padding: 0.08rem 0;
  width: 100%;
}

.dateField input::-webkit-calendar-picker-indicator {
  cursor: pointer;
  opacity: 0.72;
}

.dateRangeClearButton {
  align-items: center;
  background: transparent;
  border: 0;
  border-left: 1px solid var(--payment-border);
  border-radius: 0;
  color: var(--payment-muted);
  display: inline-flex;
  flex: 0 0 auto;
  height: 2rem;
  justify-content: center;
  padding: 0;
  transition: background-color 150ms ease, color 150ms ease;
  width: 2rem;
}

.dateRangeClearButton:hover:not(:disabled),
.dateRangeClearButton:focus-visible:not(:disabled) {
  background: var(--payment-orange);
  border-left-color: var(--payment-orange);
  border-radius: 0.4rem;
  color: #111;
  outline: none;
}

.searchBox {
  align-items: center;
  border: 1px solid #d7dee8;
  border-radius: 0.55rem;
  display: flex;
  gap: 0.65rem;
  min-height: 3.35rem;
  min-width: 0;
  padding: 0 0.9rem;
  transition: border-color 150ms ease, box-shadow 150ms ease;
  width: 100%;
}

.searchBox:focus-within {
  border-color: var(--payment-orange);
  box-shadow: 0 0 0 0.22rem rgba(var(--payment-orange-rgb), 0.14);
}

.searchBox input {
  border: 0;
  color: #111;
  flex: 1;
  font-size: 0.92rem;
  font-style: italic;
  min-width: 0;
  outline: 0;
}

.searchBox input::placeholder {
  color: var(--payment-muted);
}

.searchBox i {
  color: var(--payment-orange);
  font-size: 1.2rem;
}

@media (max-width: 1399.98px) {
  .toolbar {
    padding-left: 1.35rem;
    padding-right: 1.35rem;
  }

  .filterGroup {
    max-width: none;
    width: 100%;
  }

  .filterControls {
    justify-self: stretch;
    width: 100%;
  }
}

@media (max-width: 991.98px) {
  .toolbar {
    padding-left: 1.35rem;
    padding-right: 1.35rem;
  }

  .filterGroup {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 767.98px) {
  .filterControls {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 575.98px) {
  .toolbar {
    padding: 0.85rem;
  }

  .filterGroup {
    gap: 0.7rem;
  }

  .filterButton {
    font-size: 0.9rem;
    min-height: 2.85rem;
    padding: 0.58rem 0.72rem;
  }

  .filterCount {
    font-size: 0.72rem;
    height: 1.5rem;
    min-width: 1.5rem;
  }

  .searchBox {
    min-height: 2.9rem;
  }
}

@media (max-width: 399.98px) {
  .dateRangeGroup {
    grid-template-columns: minmax(0, 1fr);
    padding: 0.6rem 0.7rem;
  }

  .dateRangeGroupActive {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .dateRangeGroupActive .dateField {
    grid-column: 1;
  }

  .dateField + .dateField {
    border-left: 0;
    border-top: 1px solid var(--payment-border);
    padding-left: 0;
    padding-top: 0.5rem;
  }

  .dateRangeClearButton {
    grid-column: 2;
    grid-row: 1 / span 2;
  }
}

@media (max-width: 360px) {
  .filterGroup {
    grid-template-columns: 1fr;
  }
}
```

<a id="fuente-S012"></a>

#### S012 — capaVista/src/modules/payments/pages/PaymentConfirmationPage.jsx

**Tipo:** JSX/React. **Responsabilidad, componentes y funciones:** PaymentWorkspace; debounce, lectura paginada, contadores, eventos y montaje. **Filtros relacionados:** PAG-F01–PAG-F04.

**Exportaciones declaradas** (línea inicial): 31: export default function PaymentConfirmationPage() {.

**Relaciones/imports originales:** <code>../../../shared/components/loading/LoadingIndicator</code>, <code>../../../shared/notifications/useToast</code>, <code>../../../shared/notifications/operationFeedback</code>, <code>react</code>, <code>../api/paymentPreviewCache</code>, <code>@/config/permissions</code>, <code>@/config/status</code>, <code>@/hooks/useAuth</code>, <code>../components/PaymentActionConfirmModal</code>, <code>../components/PaymentCredentialsModal</code>, <code>../components/PaymentFilters</code>, <code>../components/PaymentOrderMobileList</code>, <code>../components/PaymentOrdersTable</code>, <code>../components/PaymentSummaryCards</code>, <code>../hooks/usePaymentsApi</code>, <code>../utils/paymentOrders</code>, <code>./PaymentConfirmationPage.module.css</code>, <code>../../../shared/components/layout/PageShell</code>, <code>../../../shared/components/layout/PageHeader</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 630 líneas originales; incluidos 1–221, 311–335, 529–595. Fuera de extracción: 222–310, 336–528, 596–630; corresponden al contexto restante del archivo y no se sustituyen por código inventado. Huella SHA-256 inicial del archivo: EA0330B7703BAD224C89055EEE7FC178669470BCF06DBF8A38C4FD2C2A94DE54.

**S012: capaVista/src/modules/payments/pages/PaymentConfirmationPage.jsx, líneas 1–221.** Componente/función o selectores: PaymentWorkspace; debounce, lectura paginada, contadores, eventos y montaje. Filtros: PAG-F01–PAG-F04. Fragmento literal:

```jsx
import LoadingIndicator, { LoadingAction } from '../../../shared/components/loading/LoadingIndicator'
import { useToast } from '../../../shared/notifications/useToast'
import { operationFailureMessage, requiresContext, uncertainOperation } from '../../../shared/notifications/operationFeedback'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPaymentPreviewCache } from '../api/paymentPreviewCache'
import { PERMISSIONS } from '@/config/permissions'
import { PAYMENT_STATUS } from '@/config/status'
import { useAuth } from '@/hooks/useAuth'
import PaymentActionConfirmModal from '../components/PaymentActionConfirmModal'
import PaymentCredentialsModal from '../components/PaymentCredentialsModal'
import PaymentFilters from '../components/PaymentFilters'
import PaymentOrderMobileList from '../components/PaymentOrderMobileList'
import PaymentOrdersTable from '../components/PaymentOrdersTable'
import PaymentSummaryCards from '../components/PaymentSummaryCards'
import { usePaymentsApi } from '../hooks/usePaymentsApi'
import {
  getPaymentStatusIdByName,
  mergePaymentPreview,
  normalizePaymentOrders,
} from '../utils/paymentOrders'
import styles from './PaymentConfirmationPage.module.css'
import PageShell, { PageSurface } from '../../../shared/components/layout/PageShell'
import PageHeader from '../../../shared/components/layout/PageHeader'

const FILTERS = [
  { key: PAYMENT_STATUS.PENDIENTE, label: 'Pendientes' },
  { key: PAYMENT_STATUS.RECHAZADO, label: 'Rechazados' },
  { key: PAYMENT_STATUS.CONFIRMADO, label: 'Confirmados' },
]

export default function PaymentConfirmationPage() {
  const { hasPermission } = useAuth()
  const paymentsApi = usePaymentsApi()
  const canRead = hasPermission(PERMISSIONS.READ_PAYMENTS)
  const canUpdate = hasPermission(PERMISSIONS.UPDATE_PAYMENT_STATUS)
  const canRevise = hasPermission(PERMISSIONS.REVISE_PAYMENT_STATUS)
  return <PaymentWorkspace key={`${paymentsApi.scopeId}:${canRead}:${canUpdate}:${canRevise}`}
    paymentsApi={paymentsApi} canRead={canRead} canUpdatePaymentStatus={canUpdate} canRevise={canRevise} />
}

function PaymentWorkspace({ paymentsApi, canRead, canUpdatePaymentStatus, canRevise }) {
  const notify = useToast()
  const [orders, setOrders] = useState([])
  const [counters, setCounters] = useState({ pending: 0, rejected: 0, confirmed: 0 })
  const [pageInfo, setPageInfo] = useState({ nextCursor: null, hasMore: false })
  const [loadingMore, setLoadingMore] = useState(false)
  const loadRequestId = useRef(0)
  const [paymentStatuses, setPaymentStatuses] = useState([])
  const [activeFilter, setActiveFilter] = useState(PAYMENT_STATUS.PENDIENTE)
  const [editingStatus, setEditingStatus] = useState({})
  const [pendingTransition, setPendingTransition] = useState(null)
  const [credentialsTransition, setCredentialsTransition] = useState(null)
  const [previewState, setPreviewState] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [updateError, setUpdateError] = useState(null)
  const [isUpdatingPaymentStatus, setIsUpdatingPaymentStatus] = useState(false)
  const [isLoadingActionDetails, setIsLoadingActionDetails] = useState(false)
  const [actionDetailsError, setActionDetailsError] = useState(null)
  const [isLoadingPreviewDetails, setIsLoadingPreviewDetails] = useState(false)
  const [previewDetailsError, setPreviewDetailsError] = useState(null)
  const previewRequestId = useRef(0)
  const detailPreviewRequestId = useRef(0)
  const [previewCache] = useState(() => createPaymentPreviewCache(paymentsApi))
  const listController = useRef(null)
  const moreController = useRef(null)
  const summaryController = useRef(null)
  const morePending = useRef(false)
  const writePending = useRef(false)
  const mounted = useRef(true)
  const summaryScope = useRef(null)
  const [settledSearch, setSettledSearch] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const searchPending = searchTerm.trim() !== settledSearch
  const queryScope = `${settledSearch}\n${dateFrom}\n${dateTo}`
  const currentScope = useRef(queryScope)

  useEffect(() => {
    mounted.current = true
    const actionRequests = previewRequestId
    const detailRequests = detailPreviewRequestId
    return () => {
      mounted.current = false
      actionRequests.current++
      detailRequests.current++
      listController.current?.abort()
      moreController.current?.abort()
      summaryController.current?.abort()
      previewCache.clear()
    }
  }, [previewCache])

  useEffect(() => {
    const timer = window.setTimeout(() => setSettledSearch(searchTerm.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [searchTerm])

  useEffect(() => {
    const refresh = () => {
      previewCache.clear()
      summaryScope.current = null
      setRefreshKey(value => value + 1)
    }
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [previewCache])

  useEffect(() => {
    if (canUpdatePaymentStatus) return

    const resetTimer = window.setTimeout(() => {
      setEditingStatus({})
      setPendingTransition(null)
      setCredentialsTransition(null)
    }, 0)

    return () => window.clearTimeout(resetTimer)
  }, [canUpdatePaymentStatus])

  const loadPaymentData = useCallback(async (forceSummary = true) => {
    if (!canRead) { setIsLoading(false); return }
    listController.current?.abort()
    moreController.current?.abort()
    summaryController.current?.abort()
    const controller = new AbortController()
    listController.current = controller
    const requestId = ++loadRequestId.current
    currentScope.current = queryScope
    const includeSummary = forceSummary || !summaryScope.current
      || summaryScope.current.key !== queryScope || Date.now() >= summaryScope.current.expires
    previewCache.clear()
    if (!writePending.current) {
      previewRequestId.current++
      detailPreviewRequestId.current++
      setPendingTransition(null)
      setCredentialsTransition(null)
      setPreviewState(null)
    }
    setIsLoading(true)
    setLoadingMore(false)
    morePending.current = false
    setLoadError(null)

    try {
      const workspace = await paymentsApi.getPaymentWorkspace({ status: activeFilter, search: settledSearch, from: dateFrom, to: dateTo, limit: 50,
        ...(includeSummary ? {} : { includeSummary: false }) }, { signal: controller.signal })
      if (controller.signal.aborted || !mounted.current || requestId !== loadRequestId.current) return
      const ordersResponse = workspace?.items
      const statusesResponse = workspace?.paymentStatuses

      setOrders(normalizePaymentOrders(ordersResponse))
      if (includeSummary) {
        setCounters(workspace?.counts ?? { pending: 0, rejected: 0, confirmed: 0 })
        setPaymentStatuses(Array.isArray(statusesResponse) ? statusesResponse : [])
        summaryScope.current = { key: queryScope, expires: Date.now() + 30000 }
      }
      setPageInfo(workspace?.pageInfo ?? { nextCursor: null, hasMore: false })
    } catch (error) {
      if (controller.signal.aborted || !mounted.current || requestId !== loadRequestId.current) return
      summaryScope.current = null
      setOrders([])
      setPaymentStatuses([])
      setLoadError(
        error?.payload?.message ??
          'No fue posible cargar los pedidos de pago.',
      )
    } finally {
      if (!controller.signal.aborted && mounted.current && requestId === loadRequestId.current) setIsLoading(false)
    }
  }, [activeFilter, canRead, dateFrom, dateTo, paymentsApi, settledSearch, queryScope, previewCache])

  async function loadMorePayments() {
    if (!pageInfo.hasMore || !pageInfo.nextCursor || morePending.current || isLoading || searchPending || writePending.current) return
    const requestId = loadRequestId.current
    const controller = new AbortController()
    moreController.current = controller
    morePending.current = true
    setLoadingMore(true)
    try {
      const workspace = await paymentsApi.getPaymentWorkspace({ status: activeFilter, search: settledSearch, from: dateFrom, to: dateTo, limit: 50, cursor: pageInfo.nextCursor, includeSummary: false }, { signal: controller.signal })
      if (controller.signal.aborted || !mounted.current || requestId !== loadRequestId.current) return
      setOrders((current) => {
        const ids = new Set(current.map(item => item.id))
        return [...current, ...normalizePaymentOrders(workspace.items).filter(item => {
          if (ids.has(item.id)) return false
          ids.add(item.id)
          return true
        })]
      })
      setPageInfo(workspace.pageInfo)
    } catch (error) {
      if (!controller.signal.aborted && mounted.current && requestId === loadRequestId.current) setLoadError(error?.payload?.message ?? 'No fue posible cargar más pedidos de pago.')
    } finally {
      if (!controller.signal.aborted && mounted.current && requestId === loadRequestId.current) { morePending.current = false; setLoadingMore(false) }
    }
  }

  useEffect(() => {
    const requests = loadRequestId
    const loadTimer = window.setTimeout(() => {
      loadPaymentData(false)
    }, 0)

    return () => { window.clearTimeout(loadTimer); requests.current++; listController.current?.abort(); moreController.current?.abort(); summaryController.current?.abort() }
  }, [loadPaymentData, refreshKey])

  const filteredOrders = orders

  const getFilterCount = useCallback(
    (filterKey) => {
      if (filterKey === PAYMENT_STATUS.PENDIENTE) return counters.pending
      if (filterKey === PAYMENT_STATUS.RECHAZADO) return counters.rejected
      if (filterKey === PAYMENT_STATUS.CONFIRMADO) return counters.confirmed

      return 0
    },
    [counters],
  )
```

**S012: capaVista/src/modules/payments/pages/PaymentConfirmationPage.jsx, líneas 311–335.** Componente/función o selectores: PaymentWorkspace; debounce, lectura paginada, contadores, eventos y montaje. Filtros: PAG-F01–PAG-F04. Fragmento literal:

```jsx
  const handleFilterChange = useCallback((filterKey) => {
    setActiveFilter(filterKey)
    setEditingStatus({})
  }, [])

  const handleSearchChange = useCallback((nextSearchTerm) => {
    setSearchTerm(nextSearchTerm)
    setEditingStatus({})
  }, [])

  const handleDateFromChange = useCallback((nextDate) => {
    setDateFrom(nextDate)
    setEditingStatus({})
  }, [])

  const handleDateToChange = useCallback((nextDate) => {
    setDateTo(nextDate)
    setEditingStatus({})
  }, [])

  const clearDateRange = useCallback(() => {
    setDateFrom('')
    setDateTo('')
    setEditingStatus({})
  }, [])
```

**S012: capaVista/src/modules/payments/pages/PaymentConfirmationPage.jsx, líneas 529–595.** Componente/función o selectores: PaymentWorkspace; debounce, lectura paginada, contadores, eventos y montaje. Filtros: PAG-F01–PAG-F04. Fragmento literal:

```jsx
  return (
    <PageShell className={styles.page}>
      <PageSurface className={styles.dashboardShell}>
        <PageHeader title="Confirmacion de pago" />

        <div className={styles.summaryBoundary}>
          <PaymentSummaryCards counters={counters} />
        </div>

        <PaymentFilters
          activeFilter={activeFilter}
          dateFrom={dateFrom}
          dateTo={dateTo}
          filters={FILTERS}
          getFilterCount={getFilterCount}
          onClearDateRange={clearDateRange}
          onDateFromChange={handleDateFromChange}
          onDateToChange={handleDateToChange}
          onFilterChange={handleFilterChange}
          onSearchChange={handleSearchChange}
          searchTerm={searchTerm}
        />

        {loadError && (
          <div className={`alert alert-danger ${styles.stateMessage}`} role="alert">
            <span>{loadError}</span>
            <button
              className="btn btn-sm btn-outline-danger"
              onClick={loadPaymentData}
              type="button"
            >
              Reintentar
            </button>
          </div>
        )}
        {updateError && !credentialsTransition && <div className="alert alert-danger" role="alert">{updateError}</div>}

        {isLoading || searchPending ? (
          <LoadingIndicator context="pedidos de pago" />
        ) : (
          <>
            <PaymentOrdersTable
              canUpdatePaymentStatus={canUpdatePaymentStatus}
              editingStatus={editingStatus}
              isUpdatingPaymentStatus={isUpdatingPaymentStatus}
              onCloseEditor={closePaymentEditor}
              onPrefetchDetails={prefetchPaymentPreview}
              onSelectStatus={openPaymentActionConfirmation}
              onToggleEditor={openPaymentEditor}
              onViewDetail={openPaymentDetail}
              orders={filteredOrders}
            />

            <PaymentOrderMobileList
              canUpdatePaymentStatus={canUpdatePaymentStatus}
              editingStatus={editingStatus}
              isUpdatingPaymentStatus={isUpdatingPaymentStatus}
              onCloseEditor={closePaymentEditor}
              onPrefetchDetails={prefetchPaymentPreview}
              onSelectStatus={openPaymentActionConfirmation}
              onToggleEditor={openPaymentEditor}
              onViewDetail={openPaymentDetail}
              orders={filteredOrders}
            />
            {pageInfo.hasMore && <button disabled={loadingMore} onClick={loadMorePayments} type="button" aria-busy={loadingMore}><LoadingAction surface="light" busy={loadingMore} context="Cargar más pedidos">Cargar más pedidos</LoadingAction></button>}
          </>
        )}
```

<a id="fuente-S013"></a>

#### S013 — capaVista/src/modules/payments/pages/PaymentConfirmationPage.module.css

**Tipo:** CSS propio. **Responsabilidad, componentes y funciones:** Tokens locales, superficie y estados de lectura. **Filtros relacionados:** PAG-F01–PAG-F04.

**Cobertura:** 53 líneas originales; incluidos 1–53; cobertura completa. Huella SHA-256 inicial del archivo: 4D0835CCCA0F1E739035674CD941E795DA639296986E83FC1F3A8EB35439EC6E.

**S013: capaVista/src/modules/payments/pages/PaymentConfirmationPage.module.css, líneas 1–53.** Componente/función o selectores: Tokens locales, superficie y estados de lectura. Filtros: PAG-F01–PAG-F04. Fragmento literal:

```css
.page {
  --payment-border: #e5e7eb;
  --payment-orange: #f97316;
  --payment-orange-rgb: 249, 115, 22;
  --payment-red: #ef121c;
  --payment-green: #248f55;
  --payment-muted: #64748b;
  --payment-text: #111827;

  color: var(--payment-text);
  font-family:
    Inter,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif;
}

.dashboardShell {
  overflow: visible;
}

.summaryBoundary {
  display: flow-root;
}

.summaryBoundary > :global(.row) {
  margin: 0;
}

.stateMessage {
  align-items: center;
  display: flex;
  gap: 0.75rem;
  justify-content: space-between;
  margin: 1rem 1.5rem;
}

@media (max-width: 991.98px) {
  .dashboardShell {
    overflow: hidden;
  }
}

@media (max-width: 575.98px) {

  .stateMessage {
    align-items: stretch;
    flex-direction: column;
    margin: 0.75rem;
  }
}
```

<a id="fuente-S014"></a>

#### S014 — capaVista/src/modules/payments/api/paymentsApi.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** createPaymentsApi; serialización de parámetros y alcance. **Filtros relacionados:** PAG-F01–PAG-F04.

**Exportaciones declaradas** (línea inicial): 4: export function createPaymentsApi(apiClient) {.

**Relaciones/imports originales:** <code>../../orders/utils/orderDto</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 19 líneas originales; incluidos 1–19; cobertura completa. Huella SHA-256 inicial del archivo: D214933E196E55ED0AF7220F80FF35E2EF4051E421CDECB0CE4DE449A5C9BB99.

**S014: capaVista/src/modules/payments/api/paymentsApi.js, líneas 1–19.** Componente/función o selectores: createPaymentsApi; serialización de parámetros y alcance. Filtros: PAG-F01–PAG-F04. Fragmento literal:

```javascript
import { parsePaymentOrderDTO, parsePaymentWorkspaceDTO } from '../../orders/utils/orderDto'

let nextScopeId = 0
export function createPaymentsApi(apiClient) {
  return {
    scopeId: ++nextScopeId,
    getPaymentWorkspace: (params = {}, options = {}) => {
      const query = new URLSearchParams()
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') query.set(key, String(value))
      })
      return apiClient.get(`/orders/payments?${query.toString()}`, options).then(parsePaymentWorkspaceDTO)
    },
    getPaymentPreview: (orderId, options = {}) =>
      apiClient.get(`/orders/${orderId}/payment-records/preview`, options),
    updatePaymentStatus: (orderId, payload) =>
      apiClient.patch(`/orders/${orderId}/payment-status`, payload).then(parsePaymentOrderDTO),
  }
}
```

<a id="fuente-S015"></a>

#### S015 — capaVista/src/modules/payments/hooks/usePaymentsApi.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** usePaymentsApi; cliente memoizado. **Filtros relacionados:** PAG-F01–PAG-F04.

**Exportaciones declaradas** (línea inicial): 5: export function usePaymentsApi() {.

**Relaciones/imports originales:** <code>react</code>, <code>../../../hooks/useApiClient.js</code>, <code>../api/paymentsApi</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 8 líneas originales; incluidos 1–8; cobertura completa. Huella SHA-256 inicial del archivo: F4EE9EC94C9C5BCA392933849275A0AE7D431FB0286FE893D692E6D6CE080EC3.

**S015: capaVista/src/modules/payments/hooks/usePaymentsApi.js, líneas 1–8.** Componente/función o selectores: usePaymentsApi; cliente memoizado. Filtros: PAG-F01–PAG-F04. Fragmento literal:

```javascript
import { useMemo } from 'react'
import { useApiClient } from '../../../hooks/useApiClient.js'
import { createPaymentsApi } from '../api/paymentsApi'

export function usePaymentsApi() {
  const client = useApiClient()
  return useMemo(() => createPaymentsApi(client), [client])
}
```

<a id="fuente-S016"></a>

#### S016 — capaVista/src/modules/payments/components/PaymentOrdersTable.jsx

**Tipo:** JSX/React. **Responsabilidad, componentes y funciones:** PaymentOrdersTable; resultado, vacío y acciones de pago. **Filtros relacionados:** PAG-F01–PAG-F04.

**Exportaciones declaradas** (línea inicial): 6: export default function PaymentOrdersTable({.

**Relaciones/imports originales:** <code>../utils/paymentDocuments</code>, <code>./PaymentRowActions</code>, <code>./PaymentStatusBadge</code>, <code>./PaymentOrdersTable.module.css</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 82 líneas originales; incluidos 1–82; cobertura completa. Huella SHA-256 inicial del archivo: 0B8AE31234447FA5AFF5ED127A63FDD14C128E63CD969005C197C04132D92984.

**S016: capaVista/src/modules/payments/components/PaymentOrdersTable.jsx, líneas 1–82.** Componente/función o selectores: PaymentOrdersTable; resultado, vacío y acciones de pago. Filtros: PAG-F01–PAG-F04. Fragmento literal:

```jsx
import { formatPaymentDate } from '../utils/paymentDocuments'
import PaymentRowActions from './PaymentRowActions'
import PaymentStatusBadge from './PaymentStatusBadge'
import styles from './PaymentOrdersTable.module.css'

export default function PaymentOrdersTable({
  canUpdatePaymentStatus,
  editingStatus,
  isUpdatingPaymentStatus = false,
  orders,
  onCloseEditor,
  onPrefetchDetails,
  onSelectStatus,
  onToggleEditor,
  onViewDetail,
}) {
  return (
    <section
      className={`d-none d-lg-block ${styles.desktopTableWrap}`}
      aria-label="Tabla de pagos"
    >
      <table className={`table table-hover align-middle mb-0 ${styles.paymentTable}`}>
        <colgroup>
          <col className={styles.colOrder} />
          <col className={styles.colClient} />
          <col className={styles.colRut} />
          <col className={styles.colDate} />
          <col className={styles.colPaymentStatus} />
          <col className={styles.colActions} />
        </colgroup>

        <thead>
          <tr>
            <th>Pedido</th>
            <th>Cliente</th>
            <th className={styles.rutColumn}>RUT</th>
            <th>Fecha</th>
            <th>Estado</th>
            <th className={styles.actionsColumn}>Acciones</th>
          </tr>
        </thead>

        <tbody>
          {orders.length > 0 ? (
            orders.map((order) => (
              <tr key={order.id}>
                <td className={styles.orderCell}>{order.nvNumber}</td>
                <td className={styles.clientCell}>{order.companyName}</td>
                <td className={styles.rutCell}>{order.rut}</td>
                <td className={styles.dateCell}>
                  {formatPaymentDate(order.createdAt)}
                </td>
                <td>
                  <PaymentStatusBadge status={order.paymentStatus} />
                </td>
                <td className={styles.actionsCell}>
                  <PaymentRowActions
                    canUpdatePaymentStatus={canUpdatePaymentStatus}
                    editingStatus={editingStatus}
                    isUpdatingPaymentStatus={isUpdatingPaymentStatus}
                    onCloseEditor={onCloseEditor}
                    onPrefetchDetails={onPrefetchDetails}
                    onSelectStatus={onSelectStatus}
                    onToggleEditor={onToggleEditor}
                    onViewDetail={onViewDetail}
                    order={order}
                  />
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td className={styles.emptyState} colSpan="6">
                No hay pedidos que coincidan con los filtros aplicados.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  )
}
```

<a id="fuente-S017"></a>

#### S017 — capaVista/src/modules/payments/components/PaymentOrderMobileList.jsx

**Tipo:** JSX/React. **Responsabilidad, componentes y funciones:** PaymentOrderMobileList; resultado móvil con mismas filas. **Filtros relacionados:** PAG-F01–PAG-F04.

**Exportaciones declaradas** (línea inicial): 13: export default function PaymentOrderMobileList({.

**Relaciones/imports originales:** <code>@/config/status</code>, <code>../utils/paymentDocuments</code>, <code>./PaymentRowActions</code>, <code>./PaymentStatusBadge</code>, <code>./PaymentOrderMobileList.module.css</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 88 líneas originales; incluidos 1–88; cobertura completa. Huella SHA-256 inicial del archivo: 1FADD24FD9E525B6FC6D4573DCE4C77481B3E350CB25A2233E9313B8D4EBCD88.

**S017: capaVista/src/modules/payments/components/PaymentOrderMobileList.jsx, líneas 1–88.** Componente/función o selectores: PaymentOrderMobileList; resultado móvil con mismas filas. Filtros: PAG-F01–PAG-F04. Fragmento literal:

```jsx
import { PAYMENT_STATUS } from '@/config/status'
import { formatPaymentDate } from '../utils/paymentDocuments'
import PaymentRowActions from './PaymentRowActions'
import PaymentStatusBadge from './PaymentStatusBadge'
import styles from './PaymentOrderMobileList.module.css'

const MOBILE_CARD_STATUS_CLASS = {
  [PAYMENT_STATUS.PENDIENTE]: styles.mobileCardPending,
  [PAYMENT_STATUS.RECHAZADO]: styles.mobileCardRejected,
  [PAYMENT_STATUS.CONFIRMADO]: styles.mobileCardConfirmed,
}

export default function PaymentOrderMobileList({
  canUpdatePaymentStatus,
  editingStatus,
  isUpdatingPaymentStatus = false,
  orders,
  onCloseEditor,
  onPrefetchDetails,
  onSelectStatus,
  onToggleEditor,
  onViewDetail,
}) {
  return (
    <section
      className={`d-lg-none ${styles.mobileList}`}
      aria-label="Pedidos de pago"
    >
      {orders.length > 0 ? (
        orders.map((order) => (
          <article
            className={`${styles.mobileCard} ${
              MOBILE_CARD_STATUS_CLASS[order.paymentStatus] || styles.mobileCardPending
            }`}
            key={`mobile-${order.id}`}
          >
            <header className={styles.mobileCardHeader}>
              <div>
                <span>Pedido</span>
                <strong>{order.nvNumber}</strong>
              </div>
            </header>

            <dl className={styles.mobileDataList}>
              <div>
                <dt>Cliente</dt>
                <dd>{order.companyName}</dd>
              </div>
              <div>
                <dt>RUT</dt>
                <dd>{order.rut}</dd>
              </div>
              <div>
                <dt>Fecha</dt>
                <dd>{formatPaymentDate(order.createdAt)}</dd>
              </div>
              <div>
                <dt>Estado</dt>
                <dd className={styles.mobileStatusBadgeWrap}>
                  <PaymentStatusBadge status={order.paymentStatus} />
                </dd>
              </div>
            </dl>

            <div className="d-grid gap-2 mt-3">
              <PaymentRowActions
                canUpdatePaymentStatus={canUpdatePaymentStatus}
                editingStatus={editingStatus}
                isUpdatingPaymentStatus={isUpdatingPaymentStatus}
                isMobile
                onCloseEditor={onCloseEditor}
                onPrefetchDetails={onPrefetchDetails}
                onSelectStatus={onSelectStatus}
                onToggleEditor={onToggleEditor}
                onViewDetail={onViewDetail}
                order={order}
              />
            </div>
          </article>
        ))
      ) : (
        <div className={styles.mobileCard}>
          No hay pedidos que coincidan con los filtros aplicados.
        </div>
      )}
    </section>
  )
}
```

<a id="fuente-S018"></a>

#### S018 — capaVista/src/modules/payments/components/PaymentSummaryCards.jsx

**Tipo:** JSX/React. **Responsabilidad, componentes y funciones:** PaymentSummaryCards; indicadores que no filtran. **Filtros relacionados:** PAG-F01–PAG-F04.

**Exportaciones declaradas** (línea inicial): 27: export default function PaymentSummaryCards({ counters }) {.

**Relaciones/imports originales:** <code>./PaymentSummaryCards.module.css</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 50 líneas originales; incluidos 1–50; cobertura completa. Huella SHA-256 inicial del archivo: 62C73F88F9BA6E6AF1CEBC13BDF8A2E9FAD2A2BFA1D09BAAAB113A42FE1C9199.

**S018: capaVista/src/modules/payments/components/PaymentSummaryCards.jsx, líneas 1–50.** Componente/función o selectores: PaymentSummaryCards; indicadores que no filtran. Filtros: PAG-F01–PAG-F04. Fragmento literal:

```jsx
import styles from './PaymentSummaryCards.module.css'

const buildSummaryCards = (counters) => [
  {
    key: 'pending',
    label: 'Pendientes',
    count: counters.pending,
    icon: 'bi-clock',
    iconClassName: styles.summaryIconPending,
  },
  {
    key: 'rejected',
    label: 'Rechazados',
    count: counters.rejected,
    icon: 'bi-x',
    iconClassName: styles.summaryIconRejected,
  },
  {
    key: 'confirmed',
    label: 'Confirmados',
    count: counters.confirmed,
    icon: 'bi-check',
    iconClassName: styles.summaryIconConfirmed,
  },
]

export default function PaymentSummaryCards({ counters }) {
  const summaryCards = buildSummaryCards(counters)

  return (
    <section
      className={`row row-cols-1 row-cols-lg-3 g-2 ${styles.summaryGrid}`}
      aria-label="Resumen de pagos"
    >
      {summaryCards.map((card) => (
        <div className="col" key={card.key}>
          <article
            className={`${styles.summaryCard} d-flex align-items-center h-100`}
          >
            <i className={`bi ${card.icon} ${card.iconClassName}`} />
            <div>
              <span>{card.label}</span>
              <strong>{card.count}</strong>
            </div>
          </article>
        </div>
      ))}
    </section>
  )
}
```

<a id="fuente-S019"></a>

#### S019 — capaVista/src/modules/payments/utils/paymentOrders.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** Normalización de pedidos de pago. **Filtros relacionados:** PAG-F01–PAG-F04.

**Exportaciones declaradas** (línea inicial): 43: export function normalizePaymentOrder(order) {; 68: export function normalizePaymentOrders(orders) {; 76: export function mergePaymentPreview(order, preview) {; 92: export function getPaymentStatusIdByName(statuses, statusName) {.

**Relaciones/imports originales:** <code>../../../config/status.js</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 103 líneas originales; incluidos 1–74. Fuera de extracción: 75–103; corresponden al contexto restante del archivo y no se sustituyen por código inventado. Huella SHA-256 inicial del archivo: 18B6226CFC4C587EE1ECC45C3B23DA5EA0E535696E69FAF03BACD2CBF52F4E9E.

**S019: capaVista/src/modules/payments/utils/paymentOrders.js, líneas 1–74.** Componente/función o selectores: Normalización de pedidos de pago. Filtros: PAG-F01–PAG-F04. Fragmento literal:

```javascript
import { PAYMENT_STATUS } from '../../../config/status.js'

const PAYMENT_STATUS_NAMES = new Set(Object.values(PAYMENT_STATUS))

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function textOrNull(value) {
  return hasText(value) ? value.trim() : null
}

function normalizeQuantity(value) {
  if (value === null || value === undefined || value === '') return null

  const quantity = Number(value)
  return Number.isFinite(quantity) ? quantity : null
}

function normalizePreviewProducts(details) {
  if (!Array.isArray(details)) return []

  return details.map((detail, index) => {
    return {
      id: detail?.id ?? `detail-${index}`,
      code: textOrNull(detail?.code),
      productType: textOrNull(detail?.productType),
      product: textOrNull(detail?.product),
      quantity: normalizeQuantity(detail?.quantity),
    }
  })
}

function normalizeStatusName(status) {
  if (!hasText(status)) return PAYMENT_STATUS.PENDIENTE

  const trimmedStatus = status.trim()
  return PAYMENT_STATUS_NAMES.has(trimmedStatus)
    ? trimmedStatus
    : PAYMENT_STATUS.PENDIENTE
}

export function normalizePaymentOrder(order) {
  const id = order?.id
  const nvNumber = hasText(order?.salesNoteNumber)
    ? order.salesNoteNumber.trim()
    : `Pedido #${id ?? 'sin ID'}`
  const companyName = hasText(order?.clientBusinessName)
    ? order.clientBusinessName.trim()
    : hasText(order?.clientName)
      ? order.clientName.trim()
      : 'Cliente sin nombre'

  return {
    id,
    nvNumber,
    companyName,
    rut: hasText(order?.clientRut)
      ? order.clientRut.trim()
      : 'RUT no disponible',
    sellerEmail: null,
    trackedProducts: [],
    paymentStatus: normalizeStatusName(order?.paymentStatus),
    createdAt: order?.createdAt ?? null,
  }
}

export function normalizePaymentOrders(orders) {
  if (!Array.isArray(orders)) return []

  return orders
    .map(normalizePaymentOrder)
    .filter((order) => order.id !== undefined && order.id !== null)
}
```


### 15.4. Usuarios

<a id="fuente-S020"></a>

#### S020 — capaVista/src/modules/users/components/UserManagementFilters.jsx

**Tipo:** JSX/React. **Responsabilidad, componentes y funciones:** UserManagementFilters; buscador, panel, estado y rol. **Filtros relacionados:** USR-F01–USR-F04.

**Exportaciones declaradas** (línea inicial): 14: export default function UserManagementFilters({.

**Relaciones/imports originales:** <code>../../../hooks/useAuth</code>, <code>../../../config/roles</code>, <code>./UserButton</code>, <code>../pages/UserManagementPage.module.css</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 114 líneas originales; incluidos 1–114; cobertura completa. Huella SHA-256 inicial del archivo: 61780631B06D58A51415E9BA54E16C8285BB26406B7B6460B5E3061D42FB1AB3.

**S020: capaVista/src/modules/users/components/UserManagementFilters.jsx, líneas 1–114.** Componente/función o selectores: UserManagementFilters; buscador, panel, estado y rol. Filtros: USR-F01–USR-F04. Fragmento literal:

```jsx
import { useAuth } from "../../../hooks/useAuth";
import { getRoleLabel, manageableRoles } from '../../../config/roles'
import UserButton from './UserButton'
import styles from '../pages/UserManagementPage.module.css'

const STATUS_FILTERS = Object.freeze([
  { value: '', label: 'Todos', countKey: 'totalUsuarios' },
  { value: 'Vinculado', label: 'Vinculados', countKey: 'vinculados' },
  { value: 'Pendiente', label: 'Pendientes', countKey: 'pendientes' },
  // { value: 'Pendiente rol', label: 'Pendientes de rol', countKey: 'pendientesRol' },
  { value: 'Desvinculado', label: 'Desvinculados', countKey: 'desvinculados' },
])

export default function UserManagementFilters({
  activeRole,
  activeStatus,
  isOpen,
  onClear,
  onCreateUser,
  onRoleChange,
  onSearchChange,
  onStatusChange,
  onToggle,
  searchTerm,
  summary,
}) {
  const hasActiveFilters = Boolean(activeRole || activeStatus || searchTerm.trim())

  const { user: actor } = useAuth()
  return (
    <section className={styles.filtersShell} aria-label="Busqueda y filtros de usuarios">
      <div className={styles.filtersTopbar}>
        <label className={styles.searchBox} htmlFor="user-management-search">
          <i className="bi bi-search" aria-hidden="true" />
          <span className="visually-hidden">Buscar usuario</span>
          <input
            id="user-management-search"
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Buscar por nombre, apellido, correo o RUT"
            type="search"
            value={searchTerm}
          />
        </label>

        <button
          aria-controls="user-management-filter-panel"
          aria-expanded={isOpen}
          className={styles.filterToggleButton}
          onClick={onToggle}
          type="button"
        >
          <i className="bi bi-funnel" aria-hidden="true" />
          {isOpen ? 'Ocultar filtros' : 'Mostrar filtros'}
        </button>

        <UserButton className={styles.createUserButton} icon="bi-plus-lg" onClick={onCreateUser} variant="primary">
          Crear usuario
        </UserButton>
      </div>

      {isOpen && (
        <div className={styles.filterPanel} id="user-management-filter-panel">
          <fieldset className={styles.filterGroup}>
            <legend>Estado</legend>
            <div className={styles.filterOptions}>
              {STATUS_FILTERS.map((filter) => (
                <button
                  aria-pressed={activeStatus === filter.value}
                  className={`${styles.filterChip} ${activeStatus === filter.value ? styles.filterChipActive : ''}`}
                  key={filter.label}
                  onClick={() => onStatusChange(filter.value)}
                  type="button"
                >
                  <span>{filter.label}</span>
                  <strong>{summary?.[filter.countKey] ?? '—'}</strong>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className={styles.filterGroup}>
            <legend>Rol</legend>
            <div className={styles.filterOptions}>
              <button
                aria-pressed={activeRole === ''}
                className={`${styles.filterChip} ${activeRole === '' ? styles.filterChipActive : ''}`}
                onClick={() => onRoleChange('')}
                type="button"
              >
                <span>Todos</span>
              </button>
              {manageableRoles(actor?.rolUsuario).map((role) => (
                <button
                  aria-pressed={activeRole === role}
                  className={`${styles.filterChip} ${activeRole === role ? styles.filterChipActive : ''}`}
                  key={role}
                  onClick={() => onRoleChange(role)}
                  type="button"
                >
                  <span>{getRoleLabel(role)}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <button className={styles.clearFiltersButton} disabled={!hasActiveFilters} onClick={onClear} type="button">
            <i className="bi bi-trash3" aria-hidden="true" />
            Limpiar filtros
          </button>
        </div>
      )}
    </section>
  )
}
```

<a id="fuente-S021"></a>

#### S021 — capaVista/src/modules/users/pages/UserManagementPage.jsx

**Tipo:** JSX/React. **Responsabilidad, componentes y funciones:** UserManagementPage; debounce, peticiones, resumen separado, cambios y montaje. **Filtros relacionados:** USR-F01–USR-F04.

**Exportaciones declaradas** (línea inicial): 88: export default function UserManagementPage() {.

**Relaciones/imports originales:** <code>react</code>, <code>../../../services/api/apiClient</code>, <code>../../../hooks/useAuth</code>, <code>../hooks/useAdminUsersApi</code>, <code>../components/UserButton</code>, <code>../components/UserCreateModal</code>, <code>../components/UserEditModal</code>, <code>../components/UserManagementFilters</code>, <code>../components/UserManagementTable</code>, <code>../components/UserMovementsModal</code>, <code>../components/UserSummaryCards</code>, <code>../utils/latestRequestTracker</code>, <code>../../../config/userLifecycle.js</code>, <code>./UserManagementPage.module.css</code>, <code>../../../shared/components/layout/PageShell</code>, <code>../../../shared/components/layout/PageHeader</code>, <code>../../../shared/notifications/useToast</code>, <code>../../../shared/notifications/operationFeedback</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 421 líneas originales; incluidos 1–29, 88–274, 339–421. Fuera de extracción: 30–87, 275–338; corresponden al contexto restante del archivo y no se sustituyen por código inventado. Huella SHA-256 inicial del archivo: 0232BB238A17AF64FB30C221E5793069A83C5D2854FF8C0EF1E5803A6488A77C.

**S021: capaVista/src/modules/users/pages/UserManagementPage.jsx, líneas 1–29.** Componente/función o selectores: UserManagementPage; debounce, peticiones, resumen separado, cambios y montaje. Filtros: USR-F01–USR-F04. Fragmento literal:

```jsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { API_ERROR_CODES } from '../../../services/api/apiClient'
import { useAuth } from '../../../hooks/useAuth'
import { useAdminUsersApi } from '../hooks/useAdminUsersApi'
import UserButton from '../components/UserButton'
import UserCreateModal from '../components/UserCreateModal'
import UserEditModal from '../components/UserEditModal'
import UserManagementFilters from '../components/UserManagementFilters'
import UserManagementTable from '../components/UserManagementTable'
import UserMovementsModal from '../components/UserMovementsModal'
import UserSummaryCards from '../components/UserSummaryCards'
import { createLatestRequestTracker } from '../utils/latestRequestTracker'
import { displayUserStatus } from '../../../config/userLifecycle.js'
import styles from './UserManagementPage.module.css'
import PageShell from '../../../shared/components/layout/PageShell'
import PageHeader from '../../../shared/components/layout/PageHeader'
import { useToast } from '../../../shared/notifications/useToast'
import { FEEDBACK_HANDLED, publicOperationMessage, requiresContext, uncertainOperation, operationFailureMessage } from '../../../shared/notifications/operationFeedback'

const EMPTY_SUMMARY = Object.freeze({
  totalUsuarios: 0,
  vinculados: 0,
  desvinculados: 0,
  pendientes: 0,
  pendientesRol: 0,
})

const DEFAULT_PAGE_SIZE = 10
const SEARCH_DEBOUNCE_MS = 350
```

**S021: capaVista/src/modules/users/pages/UserManagementPage.jsx, líneas 88–274.** Componente/función o selectores: UserManagementPage; debounce, peticiones, resumen separado, cambios y montaje. Filtros: USR-F01–USR-F04. Fragmento literal:

```jsx
export default function UserManagementPage() {
  const notify = useToast()
  const { identityUser, loginWithRedirect } = useAuth()
  const adminUsersApi = useAdminUsersApi()
  const latestRequestRef = useRef(0)
  const listController = useRef(null)
  const summaryController = useRef(null)
  const preserveNextListMessage = useRef(false)
  const latestSummaryRequestRef = useRef(createLatestRequestTracker())
  const [users, setUsers] = useState([])
  const [activeStatus, setActiveStatus] = useState('')
  const [activeRole, setActiveRole] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('')
  const [page, setPage] = useState(1)
  const [totalUsers, setTotalUsers] = useState(0)
  const [summary, setSummary] = useState(EMPTY_SUMMARY)
  const [summaryState, setSummaryState] = useState({
    error: '',
    hasData: false,
    isLoading: true,
  })
  const [isFiltersOpen, setIsFiltersOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [actionMessage, setActionMessage] = useState(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [movementsUser, setMovementsUser] = useState(null)
  const [editingUser, setEditingUser] = useState(null)
  const [inspectingId, setInspectingId] = useState(null)
  const inspection = useRef({ busy: false, version: 0, active: false, controller: null })
  useEffect(() => {
    const tracker = inspection.current
    tracker.active = true
    return () => {
      tracker.active = false
      tracker.version++
      tracker.busy = false
      tracker.controller?.abort()
    }
  }, [adminUsersApi])
  const currentExternalUserId = identityUser?.sub ?? null

  useEffect(() => {
    if (searchTerm.trim() === debouncedSearchTerm) return
    const debounceTimer = window.setTimeout(() => {
      setDebouncedSearchTerm(searchTerm.trim())
      setPage(1)
    }, SEARCH_DEBOUNCE_MS)

    return () => window.clearTimeout(debounceTimer)
  }, [searchTerm, debouncedSearchTerm])

  const loadUsers = useCallback(
    async ({ preserveMessage = false, requestedPage = page } = {}) => {
      const requestId = latestRequestRef.current + 1
      latestRequestRef.current = requestId
      listController.current?.abort()
      const controller = new AbortController()
      listController.current = controller
      setIsLoading(true)

      if (!preserveMessage) {
        setActionMessage(null)
      }

      try {
        const response = await adminUsersApi.listUsers({
          page: requestedPage,
          perPage: DEFAULT_PAGE_SIZE,
          search: debouncedSearchTerm,
          estadoUsuario: activeStatus,
          rolUsuario: activeRole,
        }, { signal: controller.signal })

        if (controller.signal.aborted || requestId !== latestRequestRef.current) {
          return
        }

        setUsers(
          (response.usuarios ?? []).map((user) => {
            const mappedUser = mapApiUser(user)

            return {
              ...mappedUser,
              isCurrentUser: Boolean(
                currentExternalUserId &&
                  mappedUser.idUsuarioAutenticacionExterna === currentExternalUserId,
              ),
            }
          }),
        )
        setTotalUsers(response.total ?? 0)
      } catch (error) {
        if (controller.signal.aborted || requestId !== latestRequestRef.current) {
          return
        }

        setUsers([])
        setTotalUsers(0)
        setActionMessage({ type: 'danger', text: getErrorText(error), requiresLogin: error?.status === 401 })
      } finally {
        if (!controller.signal.aborted && requestId === latestRequestRef.current) {
          setIsLoading(false)
        }
      }
    },
    [activeRole, activeStatus, adminUsersApi, currentExternalUserId, debouncedSearchTerm, page],
  )

  const loadSummary = useCallback(async () => {
    const tracker = latestSummaryRequestRef.current
    const requestId = tracker.begin()
    summaryController.current?.abort()
    const controller = new AbortController()
    summaryController.current = controller
    setSummaryState((current) => ({ ...current, error: '', isLoading: true }))

    try {
      const response = await adminUsersApi.getSummary({ signal: controller.signal })

      if (controller.signal.aborted || !tracker.isLatest(requestId)) return

      setSummary({
        totalUsuarios: response.totalUsuarios ?? 0,
        vinculados: response.vinculados ?? 0,
        desvinculados: response.desvinculados ?? 0,
        pendientes: response.pendientes ?? 0,
        pendientesRol: response.pendientesRol ?? 0,
      })
      setSummaryState({ error: '', hasData: true, isLoading: false })
    } catch (error) {
      if (controller.signal.aborted || !tracker.isLatest(requestId)) return

      setSummaryState((current) => ({
        ...current,
        error: getErrorText(error),
        isLoading: false,
      }))
    }
  }, [adminUsersApi])

  useEffect(() => {
    const requestTimer = window.setTimeout(() => {
      const preserveMessage = preserveNextListMessage.current
      preserveNextListMessage.current = false
      loadUsers({ preserveMessage })
    }, 0)

    return () => {
      window.clearTimeout(requestTimer)
      latestRequestRef.current++
      listController.current?.abort()
    }
  }, [loadUsers])

  useEffect(() => {
    const tracker = latestSummaryRequestRef.current
    const requestTimer = window.setTimeout(() => {
      loadSummary()
    }, 0)

    return () => {
      window.clearTimeout(requestTimer)
      tracker.invalidate()
      summaryController.current?.abort()
    }
  }, [loadSummary])

  const totalPages = Math.max(1, Math.ceil(totalUsers / DEFAULT_PAGE_SIZE))

  function handleStatusChange(status) {
    setActiveStatus(status)
    setPage(1)
  }

  function handleRoleChange(role) {
    setActiveRole(role)
    setPage(1)
  }

  function handleClearFilters() {
    setActiveStatus('')
    setActiveRole('')
    setSearchTerm('')
    setDebouncedSearchTerm('')
    setPage(1)
  }
```

**S021: capaVista/src/modules/users/pages/UserManagementPage.jsx, líneas 339–421.** Componente/función o selectores: UserManagementPage; debounce, peticiones, resumen separado, cambios y montaje. Filtros: USR-F01–USR-F04. Fragmento literal:

```jsx
  return (
    <PageShell className={styles.page} aria-labelledby="user-management-title">
      <section className={styles.dashboardShell}>
        <PageHeader title="Gestion de usuarios" titleId="user-management-title" />

        <UserSummaryCards
          isLoading={summaryState.isLoading}
          summary={summaryState.hasData ? summary : null}
        />

        {summaryState.error && (
          <div className={`${styles.feedbackMessage} ${styles.feedbackdanger}`} role="alert">
            <span>{summaryState.error} {summaryState.hasData ? 'Se conservan los ultimos valores disponibles.' : ''}</span>
            <UserButton disabled={summaryState.isLoading} onClick={() => { void loadSummary() }} variant="secondary">
              Reintentar resumen
            </UserButton>
          </div>
        )}

        <div className={styles.content}>
          {actionMessage && (
            <div className={`${styles.feedbackMessage} ${styles[`feedback${actionMessage.type}`]}`} role="status">
              <span>{actionMessage.text}</span>
              {actionMessage.requiresLogin && (
                <UserButton onClick={() => loginWithRedirect()} variant="secondary">
                  Iniciar sesion
                </UserButton>
              )}
            </div>
          )}

          <UserManagementFilters
            activeRole={activeRole}
            activeStatus={activeStatus}
            isOpen={isFiltersOpen}
            onClear={handleClearFilters}
            onCreateUser={() => setIsCreateModalOpen(true)}
            onRoleChange={handleRoleChange}
            onSearchChange={setSearchTerm}
            onStatusChange={handleStatusChange}
            onToggle={() => setIsFiltersOpen((currentValue) => !currentValue)}
            searchTerm={searchTerm}
            summary={summaryState.hasData ? summary : null}
          />

          <UserManagementTable
            inspectingId={inspectingId}
            currentPage={page}
            isLoading={isLoading}
            onEditUser={handleInspectUser}
            onViewMovements={setMovementsUser}
            onPageChange={setPage}
            totalPages={totalPages}
            totalUsers={totalUsers}
            users={users}
          />
        </div>
      </section>

      {movementsUser && (
        <UserMovementsModal
          key={movementsUser.id}
          user={movementsUser}
          api={adminUsersApi}
          onClose={() => setMovementsUser(null)}
        />
      )}
      <UserCreateModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={handleCreatedUser}
      />
      <UserEditModal
        key={editingUser?.id ?? 'user-edit-modal'}
        isOpen={Boolean(editingUser)}
        onClose={() => setEditingUser(null)}
        onSave={handleSaveUser}
        isCurrentUser={Boolean(editingUser?.isCurrentUser)}
        user={editingUser}
      />
    </PageShell>
  )
}
```

<a id="fuente-S022"></a>

#### S022 — capaVista/src/modules/users/pages/UserManagementPage.module.css

**Tipo:** CSS propio. **Responsabilidad, componentes y funciones:** Tokens, filtros, botones, focus, paginación y responsive. **Filtros relacionados:** USR-F01–USR-F04.

**Cobertura:** 996 líneas originales; incluidos 1–17, 25–34, 94–250, 390–423, 483–486, 499–506, 508–556, 741–874, 876–988. Fuera de extracción: 18–24, 35–93, 251–389, 424–482, 487–498, 507–507, 557–740, 875–875, 989–996; corresponden al contexto restante del archivo y no se sustituyen por código inventado. Huella SHA-256 inicial del archivo: EE4BFFD3D8317DA8B2C8277AE304C1092CF9A1955DAC3583FB826313B48C2A10.

**S022: capaVista/src/modules/users/pages/UserManagementPage.module.css, líneas 1–17.** Componente/función o selectores: Tokens, filtros, botones, focus, paginación y responsive. Filtros: USR-F01–USR-F04. Fragmento literal:

```css
.page {
  --users-border: #dfe5ec;
  --users-green: #15803d;
  --users-orange: #f97316;
  --users-orange-soft: rgba(249, 115, 22, 0.12);
  --users-red: #dc2626;
  --users-soft: #f4f4f5;
  --users-text: #111827;
  --users-muted: #64748b;
  color: var(--users-text);
}

.dashboardShell {
  display: grid;
  gap: 1rem;
  padding: 0 0 1rem;
}
```

**S022: capaVista/src/modules/users/pages/UserManagementPage.module.css, líneas 25–34.** Componente/función o selectores: Tokens, filtros, botones, focus, paginación y responsive. Filtros: USR-F01–USR-F04. Fragmento literal:

```css
.summaryCard,
.filtersShell,
.tableCard,
.createModal,
.confirmModal {
  background: #fff;
  border: 1px solid var(--users-border);
  border-radius: 0.75rem;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.045);
}
```

**S022: capaVista/src/modules/users/pages/UserManagementPage.module.css, líneas 94–250.** Componente/función o selectores: Tokens, filtros, botones, focus, paginación y responsive. Filtros: USR-F01–USR-F04. Fragmento literal:

```css
.content {
  display: grid;
  gap: 0.9rem;
}

.feedbackMessage {
  align-items: center;
  border: 1px solid transparent;
  border-radius: 0.65rem;
  display: flex;
  gap: 1rem;
  justify-content: space-between;
  padding: 0.85rem 1rem;
}



.feedbackdanger {
  background: #fff1f0;
  border-color: #fecaca;
  color: #b02a37;
}

.feedbackwarning {
  background: #fffbeb;
  border-color: #fde68a;
  color: #92400e;
}

.filtersShell {
  padding: 0.85rem;
}

.filtersTopbar {
  display: grid;
  gap: 0.8rem;
  grid-template-columns: minmax(16rem, 1fr) auto auto;
}

.searchBox {
  align-items: center;
  background: var(--users-soft);
  border: 1px solid #dbe3ef;
  border-radius: 0.6rem;
  color: #0f172a;
  display: flex;
  gap: 0.75rem;
  min-width: 0;
  padding: 0 1rem;
  transition: border-color 150ms ease, box-shadow 150ms ease;
}

.searchBox:focus-within {
  border-color: var(--users-orange);
  box-shadow: 0 0 0 0.18rem var(--users-orange-soft);
}

.searchBox > i {
  flex: 0 0 auto;
  font-size: 1.15rem;
}

.searchBox input {
  background: transparent;
  border: 0;
  color: var(--users-text);
  min-height: 3.15rem;
  min-width: 0;
  outline: 0;
  width: 100%;
}

.searchBox input::placeholder {
  color: #8190a5;
}

.filterToggleButton,
.clearFiltersButton,
.userButton,
.pageButton,
.modalCloseButton {
  align-items: center;
  border-radius: 0.55rem;
  display: inline-flex;
  gap: 0.5rem;
  justify-content: center;
  min-height: 2.4rem;
}

.filterToggleButton,
.clearFiltersButton,
.pageButton,
.modalCloseButton {
  background: #fff;
  border: 1px solid #cbd5e1;
  color: var(--users-text);
  padding: 0.45rem 0.9rem;
}

.filterToggleButton {
  font-weight: 800;
  min-height: 3.15rem;
  min-width: 10rem;
}

.filterToggleButton:hover,
.clearFiltersButton:hover:not(:disabled) {
  background: var(--users-soft);
  border-color: #94a3b8;
}

.filterPanel {
  border-top: 1px solid #edf2f7;
  display: grid;
  gap: 1rem;
  margin-top: 1rem;
  padding-top: 1rem;
}

.filterGroup {
  border: 0;
  margin: 0;
  padding: 0;
}

.filterGroup legend {
  color: var(--users-muted);
  font-size: 0.78rem;
  font-weight: 850;
  letter-spacing: 0.06em;
  margin-bottom: 0.5rem;
  text-transform: uppercase;
}

.filterOptions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.filterChip {
  align-items: center;
  background: var(--users-soft);
  border: 1px solid #dbe3ef;
  border-radius: 999px;
  color: var(--users-text);
  display: inline-flex;
  gap: 0.5rem;
  min-height: 2.25rem;
  padding: 0.35rem 0.85rem;
}

.filterChipActive {
  background: #000;
  border-color: #000;
  color: #fff;
}
```

**S022: capaVista/src/modules/users/pages/UserManagementPage.module.css, líneas 390–423.** Componente/función o selectores: Tokens, filtros, botones, focus, paginación y responsive. Filtros: USR-F01–USR-F04. Fragmento literal:

```css
.userButton {
  border: 1px solid transparent;
  font-weight: 800;
  padding: 0.5rem 0.9rem;
  transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease;
}

.userButton:disabled,
.pageButton:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.userButtonPrimary {
  background: #000;
  border-color: #000;
  color: #fff;
}

.userButtonPrimary:hover:not(:disabled) {
  background: #1f2937;
  border-color: #1f2937;
}

.userButtonSecondary {
  background: #fff;
  border-color: #cbd5e1;
  color: var(--users-text);
}

.userButtonSecondary:hover:not(:disabled) {
  background: var(--users-soft);
  border-color: #94a3b8;
}
```

**S022: capaVista/src/modules/users/pages/UserManagementPage.module.css, líneas 483–486.** Componente/función o selectores: Tokens, filtros, botones, focus, paginación y responsive. Filtros: USR-F01–USR-F04. Fragmento literal:

```css
.createUserButton {
  min-height: 3.15rem;
  min-width: 10.5rem;
}
```

**S022: capaVista/src/modules/users/pages/UserManagementPage.module.css, líneas 499–506.** Componente/función o selectores: Tokens, filtros, botones, focus, paginación y responsive. Filtros: USR-F01–USR-F04. Fragmento literal:

```css
.filterToggleButton:focus-visible,
.filterChip:focus-visible,
.userButton:focus-visible,
.pageButton:focus-visible {
  box-shadow: 0 0 0 0.2rem var(--users-orange-soft);
  outline: 2px solid var(--users-orange);
  outline-offset: 2px;
}
```

**S022: capaVista/src/modules/users/pages/UserManagementPage.module.css, líneas 508–556.** Componente/función o selectores: Tokens, filtros, botones, focus, paginación y responsive. Filtros: USR-F01–USR-F04. Fragmento literal:

```css
.paginationFooter {
  align-items: center;
  background: #fff;
  border-top: 1px solid var(--users-border);
  display: flex;
  gap: 1rem;
  justify-content: space-between;
  padding: 1rem;
}

.resultsSummary {
  color: var(--users-text);
  font-size: 0.82rem;
  font-weight: 750;
}

.paginationControls {
  align-items: center;
  display: flex;
  gap: 1rem;
}

.paginationCenter {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  justify-content: center;
}

.pageButtons {
  display: flex;
  gap: 0.35rem;
}

.pageButton {
  min-width: 2.35rem;
}

.pageButtonActive {
  background: #000;
  border-color: #000;
  color: #fff;
}

.pageSummary,
.pageEllipsis {
  color: var(--users-muted);
}
```

**S022: capaVista/src/modules/users/pages/UserManagementPage.module.css, líneas 741–874.** Componente/función o selectores: Tokens, filtros, botones, focus, paginación y responsive. Filtros: USR-F01–USR-F04. Fragmento literal:

```css
@media (max-width: 991.98px) {
  .filtersTopbar {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .searchBox {
    grid-column: 1 / -1;
  }

  .filterToggleButton,
  .createUserButton {
    width: 100%;
  }

  .tableResponsive {
    display: none;
  }

  .mobileList {
    background: var(--users-soft);
    display: grid;
    gap: 0.8rem;
    padding: 0.85rem;
  }

  .mobileUserCard {
    background: #fff;
    border: 1px solid #e5eaf0;
    border-radius: 0.7rem;
    box-shadow: 0 6px 18px rgba(15, 23, 42, 0.035);
    display: grid;
    gap: 0.85rem;
    min-width: 0;
    padding: 0.9rem;
  }

  .mobileState {
    background: #fff;
    border: 1px solid #e5eaf0;
    border-radius: 0.7rem;
    color: var(--users-muted);
    margin: 0;
    padding: 2rem 1rem;
    text-align: center;
  }

  .mobileUserCard header,
  .mobileUserCard footer {
    align-items: center;
    display: flex;
    gap: 0.65rem;
    justify-content: space-between;
  }

  .mobileUserCard header strong {
    color: var(--users-text);
    overflow-wrap: anywhere;
  }

  .mobileUserCard dl {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin: 0;
  }

  .mobileUserCard div {
    display: grid;
    gap: 0.15rem;
  }

  .mobileUserCard dt {
    color: var(--users-muted);
    font-size: 0.72rem;
    font-weight: 850;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .mobileUserCard dd {
    color: var(--users-text);
    font-size: 0.88rem;
    font-weight: 700;
    margin: 0;
    word-break: break-word;
  }

  .mobileUserCard footer {
    border-top: 1px solid #edf2f7;
    padding-top: 0.75rem;
  }
}

@media (max-width: 767.98px) {
  .summaryGrid {
    grid-template-columns: 1fr;
  }

  .summaryCard {
    min-height: 5.75rem;
  }

  .feedbackMessage {
    align-items: stretch;
    flex-direction: column;
  }

  .paginationFooter {
    align-items: stretch;
    flex-direction: column;
  }

  .paginationControls {
    align-items: stretch;
    justify-content: space-between;
  }

  .modalLayer {
    align-items: flex-start;
    padding: 0.75rem;
  }

  .createModal {
    height: calc(100dvh - 1.5rem);
    max-height: calc(100dvh - 1.5rem);
    max-width: calc(100vw - 1.5rem);
    width: 100%;
  }

  .createModalHeader {
    min-height: auto;
    padding: 1.25rem 1.35rem;
  }
}
```

**S022: capaVista/src/modules/users/pages/UserManagementPage.module.css, líneas 876–988.** Componente/función o selectores: Tokens, filtros, botones, focus, paginación y responsive. Filtros: USR-F01–USR-F04. Fragmento literal:

```css
@media (max-width: 575.98px) {

  .dashboardShell {
    gap: 0.8rem;
  }

  .summaryCard {
    gap: 0.85rem;
    padding: 0.85rem;
  }

  .summaryIcon {
    flex-basis: 3.15rem;
    font-size: 1.35rem;
    height: 3.15rem;
    width: 3.15rem;
  }

  .summaryContent strong {
    font-size: 1.7rem;
  }

  .filtersShell {
    padding: 0.75rem;
  }

  .filtersTopbar {
    grid-template-columns: 1fr;
  }

  .searchBox {
    grid-column: auto;
  }

  .filterOptions {
    display: grid;
    grid-template-columns: 1fr;
  }

  .filterChip {
    justify-content: space-between;
    width: 100%;
  }

  .mobileList {
    padding: 0.7rem;
  }

  .mobileUserCard header {
    align-items: flex-start;
    flex-direction: column;
  }

  .mobileUserCard header .statusBadge {
    align-self: flex-start;
  }

  .mobileUserCard dl {
    grid-template-columns: 1fr;
  }

  .mobileUserCard footer .userButton {
    width: 100%;
  }

  .paginationCenter {
    flex-direction: column;
  }

  .paginationControls {
    flex-direction: column;
  }

  .createModal,
  .confirmModal {
    border-radius: 0.75rem;
  }

  .modalLayer {
    padding: 0.5rem;
  }

  .createModal {
    height: calc(100dvh - 1rem);
    max-height: calc(100dvh - 1rem);
    max-width: calc(100vw - 1rem);
  }

  .createModalHeader {
    gap: 0.75rem;
    padding: 1rem;
  }

  .createModalHeader .modalKicker {
    font-size: 0.68rem;
  }

  .createModalHeader h2 {
    font-size: 1.35rem;
    letter-spacing: 0.06em;
    line-height: 1.1;
  }

  .createModalHeader p {
    font-size: 0.85rem;
    margin-top: 0.5rem;
  }

  .createModal .modalCloseButton {
    height: 2.25rem;
    width: 2.25rem;
  }
}
```

<a id="fuente-S023"></a>

#### S023 — capaVista/src/modules/users/components/UserMovementsModal.jsx

**Tipo:** JSX/React. **Responsabilidad, componentes y funciones:** UserMovementsModal; búsqueda secundaria, dialog y paginación. **Filtros relacionados:** USR-F01–USR-F04.

**Exportaciones declaradas** (línea inicial): 6: export default function UserMovementsModal({ user, api, onClose, title = 'Movimientos de usuario', description }) {.

**Relaciones/imports originales:** <code>../../../shared/components/loading/LoadingIndicator</code>, <code>react</code>, <code>./UserMovementsTable</code>, <code>./UserMovementsModal.module.css</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 91 líneas originales; incluidos 1–91; cobertura completa. Huella SHA-256 inicial del archivo: 1334916312C71C6DEB6E1D838E4E5D36DE5775B0D60541F05E98E3D1E6A1A85B.

**S023: capaVista/src/modules/users/components/UserMovementsModal.jsx, líneas 1–91.** Componente/función o selectores: UserMovementsModal; búsqueda secundaria, dialog y paginación. Filtros: USR-F01–USR-F04. Fragmento literal:

```jsx
import LoadingIndicator from '../../../shared/components/loading/LoadingIndicator'
import { useEffect, useRef, useState } from 'react'
import UserMovementsTable from './UserMovementsTable'
import styles from './UserMovementsModal.module.css'

export default function UserMovementsModal({ user, api, onClose, title = 'Movimientos de usuario', description }) {
  const dialogRef = useRef(null)
  const [query, setQuery] = useState({ page: 1, perPage: 10, search: '' })
  const [search, setSearch] = useState('')
  const [outcome, setOutcome] = useState(null)
  const subject = user.idUsuarioAutenticacionExterna
  const current = outcome?.query === query && outcome?.subject === subject && outcome?.api === api
  const result = current ? outcome.data : null
  const error = current ? outcome.error : ''
  const loading = !current
  const total = result?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / query.perPage))
  const pageNumbers = [...new Set([1, query.page - 1, query.page, query.page + 1, totalPages])]
    .filter(page => page >= 1 && page <= totalPages).sort((a, b) => a - b)

  useEffect(() => {
    const dialog = dialogRef.current
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.showModal()
    return () => {
      dialog.close()
      document.body.style.overflow = previousOverflow
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [])

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    api.getMovements(subject, query, { signal: controller.signal })
      .then(data => { if (active) setOutcome({ query, subject, api, data }) })
      .catch(failure => {
        if (active) setOutcome({ query, subject, api,
          error: failure?.payload?.message || 'No fue posible consultar los movimientos. Intenta nuevamente.' })
      })
    return () => { active = false; controller.abort() }
  }, [api, subject, query])

  return <dialog ref={dialogRef} className={styles.modal} aria-labelledby="user-movements-title"
    aria-describedby="user-movements-description" onCancel={event => { event.preventDefault(); onClose() }}>
    <header className={styles.header}>
      <span className={styles.headerIcon}><i className="bi bi-clock-history" aria-hidden="true" /></span>
      <div><h2 id="user-movements-title">{title}</h2>
        <p id="user-movements-description">{description ?? `Consulta los movimientos de ${user.nombreCompleto}.`}</p></div>
      <button type="button" className={styles.close} aria-label="Cerrar historial" onClick={onClose} autoFocus>
        <i className="bi bi-x-lg" aria-hidden="true" />
      </button>
    </header>
    <div className={styles.body}>
      <form className={styles.filters} onSubmit={event => { event.preventDefault(); setQuery({ ...query, page: 1, search: search.trim() }) }}>
        <label className={styles.search}><i className="bi bi-search" aria-hidden="true" /><span className="visually-hidden">Buscar por identificador o detalle</span>
          <input type="search" value={search} maxLength={120} placeholder="Buscar por identificador o detalle…"
            onChange={event => setSearch(event.target.value)} /></label>
        <button className={styles.button} type="submit">Buscar</button>
        <button className={styles.button} type="button" onClick={() => { setSearch(''); setQuery({ ...query, page: 1, search: '' }) }}>
          <i className="bi bi-arrow-clockwise" aria-hidden="true" /> Limpiar filtros
        </button>
      </form>
      <div className={styles.scroll} aria-busy={loading}>
        {loading ? <LoadingIndicator context="movimientos" /> : error ? <div className={styles.state} role="alert">
          <p>{error}</p><button className={styles.button} type="button" onClick={() => setQuery({ ...query })}>Reintentar</button>
        </div> : !result?.records?.length ? <p className={styles.state} role="status">No existen movimientos para esta consulta.</p>
          : <UserMovementsTable records={result.records} includeTime />}
      </div>
    </div>
    <footer className={styles.footer}>
      <span>{loading ? null : error ? 'Consulta pendiente' : total
        ? `Mostrando ${(query.page - 1) * query.perPage + 1}–${Math.min(query.page * query.perPage, total)} de ${total} registros`
        : '0 registros'}</span>
      <nav className={styles.pagination} aria-label="Paginación de movimientos">
        <button className={styles.button} type="button" disabled={loading || Boolean(error) || query.page <= 1}
          onClick={() => setQuery({ ...query, page: query.page - 1 })}>Anterior</button>
        {pageNumbers.map((page, index) => <span className={styles.pageNumber} key={page}>
          {index > 0 && page - pageNumbers[index - 1] > 1 && <span aria-hidden="true">…</span>}
          <button className={`${styles.button} ${page === query.page ? styles.active : ''}`} type="button"
            aria-label={`Página ${page}`} aria-current={page === query.page ? 'page' : undefined}
            disabled={loading || Boolean(error)} onClick={() => setQuery({ ...query, page })}>{page}</button>
        </span>)}
        <button className={styles.button} type="button" disabled={loading || Boolean(error) || query.page >= totalPages}
          onClick={() => setQuery({ ...query, page: query.page + 1 })}>Siguiente</button>
      </nav>
    </footer>
  </dialog>
}
```

<a id="fuente-S024"></a>

#### S024 — capaVista/src/modules/users/components/UserMovementsModal.module.css

**Tipo:** CSS propio. **Responsabilidad, componentes y funciones:** CSS completo del diálogo y sus filtros. **Filtros relacionados:** USR-F01–USR-F04.

**Cobertura:** 42 líneas originales; incluidos 1–42; cobertura completa. Huella SHA-256 inicial del archivo: D9B562271529A60FCD9CFF182D32014610D289178A11F482229C1C35AB3E0FFB.

**S024: capaVista/src/modules/users/components/UserMovementsModal.module.css, líneas 1–42.** Componente/función o selectores: CSS completo del diálogo y sus filtros. Filtros: USR-F01–USR-F04. Fragmento literal:

```css
.modal { background: #fff; border: 1px solid #e5e7eb; border-radius: 1rem; color: var(--itexsa-text); max-height: calc(100dvh - 2rem); max-width: calc(100vw - 2rem); padding: 0; width: 66rem; overflow: hidden; box-shadow: 0 24px 70px #0004; }
.modal[open] { display: flex; flex-direction: column; }
.modal::backdrop { background: #0f172a99; }
.header { display: flex; align-items: center; gap: 1rem; background: #080808; color: #fff; padding: 1.4rem 1.6rem; flex-shrink: 0; }
.header > div { flex: 1; min-width: 0; }
.header h2 { color: #fff; font-size: clamp(1.4rem, 3vw, 2rem); font-weight: 850; margin: 0 0 .3rem; }
.header p { margin: 0; color: #e5e7eb; overflow-wrap: anywhere; }
.headerIcon { color: var(--itexsa-orange); border: 1px solid var(--itexsa-orange); border-radius: 50%; width: 3.5rem; height: 3.5rem; display: grid; place-items: center; flex-shrink: 0; font-size: 1.7rem; background: #f9731612; }
.close { background: transparent; color: #fff; border: 0; border-radius: .4rem; height: 2.75rem; width: 2.75rem; flex-shrink: 0; }
.close:focus-visible, .button:focus-visible, .search:focus-within { outline: 2px solid var(--itexsa-orange); outline-offset: 3px; }
.body { display: flex; flex-direction: column; gap: 1.2rem; padding: 1.4rem 1.6rem; min-height: 0; overflow-y: auto; }
.filters { display: flex; gap: .6rem; flex-wrap: wrap; align-items: center; }
.search { align-items: center; border: 1px solid #dbe3ed; border-radius: .55rem; display: flex; gap: .65rem; flex: 1; padding: .5rem .8rem; min-width: 12rem; min-height: 2.75rem; }
.search input { border: 0; outline: 0; min-width: 0; width: 100%; color: var(--itexsa-text); background: transparent; }
.search input::placeholder { color: var(--itexsa-muted); }
.button { background: #fff; color: var(--itexsa-text); border: 1px solid #dbe3ed; border-radius: .55rem; font-weight: 750; min-height: 2.65rem; padding: .5rem .8rem; display: inline-flex; align-items: center; justify-content: center; gap: .45rem; }
.button:hover:not(:disabled) { background: #fff7ed; border-color: var(--itexsa-orange); }
.button:disabled { opacity: .45; cursor: not-allowed; }
.active { background: var(--itexsa-orange); border-color: var(--itexsa-orange); color: #111; }
.scroll { min-height: 12rem; max-height: 48dvh; overflow-y: auto; scrollbar-gutter: stable; }
.table { width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid #e5e7eb; border-radius: .65rem; overflow: clip; color: var(--itexsa-text); font-size: .9rem; }
.table th { background: #edf1f5; font-size: .73rem; font-weight: 850; text-transform: uppercase; letter-spacing: .025em; text-align: left; position: sticky; top: 0; z-index: 1; }
.table td, .table th { padding: .7rem 1rem; overflow-wrap: anywhere; }
.table td { border-top: 1px solid #edf0f3; }
.table th:first-child { width: 18%; }
.table th:last-child { width: 24%; }
.table td:last-child { color: var(--itexsa-muted); }
.state { min-height: 12rem; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 1rem; color: var(--itexsa-muted); }
.footer { padding: 1rem 1.6rem; border-top: 1px solid #edf0f3; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: .8rem; flex-shrink: 0; font-size: .8rem; }
.pagination, .pageNumber { display: flex; align-items: center; gap: .35rem; flex-wrap: wrap; }
.pageNumber .button { min-width: 2.65rem; }
@media (max-width: 767.98px) { .header, .body, .footer { padding: 1rem; } .headerIcon { width: 2.8rem; height: 2.8rem; font-size: 1.4rem; } .footer { justify-content: center; } .filters .search { flex-basis: 100%; } }
@media (max-width: 575.98px) {
  .modal { max-width: calc(100vw - 1rem); max-height: calc(100dvh - 1rem); border-radius: .75rem; }
  .header { align-items: flex-start; gap: .6rem; } .headerIcon { display: none; }
  .header p { font-size: .85rem; } .scroll { max-height: 40dvh; }
  .table, .table tbody { display: block; } .table thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  .table tr { display: grid; padding: .75rem; border-top: 1px solid #e5e7eb; gap: .5rem; }
  .table tr:first-child { border-top: 0; } .table td { display: block; padding: 0; border: 0; }
  .table td::before { content: attr(data-label); display: block; color: #64748b; font-size: .65rem; font-weight: 800; text-transform: uppercase; margin-bottom: .15rem; }
  .pagination { justify-content: center; } .pagination .button { font-size: .75rem; padding: .45rem; }
}
```

<a id="fuente-S025"></a>

#### S025 — capaVista/src/modules/users/api/adminUsersApi.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** createAdminUsersApi; listado, resumen y movimientos. **Filtros relacionados:** USR-F01–USR-F04.

**Exportaciones declaradas** (línea inicial): 9: export function createAdminUsersApi(apiClient) {.

**Cobertura:** 46 líneas originales; incluidos 1–33. Fuera de extracción: 34–46; corresponden al contexto restante del archivo y no se sustituyen por código inventado. Huella SHA-256 inicial del archivo: 1D0A3A59925F2DEF29BC5C6646E00435DDB6CABAFBA366850B5539169E4443D9.

**S025: capaVista/src/modules/users/api/adminUsersApi.js, líneas 1–33.** Componente/función o selectores: createAdminUsersApi; listado, resumen y movimientos. Filtros: USR-F01–USR-F04. Fragmento literal:

```javascript
function buildQueryString(params) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && String(value).trim() !== '') query.set(key, String(value))
  }
  return query.size ? '?' + query.toString() : ''
}

export function createAdminUsersApi(apiClient) {
  const base = '/admin/identity/users'
  const unavailable = async () => { throw Object.assign(new Error('Operacion no habilitada'), {
    status: 503, payload: { code: 'IDENTITY_OPERATION_NOT_IMPLEMENTED', message: 'Esta operacion todavia no esta habilitada para Keycloak.' },
  }) }
  const movementsInFlight = new Map()
  function getMovements(subject, { page = 1, perPage = 10, search = '' } = {}, options) {
    const path = base + '/' + encodeURIComponent(subject) + '/movements' + buildQueryString({ page, perPage, search });
    // A cancellable reader owns its request; it cannot abort another consumer.
    if (options?.signal) return apiClient.get(path, options);
    const key = JSON.stringify([subject, page, perPage, search])
    const current = movementsInFlight.get(key)
    if (current) return current
    const request = apiClient.get(path, options).finally(() => {
      if (movementsInFlight.get(key) === request) movementsInFlight.delete(key)
    })
    movementsInFlight.set(key, request)
    return request
  }
  return {
    listUsers: ({ page = 1, perPage = 10, search = '', estadoUsuario = '', rolUsuario = '' } = {}, options) =>
      apiClient.get(base + buildQueryString({ page, perPage, search, estadoUsuario, rolUsuario }), options),
    getMovements,
    getSummary: options => apiClient.get(base + '/summary', options),
    inspectUser: (subject, options) => apiClient.get('/admin/identity/identities/' + encodeURIComponent(subject), options),
```

<a id="fuente-S026"></a>

#### S026 — capaVista/src/modules/users/hooks/useAdminUsersApi.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** useAdminUsersApi; instancia aislada. **Filtros relacionados:** USR-F01–USR-F04.

**Exportaciones declaradas** (línea inicial): 5: export function useAdminUsersApi() {.

**Relaciones/imports originales:** <code>react</code>, <code>../../../hooks/useApiClient.js</code>, <code>../api/adminUsersApi</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 8 líneas originales; incluidos 1–8; cobertura completa. Huella SHA-256 inicial del archivo: 62641A9C5DC0B15BC7A1D9F631EA2ED2B0D7B30EA9FA2120BB54D44AE4A78B09.

**S026: capaVista/src/modules/users/hooks/useAdminUsersApi.js, líneas 1–8.** Componente/función o selectores: useAdminUsersApi; instancia aislada. Filtros: USR-F01–USR-F04. Fragmento literal:

```javascript
import { useMemo } from 'react'
import { useApiClient } from '../../../hooks/useApiClient.js'
import { createAdminUsersApi } from '../api/adminUsersApi'

export function useAdminUsersApi() {
  const client = useApiClient()
  return useMemo(() => createAdminUsersApi(client), [client])
}
```

<a id="fuente-S027"></a>

#### S027 — capaVista/src/modules/users/components/UserButton.jsx

**Tipo:** JSX/React. **Responsabilidad, componentes y funciones:** UserButton; botón reutilizado en módulo. **Filtros relacionados:** USR-F01–USR-F04.

**Exportaciones declaradas** (línea inicial): 11: export default function UserButton({.

**Relaciones/imports originales:** <code>../pages/UserManagementPage.module.css</code>, <code>../../../shared/components/loading/LoadingIndicator</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 28 líneas originales; incluidos 1–28; cobertura completa. Huella SHA-256 inicial del archivo: 94DF7BF807E7FDFFF2A5F0228D39F34FC42D83578BA4ACAA0F3AD929FEF3F902.

**S027: capaVista/src/modules/users/components/UserButton.jsx, líneas 1–28.** Componente/función o selectores: UserButton; botón reutilizado en módulo. Filtros: USR-F01–USR-F04. Fragmento literal:

```jsx
import styles from '../pages/UserManagementPage.module.css'
import { LoadingAction } from '../../../shared/components/loading/LoadingIndicator'

const VARIANT_CLASS = Object.freeze({
  primary: styles.userButtonPrimary,
  secondary: styles.userButtonSecondary,
  danger: styles.userButtonDanger,
  ghost: styles.userButtonGhost,
})

export default function UserButton({
  children,
  className = '',
  icon,
  type = 'button',
  variant = 'secondary',
  busy = false,
  ...props
}) {
  const variantClass = VARIANT_CLASS[variant] ?? VARIANT_CLASS.secondary

  return (
    <button className={`${styles.userButton} ${variantClass} ${className}`.trim()} type={type} {...props} disabled={busy || props.disabled} aria-busy={busy || props['aria-busy']}>
      {icon && !busy && <i className={`bi ${icon}`} aria-hidden="true" />}
      <span><LoadingAction busy={busy} surface={variant === 'primary' ? 'dark' : 'light'}>{children}</LoadingAction></span>
    </button>
  )
}
```

<a id="fuente-S028"></a>

#### S028 — capaVista/src/modules/users/components/UserManagementTable.jsx

**Tipo:** JSX/React. **Responsabilidad, componentes y funciones:** UserManagementTable; resultados, vacío, paginación y móviles. **Filtros relacionados:** USR-F01–USR-F04.

**Exportaciones declaradas** (línea inicial): 33: export default function UserManagementTable({.

**Relaciones/imports originales:** <code>../../../config/roles</code>, <code>../../../shared/components/loading/LoadingIndicator</code>, <code>./UserButton</code>, <code>./UserManagementMobileList</code>, <code>./UserStatusBadge</code>, <code>../pages/UserManagementPage.module.css</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 171 líneas originales; incluidos 1–171; cobertura completa. Huella SHA-256 inicial del archivo: 5461904BF3F4204FB0F657B145A814477D17B67623962F0E836EF6ABDD236BD4.

**S028: capaVista/src/modules/users/components/UserManagementTable.jsx, líneas 1–171.** Componente/función o selectores: UserManagementTable; resultados, vacío, paginación y móviles. Filtros: USR-F01–USR-F04. Fragmento literal:

```jsx
import { getRoleLabel } from '../../../config/roles'
import LoadingIndicator from '../../../shared/components/loading/LoadingIndicator'
import UserButton from './UserButton'
import UserManagementMobileList from './UserManagementMobileList'
import UserStatusBadge from './UserStatusBadge'
import styles from '../pages/UserManagementPage.module.css'

const TABLE_COLUMNS = Object.freeze([
  'Nombre completo',
  'RUT',
  'Correo',
  'Rol',
  'Estado',
  'Acciones',
])

function buildNearbyPages(currentPage, totalPages) {
  if (totalPages <= 4) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  if (currentPage <= 2) {
    return [1, 2, 3, 'ellipsis', totalPages]
  }

  if (currentPage >= totalPages - 1) {
    return [1, 'ellipsis', totalPages - 2, totalPages - 1, totalPages]
  }

  return [currentPage - 1, currentPage, currentPage + 1, 'ellipsis', totalPages]
}

export default function UserManagementTable({
  currentPage,
  isLoading,
  inspectingId,
  onEditUser,
  onViewMovements,
  onPageChange,
  totalPages,
  totalUsers,
  users,
  readOnly = false,
}) {
  const pageItems = buildNearbyPages(currentPage, totalPages)
  const canGoPrevious = currentPage > 1 && !isLoading
  const canGoNext = currentPage < totalPages && !isLoading

  return (
    <div className={styles.tableCard}>
      <div className={styles.tableResponsive}>
        <table className={styles.usersTable} aria-busy={isLoading}>
          <thead>
            <tr>
              {TABLE_COLUMNS.map((column) => (
                <th className={column === 'Acciones' ? styles.actionsCell : undefined} key={column} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td className={styles.tableStateCell} colSpan={TABLE_COLUMNS.length}>
                  <LoadingIndicator context="Usuarios" />
                </td>
              </tr>
            )}
            {!isLoading && users.length === 0 && (
              <tr>
                <td className={styles.tableStateCell} colSpan={TABLE_COLUMNS.length}>
                  No se encontraron usuarios para los filtros seleccionados.
                </td>
              </tr>
            )}
            {!isLoading &&
              users.map((user) => (
                <tr key={user.id}>
                  <td className={styles.nameCell}>{user.nombreListado}{user.username && <small className="d-block">{user.username}</small>}
                    {user.identityBindingConflict && <small className="d-block">Vinculo pendiente de conciliacion</small>}</td>
                  <td>{user.rutUsuario}</td>
                  <td className={styles.emailCell}>{user.correoUsuario || 'Sin correo'}</td>
                  <td>{getRoleLabel(user.rolUsuario)}</td>
                  <td>
                    <UserStatusBadge status={user.estadoUsuario} />
                  </td>
                  <td className={styles.actionsCell}>
                    <div className={styles.userActions}>
                    <UserButton
                      className={styles.actionButton}
                      icon="bi-pencil-fill"
                      disabled={!user.idUsuarioAutenticacionExterna}
                      onClick={() => onEditUser(user)}
                      busy={inspectingId === user.id}
                      variant="secondary"
                    >
                      {readOnly ? 'Consultar' : 'Editar'}
                    </UserButton>
                    <UserButton
                      className={styles.actionButton}
                      icon="bi-clock-history"
                      disabled={!user.idUsuarioAutenticacionExterna}
                      onClick={() => onViewMovements(user)}
                      variant="secondary"
                    >
                      Movimientos
                    </UserButton>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <UserManagementMobileList
        isLoading={isLoading}
        inspectingId={inspectingId}
        onEditUser={onEditUser}
        onViewMovements={onViewMovements}
        users={users}
        readOnly={readOnly}
      />

      <footer className={styles.paginationFooter} aria-label="Resumen y paginacion de usuarios">
        <span className={styles.resultsSummary}>
          Mostrando {users.length} de {totalUsers} usuarios
        </span>

        {totalPages > 1 && (
          <div className={styles.paginationControls}>
            <UserButton disabled={!canGoPrevious} onClick={() => onPageChange(currentPage - 1)} variant="secondary">
              Anterior
            </UserButton>

            <div className={styles.paginationCenter}>
              <span className={styles.pageSummary}>
                Pagina {currentPage} de {totalPages}
              </span>
              <nav className={styles.pageButtons} aria-label="Paginas cercanas">
                {pageItems.map((pageItem, index) =>
                  pageItem === 'ellipsis' ? (
                    <span className={styles.pageEllipsis} key={`ellipsis-${index}`}>
                      ...
                    </span>
                  ) : (
                    <button
                      aria-current={pageItem === currentPage ? 'page' : undefined}
                      className={`${styles.pageButton} ${pageItem === currentPage ? styles.pageButtonActive : ''}`}
                      disabled={isLoading}
                      key={pageItem}
                      onClick={() => onPageChange(pageItem)}
                      type="button"
                    >
                      {pageItem}
                    </button>
                  ),
                )}
              </nav>
            </div>

            <UserButton disabled={!canGoNext} onClick={() => onPageChange(currentPage + 1)} variant="secondary">
              Siguiente
            </UserButton>
          </div>
        )}
      </footer>
    </div>
  )
}
```

<a id="fuente-S029"></a>

#### S029 — capaVista/src/modules/users/components/UserSummaryCards.jsx

**Tipo:** JSX/React. **Responsabilidad, componentes y funciones:** UserSummaryCards; resumen global sin interacción de filtro. **Filtros relacionados:** USR-F01–USR-F04.

**Exportaciones declaradas** (línea inicial): 11: export default function UserSummaryCards({ isLoading = false, summary }) {.

**Relaciones/imports originales:** <code>../../../shared/components/loading/LoadingIndicator</code>, <code>../pages/UserManagementPage.module.css</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 28 líneas originales; incluidos 1–28; cobertura completa. Huella SHA-256 inicial del archivo: BCA025D1C639869D4AB2C3ED671FC274AB2BE5611B5A1F55354F2CCEB411C26A.

**S029: capaVista/src/modules/users/components/UserSummaryCards.jsx, líneas 1–28.** Componente/función o selectores: UserSummaryCards; resumen global sin interacción de filtro. Filtros: USR-F01–USR-F04. Fragmento literal:

```jsx
import LoadingIndicator from '../../../shared/components/loading/LoadingIndicator'
import styles from '../pages/UserManagementPage.module.css'

const SUMMARY_CARDS = Object.freeze([
  { key: 'totalUsuarios', label: 'Total usuarios', icon: 'bi-people', tone: 'total' },
  { key: 'vinculados', label: 'Vinculados', icon: 'bi-check-lg', tone: 'linked' },
  { key: 'pendientes', label: 'Pendientes de acceso', icon: 'bi-clock-history', tone: 'pending' },
  { key: 'desvinculados', label: 'Desvinculados', icon: 'bi-person-x', tone: 'unlinked' },
])

export default function UserSummaryCards({ isLoading = false, summary }) {
  return (
    <section aria-busy={isLoading} className={styles.summaryGrid} aria-label="Resumen de usuarios">
      {SUMMARY_CARDS.map((card) => (
        <article className={styles.summaryCard} key={card.key}>
          <span className={`${styles.summaryIcon} ${styles[`summaryIcon${card.tone}`]}`} aria-hidden="true">
            <i className={`bi ${card.icon}`} />
          </span>
          <span className={styles.summaryContent}>
            <span>{card.label}</span>
            <strong>{summary ? (summary[card.key] ?? 0) : isLoading ? <LoadingIndicator scope="action" context={card.label} /> : '—'}</strong>
            {summary && isLoading && <LoadingIndicator scope="action" context={`Actualizar ${card.label}`} />}
          </span>
        </article>
      ))}
    </section>
  )
}
```

<a id="fuente-S030"></a>

#### S030 — capaVista/src/modules/users/utils/latestRequestTracker.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** createLatestRequestTracker; descarta resúmenes viejos. **Filtros relacionados:** USR-F01–USR-F04.

**Exportaciones declaradas** (línea inicial): 1: export function createLatestRequestTracker() {.

**Cobertura:** 16 líneas originales; incluidos 1–16; cobertura completa. Huella SHA-256 inicial del archivo: A92D33459DC6BD823B0BD8848B619A6C548EE7FC6C1293ABB75AFE7B052FB7EA.

**S030: capaVista/src/modules/users/utils/latestRequestTracker.js, líneas 1–16.** Componente/función o selectores: createLatestRequestTracker; descarta resúmenes viejos. Filtros: USR-F01–USR-F04. Fragmento literal:

```javascript
export function createLatestRequestTracker() {
  let latestRequestId = 0

  return Object.freeze({
    begin() {
      latestRequestId += 1
      return latestRequestId
    },
    invalidate() {
      latestRequestId += 1
    },
    isLatest(requestId) {
      return requestId === latestRequestId
    },
  })
}
```


### 15.5. Historial

<a id="fuente-S031"></a>

#### S031 — capaVista/src/modules/orderHistory/pages/OrderHistoryPage.jsx

**Tipo:** JSX/React. **Responsabilidad, componentes y funciones:** OrderHistoryList; estados, búsqueda confirmada, fechas y cursores. **Filtros relacionados:** HIS-F01–HIS-F05.

**Exportaciones declaradas** (línea inicial): 25: export default function OrderHistoryPage() {.

**Relaciones/imports originales:** <code>../../../shared/components/loading/LoadingIndicator</code>, <code>react</code>, <code>react-router-dom</code>, <code>../../../config/routes</code>, <code>../hooks/useOrderHistoryApi</code>, <code>../utils/orderHistoryFormatters</code>, <code>./OrderHistoryPage.module.css</code>, <code>../../../shared/components/layout/PageShell</code>, <code>../../../shared/components/layout/PageHeader</code>, <code>../utils/historyReads</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 183 líneas originales; incluidos 1–183; cobertura completa. Huella SHA-256 inicial del archivo: 9AFF854B9D18732F6752986723CECB753DE1F9A495B78DD3CD78853702D999E5.

**S031: capaVista/src/modules/orderHistory/pages/OrderHistoryPage.jsx, líneas 1–183.** Componente/función o selectores: OrderHistoryList; estados, búsqueda confirmada, fechas y cursores. Filtros: HIS-F01–HIS-F05. Fragmento literal:

```jsx
import LoadingIndicator from '../../../shared/components/loading/LoadingIndicator'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { APP_ROUTES } from '../../../config/routes'
import { useOrderHistoryApi } from '../hooks/useOrderHistoryApi'
import { formatDate } from '../utils/orderHistoryFormatters'
import styles from './OrderHistoryPage.module.css'
import PageShell, { PageSurface } from '../../../shared/components/layout/PageShell'
import PageHeader from '../../../shared/components/layout/PageHeader'
import { historyScope, historyDateError, subscribeHistoryRead } from '../utils/historyReads'

const STATUS_FILTERS = [
  { label: 'Confirmación de Pago', value: 'Confirmación de Pago' },
  { label: 'Listo para producción', value: 'Listo para Producción' },
  { label: 'En producción', value: 'En producción' },
  { label: 'Listo para despacho', value: 'Listo para Entrega' },
  { label: 'Finalizado', value: 'Terminado' },
  { label: 'Cancelado', value: 'Cancelado' },
]

function errorMessage(error) {
  return error?.payload?.message ?? 'No fue posible cargar el historial de pedidos.'
}

export default function OrderHistoryPage() {
  const api = useOrderHistoryApi()
  return <OrderHistoryList key={historyScope(api)} api={api} />
}

function OrderHistoryList({ api }) {
  const [orders, setOrders] = useState([])
  const [status, setStatus] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [dateRange, setDateRange] = useState({ from: '', to: '' })
  const [cursorStack, setCursorStack] = useState([null])
  const [pageInfo, setPageInfo] = useState({ nextCursor: null, hasMore: false })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const validationError = historyDateError(dateRange)

  useEffect(() => {
    if (validationError) return undefined
    const cursor = cursorStack.at(-1)
    return subscribeHistoryRead({ api, method: 'listOrders', params: { status, search, from: dateRange.from, to: dateRange.to, cursor, limit: 50 },
      onSuccess: (result) => {
        setOrders(result.items ?? [])
        setPageInfo(result.pageInfo ?? { nextCursor: null, hasMore: false })
        setLoading(false)
      },
      onError: (requestError) => { setError(errorMessage(requestError)); setLoading(false) },
    })
  }, [api, cursorStack, dateRange.from, dateRange.to, search, status, attempt, validationError])

  function beginRead() {
    setLoading(true)
    setError('')
    setOrders([])
    setPageInfo({ nextCursor: null, hasMore: false })
  }

  function updateDate(name, value) {
    if (dateRange[name] === value) return
    beginRead()
    setCursorStack([null])
    setDateRange((current) => ({ ...current, [name]: value }))
  }

  function submitSearch(event) {
    event.preventDefault()
    const nextSearch = searchInput.trim()
    if (nextSearch === search) return
    beginRead()
    setCursorStack([null])
    setSearch(nextSearch)
  }

  function selectStatus(nextStatus) {
    const resolvedStatus = status === nextStatus ? '' : nextStatus
    if (resolvedStatus === status) return
    beginRead()
    setCursorStack([null])
    setStatus(resolvedStatus)
  }

  function nextPage() {
    if (loading || !pageInfo.nextCursor) return
    beginRead()
    setCursorStack((current) => [...current, pageInfo.nextCursor])
  }

  function previousPage() {
    if (loading || cursorStack.length === 1) return
    beginRead()
    setCursorStack((current) => current.slice(0, -1))
  }

  const noRegisteredOrders = !loading && !error && orders.length === 0 && cursorStack.length === 1 && !status && !search && !dateRange.from && !dateRange.to

  return (
    <PageShell className={styles.page}>
      <PageSurface>
      <PageHeader title="Historial de pedidos" actions={
        <strong className={styles.resultCount}>{orders.length} resultados en esta página</strong>
      } />

      <section className={styles.panel}>
        <div className={styles.statusFilters} aria-label="Filtros por estado">
          <button className={!status ? styles.activeFilter : ''} onClick={() => selectStatus('')} type="button">Todos</button>
          {STATUS_FILTERS.map((item) => (
            <button className={status === item.value ? styles.activeFilter : ''} key={item.value} onClick={() => selectStatus(item.value)} type="button">
              {item.label}
            </button>
          ))}
        </div>

        <form className={styles.search} onSubmit={submitSearch}>
          <i className="bi bi-search" aria-hidden="true" />
          <input
            aria-label="Buscar pedidos"
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Nota de Venta o nombre del cliente"
            type="search"
            value={searchInput}
          />
          <button type="submit">Buscar</button>
        </form>

        <div className={styles.dateFilters} aria-label="Rango de fecha de creacion">
          <label>
            <span>Desde</span>
            <input max={dateRange.to || undefined} onChange={(event) => updateDate('from', event.target.value)} type="date" value={dateRange.from} />
          </label>
          <label>
            <span>Hasta</span>
            <input min={dateRange.from || undefined} onChange={(event) => updateDate('to', event.target.value)} type="date" value={dateRange.to} />
          </label>
          <button onClick={() => { if (!dateRange.from && !dateRange.to) return; beginRead(); setCursorStack([null]); setDateRange({ from: '', to: '' }) }} type="button">
            <i className="bi bi-arrow-counterclockwise" aria-hidden="true" /> Restablecer fechas
          </button>
        </div>

        {(validationError || error) && <div className={styles.error} role="alert"><p>{validationError || error}</p>{!validationError && <button onClick={() => { beginRead(); setAttempt(current => current + 1) }} type="button">Reintentar</button>}</div>}
        {loading && !validationError ? (
          <LoadingIndicator context="pedidos" />
        ) : validationError || error ? null : orders.length === 0 ? (
          <div className={styles.state}>{noRegisteredOrders ? 'No existen pedidos hasta el momento' : 'No se encontraron pedidos'}</div>
        ) : (
          <div className={styles.tableWrap}>
            <table>
              <thead><tr><th>Nota de Venta</th><th>Cliente</th><th>Estado actual</th><th>Fecha creación</th><th>Acción</th></tr></thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td><strong>{order.salesNoteNumber ?? `Pedido #${order.id}`}</strong></td>
                    <td>{order.clientName ?? 'No disponible'}</td>
                    <td><span className={styles.status}>{order.status ?? 'Sin estado'}</span></td>
                    <td>{formatDate(order.createdAt)}</td>
                    <td>
                      <Link className={styles.detailButton} to={APP_ROUTES.ORDER_HISTORY_DETAIL.replace(':orderId', order.id)}>
                        Ver detalle <i className="bi bi-arrow-right" aria-hidden="true" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(cursorStack.length > 1 || pageInfo.hasMore) && (
          <nav className={styles.pagination} aria-label="Paginación">
            <button disabled={loading || cursorStack.length === 1} onClick={previousPage} type="button">Anterior</button>
            <span>Página {cursorStack.length}</span>
            <button disabled={loading || !pageInfo.hasMore} onClick={nextPage} type="button">Siguiente</button>
          </nav>
        )}
      </section>
      </PageSurface>
    </PageShell>
  )
}
```

<a id="fuente-S032"></a>

#### S032 — capaVista/src/modules/orderHistory/pages/OrderHistoryPage.module.css

**Tipo:** CSS propio. **Responsabilidad, componentes y funciones:** CSS completo de lista y filtros. **Filtros relacionados:** HIS-F01–HIS-F05.

**Cobertura:** 26 líneas originales; incluidos 1–26; cobertura completa. Huella SHA-256 inicial del archivo: 0F725CED494B834CFB64CC1B23B2A5F38E2950734B4D140C31519CB8238EFC4A.

**S032: capaVista/src/modules/orderHistory/pages/OrderHistoryPage.module.css, líneas 1–26.** Componente/función o selectores: CSS completo de lista y filtros. Filtros: HIS-F01–HIS-F05. Fragmento literal:

```css
.page { color: #111827; }
.resultCount { background: var(--page-brand-orange); border-radius: 999px; color: #111827; padding: .65rem 1rem; }
.panel { border-radius: 0 0 var(--page-radius) var(--page-radius); overflow: hidden; }
.statusFilters { display: flex; flex-wrap: wrap; gap: .5rem; padding: 1rem 1.25rem .25rem; }
.statusFilters button { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 999px; color: #475569; font-size: .82rem; font-weight: 800; padding: .48rem .8rem; }
.statusFilters button:hover, .statusFilters .activeFilter { background: #111827; border-color: #111827; color: #fff; }
.search { align-items: center; display: flex; gap: .65rem; padding: .75rem 1.25rem 1rem; }
.search input { border: 1px solid #dbe1e8; border-radius: .75rem; flex: 1; min-width: 0; min-height: 2.7rem; padding: 0 .85rem; }
.search button, .pagination button { background: #111827; border: 0; border-radius: .7rem; color: #fff; font-weight: 800; min-height: 2.5rem; padding: .5rem .9rem; }
.dateFilters { align-items: end; border-top: 1px solid #f1f5f9; display: flex; flex-wrap: wrap; gap: .75rem; padding: 0 1.25rem 1rem; }
.dateFilters label { color: #475569; display: grid; font-size: .78rem; font-weight: 800; gap: .3rem; }
.dateFilters input { border: 1px solid #dbe1e8; border-radius: .65rem; min-height: 2.55rem; padding: 0 .7rem; }
.dateFilters button { background: #fff; border: 1px solid #cbd5e1; border-radius: .65rem; color: #334155; font-weight: 800; min-height: 2.55rem; padding: .5rem .8rem; }
.dateFilters button:hover { border-color: #f97316; color: #c2410c; }
.tableWrap { overflow-x: auto; }
.tableWrap table { border-collapse: collapse; min-width: 900px; width: 100%; }
.tableWrap th { background: #f8fafc; color: #475569; font-size: .76rem; letter-spacing: .05em; text-transform: uppercase; }
.tableWrap th, .tableWrap td { border-top: 1px solid #e5e7eb; padding: .9rem 1rem; text-align: left; }
.status { background: #fff3e8; border-radius: 999px; color: #c2410c; display: inline-block; font-size: .8rem; font-weight: 850; padding: .35rem .65rem; }
.detailButton { color: #111827; font-weight: 850; text-decoration: none; white-space: nowrap; }
.detailButton:hover { color: #ea580c; }
.state { color: #64748b; font-weight: 750; padding: 3rem; text-align: center; }
.error { background: #fff1f2; color: #be123c; margin: 1rem 1.25rem; padding: .85rem; }
.pagination { align-items: center; border-top: 1px solid #e5e7eb; display: flex; flex-wrap: wrap; gap: 1rem; justify-content: flex-end; padding: 1rem 1.25rem; }
.pagination button:disabled { background: #cbd5e1; }
@media (max-width: 700px) { .search { align-items: stretch; flex-wrap: wrap; } .search input { width: calc(100% - 2rem); } }
```

<a id="fuente-S033"></a>

#### S033 — capaVista/src/modules/orderHistory/pages/OrderHistoryDetailPage.jsx

**Tipo:** JSX/React. **Responsabilidad, componentes y funciones:** OrderHistoryDetail; filtro secundario de tipo de evento y continuidad. **Filtros relacionados:** HIS-F01–HIS-F05.

**Exportaciones declaradas** (línea inicial): 22: export default function OrderHistoryDetailPage() {.

**Relaciones/imports originales:** <code>../../../shared/components/loading/LoadingIndicator</code>, <code>react</code>, <code>react-router-dom</code>, <code>../../../config/routes</code>, <code>../hooks/useOrderHistoryApi</code>, <code>../utils/orderHistoryFormatters</code>, <code>../components/HistoryEvent</code>, <code>../utils/historyReads</code>, <code>./OrderHistoryDetailPage.module.css</code>, <code>../../../shared/components/layout/PageShell</code>, <code>../../../shared/components/layout/PageHeader</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 145 líneas originales; incluidos 1–97, 126–145. Fuera de extracción: 98–125; corresponden al contexto restante del archivo y no se sustituyen por código inventado. Huella SHA-256 inicial del archivo: 0BCD9B497CCC503044EF4F9F0CFF0AD15DDE8293F082C0F1A56D32DC463F2DDC.

**S033: capaVista/src/modules/orderHistory/pages/OrderHistoryDetailPage.jsx, líneas 1–97.** Componente/función o selectores: OrderHistoryDetail; filtro secundario de tipo de evento y continuidad. Filtros: HIS-F01–HIS-F05. Fragmento literal:

```jsx
import LoadingIndicator, { LoadingAction } from '../../../shared/components/loading/LoadingIndicator'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { APP_ROUTES } from '../../../config/routes'
import { useOrderHistoryApi } from '../hooks/useOrderHistoryApi'
import { formatDate } from '../utils/orderHistoryFormatters'
import HistoryEvent from '../components/HistoryEvent'
import { historyScope, subscribeHistoryRead, appendHistoryEvents } from '../utils/historyReads'
import styles from './OrderHistoryDetailPage.module.css'
import PageShell from '../../../shared/components/layout/PageShell'
import PageHeader from '../../../shared/components/layout/PageHeader'

const EVENT_TYPES = [
  ['all', 'Todos los registros'],
  ['stage', 'Etapas generales'],
  ['payment', 'Pagos'],
  ['subprocess', 'Subprocesos'],
  ['calendar', 'Calendarizacion'],
  ['general', 'Generales'],
]

export default function OrderHistoryDetailPage() {
  const { orderId } = useParams()
  const api = useOrderHistoryApi()
  return <OrderHistoryDetail key={`${historyScope(api)}|${orderId}`} api={api} orderId={orderId} />
}

function OrderHistoryDetail({ api, orderId }) {
  const [type, setType] = useState('all')
  const [order, setOrder] = useState(null)
  const [cursor, setCursor] = useState(null)
  const [pageInfo, setPageInfo] = useState({ nextCursor: null, hasMore: false })
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const summaryOrderId = useRef(null)
  const pendingMore = useRef(false)

  useEffect(() => {
    const hasSummary = summaryOrderId.current === orderId
    return subscribeHistoryRead({ api, orderId, method: hasSummary ? 'listOrderEvents' : 'getOrderHistory', params: { type, cursor, limit: 50 },
      onSuccess: (result) => {
        if (!hasSummary) summaryOrderId.current = orderId
        setOrder((current) => hasSummary && current
          ? {
              ...current,
              events: cursor
                ? appendHistoryEvents(current.events, result.events ?? [])
                : (result.events ?? []),
            }
          : result)
        setPageInfo(result.pageInfo ?? { nextCursor: null, hasMore: false })
        pendingMore.current = false
        setLoading(false)
        setLoadingMore(false)
      },
      onError: (requestError) => {
        setError(requestError?.payload?.message ?? 'No fue posible cargar el historial.')
        pendingMore.current = false
        setLoading(false)
        setLoadingMore(false)
      },
    })
  }, [api, cursor, orderId, type, attempt])

  function selectType(nextType) {
    if (nextType === type) return
    setLoading(true)
    pendingMore.current = false
    setLoadingMore(false)
    setError('')
    setCursor(null)
    setPageInfo({ nextCursor: null, hasMore: false })
    setOrder((current) => current ? { ...current, events: [] } : current)
    setType(nextType)
  }

  function loadMore() {
    if (!pageInfo.hasMore || !pageInfo.nextCursor || pendingMore.current || loading) return
    pendingMore.current = true
    setLoadingMore(true)
    setError('')
    // Retrying a failed continuation uses the same cursor, with a new attempt.
    if (cursor === pageInfo.nextCursor) setAttempt(current => current + 1)
    setCursor(pageInfo.nextCursor)
  }

  function retry() {
    setError('')
    if (cursor && order) { pendingMore.current = true; setLoadingMore(true) }
    else setLoading(true)
    setAttempt(current => current + 1)
  }

  if (loading && !order) return <LoadingIndicator context="historial" />
  if (error && !order) return <div className={styles.state} role="alert"><p>{error}</p><button onClick={retry} type="button">Reintentar</button><Link to={APP_ROUTES.ORDER_HISTORY}>Volver al historial</Link></div>
```

**S033: capaVista/src/modules/orderHistory/pages/OrderHistoryDetailPage.jsx, líneas 126–145.** Componente/función o selectores: OrderHistoryDetail; filtro secundario de tipo de evento y continuidad. Filtros: HIS-F01–HIS-F05. Fragmento literal:

```jsx
          <section className={styles.timelineSection}>
            <header><div><span>Actividad</span><h2>Eventos del pedido</h2></div>
              <select aria-label="Filtrar por tipo de registro" onChange={(event) => selectType(event.target.value)} value={type}>
                {EVENT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </header>
            {loading ? <LoadingIndicator context="Actualizando eventos" /> : order.events.length === 0 ? <div className={styles.empty}>No existen registros para este filtro.</div> : (
              <ol className={styles.timeline}>{order.events.map(event => <HistoryEvent key={event.id} event={event} />)}</ol>
            )}
            {pageInfo.hasMore && (
              <button className={styles.loadMore} disabled={loadingMore} onClick={loadMore} type="button" aria-busy={loadingMore}>
                <LoadingAction busy={loadingMore} context="Cargar más registros">Cargar más registros</LoadingAction>
              </button>
            )}
          </section>
        </>
      )}
    </PageShell>
  )
}
```

<a id="fuente-S034"></a>

#### S034 — capaVista/src/modules/orderHistory/pages/OrderHistoryDetailPage.module.css

**Tipo:** CSS propio. **Responsabilidad, componentes y funciones:** CSS del selector de eventos, contenedor y estados. **Filtros relacionados:** HIS-F01–HIS-F05.

**Cobertura:** 31 líneas originales; incluidos 1–31; cobertura completa. Huella SHA-256 inicial del archivo: 19684639415D4CEF57A3DE917DB30187F9579CAA09D4C4158D4E8D97157B3DE0.

**S034: capaVista/src/modules/orderHistory/pages/OrderHistoryDetailPage.module.css, líneas 1–31.** Componente/función o selectores: CSS del selector de eventos, contenedor y estados. Filtros: HIS-F01–HIS-F05. Fragmento literal:

```css
.page { color: #111827; }
.timelineSection header span { color: #f97316; font-size: .76rem; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
.backLink { background: #fff; border-radius: .7rem; color: #111827; font-weight: 850; padding: .65rem .9rem; text-decoration: none; }
.summary { display: grid; gap: 1rem; grid-template-columns: repeat(4, minmax(0, 1fr)); margin-top: 1rem; }
.summary article, .products, .timelineSection { background: #fff; border: 1px solid #e5e7eb; border-radius: .9rem; box-shadow: 0 8px 24px rgba(15, 23, 42, .04); }
.summary article { display: grid; gap: .3rem; min-width: 0; overflow-wrap: anywhere; padding: 1rem; }
.summary span, .summary small { color: #64748b; }
.summary span { font-size: .72rem; font-weight: 850; text-transform: uppercase; }
.products, .timelineSection { margin-top: 1rem; padding: 1.25rem; }
.products h2, .timelineSection h2 { font-size: 1.25rem; margin: .2rem 0 1rem; }
.productGrid { display: grid; gap: .75rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); }
.productGrid article { background: #f8fafc; border-radius: .75rem; display: grid; gap: .25rem; min-width: 0; overflow-wrap: anywhere; padding: .9rem; }
.productGrid span, .productGrid small { color: #64748b; }
.timelineSection > header { align-items: center; display: flex; justify-content: space-between; }
.timelineSection select { border: 1px solid #dbe1e8; border-radius: .7rem; max-width: 100%; min-width: 0; min-height: 2.5rem; padding: 0 .7rem; }
.timeline { list-style: none; margin: 0; padding: 0; }
.timeline li { display: grid; gap: 1rem; grid-template-columns: 2.4rem minmax(0, 1fr); padding: .75rem 0; position: relative; }
.timeline li:not(:last-child)::before { background: #e5e7eb; content: ''; height: calc(100% - 1.4rem); left: 1.15rem; position: absolute; top: 3.1rem; width: 2px; }
.marker { align-items: center; background: #fff3e8; border-radius: 50%; color: #ea580c; display: flex; height: 2.4rem; justify-content: center; width: 2.4rem; z-index: 1; }
.timeline article { border: 1px solid #e5e7eb; border-radius: .8rem; min-width: 0; overflow-wrap: anywhere; padding: .9rem 1rem; }
.timeline h3 { font-size: 1rem; margin: .15rem 0; }
.timeline time, .timeline p { color: #64748b; font-size: .84rem; }
.timeline p { margin: .35rem 0; }
.type { color: #ea580c; font-size: .72rem; font-weight: 900; text-transform: uppercase; }
.empty, .state { color: #64748b; padding: 3rem; text-align: center; }
.state a { color: #ea580c; }
.error { background: #fff1f2; color: #be123c; margin-top: 1rem; padding: .85rem; }
.loadMore { background: #111827; border: 0; border-radius: .7rem; color: #fff; display: block; font-weight: 800; margin: 1rem auto 0; min-height: 2.65rem; padding: .65rem 1.1rem; }
.loadMore:disabled { cursor: wait; opacity: .65; }
@media (max-width: 1000px) { .summary { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 600px) { .summary { grid-template-columns: 1fr; } .timelineSection > header { align-items: stretch; flex-direction: column; gap: .5rem; } }
```

<a id="fuente-S035"></a>

#### S035 — capaVista/src/modules/orderHistory/utils/historyReads.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** subscribeHistoryRead, historyDateError y appendHistoryEvents. **Filtros relacionados:** HIS-F01–HIS-F05.

**Exportaciones declaradas** (línea inicial): 3: export function historyScope(api) {; 10: export function subscribeHistoryRead({ api, method, orderId, params, onSuccess, onError }) {; 44: export function historyDateError({ from, to }) {; 53: export function appendHistoryEvents(current, incoming) {.

**Cobertura:** 62 líneas originales; incluidos 1–62; cobertura completa. Huella SHA-256 inicial del archivo: 1BAFBB0CCCDF42A55369E5F4AA954C7CDA4109B886B3BAD05DC5AED05974DC80.

**S035: capaVista/src/modules/orderHistory/utils/historyReads.js, líneas 1–62.** Componente/función o selectores: subscribeHistoryRead, historyDateError y appendHistoryEvents. Filtros: HIS-F01–HIS-F05. Fragmento literal:

```javascript
const scopes = new WeakMap()
let nextScope = 0
export function historyScope(api) {
  if (!scopes.has(api)) scopes.set(api, ++nextScope)
  return scopes.get(api)
}

// Pending reads only, isolated by API/session; completed results are never cached.
const pending = new WeakMap()
export function subscribeHistoryRead({ api, method, orderId, params, onSuccess, onError }) {
  let requests = pending.get(api)
  if (!requests) { requests = new Map(); pending.set(api, requests) }
  const key = JSON.stringify([method, orderId, params])
  let entry = requests.get(key)
  if (!entry) {
    entry = { controller: new AbortController(), listeners: new Set() }
    requests.set(key, entry)
    queueMicrotask(async () => {
      if (!entry.listeners.size) return
      try {
        const options = { ...params, signal: entry.controller.signal }
        const result = await (method === 'listOrders' ? api[method](options) : api[method](orderId, options))
        for (const listener of entry.listeners) listener.onSuccess(result)
      } catch (error) {
        if (!entry.controller.signal.aborted) for (const listener of entry.listeners) listener.onError(error)
      } finally {
        if (requests.get(key) === entry) requests.delete(key)
      }
    })
  }
  const listener = { onSuccess, onError }
  entry.listeners.add(listener)
  return () => {
    entry.listeners.delete(listener)
    queueMicrotask(() => {
      if (!entry.listeners.size) {
        entry.controller.abort()
        if (requests.get(key) === entry) requests.delete(key)
      }
    })
  }
}

export function historyDateError({ from, to }) {
  for (const value of [from, to]) {
    if (!value) continue
    const date = new Date(`${value}T00:00:00.000Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return 'El rango de fechas no es válido.'
  }
  return from && to && from > to ? 'La fecha Desde no puede ser posterior a la fecha Hasta.' : ''
}

export function appendHistoryEvents(current, incoming) {
  const ids = new Set(current.map(event => event.id))
  const additions = []
  for (const event of incoming) {
    if (ids.has(event.id)) continue
    ids.add(event.id)
    additions.push(event)
  }
  return additions.length ? [...current, ...additions] : current
}
```

<a id="fuente-S036"></a>

#### S036 — capaVista/src/modules/orderHistory/api/orderHistoryApi.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** createOrderHistoryApi; listado/resumen/eventos y señal. **Filtros relacionados:** HIS-F01–HIS-F05.

**Exportaciones declaradas** (línea inicial): 10: export function createOrderHistoryApi(apiClient) {.

**Cobertura:** 19 líneas originales; incluidos 1–19; cobertura completa. Huella SHA-256 inicial del archivo: D0AD46296235F6D626AAF25BD54A4B7398C0A651B735F8678EEB4C3703AF830D.

**S036: capaVista/src/modules/orderHistory/api/orderHistoryApi.js, líneas 1–19.** Componente/función o selectores: createOrderHistoryApi; listado/resumen/eventos y señal. Filtros: HIS-F01–HIS-F05. Fragmento literal:

```javascript
function queryString(params = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value))
  })
  const value = query.toString()
  return value ? `?${value}` : ''
}

export function createOrderHistoryApi(apiClient) {
  const read = (path, { signal, ...params } = {}) => apiClient.get(`${path}${queryString(params)}`, { signal })
  return {
    listOrders: (params) => read('/history/orders', params),
    getOrderHistory: (orderId, params = {}) =>
      read(`/history/orders/${orderId}`, params),
    listOrderEvents: (orderId, params = {}) =>
      read(`/history/orders/${orderId}/events`, params),
  }
}
```

<a id="fuente-S037"></a>

#### S037 — capaVista/src/modules/orderHistory/hooks/useOrderHistoryApi.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** useOrderHistoryApi; aislamiento por cliente. **Filtros relacionados:** HIS-F01–HIS-F05.

**Exportaciones declaradas** (línea inicial): 5: export function useOrderHistoryApi() {.

**Relaciones/imports originales:** <code>react</code>, <code>../../../hooks/useApiClient.js</code>, <code>../api/orderHistoryApi</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 8 líneas originales; incluidos 1–8; cobertura completa. Huella SHA-256 inicial del archivo: 74071424C98B7308AC1DA2189091AF8E3D6CA625A4169AD708C12300B701372E.

**S037: capaVista/src/modules/orderHistory/hooks/useOrderHistoryApi.js, líneas 1–8.** Componente/función o selectores: useOrderHistoryApi; aislamiento por cliente. Filtros: HIS-F01–HIS-F05. Fragmento literal:

```javascript
import { useMemo } from 'react'
import { useApiClient } from '../../../hooks/useApiClient.js'
import { createOrderHistoryApi } from '../api/orderHistoryApi'

export function useOrderHistoryApi() {
  const client = useApiClient()
  return useMemo(() => createOrderHistoryApi(client), [client])
}
```


### 15.6. Calendario

<a id="fuente-S038"></a>

#### S038 — capaVista/src/modules/productionCalendar/components/CalendarFilters.jsx

**Tipo:** JSX/React. **Responsabilidad, componentes y funciones:** CalendarFilters; búsqueda, estado, producto y limpieza. **Filtros relacionados:** CAL-F01–CAL-F03; CAL-N01–CAL-N04.

**Exportaciones declaradas** (línea inicial): 4: export default function CalendarFilters({ filters, onChange, onClear }) {.

**Relaciones/imports originales:** <code>../config/productionCalendar.config</code>, <code>./CalendarFilters.module.css</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 41 líneas originales; incluidos 1–41; cobertura completa. Huella SHA-256 inicial del archivo: 84D77E2F6B0FAA81CB92AE355B3508CC8109E4AC3C01F4ECC0FD74E8FC022D3A.

**S038: capaVista/src/modules/productionCalendar/components/CalendarFilters.jsx, líneas 1–41.** Componente/función o selectores: CalendarFilters; búsqueda, estado, producto y limpieza. Filtros: CAL-F01–CAL-F03; CAL-N01–CAL-N04. Fragmento literal:

```jsx
import { PRODUCTION_STATUSES } from '../config/productionCalendar.config'
import styles from './CalendarFilters.module.css'

export default function CalendarFilters({ filters, onChange, onClear }) {
  return (
    <section className={styles.filtersCard} aria-label="Filtros de calendario">
      <label>
        <span>Buscar</span>
        <input
          onChange={(event) => onChange({ search: event.target.value })}
          placeholder="NV, cliente o producto"
          type="search"
          value={filters.search}
        />
      </label>
      <label>
        <span>Estado</span>
        <select onChange={(event) => onChange({ status: event.target.value })} value={filters.status}>
          <option value="">Todos</option>
          {Object.values(PRODUCTION_STATUSES).map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Producto</span>
        <select onChange={(event) => onChange({ productType: event.target.value })} value={filters.productType}>
          <option value="">Todos</option>
          <option value="Lanyard">Lanyard</option>
          <option value="Tarjeta">Tarjeta</option>
          <option value="Yoyo">Yoyo</option>
        </select>
      </label>
      <button className={styles.clearButton} onClick={onClear} type="button">
        Limpiar filtros
      </button>
    </section>
  )
}
```

<a id="fuente-S039"></a>

#### S039 — capaVista/src/modules/productionCalendar/components/CalendarFilters.module.css

**Tipo:** CSS propio. **Responsabilidad, componentes y funciones:** CSS completo de panel y controles. **Filtros relacionados:** CAL-F01–CAL-F03; CAL-N01–CAL-N04.

**Cobertura:** 64 líneas originales; incluidos 1–64; cobertura completa. Huella SHA-256 inicial del archivo: BDDA5D238877D83050F0AC2D876EB55DFFAB8D6E39CB8E27663A31BBD0CAC6FD.

**S039: capaVista/src/modules/productionCalendar/components/CalendarFilters.module.css, líneas 1–64.** Componente/función o selectores: CSS completo de panel y controles. Filtros: CAL-F01–CAL-F03; CAL-N01–CAL-N04. Fragmento literal:

```css
.filtersCard {
  align-items: end;
  background: #fff;
  border: 1px solid var(--calendar-border);
  border-radius: 0.85rem;
  box-shadow: 0 14px 32px rgba(15, 23, 42, 0.045);
  display: grid;
  gap: 1rem;
  grid-template-columns: 1.4fr 1fr 1fr auto;
  padding: 1rem;
}

.filtersCard label {
  display: grid;
  gap: 0.45rem;
  margin: 0;
}

.filtersCard span {
  color: var(--calendar-muted);
  font-size: 0.78rem;
  font-weight: 850;
  letter-spacing: 0.055em;
  text-transform: uppercase;
}

.filtersCard input,
.filtersCard select {
  border: 1px solid #d7dee8;
  border-radius: 0.55rem;
  color: var(--calendar-text);
  min-height: 3rem;
  padding: 0.55rem 0.7rem;
}

.filtersCard input:focus,
.filtersCard select:focus {
  border-color: var(--calendar-orange);
  box-shadow: 0 0 0 0.22rem rgba(var(--calendar-orange-rgb), 0.18);
  outline: none;
}

.clearButton {
  background: #fff;
  border: 1px solid #d3d9e2;
  border-radius: 0.55rem;
  color: #111827;
  font-weight: 780;
  min-height: 3rem;
  padding: 0.55rem 0.9rem;
}

.clearButton:hover,
.clearButton:focus {
  border-color: var(--calendar-orange);
  color: var(--calendar-orange);
  outline: none;
}

@media (max-width: 991.98px) {
  .filtersCard {
    grid-template-columns: 1fr;
  }
}
```

<a id="fuente-S040"></a>

#### S040 — capaVista/src/modules/productionCalendar/components/CalendarHeader.jsx

**Tipo:** JSX/React. **Responsabilidad, componentes y funciones:** CalendarHeader; apertura desde cabecera compartida. **Filtros relacionados:** CAL-F01–CAL-F03; CAL-N01–CAL-N04.

**Exportaciones declaradas** (línea inicial): 4: export default function CalendarHeader({ isFiltersOpen, onToggleFilters }) {.

**Relaciones/imports originales:** <code>./CalendarHeader.module.css</code>, <code>../../../shared/components/layout/PageHeader</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 13 líneas originales; incluidos 1–13; cobertura completa. Huella SHA-256 inicial del archivo: 08EFCB761F57B1727B689BBB141DA0747B4D88FE5D55A5BBAD8B1FB76E4710EF.

**S040: capaVista/src/modules/productionCalendar/components/CalendarHeader.jsx, líneas 1–13.** Componente/función o selectores: CalendarHeader; apertura desde cabecera compartida. Filtros: CAL-F01–CAL-F03; CAL-N01–CAL-N04. Fragmento literal:

```jsx
import styles from './CalendarHeader.module.css'
import PageHeader from '../../../shared/components/layout/PageHeader'

export default function CalendarHeader({ isFiltersOpen, onToggleFilters }) {
  return (
    <PageHeader title="Calendario" actions={
      <button className={styles.filterToggleButton} onClick={onToggleFilters} type="button">
        <i className="bi bi-funnel" aria-hidden="true" />
        {isFiltersOpen ? 'Ocultar filtros' : 'Mostrar filtros'}
      </button>
    } />
  )
}
```

<a id="fuente-S041"></a>

#### S041 — capaVista/src/modules/productionCalendar/components/CalendarHeader.module.css

**Tipo:** CSS propio. **Responsabilidad, componentes y funciones:** CSS completo de botón de apertura. **Filtros relacionados:** CAL-F01–CAL-F03; CAL-N01–CAL-N04.

**Cobertura:** 29 líneas originales; incluidos 1–29; cobertura completa. Huella SHA-256 inicial del archivo: 34ECD02BEE7367F21401929993E2C9670EF4725C850915D9C0B67AE0BD1C4E9D.

**S041: capaVista/src/modules/productionCalendar/components/CalendarHeader.module.css, líneas 1–29.** Componente/función o selectores: CSS completo de botón de apertura. Filtros: CAL-F01–CAL-F03; CAL-N01–CAL-N04. Fragmento literal:

```css
.filterToggleButton {
  align-items: center;
  background: rgba(var(--page-brand-orange-rgb), 0.12);
  border: 1px solid rgba(var(--page-brand-orange-rgb), 0.42);
  border-radius: 0.75rem;
  color: #fff;
  display: inline-flex;
  flex: 0 0 auto;
  font-weight: 850;
  gap: 0.55rem;
  min-height: 2.85rem;
  padding: 0.6rem 1rem;
}

.filterToggleButton:hover,
.filterToggleButton:focus {
  background: var(--page-brand-orange);
  border-color: var(--page-brand-orange);
  color: #111827;
  outline: 2px solid var(--page-white);
  outline-offset: 3px;
}

@media (max-width: 991.98px) {

  .filterToggleButton {
    width: 100%;
  }
}
```

<a id="fuente-S042"></a>

#### S042 — capaVista/src/modules/productionCalendar/components/CalendarToolbar.jsx

**Tipo:** JSX/React. **Responsabilidad, componentes y funciones:** CalendarToolbar; navegación mensual y Hoy, no filtros de atributos. **Filtros relacionados:** CAL-F01–CAL-F03; CAL-N01–CAL-N04.

**Exportaciones declaradas** (línea inicial): 4: export default function CalendarToolbar({.

**Relaciones/imports originales:** <code>../utils/calendarUtils</code>, <code>./CalendarToolbar.module.css</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 29 líneas originales; incluidos 1–29; cobertura completa. Huella SHA-256 inicial del archivo: 47D4D526ACE5B14B5A076287961ED108C0DE638823FE918337306ACA9E4DB8E1.

**S042: capaVista/src/modules/productionCalendar/components/CalendarToolbar.jsx, líneas 1–29.** Componente/función o selectores: CalendarToolbar; navegación mensual y Hoy, no filtros de atributos. Filtros: CAL-F01–CAL-F03; CAL-N01–CAL-N04. Fragmento literal:

```jsx
import { formatMonthTitle } from '../utils/calendarUtils'
import styles from './CalendarToolbar.module.css'

export default function CalendarToolbar({
  monthDate,
  onNextMonth,
  onPreviousMonth,
  onToday,
}) {
  return (
    <section className={styles.toolbar} aria-label="Controles del calendario">
      <div className={styles.monthNavigation}>
        <button onClick={onPreviousMonth} title="Mes anterior" type="button">
          <i className="bi bi-chevron-left" aria-hidden="true" />
        </button>
        <h2>{formatMonthTitle(monthDate)}</h2>
        <button
          onClick={onNextMonth}
          title="Mes siguiente"
          type="button"
        >
          <i className="bi bi-chevron-right" aria-hidden="true" />
        </button>
      </div>

      <button className={styles.todayButton} onClick={onToday} type="button">Hoy</button>
    </section>
  )
}
```

<a id="fuente-S043"></a>

#### S043 — capaVista/src/modules/productionCalendar/components/CalendarToolbar.module.css

**Tipo:** CSS propio. **Responsabilidad, componentes y funciones:** CSS completo de navegación. **Filtros relacionados:** CAL-F01–CAL-F03; CAL-N01–CAL-N04.

**Cobertura:** 7 líneas originales; incluidos 1–7; cobertura completa. Huella SHA-256 inicial del archivo: BFF6BDE4D2354BF50384EDE1B29D26A6BB38579F4519C0999CB046546AEC2EE0.

**S043: capaVista/src/modules/productionCalendar/components/CalendarToolbar.module.css, líneas 1–7.** Componente/función o selectores: CSS completo de navegación. Filtros: CAL-F01–CAL-F03; CAL-N01–CAL-N04. Fragmento literal:

```css
.toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: .75rem; min-width: 0; }
.monthNavigation { display: flex; align-items: center; gap: .75rem; min-width: 0; }
.toolbar h2 { color: var(--calendar-text); font-size: 1.2rem; font-weight: 800; margin: 0; text-align: center; }
.monthNavigation button, .todayButton { display: inline-flex; align-items: center; justify-content: center; background: var(--page-white); border: 1px solid var(--calendar-border); border-radius: .5rem; color: var(--calendar-text); font-size: .85rem; font-weight: 700; min-height: 2.6rem; min-width: 2.6rem; padding: .5rem .75rem; }
.toolbar button:hover { border-color: var(--calendar-orange); color: var(--calendar-orange); }
.toolbar button:focus-visible { outline: 2px solid var(--calendar-orange); outline-offset: 2px; }
@media (max-width: 575.98px) { .toolbar { gap: .5rem; } .monthNavigation { gap: .4rem; } .toolbar h2 { font-size: 1rem; } }
```

<a id="fuente-S044"></a>

#### S044 — capaVista/src/modules/productionCalendar/pages/ProductionCalendarPage.jsx

**Tipo:** JSX/React. **Responsabilidad, componentes y funciones:** CalendarContent; carga por mes, filtros locales, conciliación y montaje. **Filtros relacionados:** CAL-F01–CAL-F03; CAL-N01–CAL-N04.

**Exportaciones declaradas** (línea inicial): 75: export default function ProductionCalendarPage() {.

**Relaciones/imports originales:** <code>react</code>, <code>../components/CalendarFilters</code>, <code>../components/CalendarHeader</code>, <code>../../../shared/components/layout/PageShell</code>, <code>../components/CalendarToolbar</code>, <code>../components/ProductionCalendarGrid</code>, <code>../hooks/useOrdersCalendarApi</code>, <code>../api/ordersCalendarApi</code>, <code>../utils/calendarOrder</code>, <code>./ProductionCalendarPage.module.css</code>, <code>../utils/calendarReads</code>, <code>../../../shared/notifications/useToast</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 251 líneas originales; incluidos 1–251; cobertura completa. Huella SHA-256 inicial del archivo: 301F3A7BD1C9DB929FFEC75B8389725D519EEBE82B03A698D44CCE8F0F94A76F.

**S044: capaVista/src/modules/productionCalendar/pages/ProductionCalendarPage.jsx, líneas 1–251.** Componente/función o selectores: CalendarContent; carga por mes, filtros locales, conciliación y montaje. Filtros: CAL-F01–CAL-F03; CAL-N01–CAL-N04. Fragmento literal:

```jsx
import { useEffect, useMemo, useRef, useState } from 'react'
import CalendarFilters from '../components/CalendarFilters'
import CalendarHeader from '../components/CalendarHeader'
import PageShell, { PageSurface } from '../../../shared/components/layout/PageShell'
import CalendarToolbar from '../components/CalendarToolbar'
import ProductionCalendarGrid from '../components/ProductionCalendarGrid'
import { useOrdersCalendarApi } from '../hooks/useOrdersCalendarApi'
import { loadCalendarMonth, loadUnscheduledOrders } from '../api/ordersCalendarApi'
import { getCalendarOrderQuantity, getCalendarOrderStatus } from '../utils/calendarOrder'
import styles from './ProductionCalendarPage.module.css'
import { calendarScope, mergeCalendarCollections, reconcileCalendarRead } from '../utils/calendarReads'
import { useToast } from '../../../shared/notifications/useToast'

const DEFAULT_FILTERS = Object.freeze({
  search: '',
  status: '',
  productType: '',
})

function toCalendarDateKey(value) {
  return value ? String(value).slice(0, 10) : ''
}

function monthRange(monthDate) {
  const year = monthDate.getFullYear()
  const month = monthDate.getMonth()
  const first = new Date(year, month, 1)
  const last = new Date(year, month + 1, 0)
  const key = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  return { from: key(first), to: key(last) }
}

function normalizeText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function getOrderProductNames(order) {
  const sourceItems = Array.isArray(order.items) ? order.items : []

  const productNames = sourceItems
    .map((item) => item.product)
    .filter(Boolean)

  return [...new Set([
    order.product,
    ...productNames,
  ].filter(Boolean))]
}

function normalizeCalendarOrder(order) {
  const productNames = getOrderProductNames(order)
  const items = (Array.isArray(order.items) ? order.items : []).map((item) => ({
    ...item,
    dueDate: toCalendarDateKey(item.dueDate),
  }))

  return {
    ...order,
    id: order.id,
    orderNumber: order.salesNoteNumber,
    clientName: order.clientName ?? 'Cliente sin nombre',
    productType: productNames[0] ?? 'Producto no definido',
    productTypes: productNames,
    quantity: getCalendarOrderQuantity(items),
    items,
    status: getCalendarOrderStatus(order),
    dueDate: toCalendarDateKey(order.dueDate),
  }
}

export default function ProductionCalendarPage() {
  const ordersCalendarApi = useOrdersCalendarApi()
  return <CalendarContent key={calendarScope(ordersCalendarApi)} ordersCalendarApi={ordersCalendarApi} />
}

function CalendarContent({ ordersCalendarApi }) {
  const notify = useToast()
  const active = useRef(false)
  const pendingReads = useRef(new Set())
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const [calendarItems, setCalendarItems] = useState([])
  const [unscheduledItems, setUnscheduledItems] = useState([])
  const [monthDate, setMonthDate] = useState(() => {
    const today = new Date()

    return new Date(today.getFullYear(), today.getMonth(), 1)
  })
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const currentMonth = useRef(monthDate)
  useEffect(() => { currentMonth.current = monthDate }, [monthDate])
  const [isFiltersOpen, setIsFiltersOpen] = useState(false)
  const [draggedItemId, setDraggedItemId] = useState(null)
  const [loadedMonth, setLoadedMonth] = useState(null)
  const [loadedPendingApi, setLoadedPendingApi] = useState(null)
  const isLoading = loadedMonth !== monthDate || loadedPendingApi !== ordersCalendarApi

  useEffect(() => {
    let isMounted = true
    const controller = new AbortController()
    const read = { overrides: new Map(), range: monthRange(monthDate) }
    const reads = pendingReads.current
    reads.add(read)

    async function loadOrders() {
      try {
        const orders = await loadCalendarMonth(ordersCalendarApi, read.range, () => isMounted, { signal: controller.signal })

        if (isMounted) {
          setCalendarItems(reconcileCalendarRead(Array.isArray(orders)
            ? orders
                .filter((order) => order?.salesNoteNumber)
                .map(normalizeCalendarOrder)
            : [], read.overrides, read.range))
        }
      } catch {
        if (isMounted) {
          notify.error('No fue posible cargar los pedidos compartidos del calendario.')
        }
      } finally {
        reads.delete(read)
        if (isMounted) setLoadedMonth(monthDate)
      }
    }

    loadOrders()

    return () => {
      isMounted = false
      reads.delete(read)
      controller.abort()
    }
  }, [monthDate, ordersCalendarApi, notify])

  useEffect(() => {
    let isMounted = true
    const controller = new AbortController()
    const read = { overrides: new Map(), range: { unscheduled: true } }
    const reads = pendingReads.current
    reads.add(read)
    loadUnscheduledOrders(ordersCalendarApi, () => isMounted, { signal: controller.signal })
      .then((orders) => {
        if (isMounted) setUnscheduledItems(reconcileCalendarRead(orders.filter((order) => order?.salesNoteNumber).map(normalizeCalendarOrder), read.overrides, read.range))
      })
      .catch(() => {
        if (isMounted) notify.error('No fue posible cargar los pedidos pendientes de fecha.')
      })
      .finally(() => { reads.delete(read); if (isMounted) setLoadedPendingApi(ordersCalendarApi) })
    return () => { isMounted = false; reads.delete(read); controller.abort() }
  }, [ordersCalendarApi, notify])

  useEffect(() => {
    if (!draggedItemId) return undefined

    function clearDraggedItem() {
      setDraggedItemId(null)
    }

    window.addEventListener('dragend', clearDraggedItem)
    window.addEventListener('drop', clearDraggedItem)

    return () => {
      window.removeEventListener('dragend', clearDraggedItem)
      window.removeEventListener('drop', clearDraggedItem)
    }
  }, [draggedItemId])

  const filteredItems = useMemo(() => {
    const normalizedSearch = normalizeText(filters.search)
    const normalizedProductType = normalizeText(filters.productType)

    return calendarItems.filter((item) => {
      const searchableProductNames = Array.isArray(item.productTypes) ? item.productTypes : [item.productType]
      const matchesSearch =
        normalizedSearch.length === 0 ||
        normalizeText([item.orderNumber, item.clientName, ...searchableProductNames].join(' ')).includes(normalizedSearch)
      const matchesStatus = !filters.status || item.status === filters.status
      const matchesProduct =
        !normalizedProductType ||
        searchableProductNames.some((productName) => normalizeText(productName) === normalizedProductType)

      return matchesSearch && matchesStatus && matchesProduct
    })
  }, [calendarItems, filters])

  function changeMonth(offset) {
    setMonthDate((currentDate) => new Date(currentDate.getFullYear(), currentDate.getMonth() + offset, 1))
  }

  function updateFilters(nextFilters) {
    setFilters((currentFilters) => ({
      ...currentFilters,
      ...nextFilters,
    }))
  }

  async function updateItemDeliveryDate(itemId, nextDate, credentials) {
    const normalizedOrder = normalizeCalendarOrder(await ordersCalendarApi.updateDeliveryDate(itemId, nextDate, credentials))
    if (!active.current) return
    const overrides = new Map([[String(itemId), normalizedOrder]])
    for (const read of pendingReads.current) read.overrides.set(String(itemId), normalizedOrder)
    setCalendarItems(current => reconcileCalendarRead(current, overrides, monthRange(currentMonth.current)))
    setUnscheduledItems(current => reconcileCalendarRead(current, overrides, { unscheduled: true }))
  }

  async function getOrderDetail(orderId) {
    return normalizeCalendarOrder(await ordersCalendarApi.getOrderDetail(orderId))
  }

  return (
    <PageShell className={styles.page}>
      <PageSurface className={styles.dashboardShell}>
        <CalendarHeader
          isFiltersOpen={isFiltersOpen}
          onToggleFilters={() => setIsFiltersOpen((currentValue) => !currentValue)}
        />

        <div className={styles.content}>
          {isFiltersOpen && (
            <CalendarFilters
              filters={filters}
              onChange={updateFilters}
              onClear={() => setFilters(DEFAULT_FILTERS)}
            />
          )}

          <section className={styles.calendarPanel}>
            <ProductionCalendarGrid
              isLoading={isLoading}
              getOrderDetail={getOrderDetail}
              allItems={mergeCalendarCollections(calendarItems, unscheduledItems)}
              draggedItemId={draggedItemId}
              items={filteredItems}
              monthDate={monthDate}
              onChangeDeliveryDate={updateItemDeliveryDate}
              onDragEnd={() => setDraggedItemId(null)}
              onDragStart={setDraggedItemId}
              toolbar={<CalendarToolbar monthDate={monthDate} onNextMonth={() => changeMonth(1)} onPreviousMonth={() => changeMonth(-1)} onToday={() => {
                const today = new Date()
                setMonthDate(new Date(today.getFullYear(), today.getMonth(), 1))
              }} />}
            />
          </section>
        </div>
      </PageSurface>
    </PageShell>
  )
}
```

<a id="fuente-S045"></a>

#### S045 — capaVista/src/modules/productionCalendar/pages/ProductionCalendarPage.module.css

**Tipo:** CSS propio. **Responsabilidad, componentes y funciones:** Tokens de calendario y contenedores. **Filtros relacionados:** CAL-F01–CAL-F03; CAL-N01–CAL-N04.

**Cobertura:** 37 líneas originales; incluidos 1–37; cobertura completa. Huella SHA-256 inicial del archivo: 3A77A96BA7AA3EE641FFC8DB733275EE9DF24094CAE09E4DAF0DB8B68375514F.

**S045: capaVista/src/modules/productionCalendar/pages/ProductionCalendarPage.module.css, líneas 1–37.** Componente/función o selectores: Tokens de calendario y contenedores. Filtros: CAL-F01–CAL-F03; CAL-N01–CAL-N04. Fragmento literal:

```css
.page {
  --calendar-border: var(--page-border);
  --calendar-orange: var(--page-brand-orange);
  --calendar-orange-rgb: var(--page-brand-orange-rgb);
  --calendar-muted: #64748b;
  --calendar-text: #111827;

  color: var(--calendar-text);
  font-family: var(--page-font-family);
}

.dashboardShell {
  overflow: hidden;
}

.content {
  display: grid;
  min-width: 0;
  gap: 1rem;
  padding: 1rem;
}

.calendarPanel {
  min-width: 0;
}

@media (max-width: 1199.98px) {
  .content {
    padding: 1rem;
  }
}

@media (max-width: 575.98px) {
  .content {
    padding: 0.85rem;
  }
}
```

<a id="fuente-S046"></a>

#### S046 — capaVista/src/modules/productionCalendar/config/productionCalendar.config.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** PRODUCTION_STATUSES y correspondencia por paso. **Filtros relacionados:** CAL-F01–CAL-F03; CAL-N01–CAL-N04.

**Exportaciones declaradas** (línea inicial): 1: export const PRODUCTION_STATUSES = Object.freeze({; 11: export const PRODUCTION_STATUS_BY_STEP = Object.freeze({.

**Cobertura:** 19 líneas originales; incluidos 1–19; cobertura completa. Huella SHA-256 inicial del archivo: 2FF6EF19955393411A819B88565F137E6F2AAEB861114D065CFE5E9354D1A619.

**S046: capaVista/src/modules/productionCalendar/config/productionCalendar.config.js, líneas 1–19.** Componente/función o selectores: PRODUCTION_STATUSES y correspondencia por paso. Filtros: CAL-F01–CAL-F03; CAL-N01–CAL-N04. Fragmento literal:

```javascript
export const PRODUCTION_STATUSES = Object.freeze({
  PAYMENT_CONFIRMATION: 'Confirmación de Pago',
  READY_PRODUCTION: 'Listo para Producción',
  IN_PRODUCTION: 'En producción',
  READY_DELIVERY: 'Listo para Entrega',
  COMPLETED: 'Terminado',
  CANCELLED: 'Cancelado',
  IN_REVIEW: 'En revisión',
})

export const PRODUCTION_STATUS_BY_STEP = Object.freeze({
  0: PRODUCTION_STATUSES.PAYMENT_CONFIRMATION,
  1: PRODUCTION_STATUSES.READY_PRODUCTION,
  2: PRODUCTION_STATUSES.IN_PRODUCTION,
  3: PRODUCTION_STATUSES.READY_DELIVERY,
  4: PRODUCTION_STATUSES.COMPLETED,
  5: PRODUCTION_STATUSES.CANCELLED,
  6: PRODUCTION_STATUSES.IN_REVIEW,
})
```

<a id="fuente-S047"></a>

#### S047 — capaVista/src/modules/productionCalendar/api/ordersCalendarApi.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** createOrdersCalendarApi y carga exhaustiva de páginas. **Filtros relacionados:** CAL-F01–CAL-F03; CAL-N01–CAL-N04.

**Exportaciones declaradas** (línea inicial): 3: export function createOrdersCalendarApi(apiClient) {; 22: export const loadUnscheduledOrders = (api, isActive = () => true, options) =>; 25: export async function loadCalendarMonth(api, range, isActive = () => true, options) {.

**Relaciones/imports originales:** <code>../../orders/utils/orderDto</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 38 líneas originales; incluidos 1–38; cobertura completa. Huella SHA-256 inicial del archivo: 3D7CCAF1328F9AAEA2AE3AD7152C26C02E5794E51C61625EEB2D0780F74A7088.

**S047: capaVista/src/modules/productionCalendar/api/ordersCalendarApi.js, líneas 1–38.** Componente/función o selectores: createOrdersCalendarApi y carga exhaustiva de páginas. Filtros: CAL-F01–CAL-F03; CAL-N01–CAL-N04. Fragmento literal:

```javascript
import { parseCalendarOrderDetailDTO, parseCalendarPageDTO } from '../../orders/utils/orderDto'

export function createOrdersCalendarApi(apiClient) {
  return {
    getOrders: ({ from, to, cursor, limit = 100, unscheduled = false } = {}, { signal } = {}) => {
      const query = new URLSearchParams({ limit: String(limit) })
      if (from) query.set('from', from)
      if (to) query.set('to', to)
      if (cursor) query.set('cursor', cursor)
      if (unscheduled) query.set('unscheduled', 'true')
      return apiClient.get(`/orders/calendar-summary?${query.toString()}`, { signal }).then(parseCalendarPageDTO)
    },
    getOrderDetail: (orderId) => apiClient.get(`/orders/${orderId}/calendar-detail`).then(parseCalendarOrderDetailDTO),
    updateDeliveryDate: (orderId, dueDate, payload = {}) =>
      apiClient.patch(`/orders/${orderId}/delivery-date`, {
        dueDate,
        pin: payload.pin,
      }).then(parseCalendarOrderDetailDTO),
  }
}

export const loadUnscheduledOrders = (api, isActive = () => true, options) =>
  loadCalendarMonth(api, { unscheduled: true }, isActive, options)

export async function loadCalendarMonth(api, range, isActive = () => true, options) {
  const orders = []
  const seenCursors = new Set()
  let cursor = null
  do {
    const result = await api.getOrders({ ...range, cursor }, options)
    if (!isActive()) return []
    orders.push(...(result.items ?? []))
    cursor = result.pageInfo?.hasMore ? result.pageInfo.nextCursor : null
    if (cursor && seenCursors.has(cursor)) throw new Error('El servidor repitió un cursor de calendario.')
    if (cursor) seenCursors.add(cursor)
  } while (cursor)
  return orders
}
```

<a id="fuente-S048"></a>

#### S048 — capaVista/src/modules/productionCalendar/hooks/useOrdersCalendarApi.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** useOrdersCalendarApi; instancia por sesión. **Filtros relacionados:** CAL-F01–CAL-F03; CAL-N01–CAL-N04.

**Exportaciones declaradas** (línea inicial): 5: export function useOrdersCalendarApi() {.

**Relaciones/imports originales:** <code>react</code>, <code>../../../hooks/useApiClient.js</code>, <code>../api/ordersCalendarApi</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 8 líneas originales; incluidos 1–8; cobertura completa. Huella SHA-256 inicial del archivo: 89E2B73F6A1A1D9449D8CDB6DBBED3313E8038C51EEC3717BA61776A80C0C54B.

**S048: capaVista/src/modules/productionCalendar/hooks/useOrdersCalendarApi.js, líneas 1–8.** Componente/función o selectores: useOrdersCalendarApi; instancia por sesión. Filtros: CAL-F01–CAL-F03; CAL-N01–CAL-N04. Fragmento literal:

```javascript
import { useMemo } from 'react'
import { useApiClient } from '../../../hooks/useApiClient.js'
import { createOrdersCalendarApi } from '../api/ordersCalendarApi'

export function useOrdersCalendarApi() {
  const client = useApiClient()
  return useMemo(() => createOrdersCalendarApi(client), [client])
}
```

<a id="fuente-S049"></a>

#### S049 — capaVista/src/modules/productionCalendar/utils/calendarReads.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** calendarScope, mergeCalendarCollections y reconcileCalendarRead. **Filtros relacionados:** CAL-F01–CAL-F03; CAL-N01–CAL-N04.

**Exportaciones declaradas** (línea inicial): 3: export function calendarScope(api) {; 8: export function mergeCalendarCollections(month, pending) {; 15: export function reconcileCalendarRead(rows, overrides, range) {.

**Cobertura:** 24 líneas originales; incluidos 1–24; cobertura completa. Huella SHA-256 inicial del archivo: C133F8CB5C798422A8611B23867348290FEACF06DFDA2566EB8A0DF66AF0E272.

**S049: capaVista/src/modules/productionCalendar/utils/calendarReads.js, líneas 1–24.** Componente/función o selectores: calendarScope, mergeCalendarCollections y reconcileCalendarRead. Filtros: CAL-F01–CAL-F03; CAL-N01–CAL-N04. Fragmento literal:

```javascript
const scopes = new WeakMap()
let nextScope = 0
export function calendarScope(api) {
  if (!scopes.has(api)) scopes.set(api, ++nextScope)
  return scopes.get(api)
}

export function mergeCalendarCollections(month, pending) {
  const ids = new Set(month.map(item => String(item.id)))
  return [...month, ...pending.filter(item => !ids.has(String(item.id)))]
}

// Overrides belong only to a read already pending at commit time, never a cache
// used to replace future authorized server reads.
export function reconcileCalendarRead(rows, overrides, range) {
  const result = new Map(rows.map(item => [String(item.id), item]))
  for (const [id, item] of overrides) {
    const date = item.dueDate
    const belongs = range.unscheduled ? !date : Boolean(date && date >= range.from && date <= range.to)
    if (belongs) result.set(id, item)
    else result.delete(id)
  }
  return [...result.values()]
}
```

<a id="fuente-S050"></a>

#### S050 — capaVista/src/modules/productionCalendar/utils/calendarUtils.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** Utilidades de fecha local, mes, días y agrupación. **Filtros relacionados:** CAL-F01–CAL-F03; CAL-N01–CAL-N04.

**Exportaciones declaradas** (línea inicial): 1: export const WEEK_DAYS = Object.freeze(['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes']); 3: export function formatMonthTitle(date) {; 12: export function toDateKey(date) {; 20: export function isBusinessDay(date) {; 26: export function isBusinessDateKey(dateKey) {; 38: export function buildMonthGrid(monthDate) {; 63: export function groupItemsByDate(items) {; 73: export function isSameMonth(dateKey, monthDate) {; 83: export function isLanyardItem(item) {.

**Cobertura:** 85 líneas originales; incluidos 1–81. Fuera de extracción: 82–85; corresponden al contexto restante del archivo y no se sustituyen por código inventado. Huella SHA-256 inicial del archivo: E3D5D8D84507436D259FC60F74BE0F03BE8E87FDB262CB9F8B843238538FFB99.

**S050: capaVista/src/modules/productionCalendar/utils/calendarUtils.js, líneas 1–81.** Componente/función o selectores: Utilidades de fecha local, mes, días y agrupación. Filtros: CAL-F01–CAL-F03; CAL-N01–CAL-N04. Fragmento literal:

```javascript
export const WEEK_DAYS = Object.freeze(['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes'])

export function formatMonthTitle(date) {
  return new Intl.DateTimeFormat('es-CL', {
    month: 'long',
    year: 'numeric',
  })
    .format(date)
    .replace(/^\w/, (letter) => letter.toUpperCase())
}

export function toDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

export function isBusinessDay(date) {
  const day = date.getDay()

  return day !== 0 && day !== 6
}

export function isBusinessDateKey(dateKey) {
  if (!dateKey) return false

  const date = new Date(`${dateKey}T00:00:00`)

  return !Number.isNaN(date.getTime()) && isBusinessDay(date)
}

function getMondayBasedDayIndex(date) {
  return (date.getDay() + 6) % 7
}

export function buildMonthGrid(monthDate) {
  const year = monthDate.getFullYear()
  const month = monthDate.getMonth()
  const firstDay = new Date(year, month, 1)
  const startDate = new Date(firstDay)
  startDate.setDate(firstDay.getDate() - getMondayBasedDayIndex(firstDay))

  const weeks = Array.from({ length: 6 }, (_, weekIndex) =>
    Array.from({ length: 5 }, (_, dayIndex) => {
      const date = new Date(startDate)
      date.setDate(startDate.getDate() + (weekIndex * 7) + dayIndex)

      return {
        date,
        dateKey: toDateKey(date),
        dayNumber: date.getDate(),
        isBusinessDay: true,
        isCurrentMonth: date.getMonth() === month,
      }
    }),
  )

  return weeks.flat()
}

export function groupItemsByDate(items) {
  return items.reduce((groups, item) => {
    const currentItems = groups.get(item.dueDate) ?? []
    currentItems.push(item)
    groups.set(item.dueDate, currentItems)

    return groups
  }, new Map())
}

export function isSameMonth(dateKey, monthDate) {
  if (!dateKey) return false

  const date = new Date(`${dateKey}T00:00:00`)

  if (Number.isNaN(date.getTime())) return false

  return date.getFullYear() === monthDate.getFullYear() && date.getMonth() === monthDate.getMonth()
}
```

<a id="fuente-S051"></a>

#### S051 — capaVista/src/modules/productionCalendar/utils/calendarOrder.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** getCalendarOrderStatus; normalización de estado. **Filtros relacionados:** CAL-F01–CAL-F03; CAL-N01–CAL-N04.

**Exportaciones declaradas** (línea inicial): 3: export function getCalendarOrderStatus(order) {; 11: export function getCalendarOrderQuantity(items) {.

**Relaciones/imports originales:** <code>../config/productionCalendar.config.js</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 21 líneas originales; incluidos 1–21; cobertura completa. Huella SHA-256 inicial del archivo: 2AEE5560987A5DB7AE696D2F0C734EB28CC94D733C1066176C81909594895D24.

**S051: capaVista/src/modules/productionCalendar/utils/calendarOrder.js, líneas 1–21.** Componente/función o selectores: getCalendarOrderStatus; normalización de estado. Filtros: CAL-F01–CAL-F03; CAL-N01–CAL-N04. Fragmento literal:

```javascript
import { PRODUCTION_STATUS_BY_STEP, PRODUCTION_STATUSES } from '../config/productionCalendar.config.js'

export function getCalendarOrderStatus(order) {
  if (typeof order?.orderStatus === 'string' && order.orderStatus.trim()) {
    return order.orderStatus.trim()
  }

  return PRODUCTION_STATUS_BY_STEP[Number(order?.generalStepId)] ?? PRODUCTION_STATUSES.PAYMENT_CONFIRMATION
}

export function getCalendarOrderQuantity(items) {
  const quantities = (Array.isArray(items) ? items : [])
    .map((item) => item?.quantity)
    .filter((quantity) => quantity !== null && quantity !== undefined && quantity !== '')
    .map(Number)
    .filter(Number.isFinite)

  return quantities.length > 0
    ? quantities.reduce((total, quantity) => total + quantity, 0)
    : null
}
```

<a id="fuente-S052"></a>

#### S052 — capaVista/src/modules/productionCalendar/components/ProductionCalendarGrid.jsx

**Tipo:** JSX/React. **Responsabilidad, componentes y funciones:** ProductionCalendarGrid; scope de filtros frente a pendientes y bandeja. **Filtros relacionados:** CAL-F01–CAL-F03; CAL-N01–CAL-N04.

**Exportaciones declaradas** (línea inicial): 14: export default function ProductionCalendarGrid({.

**Relaciones/imports originales:** <code>./CalendarOrderTrays.jsx</code>, <code>./CalendarDayCell.jsx</code>, <code>./DayOrdersModal.jsx</code>, <code>./CalendarOrderDetailModal.jsx</code>, <code>./DeliveryChangeModals.jsx</code>, <code>react</code>, <code>../utils/calendarUtils</code>, <code>../../../hooks/useAuth</code>, <code>../../../config/permissions</code>, <code>./ProductionCalendarGrid.module.css</code>, <code>../../../shared/components/loading/LoadingIndicator</code>, <code>../../../shared/notifications/useToast</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 225 líneas originales; incluidos 1–63, 143–225. Fuera de extracción: 64–142; corresponden al contexto restante del archivo y no se sustituyen por código inventado. Huella SHA-256 inicial del archivo: C271D527F58C520BD462736BD355D60D0BFA64C7DAC613B23B67FA96281223F2.

**S052: capaVista/src/modules/productionCalendar/components/ProductionCalendarGrid.jsx, líneas 1–63.** Componente/función o selectores: ProductionCalendarGrid; scope de filtros frente a pendientes y bandeja. Filtros: CAL-F01–CAL-F03; CAL-N01–CAL-N04. Fragmento literal:

```jsx
import { TransferOrdersTray, PendingOrdersTray } from './CalendarOrderTrays.jsx';
import { CalendarDayCell } from './CalendarDayCell.jsx';
import { DayOrdersModal } from './DayOrdersModal.jsx';
import { OrderDetailModal } from './CalendarOrderDetailModal.jsx';
import { DeliveryChangeConfirmModal, DeliveryChangeCredentialsModal } from './DeliveryChangeModals.jsx';
import { useEffect, useRef, useState, useMemo } from 'react';
import { buildMonthGrid, isBusinessDateKey, isSameMonth, groupItemsByDate, WEEK_DAYS } from '../utils/calendarUtils';
import { useAuth } from '../../../hooks/useAuth';
import { PERMISSIONS } from '../../../config/permissions';
import styles from './ProductionCalendarGrid.module.css';
import LoadingIndicator from '../../../shared/components/loading/LoadingIndicator'
import { useToast } from '../../../shared/notifications/useToast'

export default function ProductionCalendarGrid({
  isLoading = false,
  allItems,
  getOrderDetail,
  draggedItemId,
  items,
  monthDate,
  onChangeDeliveryDate,
  onDragEnd,
  onDragStart,
  toolbar,
}) {
  const notify = useToast()
  const [selectedDayKey, setSelectedDayKey] = useState(null)
  const [selectedDetailOrder, setSelectedDetailOrder] = useState(null)
  const [detailError, setDetailError] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const detailRequest = useRef(0)
  const active = useRef(false)
  useEffect(() => {
    active.current = true
    const requests = detailRequest
    return () => { active.current = false; requests.current++ }
  }, [])
  const [pendingChange, setPendingChange] = useState(null)
  const [isCredentialStepOpen, setIsCredentialStepOpen] = useState(false)
  const [dropTargetDate, setDropTargetDate] = useState(null)
  const [transferItems, setTransferItems] = useState([])
  const days = buildMonthGrid(monthDate)
  const sourceItems = Array.isArray(allItems) ? allItems : items
  const transferItemIdSet = useMemo(
    () => new Set(transferItems.map((item) => String(item.id))),
    [transferItems],
  )
  const visibleItems = useMemo(
    () => items.filter((item) => !transferItemIdSet.has(String(item.id))),
    [items, transferItemIdSet],
  )
  const scheduledMonthItems = useMemo(
    () => visibleItems.filter((item) => isBusinessDateKey(item.dueDate) && isSameMonth(item.dueDate, monthDate)),
    [visibleItems, monthDate],
  )
  const pendingItems = useMemo(
    () => sourceItems.filter((item) => !transferItemIdSet.has(String(item.id)) && !isBusinessDateKey(item.dueDate)),
    [sourceItems, transferItemIdSet],
  )
  const itemsByDate = useMemo(() => groupItemsByDate(scheduledMonthItems), [scheduledMonthItems])
  const selectedDayItems = selectedDayKey ? (itemsByDate.get(selectedDayKey) ?? []) : []

  const { hasPermission } = useAuth()
```

**S052: capaVista/src/modules/productionCalendar/components/ProductionCalendarGrid.jsx, líneas 143–225.** Componente/función o selectores: ProductionCalendarGrid; scope de filtros frente a pendientes y bandeja. Filtros: CAL-F01–CAL-F03; CAL-N01–CAL-N04. Fragmento literal:

```jsx
  return (
    <>
      <div className={styles.calendarGridStack} aria-busy={isLoading}>
        {!isLoading && <TransferOrdersTray
          draggedItemId={draggedItemId}
          items={transferItems}
          onDragEnd={handleDragEnd}
          onDragStart={onDragStart}
          onDropTransferItem={handleDropTransferItem}
          onOpenDetail={openDetail}
        />}

          <div className={styles.calendarLayout}>
            <section className={styles.calendarShell} aria-label="Calendario mensual de produccion">
            {toolbar && <div className={styles.calendarToolbarSlot}>{toolbar}</div>}
            <div className={styles.calendarScroll}>
            {isLoading ? <LoadingIndicator context="Calendario de producción" /> :
            <div className={styles.businessCalendar}>
              <div className={styles.weekHeader}>
                {WEEK_DAYS.map((day) => (
                  <span key={day}>{day}</span>
                ))}
              </div>

              <div className={styles.monthGrid}>
                {days.map((day) => (
                  <CalendarDayCell
                    day={day}
                    draggedItemId={draggedItemId}
                    dropTargetDate={dropTargetDate}
                    items={itemsByDate.get(day.dateKey) ?? []}
                    key={day.dateKey}
                    onDragEnd={handleDragEnd}
                    onDragStart={onDragStart}
                    onDropItem={handleDropItem}
                    onOpenDay={setSelectedDayKey}
                    onOpenDetail={openDetail}
                    onSetDropTarget={setDropTargetDate}
                  />
                ))}
              </div>
            </div>}
            </div>
            </section>

            {!isLoading && <PendingOrdersTray
              draggedItemId={draggedItemId}
              items={pendingItems}
              onDragEnd={handleDragEnd}
              onDragStart={onDragStart}
              onOpenDetail={openDetail}
            />}
          </div>
      </div>

      <DayOrdersModal
        dateKey={selectedDayKey}
        draggedItemId={draggedItemId}
        items={selectedDayItems}
        onClose={() => setSelectedDayKey(null)}
        onDragEnd={handleDragEnd}
        onDragStart={onDragStart}
        onOpenDetail={openDetail}
      />
      <OrderDetailModal
        order={selectedDetailOrder}
        isLoading={detailLoading}
        error={detailError}
        onClose={() => { detailRequest.current++; setSelectedDetailOrder(null); setDetailLoading(false) }}
      />
      <DeliveryChangeConfirmModal
        change={!isCredentialStepOpen ? pendingChange : null}
        onCancel={closeDeliveryChangeFlow}
        onConfirm={() => setIsCredentialStepOpen(true)}
      />
      <DeliveryChangeCredentialsModal
        change={isCredentialStepOpen ? pendingChange : null}
        onCancel={closeDeliveryChangeFlow}
        onConfirm={confirmCredentials}
      />
    </>
  )
}
```

<a id="fuente-S053"></a>

#### S053 — capaVista/src/modules/productionCalendar/components/CalendarDayCell.jsx

**Tipo:** JSX/React. **Responsabilidad, componentes y funciones:** CalendarDayCell; navegación de desglose por día. **Filtros relacionados:** CAL-F01–CAL-F03; CAL-N01–CAL-N04.

**Exportaciones declaradas** (línea inicial): 4: export const MAX_VISIBLE_EVENTS = 1; 6: export function CalendarDayCell({.

**Relaciones/imports originales:** <code>./CalendarEvent.jsx</code>, <code>./ProductionCalendarGrid.module.css</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 71 líneas originales; incluidos 1–71; cobertura completa. Huella SHA-256 inicial del archivo: BE6664896708AB7B7A9933436E12316DAC25A583D64884B7C26C89E8C52EE1B4.

**S053: capaVista/src/modules/productionCalendar/components/CalendarDayCell.jsx, líneas 1–71.** Componente/función o selectores: CalendarDayCell; navegación de desglose por día. Filtros: CAL-F01–CAL-F03; CAL-N01–CAL-N04. Fragmento literal:

```jsx
import { CalendarEvent } from './CalendarEvent.jsx';
import styles from './ProductionCalendarGrid.module.css';

export const MAX_VISIBLE_EVENTS = 1

export function CalendarDayCell({
  day,
  draggedItemId,
  dropTargetDate,
  items,
  onDragEnd,
  onDragStart,
  onDropItem,
  onOpenDay,
  onOpenDetail,
  onSetDropTarget,
}) {
  const visibleItems = items.slice(0, MAX_VISIBLE_EVENTS)
  const hiddenItemsCount = items.length - visibleItems.length
  const isDropTarget = dropTargetDate === day.dateKey
  const canScheduleProduction = day.isCurrentMonth

  return (
    <article
      className={[
        styles.dayCell,
        day.isCurrentMonth ? '' : styles.outsideMonth,
        !day.isBusinessDay ? styles.nonBusinessDay : '',
        isDropTarget ? styles.dropTarget : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onDragEnter={(event) => {
        if (!canScheduleProduction) return
        event.preventDefault()
        onSetDropTarget(day.dateKey)
      }}
      onDragOver={(event) => {
        if (!canScheduleProduction) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        onSetDropTarget(day.dateKey)
      }}
      onDrop={(event) => {
        if (!canScheduleProduction) return
        event.preventDefault()
        const itemId = event.dataTransfer.getData('text/plain')
        onDropItem(itemId, day.dateKey)
      }}
    >
      <span className={styles.dayNumber}>{day.dayNumber}</span>
      <div className={styles.eventsList}>
        {visibleItems.map((item) => (
          <CalendarEvent
            isDragging={draggedItemId === item.id}
            item={item}
            key={item.id}
            onDragEnd={onDragEnd}
            onDragStart={onDragStart}
            onOpenDetail={onOpenDetail}
          />
        ))}
        {hiddenItemsCount > 0 && (
          <button className={styles.moreEventsButton} onClick={() => onOpenDay(day.dateKey)} type="button">
            +{hiddenItemsCount} pedidos mas
          </button>
        )}
      </div>
    </article>
  )
}
```

<a id="fuente-S054"></a>

#### S054 — capaVista/src/modules/productionCalendar/components/DayOrdersModal.jsx

**Tipo:** JSX/React. **Responsabilidad, componentes y funciones:** DayOrdersModal; subconjunto de pedidos por día sin filtros nuevos. **Filtros relacionados:** CAL-F01–CAL-F03; CAL-N01–CAL-N04.

**Exportaciones declaradas** (línea inicial): 6: export function DayOrdersModal({ dateKey, draggedItemId, items, onClose, onDragEnd, onDragStart, onOpenDetail }) {.

**Relaciones/imports originales:** <code>../utils/calendarPresentation.js</code>, <code>../../../hooks/useAuth</code>, <code>./ProductionCalendarGrid.module.css</code>, <code>../../../config/permissions</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 78 líneas originales; incluidos 1–78; cobertura completa. Huella SHA-256 inicial del archivo: B5D090DDDB7697618554F2743BEA6FD7B3904AF3E1682016C6BDB7A8998FAAB4.

**S054: capaVista/src/modules/productionCalendar/components/DayOrdersModal.jsx, líneas 1–78.** Componente/función o selectores: DayOrdersModal; subconjunto de pedidos por día sin filtros nuevos. Filtros: CAL-F01–CAL-F03; CAL-N01–CAL-N04. Fragmento literal:

```jsx
import { formatDayTitle, getOrderToneClass } from '../utils/calendarPresentation.js';
import { useAuth } from '../../../hooks/useAuth';
import styles from './ProductionCalendarGrid.module.css';
import { PERMISSIONS } from '../../../config/permissions';

export function DayOrdersModal({ dateKey, draggedItemId, items, onClose, onDragEnd, onDragStart, onOpenDetail }) {
  const { hasPermission } = useAuth()
  if (!dateKey) return null

  function handleModalItemDragStart(event, itemId) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', itemId)
    onDragStart(itemId)
    setTimeout(onClose, 0)
  }

  return (
    <div className={styles.modalLayer} onMouseDown={onClose} role="presentation">
      <section
        aria-labelledby="day-orders-modal-title"
        aria-modal="true"
        className={styles.modalCard}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className={styles.modalHeader}>
          <div>
            <span>Entregas del dia</span>
            <h2 id="day-orders-modal-title">{formatDayTitle(dateKey)}</h2>
          </div>
          <button aria-label="Cerrar modal" onClick={onClose} type="button">
            <i className="bi bi-x-lg" aria-hidden="true" />
          </button>
        </header>

        <div className={styles.modalBody}>
          {items.map((item) => (
            <article
              className={[
                styles.dayOrderRow,
                styles.draggableDayOrderRow,
                getOrderToneClass(item),
                draggedItemId === item.id ? styles.draggingEvent : '',
              ]
                .filter(Boolean)
                .join(' ')}
              draggable={hasPermission(PERMISSIONS.UPDATE_DELIVERY_DATE)}
              key={item.id}
              onDragEnd={onDragEnd}
              onDoubleClick={() => onOpenDetail(item)}
              onDragStart={(event) => handleModalItemDragStart(event, item.id)}
              title="Arrastrar para cambiar fecha de entrega"
            >
              <div>
                <strong>{item.orderNumber}</strong>
                <span>{item.clientName}</span>
              </div>
              <dl>
                <div>
                  <dt>Producto</dt>
                  <dd>{item.productType}</dd>
                </div>
                <div>
                  <dt>Cantidad</dt>
                  <dd>{item.quantity ?? 'No definida'}</dd>
                </div>
                <div>
                  <dt>Estado</dt>
                  <dd>{item.status}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
```


### 15.7. Mensajes

<a id="fuente-S055"></a>

#### S055 — capaVista/src/modules/messages/components/MessageFilters.jsx

**Tipo:** JSX/React. **Responsabilidad, componentes y funciones:** MessageFilters; lectura, orden y fechas. **Filtros relacionados:** MSG-F01–MSG-F03; MSG-O01.

**Exportaciones declaradas** (línea inicial): 14: export default function MessageFilters({ filters, onChange, onClear }) {.

**Relaciones/imports originales:** <code>./MessageFilters.module.css</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 75 líneas originales; incluidos 1–75; cobertura completa. Huella SHA-256 inicial del archivo: 8ADB257FC31D9413A1105304C249D1D72D7CEC1A8B72694026C066E1CFB014B3.

**S055: capaVista/src/modules/messages/components/MessageFilters.jsx, líneas 1–75.** Componente/función o selectores: MessageFilters; lectura, orden y fechas. Filtros: MSG-F01–MSG-F03; MSG-O01. Fragmento literal:

```jsx
import styles from './MessageFilters.module.css'

const STATUS_FILTERS = [
  { value: 'all', label: 'Todos', icon: 'bi-inbox' },
  { value: 'unread', label: 'No leídos', icon: 'bi-envelope' },
  { value: 'read', label: 'Leídos', icon: 'bi-envelope-open' },
]

const SORT_FILTERS = [
  { value: 'latest', label: 'Últimos', icon: 'bi-sort-down' },
  { value: 'oldest', label: 'Más antiguos', icon: 'bi-sort-up' },
]

export default function MessageFilters({ filters, onChange, onClear }) {
  function update(name, value) {
    onChange({ ...filters, [name]: value })
  }

  return (
    <section aria-label="Filtros de mensajes" className={styles.panel}>
      <div className={styles.quickFilters}>
        <div className={styles.filterGroup}>
          <span className={styles.groupLabel}>Estado</span>
          <div className={styles.chips}>
            {STATUS_FILTERS.map((filter) => (
              <button
                aria-pressed={filters.status === filter.value}
                className={`${styles.chip} ${filters.status === filter.value ? styles.activeChip : ''}`}
                key={filter.value}
                onClick={() => update('status', filter.value)}
                type="button"
              >
                <i className={`bi ${filter.icon}`} aria-hidden="true" />
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.filterGroup}>
          <span className={styles.groupLabel}>Orden</span>
          <div className={styles.chips}>
            {SORT_FILTERS.map((filter) => (
              <button
                aria-pressed={filters.sort === filter.value}
                className={`${styles.chip} ${filters.sort === filter.value ? styles.activeChip : ''}`}
                key={filter.value}
                onClick={() => update('sort', filter.value)}
                type="button"
              >
                <i className={`bi ${filter.icon}`} aria-hidden="true" />
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.dateFilters}>
        <label>
          <span>Desde</span>
          <input max={filters.to || undefined} onChange={(event) => update('from', event.target.value)} type="date" value={filters.from} />
        </label>
        <label>
          <span>Hasta</span>
          <input min={filters.from || undefined} onChange={(event) => update('to', event.target.value)} type="date" value={filters.to} />
        </label>
        <button className={styles.clearFilters} onClick={onClear} type="button">
          <i className="bi bi-arrow-counterclockwise" aria-hidden="true" />
          Restablecer
        </button>
      </div>
    </section>
  )
}
```

<a id="fuente-S056"></a>

#### S056 — capaVista/src/modules/messages/components/MessageFilters.module.css

**Tipo:** CSS propio. **Responsabilidad, componentes y funciones:** CSS completo de filtros de mensajes. **Filtros relacionados:** MSG-F01–MSG-F03; MSG-O01.

**Cobertura:** 16 líneas originales; incluidos 1–16; cobertura completa. Huella SHA-256 inicial del archivo: D9398EE57380608DC07609C8878CA64DEE9532D1035E1723A0542FEBFCD760FC.

**S056: capaVista/src/modules/messages/components/MessageFilters.module.css, líneas 1–16.** Componente/función o selectores: CSS completo de filtros de mensajes. Filtros: MSG-F01–MSG-F03; MSG-O01. Fragmento literal:

```css
.panel { align-items: flex-end; background: #fff; border: 1px solid #e5e7eb; border-radius: 1rem; box-shadow: var(--itexsa-shadow); display: flex; gap: 1.25rem; justify-content: space-between; padding: 1rem; }
.quickFilters { display: flex; flex-wrap: wrap; gap: 1rem; }
.filterGroup { display: grid; gap: .45rem; }
.groupLabel, .dateFilters label span { color: #64748b; font-size: .7rem; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
.chips { display: flex; flex-wrap: wrap; gap: .4rem; }
.chip { align-items: center; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 999px; color: #475569; display: inline-flex; font-size: .8rem; font-weight: 700; gap: .38rem; min-height: 2.35rem; padding: .45rem .78rem; transition: .15s ease; }
.chip:hover { border-color: rgba(var(--itexsa-orange-rgb),.5); color: #c2410c; }
.activeChip { background: #fff1e7; border-color: rgba(var(--itexsa-orange-rgb),.55); color: #c2410c; }
.dateFilters { align-items: flex-end; display: flex; flex-wrap: wrap; gap: .65rem; }
.dateFilters label { display: grid; gap: .4rem; }
.dateFilters input { background: #fff; border: 1px solid #dbe3ed; border-radius: .65rem; color: #334155; min-height: 2.4rem; padding: .35rem .65rem; }
.dateFilters input:focus { border-color: var(--itexsa-orange); box-shadow: 0 0 0 3px rgba(var(--itexsa-orange-rgb),.12); outline: 0; }
.clearFilters { align-items: center; background: transparent; border: 0; color: #64748b; display: inline-flex; font-size: .78rem; font-weight: 700; gap: .35rem; min-height: 2.4rem; }
.clearFilters:hover { color: #c2410c; }
@media (max-width: 1199.98px) { .panel { align-items: stretch; flex-direction: column; } }
@media (max-width: 575.98px) { .dateFilters label { flex: 1 1 8rem; } .dateFilters input { width: 100%; } .chip { flex: 1 1 auto; justify-content: center; } }
```

<a id="fuente-S057"></a>

#### S057 — capaVista/src/modules/messages/pages/MessageInboxPage.jsx

**Tipo:** JSX/React. **Responsabilidad, componentes y funciones:** InboxSession; parámetros, petición, errores y páginas. **Filtros relacionados:** MSG-F01–MSG-F03; MSG-O01.

**Exportaciones declaradas** (línea inicial): 21: export default function MessageInboxPage() {.

**Relaciones/imports originales:** <code>react</code>, <code>react-router-dom</code>, <code>../../../config/routes</code>, <code>../../../services/api/apiClient</code>, <code>../components/MessageFilters</code>, <code>../components/MessageList</code>, <code>../hooks/useMessagesApi</code>, <code>./MessageInboxPage.module.css</code>, <code>../../../shared/components/layout/PageShell</code>, <code>../../../shared/components/layout/PageHeader</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 121 líneas originales; incluidos 1–121; cobertura completa. Huella SHA-256 inicial del archivo: 51ACDB075C69249346015B1B6D45B0BFE876F62F3DE97879B5DEEDEFE49BCEEB.

**S057: capaVista/src/modules/messages/pages/MessageInboxPage.jsx, líneas 1–121.** Componente/función o selectores: InboxSession; parámetros, petición, errores y páginas. Filtros: MSG-F01–MSG-F03; MSG-O01. Fragmento literal:

```jsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { APP_ROUTES } from '../../../config/routes'
import { API_ERROR_CODES } from '../../../services/api/apiClient'
import MessageFilters from '../components/MessageFilters'
import MessageList from '../components/MessageList'
import { useMessagesApi } from '../hooks/useMessagesApi'
import styles from './MessageInboxPage.module.css'
import PageShell from '../../../shared/components/layout/PageShell'
import PageHeader from '../../../shared/components/layout/PageHeader'

const DEFAULT_FILTERS = Object.freeze({ status: 'all', sort: 'latest', from: '', to: '' })
const PAGE_SIZE = 12

function errorText(error) {
  if (error?.code === API_ERROR_CODES.NETWORK_ERROR) return 'No fue posible conectar con el servidor.'
  if (error?.status === 401) return 'Tu sesión expiró. Inicia sesión nuevamente.'
  return error?.payload?.message ?? 'No fue posible cargar la bandeja de entrada.'
}

export default function MessageInboxPage() {
  const api = useMessagesApi()
  return <InboxSession key={api.scopeId} api={api} />
}

function InboxSession({ api }) {
  const navigate = useNavigate()
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [page, setPage] = useState(1)
  const [result, setResult] = useState({ messages: [], total: 0, totalPages: 0 })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const requestId = useRef(0)
  const controller = useRef(null)
  const openingRef = useRef(false)
  const [openingId, setOpeningId] = useState(null)

  const loadInbox = useCallback(async () => {
    controller.current?.abort()
    const read = new AbortController()
    controller.current = read
    const id = ++requestId.current
    setIsLoading(true)
    setError('')

    try {
      const response = await api.getInbox({ ...filters, page, perPage: PAGE_SIZE }, { signal: read.signal })
      if (read.signal.aborted || id !== requestId.current) return
      setResult({
        messages: response.messages ?? [],
        total: response.total ?? 0,
        totalPages: response.totalPages ?? 0,
      })
    } catch (requestError) {
      if (read.signal.aborted || id !== requestId.current) return
      setResult({ messages: [], total: 0, totalPages: 0 })
      setError(errorText(requestError))
    } finally {
      if (id === requestId.current) setIsLoading(false)
    }
  }, [api, filters, page])

  useEffect(() => {
    const requests = requestId
    const requestTimer = window.setTimeout(() => loadInbox(), 0)
    return () => { window.clearTimeout(requestTimer); requests.current++; controller.current?.abort() }
  }, [loadInbox])

  function handleFiltersChange(nextFilters) {
    setFilters(nextFilters)
    setPage(1)
  }

  function handleOpen(message) {
    if (openingRef.current) return
    openingRef.current = true
    setOpeningId(message.id_mensaje)
    navigate(APP_ROUTES.MESSAGE_DETAIL.replace(':messageId', message.id_mensaje))
  }

  return (
    <PageShell maxWidth="78rem" aria-labelledby="message-inbox-title">
      <section className={styles.shell}>
        <PageHeader title="Bandeja de entrada" titleId="message-inbox-title" actions={
          <div className={styles.totalCard} aria-label={`${result.total} mensajes encontrados`}>
            <i className="bi bi-envelope-paper" aria-hidden="true" />
            <span><strong>{result.total}</strong> mensajes</span>
          </div>
        } />

        <MessageFilters
          filters={filters}
          onChange={handleFiltersChange}
          onClear={() => handleFiltersChange({ ...DEFAULT_FILTERS })}
        />

        {error && (
          <div className={styles.error} role="alert">
            <i className="bi bi-exclamation-triangle" aria-hidden="true" />
            <span>{error}</span>
            <button onClick={loadInbox} type="button">Reintentar</button>
          </div>
        )}

        {!error && <MessageList isLoading={isLoading} messages={result.messages} onOpen={handleOpen} openingId={openingId} />}

        {!isLoading && !error && result.totalPages > 1 && (
          <nav aria-label="Paginación de mensajes" className={styles.pagination}>
            <button disabled={page === 1} onClick={() => setPage((current) => current - 1)} type="button">
              <i className="bi bi-chevron-left" aria-hidden="true" /> Anterior
            </button>
            <span>Página <strong>{page}</strong> de {result.totalPages}</span>
            <button disabled={page >= result.totalPages} onClick={() => setPage((current) => current + 1)} type="button">
              Siguiente <i className="bi bi-chevron-right" aria-hidden="true" />
            </button>
          </nav>
        )}
      </section>
    </PageShell>
  )
}
```

<a id="fuente-S058"></a>

#### S058 — capaVista/src/modules/messages/pages/MessageInboxPage.module.css

**Tipo:** CSS propio. **Responsabilidad, componentes y funciones:** Marco, errores, total y paginación responsive. **Filtros relacionados:** MSG-F01–MSG-F03; MSG-O01.

**Cobertura:** 15 líneas originales; incluidos 1–15; cobertura completa. Huella SHA-256 inicial del archivo: CB29776628EF82F9A34A42A90A761112D3FC067FE4A4B3430E6DF1CD618BB14D.

**S058: capaVista/src/modules/messages/pages/MessageInboxPage.module.css, líneas 1–15.** Componente/función o selectores: Marco, errores, total y paginación responsive. Filtros: MSG-F01–MSG-F03; MSG-O01. Fragmento literal:

```css
.shell > [data-page-header-container] { margin-bottom: 1.25rem; }
.totalCard { align-items: center; background: #111; border: 1px solid #27272a; border-radius: 1rem; box-shadow: 0 16px 32px rgba(15,23,42,.13); color: #fff; display: flex; gap: .75rem; min-width: 10rem; padding: .9rem 1rem; }
.totalCard i { color: var(--page-brand-orange); font-size: 1.35rem; }
.totalCard span { color: #cbd5e1; display: grid; font-size: .72rem; }
.totalCard strong { color: #fff; font-size: 1.25rem; line-height: 1; }
.shell > :global(section) { margin-bottom: 1rem; }
.error { align-items: center; background: #fff1f2; border: 1px solid #fecdd3; border-radius: .85rem; color: #9f1239; display: flex; gap: .65rem; margin: 1rem 0; padding: .85rem 1rem; }
.error span { flex: 1; }
.error button { background: transparent; border: 0; color: #9f1239; font-weight: 800; text-decoration: underline; }
.pagination { align-items: center; display: flex; gap: 1rem; justify-content: center; margin-top: 1.25rem; }
.pagination button { align-items: center; background: #fff; border: 1px solid #dbe3ed; border-radius: .65rem; color: #334155; display: inline-flex; font-size: .8rem; font-weight: 750; gap: .35rem; padding: .55rem .8rem; }
.pagination button:hover:not(:disabled) { border-color: var(--itexsa-orange); color: #c2410c; }
.pagination button:disabled { cursor: not-allowed; opacity: .45; }
.pagination span { color: #64748b; font-size: .8rem; }
@media (max-width: 575.98px) { .totalCard { width: 100%; } .pagination { gap: .5rem; } .pagination button { font-size: 0; } .pagination button i { font-size: .9rem; } }
```

<a id="fuente-S059"></a>

#### S059 — capaVista/src/modules/messages/api/messagesApi.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** createMessagesApi; consultas de bandeja y acciones diferenciadas. **Filtros relacionados:** MSG-F01–MSG-F03; MSG-O01.

**Exportaciones declaradas** (línea inicial): 15: export function createMessagesApi(apiClient) {.

**Cobertura:** 28 líneas originales; incluidos 1–28; cobertura completa. Huella SHA-256 inicial del archivo: 5C6DA9BDCC48AC62877BC1DE7F30BBB344CAE41D744EF09D0867946E3C607CF6.

**S059: capaVista/src/modules/messages/api/messagesApi.js, líneas 1–28.** Componente/función o selectores: createMessagesApi; consultas de bandeja y acciones diferenciadas. Filtros: MSG-F01–MSG-F03; MSG-O01. Fragmento literal:

```javascript
function toQueryString(params = {}) {
  const query = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value))
    }
  })

  const serialized = query.toString()
  return serialized ? `?${serialized}` : ''
}

let nextScope = 0
export function createMessagesApi(apiClient) {
  return {
    scopeId: ++nextScope,
    getInbox: (params, options = {}) => apiClient.get(`/messages${toQueryString(params)}`, options),
    getMessage: (messageId, options = {}) => apiClient.get(`/messages/${messageId}`, options),
    openMessage: (messageId) => apiClient.post(`/messages/${messageId}/open`, {}),
    getNotifications: (limit = 10, { signal, revision, compact = false } = {}) =>
      apiClient.get(`/messages/notifications${toQueryString({ limit, ...(compact ? { view: 'bell', revision } : {}) })}`, { signal }),
    markAsRead: (messageId) => apiClient.patch(`/messages/${messageId}/read`, {}),
    hideNotification: (messageId) =>
      apiClient.patch(`/messages/notifications/${messageId}`),
    clearNotifications: () => apiClient.patch('/messages/notifications'),
  }
}
```

<a id="fuente-S060"></a>

#### S060 — capaVista/src/modules/messages/hooks/useMessagesApi.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** useMessagesApi; scope de cuenta. **Filtros relacionados:** MSG-F01–MSG-F03; MSG-O01.

**Exportaciones declaradas** (línea inicial): 5: export function useMessagesApi() {.

**Relaciones/imports originales:** <code>react</code>, <code>../../../hooks/useApiClient.js</code>, <code>../api/messagesApi</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 8 líneas originales; incluidos 1–8; cobertura completa. Huella SHA-256 inicial del archivo: 62DBE6963D32605B87FD806FEB0524CC41488E25DF1B53C6E32BC2388B489B68.

**S060: capaVista/src/modules/messages/hooks/useMessagesApi.js, líneas 1–8.** Componente/función o selectores: useMessagesApi; scope de cuenta. Filtros: MSG-F01–MSG-F03; MSG-O01. Fragmento literal:

```javascript
import { useMemo } from 'react'
import { useApiClient } from '../../../hooks/useApiClient.js'
import { createMessagesApi } from '../api/messagesApi'

export function useMessagesApi() {
  const client = useApiClient()
  return useMemo(() => createMessagesApi(client), [client])
}
```

<a id="fuente-S061"></a>

#### S061 — capaVista/src/modules/messages/components/MessageList.jsx

**Tipo:** JSX/React. **Responsabilidad, componentes y funciones:** MessageList; resultado, lectura individual y estado vacío. **Filtros relacionados:** MSG-F01–MSG-F03; MSG-O01.

**Exportaciones declaradas** (línea inicial): 5: export default function MessageList({ isLoading, messages, onOpen, openingId }) {.

**Relaciones/imports originales:** <code>../../../shared/components/loading/LoadingIndicator</code>, <code>../utils/messageFormatters</code>, <code>./MessageList.module.css</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 46 líneas originales; incluidos 1–46; cobertura completa. Huella SHA-256 inicial del archivo: EC61844240A26AC81FA1CDC7B71D17F71EBC7691B2961C164C91AD1AE99425A0.

**S061: capaVista/src/modules/messages/components/MessageList.jsx, líneas 1–46.** Componente/función o selectores: MessageList; resultado, lectura individual y estado vacío. Filtros: MSG-F01–MSG-F03; MSG-O01. Fragmento literal:

```jsx
import LoadingIndicator from '../../../shared/components/loading/LoadingIndicator'
import { formatMessageDate, messagePreview } from '../utils/messageFormatters'
import styles from './MessageList.module.css'

export default function MessageList({ isLoading, messages, onOpen, openingId }) {
  if (isLoading) {
    return (
      <LoadingIndicator context="Mensajes" />
    )
  }

  if (messages.length === 0) {
    return (
      <div className={styles.emptyState}>
        <span className={styles.emptyIcon}><i className="bi bi-inbox" aria-hidden="true" /></span>
        <h2>¡Vaya!</h2>
        <p>No tienes mensajes nuevos.</p>
      </div>
    )
  }

  return (
    <div className={styles.list}>
      {messages.map((message) => (
        <button className={`${styles.item} ${!message.leido ? styles.unread : ''}`} key={message.id_mensaje} onClick={() => onOpen(message)} type="button" disabled={openingId != null} aria-busy={openingId === message.id_mensaje}>
          {openingId === message.id_mensaje && <LoadingIndicator scope="action" context="Abrir mensaje" />}
          <span className={styles.statusIcon}>
            <i className={`bi ${message.leido ? 'bi-envelope-open' : 'bi-envelope-fill'}`} aria-hidden="true" />
          </span>
          <span className={styles.copy}>
            <span className={styles.titleLine}>
              <strong>{message.Asunto}</strong>
              {!message.leido && <span className={styles.unreadPill}>Nuevo</span>}
            </span>
            <span className={styles.preview}>{messagePreview(message.contenido, 150)}</span>
            <span className={styles.metadata}>
              {message.id_pedido && <span><i className="bi bi-box-seam" aria-hidden="true" /> Pedido #{message.id_pedido}</span>}
              <span><i className="bi bi-clock" aria-hidden="true" /> {formatMessageDate(message.fecha_publicacion)}</span>
            </span>
          </span>
          <i className={`bi bi-chevron-right ${styles.chevron}`} aria-hidden="true" />
        </button>
      ))}
    </div>
  )
}
```

<a id="fuente-S062"></a>

#### S062 — capaVista/src/modules/messages/pages/MessageDetailPage.jsx

**Tipo:** JSX/React. **Responsabilidad, componentes y funciones:** MessageDetailPage; navegación que marca lectura, excluida de inspección activa. **Filtros relacionados:** MSG-F01–MSG-F03; MSG-O01.

**Exportaciones declaradas** (línea inicial): 11: export default function MessageDetailPage() {.

**Relaciones/imports originales:** <code>../../../shared/components/loading/LoadingIndicator</code>, <code>react</code>, <code>react-router-dom</code>, <code>../../../config/routes</code>, <code>../hooks/useMessagesApi</code>, <code>../utils/messageFormatters</code>, <code>./MessageDetailPage.module.css</code>, <code>../../../shared/components/layout/PageShell</code>, <code>../../../shared/components/layout/PageHeader</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 98 líneas originales; incluidos 1–61. Fuera de extracción: 62–98; corresponden al contexto restante del archivo y no se sustituyen por código inventado. Huella SHA-256 inicial del archivo: 3EDF5AE4CD788422A68F7466F2AF7B8D75001409E11727236824196EB1CA0E9D.

**S062: capaVista/src/modules/messages/pages/MessageDetailPage.jsx, líneas 1–61.** Componente/función o selectores: MessageDetailPage; navegación que marca lectura, excluida de inspección activa. Filtros: MSG-F01–MSG-F03; MSG-O01. Fragmento literal:

```jsx
import LoadingIndicator from '../../../shared/components/loading/LoadingIndicator'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { APP_ROUTES } from '../../../config/routes'
import { useMessagesApi } from '../hooks/useMessagesApi'
import { formatMessageDate, notifyMessagesChanged } from '../utils/messageFormatters'
import styles from './MessageDetailPage.module.css'
import PageShell from '../../../shared/components/layout/PageShell'
import PageHeader from '../../../shared/components/layout/PageHeader'

export default function MessageDetailPage() {
  const { messageId } = useParams()
  const api = useMessagesApi()
  return <DetailSession key={api.scopeId + ":" + messageId} api={api} messageId={messageId} />
}

function DetailSession({ api, messageId }) {
  const [message, setMessage] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const requestId = useRef(0)

  const loadMessage = useCallback(async () => {
    const id = ++requestId.current
    setIsLoading(true)
    setError('')

    try {
      const result = await api.openMessage(messageId)
      if (id !== requestId.current) return
      if (Number(result?.message?.id_mensaje) !== Number(messageId)) throw new Error('Respuesta de mensaje no valida')
      const response = result.message
      if (result.markedAsRead) notifyMessagesChanged()

      if (id === requestId.current) setMessage(response)
    } catch (requestError) {
      if (id !== requestId.current) return
      setMessage(null)
      setError(requestError?.status === 404 ? 'El mensaje no existe o no te pertenece.' : 'No fue posible cargar el mensaje.')
    } finally {
      if (id === requestId.current) setIsLoading(false)
    }
  }, [api, messageId])

  useEffect(() => {
    const requests = requestId
    const requestTimer = window.setTimeout(() => loadMessage(), 0)
    return () => { window.clearTimeout(requestTimer); requests.current++ }
  }, [loadMessage])

  return (
    <PageShell maxWidth="56rem">
      <section className={styles.shell}>
        {!isLoading && message && <PageHeader title="Detalle del mensaje" />}
        <Link className={styles.backLink} to={APP_ROUTES.MESSAGES}>
          <i className="bi bi-arrow-left" aria-hidden="true" /> Volver a la bandeja
        </Link>

        {isLoading && <LoadingIndicator context="Detalle del mensaje" />}

        {!isLoading && error && (
```


### 15.8. Compartidos y arquitectura

<a id="fuente-S063"></a>

#### S063 — capaVista/package.json

**Tipo:** Configuración declarativa. **Responsabilidad, componentes y funciones:** Dependencias declaradas; no versiones instaladas certificadas. **Filtros relacionados:** Todos.

**Cobertura:** 42 líneas originales; incluidos 1–42; cobertura completa. Huella SHA-256 inicial del archivo: 070FDDD1CEBE47400AB042CE0BBD953FBBC8E85E58E64E41A34C6D1D540F08BB.

**S063: capaVista/package.json, líneas 1–42.** Componente/función o selectores: Dependencias declaradas; no versiones instaladas certificadas. Filtros: Todos. Fragmento literal:

```json
{
  "name": "capavista",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "dev": "vite",
    "prebuild": "node ../scripts/sync-loading-theme.mjs",
    "build": "vite build",
    "lint": "eslint .",
    "preview": "vite preview"
  },
  "dependencies": {
    "@dnd-kit/react": "^0.4.0",
    "bootstrap": "^5.3.8",
    "bootstrap-icons": "^1.13.1",
    "keycloak-js": "26.2.4",
    "react": "^19.2.6",
    "react-bootstrap": "^2.10.10",
    "react-dom": "^19.2.6",
    "react-router-dom": "^7.15.1"
  },
  "devDependencies": {
    "@eslint/js": "^10.0.1",
    "@testing-library/react": "^16.3.3",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.1",
    "eslint": "^10.3.0",
    "eslint-plugin-react-hooks": "^7.1.1",
    "eslint-plugin-react-refresh": "^0.5.2",
    "globals": "^17.6.0",
    "jsdom": "^29.1.1",
    "vite": "^8.0.12",
    "vitest": "^5.0.5"
  },
  "overrides": {
    "browserslist": "4.29.1",
    "baseline-browser-mapping": "2.11.26"
  }
}
```

<a id="fuente-S064"></a>

#### S064 — capaVista/src/main.jsx

**Tipo:** JSX/React. **Responsabilidad, componentes y funciones:** Orden de estilos globales y StrictMode. **Filtros relacionados:** Todos.

**Relaciones/imports originales:** <code>react</code>, <code>react-dom/client</code>, <code>react-router-dom</code>, <code>./app/App.jsx</code>, <code>bootstrap/dist/css/bootstrap.min.css</code>, <code>bootstrap-icons/font/bootstrap-icons.css</code>, <code>./styles/global.css</code>, <code>./styles/bootstrap-overrides.css</code>, <code>./styles/theme.css</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 17 líneas originales; incluidos 1–17; cobertura completa. Huella SHA-256 inicial del archivo: 8B44616A206B1D6AF5B9834C797B696EC31C3903AA2E38362571E9FE8AD909E8.

**S064: capaVista/src/main.jsx, líneas 1–17.** Componente/función o selectores: Orden de estilos globales y StrictMode. Filtros: Todos. Fragmento literal:

```jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap-icons/font/bootstrap-icons.css'
import './styles/global.css'
import './styles/bootstrap-overrides.css'
import './styles/theme.css'
import App from './app/App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
```

<a id="fuente-S065"></a>

#### S065 — capaVista/src/app/router.jsx

**Tipo:** JSX/React. **Responsabilidad, componentes y funciones:** Rutas y RoleGuard de los seis módulos. **Filtros relacionados:** Todos.

**Exportaciones declaradas** (línea inicial): 49: export default function AppRouter() {.

**Relaciones/imports originales:** <code>react</code>, <code>react-router-dom</code>, <code>../config/routes</code>, <code>../config/permissions</code>, <code>../config/navigationAccess</code>, <code>../hooks/useAuth</code>, <code>../modules/auth/pages/AccessDeniedPage</code>, <code>../modules/auth/pages/LoginRedirect</code>, <code>../shared/components/layout/AppLayout</code>, <code>../shared/components/navigation/ProtectedRoute</code>, <code>../shared/components/navigation/RoleGuard</code>, <code>../shared/components/navigation/ModuleLoadingState</code>, <code>./informationPageLoaders</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 125 líneas originales; incluidos 1–27, 43–109. Fuera de extracción: 28–42, 110–125; corresponden al contexto restante del archivo y no se sustituyen por código inventado. Huella SHA-256 inicial del archivo: C1D9B3ABB7FBAE71BDFCE0EA26536A3632321B17FC2495DD935597F76A30F05C.

**S065: capaVista/src/app/router.jsx, líneas 1–27.** Componente/función o selectores: Rutas y RoleGuard de los seis módulos. Filtros: Todos. Fragmento literal:

```jsx
import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { APP_ROUTES } from '../config/routes'
import { PERMISSIONS } from '../config/permissions'
import { resolvePostLoginPath } from '../config/navigationAccess'
import { useAuth } from '../hooks/useAuth'
import AccessDeniedPage from '../modules/auth/pages/AccessDeniedPage'
import LoginRedirect from '../modules/auth/pages/LoginRedirect'
import AppLayout from '../shared/components/layout/AppLayout'
import ProtectedRoute from '../shared/components/navigation/ProtectedRoute'
import RoleGuard from '../shared/components/navigation/RoleGuard'
import ModuleLoadingState from '../shared/components/navigation/ModuleLoadingState'
import { informationPageLoaders } from './informationPageLoaders'

const KanbanBoardPage = lazy(() => import('../modules/kanban/pages/KanbanBoardPage'))
const ProfilePage = lazy(informationPageLoaders[APP_ROUTES.PROFILE])
const PaymentConfirmationPage = lazy(() => import('../modules/payments/pages/PaymentConfirmationPage'))
const UserManagementPage = lazy(() => import('../modules/users/pages/UserManagementPage'))
const OrderCreatePage = lazy(() => import('../modules/orders/pages/OrderCreatePage'))
const PasswordResetPage = lazy(() => import('../modules/auth/pages/PasswordResetPage'))
const OrderHistoryPage = lazy(() => import('../modules/orderHistory/pages/OrderHistoryPage'))
const OrderHistoryDetailPage = lazy(() => import('../modules/orderHistory/pages/OrderHistoryDetailPage'))
const ProductionCalendarPage = lazy(() => import('../modules/productionCalendar/pages/ProductionCalendarPage'))
const MessageInboxPage = lazy(() => import('../modules/messages/pages/MessageInboxPage'))
const MessageDetailPage = lazy(() => import('../modules/messages/pages/MessageDetailPage'))
const MetricsPage = lazy(() => import('../modules/metrics/pages/MetricsPage'))
const DocumentsPage = lazy(informationPageLoaders[APP_ROUTES.DOCUMENTS])
```

**S065: capaVista/src/app/router.jsx, líneas 43–109.** Componente/función o selectores: Rutas y RoleGuard de los seis módulos. Filtros: Todos. Fragmento literal:

```jsx
function UsersEntry() {
  return <RoleGuard requiredPermission={PERMISSIONS.MANAGE_USERS_VISUALLY}>
    <UserManagementPage />
  </RoleGuard>
}

export default function AppRouter() {
  return (
    <Suspense fallback={<ModuleLoadingState />}>
      <Routes>
        <Route path={APP_ROUTES.LOGIN} element={<LoginRedirect />} />
        <Route path={APP_ROUTES.PASSWORD_RESET} element={<PasswordResetPage />} />
        <Route path={APP_ROUTES.ACCESS_DENIED} element={<AccessDeniedPage />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<AppLayout />}>
            <Route path="documentos" element={<DocumentsPage />} />
            <Route path="solicitudes" element={<DataRequestsPage />} />
            <Route path="reportar-incidente" element={<IncidentReportPage />} />
            <Route index element={<HomeRedirect />} />
            <Route
              path="kanban"
              element={
                <RoleGuard requiredPermission={PERMISSIONS.VIEW_KANBAN_MODULE}>
                  <KanbanBoardPage />
                </RoleGuard>
              }
            />
            <Route path="perfil" element={<RoleGuard requiredPermission={PERMISSIONS.READ_PROFILE}><ProfilePage /></RoleGuard>} />
            <Route path="mensajes" element={<RoleGuard requiredPermission={PERMISSIONS.READ_MESSAGES}><MessageInboxPage /></RoleGuard>} />
            <Route path="mensajes/:messageId" element={<RoleGuard requiredPermission={PERMISSIONS.READ_MESSAGES}><MessageDetailPage /></RoleGuard>} />
            <Route
              path="pagos"
              element={
                <RoleGuard requiredPermission={PERMISSIONS.VIEW_PAYMENTS_MODULE}>
                  <PaymentConfirmationPage />
                </RoleGuard>
              }
            />
            <Route
              path="ordenes/nuevo"
              element={
                <RoleGuard requiredPermission={PERMISSIONS.VIEW_ORDERS_MODULE}>
                  <OrderCreatePage />
                </RoleGuard>
              }
            />
            <Route path="historial-pedidos" element={<RoleGuard requiredPermission={PERMISSIONS.READ_ORDERS}><OrderHistoryPage /></RoleGuard>} />
            <Route path="historial-pedidos/:orderId" element={<RoleGuard requiredPermission={PERMISSIONS.READ_ORDERS}><OrderHistoryDetailPage /></RoleGuard>} />
            <Route
              path="calendario-produccion"
              element={
                <RoleGuard requiredPermission={PERMISSIONS.READ_CALENDAR}>
                  <ProductionCalendarPage />
                </RoleGuard>
              }
            />
            <Route path="admin" element={<Navigate replace to={APP_ROUTES.ADMIN_USERS} />} />
            <Route
              path="admin/usuarios"
              element={
                <UsersEntry />
              }
            />
            <Route path="admin/usuarios/nuevo" element={<Navigate replace to={APP_ROUTES.ADMIN_USERS} />} />
            <Route
              path="metricas"
```

<a id="fuente-S066"></a>

#### S066 — capaVista/src/config/routes.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** Rutas canónicas y navegación por permisos. **Filtros relacionados:** Todos.

**Exportaciones declaradas** (línea inicial): 3: export const APP_ROUTES = Object.freeze({; 24: export const HEADER_NAVIGATION_ROUTES = Object.freeze([; 42: export const MAIN_NAVIGATION_ROUTES = Object.freeze([.

**Relaciones/imports originales:** <code>./permissions</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 85 líneas originales; incluidos 1–85; cobertura completa. Huella SHA-256 inicial del archivo: 5BC95BE862BF9D3D7C11EBECF73E8F75E65955E5B8C4687496B23DFFF52F04A6.

**S066: capaVista/src/config/routes.js, líneas 1–85.** Componente/función o selectores: Rutas canónicas y navegación por permisos. Filtros: Todos. Fragmento literal:

```javascript
import { PERMISSIONS } from './permissions'

export const APP_ROUTES = Object.freeze({
  LOGIN: '/login',
  DOCUMENTS: '/documentos',
  DATA_REQUESTS: '/solicitudes',
  INCIDENT_REPORT: '/reportar-incidente',
  PASSWORD_RESET: '/recuperar-contrasena',
  ACCESS_DENIED: '/access-denied',
  KANBAN: '/kanban',
  PROFILE: '/perfil',
  PAYMENTS: '/pagos',
  ADMIN_USERS: '/admin/usuarios',
  ADMIN_USERS_CREATE: '/admin/usuarios/nuevo',
  ORDERS_CREATE: '/ordenes/nuevo',
  ORDER_HISTORY: '/historial-pedidos',
  ORDER_HISTORY_DETAIL: '/historial-pedidos/:orderId',
  PRODUCTION_CALENDAR: '/calendario-produccion',
  MESSAGES: '/mensajes',
  MESSAGE_DETAIL: '/mensajes/:messageId',
  METRICS: '/metricas',
})

export const HEADER_NAVIGATION_ROUTES = Object.freeze([
  {
    label: 'Bandeja de mensajes',
    path: APP_ROUTES.MESSAGES,
    permission: PERMISSIONS.READ_MESSAGES,
    icon: 'bi-envelope-paper',
    iconOnly: true,
    requirementIds: Object.freeze(['RF54', 'RF55', 'RF59', 'RF60']),
  },
  {
    label: 'Mi perfil',
    path: APP_ROUTES.PROFILE,
    permission: PERMISSIONS.READ_PROFILE,
    icon: 'bi-person-circle',
    requirementIds: Object.freeze(['UR 1.7']),
  },
])

export const MAIN_NAVIGATION_ROUTES = Object.freeze([
  {
    label: 'Principal/Kanban',
    path: APP_ROUTES.KANBAN,
    permission: PERMISSIONS.VIEW_KANBAN_MODULE,
    requirementIds: Object.freeze(['UR 5.1', 'UR 5.2']),
  },
  {
    label: 'Confirmar pago',
    path: APP_ROUTES.PAYMENTS,
    permission: PERMISSIONS.VIEW_PAYMENTS_MODULE,
    requirementIds: Object.freeze(['UR 3.1', 'UR 3.3', 'UR 3.7']),
  },
  {
    label: 'Gestion de usuarios',
    path: APP_ROUTES.ADMIN_USERS,
    permission: PERMISSIONS.MANAGE_USERS_VISUALLY,
    requirementIds: Object.freeze(['UR 1.4', 'UR 1.12', 'UR 1.13']),
  },
  {
    label: 'Registro de Orden',
    path: APP_ROUTES.ORDERS_CREATE,
    permission: PERMISSIONS.VIEW_ORDERS_MODULE,
    requirementIds: Object.freeze(['UR 19.1', 'UR 19.2', 'UR 19.3', 'UR 19.4', 'UR 19.5']),
  },
  {
    label: 'Historial de pedidos',
    path: APP_ROUTES.ORDER_HISTORY,
    permission: PERMISSIONS.READ_ORDERS,
    requirementIds: Object.freeze(['RF64', 'RF65', 'RF66', 'RF67', 'RF68']),
  },
  {
    label: 'Calendario',
    path: APP_ROUTES.PRODUCTION_CALENDAR,
    permission: PERMISSIONS.READ_CALENDAR,
    requirementIds: Object.freeze(['RF49']),
  },
  {
    label: 'Reportes y estadísticas',
    path: APP_ROUTES.METRICS,
    permission: PERMISSIONS.VIEW_METRICS,
    requirementIds: Object.freeze(['RF70', 'RF71']),
  }
])
```

<a id="fuente-S067"></a>

#### S067 — capaVista/src/config/permissions.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** Permisos visuales y comerciales. **Filtros relacionados:** Todos.

**Exportaciones declaradas** (línea inicial): 3: export const PERMISSIONS = Object.freeze({ ...P,.

**Relaciones/imports originales:** <code>../../../shared/authorization.js</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 8 líneas originales; incluidos 1–8; cobertura completa. Huella SHA-256 inicial del archivo: 06ECB41C19A99AD9E4D4EA7888DE37D8BF391CD6887F381AB9F623CDFDFEB7FA.

**S067: capaVista/src/config/permissions.js, líneas 1–8.** Componente/función o selectores: Permisos visuales y comerciales. Filtros: Todos. Fragmento literal:

```javascript
import { PERMISSIONS as P } from '../../../shared/authorization.js';
// Alias de componentes heredados; los valores son capacidades canónicas de negocio.
export const PERMISSIONS = Object.freeze({ ...P,
  VIEW_KANBAN_MODULE: P.READ_ORDERS, VIEW_PAYMENTS_MODULE: P.READ_PAYMENTS,
  VIEW_OWN_PROFILE: P.READ_PROFILE, CREATE_USERS_VISUALLY: P.MANAGE_USERS,
  MANAGE_USERS_VISUALLY: P.MANAGE_USERS, VIEW_ORDERS_MODULE: P.CREATE_ORDERS,
  MOVE_KANBAN_TO_PRODUCTION: P.START_PRODUCTION,
});
```

<a id="fuente-S068"></a>

#### S068 — capaVista/src/config/roles.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** Etiquetas de roles y política compartida. **Filtros relacionados:** Todos.

**Exportaciones declaradas** (línea inicial): 1: export { ROLES, ADMIN_ROLES as ADMINISTRATIVE_ROLES, manageableRoles } from '../../../shared/authorization.js';; 5: export const OFFICIAL_ROLES = FUNCTIONAL_ROLES;; 6: export function isOfficialRole(role, provider = 'keycloak') { return authorizationForProvider(provider)?.RECOGNIZED_ROLES.includes(role) === true; }; 7: export function getRoleLabel(role) {.

**Relaciones/imports originales:** <code>../../../shared/authorization.js</code>, <code>../../../shared/identityAuthorization.js</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 11 líneas originales; incluidos 1–11; cobertura completa. Huella SHA-256 inicial del archivo: FCB93AC9861BB25DAF8CD20AEAAD6C8927F7335893AAF1221D5E540804847281.

**S068: capaVista/src/config/roles.js, líneas 1–11.** Componente/función o selectores: Etiquetas de roles y política compartida. Filtros: Todos. Fragmento literal:

```javascript
export { ROLES, ADMIN_ROLES as ADMINISTRATIVE_ROLES, manageableRoles } from '../../../shared/authorization.js';
import { ROLES, FUNCTIONAL_ROLES } from '../../../shared/authorization.js';
import { authorizationForProvider } from '../../../shared/identityAuthorization.js';
// Opciones funcionales: nunca ofrecer Soporte en formularios.
export const OFFICIAL_ROLES = FUNCTIONAL_ROLES;
export function isOfficialRole(role, provider = 'keycloak') { return authorizationForProvider(provider)?.RECOGNIZED_ROLES.includes(role) === true; }
export function getRoleLabel(role) {
  if (role === ROLES.ADMINISTRADOR) return 'Administrador Producción';
  if (role === ROLES.PRODUCCION) return 'Operario Producción';
  return role;
}
```

<a id="fuente-S069"></a>

#### S069 — capaVista/src/config/status.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** PAYMENT_STATUS. **Filtros relacionados:** Todos.

**Exportaciones declaradas** (línea inicial): 1: export const PAYMENT_STATUS = Object.freeze({.

**Cobertura:** 5 líneas originales; incluidos 1–5; cobertura completa. Huella SHA-256 inicial del archivo: 7FFA9F170D3B80624F7639CF43EA0CC244213A66828885ADE80C60FC3EFFB117.

**S069: capaVista/src/config/status.js, líneas 1–5.** Componente/función o selectores: PAYMENT_STATUS. Filtros: Todos. Fragmento literal:

```javascript
export const PAYMENT_STATUS = Object.freeze({
  PENDIENTE: 'Pendiente',
  CONFIRMADO: 'Confirmado',
  RECHAZADO: 'Rechazado',
})
```

<a id="fuente-S070"></a>

#### S070 — shared/authorization.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** ROLES, ROLE_PERMISSIONS y manageableRoles. **Filtros relacionados:** Todos.

**Exportaciones declaradas** (línea inicial): 2: export const POLICY_ID = 'itecsa-keycloak-v1';; 3: export const ROLES = Object.freeze({; 14: export const RECOGNIZED_ROLES = Object.freeze(Object.values(ROLES));; 15: export const FUNCTIONAL_ROLES = Object.freeze(RECOGNIZED_ROLES.filter(role => ![ROLES.DESARROLLADOR, ROLES.SOPORTE].includes(role)));; 16: export const ADMIN_ROLES = Object.freeze([ROLES.SOPORTE, ROLES.DESARROLLADOR]);; 17: export const PRIVILEGED_ROLES = Object.freeze([ROLES.GERENCIA, ROLES.DESARROLLADOR, ROLES.SOPORTE]);; 18: export const ASSIGNABLE_ROLES = Object.freeze(FUNCTIONAL_ROLES.filter(role => !PRIVILEGED_ROLES.includes(role)));; 19: export const PERMISSIONS = Object.freeze({; 46: export const BUSINESS_PERMISSIONS = Object.freeze(Object.values(PERMISSIONS));; 47: export const ROLE_PERMISSIONS = Object.freeze(Object.fromEntries(Object.entries({; 167: export const ROLES_CLAIM = 'https://itecsa.local/roles';; 168: export function roleFromPayload(payload) {; 172: export function can(role, permissions, permission) {; 176: export function manageableRoles(role) { return ADMIN_ROLES.includes(role) ? ASSIGNABLE_ROLES : NO_ROLES; }; 177: export function canManageUser(actorRole, targetRole) { return manageableRoles(actorRole).includes(targetRole); }.

**Cobertura:** 177 líneas originales; incluidos 1–45, 47–177. Fuera de extracción: 46–46; corresponden al contexto restante del archivo y no se sustituyen por código inventado. Huella SHA-256 inicial del archivo: 5D9BB25772AC6D57248034FA85AB861258BB511B80DFCFA3D6B8922FA42198C3.

**S070: shared/authorization.js, líneas 1–45.** Componente/función o selectores: ROLES, ROLE_PERMISSIONS y manageableRoles. Filtros: Todos. Fragmento literal:

```javascript
// Canonical application policy. Identity roles come from the configured client.
export const POLICY_ID = 'itecsa-keycloak-v1';
export const ROLES = Object.freeze({
  "ADMINISTRADOR": "Administrador Produccion",
  "ADMIN_VENTAS": "Administrador Ventas",
  "ADMIN_COBRANZAS": "Administrador Cobranzas",
  "PRODUCCION": "Operario Produccion",
  "VENTAS": "Operario Ventas",
  "COBRANZAS": "Operario Cobranzas",
  "GERENCIA": "Gerencia",
  "DESARROLLADOR": "Desarrollador",
  "SOPORTE": "Soporte"
});
export const RECOGNIZED_ROLES = Object.freeze(Object.values(ROLES));
export const FUNCTIONAL_ROLES = Object.freeze(RECOGNIZED_ROLES.filter(role => ![ROLES.DESARROLLADOR, ROLES.SOPORTE].includes(role)));
export const ADMIN_ROLES = Object.freeze([ROLES.SOPORTE, ROLES.DESARROLLADOR]);
export const PRIVILEGED_ROLES = Object.freeze([ROLES.GERENCIA, ROLES.DESARROLLADOR, ROLES.SOPORTE]);
export const ASSIGNABLE_ROLES = Object.freeze(FUNCTIONAL_ROLES.filter(role => !PRIVILEGED_ROLES.includes(role)));
export const PERMISSIONS = Object.freeze({
  "READ_PROFILE": "read:own-profile",
  "MANAGE_PIN": "manage:own-pin",
  "READ_ORDERS": "read:orders",
  "READ_CAPACITY": "read:production-capacity",
  "READ_MESSAGES": "read:own-messages",
  "UPDATE_MESSAGES": "update:own-messages",
  "MANAGE_USERS": "manage:users",
  "READ_SALES_NOTES": "read:sales-notes",
  "CREATE_ORDERS": "create:orders",
  "REEVALUATE_ORDERS": "reevaluate:orders",
  "READ_PAYMENTS": "read:payments",
  "UPDATE_PAYMENT_STATUS": "update:payment-status",
  "REVISE_PAYMENT_STATUS": "revise:payment-status",
  "MOVE_ORDERS": "move:orders",
  "START_PRODUCTION": "start:production",
  "UPDATE_SUBPROCESSES": "update:production-subprocesses",
  "ROLLBACK_SUBPROCESSES": "rollback:production-subprocesses",
  "MANAGE_CAPACITY": "manage:production-capacity",
  "MANAGE_PRODUCTION_LOAD": "manage:production-load",
  "MANAGE_TAGS": "manage:order-tags",
  "REVIEW_ORDERS": "review:orders",
  "CANCEL_ORDERS": "cancel:orders",
  "READ_CALENDAR": "read:production-calendar",
  "UPDATE_DELIVERY_DATE": "update:order-delivery-date",
  "VIEW_METRICS": "view:metrics"
});
```

**S070: shared/authorization.js, líneas 47–177.** Componente/función o selectores: ROLES, ROLE_PERMISSIONS y manageableRoles. Filtros: Todos. Fragmento literal:

```javascript
export const ROLE_PERMISSIONS = Object.freeze(Object.fromEntries(Object.entries({
  "Administrador Produccion": [
    "read:own-profile",
    "manage:own-pin",
    "read:orders",
    "read:production-capacity",
    "read:own-messages",
    "update:own-messages",
    "move:orders",
    "update:production-subprocesses",
    "start:production",
    "rollback:production-subprocesses",
    "manage:production-capacity",
    "manage:production-load",
    "manage:order-tags",
    "review:orders",
    "cancel:orders",
    "read:production-calendar",
    "update:order-delivery-date",
    "view:metrics"
  ],
  "Administrador Ventas": [
    "read:own-profile",
    "manage:own-pin",
    "read:orders",
    "read:production-capacity",
    "read:own-messages",
    "update:own-messages",
    "read:sales-notes",
    "create:orders",
    "reevaluate:orders",
    "read:production-calendar"
  ],
  "Administrador Cobranzas": [
    "read:own-profile",
    "manage:own-pin",
    "read:orders",
    "read:production-capacity",
    "read:own-messages",
    "update:own-messages",
    "read:payments",
    "update:payment-status",
    "revise:payment-status"
  ],
  "Operario Produccion": [
    "read:own-profile",
    "manage:own-pin",
    "read:orders",
    "read:production-capacity",
    "read:own-messages",
    "update:own-messages",
    "move:orders",
    "update:production-subprocesses"
  ],
  "Operario Ventas": [
    "read:own-profile",
    "manage:own-pin",
    "read:orders",
    "read:production-capacity",
    "read:own-messages",
    "update:own-messages",
    "read:sales-notes",
    "create:orders",
    "reevaluate:orders",
    "read:production-calendar"
  ],
  "Operario Cobranzas": [
    "read:own-profile",
    "manage:own-pin",
    "read:orders",
    "read:production-capacity",
    "read:own-messages",
    "update:own-messages",
    "read:payments",
    "update:payment-status"
  ],
  "Gerencia": [
    "read:own-profile",
    "manage:own-pin",
    "read:orders",
    "read:production-capacity",
    "read:own-messages",
    "update:own-messages",
    "view:metrics"
  ],
  "Desarrollador": [
    "read:own-profile",
    "manage:own-pin",
    "read:orders",
    "read:production-capacity",
    "read:own-messages",
    "update:own-messages",
    "manage:users",
    "read:sales-notes",
    "create:orders",
    "reevaluate:orders",
    "read:payments",
    "update:payment-status",
    "revise:payment-status",
    "move:orders",
    "start:production",
    "update:production-subprocesses",
    "rollback:production-subprocesses",
    "manage:production-capacity",
    "manage:production-load",
    "manage:order-tags",
    "review:orders",
    "cancel:orders",
    "read:production-calendar",
    "update:order-delivery-date",
    "view:metrics"
  ],
  "Soporte": [
    "read:own-profile",
    "manage:own-pin",
    "read:own-messages",
    "update:own-messages",
    "manage:users"
  ]
}).map(([role, permissions]) => [role, Object.freeze(permissions)])));
export const ROLES_CLAIM = 'https://itecsa.local/roles';
export function roleFromPayload(payload) {
  const roles = payload?.[ROLES_CLAIM];
  return Array.isArray(roles) && roles.length === 1 && RECOGNIZED_ROLES.includes(roles[0]) ? roles[0] : null;
}
export function can(role, permissions, permission) {
  return RECOGNIZED_ROLES.includes(role) && ROLE_PERMISSIONS[role]?.includes(permission) === true && Array.isArray(permissions) && permissions.includes(permission);
}
const NO_ROLES = Object.freeze([]);
export function manageableRoles(role) { return ADMIN_ROLES.includes(role) ? ASSIGNABLE_ROLES : NO_ROLES; }
export function canManageUser(actorRole, targetRole) { return manageableRoles(actorRole).includes(targetRole); }
```

<a id="fuente-S071"></a>

#### S071 — shared/userLifecycle.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** Estados, alias Vinculado/Activo y displayUserStatus. **Filtros relacionados:** Todos.

**Exportaciones declaradas** (línea inicial): 1: export const USER_STATUS = Object.freeze({; 9: export const ACTIVE_USER_STATUSES = Object.freeze([; 14: export const USER_STATUS_FILTERS = Object.freeze([; 21: export const MUTABLE_USER_STATUSES = Object.freeze([; 28: export function isActiveUserStatus(status) {; 32: export function normalizeUserStatusForStorage(status) {; 36: export function displayUserStatus(status) {.

**Cobertura:** 38 líneas originales; incluidos 1–38; cobertura completa. Huella SHA-256 inicial del archivo: 4AA792F59EDC37E74D27036FBB7FA80C61BBDC34B07048F29B7936F641969477.

**S071: shared/userLifecycle.js, líneas 1–38.** Componente/función o selectores: Estados, alias Vinculado/Activo y displayUserStatus. Filtros: Todos. Fragmento literal:

```javascript
export const USER_STATUS = Object.freeze({
  ACTIVE: 'Activo',
  LEGACY_LINKED: 'Vinculado',
  UNLINKED: 'Desvinculado',
  PENDING_FIRST_LOGIN: 'Pendiente',
  PENDING_ROLE: 'Pendiente rol',
})

export const ACTIVE_USER_STATUSES = Object.freeze([
  USER_STATUS.ACTIVE,
  USER_STATUS.LEGACY_LINKED,
])

export const USER_STATUS_FILTERS = Object.freeze([
  ...ACTIVE_USER_STATUSES,
  USER_STATUS.UNLINKED,
  USER_STATUS.PENDING_FIRST_LOGIN,
  USER_STATUS.PENDING_ROLE,
])

export const MUTABLE_USER_STATUSES = Object.freeze([
  ...ACTIVE_USER_STATUSES,
  USER_STATUS.UNLINKED,
])

const ACTIVE_USER_STATUS_SET = new Set(ACTIVE_USER_STATUSES)

export function isActiveUserStatus(status) {
  return ACTIVE_USER_STATUS_SET.has(status)
}

export function normalizeUserStatusForStorage(status) {
  return status === USER_STATUS.LEGACY_LINKED ? USER_STATUS.ACTIVE : status
}

export function displayUserStatus(status) {
  return status === USER_STATUS.ACTIVE ? USER_STATUS.LEGACY_LINKED : status
}
```

<a id="fuente-S072"></a>

#### S072 — capaVista/src/hooks/useApiClient.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** useApiClient; sesión actual y memoización. **Filtros relacionados:** Todos.

**Exportaciones declaradas** (línea inicial): 5: export function useApiClient() {.

**Relaciones/imports originales:** <code>react</code>, <code>../app/providers/identityContext.js</code>, <code>../services/api/apiClient.js</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 10 líneas originales; incluidos 1–10; cobertura completa. Huella SHA-256 inicial del archivo: 4BF7FCC5FF2C110C057EF369097318B9CBEB5513B9DF6547659C3D9ADBF361B3.

**S072: capaVista/src/hooks/useApiClient.js, líneas 1–10.** Componente/función o selectores: useApiClient; sesión actual y memoización. Filtros: Todos. Fragmento literal:

```javascript
import { useMemo } from 'react'
import { useIdentity } from '../app/providers/identityContext.js'
import { createApiClient } from '../services/api/apiClient.js'

export function useApiClient() {
  const { getAccessToken, getSessionKey, sessionKey } = useIdentity()
  return useMemo(() => createApiClient({ getAccessToken,
    isSessionCurrent: () => getSessionKey() === sessionKey,
  }), [getAccessToken, getSessionKey, sessionKey])
}
```

<a id="fuente-S073"></a>

#### S073 — capaVista/src/hooks/useAuth.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** useAuth; contexto de autorización. **Filtros relacionados:** Todos.

**Exportaciones declaradas** (línea inicial): 4: export function useAuth() {.

**Relaciones/imports originales:** <code>react</code>, <code>../app/providers/authContext</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 13 líneas originales; incluidos 1–13; cobertura completa. Huella SHA-256 inicial del archivo: 64C70BACB58E6E49EC23857393CE233F54C2DE2E0534BD3CB904E96FB2E52A1C.

**S073: capaVista/src/hooks/useAuth.js, líneas 1–13.** Componente/función o selectores: useAuth; contexto de autorización. Filtros: Todos. Fragmento literal:

```javascript
import { useContext } from 'react'
import { AuthContext } from '../app/providers/authContext'

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    // Falla temprano para detectar componentes montados fuera del arbol de AppProviders.
    throw new Error('useAuth debe usarse dentro de AuthProvider.')
  }

  return context
}
```

<a id="fuente-S074"></a>

#### S074 — capaVista/src/services/api/apiClient.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** createApiClient; URL, errores, abort, timeout y lectura HTTP. **Filtros relacionados:** Todos.

**Exportaciones declaradas** (línea inicial): 2: export const API_ERROR_CODES = {; 9: export class ApiClientError extends Error {; 87: export function createApiClient({ baseUrl = getDefaultBaseUrl(), getAccessToken, isSessionCurrent = () => true, timeoutMs = 45_000 } = {}) {.

**Relaciones/imports originales:** <code>../../config/runtimeConfig.js</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 179 líneas originales; incluidos 1–179; cobertura completa. Huella SHA-256 inicial del archivo: FFA2D96FA8C8FA4308E0B4C78D145FC0EB83A7C18BDA8E4D9F1550F2C674D24A.

**S074: capaVista/src/services/api/apiClient.js, líneas 1–179.** Componente/función o selectores: createApiClient; URL, errores, abort, timeout y lectura HTTP. Filtros: Todos. Fragmento literal:

```javascript
import { runtimeConfig } from '../../config/runtimeConfig.js'
export const API_ERROR_CODES = {
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
  HTTP_ERROR: 'HTTP_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  SESSION_INVALID: 'SESSION_INVALID',
}

export class ApiClientError extends Error {
  constructor(message, { code, status, payload, cause } = {}) {
    super(message, { cause })
    this.name = 'ApiClientError'
    this.code = code ?? API_ERROR_CODES.HTTP_ERROR
    this.status = status
    this.payload = payload
  }
}

function getDefaultBaseUrl() {
  const baseUrl = runtimeConfig.apiBaseUrl?.trim()

  if (!baseUrl) {
    throw new ApiClientError('VITE_API_BASE_URL no esta configurada.', {
      code: API_ERROR_CODES.CONFIGURATION_ERROR,
    })
  }

  return baseUrl
}

function buildUrl(baseUrl, path) {
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  const normalizedPath = String(path).replace(/^\/+/, '')

  return new URL(normalizedPath, normalizedBaseUrl).toString()
}

async function readResponsePayload(response, responseType) {
  if (response.status === 204) {
    return null
  }

  const contentType = response.headers.get('content-type') ?? ''

  if (responseType === 'blob' && response.ok) {
    return response.blob()
  }

  if (contentType.includes('application/json')) {
    return response.json()
  }

  const text = await response.text()
  return text || null
}

function createSessionInvalidError(cause) {
  return new ApiClientError('La sesion no es valida o no esta autenticada.', {
    code: API_ERROR_CODES.SESSION_INVALID,
    status: 401,
    cause,
  })
}

async function getBearerToken(getAccessToken) {
  try {
    const token = await getAccessToken()

    if (typeof token !== 'string' || token.trim().length === 0) {
      throw createSessionInvalidError()
    }

    return token
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw error
    }

    throw createSessionInvalidError(error)
  }
}

function isFormDataBody(body) {
  return typeof FormData !== 'undefined' && body instanceof FormData
}

export function createApiClient({ baseUrl = getDefaultBaseUrl(), getAccessToken, isSessionCurrent = () => true, timeoutMs = 45_000 } = {}) {
  if (typeof getAccessToken !== 'function') {
    throw new ApiClientError('apiClient requiere una funcion getAccessToken.', {
      code: API_ERROR_CODES.CONFIGURATION_ERROR,
    })
  }

  async function performRequest(path, { method = 'GET', headers, body, responseType, signal, credentials } = {}) {
    if (!isSessionCurrent()) throw createSessionInvalidError()
    const token = await getBearerToken(getAccessToken)
    if (!isSessionCurrent()) throw createSessionInvalidError()
    const requestHeaders = new Headers(headers)
    requestHeaders.set('Authorization', `Bearer ${token}`)

    const isFormData = isFormDataBody(body)

    if (body !== undefined && !isFormData && !requestHeaders.has('Content-Type')) {
      requestHeaders.set('Content-Type', 'application/json')
    }

    let response

    try {
      response = await fetch(buildUrl(baseUrl, path), {
        method,
        signal,
        headers: requestHeaders,
        ...(credentials ? { credentials } : {}),
        body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
      })
    } catch (error) {
      throw new ApiClientError('No fue posible contactar la API.', {
        code: API_ERROR_CODES.NETWORK_ERROR,
        cause: error,
      })
    }

    const payload = await readResponsePayload(response, responseType)
    if (!isSessionCurrent()) throw createSessionInvalidError()

    if (response.status === 401) {
      throw new ApiClientError('La sesion no es valida o no esta autenticada.', {
        code: API_ERROR_CODES.SESSION_INVALID,
        status: response.status,
        payload,
      })
    }

    if (!response.ok) {
      throw new ApiClientError('La API respondio con un error.', {
        code: API_ERROR_CODES.HTTP_ERROR,
        status: response.status,
        payload,
      })
    }

    return payload
  }

  async function request(path, { signal, timeoutMs: requestTimeout = timeoutMs, ...options } = {}) {
    const controller = new AbortController()
    let timer, onAbort
    // Limita también la espera del token y la lectura del cuerpo. Nunca reintenta
    // mutaciones: un corte de conexión no demuestra que el servidor no las ejecutó.
    const interrupted = new Promise((_, reject) => {
      const interrupt = (reason) => {
        controller.abort(reason)
        reject(new ApiClientError('La solicitud no pudo completarse. Comprueba su resultado antes de repetirla.', {
          code: API_ERROR_CODES.NETWORK_ERROR, cause: reason,
        }))
      }
      onAbort = () => interrupt(signal.reason)
      if (signal?.aborted) onAbort()
      else signal?.addEventListener('abort', onAbort, { once: true })
      timer = setTimeout(() => interrupt(new Error('Tiempo de espera agotado.')), requestTimeout)
    })
    try {
      if (signal?.aborted) return await interrupted
      return await Promise.race([performRequest(path, { ...options, signal: controller.signal }), interrupted])
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
  }

  return {
    get: (path, options) => request(path, { ...options, method: 'GET' }),
    post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
    patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
    delete: (path, options) => request(path, { ...options, method: 'DELETE' }),
    request,
  }
}
```

<a id="fuente-S075"></a>

#### S075 — capaVista/src/shared/components/layout/PageShell.jsx

**Tipo:** JSX/React. **Responsabilidad, componentes y funciones:** PageShell/PageSurface; anchura y envoltura. **Filtros relacionados:** Todos.

**Exportaciones declaradas** (línea inicial): 3: export default function PageShell({ children, className = '', maxWidth, ...props }) {; 11: export function PageSurface({ children, className = '', ...props }) {.

**Relaciones/imports originales:** <code>./PageShell.module.css</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 13 líneas originales; incluidos 1–13; cobertura completa. Huella SHA-256 inicial del archivo: EB4E714E679DBA46465FB55938AB345C9231F81AE9B866C2A26BBA33322B8405.

**S075: capaVista/src/shared/components/layout/PageShell.jsx, líneas 1–13.** Componente/función o selectores: PageShell/PageSurface; anchura y envoltura. Filtros: Todos. Fragmento literal:

```jsx
import styles from './PageShell.module.css'

export default function PageShell({ children, className = '', maxWidth, ...props }) {
  return (
    <div className={`${styles.shell} ${className}`} style={maxWidth ? { '--page-max-width': maxWidth } : undefined} {...props}>
      <div className={styles.frame}>{children}</div>
    </div>
  )
}

export function PageSurface({ children, className = '', ...props }) {
  return <section className={`${styles.surface} ${className}`} {...props}>{children}</section>
}
```

<a id="fuente-S076"></a>

#### S076 — capaVista/src/shared/components/layout/PageHeader.jsx

**Tipo:** JSX/React. **Responsabilidad, componentes y funciones:** PageHeader; título y acciones de calendario. **Filtros relacionados:** Todos.

**Exportaciones declaradas** (línea inicial): 3: export default function PageHeader({ title, titleId, actions, children }) {.

**Relaciones/imports originales:** <code>./PageShell.module.css</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 15 líneas originales; incluidos 1–15; cobertura completa. Huella SHA-256 inicial del archivo: 1D3A23766B2500B5761A82CB2DB3F57159AB1CD8EB95842ECE4C3B687BE3662E.

**S076: capaVista/src/shared/components/layout/PageHeader.jsx, líneas 1–15.** Componente/función o selectores: PageHeader; título y acciones de calendario. Filtros: Todos. Fragmento literal:

```jsx
import styles from './PageShell.module.css'

export default function PageHeader({ title, titleId, actions, children }) {
  return (
    <div className={styles.headerContainer} data-page-header-container="">
      <header className={styles.header} data-page-header="">
        <div className={styles.heading}>
          <h1 className={styles.title} id={titleId}>{title}</h1>
          {children && <div className={styles.details}>{children}</div>}
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </header>
    </div>
  )
}
```

<a id="fuente-S077"></a>

#### S077 — capaVista/src/shared/components/layout/PageShell.module.css

**Tipo:** CSS propio. **Responsabilidad, componentes y funciones:** CSS completo de marco y cabecera compartida. **Filtros relacionados:** Todos.

**Cobertura:** 72 líneas originales; incluidos 1–72; cobertura completa. Huella SHA-256 inicial del archivo: A14EDEC6E558125A71B6A4F2B94D32150D32DCDFD9A6E483C26CDF98235B90D9.

**S077: capaVista/src/shared/components/layout/PageShell.module.css, líneas 1–72.** Componente/función o selectores: CSS completo de marco y cabecera compartida. Filtros: Todos. Fragmento literal:

```css
.shell {
  background: var(--page-background);
  min-width: 0;
  padding: var(--page-space-y) var(--page-space-x);
  width: 100%;
}

.frame {
  margin-inline: auto;
  max-width: var(--page-max-width);
  min-width: 0;
}

.headerContainer {
  container-type: inline-size;
  min-width: 0;
}

.surface {
  background: var(--page-white);
  border: 1px solid var(--page-border);
  border-radius: var(--page-radius);
  min-width: 0;
}

.header {
  align-items: center;
  background: var(--page-header-black);
  border-bottom: var(--page-stripe-size) solid var(--page-brand-orange);
  border-radius: var(--page-radius) var(--page-radius) 0 0;
  color: var(--page-white);
  display: flex;
  flex-wrap: wrap;
  gap: var(--page-header-gap);
  min-height: var(--page-header-min-height);
  padding: var(--page-header-space-y) var(--page-header-space-x);
}

.heading {
  flex: 1 1 24rem;
  min-width: 0;
}

.title {
  color: var(--page-white);
  font-family: var(--page-font-family);
  font-size: var(--page-title-small);
  font-weight: 700;
  letter-spacing: 0.02em;
  line-height: 1.15;
  margin: 0;
  overflow-wrap: anywhere;
  text-transform: uppercase;
}

.details { margin-top: 0.75rem; overflow-wrap: anywhere; }
.details > :last-child { margin-bottom: 0; }
.actions { display: flex; flex: 0 1 auto; flex-wrap: wrap; gap: 1rem; max-width: 100%; min-width: 0; }
.actions > * { max-width: 100%; min-width: 0; }

@container (min-width: 40rem) {
  .title { font-size: var(--page-title-medium); }
}

@container (min-width: 64rem) {
  .title { font-size: var(--page-title-large); }
}

@container (max-width: 39.999rem) {
  .header { padding-inline: var(--page-header-space-x-small); }
  .actions { flex-basis: 100%; }
}
```

<a id="fuente-S078"></a>

#### S078 — capaVista/src/styles/theme.css

**Tipo:** CSS propio. **Responsabilidad, componentes y funciones:** Tokens globales y variantes de naranja. **Filtros relacionados:** Todos.

**Cobertura:** 51 líneas originales; incluidos 1–51; cobertura completa. Huella SHA-256 inicial del archivo: 6913F4DAF9CE166D6CA3F4946BC8DA037116732245DF59EF3F8FD8D983D3CAAD.

**S078: capaVista/src/styles/theme.css, líneas 1–51.** Componente/función o selectores: Tokens globales y variantes de naranja. Filtros: Todos. Fragmento literal:

```css
:root {
  --stage-payment-accent: #ca8a04;
  --stage-payment-text: #713f12;
  --stage-payment-bg: #fef9c3;
  --stage-ready-accent: var(--page-brand-orange);
  --stage-ready-text: #9a3412;
  --stage-ready-bg: #fff7ed;
  --stage-production-accent: #2563eb;
  --stage-production-text: #1e40af;
  --stage-production-bg: #eff6ff;
  --stage-delivery-accent: var(--itexsa-green);
  --stage-delivery-text: #166534;
  --stage-delivery-bg: #f0fdf4;
  --stage-review-accent: #dc2626;
  --stage-review-text: #b91c1c;
  --stage-review-bg: #fef2f2;
  --stage-unknown-accent: var(--itexsa-muted);
  --stage-unknown-text: var(--itexsa-text);
  --stage-unknown-bg: var(--page-background);
  --layer-pin-dialog: 2000;
  /* PIN dialogs are the highest existing layer; the host only captures card clicks. */
  --layer-toast: 2010;
  --page-header-black: #000000;
  --page-brand-orange: #FE5A00;
  --page-brand-orange-rgb: 254, 90, 0;
  --page-white: #FFFFFF;
  --page-background: #F5F6F8;
  --page-border: #D9DEE5;
  --page-space-x: 20px;
  --page-space-y: 20px;
  --page-max-width: 1760px;
  --page-radius: 16px;
  --page-stripe-size: 4px;
  --page-header-space-x: 32px;
  --page-header-space-x-small: 20px;
  --page-header-space-y: 24px;
  --page-header-min-height: 100px;
  --page-header-gap: 24px;
  --page-font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --page-title-small: 24px;
  --page-title-medium: 36px;
  --page-title-large: 48px;
  --itexsa-border: #e5e7eb;
  --itexsa-orange: #f97316;
  --itexsa-orange-rgb: 249, 115, 22;
  --itexsa-red: #ef121c;
  --itexsa-green: #248f55;
  --itexsa-muted: #64748b;
  --itexsa-text: #111827;
  --itexsa-shadow: 0 18px 40px rgba(15, 23, 42, 0.06);
}
```

<a id="fuente-S079"></a>

#### S079 — capaVista/src/styles/global.css

**Tipo:** CSS propio. **Responsabilidad, componentes y funciones:** Tipografía heredada de controles. **Filtros relacionados:** Todos.

**Cobertura:** 23 líneas originales; incluidos 1–23; cobertura completa. Huella SHA-256 inicial del archivo: 9B5EF2F94F1B1118A44D281D25ECD3934B2C6BEAB3CFBEFEE722B57D62680F85.

**S079: capaVista/src/styles/global.css, líneas 1–23.** Componente/función o selectores: Tipografía heredada de controles. Filtros: Todos. Fragmento literal:

```css
body {
  background: #f8fafc;
  color: #111827;
  font-family:
    Inter,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif;
}

button,
a,
input,
select,
textarea {
  font: inherit;
}

::selection {
  background: rgba(249, 115, 22, 0.24);
}
```

<a id="fuente-S080"></a>

#### S080 — capaVista/src/styles/bootstrap-overrides.css

**Tipo:** CSS propio. **Responsabilidad, componentes y funciones:** Archivo de overrides global, actualmente vacío. **Filtros relacionados:** Todos.

**Cobertura:** archivo vacío (0 líneas de código); cobertura completa. Huella SHA-256 inicial del archivo: E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855.

No hay declaraciones que extraer. Se conserva esta entrada porque el archivo se importa globalmente y su ausencia de overrides evita atribuirle estilos inexistentes.

<a id="fuente-S081"></a>

#### S081 — capaVista/src/shared/components/forms/TextInput.jsx

**Tipo:** JSX/React. **Responsabilidad, componentes y funciones:** TextInput; disponible, sin uso en los filtros inventariados. **Filtros relacionados:** Todos.

**Exportaciones declaradas** (línea inicial): 1: export default function TextInput({.

**Cobertura:** 50 líneas originales; incluidos 1–50; cobertura completa. Huella SHA-256 inicial del archivo: DBCC89D8939F8F8C1D39258C476329737995BC85EE04DAAB64F9DFAC802F2A30.

**S081: capaVista/src/shared/components/forms/TextInput.jsx, líneas 1–50.** Componente/función o selectores: TextInput; disponible, sin uso en los filtros inventariados. Filtros: Todos. Fragmento literal:

```jsx
export default function TextInput({
  label,
  name,
  value,
  onChange,
  onClick,
  type = 'text',
  placeholder,
  disabled = false,
  error,
  id,
  readOnly = false,
  required = false,
  maxLength,
  describedBy,
  autoComplete,
}) {
  const handleChange = (e) => {
    if (readOnly) return
    onChange(e)
  }

  return (
    <div className="mb-3">
      {label && (
        <label htmlFor={id || name} className="form-label text-secondary">
          {label}
        </label>
      )}
      <input
        id={id || name}
        name={name}
        type={type}
        className={`form-control ${error ? 'is-invalid' : ''}`}
        value={value}
        onChange={handleChange}
        onClick={onClick}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        required={required}
        maxLength={maxLength}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={[describedBy, error ? `${id || name}-error` : null].filter(Boolean).join(' ') || undefined}
      />
      {error && <div id={`${id || name}-error`} className="invalid-feedback d-block">{error}</div>}
    </div>
  )
}
```

<a id="fuente-S082"></a>

#### S082 — capaVista/src/shared/components/forms/SelectInput.jsx

**Tipo:** JSX/React. **Responsabilidad, componentes y funciones:** SelectInput; disponible, sin uso en los filtros inventariados. **Filtros relacionados:** Todos.

**Exportaciones declaradas** (línea inicial): 1: export default function SelectInput({.

**Cobertura:** 38 líneas originales; incluidos 1–38; cobertura completa. Huella SHA-256 inicial del archivo: 4B4B62204D06665F0F6CADE7C1F45D7865BBE65BA9F29447D2AA672BCB1963B2.

**S082: capaVista/src/shared/components/forms/SelectInput.jsx, líneas 1–38.** Componente/función o selectores: SelectInput; disponible, sin uso en los filtros inventariados. Filtros: Todos. Fragmento literal:

```jsx
export default function SelectInput({
  id,
  name,
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  className = '',
  required = false,
  error,
}) {
  return (
    <label className={className} htmlFor={id}>
      <span className="form-label">{label}</span>
      <select
        className={`form-select ${error ? 'is-invalid' : ''}`}
        disabled={disabled}
        id={id}
        name={name}
        onChange={onChange}
        value={value}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <span id={`${id}-error`} className="invalid-feedback d-block">{error}</span>}
    </label>
  )
}
```

<a id="fuente-S083"></a>

#### S083 — capaVista/src/shared/components/navigation/NavigationMenu.jsx

**Tipo:** JSX/React. **Responsabilidad, componentes y funciones:** NavigationMenu; entrada a cinco módulos desde menú lateral. **Filtros relacionados:** Todos.

**Exportaciones declaradas** (línea inicial): 17: export default function NavigationMenu({ onNavigate }) {.

**Relaciones/imports originales:** <code>react-router-dom</code>, <code>../../../config/routes</code>, <code>../../../hooks/useAuth</code>, <code>../layout/Layout.module.css</code>, <code>../../../app/informationPageLoaders</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 40 líneas originales; incluidos 1–40; cobertura completa. Huella SHA-256 inicial del archivo: 739371898134B8AAFD5E581DAFDEC3235A1CDCD523B6EF924D1F76895EE38B05.

**S083: capaVista/src/shared/components/navigation/NavigationMenu.jsx, líneas 1–40.** Componente/función o selectores: NavigationMenu; entrada a cinco módulos desde menú lateral. Filtros: Todos. Fragmento literal:

```jsx
import { NavLink } from 'react-router-dom'
import { APP_ROUTES, MAIN_NAVIGATION_ROUTES } from '../../../config/routes'
import { useAuth } from '../../../hooks/useAuth'
import styles from '../layout/Layout.module.css'
import { preloadInformationPage } from '../../../app/informationPageLoaders'

const ROUTE_ICONS_BY_PATH = Object.freeze({
  [APP_ROUTES.KANBAN]: 'bi-kanban',
  [APP_ROUTES.PAYMENTS]: 'bi-cash-coin',
  [APP_ROUTES.ADMIN_USERS]: 'bi-people',
  [APP_ROUTES.ADMIN_USERS_CREATE]: 'bi-person-plus',
  [APP_ROUTES.ORDERS_CREATE]: 'bi-receipt',
  [APP_ROUTES.ORDER_HISTORY]: 'bi-clock-history',
  [APP_ROUTES.PRODUCTION_CALENDAR]: 'bi-calendar3',
})

export default function NavigationMenu({ onNavigate }) {
  const { hasPermission, hasRole } = useAuth()

  function canNavigate(route) {
    const matchesPermission = !route.permission || hasPermission(route.permission)
    const requiredRoles = route.requiredRoles ?? []
    const matchesRole = requiredRoles.length === 0 || requiredRoles.some((role) => hasRole(role))

    return matchesPermission && matchesRole
  }

  return (
    <div className={styles.navigationList}>
      {MAIN_NAVIGATION_ROUTES.filter(canNavigate).map((route) => (
        <NavLink className={styles.navLink} key={`${route.path}-${route.label}`} onClick={onNavigate} title={route.label} to={route.path}
          onPointerEnter={() => preloadInformationPage(route.path)} onFocus={() => preloadInformationPage(route.path)}
          onPointerDown={() => preloadInformationPage(route.path)}>
          <i className={`bi ${ROUTE_ICONS_BY_PATH[route.path] ?? 'bi-circle'} ${styles.navIcon}`} aria-hidden="true" />
          <span className={styles.navText}>{route.label}</span>
        </NavLink>
      ))}
    </div>
  )
}
```

<a id="fuente-S084"></a>

#### S084 — capaVista/src/shared/components/layout/AppLayout.jsx

**Tipo:** JSX/React. **Responsabilidad, componentes y funciones:** AppLayout; sidebar y área útil responsive. **Filtros relacionados:** Todos.

**Exportaciones declaradas** (línea inicial): 67: export default AppLayout.

**Relaciones/imports originales:** <code>react</code>, <code>react-router-dom</code>, <code>./Sidebar</code>, <code>./Topbar</code>, <code>./Layout.module.css</code>, <code>../navigation/ModuleLoadingState</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 67 líneas originales; incluidos 1–19, 46–67. Fuera de extracción: 20–45; corresponden al contexto restante del archivo y no se sustituyen por código inventado. Huella SHA-256 inicial del archivo: 8FCECF029B68EF7CFE09920767758114C0A17319453FBF4BFF229A9497CDBED7.

**S084: capaVista/src/shared/components/layout/AppLayout.jsx, líneas 1–19.** Componente/función o selectores: AppLayout; sidebar y área útil responsive. Filtros: Todos. Fragmento literal:

```jsx
import { Suspense, useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import styles from './Layout.module.css'
import ModuleLoadingState from '../navigation/ModuleLoadingState'

function AppLayout() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)

  function handleToggleSidebar() {
    setIsSidebarCollapsed((currentValue) => !currentValue)
  }

  function handleOpenMobileSidebar() {
    setIsMobileSidebarOpen(true)
  }

```

**S084: capaVista/src/shared/components/layout/AppLayout.jsx, líneas 46–67.** Componente/función o selectores: AppLayout; sidebar y área útil responsive. Filtros: Todos. Fragmento literal:

```jsx
          type="button"
        />
      )}

      <section
        className={`
          ${styles.contentArea}
          ${isSidebarCollapsed ? styles.contentAreaSidebarCollapsed : ''}
        `}
      >
        <Topbar onOpenMobileSidebar={handleOpenMobileSidebar} isMobileSidebarOpen={isMobileSidebarOpen} />
        <main className={styles.mainContent}>
          <Suspense fallback={<ModuleLoadingState />}>
            <Outlet />
          </Suspense>
        </main>
      </section>
    </div>
  )
}

export default AppLayout
```

<a id="fuente-S085"></a>

#### S085 — capaVista/src/shared/components/layout/Layout.module.css

**Tipo:** CSS propio. **Responsabilidad, componentes y funciones:** CSS de ancho disponible, sidebar y breakpoints. **Filtros relacionados:** Todos.

**Cobertura:** 420 líneas originales; incluidos 1–14, 235–249, 322–409. Fuera de extracción: 15–234, 250–321, 410–420; corresponden al contexto restante del archivo y no se sustituyen por código inventado. Huella SHA-256 inicial del archivo: DE2F6ACC5292B2FCC652D7F0509F94F5F967965A598AFB9187A249B121E5AE41.

**S085: capaVista/src/shared/components/layout/Layout.module.css, líneas 1–14.** Componente/función o selectores: CSS de ancho disponible, sidebar y breakpoints. Filtros: Todos. Fragmento literal:

```css
.appShell {
  --layout-border: rgba(255, 255, 255, 0.08);
  --layout-orange: var(--itexsa-orange, #f97316);
  --layout-orange-rgb: var(--itexsa-orange-rgb, 249, 115, 22);
  --sidebar-width: 16.5rem;
  --sidebar-collapsed-width: 4.75rem;

  background:
    radial-gradient(circle at top left, rgba(var(--layout-orange-rgb), 0.05), transparent 24rem),
    #ffffff;
  display: flex;
  min-height: 100vh;
  width: 100%;
}
```

**S085: capaVista/src/shared/components/layout/Layout.module.css, líneas 235–249.** Componente/función o selectores: CSS de ancho disponible, sidebar y breakpoints. Filtros: Todos. Fragmento literal:

```css
.contentArea {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  margin-left: var(--sidebar-width);
  min-height: 100vh;
  min-width: 0;
  transition: margin-left 0.2s ease;
  width: calc(100% - var(--sidebar-width));
}

.contentAreaSidebarCollapsed {
  margin-left: var(--sidebar-collapsed-width);
  width: calc(100% - var(--sidebar-collapsed-width));
}
```

**S085: capaVista/src/shared/components/layout/Layout.module.css, líneas 322–409.** Componente/función o selectores: CSS de ancho disponible, sidebar y breakpoints. Filtros: Todos. Fragmento literal:

```css
@media (max-width: 991.98px) {
  .appShell {
    display: block;
  }

  .sidebar {
    box-shadow: 24px 0 50px rgba(15, 23, 42, 0.22);
    flex-basis: min(82vw, 18rem);
    height: 100dvh;
    left: 0;
    max-width: 18rem;
    position: fixed;
    top: 0;
    transform: translateX(-105%);
    width: min(82vw, 18rem);
  }

  .contentArea,
  .contentAreaSidebarCollapsed {
    margin-left: 0;
    width: 100%;
  }

  .sidebarMobileOpen {
    transform: translateX(0);
  }

  .sidebarCollapsed {
    flex-basis: min(82vw, 18rem);
    width: min(82vw, 18rem);
  }

  .sidebarCollapsed .navText {
    opacity: 1;
    pointer-events: auto;
    width: auto;
  }

  .sidebarCollapsed .sidebarNav {
    align-items: stretch;
    padding: 1rem 0.75rem;
  }

  .sidebarCollapsed .sidebarHeader {
    flex-direction: row;
    justify-content: flex-end;
  }

  .sidebarCollapsed .navLink {
    gap: 0.75rem;
    justify-content: flex-start;
    padding: 0.78rem 0.85rem;
    width: 100%;
  }

  .sidebarCollapsed .sidebarFooter :global(.btn) {
    font-size: initial;
    min-height: 2.75rem;
    padding-inline: 0.9rem;
    white-space: nowrap;
    width: 100%;
  }

  .desktopToggleButton {
    display: none;
  }

  .mobileCloseButton,
  .mobileMenuButton {
    display: inline-flex;
  }

  .topbar {
    min-height: 4rem;
    padding: 0.75rem 1rem;
  }

  .mobileBackdrop {
    background: rgba(15, 23, 42, 0.42);
    border: 0;
    display: block;
    height: 100dvh;
    inset: 0;
    position: fixed;
    width: 100vw;
    z-index: 1030;
  }
}
```

<a id="fuente-S086"></a>

#### S086 — capaVista/src/shared/components/loading/LoadingIndicator.jsx

**Tipo:** JSX/React. **Responsabilidad, componentes y funciones:** LoadingIndicator/LoadingAction; estados de consulta. **Filtros relacionados:** Todos.

**Exportaciones declaradas** (línea inicial): 4: export default function LoadingIndicator({ scope = 'section', surface = 'light', size, context, className = '', announce = true }) {; 16: export function LoadingAction({ busy, children, surface = 'dark', context, announce = true }) {.

**Relaciones/imports originales:** <code>../../../../../shared/loading/indicator.css</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 21 líneas originales; incluidos 1–21; cobertura completa. Huella SHA-256 inicial del archivo: 34D726145D444977AF912A853C57D86D9BC78B779B1BABA4962FE5CFEDA03C05.

**S086: capaVista/src/shared/components/loading/LoadingIndicator.jsx, líneas 1–21.** Componente/función o selectores: LoadingIndicator/LoadingAction; estados de consulta. Filtros: Todos. Fragmento literal:

```jsx
import '../../../../../shared/loading/indicator.css'

/** Presentación solamente: el contenedor conserva la operación, foco y permisos. */
export default function LoadingIndicator({ scope = 'section', surface = 'light', size, context, className = '', announce = true }) {
  return <span className={`itecsa-loading ${className}`} data-scope={scope} data-surface={surface}
    data-size={size} role={announce ? 'status' : undefined} aria-live={announce ? 'polite' : undefined}>
    <svg className="itecsa-loading__ring" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <circle className="itecsa-loading__track" cx="24" cy="24" r="20" />
      <circle className="itecsa-loading__arc" cx="24" cy="24" r="20" />
    </svg>
    <span>Cargando...</span>
    {context && <span className="itecsa-loading__context"> {context}</span>}
  </span>
}

export function LoadingAction({ busy, children, surface = 'dark', context, announce = true }) {
  return <span className="itecsa-loading-action" data-busy={busy ? 'true' : undefined}>
    <span className="itecsa-loading-action__label" aria-hidden={busy || undefined}>{children}</span>
    {busy && <LoadingIndicator scope="action" surface={surface} context={context} announce={announce} />}
  </span>
}
```

<a id="fuente-S087"></a>

#### S087 — capaVista/src/shared/notifications/useToast.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** useToast; API estable de errores por componente. **Filtros relacionados:** Todos.

**Exportaciones declaradas** (línea inicial): 3: export const ToastContext = createContext(null); 5: export function useToast() {.

**Relaciones/imports originales:** <code>react</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 12 líneas originales; incluidos 1–12; cobertura completa. Huella SHA-256 inicial del archivo: 12D8568911778BFDAA2DD874E0994588BE1F50C34D6292301D87914BAC6190C8.

**S087: capaVista/src/shared/notifications/useToast.js, líneas 1–12.** Componente/función o selectores: useToast; API estable de errores por componente. Filtros: Todos. Fragmento literal:

```javascript
import { createContext, useContext, useEffect, useMemo, useRef } from 'react'

export const ToastContext = createContext(null)

export function useToast() {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast requiere ToastProvider.')
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  return useMemo(() => Object.fromEntries(Object.entries(api).map(([name, action]) =>
    [name, (...args) => active.current ? action(...args) : null])), [api])
}
```


### 15.9. Backend de consulta

<a id="fuente-S088"></a>

#### S088 — capaServidor/src/modules/orders/service/order.service.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** getOrderViews/getPagedPaymentWorkspace; validación y fechas UTC. **Filtros relacionados:** Todos salvo filtrado local CAL.

**Exportaciones declaradas** (línea inicial): 30: export { DUPLICATE_SALES_NOTE_MESSAGE };; 323: export default OrderService;; 325: export { RESOLVED_PAYMENT_PENDING_LOCKED_MESSAGE } from './orderPayment.service.js';.

**Relaciones/imports originales:** <code>./orderProduction.service.js</code>, <code>./orderPayment.service.js</code>, <code>./salesOrderCreation.service.js</code>, <code>../repo/orders.repo.js</code>, <code>../../clients/service/clients.service.js</code>, <code>./orderDetail.service.js</code>, <code>../../products/service/product.service.js</code>, <code>../../payments/service/paymentRecord.service.js</code>, <code>../../payments/repo/paymentStatus.repo.js</code>, <code>../../users/repo/users.repo.js</code>, <code>./salesNoteSource.service.js</code>, <code>../../../database/prisma.js</code>, <code>../../clients/repo/clients.repo.js</code>, <code>../repo/orderDetail.repo.js</code>, <code>../../products/repo/product.repo.js</code>, <code>../../payments/repo/paymentRecord.repo.js</code>, <code>../../../shared/pagination.js</code>, <code>../../../errors/AppError.js</code>, <code>./salesOrder.errors.js</code>, <code>./salesOrder.validator.js</code>, <code>./salesOrder.transaction.js</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 325 líneas originales; incluidos 140–217. Fuera de extracción: 1–139, 218–325; corresponden al contexto restante del archivo y no se sustituyen por código inventado. Huella SHA-256 inicial del archivo: E26E411E457E79148DAD63D5B01ED897CD73BA5145E4EE12586253E8FCA87814.

**S088: capaServidor/src/modules/orders/service/order.service.js, líneas 140–217.** Componente/función o selectores: getOrderViews/getPagedPaymentWorkspace; validación y fechas UTC. Filtros: Todos salvo filtrado local CAL. Fragmento literal:

```javascript
  async getAllOrders(query = {}) {
    return this.getOrderViews(query, 'kanban');
  }

  async getOrderViews(query = {}, view = 'kanban') {
    const limit = parseLimit(query.limit);
    const cursor = decodeCursor(query.cursor);
    const status = String(query.status ?? "").trim().slice(0, 100) || null;
    const search = String(query.search ?? "").trim().slice(0, 100) || null;
    const productType = String(query.productType ?? "").trim().slice(0, 100) || null;
    const unscheduled = query.unscheduled === 'true';
    if (query.unscheduled !== undefined && query.unscheduled !== 'true' && query.unscheduled !== 'false') {
      throw new AppError(400, 'unscheduled solo admite true o false');
    }
    if (unscheduled && (view !== 'calendar' || query.from || query.to)) {
      throw new AppError(400, 'La consulta de pendientes no admite rango de fechas ni otra vista');
    }
    const parseDate = (value, end = false) => {
      if (!value) return null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
        const error = new AppError(400, "Las fechas deben tener formato YYYY-MM-DD."); throw error;
      }
      const date = new Date(`${value}T00:00:00.000Z`);
      if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) { const error = new AppError(400, "La fecha no es valida."); throw error; }
      return end ? new Date(date.getTime() + 24 * 60 * 60 * 1000) : date;
    };
    const rows = await this.repo.listOrderViews({
      view,
      limit,
      cursor,
      status,
      search,
      productType,
      unscheduled,
      from: parseDate(query.from),
      to: parseDate(query.to, true),
    });
    return pageResult(rows, limit);
  }

  async getOrderViewById(orderId, view = 'kanban') {
    if (!Number.isInteger(Number(orderId)) || Number(orderId) <= 0) throw new AppError(400, 'ID de pedido no valido');
    const order = await this.repo.getOrderView(orderId, view);
    if (!order) throw new AppError(404, 'Pedido no encontrado', 'ORDER_NOT_FOUND');
    return order;
  }

  async getPaymentWorkspace() {
    const [orders, paymentStatuses] = await Promise.all([
      this.repo.getPaymentOrders(),
      this.paymentRepo.getAll(),
    ]);

    return { orders, paymentStatuses };
  }

  async getPagedPaymentWorkspace(query = {}) {
    const limit = parseLimit(query.limit);
    const cursor = decodeCursor(query.cursor);
    const search = String(query.search ?? '').trim().slice(0, 100) || null;
    const status = String(query.status ?? '').trim() || null;
    if (status && !['Pendiente', 'Rechazado', 'Confirmado'].includes(status)) throw new AppError(400, 'Estado de pago no valido');
    const parseDate = (value, end = false) => {
      if (!value) return null;
      const date = new Date(`${value}T00:00:00.000Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value)) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new AppError(400, 'Fecha no valida');
      return end ? new Date(date.getTime() + 86400000) : date;
    };
    const from = parseDate(query.from);
    const to = parseDate(query.to, true);
    if (from && to && from >= to) throw new AppError(400, 'Rango de fechas no valido');
    const [page, paymentStatuses] = await Promise.all([
      this.repo.listPaymentViews({ limit, cursor, status, search, from, to,
        includeSummary: query.includeSummary !== 'false', summaryOnly: query.summaryOnly === 'true' }),
      query.includeSummary === 'false' ? [] : this.paymentRepo.getAll(),
    ]);
    return { ...pageResult(page.rows, limit), counts: page.counts, paymentStatuses };
  }
```

<a id="fuente-S089"></a>

#### S089 — capaServidor/src/modules/orders/repo/kanbanRead.repo.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** listKanbanRows; predicados reales de Kanban y calendario. **Filtros relacionados:** Todos salvo filtrado local CAL.

**Exportaciones declaradas** (línea inicial): 27: export async function listKanbanRows(client, { limit, cursor, status, search, productType, from, to, calendar = false, unscheduled = false }) {; 59: export async function getKanbanRow(client, id, { precheck = false } = {}) {.

**Relaciones/imports originales:** <code>@prisma/client</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 102 líneas originales; incluidos 1–57. Fuera de extracción: 58–102; corresponden al contexto restante del archivo y no se sustituyen por código inventado. Huella SHA-256 inicial del archivo: 02C7C200FEE54F430B2EF8B910D26234D93A82A14BC9BD480D96A321780FDD62.

**S089: capaServidor/src/modules/orders/repo/kanbanRead.repo.js, líneas 1–57.** Componente/función o selectores: listKanbanRows; predicados reales de Kanban y calendario. Filtros: Todos salvo filtrado local CAL. Fragmento literal:

```javascript
import { Prisma } from '@prisma/client';

// Each query has at most one expanding relation. Histories and product flows
// never join each other, so neither comments nor subprocesses multiply rows.
const rootColumns = Prisma.sql`p.id_pedido, p.numero_nota_venta, p.fecha_creacion, p.fecha_estimada_termino,
  p.id_estado_pago, c.nombre_cliente, c.razon_social, ep.orden_kanban, ep.nombre_etapa,
  pay.nombre_estado_pago,
  COALESCE((SELECT JSON_ARRAYAGG(JSON_OBJECT('id_etiqueta', t.id_etiqueta, 'nombre_etiqueta', t.nombre_etiqueta))
    FROM Pedido_Etiqueta pe JOIN etiqueta t ON t.id_etiqueta=pe.id_etiqueta
    WHERE pe.id_pedido=p.id_pedido), JSON_ARRAY()) AS labels`;
const rootJoins = Prisma.sql`LEFT JOIN Cliente c ON c.id_cliente=p.id_cliente
  LEFT JOIN Estado_Pedido ep ON ep.id_estado_pedido=p.id_estado_pedido
  LEFT JOIN Estado_Pago pay ON pay.id_estado_pago=p.id_estado_pago`;

function root(row) {
  const labels = typeof row.labels === 'string' ? JSON.parse(row.labels) : row.labels;
  return { id_pedido: row.id_pedido, numero_nota_venta: row.numero_nota_venta,
    fecha_creacion: row.fecha_creacion, fecha_estimada_termino: row.fecha_estimada_termino,
    id_estado_pago: row.id_estado_pago, Cliente: { nombre_cliente: row.nombre_cliente, razon_social: row.razon_social },
    Estado_Pedido: { orden_kanban: row.orden_kanban, nombre_etapa: row.nombre_etapa },
    Estado_Pago: { nombre_estado_pago: row.nombre_estado_pago },
    Pedido_Etiqueta: [...(labels ?? [])].sort((a, b) => a.id_etiqueta - b.id_etiqueta).map(etiqueta => ({ etiqueta })),
    Detalle_pedido: [], Registros: [], usuario_manager_origen: row.usuario_manager_origen,
    observacion_origen: row.observacion_origen, observacion_interna: row.observacion_interna };
}

export async function listKanbanRows(client, { limit, cursor, status, search, productType, from, to, calendar = false, unscheduled = false }) {
  const conditions = [calendar ? Prisma.sql`1=1` : Prisma.sql`ep.orden_kanban <> 4 AND ep.nombre_etapa NOT IN ('Terminado', 'Cancelado')`];
  if (calendar && unscheduled) conditions.push(Prisma.sql`p.fecha_estimada_termino IS NULL`);
  if (cursor) conditions.push(Prisma.sql`p.id_pedido < ${cursor.id}`);
  if (status) conditions.push(Prisma.sql`ep.nombre_etapa = ${status}`);
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(Prisma.sql`(p.numero_nota_venta LIKE ${pattern} OR c.nombre_cliente LIKE ${pattern} OR c.razon_social LIKE ${pattern})`);
  }
  if (productType) conditions.push(Prisma.sql`EXISTS (SELECT 1 FROM Detalle_pedido fd
    JOIN Tipo_Producto ft ON ft.id_tipo_producto=fd.id_tipo_producto
    WHERE fd.id_pedido=p.id_pedido AND ft.nombre_producto LIKE ${`%${productType}%`})`);
  if (from) conditions.push(Prisma.sql`p.fecha_estimada_termino >= ${from}`);
  if (to) conditions.push(Prisma.sql`p.fecha_estimada_termino < ${to}`);
  const rows = await client.$queryRaw(Prisma.sql`WITH page AS (
    SELECT ${rootColumns} FROM Pedidos p ${rootJoins}
    WHERE ${Prisma.join(conditions, ' AND ')} ORDER BY p.id_pedido DESC LIMIT ${limit + 1}
  ) SELECT page.*, d.id_detalle_pedido, d.cantidad, d.fecha_estimada_termino AS detailDueDate, t.nombre_producto
    FROM page LEFT JOIN Detalle_pedido d ON d.id_pedido=page.id_pedido
    LEFT JOIN Tipo_Producto t ON t.id_tipo_producto=d.id_tipo_producto
    ORDER BY page.id_pedido DESC, d.id_detalle_pedido ASC`);
  const orders = new Map();
  for (const row of rows) {
    if (!orders.has(row.id_pedido)) orders.set(row.id_pedido, root(row));
    if (row.id_detalle_pedido !== null) orders.get(row.id_pedido).Detalle_pedido.push({
      id_detalle_pedido: row.id_detalle_pedido, cantidad: row.cantidad, fecha_estimada_termino: row.detailDueDate,
      Tipo_Producto: { nombre_producto: row.nombre_producto },
    });
  }
  return [...orders.values()];
}
```

<a id="fuente-S090"></a>

#### S090 — capaServidor/src/modules/orders/repo/orderViewOperations.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** DTO resumen y dispatch de lecturas. **Filtros relacionados:** Todos salvo filtrado local CAL.

**Exportaciones declaradas** (línea inicial): 33: export function mapKanbanSummary(row) {; 49: export function mapCalendarSummary(row) {; 114: export async function listOrderViewsOperation(repository, { view, limit, cursor, status, search, productType, from, to, unscheduled = false }) {; 144: export async function getOrderViewOperation(repository, id, view) {; 172: export async function listPaymentViewsOperation(repository, filters) {.

**Relaciones/imports originales:** <code>./paymentWorkspaceRead.repo.js</code>, <code>./kanbanRead.repo.js</code>, <code>./orderMapping.js</code>, <code>./orderProductionRules.js</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 178 líneas originales; incluidos 24–60, 114–142, 172–178. Fuera de extracción: 1–23, 61–113, 143–171; corresponden al contexto restante del archivo y no se sustituyen por código inventado. Huella SHA-256 inicial del archivo: CD2509E337534331E5CBD9A2BE3C0ED3552261896B59B5D427EB2F5EAC810451.

**S090: capaServidor/src/modules/orders/repo/orderViewOperations.js, líneas 24–60.** Componente/función o selectores: DTO resumen y dispatch de lecturas. Filtros: Todos salvo filtrado local CAL. Fragmento literal:

```javascript
function products(row) {
  return (row.Detalle_pedido ?? []).map((detail) => ({
    id_detalle_pedido: detail.id_detalle_pedido,
    product: detail.Tipo_Producto?.nombre_producto ?? null,
    quantity: detail.cantidad ?? null,
    dueDate: detail.fecha_estimada_termino ?? null,
  }));
}

export function mapKanbanSummary(row) {
  return {
    id_pedido: row.id_pedido,
    numero_nota_venta: row.numero_nota_venta,
    nombre_cliente: row.Cliente?.nombre_cliente ?? row.Cliente?.razon_social ?? null,
    fecha_creacion: row.fecha_creacion,
    fecha_estimada_termino: row.fecha_estimada_termino,
    id_etapa_general: row.Estado_Pedido?.orden_kanban ?? null,
    nombre_etapa_general: row.Estado_Pedido?.nombre_etapa ?? null,
    id_estado_pago: row.id_estado_pago,
    estado_pago: row.Estado_Pago?.nombre_estado_pago ?? null,
    etiquetas: (row.Pedido_Etiqueta ?? []).map((entry) => entry.etiqueta).filter(Boolean),
    detalles: products(row),
  };
}

export function mapCalendarSummary(row) {
  return {
    id_pedido: row.id_pedido,
    numero_nota_venta: row.numero_nota_venta,
    nombre_cliente: row.Cliente?.nombre_cliente ?? row.Cliente?.razon_social ?? null,
    fecha_estimada_termino: row.fecha_estimada_termino,
    id_etapa_general: row.Estado_Pedido?.orden_kanban ?? null,
    nombre_etapa_general: row.Estado_Pedido?.nombre_etapa ?? null,
    etiquetas: (row.Pedido_Etiqueta ?? []).map((entry) => entry.etiqueta).filter(Boolean),
    detalles: products(row),
  };
}
```

**S090: capaServidor/src/modules/orders/repo/orderViewOperations.js, líneas 114–142.** Componente/función o selectores: DTO resumen y dispatch de lecturas. Filtros: Todos salvo filtrado local CAL. Fragmento literal:

```javascript
export async function listOrderViewsOperation(repository, { view, limit, cursor, status, search, productType, from, to, unscheduled = false }) {
  if (view === 'kanban') return (await listKanbanRows(repository.client,
    { limit, cursor, status, search, productType, from, to })).map(mapKanbanSummary);
  if (view === 'calendar') return (await listKanbanRows(repository.client,
    { limit, cursor, status, search, productType, from, to, calendar: true, unscheduled })).map(mapCalendarSummary);
  const where = {
    ...(cursor ? { id_pedido: { lt: cursor.id } } : {}),
    ...(view === 'kanban'
      ? { Estado_Pedido: { is: {
        orden_kanban: { not: 4 },
        nombre_etapa: { notIn: ['Terminado', 'Cancelado'], ...(status ? { equals: status } : {}) },
      } } }
      : status ? { Estado_Pedido: { is: { nombre_etapa: status } } } : {}),
    ...(search ? { OR: [
      { numero_nota_venta: { contains: search } },
      { Cliente: { is: { nombre_cliente: { contains: search } } } },
      { Cliente: { is: { razon_social: { contains: search } } } },
    ] } : {}),
    ...(productType ? { Detalle_pedido: { some: { Tipo_Producto: { is: { nombre_producto: { contains: productType } } } } } } : {}),
    ...(unscheduled
      ? { fecha_estimada_termino: null }
      : (from || to) ? { fecha_estimada_termino: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}),
  };
  const rows = await repository.client.pedidos.findMany({
    where, select: view === 'calendar' ? calendarSelect : kanbanSelect,
    orderBy: { id_pedido: 'desc' }, take: limit + 1,
  });
  return rows.map(view === 'calendar' ? mapCalendarSummary : mapKanbanSummary);
}
```

**S090: capaServidor/src/modules/orders/repo/orderViewOperations.js, líneas 172–178.** Componente/función o selectores: DTO resumen y dispatch de lecturas. Filtros: Todos salvo filtrado local CAL. Fragmento literal:

```javascript
export async function listPaymentViewsOperation(repository, filters) {
  const [rows, counts] = await Promise.all([
    filters.summaryOnly ? [] : readPaymentPage(repository.client, filters),
    filters.includeSummary === false ? null : readPaymentCounts(repository.client, filters),
  ]);
  return { rows, counts };
}
```

<a id="fuente-S091"></a>

#### S091 — capaServidor/src/modules/orders/repo/paymentWorkspaceRead.repo.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** readPaymentPage/readPaymentCounts; scope de contadores. **Filtros relacionados:** Todos salvo filtrado local CAL.

**Exportaciones declaradas** (línea inicial): 17: export async function readPaymentPage(client, filters) {; 28: export async function readPaymentCounts(client, filters) {.

**Relaciones/imports originales:** <code>@prisma/client</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 39 líneas originales; incluidos 1–39; cobertura completa. Huella SHA-256 inicial del archivo: 05E625A08C178644D88C977A70E410470D7B8482EE17C2E9136570489EAA4AA5.

**S091: capaServidor/src/modules/orders/repo/paymentWorkspaceRead.repo.js, líneas 1–39.** Componente/función o selectores: readPaymentPage/readPaymentCounts; scope de contadores. Filtros: Todos salvo filtrado local CAL. Fragmento literal:

```javascript
import { Prisma } from '@prisma/client';

// Counts cover search/date, never selected status or cursor. Keep both queries
// independent so the page and its summary still use one concurrent SQL wave.
function conditions({ search, from, to }) {
  const where = [Prisma.sql`1=1`];
  if (search) {
    const pattern = `%${search}%`;
    where.push(Prisma.sql`(p.numero_nota_venta LIKE ${pattern} OR c.nombre_cliente LIKE ${pattern}
      OR c.razon_social LIKE ${pattern} OR c.rut_cliente LIKE ${pattern})`);
  }
  if (from) where.push(Prisma.sql`p.fecha_creacion >= ${from}`);
  if (to) where.push(Prisma.sql`p.fecha_creacion < ${to}`);
  return where;
}

export async function readPaymentPage(client, filters) {
  const where = conditions(filters);
  if (filters.cursor) where.push(Prisma.sql`p.id_pedido < ${filters.cursor.id}`);
  if (filters.status) where.push(Prisma.sql`s.nombre_estado_pago = ${filters.status}`);
  return client.$queryRaw(Prisma.sql`SELECT p.id_pedido, p.numero_nota_venta, p.fecha_creacion,
    p.id_estado_pago, c.nombre_cliente, c.razon_social, c.rut_cliente, s.nombre_estado_pago AS estado_pago
    FROM Pedidos p LEFT JOIN Cliente c ON c.id_cliente=p.id_cliente
    LEFT JOIN Estado_Pago s ON s.id_estado_pago=p.id_estado_pago
    WHERE ${Prisma.join(where, ' AND ')} ORDER BY p.id_pedido DESC LIMIT ${filters.limit + 1}`);
}

export async function readPaymentCounts(client, filters) {
  const rows = await client.$queryRaw(Prisma.sql`SELECT
    COALESCE(SUM(s.nombre_estado_pago = 'Pendiente'), 0) AS pending,
    COALESCE(SUM(s.nombre_estado_pago = 'Rechazado'), 0) AS rejected,
    COALESCE(SUM(s.nombre_estado_pago = 'Confirmado'), 0) AS confirmed
    FROM Pedidos p LEFT JOIN Cliente c ON c.id_cliente=p.id_cliente
    JOIN Estado_Pago s ON s.id_estado_pago=p.id_estado_pago
    WHERE ${Prisma.join(conditions(filters), ' AND ')}`);
  // Compare status names inside MySQL, preserving the COUNT filters' collation.
  const row = rows[0];
  return { pending: Number(row?.pending ?? 0), rejected: Number(row?.rejected ?? 0), confirmed: Number(row?.confirmed ?? 0) };
}
```

<a id="fuente-S092"></a>

#### S092 — capaServidor/src/modules/orders/routes/order.routes.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** Permisos y endpoints GET de órdenes. **Filtros relacionados:** Todos salvo filtrado local CAL.

**Exportaciones declaradas** (línea inicial): 14: export function createOrderRouter({; 110: export default createOrderRouter();.

**Relaciones/imports originales:** <code>express</code>, <code>../../../config/status.js</code>, <code>../../../middlewares/checkJwt.js</code>, <code>../../../middlewares/requireCapability.js</code>, <code>../../../middlewares/requirePin.js</code>, <code>../../../middlewares/requireAdministratorRole.js</code>, <code>../../../middlewares/requireSalesRole.js</code>, <code>../controller/orders.controller.js</code>, <code>./orderDetail.routes.js</code>, <code>../../payments/routes/paymentRecord.routes.js</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 110 líneas originales; incluidos 1–66. Fuera de extracción: 67–110; corresponden al contexto restante del archivo y no se sustituyen por código inventado. Huella SHA-256 inicial del archivo: C1B66640841ABABA9F8DECE597BB080BAD3579C72575DC2034AA2FBA46E0B264.

**S092: capaServidor/src/modules/orders/routes/order.routes.js, líneas 1–66.** Componente/función o selectores: Permisos y endpoints GET de órdenes. Filtros: Todos salvo filtrado local CAL. Fragmento literal:

```javascript
import { Router } from "express";
import {
    UPDATE_PAYMENT_STATUS_PERMISSION,
} from "../../../config/status.js";
import checkJwt from "../../../middlewares/checkJwt.js";
import requireCapability, { PERMISSIONS as P } from "../../../middlewares/requireCapability.js";
import requirePin from "../../../middlewares/requirePin.js";
import requireAdministratorRole from "../../../middlewares/requireAdministratorRole.js";
import requireSalesRole from "../../../middlewares/requireSalesRole.js";
import OrderController from "../controller/orders.controller.js";
import orderDetailRoutes from "./orderDetail.routes.js";
import paymentRecordRoutes from "../../payments/routes/paymentRecord.routes.js";

export function createOrderRouter({
    authenticate = checkJwt,
    authorizePaymentStatusUpdate = requireCapability(
        UPDATE_PAYMENT_STATUS_PERMISSION,
    ),
    authorizeAdministrativeRole = requireCapability(P.REVIEW_ORDERS),
    authorizeCancellation = requireAdministratorRole,
    authorizeSales = requireSalesRole,
    controller = new OrderController(),
    validatePin = requirePin,
} = {}) {
    const router = Router();
    const fallbackController = new OrderController();
    const routeController = {
        getOrders: controller.getOrders ?? fallbackController.getOrders,
        getCalendarOrders: controller.getCalendarOrders ?? fallbackController.getCalendarOrders,
        getKanbanDetail: controller.getKanbanDetail ?? fallbackController.getKanbanDetail,
        getKanbanPrecheck: controller.getKanbanPrecheck ?? fallbackController.getKanbanPrecheck,
        getCalendarDetail: controller.getCalendarDetail ?? fallbackController.getCalendarDetail,
        getPaymentWorkspace:
            controller.getPaymentWorkspace ?? fallbackController.getPaymentWorkspace,
        getOrder: controller.getOrder ?? fallbackController.getOrder,
        getSalesNote: controller.getSalesNote ?? fallbackController.getSalesNote,
        createOrder: controller.createOrder ?? fallbackController.createOrder,
        updatePaymentStatus:
            controller.updatePaymentStatus ?? fallbackController.updatePaymentStatus,
        updateGeneralStep:
            controller.updateGeneralStep ?? fallbackController.updateGeneralStep,
        sendToReview: controller.sendToReview ?? fallbackController.sendToReview,
        cancelProduction:
            controller.cancelProduction ?? fallbackController.cancelProduction,
        rollbackSubprocess:
            controller.rollbackSubprocess ?? fallbackController.rollbackSubprocess,
        reevaluate: controller.reevaluate ?? fallbackController.reevaluate,
        setLabel: controller.setLabel ?? fallbackController.setLabel,
        updateDeliveryDate:
            controller.updateDeliveryDate ?? fallbackController.updateDeliveryDate,
        completeSubprocess:
            controller.completeSubprocess ?? fallbackController.completeSubprocess,
    };

    router.get("/", authenticate, requireCapability(P.READ_ORDERS), routeController.getOrders);
    router.get("/kanban", authenticate, requireCapability(P.READ_ORDERS), routeController.getOrders);
    router.get("/kanban-summary", authenticate, requireCapability(P.READ_ORDERS), routeController.getOrders);
    router.get("/calendar-summary", authenticate, requireCapability(P.READ_CALENDAR), routeController.getCalendarOrders);
    router.get("/payments", authenticate, requireCapability(P.READ_PAYMENTS), routeController.getPaymentWorkspace);
    router.get("/sales-notes/:numeroNota", authenticate, requireCapability(P.READ_SALES_NOTES), routeController.getSalesNote);
    router.use("/:orderId/details", orderDetailRoutes);
    router.use("/:orderId/payment-records", paymentRecordRoutes);
    router.get("/:orderId/kanban-detail", authenticate, requireCapability(P.READ_ORDERS), routeController.getKanbanDetail);
    router.get("/:orderId/kanban-precheck", authenticate, requireCapability(P.READ_ORDERS), routeController.getKanbanPrecheck);
    router.get("/:orderId/calendar-detail", authenticate, requireCapability(P.READ_CALENDAR), routeController.getCalendarDetail);
    router.get("/:orderId", authenticate, requireCapability(P.READ_ORDERS), routeController.getOrder);
```

<a id="fuente-S093"></a>

#### S093 — capaServidor/src/modules/history/service/orderHistory.service.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** Fechas, búsqueda temporal implícita y tipos de evento. **Filtros relacionados:** Todos salvo filtrado local CAL.

**Exportaciones declaradas** (línea inicial): 252: export default class OrderHistoryService {.

**Relaciones/imports originales:** <code>../../../errors/AppError.js</code>, <code>../repo/orderHistory.repo.js</code>, <code>../../orders/repo/orderProductionRules.js</code>, <code>../../../shared/pagination.js</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 306 líneas originales; incluidos 1–66, 96–104, 224–306. Fuera de extracción: 67–95, 105–223; corresponden al contexto restante del archivo y no se sustituyen por código inventado. Huella SHA-256 inicial del archivo: D5C46BDD84D67352C1ACE1E77FA91FCAAA70391FA64066424C16D96EEEDCC836.

**S093: capaServidor/src/modules/history/service/orderHistory.service.js, líneas 1–66.** Componente/función o selectores: Fechas, búsqueda temporal implícita y tipos de evento. Filtros: Todos salvo filtrado local CAL. Fragmento literal:

```javascript
import { AppError } from "../../../errors/AppError.js";
import OrderHistoryRepository from "../repo/orderHistory.repo.js";
import { stripLanyardProgressObservation } from '../../orders/repo/orderProductionRules.js';
import {
    decodeCursor,
    decodeHistoryEventCursor,
    encodeHistoryEventCursor,
    pageResult,
    parseLimit,
} from "../../../shared/pagination.js";

const EVENT_TYPES = new Set(["all", "stage", "payment", "subprocess", "calendar", "general"]);
const CALENDARIZATION_DESCRIPTION_PREFIX = "Fecha de termino definida para ";

function httpError(statusCode, message) {
    const error = new AppError(statusCode, message);
    return error;
}

function positiveInteger(value, fallback, field) {
    if (value === undefined || value === null || value === "") return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw httpError(400, `${field} debe ser un entero positivo.`);
    }
    return parsed;
}

function dateRangeFromSearch(search) {
    const match = String(search ?? "").trim().match(/^(\d{2})-(\d{2})-(\d{4})$|^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;

    const year = Number(match[3] ?? match[4]);
    const month = Number(match[2] ?? match[5]);
    const day = Number(match[1] ?? match[6]);
    const start = new Date(Date.UTC(year, month - 1, day));

    if (
        start.getUTCFullYear() !== year ||
        start.getUTCMonth() !== month - 1 ||
        start.getUTCDate() !== day
    ) return null;

    return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

function dateRangeFromQuery(from, to) {
    if (!from && !to) return null;
    const parse = (value, field) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) {
            throw httpError(400, `${field} debe tener formato YYYY-MM-DD.`);
        }
        const date = new Date(`${value}T00:00:00.000Z`);
        if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw httpError(400, `${field} no es una fecha valida.`);
        return date;
    };
    const start = from ? parse(from, "from") : undefined;
    const selectedEnd = to ? parse(to, "to") : undefined;
    if (start && selectedEnd && start > selectedEnd) {
        throw httpError(400, "La fecha desde no puede ser posterior a la fecha hasta.");
    }
    return {
        start,
        end: selectedEnd ? new Date(selectedEnd.getTime() + 24 * 60 * 60 * 1000) : undefined,
    };
}
```

**S093: capaServidor/src/modules/history/service/orderHistory.service.js, líneas 96–104.** Componente/función o selectores: Fechas, búsqueda temporal implícita y tipos de evento. Filtros: Todos salvo filtrado local CAL. Fragmento literal:

```javascript
function mapSummary(order) {
    return {
        id: order.id_pedido,
        salesNoteNumber: order.numero_nota_venta,
        clientName: order.Cliente?.nombre_cliente ?? order.Cliente?.razon_social ?? null,
        status: order.Estado_Pedido?.nombre_etapa ?? null,
        createdAt: order.fecha_creacion,
    };
}
```

**S093: capaServidor/src/modules/history/service/orderHistory.service.js, líneas 224–306.** Componente/función o selectores: Fechas, búsqueda temporal implícita y tipos de evento. Filtros: Todos salvo filtrado local CAL. Fragmento literal:

```javascript
function eventPageInfo(records, limit) {
    const hasMore = records.length > limit;
    const visibleRecords = hasMore ? records.slice(0, limit) : records;
    const last = visibleRecords.at(-1);
    return {
        visibleRecords,
        pageInfo: {
            limit,
            nextCursor: hasMore && last ? encodeHistoryEventCursor(last) : null,
            hasMore,
        },
    };
}

function parseEventQuery(orderId, query) {
    const parsedId = positiveInteger(orderId, null, "orderId");
    const type = String(query.type ?? "all").trim().toLowerCase();
    if (!EVENT_TYPES.has(type)) {
        throw httpError(400, "type debe ser all, stage, payment, subprocess, calendar o general.");
    }
    return {
        orderId: parsedId,
        type,
        limit: parseLimit(query.limit),
        cursor: decodeHistoryEventCursor(query.cursor),
    };
}

export default class OrderHistoryService {
    constructor({ repo } = {}) {
        this.repo = repo ?? new OrderHistoryRepository();
    }

    async listOrders(query = {}) {
        const limit = parseLimit(query.limit);
        const cursor = decodeCursor(query.cursor);
        const status = String(query.status ?? "").trim();
        const search = String(query.search ?? "").trim();
        const selectedDateRange = dateRangeFromQuery(query.from, query.to);
        const orders = await this.repo.list({
            status: status || null,
            search: search || null,
            dateRange: selectedDateRange ?? dateRangeFromSearch(search),
            cursor,
            limit,
        });

        return pageResult(orders, limit, mapSummary);
    }

    async getOrderHistory(orderId, query = {}, options = {}) {
        const { orderId: parsedId, type, limit, cursor } = parseEventQuery(orderId, query);
        const [order, records] = await Promise.all([
            this.repo.getById(parsedId),
            this.repo.listEvents({
                orderId: parsedId,
                type,
                cursor,
                limit,
                includePaymentDetails: options.includePaymentDetails === true,
            }),
        ]);
        if (!order) throw httpError(404, "Pedido no encontrado.");
        const { visibleRecords, pageInfo } = eventPageInfo(records, limit);
        return {
            ...mapDetail(order, visibleRecords, options),
            pageInfo,
        };
    }

    async listOrderEvents(orderId, query = {}, options = {}) {
        const parsed = parseEventQuery(orderId, query);
        const records = await this.repo.listEvents({
            ...parsed,
            includePaymentDetails: options.includePaymentDetails === true,
        });
        const { visibleRecords, pageInfo } = eventPageInfo(records, parsed.limit);
        return {
            events: visibleRecords.map((record) => mapEvent(record, options)),
            pageInfo,
        };
    }
}
```

<a id="fuente-S094"></a>

#### S094 — capaServidor/src/modules/history/repo/historyRead.repo.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** orderListQuery; predicados del historial. **Filtros relacionados:** Todos salvo filtrado local CAL.

**Exportaciones declaradas** (línea inicial): 3: export function orderListQuery({status,search,dateRange,cursor,limit}) {; 24: export const orderHeaderQuery = id => Prisma.sql`; 37: export const orderChildrenQuery = id => Prisma.sql`.

**Relaciones/imports originales:** <code>@prisma/client</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 52 líneas originales; incluidos 1–22. Fuera de extracción: 23–52; corresponden al contexto restante del archivo y no se sustituyen por código inventado. Huella SHA-256 inicial del archivo: 073E7910E4679F31062DC516C55DA7755A79D0D75ACE8AE61585AEF02C1E5D9A.

**S094: capaServidor/src/modules/history/repo/historyRead.repo.js, líneas 1–22.** Componente/función o selectores: orderListQuery; predicados del historial. Filtros: Todos salvo filtrado local CAL. Fragmento literal:

```javascript
import { Prisma } from '@prisma/client';

export function orderListQuery({status,search,dateRange,cursor,limit}) {
    const filters = [];
    if (cursor) filters.push(Prisma.sql`p.id_pedido < ${cursor.id}`);
    if (status) filters.push(Prisma.sql`ep.nombre_etapa = ${status}`);
    if (search) {
        const pattern = `%${search}%`;
        filters.push(Prisma.sql`(p.numero_nota_venta LIKE ${pattern} OR c.nombre_cliente LIKE ${pattern} OR c.razon_social LIKE ${pattern})`);
    }
    if (dateRange?.start) filters.push(Prisma.sql`p.fecha_creacion >= ${dateRange.start}`);
    if (dateRange?.end) filters.push(Prisma.sql`p.fecha_creacion < ${dateRange.end}`);
    return Prisma.sql`
        SELECT p.id_pedido,p.numero_nota_venta,p.fecha_creacion,
               c.id_cliente AS relatedClient,c.nombre_cliente,c.razon_social,
               ep.id_estado_pedido,ep.nombre_etapa,ep.orden_kanban
        FROM Pedidos p
        LEFT JOIN Cliente c ON c.id_cliente=p.id_cliente
        LEFT JOIN Estado_Pedido ep ON ep.id_estado_pedido=p.id_estado_pedido
        ${filters.length ? Prisma.sql`WHERE ${Prisma.join(filters,' AND ')}` : Prisma.empty}
        ORDER BY p.id_pedido DESC LIMIT ${limit+1}`;
}
```

<a id="fuente-S095"></a>

#### S095 — capaServidor/src/modules/history/repo/orderHistory.repo.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** EVENT_TYPE_SQL y listEvents; predicados y cursores compuestos. **Filtros relacionados:** Todos salvo filtrado local CAL.

**Exportaciones declaradas** (línea inicial): 89: export default class OrderHistoryRepository {.

**Relaciones/imports originales:** <code>../../../database/prisma.js</code>, <code>./historyRead.repo.js</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 179 líneas originales; incluidos 1–13, 127–179. Fuera de extracción: 14–126; corresponden al contexto restante del archivo y no se sustituyen por código inventado. Huella SHA-256 inicial del archivo: E016625232B6F7B575A65A1DC7CDBB19285E704EB7CEF7794B445AD2F4587B9F.

**S095: capaServidor/src/modules/history/repo/orderHistory.repo.js, líneas 1–13.** Componente/función o selectores: EVENT_TYPE_SQL y listEvents; predicados y cursores compuestos. Filtros: Todos salvo filtrado local CAL. Fragmento literal:

```javascript
import getPrismaClient from "../../../database/prisma.js";
import { orderListQuery, orderHeaderQuery, orderChildrenQuery } from './historyRead.repo.js';

const CALENDARIZATION_DESCRIPTION_PREFIX = "Fecha de termino definida para ";

const EVENT_TYPE_SQL = Object.freeze({
    all: "",
    stage: "AND re.id_registro IS NOT NULL",
    payment: "AND rp.id_registro IS NOT NULL",
    subprocess: "AND rs.id_registro IS NOT NULL",
    calendar: "AND re.id_registro IS NULL AND rp.id_registro IS NULL AND rs.id_registro IS NULL AND r.observacion LIKE ?",
    general: "AND re.id_registro IS NULL AND rp.id_registro IS NULL AND rs.id_registro IS NULL AND (r.observacion IS NULL OR r.observacion NOT LIKE ?)",
});
```

**S095: capaServidor/src/modules/history/repo/orderHistory.repo.js, líneas 127–179.** Componente/función o selectores: EVENT_TYPE_SQL y listEvents; predicados y cursores compuestos. Filtros: Todos salvo filtrado local CAL. Fragmento literal:

```javascript
    async listEvents({ orderId, type, cursor, limit, includePaymentDetails = false }) {
        if (!Object.hasOwn(EVENT_TYPE_SQL, type)) {
            throw new TypeError("Tipo de evento de historial desconocido.");
        }
        const typeSql = EVENT_TYPE_SQL[type];
        const cursorSql = cursor
            ? "AND (r.FECHA_HORA < ? OR (r.FECHA_HORA = ? AND r.ID_REGISTRO < ?))"
            : "";
        const query = `
            SELECT r.ID_REGISTRO, r.FECHA_HORA,
                   CASE WHEN rp.id_registro IS NOT NULL AND ? = 0 THEN NULL ELSE r.id_usuario END AS id_usuario_visible,
                   CASE WHEN rp.id_registro IS NOT NULL AND ? = 0 THEN NULL ELSE r.observacion END AS observacion_visible,
                   CASE WHEN rp.id_registro IS NOT NULL AND ? = 0 THEN NULL ELSE u.nombre_usuario END AS nombre_usuario_visible,
                   CASE WHEN rp.id_registro IS NOT NULL AND ? = 0 THEN NULL ELSE u.apellido_usuario END AS apellido_usuario_visible,
                   re.id_registro AS stage_record_id, re.fecha_hora_entrada AS stage_entered_at,
                   re.fecha_hora_salida AS stage_exited_at, stage.nombre_etapa AS stage_name,
                   rp.id_registro AS payment_record_id,
                   CASE WHEN ? = 1 THEN rp.observacion ELSE NULL END AS payment_observation,
                   previous_payment.nombre_estado_pago AS previous_payment_status,
                   next_payment.nombre_estado_pago AS next_payment_status,
                   rs.id_registro AS subprocess_record_id,
                   rs.fecha_hora_entrada AS subprocess_entered_at,
                   rs.fecha_hora_salida AS subprocess_exited_at,
                   subprocess.nombre_estado AS subprocess_name,
                   product.nombre_producto AS product_name
            FROM Registros r
            LEFT JOIN Usuario u ON u.id_usuario = r.id_usuario
            LEFT JOIN Registro_Etapas re ON re.id_registro = r.ID_REGISTRO
            LEFT JOIN Estado_Pedido stage ON stage.id_estado_pedido = re.id_estado_pedido
            LEFT JOIN Registro_Pago rp ON rp.id_registro = r.ID_REGISTRO
            LEFT JOIN Estado_Pago previous_payment ON previous_payment.id_estado_pago = rp.id_estado_pago_anterior
            LEFT JOIN Estado_Pago next_payment ON next_payment.id_estado_pago = rp.id_estado_pago_nuevo
            LEFT JOIN registro_subprocesos rs ON rs.id_registro = r.ID_REGISTRO
            LEFT JOIN Estado_Subprocesos subprocess ON subprocess.id_estado_subproceso = rs.id_estado_subproceso
            LEFT JOIN Detalle_pedido detail ON detail.id_detalle_pedido = rs.id_detalle_pedido
            LEFT JOIN Tipo_Producto product ON product.id_tipo_producto = detail.id_tipo_producto
            WHERE r.id_pedido = ?
            ${typeSql}
            ${cursorSql}
            ORDER BY r.FECHA_HORA DESC, r.ID_REGISTRO DESC
            LIMIT ?
        `;
        const paymentFlag = includePaymentDetails ? 1 : 0;
        const parameters = [paymentFlag, paymentFlag, paymentFlag, paymentFlag, paymentFlag, Number(orderId)];
        if (type === "calendar" || type === "general") {
            parameters.push(`${CALENDARIZATION_DESCRIPTION_PREFIX}%`);
        }
        if (cursor) parameters.push(cursor.occurredAt, cursor.occurredAt, cursor.id);
        parameters.push(limit + 1);
        const rows = await this.client.$queryRawUnsafe(query, ...parameters);
        return rows.map(mapEventRow);
    }
}
```

<a id="fuente-S096"></a>

#### S096 — capaServidor/src/modules/history/routes/orderHistory.routes.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** Endpoints y permisos del historial. **Filtros relacionados:** Todos salvo filtrado local CAL.

**Exportaciones declaradas** (línea inicial): 6: export function createOrderHistoryRouter({; 17: export default createOrderHistoryRouter();.

**Relaciones/imports originales:** <code>../../../middlewares/requireCapability.js</code>, <code>express</code>, <code>../../../middlewares/checkJwt.js</code>, <code>../controller/orderHistory.controller.js</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 17 líneas originales; incluidos 1–17; cobertura completa. Huella SHA-256 inicial del archivo: FECD505A9B7BD36D7C978BF820CD444FCC031CE23E1F46C453AC0907B3B70363.

**S096: capaServidor/src/modules/history/routes/orderHistory.routes.js, líneas 1–17.** Componente/función o selectores: Endpoints y permisos del historial. Filtros: Todos salvo filtrado local CAL. Fragmento literal:

```javascript
import requireCapability, { PERMISSIONS as P } from "../../../middlewares/requireCapability.js";
import { Router } from "express";
import checkJwt from "../../../middlewares/checkJwt.js";
import OrderHistoryController from "../controller/orderHistory.controller.js";

export function createOrderHistoryRouter({
    authenticate = checkJwt,
    controller = new OrderHistoryController(),
} = {}) {
    const router = Router();
    router.get("/orders", authenticate, requireCapability(P.READ_ORDERS), controller.listOrders);
    router.get("/orders/:orderId/events", authenticate, requireCapability(P.READ_ORDERS), controller.listOrderEvents);
    router.get("/orders/:orderId", authenticate, requireCapability(P.READ_ORDERS), controller.getOrderHistory);
    return router;
}

export default createOrderHistoryRouter();
```

<a id="fuente-S097"></a>

#### S097 — capaServidor/src/modules/users/validators/adminUsers.validator.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** validateListUsersQuery/validateUserMovementsQuery. **Filtros relacionados:** Todos salvo filtrado local CAL.

**Exportaciones declaradas** (línea inicial): 19: export function validateListUsersQuery(query = {}) {; 50: export function validateUserMovementsQuery(query = {}) {.

**Relaciones/imports originales:** <code>../../../config/roles.js</code>, <code>../../../config/userLifecycle.js</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 65 líneas originales; incluidos 1–65; cobertura completa. Huella SHA-256 inicial del archivo: 3568F824C0A760E5C7442AA6CB592A3B26CCE35AC8E673DD6C8279EA9A8EFBE6.

**S097: capaServidor/src/modules/users/validators/adminUsers.validator.js, líneas 1–65.** Componente/función o selectores: validateListUsersQuery/validateUserMovementsQuery. Filtros: Todos salvo filtrado local CAL. Fragmento literal:

```javascript
import { FUNCTIONAL_ROLES } from '../../../config/roles.js';
import { USER_STATUS_FILTERS } from '../../../config/userLifecycle.js';
const LIST_USER_STATUSES = new Set(USER_STATUS_FILTERS);

function invalidRequest(message) {
    return { valid: false, message };
}

function parseIntegerQuery(value, fallback, { min, max }) {
    const parsedValue = Number.parseInt(value, 10);

    if (!Number.isInteger(parsedValue)) {
        return fallback;
    }

    return Math.min(Math.max(parsedValue, min), max);
}

export function validateListUsersQuery(query = {}) {
    const page = parseIntegerQuery(query.page, 1, { min: 1, max: 500 });
    const perPage = parseIntegerQuery(query.perPage, 10, { min: 1, max: 50 });
    const search = typeof query.search === "string" ? query.search.trim() : "";
    const estadoUsuario =
        typeof query.estadoUsuario === "string"
            ? query.estadoUsuario.trim()
            : "";
    const rolUsuario =
        typeof query.rolUsuario === "string" ? query.rolUsuario.trim() : "";

    if (estadoUsuario && !LIST_USER_STATUSES.has(estadoUsuario)) {
        return invalidRequest("El estadoUsuario no es valido.");
    }

    if (rolUsuario && !FUNCTIONAL_ROLES.includes(rolUsuario)) {
        return invalidRequest("El rolUsuario no es valido.");
    }

    return {
        valid: true,
        filters: {
            page,
            perPage,
            search,
            estadoUsuario,
            rolUsuario,
        },
    };
}

export function validateUserMovementsQuery(query = {}) {
    const page = Number(query.page ?? 1);
    const perPage = Number(query.perPage ?? 10);
    if (
        !Number.isSafeInteger(page) || page < 1 ||
        !Number.isSafeInteger(perPage) || perPage < 1 || perPage > 50 ||
        !Number.isSafeInteger(page * perPage) ||
        (query.page !== undefined && typeof query.page !== "string") ||
        (query.perPage !== undefined && typeof query.perPage !== "string")
    ) return invalidRequest("La paginación de movimientos no es válida.");
    if (query.search !== undefined && (typeof query.search !== 'string' || query.search.trim().length > 120)) {
        return invalidRequest("La búsqueda de movimientos no es válida.");
    }
    const search = query.search?.trim();
    return { valid: true, filters: { page, perPage, ...(search ? { search } : {}) } };
}
```

<a id="fuente-S098"></a>

#### S098 — capaServidor/src/modules/users/routes/keycloakIdentityPreparation.routes.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** Contexto, validación y consultas administrativas. **Filtros relacionados:** Todos salvo filtrado local CAL.

**Exportaciones declaradas** (línea inicial): 11: export function createKeycloakIdentityPreparationRouter({ authenticate = checkJwt, service } = {}) {.

**Relaciones/imports originales:** <code>express</code>, <code>../../../middlewares/checkJwt.js</code>, <code>../../../middlewares/requireAdministrativeRole.js</code>, <code>../../../errors/httpErrors.js</code>, <code>../../../../../shared/keycloakAuthorization.js</code>, <code>../service/keycloakIdentityAdministration.service.js</code>, <code>../service/keycloakManagement.service.js</code>, <code>../validators/adminUsers.validator.js</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 68 líneas originales; incluidos 1–48. Fuera de extracción: 49–68; corresponden al contexto restante del archivo y no se sustituyen por código inventado. Huella SHA-256 inicial del archivo: F0E13B5BB641498A95473FAAACDFD6C70C24DA58E1EB55281B05C5567F376208.

**S098: capaServidor/src/modules/users/routes/keycloakIdentityPreparation.routes.js, líneas 1–48.** Componente/función o selectores: Contexto, validación y consultas administrativas. Filtros: Todos salvo filtrado local CAL. Fragmento literal:

```javascript
import { Router } from 'express';
import checkJwt from '../../../middlewares/checkJwt.js';
import requireAdministrativeRole from '../../../middlewares/requireAdministrativeRole.js';
import { respondError } from '../../../errors/httpErrors.js';
import { roleFromPayload } from '../../../../../shared/keycloakAuthorization.js';
import { IdentityAdministrationError } from '../service/keycloakIdentityAdministration.service.js';
import { KeycloakServiceError } from '../service/keycloakManagement.service.js';
import { validateListUsersQuery, validateUserMovementsQuery } from '../validators/adminUsers.validator.js';

// Mounted by the normal server when IDENTITY_PREPARATION_ENABLED=true.
export function createKeycloakIdentityPreparationRouter({ authenticate = checkJwt, service } = {}) {
  if (!service) throw Error('El servicio administrativo es obligatorio.');
  const router = Router();
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use(authenticate, requireAdministrativeRole);
  const context = req => ({ provider: req.identityProvider, subject: req.auth?.payload?.sub,
    role: roleFromPayload(req.auth?.payload), permissions: req.auth?.payload?.permissions, pin: req.body?.pin,
    currentUser: req.currentUser });
  const run = action => async (req, res) => {
    try { await action(req, res); }
    catch (error) {
      if (error instanceof IdentityAdministrationError || error instanceof KeycloakServiceError) {
        const messages = {
          IDENTITY_UPDATE_BUSY: 'Otro cambio de este usuario esta en curso. Actualiza e intenta nuevamente.',
          IDENTITY_UPDATE_REQUIRES_REVIEW: 'La actualizacion quedo incompleta y el acceso permanece bloqueado. Requiere revision administrativa.',
          IDENTITY_INPUT_INVALID: 'Revisa el nombre, apellido, correo, rol y estado ingresados.',
        };
        return res.status(error.status).json({ code: error.code, message: messages[error.code] ?? 'La operacion administrativa no pudo completarse.' });
      }
      return respondError(error, req, res);
    }
  };
  router.get('/users', run(async (req, res) => {
    const query = validateListUsersQuery(req.query);
    if (!query.valid) return res.status(400).json({ message: query.message });
    return res.json(await service.list(context(req), query.filters));
  }));
  router.get('/users/summary', run(async (req, res) => res.json(await service.summary(context(req)))));
  router.get('/users/:subject/movements', run(async (req, res) => {
    const query = validateUserMovementsQuery(req.query);
    if (!query.valid) return res.status(400).json({ message: query.message });
    return res.json(await service.movements(context(req), req.params.subject, query.filters));
  }));
  router.get('/identities/by-username/:username', run(async (req, res) => {
    const user = await service.findByUsername(context(req), req.params.username);
    return res.status(user ? 200 : 404).json(user ?? { code: 'IDENTITY_NOT_FOUND' });
  }));
  router.get('/identities/:subject', run(async (req, res) => res.json(await service.inspect(context(req), req.params.subject))));
```

<a id="fuente-S099"></a>

#### S099 — capaServidor/src/modules/users/service/keycloakIdentityAdministration.service.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** Autorización, listado por issuer, resumen y movimientos. **Filtros relacionados:** Todos salvo filtrado local CAL.

**Exportaciones declaradas** (línea inicial): 9: export class IdentityAdministrationError extends Error {; 56: export class KeycloakIdentityAdministrationService {.

**Relaciones/imports originales:** <code>./generarContrasena.js</code>, <code>node:crypto</code>, <code>../../../../../shared/keycloakAuthorization.js</code>, <code>../../../config/userLifecycle.js</code>, <code>../repo/keycloakIdentity.repo.js</code>, <code>./keycloakManagement.service.js</code>, <code>../../auth/service/pin.service.js</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 266 líneas originales; incluidos 55–103, 173–180. Fuera de extracción: 1–54, 104–172, 181–266; corresponden al contexto restante del archivo y no se sustituyen por código inventado. Huella SHA-256 inicial del archivo: 44135BC6F0D471D8946E5EBF764517E46A287223D9E579FC1F8EC4656D666E1F.

**S099: capaServidor/src/modules/users/service/keycloakIdentityAdministration.service.js, líneas 55–103.** Componente/función o selectores: Autorización, listado por issuer, resumen y movimientos. Filtros: Todos salvo filtrado local CAL. Fragmento literal:

```javascript

export class KeycloakIdentityAdministrationService {
  constructor({ management, repository = new KeycloakIdentityRepository(), pins = pinService } = {}) {
    this.management = management ?? new KeycloakManagementService();
    this.repository = repository;
    this.pins = pins;
  }
  async authorize(context, { mutation = false, revalidate = false } = {}) {
    if (context?.provider !== 'keycloak' || typeof context.subject !== 'string' || !context.subject || context.subject.length > 128
      || !can(context.role, context.permissions, PERMISSIONS.MANAGE_USERS)) reject('IDENTITY_ADMIN_FORBIDDEN', 403);
    // Reuse middleware identity only for immediate reads. Mutations and checks
    // after remote work still consult current authorization, including around PIN.
    let actor;
    if (!mutation && !revalidate && context.currentUser !== undefined) {
      const current = context.currentUser;
      if (current?.identitySubject !== context.subject || !Number.isSafeInteger(current?.idUsuario)
        || current.idUsuario <= 0) reject('IDENTITY_ADMIN_FORBIDDEN', 403);
      actor = { id_usuario: current.idUsuario, rol_usuario: current.rolUsuario, estado_usuario: current.estadoUsuario };
    } else actor = await this.repository.actor(context.subject);
    if (!actor || !isActiveUserStatus(actor.estado_usuario) || actor.rol_usuario !== context.role) reject('IDENTITY_ADMIN_FORBIDDEN', 403);
    if (mutation) {
      const pinActor = await this.pins.validate(context.subject, context.pin);
      if (pinActor.idUsuario !== actor.id_usuario) reject('IDENTITY_ADMIN_FORBIDDEN', 403);
      // Recheck local revocation after PIN validation.
      const current = await this.repository.actor(context.subject);
      if (current?.id_usuario !== actor.id_usuario || current?.rol_usuario !== context.role
        || !isActiveUserStatus(current?.estado_usuario)) reject('IDENTITY_ADMIN_FORBIDDEN', 403);
    }
    return actor.id_usuario;
  }
  async inspect(context, subject, { revalidateActor = false } = {}) {
    await this.authorize(context, { revalidate: revalidateActor });
    if (subject === context.subject) reject('IDENTITY_SELF_TARGET_FORBIDDEN', 403);
    const binding = await this.repository.binding(this.management.config.issuer, subject);
    if (!binding || !ASSIGNABLE_ROLES.includes(binding.Usuario.rol_usuario)) reject('IDENTITY_TARGET_FORBIDDEN', 403);
    if (binding.Usuario.estado_usuario?.startsWith('Actualizando:')) reject('IDENTITY_UPDATE_BUSY');
    const [external, roles] = await Promise.all([this.management.getUser(subject), this.management.roles(subject)]);
    if (binding.subject !== subject || binding.Usuario.id_usuario !== binding.user_id || binding.username !== external.username || roles.length !== 1
      || roles[0].name !== binding.Usuario.rol_usuario) reject('IDENTITY_BINDING_CONFLICT');
    return { localUserId: binding.user_id, subject, username: external.username, email: binding.Usuario.correo_usuario,
      firstName: binding.Usuario.nombre_usuario, lastName: binding.Usuario.apellido_usuario,
      externalEmail: external.email ?? null, issuer: binding.issuer, role: binding.Usuario.rol_usuario,
      localState: binding.Usuario.estado_usuario, enabled: external.enabled };
  }
  async list(context, filters) {
    await this.authorize(context);
    if (filters.rolUsuario && !ASSIGNABLE_ROLES.includes(filters.rolUsuario)) reject('IDENTITY_TARGET_FORBIDDEN', 403);
    return this.repository.list(this.management.config.issuer, filters);
  }
```

**S099: capaServidor/src/modules/users/service/keycloakIdentityAdministration.service.js, líneas 173–180.** Componente/función o selectores: Autorización, listado por issuer, resumen y movimientos. Filtros: Todos salvo filtrado local CAL. Fragmento literal:

```javascript
  async summary(context) {
    await this.authorize(context);
    return this.repository.summary(this.management.config.issuer);
  }
  async movements(context, subject, filters) {
    const target = await this.inspect(context, subject);
    return this.repository.movements(target.localUserId, filters);
  }
```

<a id="fuente-S100"></a>

#### S100 — capaServidor/src/modules/users/repo/keycloakIdentity.repo.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** Predicado, listado paginado y resumen por issuer. **Filtros relacionados:** Todos salvo filtrado local CAL.

**Exportaciones declaradas** (línea inicial): 25: export class KeycloakIdentityRepository {.

**Relaciones/imports originales:** <code>../../../database/identityBinding.js</code>, <code>@prisma/client</code>, <code>node:crypto</code>, <code>../../../database/prisma.js</code>, <code>../../../config/userLifecycle.js</code>, <code>../../../../../shared/keycloakAuthorization.js</code>, <code>./userMovements.repo.js</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 186 líneas originales; incluidos 1–68. Fuera de extracción: 69–186; corresponden al contexto restante del archivo y no se sustituyen por código inventado. Huella SHA-256 inicial del archivo: 9F1A5226D6DB5784A030C6564BC7840B929D49119C6FBC4F32CB67A57B3696F2.

**S100: capaServidor/src/modules/users/repo/keycloakIdentity.repo.js, líneas 1–68.** Componente/función o selectores: Predicado, listado paginado y resumen por issuer. Filtros: Todos salvo filtrado local CAL. Fragmento literal:

```javascript
import { identityUserWhere } from '../../../database/identityBinding.js';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import getPrismaClient from '../../../database/prisma.js';
import { isActiveUserStatus, ACTIVE_USER_STATUSES, USER_STATUS } from '../../../config/userLifecycle.js';
import { ADMIN_ROLES, ASSIGNABLE_ROLES } from '../../../../../shared/keycloakAuthorization.js';
import { UserMovementsRepository } from './userMovements.repo.js';

function listPredicate(issuer, { search = '', estadoUsuario = '', rolUsuario = '' } = {}) {
  const conditions = [Prisma.sql`e.provider = 'keycloak'`, Prisma.sql`e.issuer = ${issuer}`,
    Prisma.sql`u.rol_usuario IN (${Prisma.join([...ASSIGNABLE_ROLES])})`];
  if (rolUsuario) conditions.push(Prisma.sql`u.rol_usuario = ${rolUsuario}`);
  if (estadoUsuario) conditions.push(ACTIVE_USER_STATUSES.includes(estadoUsuario)
    ? Prisma.sql`u.estado_usuario IN (${Prisma.join([...ACTIVE_USER_STATUSES])})`
    : Prisma.sql`u.estado_usuario = ${estadoUsuario}`);
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(Prisma.sql`(u.nombre_usuario LIKE ${pattern} OR u.apellido_usuario LIKE ${pattern}
      OR u.correo_usuario LIKE ${pattern} OR u.rut_usuario LIKE ${pattern} OR e.username LIKE ${pattern})`);
  }
  return Prisma.join(conditions, ' AND ');
}

// Explicit external bindings preserve local keys and actor ownership.
export class KeycloakIdentityRepository {
  constructor({ prisma } = {}) { this.prisma = prisma; }
  get client() { return this.prisma ?? getPrismaClient(); }
  userScope(issuer, { search = '', estadoUsuario = '', rolUsuario = '' } = {}) {
    const where = { rol_usuario: { in: [...ASSIGNABLE_ROLES] }, ExternalIdentity: { is: { provider: 'keycloak', issuer } } };
    if (rolUsuario) where.rol_usuario = { equals: rolUsuario, in: [...ASSIGNABLE_ROLES] };
    if (estadoUsuario) where.estado_usuario = ACTIVE_USER_STATUSES.includes(estadoUsuario)
      ? { in: [...ACTIVE_USER_STATUSES] } : estadoUsuario;
    if (search) where.OR = ['nombre_usuario', 'apellido_usuario', 'correo_usuario', 'rut_usuario'].map(field => ({ [field]: { contains: search } }))
      .concat({ ExternalIdentity: { is: { username: { contains: search } } } });
    return where;
  }
  async list(issuer, { page, perPage, ...filters }) {
    const where = this.userScope(issuer, filters);
    const [rows, total] = await Promise.all([
      this.client.$queryRaw(Prisma.sql`SELECT u.id_usuario, u.correo_usuario, u.rut_usuario,
        u.nombre_usuario, u.apellido_usuario, u.rol_usuario, u.estado_usuario, e.subject, e.username
        FROM Usuario u JOIN ExternalIdentity e ON e.user_id = u.id_usuario
        WHERE ${listPredicate(issuer, filters)} ORDER BY u.id_usuario DESC
        LIMIT ${perPage} OFFSET ${(page - 1) * perPage}`),
      this.client.usuario.count({ where }),
    ]);
    return { usuarios: rows.map(row => {
      const identityBindingConflict = typeof row.subject !== 'string' || !row.subject;
      return { idUsuario: row.id_usuario, idUsuarioAutenticacionExterna: identityBindingConflict ? null : row.subject,
        identityBindingConflict,
        username: row.username, nombreUsuario: row.nombre_usuario, apellidoUsuario: row.apellido_usuario,
        rutUsuario: row.rut_usuario, correoUsuario: row.correo_usuario, rolUsuario: row.rol_usuario,
        estadoUsuario: row.estado_usuario?.startsWith('Actualizando:') ? 'Actualizando' : row.estado_usuario };
    }), total, page, perPage };
  }
  async summary(issuer) {
    const groups = await this.client.usuario.groupBy({ by: ['estado_usuario'], where: this.userScope(issuer), _count: { _all: true } });
    const counts = new Map(groups.map(group => [group.estado_usuario, group._count._all]));
    return { totalUsuarios: groups.reduce((sum, group) => sum + group._count._all, 0),
      vinculados: ACTIVE_USER_STATUSES.reduce((sum, status) => sum + (counts.get(status) ?? 0), 0),
      desvinculados: counts.get(USER_STATUS.UNLINKED) ?? 0, pendientes: counts.get(USER_STATUS.PENDING_FIRST_LOGIN) ?? 0,
      pendientesRol: counts.get(USER_STATUS.PENDING_ROLE) ?? 0 };
  }
  movements(userId, filters) { return new UserMovementsRepository({ prisma: this.client }).list(userId, filters); }
  actor(subject) {
    return this.client.usuario.findFirst({ where: identityUserWhere(subject),
      select: { id_usuario: true, rol_usuario: true, estado_usuario: true } });
  }
```

<a id="fuente-S101"></a>

#### S101 — capaServidor/src/modules/users/repo/userMovements.repo.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** UserMovementsRepository; búsqueda por ID, observación, estado y subproceso. **Filtros relacionados:** Todos salvo filtrado local CAL.

**Exportaciones declaradas** (línea inicial): 5: export class UserMovementsRepository {.

**Relaciones/imports originales:** <code>@prisma/client</code>, <code>./users.repo.js</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 44 líneas originales; incluidos 1–44; cobertura completa. Huella SHA-256 inicial del archivo: 698518975410698EEFE5B6805552667F7462FCF1C759CE069253C0F3E1ADF1CE.

**S101: capaServidor/src/modules/users/repo/userMovements.repo.js, líneas 1–44.** Componente/función o selectores: UserMovementsRepository; búsqueda por ID, observación, estado y subproceso. Filtros: Todos salvo filtrado local CAL. Fragmento literal:

```javascript
import { Prisma } from '@prisma/client';
import { UserRepository } from './users.repo.js';

// Administrative projection only. Profile keeps its existing repository contract.
export class UserMovementsRepository {
  constructor({ prisma }) { this.client = prisma; }

  async list(userId, { page = 1, perPage = 10, search = '' } = {}) {
    const where = new UserRepository({ prisma: this.client }).buildRecordsWhere(userId, { search });
    const conditions = [Prisma.sql`r.id_usuario = ${userId}`];
    if (search) {
      const term = search.replace(/^(Estado de pago|Etapa del pedido|Subproceso):\s*/i, '').trim() || search;
      const id = /^\d+$/.test(search) ? Number(search) : null;
      const pattern = `%${term}%`;
      const matches = [Prisma.sql`r.observacion LIKE ${pattern}`, Prisma.sql`ep.nombre_estado_pago LIKE ${pattern}`,
        Prisma.sql`et.nombre_etapa LIKE ${pattern}`, Prisma.sql`es.nombre_estado LIKE ${pattern}`];
      if (Number.isSafeInteger(id)) matches.unshift(Prisma.sql`r.ID_REGISTRO = ${id}`);
      conditions.push(Prisma.sql`(${Prisma.join(matches, ' OR ')})`);
    }
    // Each child has a unique id_registro: joins cannot duplicate a historical row.
    const [rows, total] = await Promise.all([
      this.client.$queryRaw(Prisma.sql`SELECT r.ID_REGISTRO, r.FECHA_HORA, r.observacion,
        p.id_registro AS paymentId, ep.nombre_estado_pago AS paymentName,
        e.id_registro AS stageId, et.nombre_etapa AS stageName,
        s.id_registro AS subprocessId, es.nombre_estado AS subprocessName
        FROM Registros r
        LEFT JOIN Registro_Pago p ON p.id_registro = r.ID_REGISTRO
        LEFT JOIN Estado_Pago ep ON ep.id_estado_pago = p.id_estado_pago_nuevo
        LEFT JOIN Registro_Etapas e ON e.id_registro = r.ID_REGISTRO
        LEFT JOIN Estado_Pedido et ON et.id_estado_pedido = e.id_estado_pedido
        LEFT JOIN registro_subprocesos s ON s.id_registro = r.ID_REGISTRO
        LEFT JOIN Estado_Subprocesos es ON es.id_estado_subproceso = s.id_estado_subproceso
        WHERE ${Prisma.join(conditions, ' AND ')}
        ORDER BY r.FECHA_HORA DESC, r.ID_REGISTRO DESC LIMIT ${perPage} OFFSET ${(page - 1) * perPage}`),
      this.client.registros.count({ where }),
    ]);
    const records = rows.map(row => ({ id: row.ID_REGISTRO, dateTime: row.FECHA_HORA,
      detail: row.paymentId !== null ? `Estado de pago: ${row.paymentName ?? 'No informado'}`
        : row.stageId !== null ? `Etapa del pedido: ${row.stageName ?? 'No informada'}`
          : row.subprocessId !== null ? `Subproceso: ${row.subprocessName ?? 'No informado'}`
            : row.observacion?.trim() || 'Actividad del pedido' }));
    return { records, total, page, perPage };
  }
}
```

<a id="fuente-S102"></a>

#### S102 — capaServidor/src/modules/messages/service/message.service.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** MessageService.getInbox; lectura propia, validación y fechas. **Filtros relacionados:** Todos salvo filtrado local CAL.

**Exportaciones declaradas** (línea inicial): 237: export default MessageService;.

**Relaciones/imports originales:** <code>../../../errors/AppError.js</code>, <code>../repo/message.repo.js</code>, <code>../../users/repo/users.repo.js</code>, <code>../../../config/userLifecycle.js</code>, <code>node:crypto</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 237 líneas originales; incluidos 1–104. Fuera de extracción: 105–237; corresponden al contexto restante del archivo y no se sustituyen por código inventado. Huella SHA-256 inicial del archivo: DC2BA237E09658FECF0F32FE61D06F054B4F534126B7DFC441040B7177B58A4C.

**S102: capaServidor/src/modules/messages/service/message.service.js, líneas 1–104.** Componente/función o selectores: MessageService.getInbox; lectura propia, validación y fechas. Filtros: Todos salvo filtrado local CAL. Fragmento literal:

```javascript
import { AppError } from "../../../errors/AppError.js";
import MessageRepository from "../repo/message.repo.js";
import { UserRepository } from "../../users/repo/users.repo.js";
import { isActiveUserStatus } from '../../../config/userLifecycle.js';
import { createHash } from 'node:crypto';

const VALID_STATUSES = new Set(["all", "read", "unread"]);
const VALID_SORTS = new Set(["latest", "oldest"]);

function createHttpError(statusCode, message) {
    const error = new AppError(statusCode, message);
    return error;
}

function parsePositiveInteger(value, fieldName) {
    const parsed = Number(value);

    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw createHttpError(400, `${fieldName} debe ser un entero positivo.`);
    }

    return parsed;
}

function parseDate(value, fieldName, endOfDay = false) {
    if (!value) return undefined;

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        throw createHttpError(400, `${fieldName} no contiene una fecha valida.`);
    }

    if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        date.setUTCHours(23, 59, 59, 999);
    }

    return date;
}

class MessageService {
    constructor({ repo, userRepo } = {}) {
        this.repo = repo ?? new MessageRepository();
        this.userRepo = userRepo ?? new UserRepository();
    }

    async resolveUser(identitySubject, { currentUser } = {}) {
        if (!identitySubject) {
            throw createHttpError(401, "No se pudo identificar al usuario.");
        }

        // Only controllers may supply the current request's middleware-validated
        // actor, separately from body/query. Calls without HTTP context still resolve.
        if (currentUser !== undefined) {
            if (!Number.isSafeInteger(currentUser?.idUsuario) || currentUser.idUsuario <= 0 ||
                currentUser.identitySubject !== identitySubject || !isActiveUserStatus(currentUser.estadoUsuario)) {
                throw createHttpError(403, "No existe una identidad activa para esta sesion.");
            }
            return currentUser;
        }
        const user = await this.userRepo.findBySubject(identitySubject);

        if (!user) {
            throw createHttpError(404, "Usuario interno no encontrado.");
        }

        return user;
    }

    async getInbox(identitySubject, query = {}, context) {
        const user = await this.resolveUser(identitySubject, context);
        const status = query.status ?? "all";
        const sort = query.sort ?? "latest";

        if (!VALID_STATUSES.has(status)) {
            throw createHttpError(400, "status debe ser all, read o unread.");
        }

        if (!VALID_SORTS.has(sort)) {
            throw createHttpError(400, "sort debe ser latest u oldest.");
        }

        const page = query.page ? parsePositiveInteger(query.page, "page") : 1;
        const requestedPerPage = query.perPage
            ? parsePositiveInteger(query.perPage, "perPage")
            : 20;
        const perPage = Math.min(requestedPerPage, 100);
        const from = parseDate(query.from, "from");
        const to = parseDate(query.to, "to", true);

        if (from && to && from > to) {
            throw createHttpError(400, "La fecha inicial no puede ser posterior a la final.");
        }

        return this.repo.listInbox({
            userId: user.idUsuario,
            status,
            sort,
            from,
            to,
            page,
            perPage,
        });
    }
```

<a id="fuente-S103"></a>

#### S103 — capaServidor/src/modules/messages/repo/message.repo.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** buildInboxWhere/listInbox; conteo y filas. **Filtros relacionados:** Todos salvo filtrado local CAL.

**Exportaciones declaradas** (línea inicial): 168: export default MessageRepository;.

**Relaciones/imports originales:** <code>./messageRead.repo.js</code>, <code>../../../database/prisma.js</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 168 líneas originales; incluidos 1–62. Fuera de extracción: 63–168; corresponden al contexto restante del archivo y no se sustituyen por código inventado. Huella SHA-256 inicial del archivo: D9EA77165BD7F6BEDA999ED9CCD7A5F0199807E7EFB47F157F334631F46C50F9.

**S103: capaServidor/src/modules/messages/repo/message.repo.js, líneas 1–62.** Componente/función o selectores: buildInboxWhere/listInbox; conteo y filas. Filtros: Todos salvo filtrado local CAL. Fragmento literal:

```javascript
import { inboxQuery, detailQuery, notificationsQuery, mapJoinedMessage } from './messageRead.repo.js';
import getPrismaClient from "../../../database/prisma.js";

class MessageRepository {
    constructor({ prisma } = {}) {
        this.prisma = prisma;
    }

    get client() {
        if (!this.prisma) {
            this.prisma = getPrismaClient();
        }

        return this.prisma;
    }

    buildInboxWhere({ userId, status = "all", from, to }) {
        const where = {
            id_usuario: Number(userId),
        };

        if (status === "read") {
            where.leido_ = true;
        }

        if (status === "unread") {
            where.leido_ = false;
        }

        if (from || to) {
            where.Mensaje = {
                fecha_publicacion: {
                    ...(from ? { gte: from } : {}),
                    ...(to ? { lte: to } : {}),
                },
            };
        }

        return where;
    }

    async listInbox({ userId, status, sort, from, to, page, perPage }) {
        const where = this.buildInboxWhere({
            userId,
            status,
            from,
            to,
        });

        const [rows, total] = await this.client.$transaction([
            this.client.$queryRaw(inboxQuery({ userId, status, sort, from, to, page, perPage })),
            this.client.mENSAJE_USUARIO.count({ where }),
        ]);

        return {
            messages: rows.map(mapJoinedMessage),
            total,
            page,
            perPage,
            totalPages: Math.ceil(total / perPage),
        };
    }
```

<a id="fuente-S104"></a>

#### S104 — capaServidor/src/modules/messages/repo/messageRead.repo.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** inboxQuery y alcance propio de notificaciones. **Filtros relacionados:** Todos salvo filtrado local CAL.

**Exportaciones declaradas** (línea inicial): 5: export function mapJoinedMessage(row) {; 12: export function inboxQuery({ userId, status, sort, from, to, page, perPage }) {; 22: export function detailQuery(userId, messageId) {; 25: export function notificationsQuery(userId, limit, withCount = false) {.

**Relaciones/imports originales:** <code>@prisma/client</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 35 líneas originales; incluidos 1–35; cobertura completa. Huella SHA-256 inicial del archivo: 0858C7F275D19D659A119B70FE064A365D3FC7362A8378FB6A3752512F6E4C13.

**S104: capaServidor/src/modules/messages/repo/messageRead.repo.js, líneas 1–35.** Componente/función o selectores: inboxQuery y alcance propio de notificaciones. Filtros: Todos salvo filtrado local CAL. Fragmento literal:

```javascript
import { Prisma } from '@prisma/client';

const columns = Prisma.raw('m.id_mensaje, m.contenido, m.fecha_publicacion, m.Asunto, m.id_pedido, mu.`leido?` AS leido, mu.`oculto?` AS oculto, p.id_pedido AS relatedId, p.numero_nota_venta, p.fecha_creacion, p.fecha_estimada_termino');
const joins = Prisma.raw('FROM MENSAJE_USUARIO mu JOIN Mensaje m ON m.id_mensaje=mu.id_mensaje LEFT JOIN Pedidos p ON p.id_pedido=m.id_pedido');
export function mapJoinedMessage(row) {
  if (!row) return null;
  return { id_mensaje: row.id_mensaje, contenido: row.contenido, fecha_publicacion: row.fecha_publicacion,
    Asunto: row.Asunto, id_pedido: row.id_pedido, leido: Boolean(Number(row.leido)), oculto: Boolean(Number(row.oculto)),
    pedido: row.relatedId == null ? null : { id_pedido: row.relatedId, numero_nota_venta: row.numero_nota_venta,
      fecha_creacion: row.fecha_creacion, fecha_estimada_termino: row.fecha_estimada_termino } };
}
export function inboxQuery({ userId, status, sort, from, to, page, perPage }) {
  const conditions = [Prisma.sql`mu.id_usuario=${Number(userId)}`];
  if (status === 'read') conditions.push(Prisma.raw('mu.`leido?`=1'));
  if (status === 'unread') conditions.push(Prisma.raw('mu.`leido?`=0'));
  if (from) conditions.push(Prisma.sql`m.fecha_publicacion>=${from}`);
  if (to) conditions.push(Prisma.sql`m.fecha_publicacion<=${to}`);
  const direction = Prisma.raw(sort === 'oldest' ? 'ASC' : 'DESC');
  return Prisma.sql`SELECT ${columns} ${joins} WHERE ${Prisma.join(conditions, ' AND ')}
    ORDER BY m.fecha_publicacion ${direction}, mu.id_mensaje ${direction} LIMIT ${perPage} OFFSET ${(page - 1) * perPage}`;
}
export function detailQuery(userId, messageId) {
  return Prisma.sql`SELECT ${columns} ${joins} WHERE mu.id_usuario=${Number(userId)} AND mu.id_mensaje=${Number(messageId)} LIMIT 1`;
}
export function notificationsQuery(userId, limit, withCount = false) {
  const page = Prisma.sql`SELECT ${columns} ${joins} WHERE mu.id_usuario=${Number(userId)}
    AND ${Prisma.raw('mu.`leido?`=0 AND mu.`oculto?`=0')}
    ORDER BY m.fecha_publicacion DESC, mu.id_mensaje DESC LIMIT ${limit}`;
  if (!withCount) return page;
  // A single statement provides an exact global count even when the page is empty.
  return Prisma.sql`SELECT page.*, totals.unreadCount FROM
    (SELECT COUNT(*) AS unreadCount FROM MENSAJE_USUARIO WHERE id_usuario=${Number(userId)}
      AND ${Prisma.raw('`leido?`=0 AND `oculto?`=0')}) totals
    LEFT JOIN (${page}) page ON TRUE ORDER BY page.fecha_publicacion DESC, page.id_mensaje DESC`;
}
```

<a id="fuente-S105"></a>

#### S105 — capaServidor/src/modules/messages/routes/message.routes.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** Endpoints de lectura y operaciones con efectos. **Filtros relacionados:** Todos salvo filtrado local CAL.

**Exportaciones declaradas** (línea inicial): 6: export function createMessageRouter({; 23: export default createMessageRouter();.

**Relaciones/imports originales:** <code>../../../middlewares/requireCapability.js</code>, <code>express</code>, <code>../../../middlewares/checkJwt.js</code>, <code>../controller/message.controller.js</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 23 líneas originales; incluidos 1–23; cobertura completa. Huella SHA-256 inicial del archivo: 6617C10BAA06ED7C7B93029374596269EECFF266AAB0BF4B9BFEB658A39CDA14.

**S105: capaServidor/src/modules/messages/routes/message.routes.js, líneas 1–23.** Componente/función o selectores: Endpoints de lectura y operaciones con efectos. Filtros: Todos salvo filtrado local CAL. Fragmento literal:

```javascript
import requireCapability, { PERMISSIONS as P } from "../../../middlewares/requireCapability.js";
import { Router } from "express";
import checkJwt from "../../../middlewares/checkJwt.js";
import MessageController from "../controller/message.controller.js";

export function createMessageRouter({
    authenticate = checkJwt,
    controller = new MessageController(),
} = {}) {
    const router = Router();

    router.get("/", authenticate, requireCapability(P.READ_MESSAGES), controller.getInbox);
    router.get("/notifications", authenticate, requireCapability(P.READ_MESSAGES), controller.getNotifications);
    router.patch("/notifications", authenticate, requireCapability(P.UPDATE_MESSAGES), controller.clearNotifications);
    router.patch("/notifications/:messageId", authenticate, requireCapability(P.UPDATE_MESSAGES), controller.hideNotification);
    router.patch("/:messageId/read", authenticate, requireCapability(P.UPDATE_MESSAGES), controller.markAsRead);
    router.get("/:messageId", authenticate, requireCapability(P.READ_MESSAGES), controller.getMessage);
    router.post("/:messageId/open", authenticate, requireCapability(P.READ_MESSAGES), controller.openMessage ?? new MessageController().openMessage);

    return router;
}

export default createMessageRouter();
```

<a id="fuente-S106"></a>

#### S106 — capaServidor/src/shared/pagination.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** parseLimit, cursor firmado y pageResult. **Filtros relacionados:** Todos salvo filtrado local CAL.

**Exportaciones declaradas** (línea inicial): 4: export const DEFAULT_PAGE_LIMIT = 50;; 5: export const MAX_PAGE_LIMIT = 100;; 7: export function parseLimit(value, fallback = DEFAULT_PAGE_LIMIT) {; 16: export function encodeCursor(value) {; 37: export function decodeCursor(value) {; 46: export function encodeHistoryEventCursor(record) {; 54: export function decodeHistoryEventCursor(value) {; 79: export function pageResult(rows, limit, map = (row) => row) {.

**Relaciones/imports originales:** <code>./appError.js</code>, <code>node:crypto</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 91 líneas originales; incluidos 1–14, 16–70, 79–91. Fuera de extracción: 15–15, 71–78; corresponden al contexto restante del archivo y no se sustituyen por código inventado. Huella SHA-256 inicial del archivo: 74F89666981492AC379FFF1E2B69262BD9C16710124C919678503DDBFAC002D6.

**S106: capaServidor/src/shared/pagination.js, líneas 1–14.** Componente/función o selectores: parseLimit, cursor firmado y pageResult. Filtros: Todos salvo filtrado local CAL. Fragmento literal:

```javascript
import { AppError } from "./appError.js";
import { createHmac, timingSafeEqual } from "node:crypto";

export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 100;

export function parseLimit(value, fallback = DEFAULT_PAGE_LIMIT) {
    if (value === undefined || value === null || value === "") return fallback;
    const limit = Number(value);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_LIMIT) {
        throw new AppError("INVALID_PAGE_LIMIT", `limit debe ser un entero entre 1 y ${MAX_PAGE_LIMIT}.`);
    }
    return limit;
}
```

**S106: capaServidor/src/shared/pagination.js, líneas 16–70.** Componente/función o selectores: parseLimit, cursor firmado y pageResult. Filtros: Todos salvo filtrado local CAL. Fragmento literal:

```javascript
export function encodeCursor(value) {
    const payload = Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
    const signature = createHmac("sha256", cursorSecret()).update(payload).digest("base64url");
    return `${payload}.${signature}`;
}

function decodeSignedCursor(value) {
    if (!value) return null;
    try {
        const [payload, signature, extra] = String(value).split(".");
        if (!payload || !signature || extra) throw new Error("invalid");
        const expected = createHmac("sha256", cursorSecret()).update(payload).digest("base64url");
        const receivedBuffer = Buffer.from(signature);
        const expectedBuffer = Buffer.from(expected);
        if (receivedBuffer.length !== expectedBuffer.length || !timingSafeEqual(receivedBuffer, expectedBuffer)) throw new Error("invalid");
        return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    } catch {
        throw new AppError("INVALID_CURSOR", "El cursor de paginacion no es valido.");
    }
}

export function decodeCursor(value) {
    const decoded = decodeSignedCursor(value);
    if (!decoded) return null;
    if (!Number.isInteger(decoded.id) || decoded.id <= 0 || Object.keys(decoded).some((key) => key !== "id")) {
        throw new AppError("INVALID_CURSOR", "El cursor de paginacion no es valido.");
    }
    return decoded;
}

export function encodeHistoryEventCursor(record) {
    return encodeCursor({
        kind: "history-event",
        id: Number(record.ID_REGISTRO),
        occurredAt: new Date(record.FECHA_HORA).toISOString(),
    });
}

export function decodeHistoryEventCursor(value) {
    const decoded = decodeSignedCursor(value);
    if (!decoded) return null;
    const keys = Object.keys(decoded).sort();
    const occurredAt = new Date(decoded.occurredAt);
    if (
        decoded.kind !== "history-event" ||
        !Number.isInteger(decoded.id) ||
        decoded.id <= 0 ||
        keys.join(",") !== "id,kind,occurredAt" ||
        Number.isNaN(occurredAt.getTime()) ||
        occurredAt.toISOString() !== decoded.occurredAt
    ) {
        throw new AppError("INVALID_CURSOR", "El cursor de paginacion no es valido.");
    }
    return { id: decoded.id, occurredAt };
}
```

**S106: capaServidor/src/shared/pagination.js, líneas 79–91.** Componente/función o selectores: parseLimit, cursor firmado y pageResult. Filtros: Todos salvo filtrado local CAL. Fragmento literal:

```javascript
export function pageResult(rows, limit, map = (row) => row) {
    const hasMore = rows.length > limit;
    const visibleRows = hasMore ? rows.slice(0, limit) : rows;
    const last = visibleRows.at(-1);
    return {
        items: visibleRows.map(map),
        pageInfo: {
            limit,
            nextCursor: hasMore && last ? encodeCursor({ id: Number(last.id_pedido ?? last.id) }) : null,
            hasMore,
        },
    };
}
```


### 15.10. Dependencias de cierre

<a id="fuente-S107"></a>

#### S107 — capaVista/src/shared/components/navigation/RoleGuard.jsx

**Tipo:** JSX/React. **Responsabilidad, componentes y funciones:** RoleGuard; acceso a módulos sin relación con estado de filtros. **Filtros relacionados:** Todos / USR-F04.

**Exportaciones declaradas** (línea inicial): 5: export default function RoleGuard({.

**Relaciones/imports originales:** <code>../loading/LoadingIndicator</code>, <code>react-router-dom</code>, <code>../../../hooks/useAuth</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 46 líneas originales; incluidos 1–46; cobertura completa. Huella SHA-256 inicial del archivo: 7FD2535F15454DA306C9CA2EE37F168EE273CBC32C796D0E1EBAA050BC1D9D2B.

**S107: capaVista/src/shared/components/navigation/RoleGuard.jsx, líneas 1–46.** Componente/función o selectores: RoleGuard; acceso a módulos sin relación con estado de filtros. Filtros: Todos / USR-F04. Fragmento literal:

```jsx
import LoadingIndicator from '../loading/LoadingIndicator'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../../hooks/useAuth'

export default function RoleGuard({
  requiredPermission,
  requiredRole,
  requiredRoles,
  children,
  fallbackPath = '/access-denied',
}) {
  const { authStatus, hasPermission, hasRole, isAuthenticated, isLoading } = useAuth()
  const location = useLocation()
  const fromPath = `${location.pathname}${location.search}${location.hash}`
  const roles = requiredRoles ?? (requiredRole ? [requiredRole] : [])

  if (isLoading) {
    return (
      <LoadingIndicator scope="page" context="Verificación de acceso" />
    )
  }

  if (!isAuthenticated || authStatus === 'session-invalid') {
    return (
      <Navigate
        replace
        state={{
          fromPath,
        }}
        to={`/login?from=${encodeURIComponent(fromPath)}`}
      />
    )
  }

  if (authStatus !== 'authenticated') return <Navigate replace to={fallbackPath} />

  const matchesPermission = !requiredPermission || hasPermission(requiredPermission)
  const matchesRole = roles.length === 0 || roles.some((role) => hasRole(role))

  if (matchesPermission && matchesRole) {
    return children
  }

  // Guard visual: la autorizacion definitiva debe validarse en cada endpoint backend.
  return <Navigate replace to={fallbackPath} />
}
```

<a id="fuente-S108"></a>

#### S108 — capaVista/src/shared/notifications/ToastProvider.jsx

**Tipo:** JSX/React. **Responsabilidad, componentes y funciones:** ToastProvider; errores del calendario y otros módulos. **Filtros relacionados:** Todos / USR-F04.

**Exportaciones declaradas** (línea inicial): 81: export default function ToastProvider({ children }) {.

**Relaciones/imports originales:** <code>react-dom</code>, <code>react</code>, <code>./useToast</code>, <code>./toastStore</code>, <code>./ToastProvider.module.css</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 86 líneas originales; incluidos 1–86; cobertura completa. Huella SHA-256 inicial del archivo: 18E89084ED830E8C50BA1CA670544701FFF5A3874803B1E3DAD94FA7CFDD544D.

**S108: capaVista/src/shared/notifications/ToastProvider.jsx, líneas 1–86.** Componente/función o selectores: ToastProvider; errores del calendario y otros módulos. Filtros: Todos / USR-F04. Fragmento literal:

```jsx
import { createPortal } from 'react-dom'
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ToastContext } from './useToast'
import { createToastStore } from './toastStore'
import styles from './ToastProvider.module.css'

const titles = { success: 'Éxito', error: 'Error', warning: 'Advertencia', info: 'Información' }
const paths = {
  success: <path d="m6 12 4 4 8-8" />,
  error: <path d="m8 8 8 8m0-8-8 8" />,
  warning: <><path d="m12 3 10 18H2L12 3Z" /><path d="M12 9v5m0 3h.01" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10h.01" /></>,
}

function ToastCard({ toast, store }) {
  const returnFocus = useRef(null)
  function close() {
    const card = document.getElementById(toast.id)
    const focused = card?.contains(document.activeElement)
    const next = card?.nextElementSibling ?? card?.previousElementSibling
    store.api.dismiss(toast.id)
    if (focused) {
      const target = next?.querySelector('button') ?? returnFocus.current
      if (target?.isConnected && !target.closest('[inert], [aria-hidden="true"]')) target.focus()
    }
  }
  const title = toast.title || titles[toast.severity]
  return <article id={toast.id} className={styles.card} data-severity={toast.severity} data-closing={toast.closing || undefined} aria-hidden={toast.closing || undefined}
    onMouseEnter={() => store.pause(toast.id, 'pointer', true)}
    onMouseLeave={() => store.pause(toast.id, 'pointer', false)}
    onFocus={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) returnFocus.current = event.relatedTarget
      store.pause(toast.id, 'focus', true)
    }} onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) store.pause(toast.id, 'focus', false)
    }}>
    <span className={styles.icon} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{paths[toast.severity]}</svg></span>
    <div className={styles.copy}>
      <div role={toast.severity === 'error' ? 'alert' : 'status'} aria-atomic="true">
        <strong>{title}</strong><p>{toast.message}</p>
      </div>
      {toast.action && <button className={styles.action} disabled={toast.closing} type="button" onClick={() => { toast.action.onClick(); close() }}>{toast.action.label}</button>}
    </div>
    <button className={styles.close} disabled={toast.closing} aria-label={`Cerrar notificación: ${title}`} type="button" onClick={close}><span aria-hidden="true">×</span></button>
  </article>
}

function ToastViewport({ store }) {
  const toasts = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const viewportRef = useRef(null)
  useEffect(() => {
    const element = viewportRef.current
    const resize = () => {
      const modal = Boolean(document.querySelector('[role="dialog"][aria-modal="true"]'))
      element.dataset.dialogOpen = String(modal)
      const limit = modal && window.innerWidth <= 900 || window.innerHeight < 500 ? 1 : window.innerHeight < 700 || window.innerWidth < 600 ? 2 : 3
      const cards = [...element.querySelectorAll('article')]
      const focusedCard = document.activeElement?.closest('article')
      if (focusedCard && cards.indexOf(focusedCard) >= limit) cards[0]?.querySelector('button')?.focus()
      store.setLimit(limit)
      document.body.style.setProperty('--toast-reserve', `${element.childElementCount ? element.getBoundingClientRect().height + 32 : 16}px`)
    }
    resize()
    const observer = new MutationObserver(resize)
    observer.observe(document.body, { childList: true, subtree: true })
    const sizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null
    sizeObserver?.observe(element)
    window.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('resize', resize)
      observer.disconnect(); sizeObserver?.disconnect()
      document.body.style.removeProperty('--toast-reserve')
    }
  }, [store])
  return createPortal(<section ref={viewportRef} className={styles.viewport} data-toast-viewport="true" aria-label="Notificaciones del sistema"
    style={{ '--toast-count': Math.max(1, toasts.length) }}>
    {toasts.map(toast => <ToastCard key={toast.id} toast={toast} store={store} />)}
  </section>, document.body)
}

export default function ToastProvider({ children }) {
  const [store] = useState(createToastStore)
  // Activate before producers' passive effects, including StrictMode's replay.
  useLayoutEffect(() => { store.activate(); return () => store.dispose() }, [store])
  return <ToastContext.Provider value={store.api}>{children}<ToastViewport store={store} /></ToastContext.Provider>
}
```

<a id="fuente-S109"></a>

#### S109 — shared/loading/indicator.css

**Tipo:** CSS propio. **Responsabilidad, componentes y funciones:** CSS de carga, indicadores y accesibilidad de consultas. **Filtros relacionados:** Todos / USR-F04.

**Cobertura:** 53 líneas originales; incluidos 1–53; cobertura completa. Huella SHA-256 inicial del archivo: 1D4753BA82B73D125172C4408C7209AC88126CA4E8ACC24CCF91C7CE9B72C851.

**S109: shared/loading/indicator.css, líneas 1–53.** Componente/función o selectores: CSS de carga, indicadores y accesibilidad de consultas. Filtros: Todos / USR-F04. Fragmento literal:

```css
/* Fuente visual compartida por React y el tema nativo de Keycloak. */
.itecsa-loading {
  --loading-track: var(--page-border, #D9DEE5);
  --loading-active: var(--page-brand-orange, #FE5A00);
  --loading-text: var(--itexsa-text, #111827);
  display: inline-flex;
  position: relative;
  min-width: 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: .75rem;
  max-width: 100%;
  color: var(--loading-text);
  font: inherit;
  font-size: .875rem;
  font-weight: 600;
  line-height: 1.4;
  text-align: center;
  vertical-align: middle;
}
.itecsa-loading[data-surface="dark"] {
  --loading-track: #454545;
  --loading-active: var(--page-white, #FFFFFF);
  --loading-text: var(--page-white, #FFFFFF);
}
.itecsa-loading[data-scope="section"],
.itecsa-loading[data-scope="dialog"],
.itecsa-loading[data-scope="page"] {
  display: flex;
  width: 100%;
  min-height: 8rem;
  padding: 1.5rem .75rem;
  box-sizing: border-box;
}
.itecsa-loading[data-scope="page"] { min-height: max(16rem, 60dvh); }
.itecsa-loading[data-scope="screen"] { display: flex; min-height: 100dvh; width: 100%; padding: 1rem; }
.itecsa-loading[data-scope="action"], .itecsa-loading[data-size="small"] { flex-direction: row; gap: .5rem; }
.itecsa-loading__ring { display: block; width: 3rem; height: 3rem; flex: 0 0 auto; overflow: visible; }
.itecsa-loading[data-size="small"] .itecsa-loading__ring,
.itecsa-loading[data-scope="action"] .itecsa-loading__ring { width: 1rem; height: 1rem; }
.itecsa-loading__track, .itecsa-loading__arc { fill: none; stroke-width: 4; }
.itecsa-loading__track { stroke: var(--loading-track); }
.itecsa-loading__arc { stroke: var(--loading-active); stroke-linecap: round; stroke-dasharray: 31.416 125.664; transform-box: view-box; transform-origin: center; animation: itecsa-loading-turn .8s linear infinite; }
.itecsa-loading__context { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
.itecsa-loading-action { display: inline-grid; align-items: center; justify-items: center; max-width: 100%; }
.itecsa-loading-action > * { grid-area: 1 / 1; }
.itecsa-loading-action[data-busy="true"] > .itecsa-loading-action__label { visibility: hidden; }
button .itecsa-loading[data-scope="action"] { font: inherit; }
button[disabled]:has(.itecsa-loading), button[aria-disabled="true"]:has(.itecsa-loading) { opacity: 1; cursor: wait; }
@keyframes itecsa-loading-turn { from { transform: rotate(-90deg); } to { transform: rotate(270deg); } }
@media (prefers-reduced-motion: reduce) { .itecsa-loading__arc { animation-duration: 3.2s; } }
@media (forced-colors: active) { .itecsa-loading { --loading-track: GrayText; --loading-active: CanvasText; --loading-text: CanvasText; } }
```

<a id="fuente-S110"></a>

#### S110 — capaVista/src/modules/orders/utils/orderDto.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** DTO de resúmenes de Kanban, calendario y pagos. **Filtros relacionados:** Todos / USR-F04.

**Exportaciones declaradas** (línea inicial): 67: export const parseKanbanOrderSummaryDTO = (order) => {; 71: export const parseKanbanOrderDetailDTO = (order) => {; 79: export const parseKanbanPageDTO = (page) => parsePage(page, parseKanbanOrderSummaryDTO, 'KanbanPageDTO'); 81: export const parseCalendarOrderSummaryDTO = (order) => parseSummary(order, 'CalendarOrderSummaryDTO'); 82: export const parseCalendarOrderDetailDTO = (order) => {; 86: export const parseCalendarPageDTO = (page) => parsePage(page, parseCalendarOrderSummaryDTO, 'CalendarPageDTO'); 88: export function parsePaymentOrderDTO(order) {; 91: export function parsePaymentWorkspaceDTO(workspace) {; 103: export const parseOrderCreatedDTO = (order) => requireFields(order, ['id', 'salesNoteNumber'], 'OrderCreatedDTO'); 104: export const parseOrderStagePatchDTO = (patch) => requireFields(patch, ['id', 'orderStatusId', 'generalStepId', 'orderStatus'], 'OrderStagePatchDTO'); 105: export function parseOrderLabelsPatchDTO(patch) {.

**Cobertura:** 110 líneas originales; incluidos 1–35, 52–100. Fuera de extracción: 36–51, 101–110; corresponden al contexto restante del archivo y no se sustituyen por código inventado. Huella SHA-256 inicial del archivo: 4019F0725B5C513B73BA2413CC64F5E266E33A6C4FE6F78903B52111613AB3A0.

**S110: capaVista/src/modules/orders/utils/orderDto.js, líneas 1–35.** Componente/función o selectores: DTO de resúmenes de Kanban, calendario y pagos. Filtros: Todos / USR-F04. Fragmento literal:

```javascript
function assertObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name} debe ser un objeto.`)
}

function requireFields(value, fields, name) {
  assertObject(value, name)
  const missing = fields.filter((field) => !Object.hasOwn(value, field))
  if (missing.length) throw new TypeError(`${name} no cumple el contrato; faltan: ${missing.join(', ')}.`)
  return value
}

const PAGE_FIELDS = ['items', 'pageInfo']
const SUMMARY_FIELDS = ['id', 'salesNoteNumber', 'clientName', 'dueDate', 'generalStepId', 'orderStatus', 'labels', 'items']
const ITEM_FIELDS = ['id', 'product', 'quantity', 'dueDate', 'manufacturingDetails', 'lanyardProgress', 'subProcesses']
const MANUFACTURING_FIELDS = ['width', 'length', 'tapeTexture', 'backgroundColor', 'reverseLegend', 'frontLegend', 'endings', 'cardType']
const COMMENT_GROUP_FIELDS = ['all', 'source', 'subprocesses', 'system']

function parseLabel(label, name) {
  requireFields(label, ['id', 'name'], name)
  if (!Number.isInteger(Number(label.id)) || Number(label.id) <= 0) throw new TypeError(`${name}.id debe ser un identificador valido.`)
  if (typeof label.name !== 'string' || !label.name.trim()) throw new TypeError(`${name}.name debe ser texto no vacio.`)
  return label
}

function parseManufacturingDetails(details, name) {
  if (details === null) return details
  return requireFields(details, MANUFACTURING_FIELDS, name)
}

function parseItem(item, name) {
  requireFields(item, ITEM_FIELDS, name)
  if (!Array.isArray(item.subProcesses)) throw new TypeError(`${name}.subProcesses debe ser un arreglo.`)
  parseManufacturingDetails(item.manufacturingDetails, `${name}.manufacturingDetails`)
  return item
}
```

**S110: capaVista/src/modules/orders/utils/orderDto.js, líneas 52–100.** Componente/función o selectores: DTO de resúmenes de Kanban, calendario y pagos. Filtros: Todos / USR-F04. Fragmento literal:

```javascript
function parseSummary(order, name) {
  requireFields(order, SUMMARY_FIELDS, name)
  if (!Array.isArray(order.labels) || !Array.isArray(order.items)) throw new TypeError(`${name} requiere labels e items como arreglos.`)
  order.labels.forEach((label, index) => parseLabel(label, `${name}.labels[${index}]`))
  order.items.forEach((item, index) => parseItem(item, `${name}.items[${index}]`))
  return order
}

function parsePage(page, itemParser, name) {
  requireFields(page, PAGE_FIELDS, name)
  if (!Array.isArray(page.items)) throw new TypeError(`${name}.items debe ser un arreglo.`)
  requireFields(page.pageInfo, ['nextCursor', 'hasMore'], `${name}.pageInfo`)
  return { ...page, items: page.items.map(itemParser) }
}

export const parseKanbanOrderSummaryDTO = (order) => {
  parseSummary(order, 'KanbanOrderSummaryDTO')
  return requireFields(order, ['createdAt', 'paymentStatusId', 'paymentStatus'], 'KanbanOrderSummaryDTO')
}
export const parseKanbanOrderDetailDTO = (order) => {
  parseKanbanOrderSummaryDTO(order)
  requireFields(order, ['seller', 'comments', 'commentGroups'], 'KanbanOrderDetailDTO')
  if (!Array.isArray(order.comments)) throw new TypeError('KanbanOrderDetailDTO.comments debe ser un arreglo.')
  order.comments.forEach((entry, index) => parseComment(entry, `KanbanOrderDetailDTO.comments[${index}]`))
  parseCommentGroups(order.commentGroups, 'KanbanOrderDetailDTO.commentGroups')
  return order
}
export const parseKanbanPageDTO = (page) => parsePage(page, parseKanbanOrderSummaryDTO, 'KanbanPageDTO')

export const parseCalendarOrderSummaryDTO = (order) => parseSummary(order, 'CalendarOrderSummaryDTO')
export const parseCalendarOrderDetailDTO = (order) => {
  parseCalendarOrderSummaryDTO(order)
  return requireFields(order, ['seller'], 'CalendarOrderDetailDTO')
}
export const parseCalendarPageDTO = (page) => parsePage(page, parseCalendarOrderSummaryDTO, 'CalendarPageDTO')

export function parsePaymentOrderDTO(order) {
  return requireFields(order, ['id', 'salesNoteNumber', 'createdAt', 'clientName', 'clientBusinessName', 'clientRut', 'paymentStatusId', 'paymentStatus'], 'PaymentOrderDTO')
}
export function parsePaymentWorkspaceDTO(workspace) {
  parsePage(workspace, parsePaymentOrderDTO, 'PaymentWorkspaceDTO')
  requireFields(workspace, ['counts', 'paymentStatuses'], 'PaymentWorkspaceDTO')
  if (!Array.isArray(workspace.paymentStatuses)) throw new TypeError('PaymentWorkspaceDTO.paymentStatuses debe ser un arreglo.')
  workspace.paymentStatuses.forEach((status, index) => {
    requireFields(status, ['id', 'name'], `PaymentWorkspaceDTO.paymentStatuses[${index}]`)
    if (!Number.isInteger(Number(status.id)) || Number(status.id) <= 0) throw new TypeError(`PaymentWorkspaceDTO.paymentStatuses[${index}].id debe ser valido.`)
    if (typeof status.name !== 'string' || !status.name.trim()) throw new TypeError(`PaymentWorkspaceDTO.paymentStatuses[${index}].name debe ser texto no vacio.`)
  })
  return { ...workspace, items: workspace.items.map(parsePaymentOrderDTO) }
```

<a id="fuente-S111"></a>

#### S111 — capaServidor/src/modules/users/repo/users.repo.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** buildRecordsWhere; predicado del conteo en movimientos. **Filtros relacionados:** Todos / USR-F04.

**Exportaciones declaradas** (línea inicial): 8: export const USER_RESPONSE_SELECT = Object.freeze({; 19: export class UserRepositoryError extends Error {; 48: export class UserRepository {; 138: export default new UserRepository();.

**Relaciones/imports originales:** <code>./movementsRead.repo.js</code>, <code>../../../database/identityBinding.js</code>, <code>../../../database/prisma.js</code>, <code>../../../config/userLifecycle.js</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 138 líneas originales; incluidos 82–99. Fuera de extracción: 1–81, 100–138; corresponden al contexto restante del archivo y no se sustituyen por código inventado. Huella SHA-256 inicial del archivo: A5669CCC7981E410F1079911DE4CA282AE0C2B5B497CD3B41DF60B0D4ED5D0C6.

**S111: capaServidor/src/modules/users/repo/users.repo.js, líneas 82–99.** Componente/función o selectores: buildRecordsWhere; predicado del conteo en movimientos. Filtros: Todos / USR-F04. Fragmento literal:

```javascript
    buildRecordsWhere(idUsuario, { search = '' } = {}) {
        if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
            throw new UserRepositoryError("USER_NOT_FOUND", "Usuario no válido.");
        }
        const where = { id_usuario: idUsuario };
        if (search) {
            const term = search.replace(/^(Estado de pago|Etapa del pedido|Subproceso):\s*/i, '').trim() || search;
            const id = /^\d+$/.test(search) ? Number(search) : null;
            where.OR = [
                ...(Number.isSafeInteger(id) ? [{ ID_REGISTRO: id }] : []),
                { observacion: { contains: term } },
                { Registro_Pago: { is: { Estado_Pago_Registro_Pago_id_estado_pago_nuevoToEstado_Pago: { is: { nombre_estado_pago: { contains: term } } } } } },
                { Registro_Etapas: { is: { Estado_Pedido: { is: { nombre_etapa: { contains: term } } } } } },
                { registro_subprocesos: { is: { Estado_Subprocesos: { is: { nombre_estado: { contains: term } } } } } },
            ];
        }
        return where;
    }
```

<a id="fuente-S112"></a>

#### S112 — capaServidor/src/server.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** Montaje de API y rutas administrativas de Keycloak. **Filtros relacionados:** Todos / USR-F04.

**Exportaciones declaradas** (línea inicial): 171: export default Server;.

**Relaciones/imports originales:** <code>express</code>, <code>cors</code>, <code>./errors/httpErrors.js</code>, <code>./config/environment.js</code>, <code>./modules/auth/routes/auth.routes.js</code>, <code>./modules/users/routes/adminUsers.routes.js</code>, <code>./modules/health/routes/health.routes.js</code>, <code>./modules/productionCapacity/routes/productionCapacity.routes.js</code>, <code>./modules/productionLoad/routes/productionLoad.routes.js</code>, <code>./modules/orders/routes/order.routes.js</code>, <code>./modules/orders/routes/orderDetail.routes.js</code>, <code>./modules/orders/routes/orderStatus.routes.js</code>, <code>./modules/products/routes/product.routes.js</code>, <code>./modules/payments/routes/paymentStatus.routes.js</code>, <code>./modules/clients/routes/clients.routes.js</code>, <code>./modules/messages/routes/message.routes.js</code>, <code>./modules/history/routes/orderHistory.routes.js</code>, <code>./modules/metrics/routes/metrics.routes.js</code>, <code>./middlewares/errorHandler.js</code>, <code>./shared/safeLogger.js</code>, <code>./middlewares/supportAudit.js</code>, <code>./modules/privacy/routes/privacy.routes.js</code>, <code>./modules/privacy/controller/privacy.controller.js</code>, <code>./modules/privacy/service/privacyRequest.service.js</code>, <code>./modules/security/routes/incidentReport.routes.js</code>, <code>./modules/security/controller/incidentReport.controller.js</code>, <code>./modules/security/service/incidentReport.service.js</code>, <code>./modules/users/routes/keycloakIdentityPreparation.routes.js</code>, <code>./modules/users/service/keycloakIdentityAdministration.service.js</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 171 líneas originales; incluidos 51–75, 123–138. Fuera de extracción: 1–50, 76–122, 139–171; corresponden al contexto restante del archivo y no se sustituyen por código inventado. Huella SHA-256 inicial del archivo: 0363CA2862143E0B6A677E4B37BFCB9B2DB2A2634CF61442E57DBF8A0E7EBF29.

**S112: capaServidor/src/server.js, líneas 51–75.** Componente/función o selectores: Montaje de API y rutas administrativas de Keycloak. Filtros: Todos / USR-F04. Fragmento literal:

```javascript
    this.paths = {
        // Rutas cuando las tengamos

        //* orders
        auth : '/api/auth',
        orders : '/api/orders',
        orderDetail: '/api/order-details',
        admin: '/api/admin',
        health: '/api/health',
        messages: '/api/messages',
        history: '/api/history',
        productionCapacity: '/api/production-capacity',
        productionLoad: '/api/production-load',
        metrics: '/api/metrics',

        //* Estados
        orderStatus: '/api/order-status',
        paymentStatus: '/api/payment-status',

        //* Clientes
        client: '/api/clients',

        //* Productos
        product: '/api/products'

```

**S112: capaServidor/src/server.js, líneas 123–138.** Componente/función o selectores: Montaje de API y rutas administrativas de Keycloak. Filtros: Todos / USR-F04. Fragmento literal:

```javascript
    this.app.use(this.paths.orders, orderRoutes)
    this.app.use(
      this.paths.auth,
      createAuthRouter({
      }),
    )
    if ((this.env.AUTH_PROVIDER ?? 'keycloak') === 'keycloak' && this.env.IDENTITY_PREPARATION_ENABLED === 'true') {
      this.app.use('/api/admin/identity', createKeycloakIdentityPreparationRouter({
        service: new KeycloakIdentityAdministrationService(),
      }));
    }
    this.app.use( this.paths.admin, adminUsersRoutes)
    this.app.use( this.paths.health, healthRoutes)
    this.app.use('/internal', createInternalHealthRouter({ logger: this.logger }))
    this.app.use( this.paths.messages, messageRoutes)
    this.app.use( this.paths.history, orderHistoryRoutes)
```


### 15.11. Normalización y resultados vinculados

<a id="fuente-S113"></a>

#### S113 — capaVista/src/modules/productionCalendar/components/ProductionCalendarGrid.module.css

**Tipo:** CSS propio. **Responsabilidad, componentes y funciones:** Layout de calendario/pendientes, modal de día y responsive; controles de navegación asociados. **Filtros relacionados:** CAL-F01–CAL-F03; CAL-N04.

**Cobertura:** 507 líneas originales; incluidos 1–25, 93–113, 129–195, 348–501. Fuera de extracción: 26–92, 114–128, 196–347, 502–507; corresponden al contexto restante del archivo y no se sustituyen por código inventado. Huella SHA-256 inicial del archivo: A453424862ED105D96D890B59727B94A590313B7D65AB067534B79CF8DE2BAE5.

**S113: capaVista/src/modules/productionCalendar/components/ProductionCalendarGrid.module.css, líneas 1–25.** Componente/función o selectores: Layout de calendario/pendientes, modal de día y responsive; controles de navegación asociados. Filtros: CAL-F01–CAL-F03; CAL-N04. Fragmento literal:

```css
.calendarGridStack { display: grid; gap: 1rem; min-width: 0; }
.calendarLayout { display: grid; grid-template-columns: minmax(0, 2.5fr) minmax(19rem, 1fr); gap: 1rem; align-items: start; min-width: 0; }
.calendarShell, .pendingTray { background: var(--page-white); border: 1px solid var(--calendar-border); border-radius: .75rem; min-width: 0; box-shadow: 0 8px 24px rgba(15, 23, 42, .045); }
.calendarShell { padding: 1rem; }
.calendarToolbarSlot { min-width: 0; margin-bottom: 1rem; }
.calendarScroll { overflow-x: auto; min-width: 0; border: 1px solid var(--calendar-border); border-radius: .55rem; }
.businessCalendar { min-width: 40rem; }
.weekHeader, .monthGrid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); }
.weekHeader { background: var(--page-header-black); }
.weekHeader span { color: var(--page-white); font-size: .72rem; font-weight: 800; letter-spacing: .04em; padding: .65rem .3rem; text-align: center; text-transform: uppercase; border-right: 1px solid var(--calendar-muted); }
.weekHeader span:last-child { border-right: 0; }
.monthGrid { background: var(--page-white); }
.dayCell { border-bottom: 1px solid var(--calendar-border); border-right: 1px solid var(--calendar-border); display: grid; grid-template-rows: auto 1fr; min-width: 0; min-height: 7.5rem; padding: .5rem; transition: background .16s ease, box-shadow .16s ease; }
.dayCell:nth-child(5n) { border-right: 0; }
.outsideMonth { background: #f8fafc; }
.nonBusinessDay { background: var(--page-white); }
.nonBusinessDay .dayNumber { color: var(--calendar-muted); }
.nonBusinessDay .eventsList { opacity: .78; }
.dropTarget { background: #fff7ed; box-shadow: inset 0 0 0 2px var(--calendar-orange); }
.dayNumber { color: var(--calendar-text); font-size: .78rem; font-weight: 800; line-height: 1.2; }
.outsideMonth .dayNumber { color: #94a3b8; }
.eventsList { display: grid; align-content: start; gap: .35rem; margin-top: .4rem; min-width: 0; }
.calendarEvent { background: #f8fafc; border: 1px solid var(--calendar-border); border-left: 3px solid var(--calendar-orange); border-radius: .5rem; display: grid; align-self: start; gap: .22rem; padding: .45rem .5rem; text-align: left; min-width: 0; width: 100%; touch-action: none; }
.calendarEvent[draggable="true"], .pendingOrderCard[draggable="true"], .transferOrderCard[draggable="true"] { cursor: grab; }
.calendarEvent:focus-visible, .pendingOrderCard:focus-visible, .transferOrderCard:focus-visible { outline: 2px solid var(--calendar-orange); outline-offset: 2px; }
```

**S113: capaVista/src/modules/productionCalendar/components/ProductionCalendarGrid.module.css, líneas 93–113.** Componente/función o selectores: Layout de calendario/pendientes, modal de día y responsive; controles de navegación asociados. Filtros: CAL-F01–CAL-F03; CAL-N04. Fragmento literal:

```css
.moreEventsButton {
  align-items: center;
  background: #111827;
  border: 1px solid #111827;
  border-radius: 0.45rem;
  color: #fff;
  display: inline-flex;
  font-size: 0.74rem;
  font-weight: 900;
  justify-content: center;
  min-height: 2rem;
  padding: 0.4rem 0.5rem;
}

.moreEventsButton:hover,
.moreEventsButton:focus {
  background: var(--calendar-orange);
  border-color: var(--calendar-orange);
  color: #111827;
  outline: none;
}
```

**S113: capaVista/src/modules/productionCalendar/components/ProductionCalendarGrid.module.css, líneas 129–195.** Componente/función o selectores: Layout de calendario/pendientes, modal de día y responsive; controles de navegación asociados. Filtros: CAL-F01–CAL-F03; CAL-N04. Fragmento literal:

```css
.modalLayer {
  align-items: center;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  inset: 0;
  justify-content: center;
  padding: 1rem;
  position: fixed;
  z-index: 1070;
}

.modalCard {
  background: #fff;
  border-radius: 0.85rem;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.28);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  max-height: min(42rem, calc(100vh - 2rem));
  max-width: min(100%, 42rem);
  overflow: hidden;
  width: 42rem;
}

.modalHeader {
  align-items: center;
  border-bottom: 1px solid var(--calendar-border);
  display: flex;
  gap: 1rem;
  justify-content: space-between;
  padding: 1rem;
}

.modalHeader span {
  color: var(--calendar-orange);
  font-size: 0.78rem;
  font-weight: 850;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.modalHeader h2 {
  color: var(--calendar-text);
  font-size: 1.15rem;
  margin: 0.2rem 0 0;
}

.modalHeader button {
  align-items: center;
  background: #fff;
  border: 1px solid #d3d9e2;
  border-radius: 0.55rem;
  color: #111;
  display: inline-flex;
  flex: 0 0 auto;
  height: 2.4rem;
  justify-content: center;
  width: 2.4rem;
}

.modalBody {
  display: grid;
  gap: 0.75rem;
  min-height: 0;
  overflow: auto;
  padding: 1rem;
}

```

**S113: capaVista/src/modules/productionCalendar/components/ProductionCalendarGrid.module.css, líneas 348–501.** Componente/función o selectores: Layout de calendario/pendientes, modal de día y responsive; controles de navegación asociados. Filtros: CAL-F01–CAL-F03; CAL-N04. Fragmento literal:

```css
.dayOrderRow {
  background: #f8fafc;
  border: 1px solid #d7dee8;
  border-radius: 0.65rem;
  display: grid;
  gap: 0.8rem;
  padding: 0.85rem;
}

.draggableDayOrderRow {
  cursor: grab;
  transition:
    box-shadow 0.16s ease,
    transform 0.16s ease;
}

.draggableDayOrderRow:hover,
.draggableDayOrderRow:focus {
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.12);
  outline: none;
  transform: translateY(-1px);
}

.dayOrderRow > div:first-child {
  display: grid;
  gap: 0.15rem;
}

.dayOrderRow strong {
  color: #111827;
  font-size: 0.95rem;
  font-weight: 900;
}

.dayOrderRow span {
  color: var(--calendar-muted);
  font-size: 0.82rem;
  font-weight: 780;
}

.dayOrderRow dl {
  display: grid;
  gap: 0.55rem;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: 0;
}

.dayOrderRow dl div {
  display: grid;
  gap: 0.15rem;
}

.dayOrderRow dt {
  color: var(--calendar-muted);
  font-size: 0.66rem;
  font-weight: 850;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.dayOrderRow dd {
  color: var(--calendar-text);
  font-size: 0.8rem;
  font-weight: 850;
  margin: 0;
}

.transferTray { display: grid; grid-template-columns: minmax(15rem, 24rem) minmax(0, 1fr); gap: .65rem; min-width: 0; }
.transferTrayHeader { display: flex; align-items: center; gap: .8rem; background: var(--page-white); border: 1px solid var(--calendar-border); border-radius: .65rem; padding: .85rem 1rem; min-width: 0; }
.transferTrayHeader > i { color: var(--calendar-orange); font-size: 1.6rem; }
.transferTrayHeader h2 { color: var(--calendar-text); font-size: .8rem; font-weight: 800; line-height: 1.35; margin: 0; text-transform: uppercase; }
.transferTrayHeader strong, .pendingTrayHeader strong { display: inline-flex; align-items: center; justify-content: center; background: var(--calendar-orange); color: var(--page-white); border-radius: 999px; min-width: 2.25rem; height: 2.25rem; padding: .35rem; font-size: .85rem; font-weight: 800; flex-shrink: 0; margin-left: auto; }
.transferTrayBody { display: flex; align-items: center; gap: .65rem; min-width: 0; min-height: 4.25rem; padding: .6rem .85rem; overflow-x: auto; border: 1px dashed #cbd5e1; border-radius: .65rem; background: #f8fafc; }
.transferTrayActive .transferTrayBody { background: #fff7ed; border-color: var(--calendar-orange); }
.transferOrderCard { flex: 0 0 14rem; min-width: 0; background: var(--page-white); border: 1px solid var(--calendar-border); border-radius: .5rem; display: grid; gap: .2rem; padding: .55rem .65rem; }
.emptyTransferState { display: flex; align-items: center; gap: 1rem; color: var(--calendar-muted); font-size: .8rem; font-weight: 500; margin: 0; }
.emptyTransferState i { font-size: 1.3rem; }
.pendingTray { display: flex; flex-direction: column; overflow: hidden; max-height: 54rem; }
.pendingTrayHeader { display: flex; align-items: center; justify-content: space-between; gap: .75rem; padding: 1.15rem 1rem; }
.pendingTrayHeader span { color: var(--calendar-muted); font-size: .7rem; font-weight: 800; text-transform: uppercase; }
.pendingTrayHeader h2 { color: var(--calendar-text); font-size: 1.1rem; font-weight: 800; line-height: 1.3; margin: .2rem 0 0; }
.pendingTrayBody { display: grid; grid-template-columns: minmax(0, 1fr); align-content: start; gap: .65rem; min-height: 0; overflow-y: auto; padding: 0 1rem 1rem; }
.pendingOrderCard { display: grid; grid-template-columns: .75rem minmax(0, 1fr); column-gap: .75rem; row-gap: .2rem; min-width: 0; padding: .8rem .7rem; background: var(--page-white); border: 1px solid var(--calendar-border); border-left: 3px solid var(--calendar-orange); border-radius: .6rem; }
.pendingOrderCard .eventLine { grid-column: 2; font-size: .78rem; }
.pendingOrderCard .eventLine:first-of-type { font-size: .84rem; }
.emptyPendingState { color: var(--calendar-muted); font-size: .85rem; margin: 0; padding: .75rem; border: 1px dashed var(--calendar-border); border-radius: .6rem; }
@media (max-width: 1199.98px) {
  .calendarLayout { grid-template-columns: minmax(0, 1fr) minmax(17rem, .5fr); }
  .calendarShell { padding: .75rem; }
  .pendingTrayHeader { padding: 1rem .75rem; }
  .pendingTrayBody { padding: 0 .75rem .75rem; }
}
@media (max-width: 991.98px) {
  .calendarLayout { grid-template-columns: minmax(0, 1fr); }
  .pendingTray { max-height: 34rem; }
}
@media (max-width: 575.98px) {
  .transferTray { grid-template-columns: minmax(0, 1fr); }
  .transferTrayHeader { padding: .65rem .85rem; }
  .calendarShell { padding: .5rem; }
}

@media (max-width: 640px) {
  .orderOverview,
  .detailProductCard dl {
    grid-template-columns: 1fr;
  }

  .dayOrderRow dl {
    grid-template-columns: 1fr;
  }
}

/* Stage accents are independent of urgency/contract backgrounds. */
[data-stage="payment"] { --order-stage-accent: var(--stage-payment-accent); --order-stage-text: var(--stage-payment-text); --order-stage-bg: var(--stage-payment-bg); }
[data-stage="ready"] { --order-stage-accent: var(--stage-ready-accent); --order-stage-text: var(--stage-ready-text); --order-stage-bg: var(--stage-ready-bg); }
[data-stage="production"] { --order-stage-accent: var(--stage-production-accent); --order-stage-text: var(--stage-production-text); --order-stage-bg: var(--stage-production-bg); }
[data-stage="delivery"] { --order-stage-accent: var(--stage-delivery-accent); --order-stage-text: var(--stage-delivery-text); --order-stage-bg: var(--stage-delivery-bg); }
[data-stage="review"] { --order-stage-accent: var(--stage-review-accent); --order-stage-text: var(--stage-review-text); --order-stage-bg: var(--stage-review-bg); }
[data-stage="unknown"] { --order-stage-accent: var(--stage-unknown-accent); --order-stage-text: var(--stage-unknown-text); --order-stage-bg: var(--stage-unknown-bg); }

.calendarEvent[data-stage], .pendingOrderCard[data-stage], .transferOrderCard[data-stage] {
  border-left: 4px solid var(--order-stage-accent);
}
.eventLine .stageBadge {
  background: var(--order-stage-bg);
  border-color: var(--order-stage-accent);
  color: var(--order-stage-text);
}
.stageShort { display: none; }
.calendarShell { container-type: inline-size; container-name: calendar; }
@container calendar (max-width: 720px) {
  .businessCalendar { min-width: 28rem; }
  .dayCell { padding: .3rem; min-height: 5.5rem; }
  .calendarEvent { padding: .3rem; gap: .15rem; }
  .calendarEvent .eventLine { font-size: .7rem; }
  .calendarEvent .eventLine:nth-child(2),
  .calendarEvent .eventLine:nth-child(3),
  .calendarEvent .eventLine > b,
  .calendarEvent .stageFull {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }
  .calendarEvent .stageShort { display: inline; }
  .calendarEvent .stageBadge { padding: .1rem .2rem; border-radius: .25rem; }
  .weekHeader span { font-size: .6rem; }
}
```

<a id="fuente-S114"></a>

#### S114 — capaVista/src/modules/productionCalendar/components/CalendarOrderTrays.jsx

**Tipo:** JSX/React. **Responsabilidad, componentes y funciones:** Pendientes y bandeja de traslado; resultados deliberadamente separados de items filtrados. **Filtros relacionados:** CAL-F01–CAL-F03; CAL-N04.

**Exportaciones declaradas** (línea inicial): 7: export function PendingOrdersTray({ draggedItemId, items, onDragEnd, onDragStart, onOpenDetail }) {; 70: export function TransferOrdersTray({ draggedItemId, items, onDragEnd, onDragStart, onDropTransferItem, onOpenDetail }) {.

**Relaciones/imports originales:** <code>../../../shared/orderStagePresentation.js</code>, <code>../utils/calendarPresentation.js</code>, <code>../../../hooks/useAuth</code>, <code>./ProductionCalendarGrid.module.css</code>, <code>../../../config/permissions</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 157 líneas originales; incluidos 1–157; cobertura completa. Huella SHA-256 inicial del archivo: 8041874E2C7F2CABC27A10EB02BBBA53BE9D5A819D1745B5A2026CDD88A73260.

**S114: capaVista/src/modules/productionCalendar/components/CalendarOrderTrays.jsx, líneas 1–157.** Componente/función o selectores: Pendientes y bandeja de traslado; resultados deliberadamente separados de items filtrados. Filtros: CAL-F01–CAL-F03; CAL-N04. Fragmento literal:

```jsx
import { getOrderStagePresentation } from '../../../shared/orderStagePresentation.js'
import { getOrderToneClass, getProductSummary, formatScheduleState, displayValue } from '../utils/calendarPresentation.js';
import { useAuth } from '../../../hooks/useAuth';
import styles from './ProductionCalendarGrid.module.css';
import { PERMISSIONS } from '../../../config/permissions';

export function PendingOrdersTray({ draggedItemId, items, onDragEnd, onDragStart, onOpenDetail }) {
  const { hasPermission } = useAuth()

  function handleDragStart(event, itemId) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', itemId)
    onDragStart(itemId)
  }

  return (
    <aside className={styles.pendingTray} aria-label="Pedidos pendientes de programar">
      <header className={styles.pendingTrayHeader}>
        <div>
          <span>Produccion</span>
          <h2>Pendientes de programar</h2>
        </div>
        <strong>{items.length}</strong>
      </header>

      <div className={styles.pendingTrayBody}>
        {items.length === 0 ? (
          <p className={styles.emptyPendingState}>No hay pedidos pendientes de fecha.</p>
        ) : items.map((item) => (
          <article
            className={[
              styles.pendingOrderCard,
              getOrderToneClass(item),
              draggedItemId === item.id ? styles.draggingEvent : '',
            ]
              .filter(Boolean)
              .join(' ')}
            data-stage={getOrderStagePresentation(formatScheduleState(item)).token}
            draggable={hasPermission(PERMISSIONS.UPDATE_DELIVERY_DATE)}
            key={item.id}
            onDragEnd={onDragEnd}
            onDoubleClick={() => onOpenDetail(item)}
            onDragStart={(event) => handleDragStart(event, item.id)}
            title="Doble click para ver detalle. Arrastrar a un dia habil del calendario"
          >
            {hasPermission(PERMISSIONS.UPDATE_DELIVERY_DATE) && <i className={`bi bi-grip-vertical ${styles.dragHandle}`} aria-hidden="true" />}
            <span className={styles.eventLine}>
              <b>Pedido N°:</b>
              <strong>{item.orderNumber}</strong>
            </span>
            <span className={styles.eventLine}>
              <b>Cliente:</b>
              <span>{item.clientName}</span>
            </span>
            <span className={styles.eventLine}>
              <b>Productos:</b>
              <em>{getProductSummary(item)}</em>
            </span>
            <span className={styles.eventLine}>
              <b>Etapa:</b>
              <small className={styles.stageBadge}><span className={styles.stageFull}>{formatScheduleState(item)}</span><span className={styles.stageShort} aria-hidden="true">{getOrderStagePresentation(formatScheduleState(item)).short}</span></small>
            </span>
          </article>
        ))}
      </div>
    </aside>
  )
}

export function TransferOrdersTray({ draggedItemId, items, onDragEnd, onDragStart, onDropTransferItem, onOpenDetail }) {
  const { hasPermission } = useAuth()
  const canReceiveTransfer = hasPermission(PERMISSIONS.UPDATE_DELIVERY_DATE)

  function handleDragStart(event, itemId) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', itemId)
    onDragStart(itemId)
  }

  function handleDragOver(event) {
    if (!canReceiveTransfer || !draggedItemId) return

    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  function handleDrop(event) {
    if (!canReceiveTransfer) return

    event.preventDefault()
    const itemId = event.dataTransfer.getData('text/plain')
    onDropTransferItem(itemId)
  }

  return (
    <aside
      className={[styles.transferTray, draggedItemId ? styles.transferTrayActive : '']
        .filter(Boolean)
        .join(' ')}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      aria-label="Bandeja temporal para mover pedidos de mes"
    >
      <header className={styles.transferTrayHeader}>
        <i className="bi bi-box-seam" aria-hidden="true" />
        <div>
          <h2>Bandeja para mover pedidos</h2>
        </div>
        <strong>{items.length}</strong>
      </header>

      <div className={styles.transferTrayBody}>
        {items.length === 0 ? (
          <p className={styles.emptyTransferState}><i className="bi bi-arrows-move" aria-hidden="true" />Arrastra aquí los pedidos que quieras mover a otro mes.</p>
        ) : items.map((item) => (
          <article
            className={[
              styles.transferOrderCard,
              getOrderToneClass(item),
              draggedItemId === item.id ? styles.draggingEvent : '',
            ]
              .filter(Boolean)
              .join(' ')}
            data-stage={getOrderStagePresentation(formatScheduleState(item)).token}
            draggable={canReceiveTransfer}
            key={item.id}
            onDragEnd={onDragEnd}
            onDoubleClick={() => onOpenDetail(item)}
            onDragStart={(event) => handleDragStart(event, item.id)}
            title="Arrastrar a un dia habil del calendario"
          >
            <span className={styles.eventLine}>
              <b>Pedido N.º</b>
              <strong>{item.orderNumber}</strong>
            </span>
            <span className={styles.eventLine}>
              <b>Cliente:</b>
              <span>{item.clientName}</span>
            </span>
            <span className={styles.eventLine}>
              <b>Productos:</b>
              <em>{getProductSummary(item)}</em>
            </span>
            <span className={styles.eventLine}>
              <b>Etapa:</b>
              <small className={styles.stageBadge}><span className={styles.stageFull}>{formatScheduleState(item)}</span><span className={styles.stageShort} aria-hidden="true">{getOrderStagePresentation(formatScheduleState(item)).short}</span></small>
            </span>
            <span className={styles.eventLine}>
              <b>Fecha actual:</b>
              <small>{displayValue(item.dueDate, 'Sin fecha')}</small>
            </span>
          </article>
        ))}
      </div>
    </aside>
  )
}
```

<a id="fuente-S115"></a>

#### S115 — capaVista/src/modules/kanban/utils/kanbanOrderMapping.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** normalizeOrder; tipos de producto y valores usados por filtros. **Filtros relacionados:** KAN-F01–KAN-F03.

**Exportaciones declaradas** (línea inicial): 6: export function normalizeProcessName(value) {; 10: export function createItemFromDetail(detail, index) {; 23: export function buildOrderItems(order, product, dueDate) {; 32: export function normalizeOrder(order) {; 69: export function normalizeStatus(status) {.

**Relaciones/imports originales:** <code>../../../shared/orderStagePresentation.js</code>, <code>./kanbanDates.js</code>, <code>./kanbanOrderRules.js</code>, <code>./kanbanColumns.js</code>. El comportamiento relevante de estas dependencias está descrito en las fichas y el mapa16; las acciones ajenas a consulta no se ejecutaron.

**Cobertura:** 73 líneas originales; incluidos 1–73; cobertura completa. Huella SHA-256 inicial del archivo: 710C7C28EFDBEF0317DCAFD5EA4BE9784133B5479EBDA917B9B8A769DE305C69.

**S115: capaVista/src/modules/kanban/utils/kanbanOrderMapping.js, líneas 1–73.** Componente/función o selectores: normalizeOrder; tipos de producto y valores usados por filtros. Filtros: KAN-F01–KAN-F03. Fragmento literal:

```javascript
import { getOrderStageAccent } from '../../../shared/orderStagePresentation.js'
import { toDateKey, getDeliveryDelayStatus, isOrderDelayed, isOrderUrgent } from './kanbanDates.js'
import { isLanyardItem, hasOrderLabel } from './kanbanOrderRules.js'
import { baseColumns } from './kanbanColumns.js'

export function normalizeProcessName(value) {
  return String(value ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-')
}

export function createItemFromDetail(detail, index) {
  const product = detail.product ?? 'Producto no definido'
  return {
    id: String(detail.id ?? `${normalizeProcessName(product)}-${index}`),
    product,
    quantity: detail.quantity ?? null,
    dueDate: toDateKey(detail.dueDate),
    manufacturingDetails: detail.manufacturingDetails ?? null,
    lanyardProgress: detail.lanyardProgress ?? null,
    subProcesses: Array.isArray(detail.subProcesses) ? detail.subProcesses : [],
  }
}

export function buildOrderItems(order, product, dueDate) {
  const items = (Array.isArray(order.items) ? order.items : []).map(createItemFromDetail)
  if (!items.length) items.push({
    id: `${order.id}-principal`, product, quantity: null, dueDate,
    manufacturingDetails: null, lanyardProgress: null, subProcesses: [],
  })
  return items.sort((left, right) => Number(isLanyardItem(right)) - Number(isLanyardItem(left)))
}

export function normalizeOrder(order) {
  const dueDate = toDateKey(order.dueDate)
  const product = [...new Set((order.items ?? []).map((item) => item.product).filter(Boolean))].join(', ') || 'Producto no definido'
  const items = buildOrderItems(order, product, dueDate)
  const deliveryDelay = getDeliveryDelayStatus(dueDate)
  return {
    id: order.id,
    clientName: order.clientName || 'Cliente sin nombre',
    productionCompletion: order.productionCompletion ?? null,
    seller: order.seller ?? '',
    salesNoteNumber: order.salesNoteNumber,
    product,
    date: order.createdAt ?? '',
    dueDate,
    paymentStatus: order.paymentStatus ?? '',
    paymentStatusId: order.paymentStatusId,
    orderStatus: order.orderStatus,
    generalStepId: order.generalStepId,
    isDelayed: isOrderDelayed(dueDate),
    delayStatus: deliveryDelay.status,
    businessDaysRemaining: deliveryDelay.businessDaysRemaining,
    isUrgent: hasOrderLabel(order, ['Urgencia']) || isOrderUrgent(dueDate),
    hasContractPriority: hasOrderLabel(order, ['Prioridad por contrato', 'Cliente con contrato']),
    isProducing: hasOrderLabel(order, ['PRODUCIÉNDOSE', 'PRODUCIENDOSE']),
    labels: order.labels ?? [],
    items,
    comments: order.comments ?? [],
    commentGroups: order.commentGroups ?? null,
    correctionRequested: Boolean(order.correctionRequested),
    correctionComment: order.correctionComment ?? '',
    correctionRequestedAt: order.correctionRequestedAt ?? null,
    paymentDeconfirmationRequested: Boolean(order.paymentDeconfirmationRequested),
    paymentDeconfirmationRequestedAt: order.paymentDeconfirmationRequestedAt ?? null,
    paymentDeconfirmationRequestedBy: order.paymentDeconfirmationRequestedBy ?? null,
  }
}

export function normalizeStatus(status) {
  const order = Number(status.orden_kanban)
  const column = baseColumns.find(column => column.generalStepId === order) ?? { accent: getOrderStageAccent(order), icon: 'bi-kanban' }
  return { id: String(status.id_estado_pedido), title: status.nombre_etapa, generalStepId: order, order, accent: column.accent, icon: column.icon }
}
```

<a id="fuente-S116"></a>

#### S116 — capaVista/src/modules/kanban/utils/kanbanDates.js

**Tipo:** JavaScript. **Responsabilidad, componentes y funciones:** Funciones puras de fecha y urgencia; dependencia del normalizador. **Filtros relacionados:** KAN-F01–KAN-F03.

**Exportaciones declaradas** (línea inicial): 3: export function parseDate(value) {; 35: export function startOfToday() {; 42: export function isBusinessDay(date) {; 48: export function countBusinessDaysUntil(dueDate) {; 77: export function getDeliveryDelayStatus(dueDate) {; 95: export function isOrderDelayed(dueDate) {; 101: export function isOrderUrgent(dueDate) {; 111: export function toDateKey(value) {.

**Cobertura:** 113 líneas originales; incluidos 1–113; cobertura completa. Huella SHA-256 inicial del archivo: 182E1CFD018D7F0E832C53A9F3BEEB903A8975C15B0FB616641F220F95AA7CD4.

**S116: capaVista/src/modules/kanban/utils/kanbanDates.js, líneas 1–113.** Componente/función o selectores: Funciones puras de fecha y urgencia; dependencia del normalizador. Filtros: KAN-F01–KAN-F03. Fragmento literal:

```javascript


export function parseDate(value) {
  if (!value) {
    return null
  }

  const isoDateMatch = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/)

  if (isoDateMatch) {
    const [, year, month, day] = isoDateMatch.map(Number)
    const parsedDate = new Date(year, month - 1, day)

    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate
  }

  const localDateMatch = String(value).match(/^(\d{2})-(\d{2})-(\d{4})$/)

  if (localDateMatch) {
    const [, day, month, year] = localDateMatch.map(Number)
    const parsedDate = new Date(year, month - 1, day)

    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate
  }

  const date = new Date(value)

  if (!Number.isNaN(date.getTime())) {
    return date
  }

  return null
}

export function startOfToday() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return today
}

export function isBusinessDay(date) {
  const day = date.getDay()

  return day >= 1 && day <= 5
}

export function countBusinessDaysUntil(dueDate) {
  const parsedDueDate = parseDate(dueDate)

  if (!parsedDueDate) {
    return null
  }

  const today = startOfToday()
  parsedDueDate.setHours(0, 0, 0, 0)

  if (parsedDueDate < today) {
    return -1
  }

  let businessDays = 0
  const cursor = new Date(today)
  cursor.setDate(cursor.getDate() + 1)

  while (cursor <= parsedDueDate) {
    if (isBusinessDay(cursor)) {
      businessDays += 1
    }

    cursor.setDate(cursor.getDate() + 1)
  }

  return businessDays
}

export function getDeliveryDelayStatus(dueDate) {
  const businessDaysRemaining = countBusinessDaysUntil(dueDate)

  if (businessDaysRemaining === null) {
    return { status: 'neutral', businessDaysRemaining: null }
  }

  if (businessDaysRemaining <= 2) {
    return { status: 'red', businessDaysRemaining }
  }

  if (businessDaysRemaining <= 5) {
    return { status: 'yellow', businessDaysRemaining }
  }

  return { status: 'green', businessDaysRemaining }
}

export function isOrderDelayed(dueDate) {
  const businessDaysRemaining = countBusinessDaysUntil(dueDate)

  return businessDaysRemaining !== null && businessDaysRemaining < 0
}

export function isOrderUrgent(dueDate) {
  const businessDaysRemaining = countBusinessDaysUntil(dueDate)

  if (businessDaysRemaining === null || businessDaysRemaining < 0) {
    return false
  }

  return businessDaysRemaining <= 3
}

export function toDateKey(value) {
  return value ? String(value).slice(0, 10) : ''
}
```


## 16. Mapa de dependencias

### 16.1. Flujo de cada pantalla hasta sus resultados

| Pantalla → barra/controles | Estado/Hook | Servicio/función → endpoint | Procesamiento → resultados | Estilos que acompañan el flujo |
|---|---|---|---|---|
| KanbanBoardPage → KanbanFilters → KAN-F01/F02/F03 | draftFilters local → onApplyFilters → appliedFilters; useKanbanApi | createKanbanApi.getOrders → /api/orders/kanban-summary; getOrderStatuses → /api/order-status | getOrderViews → listKanbanRows → pageResult → DTO/normalizeOrder → sortOrdersForColumn → DroppableColumn/KanbanCard | PageShell + KanbanBoardPage.module.css + Kanban.module.css + Bootstrap form-control/select |
| PaymentConfirmationPage → PaymentFilters → PAG-F01/F02/F03/F04 | activeFilter/dateFrom/dateTo/searchTerm→settledSearch; usePaymentsApi | getPaymentWorkspace → /api/orders/payments | getPagedPaymentWorkspace → readPaymentPage/readPaymentCounts → DTO/normalizePaymentOrders → table/mobile y contadores | PageShell + PaymentConfirmationPage.module.css + PaymentFilters.module.css |
| UserManagementPage → UserManagementFilters → USR-F01/F02/F03 | search→debouncedSearch, activeStatus, activeRole,page; useAdminUsersApi | listUsers → /api/admin/identity/users; getSummary → /users/summary | validateListUsersQuery → service.list/authorize → repository.list(issuer) y summary → tabla/lista/cards | PageShell + UserManagementPage.module.css |
| Usuarios → UserMovementsModal → USR-F04 | search borrador→query {page,perPage,search}; subject | getMovements → /api/admin/identity/users/:subject/movements | validateUserMovementsQuery → inspect(context,subject) → UserMovementsRepository.list → records,total → UserMovementsTable | UserMovementsModal.module.css, dialog nativo |
| OrderHistoryPage → controles incrustados HIS-F01/F02/F03/F04 | status,searchInput→search,dateRange,cursorStack; useOrderHistoryApi/historyReads | listOrders → /api/history/orders | listOrders valida fechas → orderListQuery → mapSummary/pageResult → tabla/paginación | PageShell + OrderHistoryPage.module.css |
| OrderHistoryDetailPage → select HIS-F05 | type,cursor,summaryOrderId,attempt; subscribeHistoryRead | getOrderHistory / listOrderEvents → /api/history/orders/:id[/events] | parseEventQuery → EVENT_TYPE_SQL/listEvents → cursor tiempo+ID/mapEvent → HistoryEvent | OrderHistoryDetailPage.module.css + PageShell |
| ProductionCalendarPage → CalendarHeader/CalendarFilters → CAL-F01/F02/F03 | filters + calendarItems + monthDate; useOrdersCalendarApi/calendarReads | loadCalendarMonth/loadUnscheduledOrders → /api/orders/calendar-summary; filtrar texto/estado/producto no añade request | monthRange → SQL fecha entrega → normalización → filteredItems (cuadrícula); allItems (pendientes) → Grid/DayCell/Trays | PageShell + page/header/filter/toolbar CSS + ProductionCalendarGrid.module.css |
| MessageInboxPage → MessageFilters → MSG-F01/F02/F03 y MSG-O01 | filters,page; useMessagesApi | getInbox → /api/messages | getInbox resolveUser/parseDate → inboxQuery + count → MessageList y total/páginas | MessageFilters.module.css + MessageInboxPage.module.css + PageShell |

### 16.2. Dependencias comunes y diferencias que el mapa conserva

Todas las cadenas de API pasan por useApiClient → createApiClient → token de sesión vigente/AbortSignal/timeout → HTTP. Los hooks de cada módulo crean una instancia memoizada para no mezclar cuentas. La fuente de datos remota no es un store único de filtros y no comparte el mismo criterio de caché entre módulos.

La cadena visual común es main.jsx → Bootstrap/Icons + global.css + theme.css → PageShell/PageHeader → CSS de página → CSS del control. Un token local puede sustituir el valor global: Calendario usa --page-brand-orange, Kanban/pagos/usuarios declaran su propio naranja y mensajes usa --itexsa-orange. Los menús nativos no pertenecen a esa misma cadena completa de control de layout: su geometría depende del navegador/SO.

En Calendario hay dos ramas diferentes desde la carga: calendarItems→filteredItems→scheduledMonthItems→itemsByDate (filtros aplicados) y calendarItems+unscheduledItems→allItems→pendingItems (sin esos filtros). transferItems es estado adicional que excluye tarjetas temporalmente de otras colecciones sin modificar una fecha hasta la confirmación/PIN. Ese detalle es esencial para interpretar capturas o futuros prototipos.

### 16.3. Dependencias externas descritas, no copiadas

React renderiza los estados; React Router navega y remonta por ruta; Bootstrap proporciona clases base y responsive de tabla móvil de pagos; Bootstrap Icons aporta bi-*; Keycloak aporta identidad y verificación de sujeto/roles, sin manejar directamente el layout de filtros; @dnd-kit/react se usa para drag/drop de Kanban, que es una acción operativa; el calendario usa draggable/DataTransfer nativo. Prisma/Express/MySQL ejecutan predicados y validan consultas. Date, Intl, select, input date, AbortController y dialog son APIs de plataforma. No se instaló ni actualizó ninguna de ellas.

## 17. Aspectos que deben conservarse

1. **Borrador versus aplicado de Kanban.** Cerrar no debe aplicar ni borrar. El criterio real de tarjeta es AND local y la consulta remota tiene un único search; cambiarlo requiere un contrato deliberado.
2. **Composición de producto.** Mixto y producto único de Kanban no equivalen a contiene producto del calendario. El hallazgo SQL de Mixto debe quedar visible para una tarea funcional futura.
3. **Asignación de etapas y prioridad.** Estados finales excluidos de Kanban, orden de producción y contadores por tarjetas cargadas no son equivalentes a un select editable de estado.
4. **Frecuencias y confirmación de búsquedas.** Aplicar, submit y pausas250/350ms tienen efectos de red diferentes. Calendario opera localmente; no debe adquirir requests por pulsación sin una decisión explícita.
5. **Identidad y permisos.** Provider/issuer/usuario destino, roles asignables y alias Activo/Vinculado son restricciones de datos. Ningún componente visual puede conceder permisos ni mostrar un universo distinto por su cuenta.
6. **Independencia de mutaciones.** Estado del filtro de pago no confirma un pago. Estado/rol del filtro de usuarios no edita una cuenta. Cambiar mes no reprograma; arrastrar sólo persiste con la autorización implementada. Abrir mensaje puede marcar leído y debe tratarse como acción con efecto.
7. **Semántica temporal.** Mantener diferencias de creación/publicación/entrega y los límites inclusivos de cada contrato. Date local para navegación no certifica timezone de BD.
8. **Cursos y páginas.** Reset de continuidad al cambiar filtros, tamaño por módulo, nextCursor opaco y cursor compuesto de eventos. No reutilizar un cursor viejo bajo criterios nuevos.
9. **Concurrencia y sesiones.** AbortController, requestId, mounted, suscripciones pendientes y remount por scope evitan resultados antiguos y exposición de datos de otra cuenta. Mantenerlo aunque cambie el contenedor visual.
10. **Scope de contadores.** Resúmenes de usuarios, estados de pagos, filas de historial, bandejas de calendario y total inbox tienen denominadores diferentes.
11. **Filtros secundarios.** USR-F04 vive en dialog, tiene submit/120 caracteres/usuario concreto; HIS-F05 cambia eventos de un pedido sin volver a traer el resumen. No deben desaparecer por estandarizar una barra principal.
12. **Conservación de bandeja calendario.** La selección para traslado no es una búsqueda ni una modificación ya persistida; las tarjetas temporales se conservan entre meses/cancelación/PIN fallido. El alcance de filtros en pendientes requiere decisión, no suposición.
13. **Mensajería propia.** No añadir búsqueda/checkbox/categoría por comparación estética; sólo existen lectura/fechas y orden. Estado leído no equivale a notificación oculta.
14. **Tratamiento de carga/error/vacío.** Una nueva UI debe distinguir pending search, request en curso, fecha inválida, error y cero coincidencias. Conservar los reintentos con los criterios vigentes; la mejora de textos vacíos se evaluará posteriormente.
15. **Interacción accesible existente.** Mantener labels, aria-pressed ya presentes, aria-expanded/controls de Usuarios, dialog nativo y restauración de foco de movimientos. Las lagunas se documentaron, sin que ello autorice retirarlos de otros controles.

## 18. Información pendiente o no verificable

### 18.1. Visual e interacción

- No se abrió la aplicación ni un navegador de inspección. No hay capturas adicionales. Distribución percibida, zoom, scrollbar, reflujo, pixel exacto, overlaps, clipping, fuentes realmente disponibles y estilo computado están pendientes.
- No se ensayaron aperturas/cierres, teclado, tab order, lectores de pantalla, alto contraste, focus-visible o retorno de foco en entorno real. Lo descrito corresponde a handlers/atributos, no a una certificación.
- Menús select/date picker, idioma de calendario nativo y comportamiento de showPicker dependen del navegador/SO y no se deducen sólo de CSS.
- No se verificaron dispositivos físicos ni arrastre táctil; los módulos usan dos mecanismos distintos. Es una limitación adicional de operaciones vecinas, no prueba de fallo de filtros.
- No se midieron height calculado, min-content ni texto de opciones. Los valores «auto/heredado» se mantienen sin estimación en px.

### 18.2. Datos, negocio y contrato

- No se consultó una BD ni Keycloak real. El catálogo real de nombres de producto, etapas, usuarios, tamaño de datos, collation y zona temporal de conexiones no se verificaron.
- El efecto exacto de «Mixto» remoto depende de cómo estén nombrados los productos y de los datos, aunque la divergencia entre predicados sí se ve en código.
- No está confirmada la intención de mantener pendientes/traslados sin filtros en calendario, de omitir Pendiente rol/En revisión de algunas barras o de interpretar fechas dentro de la búsqueda textual del historial.
- No se encontró documentación que justifique por departamento cada diferencia de altura, borde o apertura. Se describen como decisiones pendientes; no se inventa una justificación.
- No se hicieron benchmarks ni recuentos de requests reales. Las pausas, límites, TTL y mecanismos de concurrencia proceden de constantes/código.
- No se abrieron mensajes porque el detalle hace POST y puede marcar leído. No se ejecutaron cambios de estado, filtros por mutación o acciones administrativas.
- No se ejecutó CI, lint ni test suite durante esta tarea para cumplir la prohibición de caches/artefactos; los resultados de turnos anteriores no se reutilizan como evidencia de esta auditoría. La comprobación pura de Kanban es la única ejecución funcional nueva y se limita a esos predicados.
- Las referencias a bibliotecas son rangos de package.json; no se reportan vulnerabilidades, versiones latest ni capacidades actuales obtenidas de Internet.

### 18.3. Qué falta antes de una propuesta definitiva

Sería necesario observar cada módulo autenticado con una cuenta/rol autorizado, usar sólo datos sintéticos permitidos, medir layouts a varios anchos útiles con sidebar expandido/colapsado y verificar semántica de fechas/contadores/opciones frente al backend. Eso constituye trabajo futuro; no se configuró un entorno adicional ni se generó código para hacerlo en esta tarea.

## 19. Conclusiones para la futura etapa de diseño

La base de una comparación útil ya está identificada: los seis módulos comparten marco y transporte, pero no un componente de filtros ni un mismo momento de aplicación. Los tres tipos de apertura, los modos de consulta y los contadores deben analizarse junto con los estilos. La matriz de dimensiones permite decidir densidades y tokens a partir de valores reales, sin presuponer que una misma altura sea correcta en tabla, tablero, dialog y calendario.

Los elementos comparables son contenedores inline, búsqueda, botones de selección única, campos de fecha y acciones de limpieza. También están identificadas las diferencias que una propuesta debe explicar: Mixto exclusivo frente a contiene producto; períodos de creación/publicación/entrega; operaciones de identidad; eventos por pedido; bandejas del calendario; contadores multestado/globales/de página. No se define en este documento una API de componentes nueva ni se elige qué implementación reemplazará a otra.

Las posibles incidencias quedan separadas de las decisiones visuales. Antes de estandarizar conviene conocer el contrato funcional que se quiere preservar, especialmente en Mixto, búsqueda temporal implícita, scope de pendientes y estados/roles. La evidencia presente permite iniciar ese análisis externo sin depender de abrir archivos; donde faltan datos o observación, se ha declarado.

### 19.1. Control de completitud

| Comprobación de entregable | Resultado |
|---|---|
| Seis módulos, con contexto, contenedor y flujo | Incluidos en5–10 |
| Fichas individuales A–H |22, una por control inventariado; extremos de fecha separados |
| Orden y navegación distinguidos |MSG-O01 y CAL-N01–N04, fuera del total22 |
| Código JSX/JS/CSS literal, rutas/rangos |Catálogo15;116 entradas, sin código de terceros |
| Opciones/defaults/placeholders/eventos |Fichas y constantes/JSX originales |
| API, parámetros, consultas y scope |Fichas, módulos, tablas13.3/16.1 y backend extraído |
| Estados activos/loading/error/vacío |Perfiles V-*, fichas y fuentes |
| Tokens, dimensiones, foco, responsive |Secciones5–13, CSS literal en15 |
| Compartidos y similares no compartidos |Sección11;8 usados,2 campos disponibles |
| Hallazgos clasificados sin implementar |H01–H30, clasesC1–C5 |
| Observado versus inferido/pendiente |Secciones2 y18 |
| Secretos/datos reales |No incluidos |
| Único entregable |Este Markdown; sin commits, pruebas escritas, capturas ni cambios del sistema |

### 19.2. Comprobación final del repositorio

Se compararon nuevamente las huellas SHA-256 de los 734 archivos versionados o no ignorados que existían al comenzar. Resultado: **734 sin cambios, 0 modificados, 0 eliminados**. El único archivo adicional detectado es **AUDITORIA_FILTROS_ESTADO_ACTUAL.md**, en la raíz. Los archivos ignorados no se incluyeron en ese cotejo; no se ejecutó ninguna operación destinada a escribirlos.

git diff --stat no mostró cambios de archivos versionados. git status --short --branch mostró main...origin/main y únicamente «?? AUDITORIA_FILTROS_ESTADO_ACTUAL.md». La revisión siguió siendo 83a3965; no se creó commit ni se alteraron ramas, dependencias, configuraciones o datos.

Se verificó además la estructura del Markdown: 19 secciones principales, 22 fichas de filtro, 116 entradas de fuente y 153 bloques de código (306 delimitadores), sin marcadores de conflicto. Los 153 fragmentos se cotejaron contra sus archivos/rangos originales normalizando sólo CRLF/LF: **0 diferencias**. Son 8465 líneas de código extraído. Las referencias internas de fuente existen y los intervalos CSS extraídos mantienen sus bloques completos.

La inspección fue estática, con la única comprobación funcional pura sobre datos sintéticos de Kanban descrita en2.3. No hubo validación visual ni acceso a servicios/datos reales. No se implementó ninguna mejora identificada.


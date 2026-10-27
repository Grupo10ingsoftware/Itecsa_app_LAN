# Notificaciones corporativas de ITECSA

El sistema React utiliza una sola presentación de resultados transitorios: tarjetas blancas con franja semántica, icono circular, título, mensaje y cierre, ancladas abajo a la derecha del viewport. No necesita dependencias nuevas. El backend y las plantillas nativas de Keycloak conservan sus contratos y mecanismos de autorización.

## Arquitectura y API

- `src/shared/notifications/toastStore.js`: cola FIFO, identificadores, deduplicación explícita por origen/operación, temporizadores y pausa con tiempo restante. Los avisos en espera no consumen su duración.
- `ToastProvider.jsx`: contexto con acciones estables y un único portal a `document.body`. Solo el viewport se suscribe a los cambios de la cola; los consumidores no se renderizan por cada aviso.
- `useToast.js`: API compartida y protección contra emisiones de componentes desmontados.
- `NotificationSession.jsx`: conserva la cola entre rutas y la reinicia al cambiar de identidad o terminar la sesión. El inicio del cierre de sesión invalida inmediatamente las emisiones pendientes.
- `operationFeedback.js`: selección del mensaje público seguro y clasificación de validaciones, sesión, conciliación y resultados inciertos. No hay un interceptor que emita automáticamente errores HTTP.
- `ToastProvider.module.css`: las cuatro variantes comparten la misma estructura, dimensiones y animación.

```jsx
const notify = useToast()
notify.success('Usuario actualizado correctamente.')
notify.warning('Debes confirmar el pago antes de mover esta orden.')
notify.info('Nuevo mensaje recibido.', {
  source: 'messages', operation: String(messageId),
  action: { label: 'Leer mensaje', onClick: openMessage },
})
```

Opciones: `title`, `duration`, `source`, `operation`, `action: { label, onClick }`. `source` y `operation` juntos deduplican un evento presente en la cola; dos operaciones independientes con el mismo texto se conservan. Los mensajes se renderizan como texto, nunca como HTML. No enviar credenciales ni contenido privado a esta API.

Duraciones: éxito e información 5 s; advertencia 7 s; error 8 s. Entrada 180 ms y salida 140 ms. El cierre manual limpia la espera y completa la salida antes de promover otra tarjeta. Hover y foco pausan por separado; retirar uno no reanuda mientras el otro siga activo. Cambiar la capacidad de la pila limpia pausas de interacción de tarjetas devueltas a la cola.

## Presentación, accesibilidad y capas

- Máximo 390 px; margen de 20 px en escritorio y 12 px en móvil, con áreas seguras. Hasta tres visibles; dos en móvil/altura media y uno en baja altura o junto a un modal en pantallas estrechas. Los demás quedan en cola.
- La pila ocupa hasta 60 % de la altura, con texto largo desplazable dentro de su tarjeta. Junto a diálogos estrechos se compacta y reserva espacio para los controles PIN.
- Éxito `#248F55`, error `#B91C1C`, advertencia `#9A3412`, información `#1D4ED8`, con fondos suaves respectivos. El texto usa `#111827`; foco corporativo `--page-brand-orange: #FE5A00`.
- El token de capa del diálogo PIN conserva 2000 y el de toast es 2010. El host vacío no captura eventos. La región de notificaciones permanece accesible junto al modal; el fondo de la aplicación conserva su aislamiento.
- Errores con `role="alert"`; el resto con `role="status"`. El cierre tiene nombre accesible y las tarjetas incluyen icono y título además del color.
- No se cambia el foco al emitir. Los controles del toast participan de la navegación del diálogo activo. Se restaura el foco al cerrar una tarjeta enfocada y se preserva al reducir la pila.
- Movimiento reducido elimina desplazamientos de entrada/salida; colores forzados conservan bordes perceptibles.

## Migraciones realizadas

| Módulo | Acción o mensaje | Antes | Ahora | Criterio |
|---|---|---|---|---|
| Kanban | Restricciones al mover etapas, pago pendiente, subprocesos incompletos | Toast Bootstrap superior | Toast global de advertencia | Regla de negocio sin campo que corregir |
| Kanban | Fallo de validación previa al traslado o actualización de etiqueta | Toast Bootstrap superior | Toast global de error | Resultado transitorio |
| Kanban | Etapa, etiqueta, subproceso, retroceso, cancelación, revisión y reevaluación confirmadas | Actualización visual de datos sin confirmación común | Toast de éxito tras respuesta confirmada | Un único productor por resultado |
| Kanban | Fallo general de subproceso, retroceso, cancelación o corrección | Toast del padre y error del hijo | Un solo toast desde el responsable local | Eliminación de duplicados |
| Kanban | Guardar carga operativa | Error local o cierre sin confirmación | Toast de éxito/error; validación e incertidumbre contextual según contrato | Se conserva la corrección local |
| Usuarios | Usuario actualizado/creado | `actionMessage` dentro del lienzo | Toast de éxito | El resultado no necesita ocupar el listado |
| Usuarios | Fallo general de actualización | Aviso en la página y en el modal | Un toast; formulario conservado | Sin duplicar el mismo fallo |
| Usuarios | Fallo general al inspeccionar cuenta o preparar usuario | Bloque local | Toast si el resultado es transitorio | Sesión, conflictos y resultado incierto conservan contexto |
| Credencial inicial | Copia o fallo al copiar | Párrafo de resultado | Toast sin valor de contraseña | Solo confirma la acción de portapapeles |
| Pedidos | Registro confirmado | Pantalla adicional de éxito | Toast y formulario reiniciado, con acción «Ver pedidos» | Confirmación ligera y acceso conservado |
| Pedidos | Fallo general de registro | `OrderNotice` en el lienzo | Toast de error | Validación e incertidumbre son excepciones contextuales |
| Pagos | Restricción de vuelta a Pendiente | Bloque warning en la página | Toast de advertencia | Regla general |
| Pagos | Actualización confirmada o fallo general | Bloque de error en página y modal | Toast único; PIN/incertidumbre en modal | Sin éxito anticipado ni error duplicado |
| Calendario | Cambio confirmado de fecha | Cierre del modal | Toast de éxito | Tras respuesta del backend |
| Calendario y modales PIN | Fallo general de la operación | Mensaje bajo el PIN | Toast; PIN, observaciones y resultado incierto permanecen locales | Separar autorización y resultado |
| Perfil | Recuperación de PIN confirmada | Alerta verde inline | Toast de éxito sin PIN | Confirmación transitoria |
| Mensajes entrantes | Nuevo mensaje | `MessagePopup`, contenido abreviado y diseño propio | Toast informativo genérico con «Leer mensaje» | Conserva detección, FIFO y señal sonora sin divulgar contenido |
| Campana | Abrir/limpiar una notificación o limpiar todas falla | Error mezclado con carga en el panel | Toast de error | Conserva notificaciones disponibles |

La detección de nuevos mensajes sigue usando IDs crecientes y no avisa mensajes históricos en la primera carga. `useMessageSound` conserva la señal breve cuando el navegador autoriza audio. Abrir el detalle utiliza la ruta existente, que conserva autorización y marcado de lectura.

## Casos que permanecen contextuales

- Campos de usuarios, Nota de Venta, formatos, correos, RUT y observaciones: necesarios durante la corrección.
- PIN inválido/bloqueado: permanece asociado al campo del modal. Un fallo general no marca el PIN como incorrecto.
- Carga de tabla, perfil, historial, métricas, calendario, documentos, bandeja y notificaciones: estado persistente con reintento cuando está disponible.
- Reporte de métricas: su resultado y el fallo que impide mostrarlo siguen en la sección del reporte.
- Sesión expirada, acceso denegado y configuración de autenticación: estados de acceso persistentes.
- Creación incompleta, conciliación y envíos no confirmados: conservan referencias e instrucciones. Privacidad e incidentes mantienen recibo, fecha, referencia, bloqueo de edición e identidad del reintento.
- Interrupciones de una escritura sin resultado confirmado: conservan un aviso contextual e indican comprobar el resultado antes de repetir. La presentación no decide que una operación fue exitosa.
- Entrega de contraseña inicial y PIN inicial: los secretos permanecen únicamente en su diálogo autorizado, nunca en un toast.
- Login y recuperación nativos de Keycloak: no se modifican ni reciben dependencias React.

El aviso contextual de autorización por PIN de Gestión de usuarios se restauró. Las dos pruebas que fallaban en la auditoría anterior mantienen sus aserciones originales y pasan.

## Limpieza

Se retiraron `MessagePopup.jsx`, su CSS, `OrderNotice.jsx`, su CSS, `OrderCreateSuccess.jsx` y su CSS. Se eliminaron el markup/imports de `react-bootstrap/Toast`, la cola visual local de la campana y el portal vinculado al topbar. Se retiraron `popupPreview`, los estados de éxito inline migrados y las variantes CSS residuales verificadas en Usuarios, Pedidos y Calendario. Los scripts de revisión de carga y banners ahora montan el proveedor.

`PinError`, las alertas persistentes y la bandeja/campana permanecen porque cumplen funciones diferentes. No se eliminaron ramas funcionales ajenas a esta migración.

## Archivos de implementación

Rutas relativas a `capaVista/src/` salvo indicación contraria:

- Nuevos: `shared/notifications/{toastStore.js,useToast.js,ToastProvider.jsx,ToastProvider.module.css,NotificationSession.jsx,operationFeedback.js}` y `modules/messages/hooks/useMessageSound.js`.
- Montaje y sesión: `app/providers/{AppProviders.jsx,AuthProvider.jsx}`. Solo se añade el proveedor y la invalidación de avisos al salir.
- Usuarios: `modules/users/pages/{UserManagementPage.jsx,UserManagementPage.module.css}`, `modules/users/components/{UserCreateForm.jsx,UserCreateForm.module.css,UserEditModal.jsx,TemporaryPasswordModal.jsx}` y `modules/users/hooks/useModalDialog.js`.
- Kanban: `modules/kanban/components/{KanbanColumn.jsx,KanbanOffCanvas.jsx}` y `modules/kanban/pages/KanbanBoardPage.jsx`.
- Pedidos: `hooks/useOrderCreateFlow.js` y `modules/orders/pages/{OrderCreatePage.jsx,OrderCreatePage.module.css}`.
- Pagos: `modules/payments/pages/PaymentConfirmationPage.jsx`.
- Calendario: `modules/productionCalendar/components/{ProductionCalendarGrid.jsx,ProductionCalendarGrid.module.css}`.
- Perfil: `modules/profile/pages/ProfilePage.jsx`.
- Mensajes: `modules/messages/components/NotificationBell.jsx`, `modules/messages/utils/popupNotifications.js` y `shared/components/layout/Topbar.jsx`.
- Presentación compartida: `shared/components/pin/{PinAuthorizationModal.jsx,PinModal.module.css}` y `styles/theme.css`.
- Eliminados: `modules/messages/components/MessagePopup.{jsx,module.css}`, `modules/orders/components/OrderNotice.{jsx,module.css}` y `modules/orders/components/OrderCreateSuccess.{jsx,module.css}`.
- Pruebas nuevas: `shared/notifications/{toastStore.test.js,ToastProvider.test.jsx,NotificationMigration.test.jsx}`, `modules/messages/components/NotificationToast.test.jsx` y `test/renderWithToast.jsx`. Las pruebas existentes se montan con el proveedor; las aserciones de seguridad, carga y autorización se conservan. Dos aserciones de fallo de transporte incorporan la instrucción persistente nueva de comprobar el resultado.
- Revisión visual: `capaVista/verify/{toasts.html,toastFixtures.jsx}`, `scripts/verify-toasts.mjs` y adaptación del montaje en `scripts/{verify-loading.mjs,verify-page-layout.mjs}`.
- Documento: `docs/notificaciones.md`.

## Verificación reproducible

```powershell
cd capaVista
npm.cmd run lint
npm.cmd test
npm.cmd run build
cd ../capaServidor
npm.cmd run test:users
npm.cmd run test:pin
cd ..
node scripts/verify-toasts.mjs
git diff --check
```

Las pruebas nuevas cubren severidades, duraciones, FIFO, límite, deduplicación, cierre, salida, pausas independientes, redimensionamiento, foco, desmontaje, navegación, cierre/cambio de sesión y resultados tardíos. Las pruebas de migración usan páginas/componentes reales para Usuario, Pedidos, PIN y mensajes entrantes; comprueban ausencia de duplicados y conservación de contexto.

El proyecto no declara un comando de typecheck. Las pruebas frontend incluyen las comprobaciones existentes del tema de Keycloak. Los tests de usuarios y PIN del backend usan dobles de dependencias y no generan cuentas ni modifican datos empresariales reales.

El script visual utiliza Edge sin ventana, páginas reales y API/identidad sintéticas; bloquea solicitudes fuera de su origen local. Revisa las 14 vistas, los anchos 320, 375, 768, 1024 y 1440 px, capa sobre modal, contraste, texto largo, baja altura, scroll, sidebar, teclado, movimiento reducido y zoom 200 %. Guarda capturas y `results.json` en `dist/toast-review/`, excluido de Git.

Límites: las comprobaciones no escriben datos reales, no equivalen a una sesión autenticada contra el servidor Ubuntu y no sustituyen una prueba manual con lector de pantalla. No se despliega ni se cambian credenciales, permisos, reglas de negocio o configuración productiva.

# Mi perfil y tablas de movimientos — revisión del 30 de octubre de 2026

## Cambios implementados

- Actividad reciente consulta `/auth/profile/movements?page=N&perPage=10`. Usa el total del servidor, conserva la página durante renderizados ordinarios y ajusta una página que exceda el último resultado disponible. Se eliminó «Ver historial completo».
- La consulta existente ordena por `FECHA_HORA DESC, ID_REGISTRO DESC`; el identificador desempata fechas iguales. No se cambiaron SQL, permisos, filtros ni contratos de consulta. La paginación sigue siendo por desplazamiento: no constituye una instantánea de la base de datos ante inserciones concurrentes.
- Nombre de usuario proviene exclusivamente de `preferred_username` del token de Keycloak, expuesto como `identityUser.username`. No se deduce del nombre ni del correo. Se conserva «No informado» cuando falta.
- `UserMovementsTable` mantiene siempre `thead`, `tbody` y el contenedor exterior. Carga, error y vacío se representan en una celda con `colSpan=3`; solo las filas del cuerpo cambian. El spinner tiene espacio reservado y se centra dentro del ancho visible del área desplazable.
- El pie es ahora hijo del mismo contenedor que el área desplazable de la tabla. No se usan márgenes negativos. El perfil emplea `TablePagination` integrado; movimientos mantiene sus controles y selección de páginas existentes, con los estilos compartidos de paginación.
- Los contadores muestran «Cargando resultados…» mientras la consulta está pendiente y no anuncian cero registros como si fuera una respuesta definitiva. Las acciones de paginación quedan deshabilitadas durante carga o error.
- Se reutilizan `UserManagementTable.module.css`, `TablePagination`, `LoadingIndicator`, Toast y `useModalDialog`. Las franjas usan los mismos colores de las tablas de referencia. Las esquinas pertenecen al conjunto y no a celdas individuales.
- El modal de movimientos utiliza la capa y gestión de foco existentes. El diálogo nativo anterior se elevaba a la capa superior del navegador, por encima del Toast que se monta en `document.body`; se eliminó esa incompatibilidad sin crear un segundo sistema de notificaciones.

## Causas de los defectos visuales

| Defecto | Causa comprobada | Corrección |
| --- | --- | --- |
| Pie separado en perfil | Tabla y pie eran hermanos directos de un grid con `gap: 1rem`. | Pie dentro de la tarjeta de tabla. |
| Pie separado en movimientos | Pie fuera del cuerpo y de la tarjeta que envolvía la tabla. | Pie dentro de la misma tarjeta; desplazamiento limitado al área de tabla. |
| Encabezados ausentes durante carga | Un ternario sustituía toda la tabla por `LoadingIndicator`. | Tabla persistente y spinner únicamente en `tbody`. |
| Cero resultados transitorio | `total ?? 0` se mostraba antes de recibir la respuesta. | Mensaje explícito de carga y distinción de error/vacío/éxito. |

Gestión de Usuarios y el Historial de Pedidos ya conservan sus encabezados y colocan la paginación dentro de su panel. Cobranza usa una tabla propia y un adaptador de `TablePagination`. Se inspeccionaron esas implementaciones y no se rediseñaron. La ampliación de `TablePagination` es opcional y conserva el comportamiento de sus demás consumidores.

## Recuperación de PIN: hallazgos confirmados y límites

1. **Cuota contada dos veces.** Inicio y finalización compartían el límite de cinco solicitudes por cuenta en quince minutos. Dos ciclos completos consumían cuatro solicitudes; el tercer inicio consumía la quinta y su finalización podía recibir 429. Se separaron las cuotas de inicio y finalización, manteniendo cinco solicitudes por cuenta y veinte por IP en cada fase, en la misma ventana. Una prueba con el limitador en memoria comprueba cinco ciclos completos y el bloqueo del sexto inicio y finalización. Esto demuestra el defecto, pero no demuestra que fuese la causa de la captura del usuario.
2. **Contexto descartado antes de un 429 de restauración.** El frontend eliminaba la correlación antes de llamar a `resume`. El limitador de esa ruta rechaza antes de consumir el puente del servidor. Ahora se conserva únicamente esa correlación pública ante 429 y se permite un reintento manual después de `retryAfterSeconds`, con exclusión de llamadas simultáneas. No hay reintento automático ni repetición automática de una rotación. La URL se limpia; el código permanece solo en memoria durante ese intento.
3. **429 ocultado en la finalización.** Se reemplazaba por un mensaje genérico. Ahora se informa el límite de solicitudes y se mantiene la sesión original que ya fue restaurada.
4. **Espera de restauración sin límite del cliente.** Se añadió un límite de quince segundos a la petición. Un fallo de red o resultado incierto no habilita reintentos automáticos.
5. **Errores incrustados y repetidos.** Perfil, recepción de PIN y pantalla de recuperación fallida utilizan Toast. El resultado de recuperación se consume una sola vez; los detalles técnicos inesperados no se muestran como mensajes al usuario.

No se comprobó la causa exacta del mensaje relativo a la pérdida de la sesión en el entorno real. El código distingue fallo de restauración de fallo de validación posterior con sesión ya restaurada; no se deben confundir. Los nuevos códigos de diagnóstico son `BRIDGE_MISSING_OR_EXPIRED`, `BRIDGE_COOKIE_MISSING`, `BRIDGE_COOKIE_INVALID`, `CONFIGURATION`, `TOKEN_REFRESH`, `TOKEN_RESPONSE`, `TOKEN_VALIDATION`, `ORIGINAL_SESSION_MISMATCH` e `ID_TOKEN_VALIDATION`. No contienen cookies, PIN, códigos de autorización ni tokens.

Se mantienen PKCE S256, `prompt=login`, `max_age=0`, validación de nonce/issuer/audience/azp/auth_time, coincidencia de cuenta y sesión originales, consumo único, cancelación y expiración. No se incorporan Direct Access Grants ni almacenamiento de tokens en el navegador. La cookie sigue siendo HttpOnly, SameSite=Strict, sin Domain y con Path `/api/auth/pin/recovery`; Secure se mantiene según el entorno existente. No hay evidencia suficiente para cambiar esos atributos.

El puente y la operación permanecen en memoria del proceso: reiniciar el backend o atender el retorno en otro proceso sin el contexto invalida el flujo de forma segura. Un tiempo de espera de cuota superior al TTL del puente tampoco garantiza restauración. No se modificaron despliegue, afinidad, TTL ni almacenamiento para ocultar esas condiciones.

Se contrastaron los criterios con la [documentación de Keycloak sobre el adaptador y tokens en memoria](https://www.keycloak.org/securing-apps/javascript-adapter) y la [documentación de atributos de cookies de MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie). Estas referencias no prueban qué cookies recibió el navegador del usuario.

## Otros puntos de auditoría

- Las nuevas lecturas de actividad descartan el primer montaje de StrictMode antes de enviar la petición, abortan al salir y no permiten que una respuesta tardía de otra cuenta sustituya los datos actuales.
- La recepción del PIN conserva sus bloqueos de envío, la eliminación del secreto tras aceptación y la revalidación de permisos. No vuelve a persistir una aceptación si falla solo la revalidación posterior.
- El contrato actual de perfil no proporciona `fechaRegistro`; se conserva su visualización «No informada» conforme a la instrucción de no alterar los demás campos. No se inventó una fecha de registro usando otra entidad.
- `/auth/profile` continúa proporcionando su campo legado `records` para conservar compatibilidad; la tabla utiliza exclusivamente el endpoint paginado y su total real.

## Archivos de estas dos solicitudes

- `capaVista/src/modules/profile/pages/ProfilePage.jsx` y `ProfilePage.test.jsx`.
- `capaVista/src/modules/profile/components/PendingPinModal.jsx` y `PendingPinModal.test.jsx`.
- `capaVista/src/modules/users/components/UserMovementsTable.jsx`, su nuevo test, `UserMovementsModal.jsx`, `UserMovementsModal.module.css` y `UserMovementsModal.test.jsx`.
- `capaVista/src/shared/components/pagination/TablePagination.jsx`.
- `capaVista/src/app/App.jsx`, `app/providers/keycloakSession.js` y su test.
- `capaVista/src/modules/auth/api/authApi.js` y su nuevo test; `pinRecoveryBrowser.js` y su test; nuevos `pages/PinRecoveryFailure.jsx` y `PinRecoveryFailure.test.jsx`.
- `capaVista/verify/pageFixtures.js`: respuesta sintética del endpoint paginado para las verificaciones existentes.
- `capaServidor/src/middlewares/rateLimit.js`, `modules/auth/service/pinRecovery.test.js`, `pinRecoveryNavigation.service.js` y `pinRecoveryNavigation.test.js`.

Los cambios anteriores en `UserEditModal` corresponden a la solicitud previa de separar edición y autorización; se conservaron.

## Validación

- Frontend: 140 pruebas aprobadas entre perfil, usuarios, recuperación, adaptador Keycloak, paginación y regresiones de páginas. Incluyen estructura persistente durante carga, pie integrado, páginas de diez registros, errores/vacíos, respuestas tardías, StrictMode, cancelación y reintento manual ante 429.
- Backend: 59 pruebas aprobadas de recuperación, navegación, seguridad del perfil y consultas de actividad. Incluyen firmas, identidad/sesión originales, replay, expiración, permisos, recepción del PIN y límites de solicitudes.
- Build de Vite aprobado; persiste la advertencia de PostCSS sobre la opción `from`.
- ESLint de los archivos modificados aprobado; `git diff --check` aprobado. El lint global de la sesión ya había señalado tres imports sin uso en `modules/metrics/utils/productColors.test.jsx`, ajeno a estos cambios.
- Pendiente: reproducción con Keycloak, cookies y datos reales; revisión visual en escritorio y móvil. El inventario de automatización informó que el host de acceso al navegador no está disponible. Las pruebas DOM y la revisión de CSS no equivalen a una captura visual ni a una prueba completa contra el proveedor real.

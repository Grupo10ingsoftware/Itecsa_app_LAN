# Auth0 frente a Keycloak: equivalencias, flujos candidatos y aceptación

Revisión 24-10-2026, commit `34dfd7c09f876285c1ea84d9020a44a1414ba468`. **Diseño para revisión; no implementación.** Evidencia propia y catálogo de hallazgos en [01](01_AUTH0_INVENTARIO_EXHAUSTIVO.md); política de roles en [02](02_RBAC_ACTUAL_Y_PROPUESTO.md).

## 1. Versiones y fuentes: separar contrato documentado de instalación

| Fuente oficial consultada | Versión / funcionalidad | Aplicación y límite para ITECSA |
| --- | --- | --- |
| [Auth0 React](https://auth0.com/docs/libraries/auth0-react) | SDK; contrastado con lock React 2.17.0 y SPA 2.20.0 | Contexto, callbacks, tokens en memoria; tenant y mecanismos efectivos de renovación no consultados |
| [Management tokens](https://auth0.com/docs/secure/tokens/access-tokens/management-api-access-tokens) | API v2 y client_credentials | Token administrativo distinto del Bearer API; scopes no son permisos del trabajador |
| [Create user](https://auth0.com/docs/api/management/v2/users/post-users), [roles](https://auth0.com/docs/manage-users/access-control/configure-core-rbac/rbac-users/assign-roles-to-users) | Auth0 Management | id/user_id y roles propios del tenant; no asumir respuesta equivalente a Keycloak |
| [Contraseñas](https://auth0.com/docs/authenticate/database-connections/password-change), [claims](https://auth0.com/docs/secure/tokens/json-web-tokens/create-custom-claims) | Auth0 Database / Actions | Respaldo de correo y Action no prueba configuración activa |
| [Admin REST](https://www.keycloak.org/docs-api/26.8.1/rest-api/index.html) | **26.8.1**, documentación versionada disponible | Rutas y representaciones candidatas; versión del servidor real pendiente |
| [UsersResource 26.8.1](https://raw.githubusercontent.com/keycloak/keycloak/26.8.1/services/src/main/java/org/keycloak/services/resources/admin/UsersResource.java) | Implementación oficial versionada | Alta/búsqueda, autorización y conflictos; no sustituye ensayo del despliegue |
| [UserResource 26.8.1](https://raw.githubusercontent.com/keycloak/keycloak/26.8.1/services/src/main/java/org/keycloak/services/resources/admin/UserResource.java) | Credenciales y acciones | Temporary requiere UPDATE_PASSWORD; no revelar credencial hasta respuesta confirmada |
| [RoleMapperResource 26.8.1](https://raw.githubusercontent.com/keycloak/keycloak/26.8.1/services/src/main/java/org/keycloak/services/resources/admin/RoleMapperResource.java) | Mappings y comprobaciones administrativas | Mapear usuario y rol son autorizaciones que se deben comprobar por separado |
| [AIA 26.8.1](https://raw.githubusercontent.com/keycloak/keycloak/26.8.1/docs/documentation/server_admin/topics/users/con-aia.adoc) y [UpdatePassword 26.8.1](https://raw.githubusercontent.com/keycloak/keycloak/26.8.1/services/src/main/java/org/keycloak/authentication/requiredactions/UpdatePassword.java) | Cambio nativo y reautenticación | Candidato para perfil; acción/cancelación no equivale a contraseña establecida por backend |
| [Adaptador JS](https://www.keycloak.org/securing-apps/javascript-adapter) | Release separada; proyecto fija **26.2.4** | PKCE, refresh, logout e iframe; verificar comportamiento con navegador corporativo |
| [Administración](https://www.keycloak.org/docs/latest/server_admin/index.html) | Guía **latest**, consulta 24-10-2026 | Orientación para realm, user profile y mínimos; no fijar procedimiento por latest sin contraste |
| [Producción](https://www.keycloak.org/server/configuration-production), [BD](https://www.keycloak.org/server/db), [hostname](https://www.keycloak.org/server/hostname) | Guías públicas actuales | PKI, persistencia y topología se seleccionan con infraestructura, no se presumen disponibles |

La URL de guía completa `/docs/26.8.1/server_admin/index.html` no resultó accesible con el lector web; se priorizaron REST y código/documentación oficiales del tag 26.8.1 para procedimientos concretos. No se sustituyó ese fallo afirmando que latest acredita la instalación. No se fijó ni actualizó la versión de ningún servicio.

## 2. Matriz técnica de migración

Las rutas abreviadas se resuelven en el inventario completo de 01. C = actual confirmado por código; D = candidato documentado; P = decisión/configuración/prueba pendiente. Las filas son tareas futuras verificables, no cambios aprobados.

| ID | Operación | Archivo actual | Líneas | Auth0 actual | Datos entrada/salida | Dependencia adicional | Keycloak candidato | Diferencia | Cambio frontend | Cambio backend | Cambio BD | Configuración manual | Riesgo | Prueba | Certeza |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| M01 | Login/callback | AppProviders.jsx | 10-40 | React SDK | destino → identidad | router | JS Code+PKCE | cliente/URLs/sesión distintos | completar adaptador existente | issuer/JWKS | no por login | SPA pública, callbacks exactos | redirect inseguro | T01,T05 | C/D/P |
| M02 | Access/refresh/logout | IdentityProviders.jsx; keycloakSession.js | 8-36;7-94 | getAccessTokenSilently | sesión → access token | contexto/generación | updateToken/logout | memoria/SSO/iframe distintos | coordinar renovación/cierre | no aceptar ID token | ninguna | expiraciones y salida | token undefined/viejo | T04,T09,T10 | C/D/P |
| M03 | Verificar JWT | checkJwt.js | 9-35 | discovery y JWKS | Bearer → claims | jose | emisor y JWKS LAN | issuer exacto no es backchannel | conservar Bearer | fijar políticas y parámetros | ninguna | firma/audience/CA | caché no equivale offline | T07,T08 | C/D/P |
| M04 | Claims/RBAC | keycloakClaims.js; authorization.js | 3-10;27-55 | namespaced roles + permissions | claims → capacidades | matriz local | mappers o traducción | realm/client roles y scopes diferentes | conservar can/verify | adaptar origen sin ampliar | roles locales, si se aprueba | roles/client scopes | escalamiento | T11–T14 | C/D/P |
| M05 | Identidad/estado | requireActiveIdentity.js | 8-58 | sub y consulta rol remoto | sub → id_usuario | MySQL | issuer/sub y estado local | UUID nuevo; discrepancia hoy deniega | DTO compatible | repositorio/mapeo | correspondencia candidata | identidades objetivo | persona incorrecta | T13,T25 | C/D/P |
| M06 | Alta | adminUsers.controller.js | 480-615 | create + rol + correo | datos → outcome | MySQL/PIN | Admin create + mappings | 201 Location; provisión distinta | username/outcomes | adaptador y saga | username/provisión | cliente servicio | huérfanos/repetición | T15–T18 | C/D/P |
| M07 | Datos y correo | adminUsers.validator.js; users.repo.js | 44-88;265-334 | correo obligatorio | formulario → fila | schema | username obligatorio/email opcional | UI sola ya no basta | validación/contacto | alinear contrato | nullable/unique estudiados | user profile | null/falso correo | T15,T32 | C/D/P |
| M08 | Asignar/cambiar rol | auth0Management.service.js | 277-418,482-546 | IDs Auth0; DELETE+POST | rol → mapping | estado Pendiente rol | realm/client mappings | rol ID/representación diferente | etiquetas/listas | preservar transición | correspondencia de roles | nueve roles aprobados | intervalo sin rol | T17,T19 | C/D/P |
| M09 | Baja/reactivación | adminUsers.controller.js | 322-436 | blocked + estado | estado/PIN → bloqueo | PIN/auditoría | enabled + sesiones | enabled no revoca JWT local | mismas acciones | orden seguro/conciliación | conservar identidad | sesiones y política baja | acceso token antiguo | T19,T20 | C/D/P |
| M10 | Credencial inicial | auth0Management.service.js | 110-112,421-479 | aleatoria no revelada + email | CSPRNG → IdP | provisión | password temporary | obligación nativa, sin email | revelado único | verificar establecimiento | nunca password | UPDATE_PASSWORD/política | secreto en logs | T16,T21,T22 | C/D/P |
| M11 | Recuperación pública | auth.controller.js; rateLimit.js | 183-238;43-59 | email/202/antienumeración | email → solicitud correo | cuotas/logs | username → expediente | proceso supervisado nuevo | reemplazar formulario | cuotas y expediente | nuevo modelo propuesto | forgot-password email off | abuso/DoS | T26–T28 | C/D/P |
| M12 | Aviso a Soporte | message.service.js; message.repo.js | 166-200;205-255 | sin Auth0 directo | destinatarios → aviso | MENSAJE_USUARIO | reutilizar mensajería local | falta vínculo/dedupe expediente | enlace a solicitud | evento/outbox | vínculo único candidato | ninguna de email | avisos duplicados/perdidos | T29,T30 | C/P |
| M13 | Reset supervisado | TemporaryPasswordModal.jsx | 6-53 | no operación Auth0 equivalente en UI | PIN/verificación → endpoint faltante | auditoría/operador | reset-password + logout | ruta backend inexistente | integrar bandeja/outcomes | autorizar y conciliar | expediente/operación | service account mínima | dos operadores/timeout | T18,T21,T31 | C/D/P |
| M14 | Cambio personal | ProfilePage.jsx | 17-160 | no cambio password propio | sesión → perfil/PIN | identidad | AIA UPDATE_PASSWORD | interacción nativa/reautenticación | botón y retorno controlado | no capturar password | no password | acción/client redirect | cancelación/confundir éxito | T03,T24 | C/D/P |
| M15 | PIN y actor | pin.service.js | 147-237,323-408 | lookup id_auth0 | PIN+sub → actor | crypto/llave/MySQL | conservar servicio | independiente contraseña | preservar acuse | mantener sujeto estable | conservar PK/llaves | ninguna IdP | pérdida de histórico/PIN | T23,T32 | C/P |
| M16 | Política nueve roles | authorization.js | 2-55 | 8 roles/25 capacidades | rol/token → permisos | guards/tests | 9 roles candidatos | Soporte viejo ≠ nuevo | menú/rutas/listas | capacidades y alcance | asignaciones explícitas | roles/mappers | privilegios heredados | T11–T14 | C/P |
| M17 | Auditoría | supportAudit.js | 5-31 | Soporte técnico y mutaciones | actor/request → evento async | BD/log | eventos de cuentas + IdP | falta atomicidad global | historial cuentas | registrar pasos/resultados | metadatos sin secretos | eventos IdP/retención | acción sin evidencia | T22,T31 | C/D/P |
| M18 | Operación aislada | compose.yaml;40-runtime-config.sh | archivo completo;4-29 | Auth0/Aiven/config pública | env → SPA/API | DNS/CA/NTP/BD | servicios LAN | piloto/túnel no producción | URLs públicas LAN | destinos internos CA | negocio/IdP separados | hostname/TLS/backup | dependencia cloud residual | T33,T34 | C/D/P |

## 3. Contratos administrativos candidatos Keycloak

Base conceptual `https://<idp-lan>/admin/realms/{realm}`; `{realm}` es nombre, `{id}` identificador del usuario y `{clientUuid}` ID interno del cliente, distinto de clientId. Todas estas llamadas son **backend → IdP**, con Bearer de cuenta de servicio y JSON cuando hay body. Ningún secreto administrativo va en VITE o en el token del trabajador.

Referencias de rutas y respuestas: [REST 26.8.1](https://www.keycloak.org/docs-api/26.8.1/rest-api/index.html); alta y búsqueda: [UsersResource](https://raw.githubusercontent.com/keycloak/keycloak/26.8.1/services/src/main/java/org/keycloak/services/resources/admin/UsersResource.java). La siguiente es una matriz contractual, no comandos para ejecutar.

| Operación | Método y ruta relativa | Body/query conceptual | Resultado que debe manejar el adaptador |
| --- | --- | --- | --- |
| Token de servicio | POST `/realms/{realm}/protocol/openid-connect/token`, fuera de base admin | form client_credentials y credencial confidencial | 200 access_token/expiración; no equiparar con token SPA |
| Alta | POST `/users` | UserRepresentation: username, enabled, nombres, email si existe, atributos controlados | 201 y Location; resolver ID, no esperar Auth0 user_id; 409 conflicto |
| Buscar username | GET `/users?username={u}&exact=true` | query codificada; paginación cuando corresponda | 200 array; cero/uno/múltiples se manejan explícitamente |
| Detalle | GET `/users/{id}` | ninguno | 200 representación; 404 no encontrado |
| Actualizar/perfil/estado | PUT `/users/{id}` | campos autorizados, enabled, requiredActions según operación | 204 sin JSON; conflictos/validaciones no son éxito |
| Roles realm | GET `/roles`; GET `/roles/{role-name}` | paginación/nombre codificado | 200 lista/representación con id y name |
| Mappings realm | GET/POST/DELETE `/users/{id}/role-mappings/realm` | escritura: array RoleRepresentation | lectura 200; escritura 204 |
| Mappings client | GET/POST/DELETE `/users/{id}/role-mappings/clients/{clientUuid}` | roles de ese cliente | lectura 200; escritura 204; alternativa al realm actual |
| Password temporal | PUT `/users/{id}/reset-password` | CredentialRepresentation password, value generado, temporary:true | 204; nunca devuelve la contraseña establecida |
| Acciones requeridas | PUT `/users/{id}` | requiredActions contiene UPDATE_PASSWORD preservando otras | 204; no borrar otras acciones por reemplazo incompleto |
| Sesiones | GET `/users/{id}/sessions` | ninguno | 200 lista; no prueba por sí sola ausencia de JWT aún válido |
| Cerrar sesiones | POST `/users/{id}/logout` | ninguno | 204; API debe continuar validando estado local |

No utilizar reset-password-email ni execute-actions-email para los flujos sin correo. Consultar usuario después de un reset **no permite leer ni confirmar el texto secreto** que se estableció. No diseñar conciliación que compare la contraseña consultando el perfil.

### Privilegios del cliente administrativo: alcance por operación

Para altas y cambios, el código oficial aplica autorización de gestión de usuarios; consultas aplican vista/consulta. Para mappings exige autoridad sobre el usuario **y** para mapear el rol. No existe equivalencia directa entre scopes Auth0 y roles realm-management. Fuente de esas comprobaciones: [UserResource](https://raw.githubusercontent.com/keycloak/keycloak/26.8.1/services/src/main/java/org/keycloak/services/resources/admin/UserResource.java) y [RoleMapperResource](https://raw.githubusercontent.com/keycloak/keycloak/26.8.1/services/src/main/java/org/keycloak/services/resources/admin/RoleMapperResource.java).

| Grupo | Permiso administrativo candidato | Restricción y verificación necesaria |
| --- | --- | --- |
| Buscar/leer | query-users / view-users o política granular equivalente | No conceder gestión para una herramienta solo lectora; revisar permisos implícitos de composites |
| Crear/editar/estado/password/logout | manage-users o permisos granulares correspondientes | manage-users es amplio, **no se presenta como mínimo definitivo**; no exponer realm-admin |
| Mapear rol | autorización map-roles del usuario y autorización del rol destino | Limitar a roles aplicativos aprobados; bloquear realm-management y grupos que concedan privilegios administrativos |
| Consultar catálogo | permisos de vista/consulta requeridos por recurso y versión | Evaluar catálogo IDs preconfigurado para no dar view-realm innecesariamente |

La combinación mínima exacta queda pendiente de prueba negativa con la versión y modelo de permisos administrativos elegidos. El backend seguirá imponiendo autorización del operador y del rol objetivo aunque la cuenta de servicio tenga autoridad técnica mayor. No entregar acceso a Admin Console al Soporte aplicativo como sustitución de esos controles.

### Errores, timeouts y consistencia distribuidos

Proponer adaptador neutral con categorías configuración, validación, conflicto, denegación, indisponibilidad y **resultado desconocido**. Conservar deadlines explícitos y requestId; cualquier timeout tras enviar una escritura puede significar que se aplicó. No reintentar automáticamente creación, reset o retiro/agregado de roles.

Para alta: reservar identificador/idempotencia local antes de llamar; guardar resultado y sub confirmado, rol/estado de provisión y evidencia sin secreto. Si falla después del alta externa, conciliar contra referencia propia controlada y username exacto, verificando pertenencia; no enlazar personas solo por correo. El resultado parcial debe impedir acceso hasta completar condiciones y no anunciar éxito completo por un HTTP 201.

Para password: ejecutar una operación exclusiva por cuenta. Si el IdP respondió 204 y la confirmación local falla, registrar/recuperar la operación como incierta y **no revelar** la contraseña. Si se perdió el resultado, no reenviar ni intentar recuperar aquel texto: tras conciliación autorizada establecer otra contraseña, invalidar la anterior y revelar únicamente la nueva tras éxito confirmado. Si la respuesta al operador se pierde después de confirmar, un retry nunca vuelve a devolver el secreto; requiere otro reset autorizado. No es una transacción ACID entre Keycloak y MySQL.

## 4. Username, estados e identidades históricas

### Alternativas de username, ninguna seleccionada definitivamente

| Alternativa | Ventajas | Coste / riesgo |
| --- | --- | --- |
| Asignado por Soporte, validado | Comprensible y compatible con nomenclatura empresarial | Duplicados, typos y decisiones personales; requiere política común |
| Generado desde nombre/apellido con sufijo | Fácil de recordar | Colisiones, tildes, transliteración, homónimos y cambios de nombre |
| Generado desde identificador laboral interno no sensible o secuencia | Menor riesgo de colisiones y estabilidad | Menos memorable; validar disponibilidad de identificador y evitar exponer RUT |

**Recomendación para evaluar:** generación estable desde código laboral autorizado o secuencia, con confirmación por Soporte. No fijar prefijos/formato sin aprobación. Normalización candidata: trim y minúsculas, alfabeto y longitud explícitos acordes a Keycloak; no colapsar tildes/caracteres de usernames existentes sin análisis de colisiones. Un find previo mejora mensajes, pero la unicidad debe imponerla Keycloak y una restricción local sobre valor canónico, con tratamiento 409 bajo concurrencia.

Mantener username estable cuando cambian nombres/apellidos. No reutilizar el de una cuenta desactivada. `preferred_username` es dato presentacional de claims, no PK ni prueba de identidad. Vincular usando emisor y sub estables hacia `id_usuario`; no usar username, email o RUT como reemplazo automático de esa PK.

Actualmente `Usuario.correo_usuario` es String único obligatorio y no hay username; UI opcional parcial no resuelve esto. Estudiar futuro username canónico único y correo nullable; MySQL permite varias filas NULL bajo índice unique, pero deben verificarse versión/collation/esquema real. No almacenar emails inventados ni usar cadena vacía compartida para evitar la migración. Los formularios/listas/perfil, verify, repositorio, privacy e incidentes tienen contratos de correo a revisar. Los canales de privacidad/incidentes hoy toman correo de la cuenta y pueden fallar sin él: requieren decisión de contacto/transporte separada, no borrarlos.

| Estado actual | Seguridad/consistencia actual | Candidato Keycloak conservando semántica |
| --- | --- | --- |
| Pendiente | Fila creada y rol asignado; primer JWT coincidente la activa | Puede representar primer ingreso; required action temporal debe completarse antes de acceso normal |
| Pendiente rol | Alta incompleta o transición bloqueada | Conservar denegación hasta mapping/confirmación; no habilitar solo porque enabled=true |
| Activo | Estado operativo | Depende de perfil/rol/provisión coherentes; no equivale a password definitivo |
| Vinculado | Legado activo; UI puede mostrarlo para Activo | Mantener lectura/normalización; no renombrar datos por estética |
| Desvinculado | Denegación local y baja | enabled=false, sesiones según política, conservar relaciones y actor histórico |

El estado de provisión distribuida o del expediente de recuperación es distinto de estos estados de negocio. No sobrecargar Pendiente rol para todas las incertidumbres ni bloquear una cuenta por una solicitud pública de recuperación.

**Base nueva:** crear identidades, catálogos y primer Soporte mediante bootstrap aprobado; asignar nuevas PK locales sin datos históricos que preservar. **Base existente:** congelar escrituras durante corte autorizado, correspondencia uno-a-uno por `id_usuario`, verificar duplicados/estados y conservar FKs, mensajes, registros y PIN. No suponer exportabilidad de contraseñas Auth0 ni acceso a hashes; emitir credenciales temporales por procedimiento aprobado si no hay continuidad soportada.

Alternativa transitoria de menor cambio: guardar el sub Keycloak en `id_auth0` para un único proveedor activo, conservando un mapeo protegido Auth0↔Keycloak↔id_usuario. Coste: nombre engañoso y riesgo de colisión entre emisores; no permitir ambos proveedores sobre la misma columna sin discriminación. Alternativa sostenible: relación de identidades externas con provider/issuer/sub e índice único compuesto y FK a usuario, preservando la PK local. Ambas requieren diseño y aprobación; no renombrar la columna por estética ni ejecutar SQL ahora.

## 5. Flujos candidatos sin correo

### 5.1 Alta y primer ingreso

Soporte autorizado registra datos y rol permitido, confirma username reservado y genera operación local. Crear la identidad inicialmente deshabilitada permite completar mapping y vínculo sin acceso prematuro. Después establecer password temporal, confirmar condiciones, habilitar y revelar una sola vez. El requisito final es cuenta **habilitada para completar primer ingreso**, no habilitarla antes de tener una provisión coherente. El orden exacto se validará en laboratorio.

Comparar dos opciones: credencial temporal en POST users reduce llamadas pero une alta y secreto en una respuesta posiblemente ambigua; PUT reset-password después de crear da una frontera explícita para confirmar establecimiento y manejar política de contraseña. Se recomienda evaluar la segunda por trazabilidad, manteniendo cuenta no operativa hasta completar. Nunca entregar el secreto generado si cualquier paso obligatorio permanece incierto.

Generación CSPRNG backend con entropía y composición compatibles con la política aprobada; no usar Math.random. El secreto solo vive en memoria por el tiempo del procedimiento, viaja por HTTPS al IdP y al operador autorizado y sale con Cache-Control:no-store. No logs, MySQL, mensajes, URLs, analytics, localStorage o cachés persistentes. No ofrecer consulta posterior del texto. La UI elimina estado al cerrar/expirar/cambiar de sesión; ocultarlo no garantiza borrado físico de memoria del navegador, por lo que se minimiza retención.

Configurar temporary:true y garantizar UPDATE_PASSWORD. El trabajador autentica por username, Keycloak exige cambio y solo después vuelve a ITECSA. La aplicación valida token/rol/estado y conserva el acuse PIN separado. Enabled=true no indica que ya eligió contraseña definitiva.

### 5.2 Recuperación supervisada: expediente, aviso y entrega

Endpoint público candidato conserva una respuesta 202 uniforme para usernames sintácticamente válidos y no devuelve ID interno de cuenta ni ticket consultable que revele existencia. Mantener cuotas IP/cuenta canónica y correlación HMAC; no bajar enabled, cambiar password ni invalidar sesiones por la petición pública. No avisar directamente al trabajador dentro de una sesión a la que no puede acceder.

Modelo candidato independiente de Mensaje: ID aleatorio de solicitud, usuario interno confirmado cuando exista, username canónico según política de minimización, estado, versión de concurrencia, fechas, operador asignado, evidencia/referencia de verificación de identidad, operationId, resultado categorizado del IdP y resolución. **Sin password, token, PIN ni documentos de identidad en metadata libre.** Solicitudes públicas de cuentas inexistentes producen misma respuesta; no crear una identidad ni expediente visible que permita enumeración.

Estados propuestos: pendiente → asignada → en ejecución → resuelta; alternativa cancelada; cualquier escritura remota ambigua pasa a requiere conciliación. La asignación usa compare-and-set y vence mediante una política aprobada; la concesión no habilita dos resets. Durante en ejecución o conciliación no se libera ciegamente por timeout: un proceso anterior podría seguir vivo. Usar versión/lease y una única operación activa por cuenta, con control de propietario/fencing en pasos locales; el IdP no participa de una transacción distribuida ni garantiza idempotencia de reset por una clave inventada.

Deduplicar solicitudes activas por cuenta con restricción local y política temporal aprobada. MySQL no ofrece un índice parcial genérico como PostgreSQL: evaluar clave activa nullable única o tabla de operación activa, sin imponer DDL en esta fase. Repetir solicitud no debe crear varias operaciones ni prolongar bloqueo inexistente.

Crear expediente y evento de notificación en la misma transacción, con outbox o escritura transaccional compartida; `MessageService.createMessage` hoy abre su propia transacción y no basta para atomicidad entre ambos módulos. El consumidor genera aviso con ID del expediente y clave única de evento. Destinatarios: integrantes activos del nuevo Soporte autorizados, no todos los usuarios que hoy tienen string Soporte técnico. Si no hay Soporte activo, conservar pendiente y alertar al canal operativo aprobado. Nuevos operadores deben poder listar pendientes sin depender de haber recibido una notificación antigua.

Leer, ocultar o limpiar el mensaje **no cambia el expediente**. La campana existente puede reutilizar polling; hace falta una bandeja de trabajo y endpoint autorizado con asignación/estado real, sin crear chat. `businessRetention.service.js:25-45` también contempla purgar mensajes antiguos sin pedido: la retención de avisos no debe borrar el expediente ni sus evidencias por cascada. Aprobar una retención propia de recuperaciones y revisar claves foráneas antes de incorporar el vínculo.

Antes de resetear, operador demuestra sesión reciente, autoridad sobre objetivo y verificación corporativa independiente. El PIN administrativo puede confirmar una acción sensible del operador si se aprueba; **no identifica al trabajador para recuperar su password y no sustituye ese procedimiento**. Entrega preferentemente presencial; opción remota exige canal independiente ya verificado, nunca datos de contacto aportados solo por un atacante.

Reset: establecer credencial temporal y UPDATE_PASSWORD; gestionar sesiones previas conforme a política; cerrar sesiones del IdP y mantener la denegación local necesaria para operaciones inciertas sin confundirla con la petición pública. Un JWT ya emitido puede seguir verificándose criptográficamente: diseñar revocación local/versionado de sesión si se requiere corte inmediato y probar el intervalo. Confirmar resolución solo con evidencia de resultado y entrega; una contraseña emitida no prueba que el trabajador completó el cambio obligatorio.

### 5.3 Cambio voluntario desde Mi perfil

Comparar Account Console (más navegación y capacidades de autoservicio a revisar) con **AIA UPDATE_PASSWORD**, candidato preferido por limitar la acción y retornar a ITECSA. Usar el SDK/OIDC con state/PKCE y redirect permitido, no construir una URL que contenga password ni crear formulario de contraseña en Express.

Solicitar reautenticación reciente con la configuración de la acción y parámetros soportados por la versión; no confiar solo en una casilla UI. Manejar `kc_action_status` éxito/cancelación y errores sin confundir retorno con éxito. Actualizar o revalidar sesión con el IdP y después `/auth/verify`; definir política de otras sesiones. No usar la cuenta de servicio para ejecutar el cambio voluntario del usuario. Mantener seguridad del cambio obligatorio independiente de la cancelación permitida de una AIA voluntaria.

La interfaz candidata es una acción de identidad `changePassword()` expuesta al perfil mediante el contexto, delegando a Keycloak `login` con `action: 'UPDATE_PASSWORD'`, redirect permitido y reautenticación aprobada. Hoy `loginWithRedirect` solo propaga el destino y el adaptador no pasa una acción: añadir un botón sin ampliar esa interfaz no implementaría AIA. El estado de cancelación debe sobrevivir al procesamiento del callback y mostrarse después de verificar la sesión, sin convertirlo en error de autenticación ni en éxito de cambio. No se añade un endpoint Express que reciba la contraseña personal.

## 6. Pruebas futuras, no ejecutadas

U = unitaria con mocks controlados; I = integración en laboratorio desechable; S = seguridad; A = aceptación. Ninguna usa usuarios o bases productivas. Cada escenario requiere resultado y evidencia fechados sobre versiones/digests concretos.

| ID | Tipo | Escenario | Criterio de aceptación |
| --- | --- | --- | --- |
| T01 | I/A | Username válido, inexistente y password incorrecto | Solo credenciales válidas acceden; errores controlados |
| T02 | I/S | Cuenta deshabilitada y Desvinculado local | No obtiene acceso, incluso con token previo |
| T03 | I/A | Temporal, cambio obligatorio y segundo login | No acceso normal antes del cambio; después usa definitiva |
| T04 | I/A | Login/refresh/reload/logout | Destino seguro y sesión coherente, sin caché persistente de tokens |
| T05 | I/S | Callback/origen permitido y malicioso, HTTPS/CA | Rechazo de redirección externa y contenido mixto |
| T06 | U/I | verify lento/falla, sub o generación distintos | Sin acceso ni datos de otra sesión; timeout controlado |
| T07 | U/I/S | Firma/issuer/audience/exp/azp/typ/alg incorrectos, ID token | Denegación y claves locales correctas |
| T08 | I/A | Reinicio IdP/API y rotación firma con caché fría | Validación/renovación LAN; claves ajenas rechazadas |
| T09 | U/I/S | Login reciente, Brave/cookies, logout en otra pestaña, clear durante refresh | Nunca enviar undefined ni publicar credencial de sesión invalidada |
| T10 | U/S | Dos renovaciones y respuesta API tardía tras cambio de usuario | Deduplicar sin mezclar sujetos ni resultados |
| T11 | U/I/S | Matriz 8 actual y 9 propuesta aprobada, rol inválido/múltiple | Un rol ITECSA, permisos presentes y catálogo obligatorio |
| T12 | U/I/S | Permisos vacíos/extra, scope M2M como permiso | Fail closed; ningún aumento por token excesivo |
| T13 | I/S | Rol token/local/IdP distinto o retirado | No reconciliar token antiguo hacia privilegio perdido |
| T14 | I/S | Admins API directa; nuevo Soporte intenta comercio; D alternativa elegida | Aplicar política sin depender del menú |
| T15 | U/I/A | Alta, username duplicado/concurrente, email ausente, rol inválido | Unicidad e identidad/rol correctos; contratos UI/API/BD coherentes |
| T16 | U/I/S | Credencial temporal y política incumplida | Solo revelar tras establecimiento confirmado; cambio obligatorio |
| T17 | U/I | Fallos antes/después de IdP, mapping, BD y PIN | Resultado parcial trazable, acceso bloqueado y conciliación segura |
| T18 | U/I/S | Timeout o respuesta perdida en alta/reset | No duplicación ni reintento ciego; secreto anterior no recuperable |
| T19 | I/S | Editar datos/rol, autocambio, autodesvinculación, doble operador | Alcance/compare-and-set/estados preservados |
| T20 | I/S | Baja/reactivación con JWT viejo y fallo de PIN | Denegación local; nuevo PIN cuando corresponde; rollback no supuesto |
| T21 | U/I/S | Dos Soporte resetean la misma cuenta; petición repetida | Una operación activa, operador autorizado y verificación independiente |
| T22 | U/I/S | Respuestas, logs, auditoría, notificaciones y caché | Ningún password/token/PIN accidental; no-store para revelado |
| T23 | U/I/A | PIN válido/erróneo, acuse, bloqueo, recuperación y operaciones sensibles | Algoritmos, llaves, actor, transacciones e histórico intactos |
| T24 | I/A/S | Cambio personal AIA, cancelación, reauth y retorno | Cambio nativo, estado correcto y política de sesiones respetada |
| T25 | I/S | Base nueva/histórica y correspondencia emisor/sub | Ninguna FK ni actor reasignados; duplicados rechazados |
| T26 | U/I/S | Recuperación existente/inexistente/bloqueada | Respuesta pública uniforme; petición no bloquea cuenta |
| T27 | U/I/S | Repetidos, IP compartida/spoofing, cuotas y tiempos | Abuso limitado sin enumeración ni bloqueo por nombre solamente |
| T28 | I/S | Solicitudes simultáneas y múltiples instancias API | Deduplicación persistente y resultados equivalentes |
| T29 | U/I | Crear expediente y fallar creación/entrega de aviso | Solicitud durable; reentrega no duplica aviso |
| T30 | U/I/A | Leer/ocultar aviso; nuevo Soporte; sin operadores activos | Expediente y asignación consistentes; pendientes recuperables |
| T31 | I/S/A | Verificación/destinatario incorrectos, reset denegado, resultado incierto | Sin secreto, resolución falsa ni dos resets; evidencia de actor |
| T32 | I/S | Históricos, usuarios sin contacto, PIN y mensajes preexistentes | Integridad, nulos y canales pendientes visibles sin inventar email |
| T33 | I/S/A | Servidor y puesto sin Internet, sin cachés, DNS/CA/NTP LAN | Login/alta/reset/perfil/negocio requeridos sin Auth0/SMTP externo |
| T34 | I/A | Backup/restore, pérdida VM y rollback offline | Identidad/BD/llaves compatibles, objetivos aprobados y evidencia |

Revisar también las suites existentes de auth, RBAC, adminUsers, PIN, messages, orders/payments y browser session. Sus mocks prueban solo los contratos simulados si se ejecutan; su existencia no demuestra configuración real ni compatibilidad productiva. Las pruebas con servidores locales, perfiles, fixtures mutables o bases permanecen pendientes.

## 7. Decisiones para revisión

No aprobar implementación hasta resolver: versión/digest IdP y topología HTTPS; política de usernames; rol técnico y roles asignables por Soporte; método de bootstrap/emergencia; privilegios del service account; esquema de identidades y política de datos; entrega/verificación de credenciales; estados/concurrencia/retención del expediente; revocación de JWT ya emitidos; RPO/RTO y canales dependientes de correo fuera del IdP. Una decisión pendiente no invalida el inventario; limita qué puede implementarse con seguridad.

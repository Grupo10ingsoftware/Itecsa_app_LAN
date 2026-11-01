# Recuperación de PIN con reautenticación OIDC

## Implementado

El cliente público `itecsa-pin-recovery` usa Authorization Code con PKCE S256. La aplicación no recibe contraseñas ni usa secretos de cliente o credenciales administrativas. El inicio de sesión habitual (`itecsa-web`) y sus permisos no cambian.

La sesión principal usa `keycloak-js`, tokens en memoria, renovación mediante `updateToken(30)` y verificación de permisos en la API. Se evaluó reutilizar el SDK para recuperación: una segunda inicialización sobre el mismo documento podría consumir el callback equivocado; además, el backend necesita controlar nonce y PKCE. Por eso el flujo de recuperación intercambia el código en el servidor y verifica el ID token con `jose` 4.15.9, que ya era una dependencia transitiva instalada y ahora se declara directamente. No se agrega un proveedor externo ni una dependencia de internet en ejecución.

### Recorrido

1. Desde `/perfil`, «Recuperar PIN» muestra «Para recuperar tu PIN, debes autenticarte nuevamente» y «Redirigiendo al inicio de sesión seguro...» con el indicador Bootstrap existente.
2. Se prepara la continuidad de la sesión y se redirige **la misma pestaña** con `location.assign`, sin ventanas emergentes ni esperas artificiales. El modal permanece visible mientras se prepara la redirección.
3. `POST /api/auth/pin/recovery/start`, protegido por la sesión original y `MANAGE_PIN`, crea una operación de cinco minutos ligada al `sub` y al `sid` autenticados. Genera `state`, `nonce` y un verificador PKCE aleatorios de 256 bits. El verificador permanece en el servidor. Para atravesar la navegación, el refresh token original se conserva temporalmente en memoria del backend y se vincula a una cookie de sesión HttpOnly, SameSite=Strict y Secure en HTTPS. La cookie no contiene tokens OIDC. En `sessionStorage` solo se guarda `state` y el plazo de la operación, sin tokens ni contraseñas.
4. La pestaña actual navega hacia Keycloak con `prompt=login`, `max_age=0`, `scope=openid`, `nonce`, `state`, `code_challenge_method=S256` y una solicitud de `auth_time` esencial en el ID token.
5. Keycloak retorna a `/auth/pin-recovery/callback`. Esa ruta se procesa antes de montar los proveedores de sesión principales y borra los parámetros de la URL. `POST /api/auth/pin/recovery/resume` exige el origen exacto, estado y cookie HttpOnly; consume el contexto de navegación antes de cualquier I/O. Renueva exclusivamente la sesión original de `itecsa-web` y verifica firma, issuer, audiencia, cliente, `sub` y `sid` antes de devolver sus tokens. Estos solo vuelven a memoria del documento. No se instalan tokens del cliente de recuperación en el SDK principal. La cancelación, error, estado incorrecto o botón Atrás restauran la sesión original y cancelan la operación sin renovar el PIN.
6. `POST /api/auth/pin/recovery/finish` reclama la operación una sola vez antes de cualquier I/O. Intercambia el código con el verificador PKCE y la URI exacta. Verifica firma RS256 usando JWKS configurado, emisor, audiencia del cliente de recuperación, `azp`, expiración, `iat`, `nonce`, `sub` y `auth_time`. La autenticación debe ser posterior al inicio de la operación y tener como máximo tres minutos de antigüedad; no basta con que se haya enviado `prompt=login`. Se rechazan afirmaciones o tokens suministrados directamente por el navegador.
7. El servidor vuelve a comprobar autorización y usuario activo bajo el bloqueo de fila de MySQL antes de sustituir el PIN. Se conservan generación aleatoria de seis dígitos, hash scrypt, unicidad, cifrado temporal y estado `pending_acknowledgement`.
8. El callback navega dentro de la aplicación a la ruta existente `/perfil` e inicializa el SDK con los tokens originales renovados, usando sus opciones existentes `token`, `refreshToken` e `idToken`. El backend verifica normalmente la sesión y sus permisos. El estado `pending_acknowledgement` abre el modal de entrega de PIN que ya existía; la URL por sí sola no lo habilita. No se añade un selector manual de PIN. La aceptación elimina el cifrado temporal y muestra «Tu PIN se ha actualizado correctamente».

`POST /api/auth/pin/recovery/cancel` invalida la operación sin cambiar el PIN. La cancelación se comprueba también después del intercambio y de la generación del PIN. Una vez que comienza la escritura final, se espera su resultado; no se promete cancelar un cambio ya confirmado. Un callback fallido consume su operación. Una operación nueva invalida la anterior del usuario. Repeticiones y solicitudes simultáneas no reutilizan la autorización.

Los límites existentes permiten cinco solicitudes de inicio/confirmación por cuenta y veinte por IP en quince minutos; cancelar no consume esa cuota específica. Producción conserva el throttle compartido existente. La auditoría `pin_recovery` registra inicio, resultado, cancelación y expiración; `pin_acknowledged` registra aceptación. Solo usa campos permitidos por `safeLogger`. No registra códigos, nonce, verificador, contraseñas, tokens ni PIN.

## Almacenamiento temporal y límites operativos

No se requiere ni se ejecutó una migración. El esquema Prisma queda igual al original, la tabla histórica de códigos por correo permanece sin uso y se retiró la migración de borrado propuesta anteriormente.

Las operaciones se mantienen en memoria del proceso, con máximo de 1000 entradas y limpieza cada 30 segundos. El contexto de navegación tiene un plazo máximo de diez minutos para poder restaurar la sesión aunque la autorización del PIN haya expirado a los cinco minutos. Se consume una sola vez, se elimina al cancelar y no autoriza cambios de PIN. Su expiración también se verifica en cada uso. Un reinicio pierde ambos contextos; las respuestas desconocidas se rechazan. Usar una instancia del backend o afinidad de sesión para los cuatro endpoints; otras instancias rechazan el estado que no conocen. Para soportar balanceo sin afinidad o continuidad tras reinicios se necesita un almacén compartido con consumo atómico, que no se incorpora en este cambio. No copiar mapas en memoria entre procesos.

Frontend y API deben pertenecer al mismo sitio para la cookie SameSite=Strict: en local, usar `127.0.0.1` en ambos, sin mezclarlo con `localhost`; en producción, usar HTTPS y dominios del mismo sitio. CORS con credenciales se habilita solo para `/api/auth/pin/recovery/*` y para el origen configurado. No hacen falta permisos de ventanas emergentes ni cambios COOP. La recuperación no altera las opciones habituales de login ni desactiva la comprobación de sesión del SDK. Si la sesión original fue revocada, el contexto se perdió o Keycloak la invalida, se muestra el error en `/perfil` y se exige un inicio explícito: nunca se sustituye silenciosamente por otra cuenta SSO.

## Configuración del cliente Keycloak 26.8.1

En el realm `itecsa`, editar exclusivamente `itecsa-pin-recovery`:

- Client authentication: **OFF**; Standard Flow: **ON**.
- Direct Access Grants, Implicit Flow y Service Accounts: **OFF**.
- PKCE Code Challenge Method: **S256**.
- Firma del ID token: **RS256**.
- Valid Redirect URIs: **`http://127.0.0.1:5173/auth/pin-recovery/callback`**, reemplazando el comodín temporal. No agregar `/*`.
- Web Origins: `http://127.0.0.1:5173` si se necesita configurar un origen; no usar `*`. El intercambio de código es servidor a servidor y no requiere CORS de tokens en el navegador.
- Login theme: **`itecsa-pin-recovery`**, en la configuración de ese cliente.
- No asignar roles administrativos ni capacidades de la API a este cliente. No modificar los otros clientes ni el tema general del realm.

Comprobar que el ID token contenga `auth_time` y `nonce`, y que los access tokens originales contengan `sid`. Si falta esa evidencia, el servidor rechaza el flujo; no lo sustituye por información enviada por el navegador. Sincronizar los relojes de Keycloak y del backend. Para otros dominios, registrar la URL HTTPS exacta de ese despliegue en lugar de la URL local.

## Tema específico

Los archivos están en `deploy/keycloak/themes/itecsa-pin-recovery/login/`:

- `theme.properties`: hereda `keycloak`, con traducciones `es,en`.
- `messages/messages_es.properties` y `messages/messages_en.properties`: cambian únicamente `loginAccountTitle` a «Ingresa tus credenciales para recuperar tu PIN».

El `login.ftl` original de Keycloak 26.8.1 usa esa clave en el encabezado sobre el formulario. Al no copiar plantillas se conservan campos, errores, accesibilidad, acciones, protecciones y actualizaciones del tema base.

Copiar la carpeta `itecsa-pin-recovery` a `$KEYCLOAK_HOME/themes/itecsa-pin-recovery`; en la imagen oficial el destino habitual es `/opt/keycloak/themes/itecsa-pin-recovery`. Puede montarse ese directorio en modo solo lectura. Instalar en cada nodo de Keycloak y reiniciar según el procedimiento habitual para actualizar las cachés. Seleccionar el tema solamente en el cliente de recuperación. No cambiar **Realm Settings → Themes → Login theme**.

## Variables y despliegue

En el entorno del backend:

```dotenv
KEYCLOAK_PIN_RECOVERY_CLIENT_ID=itecsa-pin-recovery
KEYCLOAK_PIN_RECOVERY_REDIRECT_URI=http://127.0.0.1:5173/auth/pin-recovery/callback
```

Se reutilizan `KEYCLOAK_ISSUER`, `KEYCLOAK_JWKS_URI`, `FRONTEND_ORIGIN` y la configuración de identidad existente. No agregar secretos para este cliente. Eliminar del entorno cualquier secreto antiguo de recuperación.

Solo cuando el contenedor no pueda acceder al issuer público, configurar `KEYCLOAK_PIN_RECOVERY_TRANSPORT_ORIGIN` con el origen interno de Keycloak; se conserva la ruta del realm y se valida siempre el issuer público del token. HTTP solo se permite en el laboratorio autorizado; producción requiere HTTPS. No se necesitan variables nuevas en el frontend.

Pasos de despliegue (no ejecutados contra producción):

1. Instalar y asignar el tema; registrar la URI exacta y revisar las opciones anteriores en el cliente ya creado.
2. Configurar las variables del backend. Instalar las dependencias del lockfile con `npm ci` en `capaServidor` y regenerar el cliente mediante `npm run prisma:generate`. No ejecutar comandos de migración ni eliminar tablas.
3. Ejecutar `npm run test:pin` y `npm run test:users`; reiniciar el servicio backend con su procedimiento normal. Mantener una instancia o configurar afinidad para recuperación.
4. En `capaVista`, ejecutar `npm ci`, `npm test`, `npm run lint` y `npm run build`; publicar `dist` con fallback SPA para el callback y `/perfil`. En despliegue con imágenes, reconstruir y publicar ambos componentes mediante el pipeline habitual.
5. Incorporar el cambio de `deploy/nginx.conf`: callback sin access log ni caché. Evitar también el registro de query strings del callback en el proxy externo. `index.html` fija `Referrer-Policy: no-referrer` mediante metadato.
6. Probar el recorrido real y confirmar que el nuevo PIN funciona y que el anterior deja de funcionar.

No se modificó automáticamente Keycloak, ningún archivo `.env` ni la base de datos. Los servicios de recuperación por correo y Direct Grant fueron retirados. Resend permanece exclusivamente en los módulos independientes de privacidad e incidentes.

## Archivos principales

| Área | Archivos |
| --- | --- |
| OIDC y autorización temporal | `src/config/pinRecovery.js`, `src/modules/auth/service/pinRecovery.service.js`; continuidad de navegación en `pinRecoveryNavigation.service.js` |
| PIN y endpoints | `pin.service.js`, `auth.controller.js`, `auth.routes.js`, `httpErrors.js`, `rateLimit.js` |
| Navegación, callback y perfil | `capaVista/src/modules/auth/pinRecoveryBrowser.js`, `pages/PinRecoveryCallbackPage.jsx`, `authApi.js`, `useAuthApi.js`, `ProfilePage.jsx`, `app/App.jsx`; bootstrap opcional en `AppProviders.jsx`, `IdentityProviders.jsx`, `keycloakSession.js`; credenciales de cookie limitadas al flujo en `apiClient.js` y `server.js` |
| Configuración y despliegue | `env.example`, `package.json`, `package-lock.json`, `compose.mysql.yaml`, `deploy/nginx.conf`, `capaVista/index.html` |
| Tema | `deploy/keycloak/themes/itecsa-pin-recovery/login/` |
| Pruebas | `pinRecovery.test.js`, `pinRecoveryBrowser.test.js`, `ProfilePage.test.jsx`, `keycloakSession.test.js` |

## Pruebas realizadas y pendientes

Cambio de navegación: 38 pruebas de recuperación/continuidad en backend y 34 pruebas frontend. Build y lint aprobados. Las 31 regresiones de administración y la validación/generación de Prisma corresponden a la implementación previa. Las pruebas usan dobles de persistencia y del endpoint de tokens, pero firma y verificación RSA/JWT reales; no se conectan a un realm real ni a MySQL. Se verifica también consumo simultáneo, cookie/origen/estado obligatorios, rechazo de otra cuenta al restaurar, ausencia de tokens en almacenamiento web, retorno automático a `/perfil`, cancelación y callback repetido.

| Escenario solicitado | Evidencia automatizada / pendiente manual |
| --- | --- |
| Usuario original | Token firmado válido, rotación, modal y aceptación probados; recorrido real pendiente |
| Contraseña incorrecta | ITECSA no recibe contraseñas y no cambia PIN sin callback; error de formulario Keycloak pendiente de prueba real |
| Otra cuenta / otro usuario objetivo | `sub` del token, actor de sesión y campos de objetivo manipulados rechazados |
| Cancelación | Error OIDC, botón Atrás, endpoint de cancelación y cancelación durante intercambio/generación probados |
| Expiración | TTL, token expirado y operación que expira durante el intercambio rechazados |
| Manipulación de state / nonce | Rechazada en navegador y servidor; firma, audiencia e issuer incorrectos también rechazados |
| Reutilización / simultaneidad | Operación completada no reutilizable; solo una confirmación simultánea tiene éxito |
| SSO anterior | `auth_time` anterior o ausente rechazado; comprobar presentación real de credenciales con SSO activo |
| Uso del PIN nuevo | Validación bloqueada antes de aceptar; PIN nuevo válido tras aceptar; anterior rechazado |
| Login original | Prueba de inicialización PKCE, login y renovación sin sobrescribir tokens; regresión real del navegador pendiente |
| Logs | Pruebas verifican ausencia de secretos/PIN y uso de logger con lista de campos permitidos; revisar logs del proxy/Keycloak del despliegue |

Pendiente manual: instalación y render del tema en Keycloak **26.8.1**, autenticación real (incluidas MFA/acciones requeridas si el realm las exige), conectividad interna/JWKS, presencia de claims, cookies/CORS del despliegue, login original con SSO y revisión de logs de infraestructura. Verificar éxito, cancelación y otra cuenta en la misma pestaña. Las pruebas no acreditan esos puntos hasta ejecutarse en el entorno del usuario. No cambian la URI de callback, el cliente, el tema ni las variables necesarias de Keycloak.

Referencias oficiales consultadas: [adaptador JavaScript y almacenamiento de tokens](https://www.keycloak.org/securing-apps/javascript-adapter), [herencia de temas](https://www.keycloak.org/ui-customization/themes), [plantilla login.ftl de Keycloak 26.8.1](https://github.com/keycloak/keycloak/blob/26.8.1/themes/src/main/resources/theme/base/login/login.ftl).

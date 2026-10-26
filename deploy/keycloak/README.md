# Autenticación ITECSA · Keycloak 26.8.1

## Diagnóstico y alcance

El contexto de operación del 25-10-2026 identifica Keycloak **26.8.1** en Ubuntu. El SDK de la SPA es `keycloak-js` **26.2.4**: son versiones independientes. El realm es `itecsa` y la SPA pública es `itecsa-web`. Ubuntu sirve las páginas de autenticación; Compose contiene solamente `api` y `web`. Este cambio no instala otro Keycloak ni cambia producción, roles, permisos, cuentas o contraseñas.

`IdentityProviders.jsx` conserva una instancia por documento. `keycloakSession.js` usa Authorization Code, PKCE S256, tokens en memoria, renovación e iframe de sesión. `AuthProvider` verifica la identidad contra la API antes de habilitar las rutas de negocio bajo `ProtectedRoute`. La configuración pública procede de `runtime-config.js` o de `VITE_KEYCLOAK_*`; el tema no depende del filesystem ni del build del frontend.

La pantalla retirada era `LoginPage.jsx`, en `/login`, con estilos exclusivos en `LoginPage.module.css`. El logout generaba `/login?logged_out=1`; ese parámetro desactivaba la redirección automática. Se revisaron sus imports y consumidores antes de eliminar ambos archivos. La ruta permanece como `LoginRedirect`, compatible con enlaces anteriores, sin panel de entrada ni temporizadores. Solo presenta una vista funcional cuando hay un error real.

El logout genera su URL con la API del SDK **antes** de borrar los tokens, conservando el `id_token_hint`. Limpia el destino local, invalida el estado de acceso y reemplaza el historial. Keycloak cierra la sesión y vuelve a `/login`, que inicia la siguiente autenticación una sola vez. Una identidad rechazada por la API no se reautentica en un ciclo: presenta el error y permite cerrar la sesión. Al restaurar una página desde bfcache, el proveedor fuerza una comprobación de sesión antes de mostrar su contenido.

El alta actual establece una credencial temporal y exige `UPDATE_PASSWORD`. La aplicación conserva la recuperación supervisada informativa de `/recuperar-contrasena`; no es un mecanismo nuevo de recuperación. El tema respeta `realm.resetPasswordAllowed`, usa `url.loginResetCredentialsUrl` y envía formularios únicamente a `url.loginAction`. Las confirmaciones y los enlaces de recuperación nativos heredan la misma tarjeta. Nunca se envían credenciales a React ni se registran sus valores.

## Tema y recursos

`themes/itecsa/login` extiende `keycloak`. Los formularios conservan `credentialId`, los nombres nativos, la acción POST, `cancel-aia` y la macro nativa `logoutOtherSessions`. El layout conserva `authChecker.js`, la comprobación de sesión entre pestañas, los recursos comunes y el escape JavaScript de **26.8.1**. Las pantallas heredadas, como `info.ftl` y `login-page-expired.ftl`, utilizan este layout.

El fondo es negro uniforme; las tarjetas son blancas. En escritorio, la tarjeta de requisitos se coloca a la derecha; bajo 900 px pasa debajo. El logotipo AVIF es una copia íntegra del original facilitado en Descargas, comprobada por SHA-256. Es el logotipo completo con texto y eslogan; no se recreó ni se recortó para imitar el símbolo aislado de la referencia.

El CSS mantiene las equivalencias de `capaVista/src/styles/theme.css`: naranja `#f97316`, texto `#111827`, borde `#e5e7eb`, secundario `#64748b` y verde `#248f55`. Reutiliza el naranja oscuro `#ea580c` y el rojo de error `#b91c1c` del flujo de recuperación. El botón usa texto blanco de 20 px y peso 700 sobre naranja oscuro, con contraste superior a 3:1 para texto grande. Los mensajes de error cumplen el contraste de texto normal. No se usan CDN ni fuentes remotas. Como el repositorio no contiene Inter, se conserva la pila local Inter/system-ui de la SPA; el empaquetador admite una fuente Inter WOFF2 autorizada.

Los labels, errores asociados, foco, controles de visibilidad y estados de requisitos son accesibles por teclado. Los requisitos tienen un círculo, una marca al cumplirse y texto accesible «Pendiente/Cumplido». No dependen solo del color. No se añaden animaciones.

## Política de contraseñas y recuperación

La tarjeta obtiene **longitud, máximo, mayúsculas, minúsculas, números y símbolos** del `PasswordPoliciesBean` que Keycloak entrega al renderizar. Solo muestra reglas configuradas y sus cantidades reales. Incluye las restricciones de usuario, correo e historial que expone ese bean; las últimas se comprueban en el servidor. No inventa cinco reglas si el realm no las tiene. Los indicadores siguen los proveedores nativos: longitud UTF-16 y clasificación Unicode por carácter. La contraseña definitiva sigue siendo aceptada o rechazada por Keycloak.

Antes de activar el tema, consultar con una cuenta autorizada el `passwordPolicy` completo del realm. La cuenta técnica devuelve una representación reducida que **omite** `passwordPolicy`, SMTP y versión; una omisión no significa que no estén configurados. La consulta administrativa autorizada confirmó las cinco reglas de la referencia, sin necesidad de modificar la política. Como mínimo se necesitan:

```text
length(8) and upperCase(1) and lowerCase(1) and digits(1) and specialChars(1)
```

Si ya hay mínimos superiores, deben conservarse: la tarjeta mostrará esos valores. Si faltan reglas, añadir únicamente las ausentes a la política existente y registrar el valor anterior y posterior. No reemplazar la política completa por esa cadena ni cambiar hashing, historial u otras restricciones. Este cambio local no altera la política del servidor.

Consultar también `resetPasswordAllowed` y si existe SMTP operativo. No habilitar recuperación ni configurar correo externo para completar una prueba. El enlace solo aparece cuando Keycloak habilita ese flujo. El mensaje de solicitud enviada es genérico para cuentas existentes e inexistentes. El tema no acredita que el correo funcione.

## Preparación e instalación en Ubuntu

No copiar directamente el árbol fuente al servidor: el empaquetador completa los bundles españoles, incluido el fallback `en` cuando la internacionalización del realm está deshabilitada. Obtener `messages_es.properties` del JAR **de la instalación 26.8.1**, entrada `theme/base/login/messages/messages_es.properties`. Por ejemplo, con `unzip` disponible en Ubuntu y `KC_HOME` establecido por el operador:

```sh
unzip -p "$KC_HOME/lib/lib/main/org.keycloak.keycloak-themes-26.8.1.jar" \
  theme/base/login/messages/messages_es.properties > /tmp/itecsa-native-messages_es.properties
```

Copiar ese archivo público al equipo de trabajo y ejecutar desde la raíz:

```powershell
node scripts/prepare-keycloak-theme.mjs --version 26.8.1 --messages-es <ruta-al-bundle-nativo>
# Opcional: añadir --font <ruta-a-Inter-variable.woff2>
```

La salida reproducible es `dist/keycloak-26.8.1/itecsa/`, con versión, logo y traducciones locales. Copiar esa carpeta a `$KC_HOME/themes/itecsa` usando el acceso SSH habitual. Guardar fuera de `themes/` una copia de cualquier versión anterior. Mantener dueño y permisos coherentes con la instalación, sin hacer escribible el directorio para otros usuarios.

Una vez revisado el paquete y verificada su compatibilidad, seleccionar `itecsa` como **Login theme** del realm, o del cliente si utiliza una sobrescritura de tema. El cambio administrativo mínimo es `{"loginTheme":"itecsa"}` en el nivel elegido; no importar de nuevo el realm ni ejecutar `keycloak-ubuntu-configure.mjs`, que tiene otro alcance. No hace falta modificar los redirects: `/login` está cubierto por el registro actual `origin/*`.

En desarrollo, Keycloak admite `--spi-theme--static-max-age=-1 --spi-theme--cache-themes=false --spi-theme--cache-templates=false`. Usar esos flags únicamente en el arranque de desarrollo acordado. Si el proceso actual mantiene caché, coordinar su reinicio habitual tras instalar el tema; no detener procesos ni borrar cachés de una instalación activa a ciegas. En operación, conservar la caché normal y renovar los recursos mediante el procedimiento de despliegue del servidor. Verificar con un navegador nuevo que CSS, JS y AVIF responden 200.

El frontend se actualiza por el `watch` existente o con `docker compose up -d --build web`. Eso **no** instala el tema en Ubuntu. El tema debe desplegarse por separado, tanto al usar Node local como al usar Docker.

El script `scripts/keycloak-theme-admin.mjs` reproduce la consulta y el cambio mínimo sin importar el realm ni modificar cuentas. Solicita la contraseña administrativa de forma interactiva, no la acepta en argumentos y cierra su sesión técnica al terminar:

```powershell
node scripts/keycloak-theme-admin.mjs --action inspect --base-url <URL-de-Keycloak>
node scripts/keycloak-theme-admin.mjs --action apply --base-url <URL-de-Keycloak>
node scripts/keycloak-theme-admin.mjs --action restore --base-url <URL-de-Keycloak> --snapshot dist/keycloak-26.8.1/realm-before.json
```

`apply` exige la versión comprobada, el tema instalado y ausencia de una sobrescritura del cliente. Guarda el ajuste anterior con creación exclusiva, cambia solo `loginTheme` y verifica que la política sigue idéntica. No repetir `apply` para un simple arranque. El snapshot de esta instalación está en `dist/keycloak-26.8.1/realm-before.json`; conservarlo fuera de Git para una reversión.

Durante la aceptación se detectó un bloqueo previo del arranque de la API Docker: `DB_SSL_CA_PATH` apuntaba al secreto montado y `DATABASE_URL` conservaba la ruta de la CA del host. El nuevo preload `capaServidor/scripts/dockerDevelopmentEnvironment.mjs` traduce únicamente ese parámetro en memoria para el stage `development`. Conserva `sslaccept=strict`, rechaza opciones ambiguas mediante el validador existente y no modifica `.env`, el destino, las credenciales ni el stage productivo. El proceso Node local conserva su comportamiento. Tras incorporar ese ajuste, reconstruir también `api`.

## Verificación reproducible

```powershell
npm.cmd test --prefix capaVista
npm.cmd run lint --prefix capaVista
npm.cmd run build --prefix capaVista
```

Para verificar FreeMarker sin ejecutar otro Keycloak, usar Java 17+ para el verificador, el JAR nativo `keycloak-themes-26.8.1.jar` y `freemarker-2.3.35.jar`, que es la versión encontrada en Ubuntu:

```sh
javac -encoding UTF-8 -cp freemarker-2.3.35.jar -d out deploy/keycloak/verify/ThemeRender.java
java -Dfile.encoding=UTF-8 -cp out:freemarker-2.3.35.jar ThemeRender \
  dist/keycloak-26.8.1/itecsa/login keycloak-themes-26.8.1.jar dist/keycloak-preview
```

En Windows, el separador de classpath es `;`. El verificador parsea las plantillas, usa los recursos heredados auténticos y genera 12 pantallas con datos sintéticos, incluyendo errores indistinguibles, cambio obligatorio, advertencias funcionales, cancelación nativa, ausencia de política, recuperación y expiración. No modifica usuarios ni el servidor. Estas fixtures no demuestran el funcionamiento de una sesión OIDC real.

Para comprobar esas pantallas en Chromium, abrir un navegador headless con un perfil temporal y `--remote-debugging-port=19226`, y ejecutar:

```powershell
node deploy/keycloak/verify/browser.mjs dist/keycloak-preview http://127.0.0.1:19226
```

Comprueba 320, 375, 768, 1024 y 1440 px, posición de la tarjeta, ausencia de desbordamiento, teclado, visibilidad, requisitos y confirmación. Guarda capturas locales en `dist/keycloak-preview/screenshots`.

La aceptación en Ubuntu requiere, con cuentas autorizadas existentes: login correcto; comparación de usuario inexistente y contraseña incorrecta; campos vacíos; primer acceso/`UPDATE_PASSWORD`; contraseña débil, distinta y aceptada; cierre efectivo de sesión y retorno directo; recarga, Atrás, varias pestañas y sesión expirada. No restablecer credenciales, rearmar acciones requeridas ni crear cuentas para completar estas pruebas sin autorización.

## Resultado del 26-10-2026

- **Instalado y activo:** tema `itecsa` en Ubuntu 26.8.1; el realm tenía tema predeterminado y ahora selecciona `itecsa`. No había tema previo en disco. Se activó sin reiniciar Keycloak. SPA y API de desarrollo quedaron reconstruidas y levantadas en Docker; salud de API 200.
- **Configuración real:** `specialChars(1) and length(8) and upperCase(1) and lowerCase(1) and digits(1)`, idéntica antes y después. Internacionalización deshabilitada; el fallback español del paquete funciona. `resetPasswordAllowed=false` y SMTP sin configurar; se conservaron ambos valores.
- **Pruebas locales:** 49 tests de frontend, 11 de conexión/TLS y 31 de usuarios, todos correctos. Lint y build del frontend correctos. No existe script de typecheck en el proyecto JavaScript.
- **Tema:** 12 pantallas renderizadas correctamente con los recursos de 26.8.1, tanto en el verificador temporal local como con FreeMarker 2.3.35 y Java 21 de Ubuntu. 35 comprobaciones de tamaños y controles en Chromium, sin desbordamiento. Capturas en `dist/keycloak-preview/screenshots`.
- **Navegador contra Ubuntu:** entrada directa desde la SPA al tema nuevo, mensajes de campos vacíos y errores indistinguibles para usuario inexistente/contraseña incorrecta comprobados. CSS y JavaScript responden 200, y el AVIF original responde 200 y se visualiza.
- **Confirmación del usuario:** el operador confirmó ingreso con su cuenta habitual y retorno directo al nuevo formulario al cerrar sesión. Es aceptación manual del usuario, no una prueba automatizada atribuida al agente.
- **Límite de automatización:** los valores guardados ayer para dos cuentas de verificación fueron rechazados. Se detuvieron los intentos; no se probaron contraseñas alternativas ni se restablecieron credenciales. Por eso no se declara automatizada la sesión autenticada completa, la expiración prolongada, las varias pestañas ni la navegación Atrás en esa sesión real. Renovación concurrente, revocación e historial sí se comprobaron con dobles del SDK.
- **Pendiente:** envío y enlace de recuperación por falta de SMTP y por el flujo deshabilitado; primer acceso y cambio aceptado de una contraseña real, que modificarían una credencial actual. La validación, cancelación, POST nativo y resultados de error se comprobaron con renderizado/DOM sin cambiar cuentas. La aceptación de esos pasos exige una cuenta y una operación autorizadas para tal fin.

## Inventario de archivos

| Estado | Archivos | Motivo |
| --- | --- | --- |
| Creados | `deploy/keycloak/themes/itecsa/login/{theme.properties,template.ftl,fields.ftl,icons.ftl,login.ftl,login-update-password.ftl,login-reset-password.ftl,info.ftl,error.ftl}` | Tema nativo y macros compartidas. |
| Creados | `deploy/keycloak/themes/itecsa/login/messages/messages_es.properties`, `resources/css/itecsa.css`, `resources/js/itecsa.js`, `resources/img/itecsa-logo.avif` | Textos, estilos, validación y marca original. Las rutas de recursos son relativas al directorio `login`. |
| Creados | `deploy/keycloak/verify/ThemeRender.java`, `deploy/keycloak/verify/browser.mjs` | Renderizado y comprobación responsive reproducibles. |
| Creados | `scripts/prepare-keycloak-theme.mjs`, `scripts/keycloak-theme-admin.mjs`, este `README.md` | Paquete, activación, diagnóstico y reversión. |
| Creados | `capaVista/src/modules/auth/pages/LoginRedirect.jsx`, `LoginRedirect.test.jsx`, `capaVista/src/app/providers/keycloakSession.test.js`, `capaVista/src/modules/auth/keycloakTheme.test.js` | Entrada automática y pruebas de sesión/tema. |
| Creados | `capaServidor/scripts/dockerDevelopmentEnvironment.mjs`, `capaServidor/test/dockerDevelopmentEnvironment.test.js` | Traducción de la ruta de CA para el contenedor de desarrollo. |
| Modificados | `capaVista/src/app/providers/{keycloakSession.js,IdentityProviders.jsx,AuthProvider.jsx}`, `capaVista/src/app/router.jsx` | Logout, deduplicación, historial y sustitución de la ruta. |
| Modificados | `capaServidor/Dockerfile`, `PENDIENTES_KEYCLOAK.md` | Preload exclusivo de desarrollo y enlace a esta entrega. |
| Eliminados | `capaVista/src/modules/auth/pages/LoginPage.jsx`, `LoginPage.module.css` | Pantalla intermedia y estilos sin otros consumidores. |

Las salidas `dist/keycloak-26.8.1/` y `dist/keycloak-preview/` son artefactos locales ignorados por Git. No se crearon usuarios, no se cambiaron contraseñas ni se aplicaron migraciones o escrituras de negocio como parte de las verificaciones.

## Reversión

Registrar el tema anterior del realm/cliente y la política anterior antes de modificar Ubuntu. Para revertir, volver a seleccionar ese tema y restaurar la carpeta anterior mediante el mismo procedimiento de caché/reinicio. Revertir la política solo si se modificó y con el valor íntegro guardado. Los usuarios y sus contraseñas no se restauran ni se cambian. La reversión del frontend consiste en desplegar su imagen previa o revertir los archivos afectados; conservar las rutas de retorno registradas.

Fuentes oficiales: [temas](https://www.keycloak.org/ui-customization/themes), [plantillas base de 26.8.1](https://github.com/keycloak/keycloak/tree/26.8.1/themes/src/main/resources/theme/base/login), [PasswordPoliciesBean 26.8.1](https://github.com/keycloak/keycloak/blob/26.8.1/services/src/main/java/org/keycloak/forms/login/freemarker/model/PasswordPoliciesBean.java).

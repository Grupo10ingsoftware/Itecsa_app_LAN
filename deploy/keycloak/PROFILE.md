# Identidad y fecha de registro del perfil LAN

El nombre de usuario mostrado en «Mi perfil» proviene de `preferred_username` en el access token de `itecsa-web`. El mapper `Username` obtiene la propiedad `username` de la cuenta autenticada en Keycloak. No se usa el correo ni el nombre personal como sustituto; la identidad y autorización siguen vinculadas a `sub`, roles y permisos.

## Qué significa «Fecha de registro»

Es la fecha de creación de la cuenta de acceso registrada por Keycloak (`UserModel.createdTimestamp`, milisegundos desde Unix epoch), tanto para el primer administrador como para las cuentas creadas desde administración. No representa el primer login, el inicio de un intento de provisión ni el alta de una persona en otro sistema.

El mapper `Account creation date` lee esa propiedad interna y emite el número `itecsa_account_created_at_ms` únicamente en el access token de `itecsa-web`. La API toma el claim del token verificado para el mismo `sub` del usuario local y devuelve `fechaRegistro` como ISO 8601 UTC con `Z`, o `null` si no existe o no es válido. El dato es informativo y no concede permisos. La UI muestra día, mes, año, hora y minutos en `America/Santiago`, incluyendo sus cambios de horario.

La persistencia ya existe en Keycloak: no se añade columna, migración ni relleno de fechas en MySQL. Las cuentas existentes con esa propiedad reciben su fecha real al renovar sesión. Tokens anteriores al mapper y cuentas sin fecha válida siguen funcionando y muestran «No informada»; no se usa `iat`, `auth_time`, el journal, auditoría ni la hora actual como sustituto. Un timestamp posterior a la emisión del token tampoco se presenta como fecha confiable.

Para cuentas importadas, Keycloak puede conservar un `createdTimestamp` explícito o registrar la fecha de importación cuando no se proporciona. Esta pantalla refleja el dato conservado por Keycloak: no certifica una antigüedad anterior a la importación ni reconstruye fechas históricas.

El realm generado para instalaciones nuevas incluye ambos mappers. Se conserva `basic` como único scope predeterminado del cliente web y no se habilitan scopes opcionales, permisos administrativos ni estos datos en ID token, userinfo o introspección. El cliente de recuperación de PIN no cambia.

## Instalación existente

Actualizar los scripts de despliegue a una versión que incluya esta corrección. Con Docker, MySQL, Keycloak y la aplicación en ejecución, desde la raíz del repositorio y con el archivo de entorno habitual:

```bash
bash deploy/mysql/manage.sh keycloak-configure
bash deploy/mysql/manage.sh verify
```

Para otro archivo de entorno, añadir `--env-file ruta/al/archivo.env` a ambos comandos. Se reutilizan la CA configurada y las credenciales del operador de Keycloak; no hay que volver a crear el administrador inicial ni introducir contraseñas en los comandos.

`keycloak-configure` toma el bloqueo de operaciones del despliegue, verifica instalación, imágenes, base e issuer, y ejecuta el bootstrap idempotente. Si el realm conserva el contrato anterior, añade únicamente los mappers de perfil faltantes y vuelve a leerlo para comprobar su configuración. En un realm ya configurado no crea duplicados. Los contenedores permanecen en ejecución y no se ejecutan migraciones ni cambios de grants MySQL. El bootstrap también comprueba sus políticas, scopes y roles habituales; una configuración incompatible se rechaza y debe diagnosticarse, no se sobrescribe a ciegas.

La politica vigente de roles y la deshabilitacion de Soporte se describen en [Administracion de usuarios](SUPPORT_DELEGATION.md); keycloak-configure tambien aplica ese contrato.

Regenerar el JSON de importación o reiniciar Keycloak no actualiza por sí solo un realm existente. Aplicar este comando **antes de ejecutar `update` o un backup con los scripts nuevos**, porque sus verificaciones requieren ambos mappers. `verify` solo comprueba: si falta, informa cómo aplicarlo y no modifica Keycloak.

Después, cerrar sesión e iniciar sesión nuevamente. Los tokens ya emitidos no cambian; una renovación posterior también incorpora el dato. Comprobar «Mi perfil» con el primer administrador y una cuenta ordinaria, confirmando su username, rol y fecha de registro, y repetir tras cerrar y abrir sesión. Un fallo de verificación no exige eliminar el realm ni sus usuarios.

## Pruebas

Regresión del contrato generado y del bootstrap, sin servicios externos:

```bash
node --test deploy/keycloak/profile-contract.test.mjs capaServidor/test/profileRegistrationDate.test.js capaVista/test/profileDates.test.mjs
```

Comprobación de emisión real y consumo por la sesión frontend, contra el despliegue HTTPS existente:

```bash
node scripts/verify-profile-identity.mjs --help
```

El verificador usa una cuenta existente mediante `PUBLIC_ORIGIN`, `PROFILE_USERNAME` y `PROFILE_PASSWORD`, y una CA confiable mediante `NODE_EXTRA_CA_CERTS`. Introducir la contraseña por un mecanismo local que no la deje en el historial; no pasarla como argumento ni guardarla en Git. La prueba inicia sesión con código de autorización y PKCE, comprueba el perfil autenticado, el username consumido y la fecha contra el claim firmado, cierra sesión y repite el acceso. No crea usuarios ni cambia contraseñas, PIN, roles o permisos. No imprime tokens. Para contrastar además la persistencia de origen, proporcionar `PROFILE_EXPECT_CREATED_AT_MS` con el `createdTimestamp` leído por un operador desde Admin REST. La cuenta elegida para esta prueba debe tener ese dato; el tratamiento de fechas ausentes se cubre por regresión.

Referencia del mapper: [UserPropertyMapper de Keycloak 26.8.1](https://github.com/keycloak/keycloak/blob/26.8.1/services/src/main/java/org/keycloak/protocol/oidc/mappers/UserPropertyMapper.java).

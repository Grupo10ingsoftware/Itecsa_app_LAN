# Nombre de usuario del perfil LAN

El nombre de usuario mostrado en «Mi perfil» proviene de `preferred_username` en el access token de `itecsa-web`. El mapper `Username` obtiene la propiedad `username` de la cuenta autenticada en Keycloak. No se usa el correo ni el nombre personal como sustituto; la identidad y autorización siguen vinculadas a `sub`, roles y permisos.

El realm generado para instalaciones nuevas incluye este mapper. Se conserva `basic` como único scope predeterminado del cliente web y no se habilitan scopes opcionales, permisos administrativos ni claims de username en ID token, userinfo o introspección. El cliente de recuperación de PIN no cambia.

## Instalación existente

Actualizar los scripts de despliegue a una versión que incluya esta corrección. Con Docker, MySQL, Keycloak y la aplicación en ejecución, desde la raíz del repositorio y con el archivo de entorno habitual:

```bash
bash deploy/mysql/manage.sh keycloak-configure
bash deploy/mysql/manage.sh verify
```

Para otro archivo de entorno, añadir `--env-file ruta/al/archivo.env` a ambos comandos. Se reutilizan la CA configurada y las credenciales del operador de Keycloak; no hay que volver a crear Soporte ni introducir contraseñas en los comandos.

`keycloak-configure` toma el bloqueo de operaciones del despliegue, verifica instalación, imágenes, base e issuer, y ejecuta el bootstrap idempotente. Si el realm conserva el contrato anterior, añade únicamente el mapper faltante y vuelve a leerlo para comprobar su configuración. En un realm ya configurado no crea duplicados. Los contenedores permanecen en ejecución y no se ejecutan migraciones ni cambios de grants MySQL. El bootstrap también comprueba sus políticas, scopes y roles habituales; una configuración incompatible se rechaza y debe diagnosticarse, no se sobrescribe a ciegas.

Regenerar el JSON de importación o reiniciar Keycloak no actualiza por sí solo un realm existente. Aplicar este comando **antes de ejecutar `update` o un backup con los scripts nuevos**, porque sus verificaciones requieren el mapper. `verify` solo comprueba: si falta, informa cómo aplicarlo y no modifica Keycloak.

Después, cerrar sesión e iniciar sesión nuevamente. Los tokens ya emitidos no cambian; una renovación posterior también incorpora el dato. Comprobar «Mi perfil» con el primer Soporte y una cuenta ordinaria, confirmando su username y rol, y repetir tras cerrar y abrir sesión. Un fallo de verificación no exige eliminar el realm ni sus usuarios.

## Pruebas

Regresión del contrato generado y del bootstrap, sin servicios externos:

```bash
node --test deploy/keycloak/profile-contract.test.mjs
```

Comprobación de emisión real y consumo por la sesión frontend, contra el despliegue HTTPS existente:

```bash
node scripts/verify-profile-identity.mjs --help
```

El verificador usa una cuenta existente mediante `PUBLIC_ORIGIN`, `PROFILE_USERNAME` y `PROFILE_PASSWORD`, y una CA confiable mediante `NODE_EXTRA_CA_CERTS`. Introducir la contraseña por un mecanismo local que no la deje en el historial; no pasarla como argumento ni guardarla en Git. La prueba inicia sesión con código de autorización y PKCE, comprueba el perfil autenticado y el username consumido, cierra sesión y repite el acceso. No crea usuarios ni cambia contraseñas, PIN, roles o permisos. No imprime tokens.

Referencia del mapper: [UserPropertyMapper de Keycloak 26.8.1](https://github.com/keycloak/keycloak/blob/26.8.1/services/src/main/java/org/keycloak/protocol/oidc/mappers/UserPropertyMapper.java).

# Tema de autenticación LAN

El idioma de la aplicación es español. El realm nuevo declara
`internationalizationEnabled=true`, `supportedLocales=["es"]` y
`defaultLocale="es"`. Keycloak 26.8.1 aporta las traducciones nativas mediante
el tema padre; los textos propios de ITECSA se mantienen en
`themes/itecsa/login/messages/messages_es.properties`.

El tema fuente incluye también `messages_en.properties`, con los mismos textos
en español. Así se resuelven los nombres de los campos y los requisitos aunque
Keycloak todavía seleccione inglés en una instalación directa del directorio.
`node scripts/sync-loading-theme.mjs` sincroniza ese respaldo y el CSS de carga;
el empaquetador vuelve a generarlos desde sus fuentes originales.

## Un mismo artefacto para Docker e instalación externa

```bash
node scripts/prepare-keycloak-theme.mjs --version 26.8.1
```

Genera `dist/keycloak-26.8.1/itecsa`. También admite `--output` para un directorio
exclusivo de salida y `--font /ruta/Inter.woff2` para una instalación externa.
El directorio de salida se regenera completo; no debe contener otros archivos.
Ya no se requiere ni admite `--messages-es`: el bundle nativo corresponde al
Keycloak padre fijado en 26.8.1, no a un archivo descargado por separado.

El Dockerfile ejecuta este mismo empaquetador y copia su salida, incluyendo:

- El catálogo propio español como `messages_es.properties` y como respaldo
  `messages_en.properties`. Keycloak usa inglés cuando la internacionalización
  está desactivada: también en ese caso todas las claves propias se resuelven
  en español. Esto no cambia la selección de idioma de las páginas nativas de
  otros temas; el contrato normal del realm continúa siendo español.
- `loading.css` obtenido de `shared/loading/indicator.css` durante el
  empaquetado. No depende de que alguien haya compilado primero React.
- `itecsa-build.json`, con `schemaVersion: 1`, versión de Keycloak, idioma y
  SHA-256 de cada archivo del tema, relativo a su raíz. El manifiesto no se
  incluye a sí mismo. No contiene secretos ni datos de usuarios.

La plantilla carga en orden los estilos de `theme.properties`, incluidos los
estilos del indicador. Su SVG tiene además dimensiones intrínsecas de 16 × 16
como respaldo. Se conserva el POST nativo, el nombre/valor del botón, la
prevención de envíos duplicados y la recuperación al volver mediante BFCache.
La validación de contraseña del servidor sigue siendo la autoridad final.

Durante el envío se conserva el texto original del botón en el flujo de diseño,
oculto visualmente, y se superpone el indicador de carga. El botón mantiene sus
dimensiones al iniciar sesión o actualizar la contraseña, incluso si todavía
no se ha descargado `loading.css`.

## Instalación Docker existente

### Recuperación de PIN con pantalla gris y azul

La recuperación de PIN utiliza el cliente OIDC `itecsa-pin-recovery`, que selecciona
su propio tema mediante `login_theme=itecsa-pin-recovery`. Ese tema debe declarar
`parent=itecsa`. Con `parent=keycloak` hereda la pantalla predeterminada, aunque
el login principal del realm esté configurado con ITECSA y los dos directorios
estén incluidos en la imagen.

La herencia corregida reutiliza el logo, los campos, los botones, el indicador de
carga y los colores del tema principal. El título y el mensaje de confirmación de
identidad siguen siendo específicos de la recuperación de PIN, en español.

Para inspeccionar el archivo que realmente usa el contenedor, desde el servidor:

```bash
docker compose --env-file deploy/mysql.env -f compose.mysql.yaml exec -T keycloak cat /opt/keycloak/themes/itecsa-pin-recovery/login/theme.properties
```

Debe aparecer `parent=itecsa`. Si sigue apareciendo `parent=keycloak`, el contenedor
está usando el tema anterior. Construir o cargar la imagen Keycloak corregida y
recrear su contenedor mediante el procedimiento de actualización de la entrega.
Cambiar solamente los archivos del checkout no cambia los archivos ya incluidos
en una imagen. Al reemplazar el contenedor se renuevan también las cachés del tema;
abrir un flujo nuevo de recuperación y recargar los recursos del navegador.
Se conservan las bases, los usuarios y los volúmenes de la instalación.

La comprobación HTTP de `image-provenance.mjs verify --active --http` comprueba
tanto `itecsa-web` como `itecsa-pin-recovery`, con sus callbacks y PKCE. Para ambos
valida los recursos CSS, JS y logo contra la entrega, sin iniciar sesión. CI también
compara el directorio del tema de PIN extraído de la imagen con el del repositorio.

### Actualización de la entrega e idioma

Primero construir/cargar la nueva imagen Keycloak y desplegarla siguiendo el
procedimiento habitual de imágenes del entorno. El cambio de idioma se aplica
sin recrear el realm ni usuarios:

```bash
bash deploy/mysql/manage.sh keycloak-configure
bash deploy/mysql/manage.sh verify
```

Ambos admiten `--env-file /ruta/al/archivo.env`. Usan el operador y la CA ya
configurados; no introducir contraseñas en los argumentos. `keycloak-configure`
reconoce el contrato anterior con internacionalización desactivada, actualiza
solo los tres campos de idioma y los vuelve a leer. La segunda ejecución no
escribe. Una configuración activa en otro idioma se rechaza para revisión
administrativa; no se sobrescribe silenciosamente. `verify` es de solo lectura
y comunica la acción pendiente. Aplicar la configuración **antes de `update`
o de un backup con los scripts nuevos**, cuyas verificaciones exigen el idioma.
Editar el JSON de importación o reiniciar el contenedor no actualiza un realm
persistente.

## Verificación

```bash
node --test deploy/keycloak/profile-contract.test.mjs deploy/keycloak/theme-contract.test.mjs deploy/keycloak/theme-forms.test.mjs
docker build -f deploy/keycloak/Dockerfile -t itecsa-keycloak:theme-check .
```

CI compara byte por byte el artefacto generado localmente con el extraído de
la imagen final. Para aceptar el despliegue comprobar también el HTML y CSS
servidos sobre HTTPS, el cambio obligatorio de contraseña y el botón durante
una respuesta lenta. Los tests de formulario no simulan el diseño del
navegador ni sustituyen esa prueba real. Incluir confirmación distinta, rechazo
del servidor, pantalla pequeña, zoom y acceso sin JavaScript. No registrar las
contraseñas ni tokens usados en las pruebas.

Referencia: [temas de Keycloak 26.8.1](https://github.com/keycloak/keycloak/blob/26.8.1/docs/guides/ui-customization/themes.adoc).

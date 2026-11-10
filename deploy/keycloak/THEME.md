# Tema de autenticación LAN

El idioma de la aplicación es español. El realm nuevo declara
`internationalizationEnabled=true`, `supportedLocales=["es"]` y
`defaultLocale="es"`. Keycloak 26.8.1 aporta las traducciones nativas mediante
el tema padre; los textos propios de ITECSA se mantienen en
`themes/itecsa/login/messages/messages_es.properties`.

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

## Instalación Docker existente

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

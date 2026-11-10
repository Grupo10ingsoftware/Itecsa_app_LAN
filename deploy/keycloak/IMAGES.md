# Evidencia de la entrega e imágenes activas

`APP_VERSION` y las etiquetas OCI comprueban la revisión declarada. El recibo
`itecsa-release.json` añade los image ID inmutables, plataforma, `RepoDigests`
disponibles, bases fijadas y hashes de los recursos de web y Keycloak. El ID
es el identificador inmutable expuesto por Docker; `RepoDigests` conserva las
referencias de manifiesto del registro. No se infiere uno a partir del otro, y
`docker load` puede conservar el ID sin conservar `RepoDigests`. Una etiqueta local se puede renombrar sin cambiar
el contenido verificado.

El recibo se genera en el equipo que prepara la entrega con el checkout de
esa misma revisión. Es evidencia de integridad y procedencia declarada, no una
firma del proveedor ni una garantía de ausencia de vulnerabilidades. Conservar
el recibo original junto con las imágenes; no regenerarlo para silenciar una
diferencia en el servidor.

## Registrar y comprobar

Después de construir o descargar las cinco imágenes configuradas:

```bash
node deploy/keycloak/image-provenance.mjs record --env-file deploy/mysql.env --output data/offline/itecsa-release.json
node deploy/keycloak/image-provenance.mjs verify --env-file deploy/mysql.env --output data/offline/itecsa-release.json
```

`record` exige revisión, bases y tema correctos y se niega a sobrescribir un
recibo existente. Para MySQL exige el digest fijado en `RepoDigests` o comprueba
que la referencia inmutable disponible localmente resuelve al mismo ID. Una
etiqueta MySQL preexistente de otra versión no puede generar un recibo válido.
La verificación offline posterior conserva la comparación por ID, aunque
`docker load` no retenga esos metadatos de registro.
Usar un archivo nuevo por entrega. Extrae recursos mediante
contenedores temporales que nunca se arrancan, sin montar datos ni ejecutar
código de las imágenes. Solo registra identificadores, versiones y hashes;
no vuelca configuración, contraseñas, tokens ni variables de los servicios.

En el despliegue activo, utilizar la CA confiable del entorno:

```bash
NODE_EXTRA_CA_CERTS=/ruta/ca.pem node deploy/keycloak/image-provenance.mjs verify --env-file deploy/mysql.env --output data/offline/itecsa-release.json --active --http
```

`--active` compara `.Image` de los contenedores MySQL, API, web y Keycloak con
el recibo. Las herramientas de base son una imagen efímera y se verifican
localmente. `--http` abre un login OIDC sin credenciales, comprueba que la
plantilla enlaza sus recursos y contrasta sus bytes, además de los archivos
estáticos web. Detecta, por ejemplo, un CSS omitido o un proxy que responde
`index.html` con HTTP 200 en lugar de un recurso inexistente. No prueba inicio
de sesión, autorización, acciones de usuario ni dimensiones visuales: esas
pruebas siguen siendo necesarias.

El tema debe coincidir con el artefacto preparado por
`prepare-keycloak-theme.mjs`, incluido su manifiesto. Se comprueban todos sus
archivos, plantillas y ambos catálogos. El CSS compartido se compara entre la
fuente, el tema y la entrada del build web conservada fuera del directorio
público. Los bundles compilados se verifican por sus propios hashes.
`runtime-config.js` queda excluido porque depende de la instalación; las
verificaciones existentes siguen validando issuer, origen y clientes.

## Integración con manage.sh

Para activar la comprobación al operar, configurar en el entorno:

```dotenv
IMAGE_MANIFEST_FILE=./data/offline/itecsa-release.json
```

- `build`: después de construir, crea el recibo si no existe; si ya existe,
  exige los mismos IDs y recursos. Reconstruir contenido distinto bajo la misma
  entrega requiere una nueva revisión/recibo, no editar el anterior.
- `pull`: aplica el mismo procedimiento después de descargar. Usar las
  referencias inmutables de `release.json` publicado por CI.
- `preloaded`: exige el recibo entregado; no lo genera en destino. La carga
  offline ya comprueba TAR, inventario y recursos.

Con este campo configurado, las verificaciones de imágenes previas a operar
comprueban el recibo. La comprobación de aplicación posterior al arranque
incluye imágenes activas y HTTP. El campo vacío conserva compatibilidad con
instalaciones anteriores mientras se preparan nuevas imágenes/recibos; no
activa esta protección adicional. Los controles previos de revisión permanecen.

## Entrega offline y CI

`offline-images.sh pack|load|verify` mantiene el inventario original
`itecsa-images.txt` y la verificación de IDs/revisiones. Añade el recibo JSON y
SHA-256 del inventario/recibo junto al checksum del TAR. Transportar los cuatro
archivos. Los paquetes antiguos deben regenerarse con la revisión nueva; no
se acepta inferir un recibo después de una carga de procedencia desconocida.

CI construye y comprueba API, web, herramientas y Keycloak. Publica las cuatro
imágenes, `release.json` con sus digests de registro y el recibo enriquecido
`itecsa-release-published.json`. Al descargarlo se puede renombrar a
`itecsa-release.json`; verificar con las referencias configuradas y la misma
plataforma. El recibo de CI registra etiquetas locales de construcción como
referencia informativa; la comparación efectiva utiliza servicio, ID, revisión,
plataforma y bases. MySQL conserva su referencia fijada del despliegue.

## Actualizar bases

Las referencias inmutables de Node, Nginx, Keycloak y MySQL se documentan en
`deploy/image-bases.json`. Node/Nginx/Keycloak también están en los `ARG` de los
Dockerfiles: las pruebas exigen que coincidan. No se resuelve una etiqueta
mutable al desplegar. Para una actualización deliberada:

1. Consultar la versión y el digest oficial, revisar sus cambios y plataformas.
2. Actualizar el inventario de bases y los `ARG` correspondientes. Si cambia
   MySQL, actualizar también el digest del gestor. Si cambia Keycloak, revisar
   además el contrato y las plantillas de esa versión.
3. Construir una entrega nueva, ejecutar tests/escaneo y comprobar login,
   recursos HTTP y flujos de aplicación. Conservar el recibo previo para reversión.

Fijar el `FROM` no fija los repositorios APT/APK consultados después. Por eso
no se promete una reconstrucción bit a bit: la entrega se identifica por los
IDs/digests finales y se distribuyen esas mismas imágenes.

Referencia: [Docker: fijación de imágenes base](https://docs.docker.com/build/building/best-practices/#pin-base-image-versions).

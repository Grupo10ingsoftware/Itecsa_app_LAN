# MySQL Docker: despliegue autónomo

La referencia técnica de la instalación integrada con Keycloak 26.8.1 está en
`docs/operacion/KEYCLOAK_LAN_OFFLINE_DESPLIEGUE.md`. Esta página detalla
las operaciones de MySQL del mismo despliegue de producción.

Este despliegue utiliza `compose.mysql.yaml` con MySQL y Keycloak locales. Es
el mismo stack integrado para servidor y pruebas aisladas en computador.

## Preparación

Requisitos: Docker Engine con el complemento Compose, Node.js 22 o posterior, OpenSSL y, para el modo de construcción,
acceso a los registros de paquetes durante el build.

1. Copiar las plantillas:

   ```bash
   cp deploy/mysql.env.example deploy/mysql.env
   cp capaServidor/env.example capaServidor/.env
   ```

2. Completar `deploy/mysql.env`, `capaServidor/.env` y
   `capaVista/.env`. No deben quedar valores entre `<...>` ni claves `DB_*`
   heredadas en el `.env` de la API: el Compose inyecta la conexión local.
3. Mantener estable `COMPOSE_PROJECT_NAME`: identifica la instalación y
   determina sus volúmenes. Usar un valor distinto en el computador de pruebas
   y en el servidor.
4. Mantener `APP_RUNTIME_ENV=production` y HTTPS, tanto en el servidor como
   en las pruebas locales con el stack integrado.
5. Elegir `DEPLOY_IMAGE_MODE`:
   - `build`: construye API, web, database-tools y Keycloak desde el clon.
   - `pull`: descarga las referencias configuradas.
   - `preloaded`: exige que todas las imágenes ya estén cargadas.

Los valores de `deploy/mysql.env` se leen literalmente, sin interpolar variables.
Se admiten CRLF y comillas alrededor de un valor; no se admiten valores multilínea.
No se escribe
`DATABASE_URL`: el inicializador la construye mediante `URL`.

## Instalación nueva

Desde la raíz:

```bash
./deploy/mysql/manage.sh check
./deploy/mysql/manage.sh install
```

El comando prepara imágenes y TLS, inicia MySQL, crea las cuentas por socket,
registra el UUID del volumen, aplica migraciones, ejecuta el seed, verifica el
resultado y finalmente levanta Keycloak, API y web, y completa el bootstrap administrativo.

`install` rechaza una identidad existente y una base que ya tenga tablas. No
elimina ni reemplaza volúmenes.
Si la instalación queda pendiente, usar `manage.sh resume` con la misma versión
y configuración. No tratar una instalación interrumpida como una actualización.

## Arranque, parada y verificación

```bash
./deploy/mysql/manage.sh start
./deploy/mysql/manage.sh stop
./deploy/mysql/manage.sh verify
```

`start` no ejecuta migraciones ni seeds. MySQL no publica el puerto 3306.
`verify` exige servicios en ejecución y comprueba su configuración sin iniciarlos
ni completar pasos de instalación.

## Actualización

Configurar `APP_VERSION`, `API_IMAGE`, `WEB_IMAGE` y
`DB_TOOLS_IMAGE` con una misma release y ejecutar:

```bash
./deploy/mysql/manage.sh update
```

Antes de tocar el esquema, el comando:

1. comprueba que las etiquetas de API, web y database-tools coincidan con
   `APP_VERSION`;
2. detiene la API;
3. revoca escrituras a la API, revoca temporalmente la migradora y cierra las sesiones de ambas;
4. crea un respaldo consistente por el socket Unix, sin escritores de red;
5. aplica únicamente migraciones pendientes y el seed idempotente;
6. verifica historial, checksums, drift, TLS, permisos y catálogos;
7. rehabilita la cuenta API y levanta la aplicación.

Si falla el respaldo, una migración o una verificación, el script termina sin
rehabilitar escrituras ni reiniciar la API. El volumen queda disponible para
diagnóstico.

## Respaldo

```bash
./deploy/mysql/manage.sh backup
```

Los archivos se guardan bajo `data/backups/mysql/`, ignorado por Git. Cada
SQL tiene un manifiesto con SHA-256, versión, migraciones y UUID de la instancia
fuente.

## Restauración en una instalación nueva

La restauración no exige que el UUID fuente y destino coincidan. El UUID del
manifiesto identifica el origen; la autorización utiliza exclusivamente el
UUID efectivo del destino.

Primera ejecución:

```bash
./deploy/mysql/manage.sh restore --backup archivo.sql
```

El comando prepara la instancia nueva, muestra su identidad y se detiene.
Repetir con la confirmación exacta indicada:

```bash
./deploy/mysql/manage.sh restore \
  --backup archivo.sql \
  --confirm proyecto:base:uuid-del-destino
```

Se verifican checksum, proyecto, base, UUID destino, hostname, MySQL 8.4, TLS y
coincidencia con la identidad del volumen local. La base destino debe estar sin tablas.
Después del restore se aplican migraciones posteriores, seed y verificación.

## Entrega sin internet

En un equipo con acceso, preparar las cinco imágenes configuradas:

- MySQL 8.4;
- API;
- web;
- Keycloak;
- database-tools de la misma release que la API.

Exportarlas con `docker image save`, transportarlas por el procedimiento
aprobado y cargarlas con `docker image load`. En el destino usar referencias
locales y `DEPLOY_IMAGE_MODE=preloaded`.

También deben transportarse, por un canal seguro, los archivos de entorno. Los
certificados internos de MySQL pueden generarse durante `install`; el certificado
HTTPS de la LAN, su clave y CA deben estar disponibles previamente. Una configuración TLS
existente nunca es sobrescrita. El certificado y la clave del servidor se
copian a `mysql_tls` con propietario y permisos aptos para el usuario interno
de la imagen MySQL; la clave privada de la CA permanece solo en
`deploy/mysql/private/`.

## Persistencia

Los volúmenes `mysql_data`, `mysql_socket`, `mysql_state` y `mysql_tls` quedan
aislados por `COMPOSE_PROJECT_NAME`. `up`, recrear contenedores o cambiar
imágenes no elimina `mysql_data`. No usar `docker compose down --volumes`
ni `docker volume rm` como parte de instalación o actualización.

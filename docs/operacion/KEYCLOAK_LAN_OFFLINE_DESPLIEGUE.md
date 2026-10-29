# Keycloak 26.8.1 y MySQL 8.4 en LAN sin internet

## Alcance y procedencia

Esta instalación crea un realm `itecsa` nuevo sobre una base MySQL exclusiva. No importa usuarios, contraseñas, tokens ni claves de la VM. Los dos documentos de handoff existentes siguen siendo antecedentes y no se modifican.

| Ajuste | Procedencia |
| --- | --- |
| Cinco clients, nueve roles compuestos, 25 capacidades, tres mappers web, PKCE S256, scope `basic`, cuatro permisos técnicos y política de contraseña | Observado en la VM; los nombres y la composición se contrastaron con `shared/keycloakAuthorization.js` |
| Audiencia `https://api.itecsa.local`, claims `resource_access.itecsa-api-v1.roles` y `permissions`, callback PIN, cuentas locales, issuer y JWKS exigidos por API | Deducido del código |
| Realm nuevo con detección de fuerza bruta, HTTPS obligatorio, tema `itecsa-pin-recovery` solo en el client PIN, CA única y cuenta administrativa permanente | Decidido para el despliegue nuevo |
| Registro y recuperación pública deshabilitados | Observado en la VM y conservado para el despliegue nuevo |

La audiencia es un identificador y no requiere DNS. `PUBLIC_ORIGIN` sí debe resolver y llegar por HTTPS al mismo proxy desde el host, los navegadores y el contenedor API. El certificado debe contener ese nombre o IP en SAN. La CA aportada por operación debe validar el certificado público. No se incluyen certificados definitivos en Git.

## Preparación en Ubuntu limpio

Instalar Docker Engine, Compose v2, Node.js 22 o posterior y OpenSSL. Copiar el repositorio, sin datos de la VM. Preparar DNS interno o resolución de la IP elegida y el certificado con su clave y CA. La clave debe ser legible para el GID `LAN_TLS_KEY_GID` dentro del contenedor web; el valor por defecto es 101. Conservar archivos de secretos fuera del control de versiones y con permisos restrictivos.

```bash
cp deploy/mysql.env.example deploy/mysql.env
cp capaServidor/env.mysql.docker.example capaServidor/.env.mysql.docker
```

Completar `deploy/mysql.env`, `capaServidor/.env.mysql.docker` y `capaVista/.env`. `manage.sh` rechaza marcadores `<...>`. `APP_VERSION` debe ser una etiqueta estable de release, igual en API, web, herramientas y Keycloak. `COMPOSE_PROJECT_NAME` debe permanecer estable: identifica los volúmenes. Usar secretos distintos para root MySQL, API, migradora, Keycloak, client administrativo y las dos cuentas administrativas. El secreto del client debe tener al menos 32 caracteres; la clave del administrador permanente, al menos 20. Las variables `FIRST_USER_*` se dejan vacías hasta el primer acceso.

`PUBLIC_ORIGIN` es la única fuente para issuer, JWKS, redirects, callback PIN y configuración pública de SPA/API. Debe ser `https://nombre-o-ip` sin puerto ni ruta. `LAN_CA_FILE`, `LAN_TLS_CERT_FILE` y `LAN_TLS_KEY_FILE` apuntan a archivos locales. `LAN_BIND_ADDRESS` permite limitar la interfaz HTTPS. `APP_RUNTIME_ENV=production` en la LAN.

## Instalación inicial

```bash
./deploy/mysql/manage.sh install
```

El instalador comprueba certificado, SAN, clave y resolución del origen público desde host y contenedor API antes de crear las bases. Luego prepara TLS de MySQL, crea las dos bases y las cuentas separadas, aplica migraciones, importa el realm una sola vez, arranca MySQL, Keycloak, API y web, verifica el issuer público por TLS desde host y API, configura permisos y perfil de usuario, crea un administrador permanente en `master`, valida su acceso y elimina el administrador temporal. No borra volúmenes. El JSON generado en `deploy/keycloak/private/` contiene el secreto del client y queda ignorado por Git. El import posterior de Keycloak omite un realm existente; cambios posteriores deben hacerse mediante migraciones administrativas verificadas, no editando ese JSON ni esperando que un reinicio lo aplique.

La consola administrativa queda en `${PUBLIC_ORIGIN}/admin/`. Tras instalar, retirar las credenciales temporales del almacenamiento operativo cuando ya no se necesiten. Conservar las credenciales del operador permanente en un gestor de secretos. La base MySQL de Keycloak usa TLS con la CA de MySQL; la API usa la CA LAN para consultar el issuer público.

```bash
./deploy/mysql/manage.sh verify
./deploy/mysql/manage.sh start
./deploy/mysql/manage.sh stop
./deploy/mysql/manage.sh update
```

`verify` y `start` comprueban el discovery OIDC por HTTPS desde host y API. `update` conserva el realm y sus usuarios; aplica únicamente migraciones de la aplicación. No se debe ejecutar `docker compose down --volumes`.

## Primer usuario Soporte

Con la instalación vacía, rellenar `FIRST_USER_USERNAME`, `FIRST_USER_EMAIL`, `FIRST_USER_FIRST_NAME`, `FIRST_USER_LAST_NAME`, `FIRST_USER_RUT` y una contraseña temporal aleatoria de al menos 20 caracteres. Ejecutar supervisadamente:

```bash
./deploy/mysql/manage.sh first-user
```

El comando exige que `Usuario` y `ExternalIdentity` estén vacías, crea el usuario Keycloak con `Soporte`, `itecsa_provision_id` y `UPDATE_PASSWORD`, y registra su vínculo MySQL. Si falla la transacción local, intenta retirar la cuenta remota. Borra `FIRST_USER_TEMP_PASSWORD` del archivo de entorno al terminar. La persona debe cambiar la clave en el primer ingreso y completar el flujo de PIN de la aplicación. El comando no es un mecanismo general de alta de usuarios.

## Respaldo y restauración

```bash
./deploy/mysql/manage.sh backup
./deploy/mysql/manage.sh keycloak-backup
```

Los SQL y manifiestos SHA-256 quedan por separado en `data/backups/mysql/` y `data/backups/keycloak/`. Se guardan fuera de Git, con permisos restrictivos, junto con el archivo de entorno y las CA necesarias para reconstruir la instancia. El backup conjunto detiene API y Keycloak para mantener una pareja coherente de identidades. El backup exclusivo de Keycloak detiene Keycloak, dejando disponible la base de aplicación.

En un destino nuevo, usar el mismo proyecto, nombres de base, origen público y secreto del client. Copiar los SQL y manifiestos a sus directorios. `restore` crea la identidad del destino si aún no existe y muestra el UUID requerido; repetir con `--confirm`. Después restaurar Keycloak, también en una base vacía:

```bash
./deploy/mysql/manage.sh restore --backup archivo-app.sql
./deploy/mysql/manage.sh restore --backup archivo-app.sql --confirm proyecto:base-app:uuid-destino
./deploy/mysql/manage.sh keycloak-restore --backup archivo-keycloak.sql --confirm proyecto:base-keycloak:uuid-destino
```

La confirmación usa el UUID del destino, no el del backup. Los manifiestos verifican versión, proyecto, base y SHA-256. Restaurar ambos respaldos de la misma ventana operativa; una sola base puede dejar vínculos de usuarios incongruentes. Nunca restaurar encima de tablas existentes.

## Paquete offline

En el equipo que construye la release, configurar las cinco referencias de imagen y ejecutar:

```bash
./deploy/keycloak/offline-images.sh pack deploy/mysql.env data/offline
```

Transportar `itecsa-images.tar`, `itecsa-images.sha256` e `itecsa-images.txt`. En el servidor sin acceso a registros:

```bash
./deploy/keycloak/offline-images.sh load deploy/mysql.env data/offline
./deploy/keycloak/offline-images.sh verify deploy/mysql.env data/offline
```

Fijar `DEPLOY_IMAGE_MODE=preloaded` antes de `manage.sh install`. El script comprueba SHA-256, identidades y etiquetas de revisión de las imágenes. También se necesitan los archivos de entorno, certificado, clave y CA por un canal seguro. `preloaded` no descarga imágenes.

`MYSQL_IMAGE=itecsa-mysql:8.4-pinned` es una etiqueta local exportable. En modos `build` y `pull`, el gestor la crea a partir del digest MySQL 8.4 fijado en `manage.sh`; en el destino offline se restaura desde el TAR. No cambiarla por una referencia solo `@sha256`: Docker no conserva una etiqueta para esa forma al exportar.

## Validación

La suite local `node --test deploy/keycloak/render-realm.test.mjs` comprueba el contrato de cinco clients, roles, mappers, callback PIN, política y rechazo de orígenes inseguros. Las pruebas existentes de sesión, PIN, alta y retorno de login completaron 50 casos. La prueba con Keycloak 26.8.1 descartable confirmó el import y la configuración administrativa, incluidos los cuatro permisos técnicos y el reemplazo del administrador temporal. Un segundo laboratorio con MySQL 8.4 comprobó creación de base y cuenta exclusivas, conexión JDBC con TLS, salud, persistencia tras reinicio, respaldo independiente con manifiesto, restauración en base vacía y arranque posterior con `Realm 'itecsa' already exists. Import skipped`. El paquete offline de cinco imágenes pasó `pack`, `verify` y `load` con SHA-256 correcto. `docker compose --env-file deploy/mysql.env.example -f compose.mysql.yaml config --quiet` comprueba el esquema Compose.

Antes de aceptar la LAN definitiva, ejecutar login, logout, renovación y validación de tokens en la API; alta de usuario, primer cambio de clave, PIN y recuperación administrativa tras bloqueo por fuerza bruta; reinicio con persistencia; respaldo y restauración de ambas bases; arranque `preloaded` sin internet. Registrar evidencia de DNS/IP, SAN, confianza de CA en navegador y host, conexión TLS desde API al issuer y capacidad de CPU, memoria y disco del servidor. Esas pruebas dependen del entorno definitivo y no se declaran completadas por la inspección de la VM.

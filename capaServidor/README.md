# ITECSA · Servidor y operación LAN

API de gestión de pedidos, producción, pagos, usuarios, notificaciones e informes.
Implementada en JavaScript ESM con Express 5, Prisma 7 y MySQL 8.4. Keycloak
gestiona la identidad; la API valida JWT, capacidades, usuario activo y PIN según
la operación. La integración de notas de venta con Manager usa SQL Server.

## 1. Estructura y requisitos

Se necesita el repositorio completo, no solo `capaServidor/`:

| Ruta | Responsabilidad |
| --- | --- |
| `capaServidor/src/` | Arranque, configuración, middleware y módulos de negocio. |
| `capaServidor/prisma/` | Esquema, migraciones históricas y seed de catálogos. |
| `capaServidor/scripts/` | Administración de bases, respaldos y diagnósticos operativos. |
| `capaVista/` | Aplicación React; consultar su [README](../capaVista/README.md). |
| `shared/` | Permisos, roles, catálogos, reglas y estilos compartidos. |
| `tooling/prisma/` | CLI Prisma aislada de las dependencias del servidor. |
| `deploy/` | Gestor de instalación, MySQL, Nginx, TLS y temas Keycloak. |
| `scripts/` | Preparación y administración de temas, sincronización de CSS y control de archivos de datos. |
| `compose.mysql.yaml` | Stack integrado de producción: MySQL, Keycloak, API y web. |
| `compose.*.lab*.yaml` | Perfiles heredados de laboratorio; no son el despliegue normal. |
| `.github/workflows/` | Validación de fuentes, seguridad y construcción/publicación de imágenes. |

Para trabajar con las fuentes, usar Node.js 22.12 o posterior compatible con los
lockfiles y npm. CI utiliza Node 22. La operación LAN necesita Docker Engine con
Compose, Bash, Node y OpenSSL; el gestor está orientado a Linux/Ubuntu. En Windows
se puede desarrollar con Node y usar Docker Desktop; ejecutar el gestor desde un
entorno Bash con acceso a Docker y a los archivos montados.

## 2. Instalación de dependencias

Desde la raíz del repositorio:

```bash
npm ci --prefix tooling/prisma
npm ci --prefix capaServidor
```

Preparar la configuración antes de generar el cliente:

```bash
cd capaServidor
npm run prisma:generate
npm run prisma:validate
```

Los comandos Prisma cargan `.env`, o el archivo indicado por `DOTENV_PATH`, y
validan su configuración. No se conecta a una base para generar el cliente.
`npm ci` puede retirar el cliente generado; volver a generarlo después.
No instalar la CLI Prisma globalmente ni reemplazar los lockfiles.

## 3. Configuración

Las plantillas versionadas no contienen las credenciales de la empresa:

- `env.example`: API del stack integrado.
- `../deploy/mysql.env.example`: identidad del proyecto, imágenes, bases,
  secretos de instalación y certificados LAN.
- `../capaVista/env.example`: configuración pública del navegador.
- `env.mysql-lab.*.example` y `../deploy/mysql-lab.env.example`: laboratorio.

Copiar las plantillas únicamente cuando el destino no exista. En una instalación
existente conservar los archivos privados y revisar las diferencias manualmente.
No sobrescribirlos con ejemplos ni mostrar sus valores en logs.

| Variables | Uso |
| --- | --- |
| `APP_ENV`, `NODE_ENV` | Deben coincidir; producción usa `production`. |
| `PORT`, `FRONTEND_ORIGIN`, `TRUST_PROXY` | Puerto API, origen permitido y confianza del proxy. |
| `DB_TARGET`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SSL_CA_PATH` | Perfil MySQL y TLS; Compose los inyecta en producción. |
| `PIN_SECRET`, `RATE_LIMIT_SECRET`, `SECURITY_LOG_HMAC_KEY`, `CURSOR_SECRET` | Cuatro secretos distintos de 32 bytes codificados en base64. |
| `AUTH_PROVIDER`, `KEYCLOAK_*` | Proveedor Keycloak, issuer, JWKS, audiencia, clientes y recuperación de PIN. Compose proporciona la configuración del stack integrado. |
| `SALES_NOTE_SOURCE` | `manager` para SQL Server o `unavailable` sin fuente disponible. `fixture` está bloqueado en producción. |
| `MANAGER_DB_*`, `MANAGER_SALES_NOTE_LOOKBACK_DAYS` | Conexión SQL Server y ventana de consulta cuando se selecciona `manager`. |
| `PIN_DELIVERY_PROVIDER`, `PRIVACY_REQUEST_PROVIDER`, `SECURITY_INCIDENT_PROVIDER` | Canales de entrega; la plantilla los deja deshabilitados. |

El gestor rechaza configuración de bases heredada en el archivo de la API:
la conexión MySQL del stack procede de `deploy/mysql.env` y Compose. No reutilizar
una URL de base externa. Para ejecución directa usar un perfil local válido con
TLS y las variables de identidad completas; `env.example` por sí solo requiere
los valores que normalmente inyecta Compose.

## 4. Despliegue integrado

Ejecutar desde la raíz. En una instalación nueva, preparar `deploy/mysql.env`,
`capaServidor/.env` y `capaVista/.env` a partir de las plantillas. Configurar:

1. `COMPOSE_PROJECT_NAME` estable y exclusivo; identifica los volúmenes.
2. `APP_VERSION` igual en API, web, herramientas y Keycloak.
3. `PUBLIC_ORIGIN=https://nombre-o-ip`, sin puerto ni ruta, accesible desde
   navegadores, host y API. La audiencia `https://api.itecsa.local` es un
   identificador de recurso, no el nombre DNS de la instalación.
4. Certificado con SAN para ese origen, clave y CA en `LAN_TLS_CERT_FILE`,
   `LAN_TLS_KEY_FILE` y `LAN_CA_FILE`; configurar la confianza de los equipos.
5. Contraseñas distintas para las cuentas MySQL y administradores. El gestor
   exige un mínimo de 20 caracteres para esas contraseñas y 32 para el secreto
   del cliente administrativo. Completar también los cuatro secretos de API.
6. `DEPLOY_IMAGE_MODE=build`, `pull` o `preloaded`, según la entrega.

```bash
bash deploy/mysql/manage.sh check
bash deploy/mysql/manage.sh install
bash deploy/mysql/manage.sh verify
```

`check` valida requisitos y configuración sin iniciar servicios. `install` crea
las bases y cuentas separadas, configura TLS, aplica migraciones, carga catálogos,
importa el realm nuevo y termina el bootstrap administrativo. No usar `install`
como una actualización de una instalación existente.

Si la instalación se interrumpe, corregir la causa y ejecutar `resume` con el
mismo proyecto y configuración. No eliminar volúmenes ni marcar migraciones
fallidas como aplicadas para saltarse el diagnóstico.

Para crear el primer usuario, con las tablas de usuarios e identidades vacías,
completar `FIRST_USER_*` y ejecutar `first-user`. Crea un usuario Soporte y exige
cambio de contraseña. Borrar `FIRST_USER_TEMP_PASSWORD` del archivo al terminar.
El alta posterior se realiza mediante el flujo autorizado de la aplicación.
Tras completar el bootstrap, retirar la contraseña del administrador temporal y
conservar las credenciales del administrador permanente de forma segura.

## 5. Operación y actualización

```bash
bash deploy/mysql/manage.sh verify
bash deploy/mysql/manage.sh stop
bash deploy/mysql/manage.sh start
bash deploy/mysql/manage.sh update
docker compose --env-file deploy/mysql.env -f compose.mysql.yaml ps
docker compose --env-file deploy/mysql.env -f compose.mysql.yaml logs --tail=100 mysql keycloak api web
```

Los comandos del gestor aceptan `--env-file /ruta/absoluta/deploy.env`.
`verify` comprueba servicios existentes, TLS, bases, esquema, catálogos e identidad;
no completa una instalación pendiente. `update` prepara la revisión, respalda y
aplica migraciones pendientes conservando los datos. Mantener proyecto, bases,
origen y secretos de la instalación al actualizar. No ejecutar `down -v`.

El import de Keycloak omite un realm existente: editar el JSON generado no
actualiza sus usuarios ni configuración. Los cambios administrativos requieren
su procedimiento específico. El tema incluido en la imagen procede de
`deploy/keycloak/themes/`; para una instalación Keycloak externa se conservan
`scripts/prepare-keycloak-theme.mjs` y `scripts/keycloak-theme-admin.mjs`.

La API expone `/api/health/live`. La comprobación `/internal/ready` es opcional
y protegida por la configuración de salud interna. Un estado saludable no
sustituye la aceptación de login, permisos, PIN y flujos de negocio.

## 6. Respaldo y restauración

```bash
bash deploy/mysql/manage.sh backup
bash deploy/mysql/manage.sh keycloak-backup
```

`backup` detiene API y Keycloak para respaldar ambas bases en una ventana
coherente. Los SQL y manifiestos se guardan en `data/backups/mysql/` y
`data/backups/keycloak/`, fuera de Git. Conservarlos junto con la configuración
privada y CA necesarias en almacenamiento seguro independiente del servidor.

Restaurar en bases vacías de un destino preparado. El primer comando informa
el UUID que debe confirmarse; usar el UUID del destino:

```bash
bash deploy/mysql/manage.sh restore --backup archivo-app.sql
bash deploy/mysql/manage.sh restore --backup archivo-app.sql --confirm proyecto:base-app:uuid-destino
bash deploy/mysql/manage.sh keycloak-restore --backup archivo-keycloak.sql --confirm proyecto:base-keycloak:uuid-destino
```

Los manifiestos comprueban identidad, versión y SHA-256. Recuperar ambas bases
de la misma ventana para mantener los vínculos entre usuarios e identidades.

## 7. Entrega sin Internet

En el equipo de preparación, construir o descargar las cinco imágenes de la
misma revisión y configurar sus referencias en el archivo de despliegue:

```bash
bash deploy/keycloak/offline-images.sh pack deploy/mysql.env data/offline
```

Transportar TAR, SHA-256 e inventario al servidor. Los entornos y certificados
se entregan por un canal seguro separado:

```bash
bash deploy/keycloak/offline-images.sh load deploy/mysql.env data/offline
bash deploy/keycloak/offline-images.sh verify deploy/mysql.env data/offline
```

Configurar `DEPLOY_IMAGE_MODE=preloaded` antes de instalar o iniciar. Este modo
exige todas las imágenes locales y evita descargas y compilaciones en destino.
Mantener la etiqueta exportable de MySQL configurada en la plantilla.

## 8. Desarrollo y mantenimiento

`npm run dev` regenera Prisma y ejecuta Nodemon; `npm start` arranca la API.
Se requiere una base local y un Keycloak configurados; estos comandos no los
aprovisionan. No usar una base de producción para desarrollo.

| Comando desde `capaServidor/` | Finalidad |
| --- | --- |
| `npm run prisma:validate` / `prisma:generate` | Validar esquema / regenerar cliente. |
| `npm run prisma:migrate:status` | Consultar estado de migraciones. |
| `npm run prisma:migrate:dev` | Crear/aplicar migraciones exclusivamente de desarrollo. |
| `npm run prisma:pull` / `prisma:studio` | Introspección / exploración; requieren destino controlado. |
| `npm run prisma:seed` | Cargar catálogos canónicos; no genera usuarios ni pedidos. |
| `npm run manager:verify -- NUMERO_NOTA` | Diagnosticar la consulta de una nota en Manager. |
| `npm run orders:preflight` | Comprobación operativa de integridad de pedidos. |
| `npm run retention:preview` | Consultar el alcance de retención de negocio. |
| `npm run mysql:*` / `keycloak:*` | Herramientas de administración usadas por el gestor; revisar configuración antes de ejecutarlas directamente. |

Las migraciones históricas mantienen sus archivos y checksums. Los catálogos
canónicos viven en `shared/businessCatalog.js`; no sustituirlos con ejemplos de
documentación. La auditoría funcional y los mecanismos de seguridad permanecen
en el código del servidor.

## 9. Comprobaciones de entrega

Desde la raíz, con dependencias y entorno válido:

```bash
npm run prisma:validate --prefix capaServidor
npm run prisma:generate --prefix capaServidor
npm run lint --prefix capaVista
npm run build --prefix capaVista
```

Los Dockerfiles usan contexto raíz. Conservar `shared/`, `tooling/`, `deploy/`
y los scripts operativos al entregar las fuentes. `.dockerignore` excluye
dependencias locales, documentación y archivos privados del contexto.

Por decisión de entrega, las pruebas automatizadas, evidencias y documentación
histórica se retiraron del árbol el 8 de noviembre de 2026 y se conservaron en un
respaldo local organizado con manifiesto y SHA-256. La integración continua
mantiene validación Prisma, lint, build y controles de seguridad. Para retomar
las suites históricas se necesitan sus fuentes, configuración y dependencias
originales incluidas en ese respaldo. Validar además en el servidor de destino
login/logout, primer acceso, PIN, permisos, Manager, persistencia y restauración.

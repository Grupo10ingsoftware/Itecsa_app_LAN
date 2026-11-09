# Respaldos del despliegue LAN

Desde la raíz del repositorio:

```bash
bash deploy/mysql/manage.sh backup
bash deploy/mysql/manage.sh keycloak-backup
```

`backup` respalda MySQL de aplicación y Keycloak. `keycloak-backup` respalda solo Keycloak y no modifica los permisos de la aplicación.

Ambos comandos requieren una instalación completa, los cuatro servicios (`mysql`, `keycloak`, `api`, `web`) en ejecución y saludables, y la verificación de identidad, esquema, permisos y autenticación correcta. Un despliegue apagado, parcial o en mantenimiento se rechaza sin arrancar servicios ni conceder permisos. Para un despliegue detenido intencionadamente, arrancarlo y verificarlo primero; no usar `start` para intentar corregir una migración fallida.

Se requiere `flock` (paquete `util-linux` en Ubuntu/WSL). Las operaciones que modifican el despliegue comparten `deploy/mysql/private/operation.lock`: una segunda operación se rechaza mientras la primera continúa. Este bloqueo protege las invocaciones de `manage.sh` desde este checkout; no sustituye la coordinación con operadores que usen otro checkout o Docker/MySQL directamente. No borrar el archivo para liberar el bloqueo: el sistema lo libera al terminar el proceso.

## Validación y recuperación automática

Antes de detener servicios, se preparan los destinos necesarios en `data/backups/mysql` y `data/backups/keycloak`, con modo `700`. Se comprueba creación, escritura efectiva, lectura y eliminación de un archivo temporal tanto en el host como dentro del contenedor de respaldo. Una carpeta no administrable o un volumen no escribible abortan esta fase sin interrumpir el servicio.

Después de iniciar la parada, cualquier salida normal por error o señal `INT`, `TERM` o `HUP` intenta recuperar el estado inicial verificado. En el respaldo completo, se confirma el bloqueo, se restaura el acceso del migrador, se verifica la base con la API sin escrituras, se restituyen sus permisos y se vuelve a verificar. Solo entonces se reanudan los contenedores existentes, con un máximo de 120 segundos de espera, y se verifica la aplicación. No se recrean contenedores ni se aplican migraciones durante el backup.

Si falló el respaldo, el comando conserva un código de salida distinto de cero aunque el servicio se recupere. Un SQL o manifiesto individual no demuestra que el respaldo conjunto haya terminado: conservarlos para diagnóstico y repetir el respaldo completo después de resolver la causa.

Si la recuperación falla, se intenta detener los servicios afectados y, en el respaldo completo, bloquear las escrituras. El diagnóstico distingue entre protección confirmada e imposibilidad de confirmarla. No se anuncia éxito. Un `SIGKILL`, un corte eléctrico o la pérdida del host no permiten ejecutar el trap; requieren revisión manual.

## Recuperacion manual

1. Revisar la etapa y el código de salida del log, la disponibilidad de Docker/MySQL, el espacio disponible y los permisos de ambos destinos. No borrar SQL, manifiestos, volúmenes ni datos para resolver un problema de permisos.
2. Confirmar que la operación interrumpida era **un backup de un despliegue previamente sano**, y que nadie ejecutó migraciones o cambios en paralelo. Si hubo un `update`/`restore` fallido o no se puede determinar el estado, mantener la protección y diagnosticar la identidad, el historial de migraciones y el esquema antes de conceder permisos.
3. Una vez corregida la causa, para un **backup completo** interrumpido, ejecutar el siguiente bloque desde la raíz, usando el mismo archivo de entorno. Carga valores literalmente, toma el mismo bloqueo y verifica la base antes de reabrir la API. Ante otro error intenta volver a detener y bloquear, sin ocultar que esa protección puede fallar.

```bash
(
  set -Eeuo pipefail
  umask 077
  backup_env_file="$(mktemp)"
  trap 'rm -f "$backup_env_file"' EXIT
  node deploy/mysql/environment.mjs load deploy/mysql.env > "$backup_env_file"
  while IFS= read -r -d '' key && IFS= read -r -d '' value; do
    export "$key=$value"
  done < "$backup_env_file"
  rm -f "$backup_env_file"
  exec 9>deploy/mysql/private/operation.lock
  flock -n 9
  c() { docker compose --project-name "$COMPOSE_PROJECT_NAME" --env-file /dev/null -f compose.mysql.yaml "$@"; }
  maintenance() { MYSQL_MAINTENANCE_ACTION="$1" c --profile tools run --rm --no-deps --pull never maintenance; }
  trap 'backup_status=$?; trap - ERR; c stop api keycloak || echo "No se pudo confirmar la parada" >&2; maintenance lock || echo "No se pudo confirmar el bloqueo" >&2; exit "$backup_status"' ERR
  c stop api keycloak
  maintenance lock
  maintenance migrate
  MYSQL_EXPECT_API_READ_ONLY=1 c --profile tools run --rm --no-deps --pull never db-verify
  maintenance unlock
  c --profile tools run --rm --no-deps --pull never db-verify
  c start --wait --wait-timeout 120 keycloak api
  bash deploy/mysql/manage.sh verify
)
```

Para un **keycloak-backup** interrumpido, no conceder ni revocar permisos de la aplicación: una vez diagnosticada y corregida la causa, reanudar únicamente el contenedor existente de Keycloak (`docker compose start --wait --wait-timeout 120 keycloak`, con el mismo proyecto y entorno literal del bloque anterior) y ejecutar `manage.sh verify`. Si falla, volver a detener Keycloak y continuar el diagnóstico.

Finalmente, comprobar una operación de escritura autorizada de la aplicación y su lectura posterior. El estado `healthy` del servidor web solo comprueba contenido estático; no demuestra por sí solo acceso a MySQL, autenticación ni permisos de escritura.

## Regresión automatizada

```bash
node --test deploy/mysql/backup.test.mjs
```

La suite ejecuta el script Bash con fallos controlados en las fronteras externas. No conecta con Docker real. Para una validación de despliegue, complementar con fallos de los procesos de dump en contenedores efímeros, una recuperación fallida y la comprobación funcional posterior en el entorno de prueba autorizado.

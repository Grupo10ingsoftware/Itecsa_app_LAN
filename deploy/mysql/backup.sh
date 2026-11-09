#!/usr/bin/env bash
# Sourced by manage.sh. Recovery is confined to run_backup's subshell, never update.

backup_directory_probe='const fs = require("node:fs"), path = require("node:path");
let probe;
try {
  const directory = process.argv[1];
  if (!fs.lstatSync(directory).isDirectory()) throw Error("not a directory");
  probe = fs.mkdtempSync(path.join(directory, ".itecsa-write-check-"));
  const file = path.join(probe, "probe");
  const fd = fs.openSync(file, "wx", 0o600);
  try { fs.writeSync(fd, "backup-check"); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  if (fs.readFileSync(file, "utf8") !== "backup-check") throw Error("readback failed");
} catch {
  console.error("MYSQL_BACKUP: el destino no permite crear, escribir y leer un archivo.");
  process.exitCode = 1;
} finally {
  if (probe) try { fs.rmSync(probe, { recursive: true }); } catch {
    console.error("MYSQL_BACKUP: no se pudo retirar el archivo de comprobacion.");
    process.exitCode = 1;
  }
}'

prepare_backup_destination() {
  local directory="$1" service="$2"
  mkdir -p -- "$directory" || return $?
  chmod 700 -- "$directory" || return $?
  node -e "$backup_directory_probe" "$directory" || return $?
  # Use the same bind mount and container user as the actual dump.
  compose --profile tools run --rm --no-deps --entrypoint node "$service" \
    -e "$backup_directory_probe" /backups || return $?
}

require_backup_operational() {
  local service container health
  for service in mysql keycloak api web; do
    container="$(compose ps --status running -q "$service")" || return $?
    [[ -n "$container" && ! "$container" =~ [[:space:]] ]] \
      || fail "backup requiere $service en ejecucion; no se modifica un despliegue parcial o en mantenimiento"
    health="$(docker inspect --format '{{.State.Health.Status}}' "$container")" || return $?
    [[ "$health" == healthy ]] || fail "backup requiere $service healthy; resolver primero su estado"
  done
  require_completed_installation
  verify_release_images
  # A pre-existing maintenance lock or incompatible schema must never be undone.
  verify_database
  verify_application
}

recover_backup() {
  if (( backup_writes_attempted )); then
    backup_stage="confirmar bloqueo para recuperar"
    lock_writes || return $?
    backup_stage="restaurar permisos de migradora"
    enable_migrations || return $?
    backup_stage="verificar base con API sin escrituras"
    verify_database_read_only || return $?
    backup_stage="restaurar permisos de API"
    unlock_writes || return $?
  fi
  backup_stage="verificar integridad y permisos antes del arranque"
  verify_database || return $?
  backup_stage="reanudar servicios existentes"
  if [[ "$backup_kind" == backup ]]; then
    compose start --wait --wait-timeout 120 keycloak api || return $?
  else
    compose start --wait --wait-timeout 120 keycloak || return $?
  fi
  backup_stage="verificar disponibilidad de la aplicacion"
  # Existing verifiers may call fail/exit: contain that exit in a subshell.
  ( verify_application ) || return $?
}

protect_failed_backup_recovery() {
  local protected=1
  if [[ "$backup_kind" == backup ]]; then
    compose stop api keycloak || protected=0
    lock_writes || protected=0
  else
    compose stop keycloak || protected=0
  fi
  if (( protected )); then
    echo "MYSQL_BACKUP: recuperacion incompleta; servicios afectados detenidos. Proteccion confirmada." >&2
  else
    echo "MYSQL_BACKUP: ATENCION: no se pudo confirmar la proteccion; comprobar servicios y permisos manualmente." >&2
  fi
  echo "MYSQL_BACKUP: no repetir start ni desbloquear a ciegas; seguir deploy/mysql/BACKUP.md, seccion Recuperacion manual." >&2
}

finish_backup() {
  local original_status="$1" failed_stage="$backup_stage" recovery_status=0
  trap - EXIT INT TERM HUP
  set +e
  if (( original_status )); then
    echo "MYSQL_BACKUP: fallo en '$failed_stage' (codigo $original_status); el respaldo no esta completo." >&2
  fi
  if (( backup_stop_attempted )); then
    if recover_backup; then
      echo "MYSQL_BACKUP: servicios, integridad y permisos recuperados y verificados."
    else
      recovery_status=$?
      echo "MYSQL_BACKUP: fallo durante recuperacion en '$backup_stage' (codigo $recovery_status)." >&2
      protect_failed_backup_recovery
    fi
  fi
  if (( original_status == 0 && recovery_status == 0 )); then
    echo "MYSQL_BACKUP: respaldo $backup_kind completado y servicio verificado."
  fi
  (( original_status != 0 )) || original_status="$recovery_status"
  exit "$original_status"
}

run_backup() (
  # Do not invoke this function in an if/!/|| context: it needs errexit.
  local backup_kind="$1" backup_stage="validacion previa"
  local backup_stop_attempted=0 backup_writes_attempted=0
  trap 'finish_backup "$?"' EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  trap 'exit 129' HUP
  require_backup_operational
  if [[ "$backup_kind" == backup ]]; then
    backup_stage="validar destino del respaldo MySQL"
    prepare_backup_destination "$ROOT_DIR/data/backups/mysql" db-backup
  fi
  backup_stage="validar destino del respaldo Keycloak"
  prepare_backup_destination "$ROOT_DIR/data/backups/keycloak" keycloak-db-backup
  # Both destinations and the healthy starting state are proven before stopping.
  backup_stage="detener servicios para respaldo"
  backup_stop_attempted=1
  if [[ "$backup_kind" == backup ]]; then
    compose stop api keycloak
    backup_stage="bloquear escrituras"
    backup_writes_attempted=1
    lock_writes
    backup_stage="respaldar base de aplicacion"
    backup_database
  else
    compose stop keycloak
  fi
  backup_stage="respaldar base de Keycloak"
  backup_keycloak_database
)

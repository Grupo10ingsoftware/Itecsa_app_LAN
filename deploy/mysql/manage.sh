#!/usr/bin/env bash
set -Eeuo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/compose.mysql.yaml"
ENV_FILE="${MYSQL_DEPLOY_ENV_FILE:-$ROOT_DIR/deploy/mysql.env}"
ACTION="${1:-}"
shift || true
BACKUP_FILE=""
RESTORE_CONFIRM=""
while (( $# )); do
  case "$1" in
    --env-file)
      case "$2" in /*) ENV_FILE="$2" ;; *) ENV_FILE="$ROOT_DIR/$2" ;; esac
      shift 2 ;;
    --backup) BACKUP_FILE="$2"; shift 2 ;;
    --confirm) RESTORE_CONFIRM="$2"; shift 2 ;;
    *) echo "Argumento desconocido: $1" >&2; exit 2 ;;
  esac
done
fail() { echo "MYSQL_DEPLOY_ERROR: $*" >&2; exit 1; }
read_value() {
  local key="$1"
  awk -F= -v key="$key" '$0 !~ /^[[:space:]]*#/ && $1 == key {sub(/^[^=]*=/, ""); print; exit}' "$ENV_FILE"
}
resolve_path() {
  case "$1" in
    /*) printf '%s\n' "$1" ;;
    *) printf '%s\n' "$ROOT_DIR/${1#./}" ;;
  esac
}
[[ -n "$ACTION" ]] || fail "uso: manage.sh install|update|start|stop|verify|backup|restore"
[[ -r "$ENV_FILE" ]] || fail "no se puede leer $ENV_FILE"
PROJECT="$(read_value COMPOSE_PROJECT_NAME)"
APP_VERSION="$(read_value APP_VERSION)"
IMAGE_MODE="$(read_value DEPLOY_IMAGE_MODE)"
API_IMAGE="$(read_value API_IMAGE)"
WEB_IMAGE="$(read_value WEB_IMAGE)"
TOOLS_IMAGE="$(read_value DB_TOOLS_IMAGE)"
API_ENV_FILE="$(resolve_path "$(read_value API_ENV_FILE)")"
WEB_ENV_FILE="$(resolve_path "$(read_value WEB_ENV_FILE)")"
CERTS_DIR="$(resolve_path "$(read_value MYSQL_CERTS_DIR)")"
PRIVATE_DIR="$(resolve_path "$(read_value MYSQL_PRIVATE_DIR)")"
[[ "$PROJECT" =~ ^[a-z0-9][a-z0-9_-]{2,62}$ ]] || fail "COMPOSE_PROJECT_NAME no es valido"
[[ "$APP_VERSION" =~ ^[A-Za-z0-9._-]{1,128}$ ]] || fail "APP_VERSION no es valido"
[[ "$IMAGE_MODE" =~ ^(build|pull|preloaded)$ ]] || fail "DEPLOY_IMAGE_MODE debe ser build, pull o preloaded"
for value in "$API_IMAGE" "$WEB_IMAGE" "$TOOLS_IMAGE"; do [[ -n "$value" ]] || fail "faltan referencias de imagen"; done
[[ -r "$API_ENV_FILE" ]] || fail "falta API_ENV_FILE"
[[ -r "$WEB_ENV_FILE" ]] || fail "falta WEB_ENV_FILE"
if grep -Eq '<[^>]+>' "$ENV_FILE" "$API_ENV_FILE" "$WEB_ENV_FILE"; then fail "quedan marcadores sin reemplazar"; fi
if grep -qi aiven "$COMPOSE_FILE"; then fail "el Compose autonomo contiene una referencia a Aiven"; fi
compose() { docker compose --project-name "$PROJECT" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }
verify_release_images() {
  local api_revision tools_revision web_revision
  api_revision="$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$API_IMAGE")"
  tools_revision="$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$TOOLS_IMAGE")"
  web_revision="$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$WEB_IMAGE")"
  [[ "$api_revision" == "$APP_VERSION" ]] || fail "API_IMAGE no corresponde a APP_VERSION"
  [[ "$tools_revision" == "$APP_VERSION" ]] || fail "DB_TOOLS_IMAGE no corresponde a APP_VERSION"
  [[ "$web_revision" == "$APP_VERSION" ]] || fail "WEB_IMAGE no corresponde a APP_VERSION"
  [[ "$api_revision" == "$tools_revision" ]] || fail "API y database-tools pertenecen a versiones distintas"
}
prepare_images() {
  case "$IMAGE_MODE" in
    build)
      compose --profile tools build api web database-tools
      if ! docker image inspect "$(read_value MYSQL_IMAGE)" >/dev/null 2>&1; then compose pull mysql; fi ;;
    pull) compose --profile tools pull mysql api web database-tools ;;
    preloaded)
      for image in "$(read_value MYSQL_IMAGE)" "$API_IMAGE" "$WEB_IMAGE" "$TOOLS_IMAGE"; do
        docker image inspect "$image" >/dev/null 2>&1 || fail "imagen no cargada: $image"
      done ;;
  esac
  verify_release_images
}
ensure_tls() {
  mkdir -p "$CERTS_DIR" "$PRIVATE_DIR"
  chmod 700 "$CERTS_DIR" "$PRIVATE_DIR"
  docker run --rm --network none --user 0:0 \
    -e MYSQL_EXPECTED_HOSTNAME=itecsa-mysql \
    -e MYSQL_CERTS_PATH=/output/certs \
    -e MYSQL_PRIVATE_PATH=/output/private \
    -v "$CERTS_DIR:/output/certs" \
    -v "$PRIVATE_DIR:/output/private" \
    "$TOOLS_IMAGE" npm run mysql:generate-tls
  for file in ca.pem server-cert.pem server-key.pem; do [[ -r "$CERTS_DIR/$file" ]] || fail "no se genero $file"; done
  compose --profile tools run --rm --no-deps cert-install
}
state_exists() {
  compose --profile tools run --rm --no-deps database-tools sh -c 'test -s /run/mysql-state/instance.env'
}
start_mysql() { compose up -d --wait mysql; }
bootstrap_accounts() { MYSQL_REQUIRE_EMPTY=1 compose --profile tools run --rm --no-deps account-bootstrap; }
deploy_database() { compose --profile tools run --rm --no-deps db-deploy; }
verify_database() { compose --profile tools run --rm --no-deps db-verify; }
verify_database_read_only() { MYSQL_EXPECT_API_READ_ONLY=1 compose --profile tools run --rm --no-deps db-verify; }
lock_writes() { MYSQL_MAINTENANCE_ACTION=lock compose --profile tools run --rm --no-deps maintenance; }
enable_migrations() { MYSQL_MAINTENANCE_ACTION=migrate compose --profile tools run --rm --no-deps maintenance; }
unlock_writes() { MYSQL_MAINTENANCE_ACTION=unlock compose --profile tools run --rm --no-deps maintenance; }
backup_database() {
  mkdir -p "$ROOT_DIR/data/backups/mysql"
  chmod 700 "$ROOT_DIR/data/backups/mysql"
  compose --profile tools run --rm --no-deps db-backup
}
preflight() {
  prepare_images
  ensure_tls
  compose --profile tools config --quiet
}
install_database() {
  preflight
  if state_exists; then fail "la instalacion ya tiene identidad; usar manage.sh update"; fi
  start_mysql
  bootstrap_accounts
  deploy_database
  verify_database
  compose up -d api web
  echo "MYSQL_DEPLOY: instalacion completa para $PROJECT."
}
update_database() {
  preflight
  state_exists || fail "no existe identidad; usar manage.sh install"
  compose stop api
  start_mysql
  local maintenance_active=1
  trap 'if (( maintenance_active )); then lock_writes >/dev/null 2>&1 || true; fi' ERR
  lock_writes
  backup_database
  enable_migrations
  deploy_database
  verify_database_read_only
  unlock_writes
  if ! verify_database; then
    lock_writes
    fail "la verificacion final fallo; la API permanece detenida y sin escrituras"
  fi
  maintenance_active=0
  trap - ERR
  compose up -d api web
  echo "MYSQL_DEPLOY: actualizacion completa para $PROJECT."
}
case "$ACTION" in
  install) install_database ;;
  update) update_database ;;
  start) compose up -d mysql api web ;;
  stop) compose stop api web mysql ;;
  verify)
    preflight
    state_exists || fail "no existe identidad de instalacion"
    start_mysql
    verify_database ;;
  backup)
    preflight
    state_exists || fail "no existe identidad de instalacion"
    compose stop api
    start_mysql
    lock_writes
    backup_database
    enable_migrations
    unlock_writes
    compose up -d api ;;
  restore)
    [[ -n "$BACKUP_FILE" ]] || fail "restore requiere --backup archivo.sql"
    preflight
    start_mysql
    if ! state_exists; then bootstrap_accounts; fi
    if [[ -z "$RESTORE_CONFIRM" ]]; then
      compose --profile tools run --rm --no-deps database-tools sh -c 'cat /run/mysql-state/instance.env'
      fail "repetir con --confirm proyecto:base:UUID-del-destino"
    fi
    export MYSQL_RESTORE_FILE="$BACKUP_FILE"
    export MYSQL_RESTORE_CONFIRM="$RESTORE_CONFIRM"
    compose --profile tools run --rm --no-deps db-restore
    deploy_database
    verify_database
    compose up -d api web ;;
  *) fail "accion desconocida: $ACTION" ;;
esac

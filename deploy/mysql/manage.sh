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
[[ -n "$ACTION" ]] || fail "uso: manage.sh install|update|start|stop|verify|backup|restore|keycloak-backup|keycloak-restore|first-user"
[[ -r "$ENV_FILE" ]] || fail "no se puede leer $ENV_FILE"
PROJECT="$(read_value COMPOSE_PROJECT_NAME)"
APP_VERSION="$(read_value APP_VERSION)"
IMAGE_MODE="$(read_value DEPLOY_IMAGE_MODE)"
API_IMAGE="$(read_value API_IMAGE)"
WEB_IMAGE="$(read_value WEB_IMAGE)"
TOOLS_IMAGE="$(read_value DB_TOOLS_IMAGE)"
KEYCLOAK_IMAGE="$(read_value KEYCLOAK_IMAGE)"
PUBLIC_ORIGIN="$(read_value PUBLIC_ORIGIN)"
API_ENV_FILE="$(resolve_path "$(read_value API_ENV_FILE)")"
WEB_ENV_FILE="$(resolve_path "$(read_value WEB_ENV_FILE)")"
CERTS_DIR="$(resolve_path "$(read_value MYSQL_CERTS_DIR)")"
PRIVATE_DIR="$(resolve_path "$(read_value MYSQL_PRIVATE_DIR)")"
[[ "$PROJECT" =~ ^[a-z0-9][a-z0-9_-]{2,62}$ ]] || fail "COMPOSE_PROJECT_NAME no es valido"
[[ "$APP_VERSION" =~ ^[A-Za-z0-9._-]{1,128}$ ]] || fail "APP_VERSION no es valido"
[[ "$IMAGE_MODE" =~ ^(build|pull|preloaded)$ ]] || fail "DEPLOY_IMAGE_MODE debe ser build, pull o preloaded"
for value in "$API_IMAGE" "$WEB_IMAGE" "$TOOLS_IMAGE" "$KEYCLOAK_IMAGE"; do [[ -n "$value" ]] || fail "faltan referencias de imagen"; done
[[ "$PUBLIC_ORIGIN" =~ ^https://[A-Za-z0-9.-]+$ || "$PUBLIC_ORIGIN" =~ ^https://\[[0-9a-fA-F:]+\]$ ]] || fail "PUBLIC_ORIGIN debe ser HTTPS sin puerto ni ruta"
[[ "$PUBLIC_ORIGIN" != *localhost* && "$PUBLIC_ORIGIN" != *127.0.0.1* ]] || fail "PUBLIC_ORIGIN provisional"
for key in KEYCLOAK_DB_NAME KEYCLOAK_DB_USER KEYCLOAK_DB_PASSWORD KEYCLOAK_ADMIN_CLIENT_SECRET KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD KEYCLOAK_OPERATOR_USERNAME KEYCLOAK_OPERATOR_PASSWORD LAN_CA_FILE LAN_TLS_CERT_FILE LAN_TLS_KEY_FILE; do
  [[ -n "$(read_value "$key")" ]] || fail "falta $key"
done
for key in LAN_CA_FILE LAN_TLS_CERT_FILE LAN_TLS_KEY_FILE; do
  [[ -r "$(resolve_path "$(read_value "$key")")" ]] || fail "archivo TLS no legible: $key"
done
verify_public_certificate() {
  local host cert key ca cert_pub key_pub
  host="${PUBLIC_ORIGIN#https://}"
  host="${host#[}"
  host="${host%]}"
  cert="$(resolve_path "$(read_value LAN_TLS_CERT_FILE)")"
  key="$(resolve_path "$(read_value LAN_TLS_KEY_FILE)")"
  ca="$(resolve_path "$(read_value LAN_CA_FILE)")"
  openssl verify -CAfile "$ca" "$cert" >/dev/null || fail "la CA no valida el certificado publico"
  if [[ "$host" =~ ^[0-9.]+$ || "$PUBLIC_ORIGIN" == *'['* ]]; then
    openssl x509 -in "$cert" -noout -checkip "$host" | grep -q 'does match' || fail "el SAN no incluye la IP publica"
  else
    openssl x509 -in "$cert" -noout -checkhost "$host" | grep -q 'does match' || fail "el SAN no incluye el nombre publico"
  fi
  cert_pub="$(openssl x509 -in "$cert" -pubkey -noout | openssl pkey -pubin -outform DER | sha256sum | cut -d' ' -f1)"
  key_pub="$(openssl pkey -in "$key" -pubout -outform DER | sha256sum | cut -d' ' -f1)"
  [[ "$cert_pub" == "$key_pub" ]] || fail "clave privada y certificado publico no coinciden"
}
[[ -r "$API_ENV_FILE" ]] || fail "falta API_ENV_FILE"
[[ -r "$WEB_ENV_FILE" ]] || fail "falta WEB_ENV_FILE"
if grep -Eq '^[[:space:]]*(export[[:space:]]+)?(DB_TARGET|DB_HOST|DB_PORT|DB_USER|DB_PASSWORD|DB_NAME|DB_SSL_MODE|DB_SSL_CA_PATH|DATABASE_URL)[[:space:]]*=' "$API_ENV_FILE"; then
  fail "API_ENV_FILE contiene variables de conexion MySQL heredadas; recrear capaServidor/.env desde capaServidor/env.example"
fi
if grep -Eq '<[^>]+>' "$ENV_FILE" "$API_ENV_FILE" "$WEB_ENV_FILE"; then fail "quedan marcadores sin reemplazar"; fi
compose() {
  local -a base=(docker compose --project-name "$PROJECT" --env-file "$ENV_FILE" -f "$COMPOSE_FILE")
  if [[ "$IMAGE_MODE" == preloaded ]]; then
    case "$1" in
      up)
        shift
        "${base[@]}" up --pull never --no-build "$@"
        return ;;
      run)
        shift
        "${base[@]}" run --pull never "$@"
        return ;;
      --profile)
        if [[ "${3:-}" == run ]]; then
          local profile="$2"
          shift 3
          "${base[@]}" --profile "$profile" run --pull never "$@"
          return
        fi ;;
    esac
  fi
  "${base[@]}" "$@"
}
verify_release_images() {
  local api_revision tools_revision web_revision keycloak_revision
  api_revision="$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$API_IMAGE")"
  tools_revision="$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$TOOLS_IMAGE")"
  web_revision="$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$WEB_IMAGE")"
  keycloak_revision="$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$KEYCLOAK_IMAGE")"
  [[ "$api_revision" == "$APP_VERSION" ]] || fail "API_IMAGE no corresponde a APP_VERSION"
  [[ "$tools_revision" == "$APP_VERSION" ]] || fail "DB_TOOLS_IMAGE no corresponde a APP_VERSION"
  [[ "$web_revision" == "$APP_VERSION" ]] || fail "WEB_IMAGE no corresponde a APP_VERSION"
  [[ "$keycloak_revision" == "$APP_VERSION" ]] || fail "KEYCLOAK_IMAGE no corresponde a APP_VERSION"
  [[ "$api_revision" == "$tools_revision" ]] || fail "API y database-tools pertenecen a versiones distintas"
}
prepare_images() {
  case "$IMAGE_MODE" in
    build)
      compose --profile tools build api web database-tools keycloak
      if ! docker image inspect "$(read_value MYSQL_IMAGE)" >/dev/null 2>&1; then
        docker pull mysql@sha256:76f0358884cb92d9a086d24e5671c38048d3fef40f2588703d73eb55392d6b69
        docker tag mysql@sha256:76f0358884cb92d9a086d24e5671c38048d3fef40f2588703d73eb55392d6b69 "$(read_value MYSQL_IMAGE)"
      fi ;;
    pull)
      compose --profile tools pull api web database-tools keycloak
      docker pull mysql@sha256:76f0358884cb92d9a086d24e5671c38048d3fef40f2588703d73eb55392d6b69
      docker tag mysql@sha256:76f0358884cb92d9a086d24e5671c38048d3fef40f2588703d73eb55392d6b69 "$(read_value MYSQL_IMAGE)" ;;
    preloaded) : ;;
  esac
  [[ "$IMAGE_MODE" == preloaded ]] || verify_release_images
}
verify_preloaded_images() {
  local image
  for image in "$(read_value MYSQL_IMAGE)" "$API_IMAGE" "$WEB_IMAGE" "$TOOLS_IMAGE" "$KEYCLOAK_IMAGE"; do
    docker image inspect "$image" >/dev/null 2>&1 || fail "imagen no cargada: $image"
  done
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
backup_keycloak_database() {
  mkdir -p "$ROOT_DIR/data/backups/keycloak"
  chmod 700 "$ROOT_DIR/data/backups/keycloak"
  compose --profile tools run --rm --no-deps keycloak-db-backup
}
preflight() {
  verify_public_certificate
  prepare_images
  ensure_tls
  compose --profile tools run --rm --no-deps keycloak-trust-bootstrap
  compose --profile tools config --quiet
  PUBLIC_ORIGIN="$PUBLIC_ORIGIN" node -e 'const dns=require("node:dns").promises;dns.lookup(new URL(process.env.PUBLIC_ORIGIN).hostname).catch(e=>{console.error(e.message);process.exitCode=1})' \
    || fail "el host no resuelve PUBLIC_ORIGIN"
  compose run --rm --no-deps --entrypoint node api -e 'const dns=require("node:dns").promises;dns.lookup(new URL(process.env.FRONTEND_ORIGIN).hostname).catch(e=>{console.error(e.message);process.exitCode=1})' \
    || fail "la API no resuelve PUBLIC_ORIGIN"
}
verify_public_issuer() {
  PUBLIC_ORIGIN="$PUBLIC_ORIGIN" NODE_EXTRA_CA_CERTS="$(resolve_path "$(read_value LAN_CA_FILE)")" \
    node -e 'const expected=process.env.PUBLIC_ORIGIN+"/realms/itecsa"; fetch(expected+"/.well-known/openid-configuration",{signal:AbortSignal.timeout(10000)}).then(async r=>{if(!r.ok||((await r.json()).issuer!==expected))throw Error("issuer publico incorrecto")}).catch(e=>{console.error(e.message);process.exitCode=1})' \
    || fail "el host no llega al issuer publico por HTTPS"
  compose exec -T api node -e 'const expected=process.env.KEYCLOAK_ISSUER; fetch(expected+"/.well-known/openid-configuration",{signal:AbortSignal.timeout(10000)}).then(async r=>{if(!r.ok||((await r.json()).issuer!==expected))throw Error("issuer no coincide")}).catch(e=>{console.error(e.message);process.exitCode=1})' \
    || fail "la API no llega al mismo issuer publico por HTTPS"
}
render_realm() {
  PUBLIC_ORIGIN="$PUBLIC_ORIGIN" KEYCLOAK_ADMIN_CLIENT_SECRET="$(read_value KEYCLOAK_ADMIN_CLIENT_SECRET)" \
    node "$ROOT_DIR/deploy/keycloak/render-realm.mjs"
}
post_bootstrap() {
  PUBLIC_ORIGIN="$PUBLIC_ORIGIN" \
  KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME="$(read_value KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME)" \
  KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD="$(read_value KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD)" \
  KEYCLOAK_OPERATOR_USERNAME="$(read_value KEYCLOAK_OPERATOR_USERNAME)" \
  KEYCLOAK_OPERATOR_PASSWORD="$(read_value KEYCLOAK_OPERATOR_PASSWORD)" \
  NODE_EXTRA_CA_CERTS="$(resolve_path "$(read_value LAN_CA_FILE)")" \
    node "$ROOT_DIR/deploy/keycloak/post-bootstrap.mjs"
}
bootstrap_keycloak_database() {
  compose --profile tools run --rm --no-deps keycloak-db-bootstrap
}
start_application() {
  [[ -s "$ROOT_DIR/deploy/keycloak/private/itecsa-realm.json" ]] || fail "falta el import privado del realm"
  compose up -d --wait keycloak api web
}
install_database() {
  preflight
  if state_exists; then fail "la instalacion ya tiene identidad; usar manage.sh update"; fi
  render_realm
  start_mysql
  bootstrap_accounts
  bootstrap_keycloak_database
  deploy_database
  verify_database
  start_application
  verify_public_issuer
  post_bootstrap
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
  start_application
  verify_public_issuer
  echo "MYSQL_DEPLOY: actualizacion completa para $PROJECT."
}
if [[ "$IMAGE_MODE" == preloaded && "$ACTION" != stop ]]; then
  verify_preloaded_images
fi
case "$ACTION" in
  install) install_database ;;
  update) update_database ;;
  start) start_mysql; start_application; verify_public_issuer ;;
  stop) compose stop web api keycloak mysql ;;
  verify)
    preflight
    state_exists || fail "no existe identidad de instalacion"
    start_mysql
    verify_database
    start_application
    verify_public_issuer ;;
  backup)
    preflight
    state_exists || fail "no existe identidad de instalacion"
    compose stop api keycloak
    start_mysql
    lock_writes
    backup_database
    backup_keycloak_database
    enable_migrations
    unlock_writes
    start_application
    verify_public_issuer ;;
  keycloak-backup)
    preflight
    state_exists || fail "no existe identidad de instalacion"
    compose stop keycloak
    start_mysql
    backup_keycloak_database
    start_application
    verify_public_issuer ;;
  restore)
    [[ -n "$BACKUP_FILE" ]] || fail "restore requiere --backup archivo.sql"
    preflight
    start_mysql
    if ! state_exists; then
      bootstrap_accounts
      bootstrap_keycloak_database
    fi
    if [[ -z "$RESTORE_CONFIRM" ]]; then
      compose --profile tools run --rm --no-deps database-tools sh -c 'cat /run/mysql-state/instance.env'
      fail "repetir con --confirm proyecto:base:UUID-del-destino"
    fi
    export MYSQL_RESTORE_FILE="$BACKUP_FILE"
    export MYSQL_RESTORE_CONFIRM="$RESTORE_CONFIRM"
    compose --profile tools run --rm --no-deps db-restore
    deploy_database
    verify_database
    echo "MYSQL_DEPLOY: base de aplicacion restaurada; restaurar Keycloak antes de arrancar." ;;
  keycloak-restore)
    [[ -n "$BACKUP_FILE" ]] || fail "keycloak-restore requiere --backup archivo.sql"
    preflight
    state_exists || fail "restaurar primero la base de aplicacion"
    compose stop keycloak api web
    start_mysql
    [[ -n "$RESTORE_CONFIRM" ]] || fail "repetir con --confirm proyecto:base-keycloak:UUID-del-destino"
    export KEYCLOAK_RESTORE_FILE="$BACKUP_FILE"
    export KEYCLOAK_RESTORE_CONFIRM="$RESTORE_CONFIRM"
    compose --profile tools run --rm --no-deps keycloak-db-restore
    render_realm
    start_application
    verify_public_issuer ;;
  first-user)
    preflight
    state_exists || fail "instalar antes de crear el primer usuario"
    for key in FIRST_USER_USERNAME FIRST_USER_EMAIL FIRST_USER_FIRST_NAME FIRST_USER_LAST_NAME FIRST_USER_RUT FIRST_USER_TEMP_PASSWORD; do
      [[ -n "$(read_value "$key")" ]] || fail "falta $key"
    done
    start_application
    compose --profile tools run --rm --no-deps keycloak-first-user ;;
  *) fail "accion desconocida: $ACTION" ;;
esac

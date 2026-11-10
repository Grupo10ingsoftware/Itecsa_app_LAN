#!/usr/bin/env bash
set -Eeuo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/compose.mysql.yaml"
ENV_FILE="${MYSQL_DEPLOY_ENV_FILE:-$ROOT_DIR/deploy/mysql.env}"
ACTION="${1:-}"
shift || true
fail() { echo "MYSQL_DEPLOY_ERROR: $*" >&2; exit 1; }
case "$ACTION" in
  check|install|resume|update|start|stop|verify|backup|restore|keycloak-backup|keycloak-restore|keycloak-configure|first-user) ;;
  *) fail "uso: manage.sh check|install|resume|update|start|stop|verify|backup|restore|keycloak-backup|keycloak-restore|keycloak-configure|first-user" ;;
esac
BACKUP_FILE=""
RESTORE_CONFIRM=""
while (( $# )); do
  [[ $# -ge 2 && -n "$2" ]] || fail "falta valor para $1"
  case "$1" in
    --env-file)
      case "$2" in /*) ENV_FILE="$2" ;; *) ENV_FILE="$ROOT_DIR/$2" ;; esac
      shift 2 ;;
    --backup) BACKUP_FILE="$2"; shift 2 ;;
    --confirm) RESTORE_CONFIRM="$2"; shift 2 ;;
    *) echo "Argumento desconocido: $1" >&2; exit 2 ;;
  esac
done
command -v node >/dev/null || fail "falta Node.js 22 en este usuario; comprobar PATH (sudo no conserva NVM)"
node -e 'if(Number(process.versions.node.split(".")[0])<22)process.exit(1)' || fail "se requiere Node.js 22 o superior"
[[ -r "$ENV_FILE" ]] || fail "no se puede leer $ENV_FILE"
loaded_env="$(mktemp)"
trap 'rm -f "$loaded_env"' EXIT
node "$ROOT_DIR/deploy/mysql/environment.mjs" load "$ENV_FILE" > "$loaded_env" || exit 1
while IFS= read -r -d '' key && IFS= read -r -d '' value; do
  export "$key=$value"
done < "$loaded_env"
rm -f "$loaded_env"
read_value() { printf '%s\n' "${!1-}"; }
resolve_path() {
  case "$1" in
    /*) printf '%s\n' "$1" ;;
    *) printf '%s\n' "$ROOT_DIR/${1#./}" ;;
  esac
}
[[ -n "$ACTION" ]] || fail "uso: manage.sh install|update|start|stop|verify|backup|restore|keycloak-backup|keycloak-restore|keycloak-configure|first-user"
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
if [[ "$ACTION" != stop ]]; then
  node "$ROOT_DIR/deploy/mysql/environment.mjs" validate "$ENV_FILE" "$ACTION"
  for key in LAN_CA_FILE LAN_TLS_CERT_FILE LAN_TLS_KEY_FILE; do
    [[ -r "$(resolve_path "$(read_value "$key")")" ]] || fail "archivo TLS no legible: $key"
  done
fi
compose() {
  local -a base=(docker compose --project-name "$PROJECT" --env-file /dev/null -f "$COMPOSE_FILE")
  if [[ "$1" != build && "$1" != pull ]]; then
    case "$1" in
      up)
        shift
        "${base[@]}" up --pull never --no-build "$@"
        return $? ;;
      run)
        shift
        "${base[@]}" run --pull never "$@"
        return $? ;;
      --profile)
        if [[ "${3:-}" == run ]]; then
          local profile="$2"
          shift 3
          "${base[@]}" --profile "$profile" run --pull never "$@"
          return $?
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
  if [[ -n "$(read_value IMAGE_MANIFEST_FILE)" ]]; then
    node "$ROOT_DIR/deploy/keycloak/image-provenance.mjs" verify --env-file "$ENV_FILE" \
      --output "$(resolve_path "$(read_value IMAGE_MANIFEST_FILE)")"
  fi
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
  if [[ "$IMAGE_MODE" != preloaded ]]; then
    if [[ -n "$(read_value IMAGE_MANIFEST_FILE)" && ! -e "$(resolve_path "$(read_value IMAGE_MANIFEST_FILE)")" ]]; then
      node "$ROOT_DIR/deploy/keycloak/image-provenance.mjs" record --env-file "$ENV_FILE" \
        --output "$(resolve_path "$(read_value IMAGE_MANIFEST_FILE)")"
    fi
    verify_release_images
  fi
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
  docker run --rm --network none --user 0:0 \
    -e MYSQL_OWNER_UID="$(id -u)" -e MYSQL_OWNER_GID="$(id -g)" \
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
  local present
  present="$(compose --profile tools run --rm --no-deps database-tools sh -c 'if [ -s /run/mysql-state/instance.env ]; then echo present; else echo absent; fi')" || fail "no se pudo comprobar la identidad MySQL"
  [[ "$present" == present ]]
}
start_mysql() { compose up -d --wait mysql; }
bootstrap_accounts() { MYSQL_REQUIRE_EMPTY=1 compose --profile tools run --rm --no-deps account-bootstrap; }
preflight_database() {
  compose --profile tools run --rm --no-deps db-deploy node scripts/mysqlDeploy.mjs --check
}
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
check_configuration() {
  command -v docker >/dev/null || fail "falta Docker; instalarlo o habilitar su integracion con WSL"
  command -v openssl >/dev/null || fail "falta OpenSSL en este usuario"
  docker compose version >/dev/null 2>&1 || fail "falta el complemento Docker Compose"
  docker info >/dev/null 2>&1 || fail "Docker no responde: comprobar servicio/Docker Desktop y permisos del usuario al socket"
  compose --profile tools config --quiet
  verify_public_certificate
  PUBLIC_ORIGIN="$PUBLIC_ORIGIN" node -e 'const dns=require("node:dns").promises;dns.lookup(new URL(process.env.PUBLIC_ORIGIN).hostname.replace(/^\[|\]$/g, "")).catch(()=>{process.exitCode=1})' \
    || fail "el host no resuelve PUBLIC_ORIGIN; solicitar DNS o configurar la IP LAN acordada"
}
prepare_runtime() {
  ensure_tls
  render_realm
  compose --profile tools run --rm --no-deps runtime-install
  compose --profile tools run --rm --no-deps keycloak-trust-bootstrap
  check_container_dns
}
preflight() {
  prepare_images
  prepare_runtime
}
check_container_dns() {
  compose run --rm --no-deps --entrypoint node api -e 'const dns=require("node:dns").promises;dns.lookup(new URL(process.env.FRONTEND_ORIGIN).hostname.replace(/^\[|\]$/g, "")).catch(()=>{process.exitCode=1})' \
    || fail "la API no resuelve PUBLIC_ORIGIN; comprobar DNS accesible desde Docker"
}
installation_state() {
  compose --profile tools run --rm --no-deps install-state node scripts/mysqlInstallState.mjs "$1"
}
require_completed_installation() {
  local status
  status="$(installation_state status)"
  [[ "$status" != pending ]] || fail "instalacion incompleta; usar manage.sh resume con la misma configuracion"
  state_exists || fail "no existe identidad; usar manage.sh install"
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
    node "$ROOT_DIR/deploy/keycloak/post-bootstrap.mjs" "$@"
}
bootstrap_keycloak_database() {
  compose --profile tools run --rm --no-deps keycloak-db-bootstrap
}
start_application() {
  [[ -s "$ROOT_DIR/deploy/keycloak/private/itecsa-realm.json" ]] || fail "falta el import privado del realm"
  compose up -d --wait keycloak api web
}
verify_application() {
  verify_public_issuer || return $?
  post_bootstrap --check || return $?
  compose exec -T api node -e 'if(process.env.IDENTITY_PREPARATION_ENABLED!=="true"||process.env.AUTH_PROVIDER!=="keycloak")process.exit(1); fetch("http://127.0.0.1:3000/api/admin/identity/users",{signal:AbortSignal.timeout(10000)}).then(r=>{if(r.status!==401)throw Error("ruta de usuarios no protegida o no montada")}).catch(e=>{console.error(e.message);process.exitCode=1})' \
    || fail "Gestion de usuarios no esta habilitada y protegida en la API"
  PUBLIC_ORIGIN="$PUBLIC_ORIGIN" NODE_EXTRA_CA_CERTS="$(resolve_path "$(read_value LAN_CA_FILE)")" \
    node "$ROOT_DIR/deploy/keycloak/verify-service-client.mjs" || return $?
  if [[ -n "$(read_value IMAGE_MANIFEST_FILE)" ]]; then
    NODE_EXTRA_CA_CERTS="$(resolve_path "$(read_value LAN_CA_FILE)")" \
      node "$ROOT_DIR/deploy/keycloak/image-provenance.mjs" verify --env-file "$ENV_FILE" \
      --output "$(resolve_path "$(read_value IMAGE_MANIFEST_FILE)")" --active --http
  fi
}
install_database() {
  prepare_images
  if [[ "$ACTION" == install ]]; then
    installation_state begin
  else
    local status
    status="$(installation_state status)"
    if [[ "$status" == legacy ]]; then
      # Old installers had no receipt. Only finish Keycloak after proving the schema is complete.
      verify_database
      prepare_runtime
      start_application
      verify_public_issuer
      post_bootstrap
      verify_application
      echo "MYSQL_DEPLOY: instalacion anterior verificada y bootstrap completado."
      return
    fi
    installation_state resume
  fi
  prepare_runtime
  compose stop api web keycloak
  start_mysql
  if ! state_exists; then bootstrap_accounts; fi
  KEYCLOAK_BOOTSTRAP_RESUME=1 bootstrap_keycloak_database
  deploy_database
  verify_database
  start_application
  verify_public_issuer
  post_bootstrap
  verify_application
  installation_state complete
  echo "MYSQL_DEPLOY: instalacion completa para $PROJECT; ejecutar first-user para preparar Soporte inicial."
}
update_database() {
  prepare_images
  require_completed_installation
  # Reject known incompatibilities before changing runtime files, services or grants.
  if ! preflight_database; then
    fail "preflight de update rechazado antes del mantenimiento; no se detuvieron servicios ni se cambiaron permisos. Revisar deploy/mysql/UPDATE.md"
  fi
  prepare_runtime
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
  verify_application
  echo "MYSQL_DEPLOY: actualizacion completa para $PROJECT."
}
# Serialize mutations, including update, so backup recovery cannot undo another
# operation's maintenance. The descriptor is released when this process exits.
if [[ "$ACTION" != check && "$ACTION" != verify ]]; then
  command -v flock >/dev/null || fail "falta flock (util-linux); se requiere para serializar operaciones"
  mkdir -p "$ROOT_DIR/deploy/mysql/private"
  exec {deployment_lock_fd}>"$ROOT_DIR/deploy/mysql/private/operation.lock"
  flock -n "$deployment_lock_fd" || fail "otra operacion de despliegue esta en curso; esperar a que termine"
fi
source "$ROOT_DIR/deploy/mysql/backup.sh"
if [[ "$ACTION" != stop ]]; then check_configuration; fi
if [[ "$IMAGE_MODE" == preloaded && "$ACTION" != stop ]]; then
  verify_preloaded_images
fi
case "$ACTION" in
  check) echo "MYSQL_DEPLOY: configuracion y requisitos del host verificados; no se han iniciado servicios." ;;
  install|resume) install_database ;;
  update) update_database ;;
  start) require_completed_installation; verify_release_images; prepare_runtime; start_mysql; start_application; verify_application ;;
  stop) compose stop web api keycloak mysql ;;
  verify)
    # Inspect existing services first; do not create volumes or start the stack on a verification failure.
    for service in mysql keycloak api web; do
      [[ -n "$(compose ps --status running -q "$service")" ]] || fail "$service no esta ejecutandose; usar start o resume"
    done
    verify_release_images
    require_completed_installation
    verify_database
    verify_application
    echo "MYSQL_DEPLOY: bases, HTTPS, Keycloak y Gestion de usuarios verificados." ;;
  keycloak-configure)
    # Reconcile an existing realm without stopping containers or changing SQL grants.
    require_completed_installation
    verify_release_images
    verify_database
    verify_public_issuer
    post_bootstrap
    verify_application
    echo "MYSQL_DEPLOY: configuracion Keycloak aplicada y verificada; renovar sesion para recibir los claims." ;;
  backup|keycloak-backup) run_backup "$ACTION" ;;
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
    require_completed_installation
    verify_application
    compose --profile tools run --rm --no-deps keycloak-first-user ;;
  *) fail "accion desconocida: $ACTION" ;;
esac

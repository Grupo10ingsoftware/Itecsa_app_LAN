#!/usr/bin/env bash
set -Eeuo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${2:-$ROOT_DIR/deploy/mysql.env}"
ACTION="${1:-}"
OUT_DIR="${3:-$ROOT_DIR/data/offline}"
fail() { echo "OFFLINE_IMAGES: $*" >&2; exit 1; }
[[ -r "$ENV_FILE" ]] || fail "archivo de entorno ausente"
command -v node >/dev/null || fail "falta Node.js 22 en este usuario"
loaded_env="$(mktemp)"
trap 'rm -f "$loaded_env"' EXIT
node "$ROOT_DIR/deploy/mysql/environment.mjs" images "$ENV_FILE" > "$loaded_env" || exit 1
while IFS= read -r -d '' key && IFS= read -r -d '' value; do
  export "$key=$value"
done < "$loaded_env"
rm -f "$loaded_env"
read_value() { printf '%s\n' "${!1-}"; }
IMAGES=()
APP_VERSION="$(read_value APP_VERSION)"
[[ "$APP_VERSION" =~ ^[A-Za-z0-9._-]{1,128}$ ]] || fail "APP_VERSION invalido"
for key in MYSQL_IMAGE API_IMAGE WEB_IMAGE DB_TOOLS_IMAGE KEYCLOAK_IMAGE; do
  value="$(read_value "$key")"
  [[ -n "$value" && "$value" != *'<'* ]] || fail "falta $key"
  IMAGES+=("$value")
done
[[ "${IMAGES[0]}" != *'@'* ]] || fail "MYSQL_IMAGE necesita una etiqueta local para sobrevivir a docker image load"
verify_release_revisions() {
  local image revision
  for image in "${IMAGES[@]:1}"; do
    revision="$(docker image inspect --format '{{if index .Config "Labels"}}{{index .Config.Labels "org.opencontainers.image.revision"}}{{end}}' "$image")"
    [[ "$revision" == "$APP_VERSION" ]] || fail "imagen de otra version: $image"
  done
}
verify_inventory() {
  local image expected_id expected_revision extra current_id current_revision count=0
  local -A seen=()
  while read -r image expected_id expected_revision extra; do
    [[ -n "$image" && -n "$expected_id" && -n "$expected_revision" && -z "$extra" ]] || fail "fila de inventario invalida"
    [[ -z "${seen[$image]:-}" ]] || fail "imagen duplicada en inventario"
    local configured=0
    for expected in "${IMAGES[@]}"; do [[ "$image" != "$expected" ]] || configured=1; done
    (( configured )) || fail "imagen ajena a la configuracion"
    if [[ "$image" != "${IMAGES[0]}" && "$expected_revision" != "$APP_VERSION" ]]; then
      fail "inventario de otra version: $image"
    fi
    seen[$image]=1
    count=$((count + 1))
    current_id="$(docker image inspect --format '{{.Id}}' "$image")"
    current_revision="$(docker image inspect --format '{{if index .Config "Labels"}}{{index .Config.Labels "org.opencontainers.image.revision"}}{{end}}' "$image")"
    [[ -n "$current_revision" ]] || current_revision="-"
    [[ "$current_id" == "$expected_id" && "$current_revision" == "$expected_revision" ]] || fail "imagen cambiada: $image"
  done < "$OUT_DIR/itecsa-images.txt"
  [[ "$count" == 5 ]] || fail "el inventario debe incluir las cinco imagenes configuradas"
}
case "$ACTION" in
  pack)
    mkdir -p "$OUT_DIR"
    for image in "${IMAGES[@]}"; do docker image inspect "$image" >/dev/null || fail "imagen ausente: $image"; done
    verify_release_revisions
    docker image save -o "$OUT_DIR/itecsa-images.tar" "${IMAGES[@]}"
    (cd "$OUT_DIR" && sha256sum itecsa-images.tar > itecsa-images.sha256)
    : > "$OUT_DIR/itecsa-images.txt"
    for image in "${IMAGES[@]}"; do
      revision="$(docker image inspect --format '{{if index .Config "Labels"}}{{index .Config.Labels "org.opencontainers.image.revision"}}{{end}}' "$image")"
      [[ -n "$revision" ]] || revision="-"
      printf '%s %s %s\n' "$image" "$(docker image inspect --format '{{.Id}}' "$image")" "$revision" >> "$OUT_DIR/itecsa-images.txt"
    done
    # Extend the existing transport inventory; never replace its image-ID check.
    rm -f "$OUT_DIR/itecsa-release.json.pending"
    node "$ROOT_DIR/deploy/keycloak/image-provenance.mjs" record --env-file "$ENV_FILE" \
      --inventory "$OUT_DIR/itecsa-images.txt" --output "$OUT_DIR/itecsa-release.json.pending"
    mv "$OUT_DIR/itecsa-release.json.pending" "$OUT_DIR/itecsa-release.json"
    (cd "$OUT_DIR" && sha256sum itecsa-images.tar itecsa-images.txt itecsa-release.json > itecsa-images.sha256)
    chmod 0600 "$OUT_DIR/itecsa-release.json" "$OUT_DIR/itecsa-images.tar" "$OUT_DIR/itecsa-images.sha256" "$OUT_DIR/itecsa-images.txt"
    echo "OFFLINE_IMAGES: paquete e inventario preparados"
    ;;
  load)
    (cd "$OUT_DIR" && sha256sum -c itecsa-images.sha256)
    docker image load -i "$OUT_DIR/itecsa-images.tar"
    verify_inventory
    node "$ROOT_DIR/deploy/keycloak/image-provenance.mjs" verify --env-file "$ENV_FILE" \
      --inventory "$OUT_DIR/itecsa-images.txt" --output "$OUT_DIR/itecsa-release.json"
    echo "OFFLINE_IMAGES: todas las imagenes cargadas"
    ;;
  verify)
    (cd "$OUT_DIR" && sha256sum -c itecsa-images.sha256)
    verify_inventory
    node "$ROOT_DIR/deploy/keycloak/image-provenance.mjs" verify --env-file "$ENV_FILE" \
      --inventory "$OUT_DIR/itecsa-images.txt" --output "$OUT_DIR/itecsa-release.json"
    echo "OFFLINE_IMAGES: checksum y versiones verificados"
    ;;
  *) fail "uso: offline-images.sh pack|load|verify [deploy/mysql.env] [directorio]" ;;
esac

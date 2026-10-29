#!/usr/bin/env bash
set -Eeuo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${2:-$ROOT_DIR/deploy/mysql.env}"
ACTION="${1:-}"
OUT_DIR="${3:-$ROOT_DIR/data/offline}"
fail() { echo "OFFLINE_IMAGES: $*" >&2; exit 1; }
[[ -r "$ENV_FILE" ]] || fail "archivo de entorno ausente"
read_value() {
  awk -F= -v key="$1" '$0 !~ /^[[:space:]]*#/ && $1 == key {sub(/^[^=]*=/, ""); print; exit}' "$ENV_FILE"
}
IMAGES=()
for key in MYSQL_IMAGE API_IMAGE WEB_IMAGE DB_TOOLS_IMAGE KEYCLOAK_IMAGE; do
  value="$(read_value "$key")"
  [[ -n "$value" && "$value" != *'<'* ]] || fail "falta $key"
  IMAGES+=("$value")
done
[[ "${IMAGES[0]}" != *'@'* ]] || fail "MYSQL_IMAGE necesita una etiqueta local para sobrevivir a docker image load"
case "$ACTION" in
  pack)
    mkdir -p "$OUT_DIR"
    for image in "${IMAGES[@]}"; do docker image inspect "$image" >/dev/null || fail "imagen ausente: $image"; done
    docker image save -o "$OUT_DIR/itecsa-images.tar" "${IMAGES[@]}"
    (cd "$OUT_DIR" && sha256sum itecsa-images.tar > itecsa-images.sha256)
    : > "$OUT_DIR/itecsa-images.txt"
    for image in "${IMAGES[@]}"; do
      revision="$(docker image inspect --format '{{if .Config.Labels}}{{index .Config.Labels "org.opencontainers.image.revision"}}{{end}}' "$image")"
      [[ -n "$revision" ]] || revision="-"
      printf '%s %s %s\n' "$image" "$(docker image inspect --format '{{.Id}}' "$image")" "$revision" >> "$OUT_DIR/itecsa-images.txt"
    done
    chmod 0600 "$OUT_DIR/itecsa-images.tar" "$OUT_DIR/itecsa-images.sha256" "$OUT_DIR/itecsa-images.txt"
    echo "OFFLINE_IMAGES: paquete e inventario preparados"
    ;;
  load)
    (cd "$OUT_DIR" && sha256sum -c itecsa-images.sha256)
    docker image load -i "$OUT_DIR/itecsa-images.tar"
    for image in "${IMAGES[@]}"; do docker image inspect "$image" >/dev/null || fail "imagen no cargada: $image"; done
    echo "OFFLINE_IMAGES: todas las imagenes cargadas"
    ;;
  verify)
    (cd "$OUT_DIR" && sha256sum -c itecsa-images.sha256)
    while read -r image expected_id expected_revision; do
      current_id="$(docker image inspect --format '{{.Id}}' "$image")"
      current_revision="$(docker image inspect --format '{{if .Config.Labels}}{{index .Config.Labels "org.opencontainers.image.revision"}}{{end}}' "$image")"
      [[ -n "$current_revision" ]] || current_revision="-"
      [[ "$current_id" == "$expected_id" && "$current_revision" == "$expected_revision" ]] || fail "imagen cambiada: $image"
    done < "$OUT_DIR/itecsa-images.txt"
    echo "OFFLINE_IMAGES: checksum y versiones verificados"
    ;;
  *) fail "uso: offline-images.sh pack|load|verify [deploy/mysql.env] [directorio]" ;;
esac

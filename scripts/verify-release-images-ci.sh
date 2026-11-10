#!/usr/bin/env bash
set -Eeuo pipefail
# CI-only: images are already built, and no deployment credentials are required.
[[ "${RELEASE_SHA:-}" =~ ^[a-f0-9]{40}$ ]] || { echo 'RELEASE_SHA invalido' >&2; exit 1; }
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mysql_base="$(node -e 'console.log(require(process.argv[1]).mysql)' "$root/deploy/image-bases.json")"
docker pull "$mysql_base"
docker tag "$mysql_base" itecsa-mysql:ci
manifest_env="$(mktemp)"
trap 'rm -f "$manifest_env"' EXIT
cat > "$manifest_env" <<ENV
APP_VERSION=$RELEASE_SHA
MYSQL_IMAGE=itecsa-mysql:ci
API_IMAGE=itecsa-api:ci
WEB_IMAGE=itecsa-web:ci
DB_TOOLS_IMAGE=itecsa-db-tools:ci
KEYCLOAK_IMAGE=itecsa-keycloak:ci
ENV
receipt="${IMAGE_RECEIPT_OUTPUT:-$root/data/offline/itecsa-release.json}"
node "$root/deploy/keycloak/image-provenance.mjs" record --env-file "$manifest_env" --output "$receipt"
node "$root/deploy/keycloak/image-provenance.mjs" verify --env-file "$manifest_env" --output "$receipt"

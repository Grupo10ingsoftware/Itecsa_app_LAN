#!/bin/sh
set -eu

provider="${VITE_AUTH_PROVIDER:-keycloak}"
case "$provider" in
    keycloak) required="VITE_KEYCLOAK_URL VITE_KEYCLOAK_REALM VITE_KEYCLOAK_CLIENT_ID VITE_KEYCLOAK_AUDIENCE" ;;
    *) echo "Proveedor de autenticacion invalido" >&2; exit 1 ;;
esac
for name in $required VITE_API_BASE_URL; do
    value="$(printenv "$name" || true)"
    if [ -z "$value" ]; then
        echo "Falta variable publica obligatoria: $name" >&2
        exit 1
    fi
done

umask 022
# jq escapes quotes, backslashes and newlines; never use raw envsubst for JavaScript.
{
    printf 'window.__ITECSA_CONFIG__ = '
    jq -cn --arg provider "$provider" '{authProvider: $provider, keycloakUrl: env.VITE_KEYCLOAK_URL, keycloakRealm: env.VITE_KEYCLOAK_REALM, keycloakClientId: env.VITE_KEYCLOAK_CLIENT_ID, keycloakAudience: env.VITE_KEYCLOAK_AUDIENCE, apiBaseUrl: env.VITE_API_BASE_URL}'
    printf ';\n'
} > /tmp/runtime-config.js.tmp
mv /tmp/runtime-config.js.tmp /tmp/runtime-config.js

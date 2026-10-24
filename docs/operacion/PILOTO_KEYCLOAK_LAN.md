# Piloto Keycloak en LAN

Este piloto usa `localhost:5173`, la API en `localhost:3000`, el túnel Keycloak en `127.0.0.1:18080` y la base MySQL/Aiven existente. El túnel debe permanecer abierto mientras se usa la aplicación. La cuenta habilitada es `prueba.producción`, vinculada explícitamente a la fila local `Usuario Prueba`.

## Arranque

Desde la máquina que abre el navegador, iniciar el túnel SSH en una terminal independiente:

```bash
ssh -N -L 127.0.0.1:18080:10.20.30.10:8080 pivotadmin@100.105.202.35
```

El navegador usa `VITE_KEYCLOAK_URL=http://127.0.0.1:18080`. El token emitido debe declarar `iss=http://127.0.0.1:18080/realms/itecsa`; la API valida ese issuer exacto y consulta las claves desde `KEYCLOAK_JWKS_URI=http://host.docker.internal:18080/realms/itecsa/protocol/openid-connect/certs`. La URL interna es solo para llegar al mismo túnel desde Docker; no sustituye el issuer público del token. Mantener `AUTH_PROVIDER=keycloak`, `KEYCLOAK_AUDIENCE=https://api.itecsa.local` y `KEYCLOAK_CLIENT_ID=itecsa-web` en la API.

Comprobar el túnel y recrear los contenedores tras editar código o variables:

```bash
curl -f http://127.0.0.1:18080/realms/itecsa/.well-known/openid-configuration
docker compose up -d --build api web
docker compose ps
```

La gestión de usuarios y la recuperación de credenciales permanecen fuera del piloto Keycloak. Auth0 sigue disponible al seleccionar `AUTH_PROVIDER=auth0` en la API y `VITE_AUTH_PROVIDER=auth0` en la SPA, con sus variables correspondientes. Este piloto no acredita una instalación autónoma en la LAN porque aún depende de Aiven y del túnel.

## Reversión del vínculo

Si falla el piloto, restablecer las variables anteriores y recrear `api` y `web`. Después de comprobar que el `id_usuario` respaldado sigue identificando exclusivamente a `Usuario Prueba` y que su `id_auth0` sigue siendo `4a32aa57-6639-4a32-aa61-8eb6f5c45008`, devolver **solo** esa columna a `NULL`. No alterar otras filas ni el PIN.

# Integración de Keycloak Ubuntu en el desarrollo habitual

Actualizado: 25-10-2026, rama `POC/KEYCLOAK`, base `ad41e54`. La instrucción más reciente del equipo reemplaza la entrega aislada inicial de 06.5: retirar los laboratorios, no crear nuevas copias y aplicar la configuración comprobada al entorno habitual. No se realiza commit ni push en esta tarea.

## Entorno vigente

| Elemento | Configuración |
|---|---|
| Aplicación habitual | **http://127.0.0.1:5173** |
| API habitual | `http://127.0.0.1:3000/api` |
| Contenedores | `itecsa_app_lan-api-1`, `itecsa_app_lan-web-1`, desde `compose.yaml` |
| Base | Aiven existente, `mydb`, conexión TLS y CA existentes; no se sustituye por otra base |
| Keycloak | Ubuntu, 26.8.1, instalación `/home/itecsaadmin/servicios/keycloak-26.8.1`, H2 existente |
| Acceso local a Keycloak | Túnel existente, puerto Windows 18080 hacia `10.20.30.10:8080` |
| Realm / issuer | `itecsa` / `http://127.0.0.1:18080/realms/itecsa` |
| SPA existente | `itecsa-web` |
| Cliente administrativo existente | `itecsa-backend-admin`; secreto solo en el `.env` habitual del backend |
| Roles / capacidades | `itecsa-api-v1`, nueve roles; `itecsa-api`, 25 capacidades |
| Audience | `https://api.itecsa.local` |
| Transporte desde Docker | `host.docker.internal:18080` para JWKS y administración; conserva el issuer público |

Se unifican los orígenes del navegador en **127.0.0.1**, en lugar de mezclar frontend `localhost` y Keycloak `127.0.0.1`. La URL depende del túnel y sirve para este computador; no constituye todavía una dirección compartida para toda la LAN. No se cambió el hostname global ni se reinstaló Keycloak.

## Configuración aplicada y justificación

1. Se actualiza el cliente **existente** `itecsa-web`: público, Authorization Code + PKCE S256, sin implicit/password grant ni cuenta de servicio. Redirects, Web Origins y postlogout apuntan a `http://127.0.0.1:5173`. Access token de 300 segundos; el valor de 60 segundos pertenecía exclusivamente a las pruebas de expiración.
2. Se aplican los tres mappers comprobados: rol en `resource_access.itecsa-api-v1.roles`, capacidades en `permissions` y audience de API. Se conservan los composites derivados de `shared/keycloakAuthorization.js`. Full Scope Allowed queda desactivado, con scope mappings explícitos para los nueve roles y las 25 capacidades. El backend sigue intersectando capacidades con el rol aprobado.
3. Se reutiliza `itecsa-backend-admin` para client credentials. Sus asignaciones y scopes explícitos quedan limitados a `query-users`, `view-users`, `manage-users`, `view-clients` de realm-management. Se retiran otros grants directos y Full Scope Allowed; no se concede realm-admin. Esta credencial es del servidor, no del usuario humano Soporte.
4. Se conserva el marcador de operación `itecsa_provision_id` en User Profile, administrable únicamente por backend/admin; permite la conciliación de fase 06 sin adoptar identidades por correo o nombre.
5. Se actualizan **en su ubicación actual** los `.env` ignorados por Git: cliente real, issuer, audience, cliente de roles, transporte interno y API/origen local. Se obtiene el secreto del cliente técnico existente y se escribe directamente en el `.env` backend, sin publicarlo ni crear otro archivo de credenciales. No se rotan los secretos de PIN o de Aiven.
6. `Server` monta el servicio ya implementado de preparación bajo `/api/admin/identity` cuando `AUTH_PROVIDER=keycloak` e `IDENTITY_PREPARATION_ENABLED=true`. La pantalla Soporte consume esa ruta normal con `VITE_IDENTITY_PREPARATION=true`; desaparece el entry point alternativo de integración. Mantiene autenticación, capacidad, estado del actor, PIN y destinos ordinarios de seis roles.
7. El transporte administrativo Docker se permite explícitamente en `development` y `test`; conserva las validaciones de origen/protocolo y sigue rechazado en producción. No se usa `APP_ENV=test` para ejecutar la aplicación habitual ni se desactiva TLS de Aiven.
8. Se aplica en Aiven únicamente la migración aditiva `202610250001_keycloak_identity_preparation`: correo nullable, `ExternalIdentity`, `IdentityProvisionOperation`. Antes se comprobó que ambas tablas faltaban. La CLI con `DATABASE_URL` no conectó y no aplicó cambios; se ejecutó el mismo SQL mediante la conexión TLS del adaptador de la aplicación y se registró el checksum en `_prisma_migrations`. El historial previo estaba vacío: esto **no acredita una línea base reconciliada de todas las migraciones antiguas** y no habilita ejecutar a ciegas `migrate deploy` o `db push`.
9. `Usuario.id_auth0` se declara nullable en Prisma para corresponder al esquema real existente, donde dos cuentas Keycloak ya tenían ese campo nulo. No se sobrescriben sus identificadores históricos ni la columna preexistente `id_keycloak`.
10. Se registran tres vínculos `ExternalIdentity` usando exclusivamente los UUID ya presentes en `Usuario.id_keycloak`, con comprobación de PK y rol dentro de una transacción. Se asignan esos mismos roles al cliente canónico de Keycloak. No se crean personas, contraseñas o roles privilegiados nuevos.

| PK local | UUID ya existente | Rol local conservado | Estado conservado |
|---|---|---|---|
| 22 | `4a32aa57-6639-4a32-aa61-8eb6f5c45008` | Soporte | Activo; Keycloak habilitado |
| 23 | `ae9d71cb-77f1-4c8f-989c-a606be9e7742` | Administrador Produccion | Pendiente rol; Keycloak deshabilitado |
| 24 | `852ea39b-009a-4ece-919f-2d73d6c068e0` | Operario Produccion | Pendiente rol; Keycloak deshabilitado |

Los antiguos usuarios con `auth0|...` se conservan. No se convierten automáticamente en cuentas Keycloak. El nuevo Soporte tiene las cinco capacidades aprobadas de cuentas, perfil, PIN y mensajes; su rol no concede Kanban ni administración comercial. No se reinterpreta el Soporte técnico histórico de Auth0 como Desarrollador sin correspondencia explícita de personas.

## Laboratorios retirados

- Docker: `itecsa-phase065-web`, `itecsa-phase065-api`, `itecsa-phase065-mysql`, volumen `itecsa-phase065-mysql-data` y red `itecsa-phase065-network`. Se comprobaron las etiquetas de propiedad antes de eliminarlos. Se conservan los contenedores/red habituales y las imágenes compartidas.
- Keycloak real: nueve cuentas `p065-role-*`, seis `p065-prepared-ordinary-*`, `p065-prepared-visible`, clientes `itecsa-web-integration-065` e `itecsa-integration-065-admin`. Los tres usuarios anteriores conservan UUID, username y estado enabled.
- Ubuntu: directorio `restore` con la instalación/H2 restaurados para laboratorio; tooling, diarios de sincronización y runtime con credenciales sintéticas dentro del directorio privado de 06.5. Se conserva exclusivamente el respaldo frío anterior `installation.tar`, su manifest y logs de respaldo/recuperación en `/home/itecsaadmin/respaldos-keycloak/fase065-20261025T062510Z`; no se creó otro respaldo ni se detuvo el servicio real en esta tarea.
- Windows: runtime privado `itecsa-phase065-ddc8a35e02d54551a783a8b395c8f4d2`, temporales de fases 00–04 y perfil Brave de diagnóstico `itecsa-auth-diagnostic-f04e05134f884ef0afebfa67059051f4`. Se validaron las rutas absolutas y se cerraron únicamente procesos del perfil diagnóstico propio, conservando el navegador habitual.
- Repositorio: ocho helpers no versionados del despliegue alternativo Ubuntu (`access`, `api`, `app`, `browser`, `verify`, `backup`, `sync` y su test). Se conserva el código funcional desarrollado y las pruebas históricas versionadas; no se ejecutan nuevamente.

La configuración vigente queda descrita en `scripts/keycloak-ubuntu-contract.mjs`, sin importar fixtures. `scripts/keycloak-ubuntu-configure.mjs --apply` permite reaplicar sobre los **clientes ya existentes**; solicita el password administrativo sin eco y no contiene credenciales. Verifica la política existente, actualiza los clientes/.env y retira los nombres sintéticos conocidos. Está acotado a este realm y los tres vínculos UUID inspeccionados, no es un importador genérico para otro servidor.

## Comprobación y límites

Se reconstruyen y recrean exclusivamente los dos servicios habituales para incorporar el código. Se realizan las comprobaciones mínimas de arranque/conectividad del despliegue, sin repetir suites, crear cuentas de prueba ni iniciar otro MySQL/Keycloak.

Resultado observado: frontend, `/api/health/live` y discovery del realm respondieron **HTTP 200**. La consulta administrativa desde el contenedor API habitual funcionó con `itecsa-backend-admin`: tres usuarios anteriores y cero sintéticos. El mismo contenedor confirmó `APP_ENV=development`, Aiven con `DB_SSL_MODE=required`, las dos tablas de identidad, tres vínculos y **cero** operaciones de preparación. Docker contiene únicamente los dos contenedores habituales; no quedan volúmenes ni red del laboratorio. Los `.env` siguen ignorados por Git. No se ejecutaron suites funcionales nuevas.

La evidencia anterior de 06.5 comprendía nueve roles, operaciones con JWT/PIN/SQL, Brave, recarga, renovación y logout; pertenecía al entorno aislado retirado. No se presenta como una nueva prueba completa de la aplicación habitual. El incidente original `refresh_token=undefined` exige distinguir ese comportamiento anterior de los tokens/sesiones actuales; no se atribuye una causa universal a otros dispositivos.

La preparación habilitada **no entrega credenciales ni activa cuentas**: esos flujos siguen pendientes de fase 07. El resto de endpoints administrativos heredados y recuperación de password conserva su gate 503 para Keycloak. Las cuentas deshabilitadas no se activan como efecto de integrar mappers. Aiven, Resend/PIN y la fuente Manager mantienen sus dependencias externas; no se declara funcionamiento integral offline. La migración histórica de las personas Auth0, el resolver para sus vínculos y las decisiones privilegiadas futuras no quedan completados por esta configuración.

Para abrir el desarrollo habitual, mantener activo el túnel y visitar **http://127.0.0.1:5173**, iniciando una sesión nueva para obtener los claims del cliente actualizado. No usar los puertos retirados 5174/3001.

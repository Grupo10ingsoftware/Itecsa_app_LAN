# Cierre técnico de feat/docker-keycloak

Fecha: 29-10-2026 (America/Santiago). Veredicto: **PENDING LAN ACCEPTANCE**.

La rama está integrada con el `main` consultado y las verificaciones locales
pasan. No se declara aceptada una instalación integrada ni el servidor definitivo:
en esta sesión no hubo un daemon Docker accesible, configuración TLS de destino
ni acceso de operación a una LAN de aceptación. No se iniciaron contenedores,
restauraron datos, cambiaron credenciales ni eliminaron volúmenes.

## Estado de implementación y auditoría

Al comenzar ya estaban versionados el Dockerfile Keycloak, realm reproducible,
bootstrap administrativo, base MySQL independiente, primer usuario, respaldos,
restauración, proxy HTTPS y paquete de cinco imágenes. Se conservaron Keycloak
26.8.1, los cinco clientes, nueve roles, 25 capacidades, PKCE, HTTPS, políticas y
el origen único. No se rehízo esa implementación.

Se leyeron las instrucciones de `AGENTS.md` desde `main` antes de integrarlo,
las dos guías de operación, README histórico, plantilla de entorno, Compose,
gestor y componentes Keycloak. `shared/keycloakAuthorization.js` reexporta el
contrato canónico de `shared/authorization.js`. El render y bootstrap conservan
esa composición; la cuenta técnica recibe los cuatro roles administrativos y
los scopes explícitos. El primer usuario usa `Soporte`, `UPDATE_PASSWORD` y
una transacción para `Usuario`/`ExternalIdentity` con compensación remota.

`docs/operacion/KEYCLOAK_LAN_OFFLINE_ARQUITECTURA.md` no existe en esta copia.
Tampoco se localizaron los dos handoffs históricos mencionados por la guía.
Se utilizó la documentación versionada y `PENDIENTES_KEYCLOAK.md` como antecedente;
sus túneles y VM de desarrollo no constituyen requisitos del Compose autónomo.

Problemas corregidos:

1. `offline-images.sh verify` aceptaba un inventario vacío o incompleto y no
   comprobaba su correspondencia exacta con las cinco referencias configuradas.
   Ahora rechaza filas incompletas, duplicados, referencias ajenas, omisiones e
   identidades/revisiones distintas. `load` utiliza la misma verificación tras
   cargar el TAR. Los tests ejecutan Bash con Docker simulado y SHA-256 real.
2. `post-bootstrap.mjs` no recuperaba una interrupción entre crear el operador
   permanente y asignarle `admin`. Ahora autentica esa cuenta, completa el rol
   faltante utilizando el administrador temporal y obtiene un token nuevo que
   refleje el rol. Comprueba acceso antes de retirar al temporal. Se prueban el
   fallo intermedio, reintento, tercera ejecución sin nuevas concesiones y
   rechazo de credenciales permanentes sin retirar acceso temporal.
3. La prueba de actualización MySQL aún esperaba el comando de arranque previo
   a Keycloak. Ahora verifica `start_application` y comprobación del issuer.
4. La prueba de layout aún esperaba un contador del historial eliminado en el
   código existente. Ahora espera el enlace al detalle y conserva la comprobación
   de búsqueda, sin modificar la interfaz ni las funciones integradas desde main.
5. La prueba de historial de migraciones dependía del directorio de ejecución y
   contaba directorios vacíos que Git no versiona. Ahora resuelve su ruta desde
   el módulo y comprueba los archivos SQL existentes, manteniendo todos los hashes
   esperados. Los 16 SQL locales tenían CRLF a pesar de `.gitattributes`; se
   restauraron a LF. El índice confirmó que no cambió ningún SQL versionado.
6. La guía daba a entender que el comando borraba la contraseña temporal del
   archivo de entorno. Se aclaró que debe hacerlo el operador.

## Evidencia ejecutada en esta sesión

Entorno local: Windows/PowerShell, Node v22.19.0, npm 10.9.3, Git Bash y
Docker Compose v5.6.1. Los tests utilizan fixtures; no conectan una instancia
productiva. Los logs completos locales están en `tmp/keycloak-validation/`
(ignorados por Git); esta tabla conserva comandos y resultados de la entrega.

| Prueba | Resultado | Evidencia | Entorno |
| --- | --- | --- | --- |
| Realm, recuperación bootstrap e inventario offline | PASS | `node --test deploy/keycloak/*.test.mjs`: 18/18; `keycloak-final.log` | Local, HTTP/Docker simulados |
| Backend: autorización, JWT, usuarios, PIN, MySQL, Kanban, programación, mensajes y demás regresiones | PASS | `node --test capaServidor/test/*.test.js capaServidor/src/modules/auth/service/*.test.js capaServidor/src/modules/users/service/*.test.js`: 387/387; `backend-final.log` | Local, fixtures |
| Firma, issuer, audiencia, expiración y permisos | PASS | `phase1Security.test.js`, incluido arriba, usa JWT firmados y rechaza firma/issuer/audiencia incorrectos y tokens vencidos | Local, emisor de prueba |
| Frontend: sesión, renovación, logout, PIN, layout, Kanban, mensajes y demás regresiones | PASS | Desde `capaVista`: `npm.cmd test -- --reporter=dot`: 53 archivos, 417/417; `frontend-final.log` | Local, jsdom/dobles SDK |
| Build frontend | PASS | Desde `capaVista`: `npm.cmd run build`; Vite completó; `build.log` | Local |
| Lint frontend | PASS | Desde `capaVista`: `npm.cmd run lint`; sin errores; `lint.log` | Local |
| Sintaxis de ambos scripts shell | PASS | `bash -n deploy/mysql/manage.sh` y `bash -n deploy/keycloak/offline-images.sh` | Local, Git Bash |
| Esquema Compose sin resolver archivos privados | PASS | `docker compose --env-file deploy/mysql.env.example -f compose.mysql.yaml config --no-env-resolution --quiet` | Local |
| Compose con resolución completa de entorno | BLOCKED | Comando original `config --quiet`: falta `capaServidor/.env.mysql.docker` | Local |
| Disponibilidad de Docker | BLOCKED | `docker info --format '{{.ServerVersion}}'`: pipe `dockerDesktopLinuxEngine` ausente, también fuera del sandbox | Local |
| Instalación limpia: TLS, DNS, bases independientes, import y servicios | BLOCKED | No se ejecutó `manage.sh install`; requiere daemon y laboratorio HTTPS descartable | Laboratorio pendiente |
| Login/logout y tokens contra frontend/API/Keycloak reales | BLOCKED | No hay instancia integrada accesible; los tests unitarios no sustituyen este flujo | Laboratorio/LAN pendientes |
| first-user, cambio obligatorio, PIN, recuperación administrativa y fuerza bruta reales | BLOCKED | Requiere instalación vacía y cuentas exclusivamente de prueba | Laboratorio/LAN pendientes |
| Reinicio, import existente y update conservando usuarios | BLOCKED | No se ejecutaron comandos de ciclo de vida | Laboratorio/LAN pendientes |
| Backup consistente y restore conjunto en destino vacío | BLOCKED | No se produjeron ni restauraron respaldos en esta sesión | Laboratorio/LAN pendientes |
| Pack/load/verify de imágenes reales, instalación preloaded sin Internet | BLOCKED | Los tests de script usan un ejecutable Docker simulado, no cinco imágenes reales | Laboratorio/LAN pendientes |
| Uso desde otro equipo de LAN y confianza CA en navegador | NOT RUN | Sin acceso al servidor y segundo cliente definitivos | LAN |
| Revisión de dependencias externas operativas | PASS | Compose autónomo/proxy y configuración runtime usan origen LAN y MySQL local; no se encontró dependencia activa de Auth0, Aiven, Tailscale o CDN en ese despliegue | Inspección estática, no aislamiento de red |
| Integridad del diff | PASS | `git diff --check`; sin cambios SQL ni modificaciones funcionales adicionales de main | Local |

Resultados iniciales, conservados como diagnóstico: backend 385/387 desde la
raíz (expectativa de arranque obsoleta y ruta de migraciones); después 386/387
desde capaServidor (directorios vacíos). Una ejecución enfocada reveló CRLF en
los SQL, corregido conforme al atributo versionado. Frontend inicial 416/417
(contador retirado). Los resultados finales anteriores reemplazan esos fallos.

## Evidencia histórica, no reproducida aquí

La guía `KEYCLOAK_LAN_OFFLINE_DESPLIEGUE.md` registra import en Keycloak 26.8.1,
reemplazo del administrador temporal, JDBC/TLS, bases separadas, reinicio,
backup/restore de Keycloak y paquete de cinco imágenes. Son afirmaciones del
laboratorio anterior, no PASS propios de esta ejecución. El README registra
también pruebas del tema y confirmación manual del login/logout en la VM antigua.
No se usó esa confirmación como aceptación del despliegue autónomo.

## Integración Git

- Rama: `feat/docker-keycloak`; árbol inicialmente limpio.
- Commit inicial: `eb44c5d`.
- `git fetch origin` completado; `origin/main`: `b5641c4`.
- Integración sin conflictos: `5c98573` (merge no destructivo de `origin/main`).
- Se incorporaron `5a3679d` y `b5641c4`: programación obligatoria antes de
  producción, navegación mensaje/pedido, layout, tests y `AGENTS.md` (25 archivos).
- Commit final de código validado: `02f1a9f`.
- Este informe se registra en un commit documental posterior. El HEAD exacto
  de entrega se obtiene con `git rev-parse HEAD` y se comunica al entregar.
- No se hizo merge a `main`, rebase, reset, force-push ni publicación remota.

Archivos corregidos en `02f1a9f`:

- `deploy/keycloak/offline-images.sh` y nuevo `offline-images.test.mjs`.
- `deploy/keycloak/post-bootstrap.mjs` y nuevo `post-bootstrap.test.mjs`.
- `capaServidor/test/mysqlDeployment.test.js`.
- `capaServidor/test/mysqlLabMigrationHistory.test.js`.
- `capaVista/src/shared/components/layout/PageMigration.test.jsx`.
- `docs/operacion/KEYCLOAK_LAN_OFFLINE_DESPLIEGUE.md`.

## Pendientes para operación y revisión

No quedan fallos conocidos en las suites ejecutadas. Los cambios administrativos
y offline todavía deben repetirse contra Keycloak/MySQL/Docker reales. La revisión
de scripts no demuestra idempotencia completa ante fallos de red o concurrencia:
`install` rechaza una identidad existente, la creación de cuenta MySQL rechaza una
cuenta previa y `first-user` rechaza usuarios ya existentes. Si falla la compensación
remota de `first-user`, se necesita conciliación supervisada antes de reintentar.
No usar borrado de volúmenes ni rotación de secretos como mecanismo de recuperación.

El operador necesita proporcionar un Ubuntu descartable con Docker/Compose,
capacidad de disco/CPU/memoria suficiente, cinco imágenes de la misma release,
archivos privados de configuración y un origen HTTPS resoluble desde host,
API y navegadores. El certificado debe incluir SAN correcto y su CA ser confiable.
Los secretos deben entregarse por el mecanismo privado habitual, fuera de logs/chat.

Sobre ese entorno se debe ejecutar la secuencia de la guía normativa: instalación,
primer usuario y cambio de clave, PIN y recuperación, autorización por rol, renovación
y logout, persistencia/update, backup conjunto, restore de ambas bases en un segundo
destino vacío con confirmación de UUID y prueba preloaded sin Internet. Registrar
los comandos, resultado, IDs de imágenes y checksums sin tokens, PIN ni contraseñas.
Finalmente repetir aceptación desde otro equipo en la LAN definitiva. Un laboratorio
descartable no sustituye esa última aceptación.

La rama puede revisarse con estos límites explícitos; este informe no autoriza
despliegue productivo.

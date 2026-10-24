# Evidencia de las fases 00 y 01

Fecha: **24-10-2026**. Estado: **terminadas técnicamente para revisión, no aprobadas por el equipo todavía**. Fase 02 no iniciada. Base: `34dfd7c09f876285c1ea84d9020a44a1414ba468`. Decisiones y matriz: [07](07_DECISIONES_APROBADAS.md). Pruebas acumuladas: [09](09_MATRIZ_PRUEBAS_ACUMULADAS.md).

## Fase 00: procedencia y protección

| Campo | Evidencia observada antes de cambios funcionales |
|---|---|
| Carpeta empresarial | `D:\Universidad\Ing software II\Itecsa_app_LAN` |
| Rama / HEAD | `POC/KEYCLOAK` / `34dfd7c09f876285c1ea84d9020a44a1414ba468` |
| Remoto origin fetch/push | `https://github.com/Grupo10ingsoftware/Itecsa_app_LAN.git` |
| Git propio / upstream | Directorio `.git` empresarial; seguimiento `origin/POC/KEYCLOAK` |
| Estado inicial de este encargo | Sin modificaciones versionadas; solo los cinco documentos 01–05 de la tarea anterior sin seguimiento |
| Snapshot | 566 archivos versionados + 5 documentos previos = 571 hashes SHA-256 |
| Universitario (solo lectura) | Carpeta hermana `itecsa-app`, rama `dev`, HEAD `88bcb972c29e34a9d92cc15fb584fc4211af265f`, remoto propio `Grupo10ingsoftware/itecsa-app` |
| Estado universitario observado | Solo auditoría maestra no versionada; sin modificaciones versionadas |
| Procedencia histórica | Árbol raíz empresarial `21ac28fa1f3ea366ba1dea653740c6ca4952ca5e` coincide en 552 rutas/blobs con la revisión universitaria indicada |
| Protección aplicada | Sin cambios Git, commits, pushes, instalación de dependencias, despliegues o escritura en universitario |

El snapshot temporal de esta sesión está en `C:\Users\OVERMI~1\AppData\Local\Temp\itecsa-fase00-01-w4efhJ\baseline.json`. Su ausencia futura no impide revisar el diff contra el commit ni volver a ejecutar los comandos de pruebas de este informe. Al cierre se compararon los 571 hashes: **570 iguales, solo `shared/authorization.js` cambiado, ningún archivo eliminado**. Esto incluye conservación byte a byte de los cinco documentos previos y de todos los archivos originales Auth0. La independencia del directorio Git no acredita separación física de BD/secretos; aquí se evitó usarlos.

### Workflows y comandos examinados

- `.github/workflows/docker.yml`: PR hacia dev/main verifica; push a main construye/publica y puede desplegar Northflank. También contiene operaciones manuales deploy/publish/rollback. No se ejecutó el workflow ni se cambió.
- `.github/workflows/security-ci.yml`: PR y push a main/dev; MySQL efímero en CI, materialización de schema, pruebas, lint/build, auditorías. No se reprodujeron ciegamente las operaciones SQL ni escaneos de red.
- Backend `npm test`: `node --import ./test/setup.mjs --test`. Start/dev arrancan servicios; Prisma pull/migrate/status, preflight y retención necesitan revisar destinos. No se ejecutaron.
- Frontend `npm test`: SSR de `test/run.mjs` + 12 archivos explícitos de node:test; `build` usa Vite y `lint` ESLint. Las pruebas browser de auth, payments y metrics requieren navegador/servidores y se dejaron pendientes.
- CI incluye `node --test scripts/*.test.mjs`: se revisaron y ejecutaron los dos archivos existentes con dobles, sin despliegue real. `docker-smoke.mjs` requiere imágenes de producción y levanta servicios/puertos; no se ejecutó.
- No hay script backend de lint ni build de compilación. Se validaron sintácticamente **134 archivos JS/MJS** en `capaServidor/src` y `shared` con `node --check`.
- Schema Prisma, lockfiles y dependencias quedaron intactos. No se necesitó validar una migración inexistente.

### Entorno de pruebas y ausencia de acceso a recursos reales

El frontend no tenía node_modules local. Se reutilizaron imágenes de desarrollo ya disponibles; no se instaló nada. Node contenedores **v22.23.4**; prueba focal y checks locales con Node **v24.19.0**. Vite efectivo **8.0.16**. No se confunde un rango del package.json con la versión ejecutada.

| Imagen local inmutable | ID usado |
|---|---|
| Web | `sha256:4af8895559aa4a50f3793fabf42342517de8b50521dbcf7f193e46f118343c43` |
| API | `sha256:fe522729fe459fd368741d2a54261c39b32438d70470cdffee70e792e4e6bbdb` |

Se verificó que package.json/package-lock.json de ambas imágenes coinciden por SHA-256 con el workspace; también vite.config.js y eslint.config.js del frontend. No había `.env`, `.env.local`, `.env.development` o `.env.production` en sus directorios de trabajo, ni nombres de variables DATABASE_URL, PASSWORD, SECRET, AUTH0_, KEYCLOAK_, RESEND o PIN_SECRET en el entorno inicial del contenedor.

Cada ejecución usó `--rm --network none --cap-drop ALL --security-opt no-new-privileges --pids-limit 256`, sin env_file, puertos, secretos ni volúmenes de BD. Src, test y shared se montaron en solo lectura. Los tests HTTP escuchan únicamente en el loopback del contenedor; los proveedores y repositorios se sustituyen por dobles donde lo definen las pruebas existentes. Las pruebas generan sus secretos sintéticos, no utilizan los de la empresa.

Se fijaron `RUN_MYSQL_INTEGRATION=false` y `RUN_PHYSICAL_REGRESSIONS=false`. Son las dos activaciones explícitas que contienen tres pruebas físicas: cuotas concurrentes, rollback de auditoría y regresiones MySQL. Se inspeccionaron antes de ejecutar; pueden borrar/crear datos de prueba. **Las tres fueron omitidas, no aprobadas**. No se consultó Auth0, Keycloak, Aiven, MySQL empresarial, Manager ni Resend.

### Resultados previos y clasificación

| Comprobación previa | Resultado |
|---|---|
| Backend suite completa segura | 864 pruebas contabilizadas: 861 aprobadas, 3 omitidas, 0 fallos |
| Frontend script completo | 51 pruebas node:test aprobadas; SSR completo aprobado, incluidas 89 verificaciones de acceso |
| Frontend lint | Exit 0, sin errores |
| Build inicial con NODE_ENV=test | Exit 0; 566 módulos; warning de chunk grande y salida temporal |
| Build de producción corregido en la invocación | NODE_ENV=production, APP_ENV=production; exit 0; 559 módulos; chunk principal 495,20 kB; sin warning de chunk grande |

La primera invocación heredó el entorno de test del contenedor y produjo un bundle distinto. Se repitió antes de modificar código con entorno de producción explícito: es una corrección de la comprobación, no del producto. Vite advierte que `/tmp/itecsa-build` está fuera de la raíz y no se vacía; la carpeta nace dentro del contenedor efímero y no toca el workspace.

No se detectaron fallos funcionales en el conjunto seguro. La ausencia de laboratorio real, smoke de producción y navegador se clasifica como **no comprobable en esta ejecución**, no como éxito ni regresión. El incidente previo invalid_grant / refresh_token=undefined es evidencia real del navegador, fuera de la corrección autorizada en esta fase.

## Fase 01: inspección y cambio mínimo

### Flujo conservado y consumidores afectados

El flujo actual pasa de JWT validado por `checkJwt` a normalización Keycloak (piloto), `requireActiveIdentity` (sub, rol y estado local) y `requireCapability` (intersección permisos del token / catálogo local). `requireAdministrativeRole` pide `manage:users`; `requireAdministratorRole` corresponde a cancelación, no a administración de cuentas. Controladores/servicios también verifican alcance departamental, actor, pagos, producción y PIN; no se deduce cobertura solo por nombres de middleware.

En frontend, AuthProvider obtiene el usuario verificado y usa `can`; RoleGuard y ProtectedRoute consumen el contexto. Configs de permisos/rutas y NavigationMenu determinan accesos visuales. El piloto oculta administración de usuarios y responde 503 en backend para administración/recuperación. `shared/userLifecycle.js` conserva Activo/Vinculado, Desvinculado y estados pendientes; no fue modificado.

La relectura directa localizó **28 consumidores originales** del catálogo en código/scripts/pruebas y **30 tras añadir módulo y test**. Desglose actual: 14 de runtime (11 backend, 3 frontend), 14 de pruebas/fixture/browser, 1 generador RBAC, 1 política aislada. Esto mide imports directos; no sustituye el inventario de consumidores indirectos del documento 01.

| Grupo | Consumidores directos originales revisados / alcance |
|---|---|
| Backend roles/claims/control | `src/config/roles.js`, `middlewares/keycloakClaims.js`, `requireActiveIdentity.js`, `requireCapability.js`, `supportAudit.js` |
| Backend servicios/controladores | `modules/auth/service/pin.service.js`; `history/controller/orderHistory.controller.js`; `orders/controller/orders.controller.js`; `orders/service/orderPayment.service.js`, `orderProduction.service.js`; `users/controller/adminUsers.controller.js` |
| Frontend directo | `app/providers/AuthProvider.jsx`, `config/permissions.js`, `config/roles.js` bajo capaVista/src |
| Tests backend originales | `adminUsers.movements`, `adminUsers.routes`, `auth0.rbac`, `demoExposure`, `keycloakClaims`, `ordersMock.service`, `orderViews.p07`, `pinDebug`, `productionPerformance`, `rbac.authorization`, `requireActiveIdentity.roleSync` (*.test.js) y `authorization.fixture.js` |
| Otro test original | `capaVista/test/authSession.browser.jsx` (inspeccionado; browser no ejecutado) |
| Artefactos originales | `scripts/rbac.mjs`, sus docs/matrices/templates/Auth0 Action; conservados, no regenerados |
| Nuevos | `shared/keycloakAuthorization.js` y `capaServidor/test/keycloakAuthorization.test.js` |

Los consumidores indirectos incluyen wrappers administrativos/ventas, rutas de pedidos, capacidad/carga, métricas, mensajes, historial, catálogos auxiliares, guards, navegación y servicios de usuarios. Las regresiones existentes ejercitan estas rutas y contratos. El inventario [01](01_AUTH0_INVENTARIO_EXHAUSTIVO.md) conserva la evidencia detallada por archivo y hallazgo del commit; no se afirma que todas las comprobaciones adicionales por nombre Soporte estén ya adaptadas a Desarrollador.

### Archivos y contratos

| Archivo | Cambio y justificación |
|---|---|
| `shared/authorization.js` | Único archivo original modificado: argumentos opcionales internos en `roleFromPayload` y `can` para reutilizar los predicados con otra política. Defaults, nombres, retornos, claim y catálogo activo de ocho roles permanecen iguales |
| `shared/keycloakAuthorization.js` | Nuevo catálogo derivado: nueve roles, 25 capacidades compartidas, 24 de Desarrollador, 5 de Soporte, seis destinos ordinarios, destinos privilegiados cerrados y metadato que exige correspondencia explícita |
| `capaServidor/test/keycloakAuthorization.test.js` | Nueva suite descubierta automáticamente por npm test: expectativa literal de 225 decisiones más contrato, permisos faltantes/excesivos/antiguos, roles inválidos/múltiples, asignaciones, inmutabilidad y aislamiento del middleware/claims existentes |
| Documentos 06–09 | Plan/estado, decisiones, evidencia y matriz acumulada. Los documentos 01–05 no se editaron |

La matriz no se copia del proveedor. La nueva política deriva las siete listas originales filtrando únicamente `manage:users`; Desarrollador deriva el antiguo Soporte con ese mismo filtro. Soporte define solo su lista de cinco identificadores importados. Se reutilizan predicados para exigir coincidencia local y permiso en token. Los argumentos opcionales son catálogos internos, nunca entradas procedentes de JWT o HTTP.

No se cambió selección de proveedor, JWT/issuer/audience/JWKS, normalizador, AuthProvider, guards, navegación, servicios de negocio, modelo de usuario, esquema, algoritmo PIN ni recuperación. **Importar el catálogo nuevo no valida firma, expiración, sujeto o estado**; estos controles siguen correspondiendo a las fronteras existentes y a su futura integración.

### Verificación previa al cambio y posterior

Se escribió primero el test de aceptación y se ejecutó `node --test capaServidor/test/keycloakAuthorization.test.js`: falló con ERR_MODULE_NOT_FOUND porque la política todavía no existía. Tras la implementación, el mismo comando aprobó **236 pruebas**, incluidas las 225 celdas. No se alteraron las expectativas para superar resultados.

| Comprobación posterior | Resultado real |
|---|---|
| Nueva política focal | 236 aprobadas, 0 fallos, 0 omitidas |
| Backend completo | 1100 contabilizadas: 1097 aprobadas, 3 omitidas, 0 fallos |
| Frontend completo | 51 node:test aprobadas y verificaciones SSR aprobadas, igual a la línea base |
| Frontend lint | Exit 0 |
| Build producción | Exit 0; 559 módulos; misma advertencia de salida temporal, sin chunk grande |
| Tests scripts CI, con dobles | 24 aprobadas, 0 fallos; ningún despliegue real |
| Sintaxis backend/shared | 134 archivos, 0 fallos |
| Diff/hashes | Único archivo original cambiado: shared/authorization.js; sin eliminaciones; docs previos y Auth0 intactos |
| Documentación | node scripts/check-docs.mjs: enlaces locales válidos en 68 archivos; git diff --check sin errores |

No hubo regresiones ni correcciones funcionales adicionales. No se instalaron paquetes ni cambiaron lockfiles. Las suites existentes incluyen errores simulados HTTP/proveedor/DB, identidad local, PIN/concurrencia, reglas de pagos y producción, calendario, métricas, mensajes, historial, cuotas y fallos parciales. Los dobles no acreditan una integración real.

## Reproducción segura de los comandos de contenedor

Ejecutar desde la raíz empresarial. Estos comandos reproducen la **verificación posterior** usando las imágenes locales ya comprobadas; no hacen pull ni build de imágenes. Si los IDs no están disponibles, detenerse y preparar un entorno de pruebas revisado, sin incorporar .env reales.

```powershell
$phaseRoot = (Get-Location).Path
$phaseWebImage = 'sha256:4af8895559aa4a50f3793fabf42342517de8b50521dbcf7f193e46f118343c43'
$phaseApiImage = 'sha256:fe522729fe459fd368741d2a54261c39b32438d70470cdffee70e792e4e6bbdb'
$phaseWebMounts = @(
  "type=bind,source=$phaseRoot\capaVista\src,target=/app/capaVista/src,readonly",
  "type=bind,source=$phaseRoot\capaVista\test,target=/app/capaVista/test,readonly",
  "type=bind,source=$phaseRoot\shared,target=/app/shared,readonly"
)
$phaseApiMounts = @(
  "type=bind,source=$phaseRoot\capaServidor\src,target=/app/capaServidor/src,readonly",
  "type=bind,source=$phaseRoot\capaServidor\test,target=/app/capaServidor/test,readonly",
  "type=bind,source=$phaseRoot\shared,target=/app/shared,readonly",
  "type=bind,source=$phaseRoot\docs\auth0\rbac.expected.json,target=/app/docs/auth0/rbac.expected.json,readonly"
)
function Invoke-PhaseCheck {
  param([string]$CheckImage, [string[]]$CheckMounts, [string[]]$CheckCommand,
        [string]$CheckDirectory = '', [switch]$ProductionBuild)
  $checkEnvironment = if ($ProductionBuild) { 'production' } else { 'test' }
  $containerArguments = @('run','--rm','--network','none','--cap-drop','ALL',
    '--security-opt','no-new-privileges','--pids-limit','256',
    '--env',"NODE_ENV=$checkEnvironment",'--env',"APP_ENV=$checkEnvironment",
    '--env','RUN_MYSQL_INTEGRATION=false','--env','RUN_PHYSICAL_REGRESSIONS=false')
  if ($CheckDirectory) { $containerArguments += @('--workdir',$CheckDirectory) }
  foreach ($checkMount in $CheckMounts) { $containerArguments += @('--mount',$checkMount) }
  $containerArguments += @($CheckImage) + $CheckCommand
  & docker @containerArguments
  if ($LASTEXITCODE -ne 0) { throw "Fallo de comprobacion: $CheckImage" }
}
Invoke-PhaseCheck -CheckImage $phaseApiImage -CheckMounts $phaseApiMounts -CheckCommand @('npm','test','--','--test-concurrency=4')
Invoke-PhaseCheck -CheckImage $phaseWebImage -CheckMounts $phaseWebMounts -CheckCommand @('npm','test')
Invoke-PhaseCheck -CheckImage $phaseWebImage -CheckMounts $phaseWebMounts -CheckCommand @('npm','run','lint')
Invoke-PhaseCheck -CheckImage $phaseWebImage -CheckMounts $phaseWebMounts -ProductionBuild -CheckCommand @('npm','run','build','--','--outDir','/tmp/itecsa-build')
$phaseScriptMounts = $phaseApiMounts + @("type=bind,source=$phaseRoot\scripts,target=/app/scripts,readonly")
Invoke-PhaseCheck -CheckImage $phaseApiImage -CheckMounts $phaseScriptMounts -CheckDirectory '/app' -CheckCommand @('node','--test','scripts/check-docs.test.mjs','scripts/deploy-northflank.test.mjs')
```

Comandos locales de solo lectura ejecutados además: `git rev-parse HEAD`, `git branch --show-current`, `git remote -v`, `git status --short --untracked-files=all`, `git diff --check`, `git diff --stat`, `node --test capaServidor/test/keycloakAuthorization.test.js`, comprobación SHA-256 y `node --check` por cada fuente backend/shared. La comprobación de enlaces usa `node scripts/check-docs.mjs`. No se ejecutó `scripts/rbac.mjs --generate`, deploy, Prisma, SQL o suites browser.

## Equivalencia Auth0 / Keycloak y fuentes oficiales

| Contrato | Auth0 vigente | Keycloak candidato / límite actual |
|---|---|---|
| Roles y permisos | Action/RBAC y claim ITECSA; aplicación exige un único rol y cruce con catálogo | Mantener contrato interno; servidor Keycloak no produce automáticamente el claim arbitrario permissions de ITECSA |
| Roles múltiples | El RBAC del proveedor puede sumar privilegios | La aplicación rechaza varios roles aplicativos; los composites/defaults/mappers deben comprobarse antes de emitir claims |
| Gestión de cuentas | Servicio Auth0 original y alcance por rol | Nuevo alcance Soporte aislado; no existe adaptador administrativo nuevo en esta fase |
| Revocación | Política y estado local más permisos de JWT | La política nueva niega manage:users antiguo a AP/AV/AC/D cuando sea integrada; las rutas activas aún usan la política anterior |

Fuentes consultadas: [Auth0 RBAC](https://auth0.com/docs/manage-users/access-control/rbac), [Keycloak Server Administration Guide](https://www.keycloak.org/docs/latest/server_admin/index.html) (roles, composites, role scope mappings y evaluación de client scopes), [Admin REST 26.8.1](https://www.keycloak.org/docs-api/26.8.1/rest-api/index.html). La documentación permite roles derivados y claims de rol; la decisión de rechazar más de un rol ITECSA es de la aplicación. La guía latest es una referencia conceptual, **no prueba la interfaz ni versión desplegada**. La URL del manual server_admin fijada a 26.8.1 no fue accesible mediante la herramienta de consulta. REST 26.8.1 sí se consultó; no se usó para llamar a un servidor.

El package frontend declara/resuelve `keycloak-js` **26.2.4**, conservado. La versión real del servidor empresarial sigue sin comprobarse. La existencia pública de Keycloak 26.8.1 no permite inferirla.

## Configuración manual, pendientes y reversión

**Acciones manuales obligatorias para ejecutar la fase 01: ninguna en Keycloak, MySQL o infraestructura.** La política pura es verificable sin IdP. No cambiar roles ni mappers del realm empresarial para probar esta entrega.

Procedimiento candidato de laboratorio, a ejecutar solo tras autorizar la fase 02:

1. Registrar versión/digest del servidor y crear un realm aislado o copia sanitizada sin identidades/credenciales reales. Conservar su configuración inicial para comparación y reversión.
2. En Realm roles, definir los nueve nombres exactos de [07](07_DECISIONES_APROBADAS.md). No convertir directamente el Soporte real. No configurar roles aplicativos por defecto ni composites que sumen dos roles ITECSA.
3. En Clients → cliente de laboratorio → Client scopes, revisar dedicated scope, mappers y alcance de roles; usar Evaluate para cada usuario sintético. Confirmar nombres/ubicaciones en el manual de la versión real antes de operar. La guía latest no sustituye esa comprobación.
4. Preparar un usuario sintético por rol y casos de cero/dos roles. Verificar que el token efectivo y la política local coinciden; ni permisos excesivos ni roles realm-management conceden capacidades ITECSA.
5. Acordar mapper de permissions, issuer, audience y URLs/certificados antes de integrar; no añadir el mapa completo como hardcoded claim a todos los usuarios. La elección técnica y su prueba real pertenecen a fase 02.
6. No otorgar realm-admin a trabajadores. Service accounts, credenciales temporales, password policies/required actions y administración se prepararán en sus fases 06–09; no son requisito para esta prueba pura.
7. Revertir desechando únicamente ese laboratorio o sus cambios documentados. No usar el realm empresarial como rollback de laboratorio.

Riesgos pendientes: colisión de nombre Soporte; controles por nombre del antiguo rol en servicios/PIN/auditoría; mappers/composites; tokens anteriores; autenticación y sesiones reales; servicios administrativos aún no implementados; conservación de históricos; recuperación sin correo; topología y certificados. Aiven, Resend/PIN y Manager impiden afirmar operación íntegramente offline. El incidente refresh_token=undefined se conserva como regresión de navegador pendiente y no se generaliza a otros equipos.

Reversión de código **propuesta, no ejecutada**: revisar primero que no haya cambios posteriores del usuario; guardar el diff de esta entrega; restaurar únicamente las dos funciones de `shared/authorization.js` desde el commit base y retirar los dos archivos nuevos de política/test si el equipo rechaza la implementación. Conservar informes como evidencia. No usar reset/clean global, no borrar documentos 01–05, no modificar remotos. No hay migración de BD ni configuración externa que revertir.

Estado Git final esperado y comprobable: un archivo original modificado (`shared/authorization.js`), dos archivos nuevos de código/pruebas y cuatro nuevos documentos 06–09; además, los cinco documentos 01–05 ya estaban sin seguimiento al comenzar. HEAD/rama/remotos permanecen iguales. No hay commit ni push.

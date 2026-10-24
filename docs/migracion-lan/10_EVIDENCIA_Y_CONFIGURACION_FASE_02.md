# Fase 02: evidencia y configuración del contrato de identidad Keycloak

Fecha: **24-10-2026**. Base: `66a75c07e70004f4f83fa015ffe7ab828aa9e9f6`, rama `POC/KEYCLOAK`, repositorio empresarial `Itecsa_app_LAN`. Inicio limpio. Autorización del equipo: «pasamos a la siguiente fase». **Fase 02 terminada técnicamente en laboratorio, pendiente revisión y activación empresarial; fase 03 no iniciada.**

## Resultado y límites

El backend y AuthProvider seleccionan ahora la matriz correspondiente al proveedor autenticado. En Keycloak se aplica la matriz de nueve roles aprobada en [07](07_DECISIONES_APROBADAS.md), con Desarrollador 24, Soporte 5 y AP/AV/AC sin manage:users. El catálogo Auth0 de ocho roles permanece conservado. No se crean dos listas independientes de capacidades ni se copian algoritmos de negocio.

Se probó con **Keycloak Server 26.8.1 real y MySQL 8.4.13 real**, usuarios sintéticos, Authorization Code con PKCE S256, JWT/JWKS, fila local y respuesta verify. El laboratorio usa una red Docker interna sin puertos publicados y se elimina al terminar. No se utilizó el túnel, Aiven, el realm empresarial, credenciales reales ni el repositorio universitario.

**No se desplegó esta versión sobre la aplicación existente.** No se editó ningún .env real, cuenta, rol empresarial o tabla productiva. Un rebuild de la API con este código exige configurar primero el nuevo contrato: si falta KEYCLOAK_ROLE_CLIENT_ID, el arranque rechaza la configuración; los tokens del piloto con solo realm roles ya no son compatibles. Esto evita asignar silenciosamente el nuevo Soporte a quienes tenían el Soporte técnico.

La prueba real utiliza un pequeño servidor Express con los middleware/controlador y UserRepository/Prisma reales; no arranca toda ITECSA ni el proveedor de entrega del PIN. Las regresiones generales se ejecutan por separado. El login automatizado recorre el formulario real de Keycloak por HTTP; no acredita una prueba del SDK en Brave ni una prueba visual de todas las pantallas.

## Decisiones técnicas y contrato

| Superficie | Antes | Ahora en Keycloak |
|---|---|---|
| Selección de política | Matriz compartida original de ocho roles | Selección por contexto de proveedor establecido por el servidor; proveedor desconocido se deniega |
| Validación de firma | SDK JWT con issuer/audience/JWKS | Se conserva SDK y se fija RS256; configuración validada/caché asociada a todos sus parámetros |
| Roles | Filtrado de nombres desde realm_access.roles | Exactamente un rol reconocido en resource_access[KEYCLOAK_ROLE_CLIENT_ID].roles; sin fallback a realm roles |
| Permisos | Se conservaban todos los emitidos | Array válido intersectado con la matriz canónica del único rol; desconocidos y excesivos no conceden acceso |
| Usuario local | Consulta por sub y control de rol/estado | Se preservan y se exige además idAuth0 === sub en Keycloak; ningún desajuste consulta Auth0 o cambia el rol |
| Primer acceso pendiente | Activación compare-and-set existente | Preservada; revalida estado, rol y sujeto tras activar |
| /auth/verify | Contrato sub, rolUsuario, permissions, perfil y PIN | Se preserva y añade identityProvider=keycloak y authorizationPolicy=itecsa-keycloak-v1 |
| Frontend | Ocho roles y comprobación sujeto/generación | Matriz por proveedor; exige la versión de contrato Keycloak, estado activo y sujeto; separa también verificaciones por proveedor |
| Servicios con comprobaciones adicionales | Catálogo antiguo en producción, revisión de pagos e histórico | Reciben el proveedor desde el controlador y usan el mismo selector; transiciones, PIN, actor y persistencia no se rediseñan |
| Auditoría técnica | Soporte antiguo | Conserva ese evento e incluye Desarrollador en Keycloak; el actor local se mantiene |

La SPA sigue siendo pública y utiliza el SDK existente, cuyo package/lock conserva `keycloak-js` **26.2.4**. No se cambian pantallas, login, callback, refresh/logout o credenciales. Los contextos actuales de sesión y useApiClient se conservan; AuthProvider añade validación del contrato y del proveedor de la verificación.

### Por qué un cliente de roles nuevo

El nombre Soporte tiene dos significados incompatibles entre modelos. El cliente de roles nuevo permite asignar explícitamente Desarrollador o nuevo Soporte a sujetos concretos, sin interpretar un antiguo realm role llamado Soporte. Un JWT con únicamente ese rol antiguo devuelve 403.

En el laboratorio:
- SPA: `itecsa-web`.
- Cliente de roles aplicativos: `itecsa-api-v1`, nueve roles.
- Cliente de capacidades: `itecsa-capabilities-v1`, 25 roles-capacidad.
- Cada rol aplicativo es composite de sus capacidades canónicas, nunca de otros roles aplicativos.
- Mappers de la SPA exponen los roles aplicativos y las capacidades en el contrato esperado; audience se emite solo en access token.
- Full Scope Allowed está desactivado; los mappings de alcance incluyen los roles/capacidades que la SPA necesita. El scope básico aporta sub.
- Cero o varios roles aplicativos efectivos se rechazan, incluso cuando resulten de composites o de un mapper incorrecto.

El generador `scripts/keycloak-phase02-realm.mjs` deriva todas las asignaciones desde la matriz aprobada. **Es un fixture de laboratorio, no un export empresarial ni un procedimiento autorizado de migración de personas.** Incluye cuentas y contraseñas sintéticas públicas de test. Nunca se debe importar en el realm existente.

## Archivos e impacto

| Archivos | Cambio |
|---|---|
| shared/identityAuthorization.js (nuevo) | Selector neutral de políticas, sin llamadas de proveedor |
| shared/keycloakAuthorization.js | Identificador de política; misma matriz de fase 01 |
| capaServidor/src/config/identity.js (nuevo), app/app.js | Validación única de configuración de identidad, reutilizada en arranque y JWT |
| middlewares/checkJwt.js | Factory comprobable, configuración estricta y caché por contrato; conserva default export |
| middlewares/keycloakClaims.js | Amplía el normalizador del piloto para roles de cliente y permisos efectivos |
| middlewares/requireActiveIdentity.js, requireCapability.js | Política por proveedor, vínculo local explícito y denegación segura |
| middlewares/supportAudit.js | Conserva auditoría del técnico renombrado |
| modules/auth/controller/auth.controller.js | Proyecta nueve roles y versión de contrato sin alterar respuesta Auth0; cierra en Keycloak la excepción debug del Soporte antiguo |
| modules/orders/controller/orders.controller.js | Propaga proveedor y rol desde contexto confiable |
| modules/orders/service/orderProduction.service.js, orderPayment.service.js | Cambia únicamente selección del predicado de autorización; algoritmos de negocio preservados |
| modules/history/controller/orderHistory.controller.js | Consulta de detalles de pagos con la política correcta |
| capaVista/src/app/providers/AuthProvider.jsx, verifiedIdentity.js (nuevo) | Contrato verificado por proveedor/sujeto/estado/versión y aislamiento de verificación |
| test/keycloakIdentityContract.test.js (nuevo) | Contrato, JWT firmados, matriz HTTP, errores, auditoría, servicios y actor |
| test/keycloak.real.integration.test.js (nuevo) | Integración real opt-in, con guardas de destino efímero |
| Tests Keycloak existentes | Actualiza fixtures a client roles; conserva rechazos y evidencia del contrato anterior en el commit base |
| capaVista/test/verifiedIdentity.cases.js (nuevo), test/run.mjs | Añade verificaciones al script frontend existente |
| scripts/keycloak-phase02-{realm,realm.test,lab}.mjs (nuevos) | Fixture derivado, test de configuración y orquestador aislado |
| docs 06, 07, 09 y este 10 | Estado, decisión de avance, resultados acumulados y evidencia nueva |

Todos los paths backend de la tabla, salvo donde se indica otra raíz, parten de capaServidor/src o capaServidor/test según el apartado. No se añadieron dependencias, cambios de schema, SQL versionado, archivos de datos, rutas administrativas ni lógica de contraseñas. Las funciones delegadas de OrderService transmiten los argumentos de autorización sin alterarlos.

Auth0 conservado: paquetes y lockfiles, `auth0Management.service.js`, Actions, templates, pruebas Auth0, configuración y documentos históricos. `shared/authorization.js` no se modifica en 02. Los controles de estado, PIN, cuotas y reglas de producción/pagos siguen ejecutándose. La administración/recuperación Keycloak permanece cerrada con 503 hasta las fases correspondientes.

## Evidencia de ejecución

| Prueba | Resultado final |
|---|---|
| Backend completo seguro | 1113 contabilizadas: **1109 aprobadas, 4 omitidas, 0 fallos** |
| Contrato focal nuevo | 12 pruebas padre aprobadas, con 225 decisiones HTTP y aserciones adicionales |
| Frontend completo | **51 node:test aprobadas**, SSR previo aprobado y **251 verificaciones nuevas** de contrato/política/sesión |
| Lint frontend | Exit 0 |
| Build producción | Exit 0; Vite 8.0.16, 562 módulos; chunk principal 497,48 kB; solo advertencia de salida temporal |
| Scripts unitarios | **25 aprobadas**: 24 originales y fixture de realm |
| Sintaxis | 130 fuentes backend, 6 shared y 9 scripts: **145 archivos sin error** |
| Keycloak/MySQL real, pasada inicial final | **16 aprobadas** (un padre y 15 subtests); incluye nueve roles × 25 decisiones |
| Keycloak/MySQL real, tras reinicio | **2 aprobadas** (padre e ingreso/verificación nuevos) |
| Limpieza | No quedan contenedores o redes con label itecsa.phase02.lab; api/web preexistentes siguen presentes |
| Revisión estática final | Enlaces locales válidos en 69 documentos; diff sin errores; 577 hashes base revisados: 20 archivos previstos modificados y 557 intactos |

Las 12 pruebas focales están incluidas en el total backend, no se suman otra vez. Los 225 casos HTTP de la suite focal, los 225 del catálogo de fase 01 y los 225 del laboratorio real son grupos distintos. Las 251 verificaciones SSR no son 251 pruebas de navegador.

Las cuatro omitidas de la suite general son las tres integraciones MySQL anteriores y la integración Keycloak real opt-in. Esta última **sí fue ejecutada por separado**, con los resultados reales indicados. El éxito de la prueba de identidad MySQL no sustituye las tres pruebas físicas anteriores de cuotas/rollback/regresión, que siguen pendientes de su propio entorno.

El laboratorio comprobó además: ID token rechazado, legacy Soporte sin rol nuevo rechazado, dos roles efectivos rechazados, manage:users excesivo sin ampliar AP, veinte peticiones concurrentes de sujetos distintos sin mezclar permisos, rol local cambiado/estado desactivado/vínculo retirado que invalidan el JWT anterior, refresh real, código no reutilizable y PKCE incorrecto rechazado. Los casos de firma/algoritmo/issuer/expiración/nbf incorrectos y JWKS no disponible se verifican con firmas y servidor de claves locales de prueba.

### Fallos encontrados y correcciones

Se preservan los resultados anteriores; no se presentan como éxitos retrospectivos.

| Ensayo | Fallo observado | Corrección y comprobación |
|---|---|---|
| Pruebas escritas antes del código | Faltaban config/selector y helper de verificación nuevos | Fallos esperados de módulo ausente; pasan tras implementación |
| Laboratorio real inicial | Se retiraron todos los scopes por defecto y faltaba sub; la vinculación local fallaba | Vincular basic a la SPA. La API sigue exigiendo sub; luego pasaron los nueve roles |
| Mismo ensayo | Intentaba refresh después de reutilizar intencionalmente el código ya consumido | Separar el orden: probar primero refresh válido y después el rechazo del replay, que puede revocar su sesión |
| Segundo ensayo | Fixture intentó poner id_auth0 a NULL, prohibido por el schema vigente; el siguiente caso heredaba estado desvinculado | Usar otro sujeto sintético para probar falta de vínculo y restaurar en finally; cada refresh prepara su propio usuario |
| Tests adicionales de servicios | Se comprobó status en lugar de statusCode de AppError | Ajustar al contrato real de errores, sin modificar AppError ni la denegación |
| Ejecución Prisma CLI | Advertencia existente de detección OpenSSL en la imagen de desarrollo | DDL y consultas completaron correctamente. Se registra para infraestructura; no se instalaron paquetes ajenos a la fase |

Después de las correcciones no quedaron fallos en las pruebas ejecutadas. Los tests antiguos Keycloak adaptan el formato de claim aprobado, no cambian una denegación para ocultar un fallo. Los tests Auth0 originales permanecen intactos.

## Reproducción paso a paso

### 1. Comprobaciones rápidas locales

Desde PowerShell en la raíz empresarial:

```powershell
node --test capaServidor/test/keycloakAuthorization.test.js capaServidor/test/keycloakClaims.test.js capaServidor/test/keycloakJwt.test.js capaServidor/test/keycloakIdentityContract.test.js
node --input-type=module -e "import { run } from './capaVista/test/verifiedIdentity.cases.js'; run();"
node --test scripts/check-docs.test.mjs scripts/deploy-northflank.test.mjs scripts/keycloak-phase02-realm.test.mjs
node scripts/check-docs.mjs
git diff --check
```

El primer comando requiere las dependencias backend ya instaladas; su resultado esperado es 253 aprobadas (236 fase 01 + 4 claims + 1 JWT + 12 contrato). Si no están disponibles, usar los contenedores de pruebas en lugar de instalar dependencias contra configuraciones empresariales.

### 2. Repetir el laboratorio real

Requisitos comprobados: Docker Desktop, las dos imágenes oficiales fijadas a digest y la imagen API local de desarrollo con Node 22.23.4, dependencias y Prisma CLI generados. El script verifica que existen; no hace pull, build, lectura de .env ni cambios en Compose.

```powershell
node scripts/keycloak-phase02-lab.mjs --run
```

Resultado final esperado: 16 aprobadas en initial, 2 tras restart, mensaje de laboratorio aprobado y limpieza de recursos propios. Se conservan las imágenes locales para repetir el ensayo; contenedores, red y temporales propios se eliminan. Los contenedores no exponen puertos: no se debe abrir su URL interna desde el navegador del host.

| Artefacto | Identificador verificado |
|---|---|
| Keycloak | quay.io/keycloak/keycloak@sha256:a78d6b79572168cb25886b80a8b5b8d4ed4390743e3eecb810538683e209dd6b — kc.sh --version: 26.8.1 |
| MySQL | mysql@sha256:76f0358884cb92d9a086d24e5671c38048d3fef40f2588703d73eb55392d6b69 — mysqld --version: 8.4.13 |
| API local | sha256:fe522729fe459fd368741d2a54261c39b32438d70470cdffee70e792e4e6bbdb |
| Web de regresión | sha256:4af8895559aa4a50f3793fabf42342517de8b50521dbcf7f193e46f118343c43 |

Los IDs locales API/web son requisitos de esta reproducción en esta máquina, no imágenes publicadas ni garantía de existir en otro puesto. En otra máquina hay que preparar y revisar las imágenes de desarrollo equivalentes y adaptar explícitamente los IDs del ensayo; no sustituirlos por una imagen productiva con secretos.

El orquestador crea nombres aleatorios y labels propios, una red internal, MySQL en tmpfs, realm temporal y montajes readonly de src/test/shared/scripts. La prueba exige APP_ENV=test, DB_HOST=phase02-mysql y base itecsa_identity_phase02_test antes de materializar el schema. Solo después realiza escrituras de fixtures. Al finalizar comprueba propiedad de los recursos antes de eliminarlos y verifica que el directorio temporal resuelto pertenece al área temporal antes de borrarlo. Nunca modifica volúmenes existentes ni monta el socket Docker en los runners.

### 3. Repetir la regresión general en contenedores

El bloque PowerShell de [08](08_EVIDENCIA_FASES_00_01.md) sigue siendo válido para npm test, lint y build: los montajes traen las fuentes actuales. En 02 el resultado backend es 1109 aprobadas y 4 omitidas. La integración real carga sus fixtures dinámicamente solo al habilitarla; la suite normal no necesita incluir scripts de laboratorio en la imagen.

Para los tests de scripts usar el montaje /app/scripts del bloque anterior y añadir `scripts/keycloak-phase02-realm.test.mjs` a los dos archivos originales. Nunca habilitar RUN_KEYCLOAK_REAL_INTEGRATION en un contenedor empresarial: el orquestador prepara el destino aislado necesario.

## Configuración manual para un entorno revisado

**No se ha aplicado al realm empresarial.** Los valores siguientes describen el contrato probado en 26.8.1; la versión empresarial, dominios, CA y correspondencia de sujetos siguen pendientes. La importación automatizada del laboratorio valida las representaciones/mappers de esa versión; la posición de pestañas de la consola real debe confirmarse antes de operar.

1. Registrar versión/digest y exportar configuración sanitizada del laboratorio propio de destino. No importar el fixture con cuentas/passwords sintéticos sobre un realm con usuarios.
2. Mantener la SPA pública, Standard Flow y PKCE S256, redirects y origins precisos. No habilitar Direct Access Grants ni service accounts para la SPA. Mantener el scope `basic` para que se emita el sujeto.
3. Crear un **cliente distinto de la SPA** para el modelo nuevo, por ejemplo `itecsa-api-v1`, sin flujos de login ni service accounts. Dentro de ese cliente, definir los nueve roles exactos de [07](07_DECISIONES_APROBADAS.md), sin roles aplicativos por defecto.
4. Crear un cliente separado de capacidades, por ejemplo `itecsa-capabilities-v1`, con los 25 nombres canónicos. Definir cada rol aplicativo como composite de **sus** capacidades según la matriz, sin unir dos roles aplicativos ni conceder permisos administrativos de realm-management a trabajadores.
5. En la configuración de mappers/client scopes de la SPA, añadir User Client Role para el cliente aplicativo, multivalor, tipo String, claim `resource_access.itecsa-api-v1.roles`, access token activado e ID token desactivado.
6. Añadir otro User Client Role para el cliente de capacidades, claim `permissions`, multivalor String y solo access token. No obtener permisos desde atributos editables por el usuario ni fijar la lista completa para todos.
7. Añadir Audience para la API (custom audience `https://api.itecsa.local` o el identificador corporativo aprobado), solo en access token. La audience de API debe ser distinta del client ID de la SPA.
8. Desactivar Full Scope Allowed y configurar los mappings de alcance del cliente con los roles/capacidades necesarios. En Evaluate inspeccionar el token efectivo de un usuario sintético por rol y los casos de cero/dos roles. Verificar sub, iss, aud, azp, typ, exp, rol aplicativo único y permisos.
9. Configurar API: AUTH_PROVIDER=keycloak; KEYCLOAK_ISSUER exacto; KEYCLOAK_AUDIENCE; KEYCLOAK_CLIENT_ID de SPA; **KEYCLOAK_ROLE_CLIENT_ID del nuevo cliente aplicativo**; KEYCLOAK_JWKS_URI de ese emisor. En producción se exige HTTPS. HTTP solo se permite con KEYCLOAK_ALLOW_HTTP=true fuera de producción para laboratorio/piloto explícito.
10. Mantener la SPA con su selección Keycloak y audience/URLs revisadas. La respuesta verify debe contener identityProvider=keycloak, authorizationPolicy=itecsa-keycloak-v1 y el mismo sub. No introducir secretos de administración en variables VITE o runtime públicas.
11. Vincular únicamente sujetos sintéticos a filas locales con rol y estado coherentes. Para personas existentes, preparar una relación individual revisable: sujeto viejo → sujeto nuevo → id_usuario conservado → nuevo rol. Antiguo Soporte debe mapear explícitamente a Desarrollador; nuevo Soporte requiere una asignación diferente y autorizada.
12. Probar antes del corte que un token antiguo/realm-only, dos roles, permisos excesivos, cuenta inactiva y rol local distinto se deniegan. No reconstruir/desplegar la API empresarial con este contrato hasta revisar y autorizar su configuración y correspondencia.

Para service accounts administrativas, password policies, required actions, credenciales temporales, primer ingreso y recuperación: **sin cambios en esta fase**; se tratan en 06–09. Este procedimiento no concede aprobación para asignar Gerencia/Desarrollador/Soporte mediante interfaz ordinaria.

## Fuentes oficiales y equivalencia

[Auth0: validar access tokens](https://auth0.com/docs/secure/tokens/access-tokens/validate-access-tokens) respalda la conservación de firma, audiencia y controles de acceso en la API. [Keycloak: JavaScript adapter](https://www.keycloak.org/securing-apps/javascript-adapter) describe el cliente público y su flujo OIDC; se reutilizó el adaptador existente. [Keycloak Admin REST 26.8.1](https://www.keycloak.org/docs-api/26.8.1/rest-api/index.html) documenta las representaciones de realm/cliente/roles y scopes usadas por el laboratorio. [Server Administration Guide](https://www.keycloak.org/docs/latest/server_admin/index.html) explica roles efectivos, composites, audience y el mapper de sujeto del scope basic. Latest es referencia conceptual; no demuestra la versión ni interfaz empresarial.

## Pendientes, riesgos y reversión

- Versión y configuración empresarial sin verificar; mapeo real de sujetos y bootstrap privilegiado siguen pendientes. La fase 02 no migra datos reales.
- Vistas/menús y filtros explícitos por rol, por ejemplo acceso de Desarrollador a métricas, se revisarán en **03**. No se declara equivalencia visual completa por aprobar el contrato API.
- PIN conserva algoritmos, secretos, actor y controles. La herramienta debug del antiguo Soporte se deniega a Keycloak hasta revisar esa excepción específica; el nuevo Soporte no la hereda por el nombre. No se modificó el servicio criptográfico ni la recuperación; su experiencia visual queda para fases posteriores.
- Los JWT se verifican localmente con caché JWKS; cerrar una sesión del IdP no garantiza revocación instantánea de un access token ya emitido. La revocación por estado/rol local sí fue comprobada. La política corporativa de sesiones y el navegador real siguen pendientes.
- El refresh real del laboratorio no resuelve el incidente de Brave con refresh_token=undefined. La reproducción de ese navegador y su corrección se conserva para la fase de sesiones autorizada.
- Permanecen tres pruebas MySQL físicas originales, browser completo, HTTPS/CA corporativos, instalación/restauración offline y dependencias Aiven, Resend/PIN y Manager. No se declara toda ITECSA autónoma en LAN.

Reversión propuesta, no ejecutada: preservar el diff de 02 y comparar cada archivo con 66a75c0 antes de restaurarlo selectivamente; conservar evidencia. No hacer reset/clean global ni tocar cambios posteriores del usuario. Si se autoriza una configuración empresarial futura, respaldar y revertir conjuntamente versión de aplicación, mappings, contratos y sujetos; no volver silenciosamente a Auth0. El laboratorio no deja DB o realm persistentes que revertir.

Estado Git: HEAD sigue en 66a75c0; cambios de 02 sin commit ni push. Documentos 01–05 y 08, archivos Auth0 específicos, PIN, schema, lockfiles, workflows y Compose originales conservados. Fase 03 requiere revisión y autorización expresa.

# Fase 06: servicios administrativos Keycloak y preparación persistente

Fecha: **25-10-2026**, America/Santiago. Repositorio empresarial Itecsa_app_LAN, rama POC/KEYCLOAK. Base limpia **9e440102c3c94d12e4a5263c5a8b72df6bd41c4e**. El usuario pidió «hace un commit y parte con la siguiente fase»: se creó ese commit de 05 y se ejecutó exclusivamente 06. No se hizo push ni se reanudó la integración Ubuntu descartada.

**Estado: aprobable para revisión técnica de fase 06.** El backend dispone de un adaptador administrativo propio, persistencia y conciliación verificadas con Keycloak/MySQL de laboratorio. Las identidades nuevas quedan **deshabilitadas en Keycloak y Pendiente en MySQL, sin credenciales**. La creación completa y entrega de contraseña temporal pertenecen a 07. La fábrica de rutas nueva se verifica en laboratorio y **no está montada en la aplicación**; las rutas públicas administrativas Keycloak conservan su gate 503. No se presenta la gestión de cuentas como terminada.

## Alcance y separación de responsabilidades

El alcance corresponde al apartado 06 del plan maestro: autenticación de cuenta de servicio; consulta/búsqueda/detalles; identidad nueva; atributos; roles; habilitación/deshabilitación/estado; cierre de sesiones; timeouts y respuestas ambiguas; contratos locales/externos; adaptación de persistencia y ensayo de fallos distribuidos. Las decisiones de roles siguen en [07](07_DECISIONES_APROBADAS.md), el estado en [06](06_PLAN_MAESTRO_Y_ESTADO.md), la regresión acumulada en [09](09_MATRIZ_PRUEBAS_ACUMULADAS.md).

La implementación tiene tres fronteras:

1. **Adaptador privilegiado backend:** KeycloakManagementService ejecuta Admin REST con client_credentials. No importa servicios Auth0, no usa passwords humanos, no tiene fallback y no envía credenciales al frontend.
2. **Servicio de aplicación:** KeycloakIdentityAdministrationService verifica proveedor, capacidad, actor local activo y PIN propio en mutaciones. Prepara solo los seis roles ordinarios. La saga persiste resultados y concilia únicamente identidades cuya propiedad puede demostrarse.
3. **Contrato HTTP futuro:** createKeycloakIdentityPreparationRouter construye handlers que toman identidad del middleware JWT, nunca de campos actor/role enviados por el navegador. El laboratorio lo monta en su propio servidor Express; la aplicación real no lo importa ni lo monta. El flujo público completo sigue pendiente de 07.

Los métodos de bajo nivel de atributos, habilitación y logout son primitivas del adaptador verificadas en laboratorio. **No son facultades adicionales publicadas para Soporte** ni sustituyen las futuras reglas de actualización, baja/reactivación, PIN, estado y auditoría del flujo completo. Su exposición posterior debe pasar por un servicio autorizado y revisado.

## Cambios y justificación

| ID | Archivo / símbolo | Decisión y motivo |
|---|---|---|
| F06-01 | capaServidor/src/config/keycloakAdministration.js; resolveKeycloakAdministration | Configuración backend explícita y sin efectos laterales. Exige proveedor Keycloak, issuer válido, cliente de roles, cliente/secret administrativos separados y timeout acotado. HTTPS obligatorio en producción; HTTP solo en laboratorio autorizado |
| F06-02 | capaServidor/src/modules/users/service/keycloakManagement.service.js; KeycloakManagementService / KeycloakServiceError | Adaptador independiente con token en memoria, petición concurrente de token compartida, margen de expiración, deadlines, respuesta limitada a 256 KiB, redirects rechazados y errores sanitizados. No reintenta escrituras ni usa refresh grant para la cuenta de servicio |
| F06-03 | capaServidor/src/modules/users/repo/keycloakIdentity.repo.js; KeycloakIdentityRepository | Diario persistente, reserva única por issuer/username, adquisición CAS y checkpoints. La transacción SQL comprueba/bloquea al actor por PK, sujeto, rol y estado antes de crear usuario, vínculo, auditoría y estado final conjuntamente |
| F06-04 | capaServidor/src/modules/users/service/keycloakIdentityAdministration.service.js; authorize / prepare / reconcile / inspect / findByUsername | Nuevo Soporte con capacidad efectiva y estado local; PIN propio para mutaciones y relectura de revocación. Preparación deshabilitada, propiedad verificable y rechazo de adopción por coincidencia de correo/nombre |
| F06-05 | capaServidor/src/modules/users/routes/keycloakIdentityPreparation.routes.js; createKeycloakIdentityPreparationRouter | Contrato futuro con middleware JWT real y errores públicos fijos. Rechaza contexto administrativo inyectado en el body. No se monta en la aplicación para evitar publicar una provisión sin credenciales/primer ingreso |
| F06-06 | capaServidor/prisma/schema.prisma y migración 202610250001_keycloak_identity_preparation | Correo nullable; vínculo explícito proveedor/issuer/sub/username; diario de preparación. Conserva PK, id_auth0, PIN y relaciones históricas. SQL ensayado sobre esquema anterior con datos sintéticos |
| F06-07 | scripts/keycloak-phase06-realm.mjs, keycloak-phase06-schema.mjs y extensión de keycloak-phase02-lab.mjs | Laboratorio reproducible, cuentas de servicio separadas y User Profile compatible con 26.8.1. Aplica SQL solo al destino fijo desechable; genera Prisma antes de cargar la aplicación |
| F06-08 | Tests unitarios, fixture real y test del generador | Verifican contratos, privilegios, migración, errores reales/simulados, concurrencia, propiedad, rollback y regresión 00–05 |

No cambia la matriz de nueve roles/25 capacidades, el servicio Auth0, PIN, Manager o las pantallas productivas. El cliente de roles sigue siendo un recurso distinto de la SPA. Los identificadores internos existentes no se renombraron.

## Operaciones del adaptador y contrato HTTP del proveedor

Todas las URLs administrativas derivan del issuer configurado y conservan su prefijo, por ejemplo /auth si existe. La base administrativa es /admin/realms/{realm}; {clientUuid} es el ID interno de cliente, no su clientId público. Cada llamada usa un access token de la cuenta de servicio en Authorization; la única excepción es la obtención de ese token.

| Operación propia | Método / recurso Keycloak | Entrada / respuesta esperada | Efectos y controles |
|---|---|---|---|
| token | POST issuer/protocol/openid-connect/token | Form grant_type=client_credentials, client_id, client_secret; 200 con access_token, token_type y expires_in válidos | Token solo en memoria; comparte adquisición concurrente; sin refresh ni persistencia |
| listUsers | GET /users | first≥0, max 1–100, briefRepresentation=false; array 200 | Búsqueda username usa exact=true. Verifica estructura y tamaño |
| findByUsername | GET /users?username=…&exact=true | Máximo dos; comparación exacta sin distinguir mayúsculas | Cero → null; más de uno → conflicto; no adopta la identidad |
| getUser | GET /users/{subject} | 200 con id idéntico, username y enabled booleano; 404 controlado | Segmentos validados; sin traversal ni seguimiento de Location ajena |
| createDisabled | POST /users | username, nombres, correo opcional, enabled=false, emailVerified=false, marcador administrativo de operación; 201 + Location | Sin credentials; valida Location del mismo recurso. Timeout/5xx/respuesta inválida puede ser ambiguo; nunca repite POST automáticamente |
| updateAttributes | PUT /users/{subject} | Solo firstName, lastName, email; 204 | No permite inyectar roles, atributos libres, username, enabled o credenciales. Cambio de email retira verificación previa |
| setEnabled | PUT /users/{subject} | enabled booleano; 204 | Primitiva interna; no activa cuentas desde la saga de 06 |
| logout | POST /users/{subject}/logout | 204 | Prueba real invalida refresh de una sesión; access tokens ya emitidos mantienen sus límites habituales |
| roleClient | GET /clients?clientId=… | Un cliente exacto; obtiene ID interno | No acepta selección arbitraria del cliente desde peticiones públicas |
| roles | GET /users/{subject}/role-mappings/clients/{clientUuid}[/composite] | Array 200 de roles directos o efectivos | Verifica formato; no confunde roles de realm con roles aplicativos |
| roleRepresentation | GET /clients/{clientUuid}/roles/{role} | 200 con nombre/ID esperados | Solo seis roles ordinarios canónicos |
| replaceRole | DELETE y POST /users/{subject}/role-mappings/clients/{clientUuid} | Arrays de representaciones; 204 por llamada; GET de verificación | Exige usuario deshabilitado. Rechaza rol destino privilegiado y roles efectivos/directos privilegiados o múltiples. Retira anteriores, asigna uno y verifica resultado; no es una transacción IdP |
| removeRole | DELETE en ese mismo mapping | Representación ordinaria; 204 y verificación | Exige cuenta deshabilitada, sin roles aplicativos privilegiados; comprueba que el rol no siga heredado |

Timeout configurable: **5000 ms por solicitud**, permitido entre 100 y 30000. Incluye lectura del cuerpo mediante AbortSignal. Los errores no devuelven el body del proveedor, credenciales ni mensajes arbitrarios de red. 401 invalida la caché para una llamada posterior, sin reproducir la escritura; 403 es insuficiencia de la cuenta de servicio; 409 es conflicto de usuario; 404 es ausencia. Red/timeout y 5xx en mutaciones se consideran ambiguos. No hay compensación automática que borre usuarios.

Los errores funcionales del adaptador se separan de fallos SQL y del estado local. La factoría HTTP traduce sus códigos a mensajes fijos; los errores de PIN conservan el mapper existente. La lectura general del adaptador es una capacidad interna privilegiada: su resultado bruto no se entrega a trabajadores.

## Contratos y persistencia

| Dato | Fuente y almacenamiento | Regla conservada |
|---|---|---|
| id_usuario | Usuario existente; PK interna | No cambia ni se reemplazan FK de Pedidos/Registros/mensajes/PIN |
| id_auth0 | Campo heredado conservado | Sigue sirviendo al middleware actual. En nuevas cuentas de laboratorio contiene el sub Keycloak. No se backfillean cuentas existentes por correo o nombre |
| Proveedor / issuer / subject | ExternalIdentity | Identidad estable compuesta, independiente del nombre visible; columnas de comparación binaria en SQL |
| username | ExternalIdentity y Keycloak | Único por proveedor/issuer; reserva del diario por issuer/username. El contrato técnico recibe un valor explícito en minúsculas; no genera un formato corporativo |
| Correo | Usuario.correo_usuario ahora nullable; contacto externo por separado | Índice único no eliminado; MySQL permite varios null. No se inventan alias. Auth0 conserva sus validadores actuales que exigen correo |
| Rol | Usuario.rol_usuario y rol efectivo del cliente Keycloak | Único, ordinario y coherente antes de declarar identidad preparada; permisos emitidos siguen derivados de la matriz |
| Estado | Usuario.estado_usuario frente a Keycloak.enabled | Preparación: Pendiente + false. Nunca se equipara enabled=true a identidad local activa o provisión completa |
| Auditoría | SecurityAuditEvent y IdentityProvisionOperation | Actor local, operación y resultado de preparación; sin passwords/PIN/tokens. El diario conserva datos administrativos personales necesarios para conciliación |

ExternalIdentity tiene unicidad por usuario local, por proveedor/issuer/subject y por proveedor/issuer/username. El SQL fija collation binaria en issuer, subject y username; no utiliza la comparación insensible a mayúsculas del catálogo legado para emisores/sujetos. El username técnico se normaliza en la frontera de entrada, antes del digest. Prisma no expresa estas collations por columna: aplicar la migración revisada, no sustituirla por db push.

**Compatibilidad deliberada:** id_auth0 conserva unicidad global y el middleware actual selecciona un único proveedor/issuer. El nuevo vínculo no activa múltiples emisores simultáneos ni elimina esa restricción heredada. Migrar personas existentes exige una tabla de correspondencia revisada y operación transaccional específica que preserve id_usuario y sus relaciones; esta fase no la ejecuta. Una cuenta externa preexistente sin vínculo explícito no es adoptada por el servicio.

La migración SQL es aditiva: cambia la nulabilidad de correo y crea ExternalIdentity / IdentityProvisionOperation. No elimina columnas, índices previos, usuarios, PIN, tablas o relaciones existentes. Se ensaya generando el esquema exacto de 9e44010, insertando un actor histórico con sub/correo/hash/salt y un registro relacionado, aplicando **el archivo de migración real** y comprobando después esos valores y FK. También verifica unicidad de correo y columnas binarias.

MySQL DDL no convierte esas tres instrucciones en una transacción conjunta. Un fallo intermedio exige inspección del estado y del historial de migraciones; no se debe repetir el SQL a ciegas. La ejecución empresarial y la revisión de su schema/historial real siguen pendientes. No se hizo migrate deploy, db push ni alteración contra Aiven o Ubuntu.

## Provisión distribuida, concurrencia y conciliación

Keycloak y MySQL no comparten una transacción. La saga distingue preparación de identidad de provisión completa:

| Estado persistido | Significado | Próxima acción permitida |
|---|---|---|
| pending | Reserva única creada antes de cualquier escritura IdP | Un worker adquiere ejecución mediante CAS de revisión |
| running | Un worker posee la operación | Otros requests reciben estado pendiente; no roban ni reinician ejecución |
| needs_reconciliation | Error o resultado externo/SQL no confirmado | Conciliación explícita con Soporte/PIN; no repetición automática de POST |
| prepared | Usuario + vínculo + auditoría + estado final guardados conjuntamente; IdP deshabilitado | Devuelve identity_prepared, credentialsConfigured=false y fullyProvisioned=false; vuelve a comprobar condiciones en una repetición |
| failed | Username ya pertenecía a otra identidad | No adopta, reasigna ni sobrescribe; requiere revisión |

Secuencia:

1. Validar identidad Keycloak del actor, capacidad efectiva, fila local y PIN propio; releer revocación después del PIN.
2. Validar entrada allowlist. Gerencia/Desarrollador/Soporte no son destinos ordinarios. No se aceptan contraseñas, PIN o atributos arbitrarios dentro del input que se persiste.
3. Reservar issuer/username y digest canónico. Una repetición con datos diferentes devuelve conflicto; dos workers no duplican operación.
4. Adquirir pending mediante updateMany condicional con revisión. La persistencia coordina procesos independientes; no depende de un mutex en memoria.
5. Consultar username. Si ya existía al comenzar, rechazar. Crear una identidad **deshabilitada** con atributo itecsa_provision_id igual al UUID persistido; guardar sub cuando se confirma.
6. Verificar marcador, username, nombres, correo opcional y estado deshabilitado. Asignar un rol ordinario y verificarlo.
7. Comprobar de nuevo al actor conservando la misma PK. Dentro de la transacción, bloquear su fila y confirmar sujeto, rol y estado; guardar Usuario Pendiente, ExternalIdentity, auditoría y estado prepared. Un fallo de vínculo revierte también la fila Usuario recién insertada. Un cambio de sujeto a otra fila Soporte durante la saga tampoco permite confirmar con el actor anterior.

La conciliación solo retoma needs_reconciliation, relee la identidad exacta y exige el marcador propio, el mismo sub si ya fue registrado y estado deshabilitado. Reasigna/verifica el rol ordinario y completa la transacción SQL. Se demuestra recuperación después de perder una respuesta de creación y después de fallar SQL.

**Límites seguros explícitos:** si no aparece la identidad tras un POST ambiguo, no se emite otro POST: la escritura original podría llegar tarde. Si un proceso muere dejando running, no hay caducidad que robe la operación mientras aún podría existir una escritura en vuelo. Se requiere revisión operativa y una política de recuperación auditada antes de desbloquear esos casos; no hay endpoint que borre reservas, cambie el estado arbitrariamente o permita al trabajador relanzar la creación. Tampoco se retoma automáticamente un failed después de borrar una cuenta externa. Estos casos conservadores quedan pendientes de estabilización/operación antes del corte, no se presentan como recuperación automática implementada.

El diario guarda el actor inicial y los eventos de preparación guardan el actor que ejecuta/confirma o concilia. No registra todos los usos de las primitivas administrativas ni reemplaza el futuro expediente de recuperación de contraseña. Retención, revisión de operaciones interrumpidas y manejo corporativo de datos personales del diario requieren definición antes del despliegue.

## Rutas verificadas sin publicarlas

La fábrica futura define:

| Ruta relativa | Contrato | Estado actual |
|---|---|---|
| GET /identities/by-username/:username | Detalle acotado de identidad local/externa ordinaria | Solo se monta en servidor del fixture |
| GET /identities/:subject | Identidad vinculada; no autoobjetivo ni destino privilegiado | Igual |
| POST /identities/prepare | Body identity + pin; 202 con resultado parcial explícito, o 409 por rechazo definitivo | Igual; no crea contraseña ni habilita |
| POST /operations/:id/reconcile | UUID persistido + PIN; resultado de conciliación | Igual; no permite robar running |

La prueba HTTP usa checkJwt/requireActiveIdentity reales, tokens Keycloak de los nueve roles y el PIN real de Soporte. Comprueba 403 para los otros ocho, 401 sin token o con token malformado, 400 ante un actor inyectado en el body y ausencia de la cuenta solicitada por ese intento. La política de aplicación proviene del middleware y del estado local, no de parámetros externos.

Las siete rutas administrativas públicas anteriores siguen comprobando autenticación/autorización y devolviendo 503 al Soporte Keycloak autorizado. La UI de Usuarios mantiene su aviso de indisponibilidad; no se cambió para prometer un flujo incompleto. Auth0 conserva su router/controllers/servicio original.

## Pruebas finales y fallos anteriores

| Conjunto | Resultado |
|---|---|
| Suite backend completa sin red externa | **1133 contabilizadas: 1129 aprobadas, 4 omitidas, 0 fallos** |
| Adaptador focal | **8 pruebas aprobadas**, incluidas adquisición concurrente de token, expiración, red, HTTP con cuerpo bloqueado, redacción, límites, traversal, roles privilegiados y Location |
| Integración inicial acumulada Keycloak/MySQL | **72 aprobadas**, incluidos padres, pruebas 02–05 y **13 subtests nuevos de 06** |
| Reinicio Keycloak y nuevo Code+PKCE | **2 aprobadas**; cliente Prisma generado antes de cargar el proceso de prueba |
| Regresión física original MySQL | **1 aprobada** |
| Cuotas y rollback físicos originales MySQL | **2 aprobadas**, en segundo MySQL separado |
| Frontend completo | **51 node:test aprobadas**, SSR acumulado con 411 checks de navegación, 251 de identidad y SSR previo |
| Browser acumulado en 1440×1000 y 390×844 | Negocio: **29 + 29**; producción: **70 + 70**; navegación: **243 + 243**, cero errores JS |
| Fixtures browser previos | authSession, metrics y paymentPin: PASS |
| Scripts | **26 aprobadas**, incluido generador administrativo nuevo |
| Calidad | ESLint/build exit 0; 564 módulos; chunk 499,08 kB. Sintaxis de **156 fuentes/scripts** y tres tests/helpers nuevos/modificados sin errores |
| Integridad final | **73 documentos** con enlaces locales válidos; git diff --check sin errores; 18 archivos previstos, índice sin cambios staged y HEAD 9e44010 |
| Limpieza | Sin contenedores/redes residuales de laboratorio; API/web preexistentes continúan en loopback 3000/5173 |

Las cuatro omitidas de la suite sin red se ejecutan separadamente con éxito: Keycloak real y tres físicas MySQL. Los ocho tests focales están incluidos en el total backend. Node descubre además el módulo fixture nuevo como entrada TAP; no se interpreta como una assertion adicional. No se suman TAP, decisiones HTTP y checks DOM/SSR como una cifra de cobertura.

Los 13 subtests de 06 cubren: preservación de migración; nueve roles/PIN; seis destinos y correo nulo; duplicados/no adopción; fábrica HTTP real; creación simultánea entre servicios; respuesta perdida después de POST real; fallo SQL después de insertar Usuario con rollback; resultado desconocido y running interrumpido; permisos de servicio insuficientes y destino privilegiado; atributos/estado/roles directos/efectivos; logout/refresh real; caída del diario, revocación y cambio del vínculo de sujeto del actor durante la saga.

El timeout después de creación se **inyecta después de recibir un 201 real de Keycloak**, simulando pérdida de respuesta al consumidor. El fallo SQL se inyecta en la creación del vínculo después de insertar Usuario dentro de una transacción real; no se detiene la base empresarial. La prueba de deadline del adaptador usa un servidor HTTP local cuyo cuerpo no termina. Se distinguen estos fallos inducidos de una avería observada en Ubuntu.

| Ejecución anterior | Fallo | Corrección |
|---|---|---|
| Dos primeros arranques del realm administrativo | Readiness agotado; diagnóstico posterior mostró que User Profile 26.8.1 rechaza unmanagedAttributePolicy="DISABLED" | Omitir propiedad para la opción deshabilitada; contrastar fuente oficial de la versión. No activar atributos no declarados |
| Primera pasada con migración aplicada | Modelos nuevos ausentes del cliente Prisma cargado, diario no disponible | Generar cliente antes de importar la aplicación en un proceso separado. Los imports de Prisma de pagos/carga habían cargado el cliente anterior |
| Simulación de proceso interrumpido | Fixture calculaba digest con orden no canónico de campos; conflicto correctamente rechazado | Persistir el input canónico en ese fixture; no relajar comparación del digest |
| Revisión del token administrativo | Full Scope Allowed producía advertencia y alcance innecesariamente implícito | Desactivar y declarar exactamente los role scope mappings de realm-management para el cliente de servicio |

Los fallos no se presentan como éxitos retrospectivos. Los marcadores PHASE06_SCHEMA y PHASE06_ADMINISTRATION solo indican ejecución; la aceptación exige TAP sin fallos y exit 0. Los logs locales temporales de esta ejecución son itecsa-phase06-real.log, itecsa-phase06-api.log, itecsa-phase06-web.log, itecsa-phase06-browser.log e itecsa-phase06-scripts.log en TEMP. No se versionan credenciales, PIN o tokens de las pruebas.

## Reproducción paso a paso

### 1. Revisar Git

Desde PowerShell en la raíz empresarial:

~~~powershell
git log -2 --oneline
git show --stat 9e44010
git status --short
git diff --check
~~~

9e44010 contiene 05, creado por petición del usuario. 06 queda local para revisión, sin otro commit ni push. Revisar archivos nuevos además de git diff, que no los muestra hasta añadirlos.

### 2. Ejecutar todo el laboratorio real

Requiere Docker Desktop, Node local y las imágenes fijadas a digest en [10](10_EVIDENCIA_Y_CONFIGURACION_FASE_02.md). No descarga imágenes, no usa Compose/.env empresariales ni exige SSH.

~~~powershell
node scripts/keycloak-phase02-lab.mjs --run --production --business --administration
~~~

Esperar **72 aprobadas iniciales, 2 tras reinicio, 1 física y 2 de seguridad**. El orquestador exige los flags en ese orden; los modos de 02/04/05 anteriores siguen disponibles. --administration necesita los anteriores para reutilizar actores/PIN legítimos de 04 y ejecutar regresión acumulada.

El laboratorio genera el realm administrativo separado y obtiene el schema base directamente de git show 9e44010:capaServidor/prisma/schema.prisma. Aplica DDL base, datos históricos sintéticos y la migración nueva en la base fija tmpfs. Regenera Prisma únicamente en la capa writable del runner **antes** de cargar los módulos de aplicación. Los montajes del repositorio son readonly. El bootstrap valida APP_ENV/NODE_ENV, host, puerto, base, usuario, TLS de laboratorio y la concordancia de DATABASE_URL antes de ejecutar SQL.

El segundo MySQL físico conserva las guardas originales y su namespace 127.0.0.1:33307 sin publicar el puerto en Windows. La limpieza solo elimina recursos cuyo nombre y etiqueta pertenecen a la ejecución. El reinicio afecta exclusivamente al Keycloak desechable.

### 3. Repetir navegador y regresiones generales

~~~powershell
node scripts/keycloak-phase03-browser.mjs --run --production --business
~~~

Mismos requisitos de [13](13_EVIDENCIA_Y_VERIFICACION_FASE_05.md): Brave/Chromium/Edge con perfil temporal propio y Vite en loopback. No hay un login SSO integral de navegador en esta prueba; API/contextos son sintéticos.

Reutilizar los contenedores y montajes seguros sin red de [08](08_EVIDENCIA_FASES_00_01.md) y [10](10_EVIDENCIA_Y_CONFIGURACION_FASE_02.md) sobre fuentes actuales, con opt-ins externos desactivados:

~~~text
# API de pruebas, APP_ENV/NODE_ENV=test, RUN_*_INTEGRATION=false:
npm test -- --test-concurrency=4
node --test test/keycloakManagement.test.js

# Web de pruebas, sin .env:
npm test
npm run lint

# Build solo dentro del contenedor temporal, NODE_ENV/APP_ENV=production:
npm run build -- --outDir /tmp/itecsa-phase06-build
~~~

Desde el host:

~~~powershell
node --test scripts/check-docs.test.mjs scripts/deploy-northflank.test.mjs scripts/keycloak-phase02-realm.test.mjs scripts/keycloak-phase06-realm.test.mjs
node scripts/check-docs.mjs
git diff --check
docker ps -a --filter label=itecsa.phase02.lab
docker ps -a --filter label=itecsa.phase03.browser
docker network ls --filter label=itecsa.phase02.lab
~~~

No deben quedar recursos propios del laboratorio. La aplicación preexistente continúa en sus contenedores y puertos; esta entrega no reconstruye ni reinicia esos servicios.

### 4. Configuración manual futura del destino empresarial

**Pendiente; no ejecutada.** No importar el realm sintético ni copiar sus cuentas/secretos en Ubuntu. Antes del corte:

1. Verificar versión/digest del servidor real, backup recuperable, issuer/HTTPS/CA/DNS y contrato de cliente/roles de [10](10_EVIDENCIA_Y_CONFIGURACION_FASE_02.md).
2. Preparar un cliente confidencial dedicado a administración: service accounts activadas; flujos interactivos y password grant desactivados; separado de SPA/recurso de roles. Secret solo en backend y fuera de variables VITE/runtime público.
3. En laboratorio se verificaron query-users, view-users, manage-users y view-clients de realm-management con scope mappings explícitos y Full Scope Allowed desactivado. **manage-users es amplio**: revisar mínimo privilegio/FGAP, custodia y acceso de red según la versión real antes de producción. No conceder estos roles a usuarios Soporte ni usar realm-admin/master admin como credencial de la aplicación.
4. En User Profile declarar itecsa_provision_id con edición/lectura de administrador únicamente, multivalor desactivado y longitud máxima 36. No permitir su modificación al trabajador ni mapearlo como capacidad. Conservar deshabilitados atributos no declarados. Revisar correo opcional y defaults/composites/grupos antes de crear identidades.
5. Configurar exclusivamente en backend KEYCLOAK_ADMIN_CLIENT_ID, KEYCLOAK_ADMIN_CLIENT_SECRET y opcional KEYCLOAK_ADMIN_TIMEOUT_MS. Reutilizar issuer/cliente de roles revisados; no activar HTTP en producción.
6. Revisar el schema real, historial de migraciones, índices y respaldo. Ensayar este SQL sobre una copia sanitizada con sus históricos y comprobar preservación; regenerar Prisma en la imagen candidata. No aplicar todas las migraciones antiguas o un db push a ciegas.
7. Resolver correspondencia por persona/sujeto y formato de username, retención del diario, operación de interrupciones, bootstrap/asignaciones privilegiadas y reglas de activación. La base técnica no aprueba esos parámetros corporativos.
8. Completar fase 07: contraseña temporal, credenciales de una sola visualización, PIN/acuse y primer ingreso según el plan, estados finales, administración segura y UI. Montar rutas solo tras verificar el flujo completo y autorizar la integración real.

Una clave/secret inválido, un token de servicio insuficiente o un User Profile sin el marcador debe producir fallo visible y mantener la identidad deshabilitada; no se debe otorgar realm-admin para evitarlo. La habilitación del IdP por sí sola no sustituye los controles locales.

## Fuentes oficiales y versiones

Se consultaron la [Admin REST API 26.8.1](https://www.keycloak.org/docs-api/26.8.1/rest-api/index.html) para representaciones, mappings, UUID de cliente y endpoints de usuario, y la [guía de administración](https://www.keycloak.org/docs/latest/server_admin/index.html) para User Profile, cuentas de servicio y privilegios. Latest es referencia conceptual; no acredita un contrato de serialización de la versión empresarial.

La diferencia concreta del enum se comprobó en [UPConfig.java de 26.8.1](https://github.com/keycloak/keycloak/blob/26.8.1/core/src/main/java/org/keycloak/representations/userprofile/config/UPConfig.java). El [proveedor declarativo de esa versión](https://github.com/keycloak/keycloak/blob/26.8.1/services/src/main/java/org/keycloak/userprofile/DeclarativeUserProfileProvider.java) identifica la configuración del componente usada por el laboratorio. No se flexibilizaron atributos para resolver la importación.

Versiones verificadas: Keycloak **26.8.1**, MySQL **8.4.13**, Prisma **7.10.0**, Node imagen **22.23.4**, Node host **24.19.0**, navegador **Chrome/156.0.8078.48**. keycloak-js permanece **26.2.4**, sin actualización de SDK ni dependencias. La versión/configuración real del servidor Ubuntu no se demuestra con este laboratorio.

## Inventario, preservación y reversión

Archivos de 06:

| Archivo | Estado |
|---|---|
| capaServidor/src/config/keycloakAdministration.js | Nuevo |
| capaServidor/src/modules/users/service/keycloakManagement.service.js | Nuevo |
| capaServidor/src/modules/users/service/keycloakIdentityAdministration.service.js | Nuevo |
| capaServidor/src/modules/users/repo/keycloakIdentity.repo.js | Nuevo |
| capaServidor/src/modules/users/routes/keycloakIdentityPreparation.routes.js | Nuevo, no montado |
| capaServidor/prisma/schema.prisma | Modificado: correo nullable y dos modelos |
| capaServidor/prisma/migrations/202610250001_keycloak_identity_preparation/migration.sql | Nuevo, solo ejecutado en laboratorio |
| capaServidor/test/keycloakManagement.test.js | Nuevo |
| capaServidor/test/fixtures/keycloakAdministration.mjs | Nuevo |
| capaServidor/test/keycloak.real.integration.test.js | Modificado: opt-in y bootstrap guardado |
| scripts/keycloak-phase06-realm.mjs | Nuevo |
| scripts/keycloak-phase06-realm.test.mjs | Nuevo |
| scripts/keycloak-phase06-schema.mjs | Nuevo |
| scripts/keycloak-phase02-lab.mjs | Modificado: opción administrativa y diagnóstico del IdP propio |
| docs/migracion-lan/06_PLAN_MAESTRO_Y_ESTADO.md, 07_DECISIONES_APROBADAS.md, 09_MATRIZ_PRUEBAS_ACUMULADAS.md y este 14 | Actualizaciones / nueva evidencia |

Son **18 archivos: 6 modificados y 12 nuevos**. Frontend productivo, matriz shared, servicios/controllers/validators Auth0, PIN, Manager, dependencias/lockfiles, Dockerfiles/Compose/workflows, .env, pruebas físicas originales y documentos históricos anteriores permanecen intactos. El repositorio universitario no se modifica. No se copian secretos reales a código, pruebas o informes.

HEAD queda en 9e44010; 06 está sin commit y sin archivos staged. Para revertir código: preservar el diff y archivos nuevos, comprobar trabajo ajeno y restaurar únicamente los archivos de esta fase desde su base, o revertir su commit específico si se versiona más adelante. No usar reset/clean global.

No hay datos empresariales que revertir. Para una futura migración real, el rollback de schema exige respaldo/revisión: no volver correo a NOT NULL si ya existen null, ni eliminar vínculos/diario con datos sin una política aprobada. No se proporciona un rollback destructivo automático. Eliminar contenedores efímeros de prueba no constituye un procedimiento de restauración empresarial.

## Pendientes y condición de avance

Quedan pendientes despliegue e integración Ubuntu, versión/infraestructura/CA verificadas, migración explícita de sujetos existentes, formato/generación de username, bootstrap y privilegios excepcionales, credenciales temporales/entrega y activación completas, retención/operación del diario y recuperación de procesos interrumpidos. La aceptación debe incluir una copia representativa sanitizada y puestos/navegadores LAN.

El incidente original refresh_token=undefined sigue abierto; un logout/refresh de laboratorio no acredita su resolución en Brave. Aiven, Resend/PIN/privacidad/incidentes y Manager conservan sus dependencias; no se declara operación integral offline. Permanecen los límites funcionales heredados de [12](12_EVIDENCIA_Y_VERIFICACION_FASE_04.md).

00–05 pasan nuevamente en regresión. **07 necesita revisión y autorización expresa**. Este trabajo deja preparada la base administrativa de 06 y su evidencia; no publica cuentas listas para trabajar ni completa fases futuras.

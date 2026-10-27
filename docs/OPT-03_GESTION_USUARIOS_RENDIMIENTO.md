# OPT-03 — Gestión de usuarios: reimplementación

Fecha: 2026-10-27. Rama: `main`. Referencia real: `c0eef72` (Fase 1). Esta entrega vuelve a implementar OPT-03 después de descartar su código. El [informe anterior](OPT-03_INTENTO_ANTERIOR.md) y los cinco JSON anteriores se conservan como antecedentes históricos. Las evidencias actuales llevan el prefijo `OPT-03_REIMPLEMENTACION`.

## A. Resumen y hallazgos aprovechados

Se abordaron listado/resumen, creación/conciliación, inspección/edición/rol/estado y movimientos. Se revisaron la [auditoría](AUDITORIA_RENDIMIENTO_ITECSA.md), la [implementación de Fase 1](IMPLEMENTACION_RENDIMIENTO_FASE1_ITECSA.md), sus JSON y el intento anterior. Se comprobó en código y pruebas que permanecen el JOIN de `findBySubject` y la reutilización de actor en Mensajes. `6405c3d` es contexto histórico, no la referencia de esta comparación.

Se reaplicaron las mejoras demostradas: proyecciones relacionales, reutilización de identidad dentro del GET, concurrencia de lecturas independientes de Keycloak y cancelación de lecturas obsoletas. Se conservan count, búsqueda parcial, páginas numeradas e inspección remota de movimientos. El resumen ya estaba agregado: no se reescribió ni se atribuye una mejora SQL inexistente. No se agregaron índices, funcionalidades Preview, cachés de autorización o ajustes globales de pool/TLS.

Además se conserva el aviso de conciliación al volver a página 1 después de una creación parcial. Se añadieron pruebas de rechazo de roles directos/efectivos prohibidos y se volvieron a probar PIN y recuperación. El defecto de configuración de recuperación encontrado anteriormente permanece documentado por separado en I.

Los repositorios medidos quedan bajo un segundo en diez muestras. Los GET de listado/resumen siguen alrededor de 1,32/1,31 segundos: **la meta completa de un segundo no se considera cumplida**.

## B. Listado, resumen, búsquedas y paginación

`KeycloakIdentityRepository.list` reemplaza hidratación separada por JOIN parametrizado Usuario/ExternalIdentity y nueve columnas de página. Count conserva el filtro canónico ORM y se ejecuta en paralelo. Se mantienen DTO, total, página, tamaño, conflicto de binding, presentación `Actualizando` y orden por ID descendente.

Se conserva alcance provider/issuer, roles administrables y alias Activo/Vinculado. Nombre, apellido, correo, RUT y username siguen siendo búsquedas parciales. Prisma `sql/join` parametriza patrones, filtros, LIMIT y OFFSET; no se concatena entrada del usuario ni se utiliza `$queryRawUnsafe`. Se conserva paginación numerada y no se calculan totales a partir de una página.

El resumen mantiene groupBy global por estado. Mediana interna 661.324 → 661.491 ms: variación sin mejora atribuible. La mejora de su GET está en evitar otra lectura inmediata del actor ya validado por middleware. El listado sigue sin consultar Keycloak por cada fila.

Lista y resumen se cargan y muestran independientemente. Debounce mantiene 350 ms, omite el timer si el término normalizado no cambió y ya no devuelve a página 1 tras paginar inmediatamente después de entrar. GET de lista/resumen/inspección conservan guardas y reciben señales propias de cancelación. Los filtros se aplican en servidor.

## C. Creación y conciliación

Se revisaron formulario, validaciones, journal, preparación, credencial temporal, activación y recargas. Los cálculos simples del formulario no justificaban cambios. Se conservan validaciones por campo, prevención de doble envío, PIN y entrega restringida de credencial antes de notificar al padre.

`hasTemporaryPassword` consulta simultáneamente usuario y metadatos; sigue exigiendo contraseña configurada **y** `UPDATE_PASSWORD`. En `replaceRole`, primero se comprueba cuenta deshabilitada; después se consultan roles efectivos, directos y representación del rol en paralelo. DELETE, POST y verificación final mantienen orden estricto. La resolución del UUID comparte solo la promesa en curso, limpiada al terminar o fallar. El token técnico conserva su caché y single-flight previos.

Secuencia conservada: autorización fresca → PIN → relectura del actor → claim durable con digest/idempotencia → adquisición/revisión del journal → búsqueda exacta de username → creación deshabilitada → checkpoints → propiedad de provisión → rol/verificación → revalidación fresca del actor → credencial/confirmación → persistencia local transaccional/auditoría → habilitación/verificación → finalización durable → respuesta confirmada. Conciliación conserva ownership y no regenera ni reentrega contraseña.

Se mantienen HTTP 202, estados parciales, `needs_reconciliation`, conflictos de payload, bloqueo de operaciones en curso y compensación. No hay reintento automático de POST incierto ni checkpoints eliminados. Los consumidores de mutación no utilizan el actor inicial para omitir comprobaciones frescas.

Creación desde página 2: traza `[1,2,2,1]` → `[1,2,1]`. El efecto de cambio de página posee la única carga nueva; resumen se invalida una vez. Ante resultado parcial se conserva el aviso de conciliación durante la recarga y no se cierra el formulario como si hubiera éxito completo.

## D. Inspección, edición, rol y estado

Binding del objetivo pasa a un JOIN/SELECT, con los mismos seis campos externos y seis de Usuario. Mantiene shape anidado y null cuando falta el binding.

`inspect` sigue validando actor, autoobjetivo, binding, rol administrable y actualización en curso antes de consultar usuario/roles remotos concurrentemente. Mantiene consistencia de subject, ID, username y rol único. No se cachean inspecciones. Después de buscar username remotamente y en la rama `prepared` se fuerza una nueva lectura del actor.

Actualizar conserva validaciones, bloqueo `Actualizando:…`, propiedad del estado y transacciones, deshabilitación, logout, verificaciones, revalidación fresca del actor, habilitación final, auditoría y compensación. Compara atributos con la representación remota de esa misma operación: envía solo los cambiados y evita ese PUT si no cambió ninguno. Incluso un cambio nulo conserva PIN, logout y confirmaciones.

Los GET de rol son paralelos después del guard disabled; DELETE → POST → GET final siguen secuenciales. Los tests de roles efectivos/directos prohibidos comprueban ausencia de escrituras. Los conflictos y resultados parciales conservan el estado de revisión. No se introduce un ETag/versionado de formulario ni se promete una garantía nueva frente a ediciones sucesivas fuera del lock/ownership existentes.

PATCH continúa respondiendo `{outcome, subject}`. Ese DTO no alcanza para reconstruir la fila y los contadores globales frente a concurrencia: se conserva una invalidación paralela y única de lista/resumen tras confirmar. El editor se cierra después del PATCH. Una inspección antigua se cancela y no bloquea el siguiente cliente/sesión.

## E. Movimientos

Nuevo repositorio administrativo de proyección; `UserRepository` compartido por Perfil y Fase 1 permanece intacto. LEFT JOIN por PK única `id_registro` evita multiplicar filas e hidrataciones sucesivas. Recupera ID, fecha, observación, indicadores de relación y tres etiquetas; count reutiliza `buildRecordsWhere`, en paralelo con la página.

Mantiene Date, total/página/tamaño, orden `FECHA_HORA DESC, ID_REGISTRO DESC`, prefijos de búsqueda, coincidencias parciales e ID numérico seguro. Relación presente con nombre null conserva «No informado/a». Prioridad: pago → etapa → subproceso → observación recortada en JavaScript → fallback. No se traslada trim a SQL por diferencias de espacios Unicode.

La inspección remota del objetivo continúa: binding local no sustituye consistencia de username/rol en Keycloak. Se conservan autorización del actor, autoobjetivo prohibido, rol administrable, estado permitido y rechazo de actualización en curso. Un objetivo deshabilitado sigue siendo consultable según la política anterior. La inconsistencia impide consultar historial.

El modal mantiene búsqueda por envío explícito, paginación, loading, errores y comportamiento de foco existente. Cancela su GET al cerrar/cambiar consulta/objetivo, además de la guarda de respuesta activa. El lector con señal no comparte su solicitud con consumidores ajenos. El adaptador de Perfil puede ignorar el argumento opcional y conserva su guarda; no se cambió su backend.

La captura adicional usa el mayor historial administrable actual: **9 registros**. No se presenta como volumen extenso. Las 198 filas de la evidencia anterior corresponden a otro fixture/alcance, no a esta prueba. Queda pendiente integración con historiales grandes en un entorno aislado representativo.

## F. Rendimiento y metodología

SQL/HTTP nuevos: copias temporales de Fase 1 y actual, mismo proceso de diagnóstico Docker, Node 22.23.4, misma base de desarrollo, TLS estricto, pool 10 y timeouts 8.000/15.000 ms. No se reemplazó la API activa para medir. Diez muestras tras warm-up, pausas de 250 ms fuera del reloj y consumo/comparación del resultado completo. Los JSON registran mínimo, mediana, media, máximo, errores y SELECT físicos. No se calcula p95/p99 con diez muestras ni se suman tiempos paralelos.

| Operación | Antes (ms) | Después (ms) | SELECT | Cumple 1 s |
|---|---:|---:|---:|---|
| Listado, repositorio | 1325.271 | 662.641 | 3 → 2 | Solo etapa interna |
| Resumen, repositorio | 661.324 | 661.491 | 1 → 1 | Solo etapa interna; sin mejora SQL |
| Binding, repositorio | 1322.265 | 660.958 | 2 → 1 | Solo etapa interna |
| Historial, primer fixture de 1 registro | 1979.097 | 661.693 | 8 → 2 | Solo etapa interna |
| Historial, mayor administrable de 9 registros | 1987.160 | 662.861 | 8 → 2 | Solo etapa interna |
| GET listado, HTTP diagnóstico | 2596.107 | 1322.707 | 5 → 3 | **No** |
| GET resumen, HTTP diagnóstico | 1905.076 | 1313.046 | 3 → 2 | **No** |
| Inspección con Keycloak real | No medido | No medido | No medido | No evaluable |
| Alta/conciliación real | No medido | No medido | No medido | No evaluable |
| Edición/rol/estado real | No medido | No medido | No medido | No evaluable |
| Movimientos HTTP con Keycloak real | No medido | No medido | No medido | No evaluable |

Reducciones de mediana: listado interno 50.00 %, binding 50.01 %, historial de 9 registros 66.64 %, GET listado 49.05 %, GET resumen 31.08 %. La captura inicial y la adicional son series separadas: no se mezclaron muestras ni se eligió solo el mejor fixture.

Fuentes: [SQL/equivalencia inicial](OPT-03_REIMPLEMENTACION_SQL.json), [historial adicional y EXPLAIN completo](OPT-03_REIMPLEMENTACION_HISTORIAL.json), [HTTP](OPT-03_REIMPLEMENTACION_HTTP.json). Listado HTTP posterior 1242.059–1328.391 ms; resumen 1163.110–1326.249 ms. Cuerpos idénticos antes/después: listado 3281 bytes, resumen 86 bytes.

Los GET usan routers/controladores, normalización de claims, JWT RS256/JWKS, identidad activa y capabilities reales. La autoridad es sintética/loopback y el token queda en memoria. Cuota en memoria 120/minuto, sin escrituras de cuota SQL. Excluye sesión real Keycloak, middleware global de auditoría de soporte y navegador/render. No equivale a acción empresarial de extremo a extremo.

El [benchmark de workflows](OPT-03_REIMPLEMENTACION_WORKFLOWS.json) usa servicios reales de ambas versiones y dobles de fetch, DB y PIN. Cada muestra crea fixture nuevo y cliente técnico frío. No carga `.env` ni abre sockets. Programa 5 ms por I/O; Windows puede ampliar timers. No incluye hash real ni permite comparar tiempos con Docker o el intento anterior.

| Workflow sintético | Antes (ms) | Después (ms) | HTTP | Lecturas de actor |
|---|---:|---:|---:|---:|
| Inspección | 93.101 | 61.788 | 4 → 4 | 1 → 0 |
| Movimientos con inspección | 109.001 | 77.210 | 4 → 4 | 1 → 0 |
| Alta nueva | 419.222 | 373.966 | 17 → 17 | 3 → 3 |
| Conciliación | 358.108 | 310.625 | 14 → 14 | 3 → 3 |
| Editar nombre | 249.476 | 232.946 | 10 → 10 | 3 → 3 |
| Cambiar rol | 357.502 | 294.913 | 17 → 16 | 3 → 3 |
| Cambiar estado | 248.755 | 217.154 | 10 → 9 | 3 → 3 |
| Sin atributos cambiados | 248.085 | 217.338 | 10 → 9 | 3 → 3 |

Alta/conciliación actuales parten sin roles directos; por eso tienen 17/14 llamadas, frente a 18/15 históricas con revocación previa. Cada par actual compara el mismo estado inicial. No se mide replay idempotente como alta nueva. Credenciales se descartan en el proceso: la evidencia contiene únicamente tiempos y categorías/conteos, no contraseñas. **Estos tiempos no acreditan un segundo real.**

## G. SQL, equivalencia e índices

| Función | Antes | Después | Datos/resultado |
|---|---:|---:|---|
| Página y count | 3 SELECT | 2 SELECT | Nueve columnas; igual DTO/count |
| Resumen | 1 | 1 | GroupBy global sin reescritura |
| Binding | 2 | 1 | Mismos doce campos/shape |
| Historial y count, fixtures medidos | 8 | 2 | Igual ID, Date, detalle, total y página |

Los SELECT se observaron mediante eventos Prisma en cada muestra. Los contadores sintéticos de actor no son SQL físico. No hay conteos físicos de mutaciones reales.

**27 comparaciones estrictas iniciales:** listado 13, historial 11, bindings 2 y resumen 1. Incluyen filtro combinado, Activo/Vinculado, páginas 2/500, búsquedas parciales, `%`, `_`, barra invertida y entrada semejante a inyección. Se añadieron 11 comparaciones del mayor historial administrable. Tests complementan nulls, Unicode, Date y relaciones. El código anterior se importó desde un archivo aislado del commit base y se comparó con el mismo cliente. La comprobación es acotada; no prueba todo interleaving de escrituras concurrentes.

Metadatos y EXPLAIN completo están en el JSON adicional. Registros usa `Registros_Usuario_FK`, estimación 9 filas y temporary/filesort; relaciones por PK y hash join sobre tres estados de pago. No se interpreta estimación como tiempo de CPU. El EXPLAIN inicial era una proyección más pequeña; no sustituye el plan adicional con todas las etiquetas/relaciones.

No se agregó `(id_usuario, FECHA_HORA, ID_REGISTRO)`: falta base aislada para probar beneficio e impacto de escritura y el conjunto administrable actual es pequeño. Se conservan índices únicos de binding. No hubo DDL, EXPLAIN ANALYZE, FULLTEXT, cursor o `relationJoins` Preview.

## H. Keycloak

Los conteos trazados de F incluyen un POST de token y GET de UUID por fixture frío; no equivalen a producción con cachés calientes.

| Área | Métodos/rutas conservados | Mejora/dependencias |
|---|---|---|
| Token/cliente | POST token; GET `/clients?clientId=…` | Caché existente; UUID single-flight con limpieza de fallo |
| Inspección | GET usuario; GET mappings `/composite` | Paralelos tras autorizar/binding |
| Credencial | PUT reset-password; GET credenciales/usuario | Solo GET paralelos; temporary/required action intactos |
| Rol | GET efectivos/directos/representación; DELETE; POST; GET final | GET paralelos después del guard disabled; escrituras secuenciales |
| Estado/atributos | PUT usuario; POST logout; GET verificaciones | Evita PUT de atributos vacíos; disable/logout/enable/verificación intactos |

No se modifican transporte, token, endpoints de negocio, sanitización, timeouts, límite de respuesta ni política sin reintentos de mutación. No se cachean roles, permisos, inspecciones, credenciales o estados sensibles. UUID conserva alcance por instancia/configuración.

Se intentó leer versión real en `/admin/serverinfo`: HTTP 200 sin el campo esperado de versión. Queda **sin verificar**; no se infiere del SDK o documentación latest. No se agregaron endpoints nuevos al workflow de negocio.

## I. Seguridad, PIN y recuperación

Se mantienen JWT, issuer/audience/subject, roles, capabilities, `requireActiveIdentity`, cuotas, transacciones, locks, auditoría, journal y compensaciones. El router entrega `req.currentUser` por contexto interno, nunca desde body/query. El servicio exige subject coincidente, ID entero positivo, estado activo y rol coincidente. Consumidores internos sin contexto consultan el repositorio.

Mutaciones conservan consulta fresca inicial y posterior al PIN, y fuerzan revalidación tras trabajo remoto. Los tests revocan al actor durante PIN/remoto y comprueban que no llega a activación/éxito. No se autoriza una escritura con el actor cacheado del comienzo.

**No se modifica generación, hashing, aceptación, intentos, bloqueos, UI ni recuperación del PIN.** `git diff` confirma ausencia de cambios en auth/PIN/recovery, Perfil, providers, componentes de PIN, middleware, configuración DB/TLS y políticas compartidas. Se ejecutaron otra vez recuperación y regresiones con hashing real existentes en alta/Fase 1.

Incidencia independiente previa: falta `KEYCLOAK_PIN_RECOVERY_REDIRECT_URI` y el contenedor activo no incorporaba `KEYCLOAK_PIN_RECOVERY_TRANSPORT_ORIGIN`, aunque esta última está declarada en Compose. Provoca `PIN_RECOVERY_UNAVAILABLE` antes de redirigir. La prueba previa con valores solo en memoria validó configuración/formulario sin rotar PIN. OPT-03 no edita `.env`, no recrea contenedores ni presenta esa incidencia como resuelta. La corrección operativa de recuperación queda separada.

AbortController solo se usa en GET. POST/PATCH no reciben señales ni se reintentan. Abortar no garantiza cancelar un SELECT ya iniciado: se conserva descarte de respuesta vieja sin atribuir reducciones SQL no medidas.

## J. Archivos

Modificados (siete):

- `capaServidor/src/modules/users/repo/keycloakIdentity.repo.js`: proyección de listado/binding y delegación de historial.
- `capaServidor/src/modules/users/routes/keycloakIdentityPreparation.routes.js`: actor de middleware en contexto interno.
- `capaServidor/src/modules/users/service/keycloakIdentityAdministration.service.js`: reutilización de lectura, revalidaciones, GET concurrentes y atributos mínimos.
- `capaServidor/src/modules/users/service/keycloakManagement.service.js`: lecturas independientes/UUID single-flight.
- `capaVista/src/modules/users/api/adminUsersApi.js`: opciones de cancelación GET y lectores aislados.
- `capaVista/src/modules/users/components/UserMovementsModal.jsx`: cancelación de lectura.
- `capaVista/src/modules/users/pages/UserManagementPage.jsx`: debounce, cancelación y recarga única, manteniendo aviso parcial.

Creados de código/pruebas (siete):

- `capaServidor/src/modules/users/repo/userMovements.repo.js`.
- `capaServidor/src/modules/users/service/usersPerformance.test.js`.
- `capaVista/src/modules/users/pages/UserManagementPerformance.test.jsx`.
- `capaVista/src/modules/users/components/UserMovementsModal.test.jsx`.
- `capaServidor/scripts/benchmarkUsersOpt03.mjs`.
- `capaServidor/scripts/usersHttpProbeOpt03.mjs`.
- `capaServidor/scripts/benchmarkUsersWorkflowsOpt03.mjs`.

Documentación/evidencia de esta ejecución:

- `docs/OPT-03_INTENTO_ANTERIOR.md`: copia del informe anterior.
- `docs/OPT-03_GESTION_USUARIOS_RENDIMIENTO.md`: informe actualizado.
- `docs/OPT-03_REIMPLEMENTACION_SQL.json`.
- `docs/OPT-03_REIMPLEMENTACION_HISTORIAL.json`.
- `docs/OPT-03_REIMPLEMENTACION_HTTP.json`.
- `docs/OPT-03_REIMPLEMENTACION_WORKFLOWS.json`.
- `docs/OPT-03_REIMPLEMENTACION_RESPONSIVE.json`.
- `docs/OPT-03_REIMPLEMENTACION_VALIDACION.json`.

Permanecen los cinco JSON anteriores: `OPT-03_RENDIMIENTO_antes`, `despues`, `http`, `workflows_sinteticos` y `OPT-03_RESPONSIVE`. No se eliminaron archivos de aplicación ni helpers compartidos todavía necesarios. Se retiraron imports reemplazados. No cambian dependencias, CSS, esquema, Prisma generado, `.env` ni infraestructura. Copias y archivos temporales de diagnóstico se limpian al terminar.

## K. Pruebas y reproducción

| Comprobación | Resultado |
|---|---|
| Usuarios + Fase 1 + recuperación PIN | 107/107 |
| Nuevas backend | 14/14 |
| Nuevas frontend | 14/14 |
| Backend completo Windows | 134/137; tres fallos previos |
| Frontend completo | 171/173; dos fallos previos |
| Frontend lint/build | Pasan; 336 módulos |
| Prisma validate | Pasa |
| Node syntax / git diff --check | Pasan |
| Edge headless responsive | 17 escenarios, cero overflow |
| Tests nuevos en copia `c0eef72` | Tres regresiones seleccionadas fallan allí y pasan en actual |
| Equivalencia real acotada | 27 + 11 comparaciones |

Fallos backend previos: Compose sensible a CRLF, hash de migración sensible a CRLF y modo POSIX de archivo en Windows. Los dos frontend son `PageMigration.test.jsx` buscando «Puedes crear usuarios y editar sus datos». No se cambiaron aserciones ni se agregó un aviso cosmético para ocultarlos.

Nuevos tests: actor/fallback/contexto inválido; revocación durante PIN/remoto; paralelismo; target deshabilitado, autoobjetivo y actualización en curso; inconsistencia remota bloqueando historial; SQL parametrizado/DTO; fechas/nulls/Unicode/prioridad; ambas condiciones de credencial; UUID simultáneo/fallo/reintento; roles prohibidos y orden DELETE/POST/verify. Frontend: datos independientes, abort/desmontaje/cambio de cliente, tardíos, debounce, filtros/limpieza/páginas, alta completa/parcial, PATCH antes de cierre, 401/403 y reintento exclusivo de resumen.

Tests existentes conservan credencial temporal, PIN incorrecto/bloqueado/pendiente, fallos parciales de alta/Keycloak/MySQL, conciliación, idempotencia, compensación, locks/transacciones, auditoría y cuotas. La prueba nueva aplicada a la copia base demuestra `[1,2,2,1]` y el timer que restablecía página 1; la implementación actual corrige ambos.

La revisión responsive monta AppLayout/página/tablas/estilos reales con identidad/API sintéticas, de 320–1920 px, sidebar, título largo y zoom 200 %. No certifica accesibilidad completa ni latencia empresarial. No cambian foco o política de movimiento reducido; se conservan tests de formularios/modales. Evidencia en el JSON responsive.

La primera medición Windows falló antes de obtener muestras (P2039). Se repitió desde Docker sin cambiar pool/TLS y solo las capturas exitosas son evidencia. Los tests nuevos requirieron shims de dialog de JSDOM y esperar el efecto posterior al debounce. No se debilitaron aserciones de comportamiento. Los scripts no imprimen datos personales, parámetros, PIN o tokens; errores de diagnóstico solo guardan etapa/tipo/código.

La revisión final validó también el subject antes de iniciar las dos lecturas de credenciales: una entrada inválida no debe iniciar I/O ni dejar una promesa rechazada sin manejar al construir el paralelismo. La regresión está incluida en las 14 pruebas backend y el conjunto pertinente vuelve a pasar 107/107. No modifica llamadas ni tiempos de las entradas válidas medidas.

Desde `capaServidor`, con una copia aislada completa de `c0eef72` y dependencias disponibles:

```text
node scripts/benchmarkUsersOpt03.mjs --allow-development-reads --reference-root=/ruta/base --output=/ruta/sql.json
node scripts/benchmarkUsersOpt03.mjs --allow-development-reads --reference-root=/ruta/base --history-only --output=/ruta/historial.json
node scripts/benchmarkUsersOpt03.mjs --allow-development-reads --reference-root=/ruta/base --http-only --output=/ruta/http.json
node scripts/benchmarkUsersWorkflowsOpt03.mjs --reference-root=/ruta/base --output=/ruta/workflows.json
node --test src/modules/users/service/*.test.js test/phase1*.test.js src/modules/auth/service/pinRecovery.test.js src/modules/auth/service/pinRecoveryNavigation.test.js
npm.cmd run prisma:validate
```

Lecturas requieren `APP_ENV=development` y entorno cargado de forma segura. Workflows sintéticos no cargan `.env` ni requieren base. La referencia se extrajo con `git archive HEAD`, sin checkout/reset del trabajo. No existe comando de typecheck/build backend; no se afirma su ejecución. Comandos y resultados sanitizados están en el JSON de validación.

## L. Limitaciones y fuentes

No hay MySQL/Keycloak aislados con cuentas restaurables para mutaciones reales. No se crearon, editaron, activaron, desactivaron ni conciliaron usuarios empresariales para medir. Quedan integración real, concurrencia de administradores, historial extenso y acción completa con hash/red/render. Los dobles verifican orquestación, no certifican una transacción distribuida real.

Los GET aún encadenan identidad y negocio, aunque página/count son paralelos. Sus mínimos siguen sobre el segundo. No se separaron CPU/preparación/red/motor ni se atribuye toda la latencia a un componente. No se movió API/base ni se cambiaron pool/TLS/protocolos/cuotas globales.

Se descartaron índices sin medición de impacto, FULLTEXT, cursor, cachés globales de perfiles/roles, eliminar inspección remota, omitir checkpoints y activar anticipadamente. La agregación del resumen no necesitaba reescritura artificial.

Fuentes oficiales revisadas: [Prisma 7: relaciones/Preview](https://www.prisma.io/docs/orm/v7/prisma-client/queries/relation-queries), [paginación](https://www.prisma.io/docs/orm/v7/prisma-client/queries/pagination), [MySQL 8.4 EXPLAIN](https://dev.mysql.com/doc/refman/8.4/en/explain.html), [Keycloak Admin REST](https://www.keycloak.org/docs-api/latest/rest-api/index.html). Se contrastaron opciones con código instalado y mediciones. Latest no acredita versión del servidor.

## M. Conclusión

Las cuatro áreas quedan abordadas. Repositorios medidos bajo un segundo no equivalen al tiempo de la acción. GET listado/resumen mejoran pero incumplen todavía la meta; alta, edición, conciliación y movimientos completos con Keycloak real no tienen medición de extremo a extremo.

Desaparecen hidrataciones, lecturas inmediatas redundantes del actor, esperas entre GET independientes, PUT de atributos sin cambios y una carga tras crear desde otra página. Se mantienen PIN/recuperación, controles, auditoría, transacciones y provisión segura. Evidencia histórica y actual queda separada.

Código disponible para revisión/integración con **28 pruebas nuevas aprobadas**. No se afirma gate global verde por los cinco fallos previos, ni aprobación de escrituras reales/producción. No se realizaron commits, pushes ni despliegues automáticos.

# Gestión de usuarios: optimización y consistencia

**Actualización vigente:** rama `optimizacion-final`. Después de la autorización adicional se ejecutaron pruebas reales contra Aiven y Keycloak, se redujeron más escrituras/relecturas y se comprobaron los resultados físicos. El alta observada pasó de 15922,152 a 12591,539 ms; la mediana de tres ediciones pasó de 10587,674 a 8673,168 ms. **La meta de 1.000 ms sigue incumplida en las operaciones HTTP medidas.** Véase [Ampliación con pruebas reales](#ampliación-con-pruebas-reales-en-aiven-y-keycloak).

Las secciones siguientes, hasta esa ampliación, conservan el registro de la **primera etapa sintética**: sus límites, conteos de pruebas y ausencia de escrituras remotas describen ese momento, no el estado actual. No se sustituyen ni mezclan sus muestras con las reales posteriores.

Fecha: 30-10-2026, America/Santiago. Rama `main`; HEAD inicial y final sin commit nuevo: `887a9c056646f793ada969c23db657a2e284f42a`. Árbol inicialmente limpio. Los cambios descritos están en el directorio de trabajo.

## Alcance y evidencia vigente

Se trazaron React → adaptador administrativo → router Express → servicio de administración → cliente Keycloak/repositorios. Las ocho rutas solicitadas siguen declaradas bajo `/api/admin/identity`, condicionado a `AUTH_PROVIDER=keycloak` e `IDENTITY_PREPARATION_ENABLED=true` en `src/server.js`. No se cambiaron esas condiciones ni las rutas antiguas cerradas.

El commit histórico `b90afab762200da0b0ca6b426a7d17648b441ec1` es ancestro de HEAD, comprobado con `git merge-base --is-ancestor`; no es la referencia de estas mediciones. Se conservaron la [reimplementación OPT-03](../OPT-03_GESTION_USUARIOS_RENDIMIENTO.md), el [intento anterior](../OPT-03_INTENTO_ANTERIOR.md), sus JSON y la [auditoría disponible](../AUDITORIA_RENDIMIENTO_ITECSA.md). Sus tiempos y entornos no se mezclan con esta ejecución. El cierre de [Keycloak del 29-10](../operacion/KEYCLOAK_CIERRE_VALIDACION_2026-10-29.md) también dejaba pendiente la aceptación integrada LAN.

No están en esta copia `docs/auditoria-mysql/` (informe, checkpoint, anexo, diccionario y evidencia DATA-*), `AUDITORIA_MAESTRA_RENDIMIENTO.md` ni `PLAN_MAESTRO_OPTIMIZACION_ITECSA.md`. Los IDs DATA-USERS-*, F08/F26 y GU-WRITE-* aportados en la solicitud se usaron como pistas, sin atribuirles vigencia ni cifras actuales.

Divergencias verificadas frente a los informes: la página actual aplica filtros explícitamente, permite departamento, no solicita resumen al entrar ni después de guardar y ya evita recargar la página anterior al crear. Se mantienen búsqueda, orden descendente por ID, tamaño de página y COUNT local; no se consulta una colección completa de Keycloak para editar.

## Estado inicial por acción

Rutas relativas a `/api/admin/identity`. SQL indicado por inspección de código, salvo las muestras históricas enlazadas; no es un contador físico de esta sesión.

| Acción y función | Ruta | Recorrido inicial y causa comprobada |
| --- | --- | --- |
| Listado, `list` / `KeycloakIdentityRepository.list` | GET `/users` | JOIN paginado Usuario/ExternalIdentity y COUNT ORM en paralelo; mismo alcance provider/issuer, roles, departamento, estado y búsqueda. Middleware valida actor; servicio reutiliza solo el actor de esa petición. Ya optimizado. |
| Resumen, `summary` | GET `/users/summary` | `groupBy` local por estado. Endpoint conservado, sin peticiones desde la página actual. |
| Inspección, `inspect` | GET `/identities/:subject` | Un binding local y GET usuario/roles de Keycloak en paralelo; comprueba rol único, username, IDs, autoobjetivo y estado. No existe barrido del listado. |
| Búsqueda individual, `findByUsername` | GET `/identities/by-username/:username` | Búsqueda exacta Keycloak, seguida de inspección y revalidación fresca del actor cuando encuentra usuario. |
| Alta, `prepare` / `execute` | POST `/identities/prepare` | Actor fresco → PIN → actor fresco → journal con digest/claim/adquisición → usuario remoto deshabilitado → **dos UPDATE iguales del checkpoint** → rol/credencial/verificaciones → actor fresco → Usuario/binding/auditoría transaccionales → habilitación/verificación → finalización del journal. |
| Edición, `update` | PATCH `/identities/:subject` | PIN, estado propietario `Actualizando:*`, bloqueo local seguido de relectura ORM, disable/logout, atributos cambiados, rol si corresponde, verificaciones, revalidación del actor y commit/auditoría. Al desactivar, repetía PUT `enabled=false` aun habiéndolo confirmado. El refresco React podía capturar filtros anteriores al PATCH. |
| Rol, `replaceRole` | Parte de alta, PATCH, compensación y conciliación | Guard deshabilitado, lecturas de roles efectivos/directos/representación, DELETE/POST y verificación final. Reescribía incluso una asignación directa y efectiva ya idéntica. |
| Conciliación, `reconcile` / `complete` | POST `/operations/:id/reconcile` | Adquisición por revisión/estado; valida propiedad remota, no regenera credencial. Si ya había usuario local, comprobaba vínculo pero no que atributos/rol/estado continuaran correspondiendo al journal. La edición administrativa podía intercalarse con esa provisión parcial. |
| Movimientos, `movements` | GET `/users/:subject/movements` | Inspección completa antes de página/COUNT locales. Conserva filtros y orden fecha/ID. La validación remota mantiene el rechazo de bindings inconsistentes. |

Las transacciones siguen siendo locales a MySQL. No se presenta MySQL/Keycloak como una transacción distribuida atómica.

## Hallazgos, alternativas y decisión

| Severidad / estado | Hallazgo | Solución aplicada |
| --- | --- | --- |
| Grave, confirmado en código y pruebas con dobles | Conciliar un usuario local modificado podía finalizar con el rol remoto del journal y atributos/rol/estado locales diferentes. | `complete` bloquea la fila local existente y exige estado Pendiente, rol, correo, RUT, nombre, apellido y username del journal. `beginUpdate` impide editar una cuenta cuya provisión vinculada está running o needs_reconciliation. |
| Grave si se ejecuta con snapshot previo; riesgo confirmado en código y prueba, sin reproducción física actual | `beginUpdate` bloqueaba IDs y luego decidía con otra lectura ORM. En REPEATABLE READ esa lectura puede conservar el estado anterior y no ver `Actualizando:*` de una edición intercalada. | Usa los campos actuales del mismo SELECT FOR UPDATE para decidir y restaurar. Elimina la relectura ORM del binding y conserva exactamente sus campos anidados. |
| Medio, confirmado por prueba que fallaba antes | Una respuesta perdida después del commit de `finish` disparaba disable/compensación sobre un alta ya finalizada. | Ante error se consulta el journal y solo se acepta created con el mismo ID, issuer, revisión, subject e ID local. Sin esa confirmación no se devuelve éxito ni contraseña. |
| Medio, confirmado por prueba React que fallaba antes | Si los filtros cambiaban durante un PATCH, su callback recargaba filtros antiguos: `['', 'Soto', '']`. | La mutación invalida la lista y el efecto usa el estado vigente: `['', 'Soto', 'Soto']`. Conserva cancelación, descarte de respuestas obsoletas y ajuste a última página válida. |
| Bajo, confirmado | Dos escrituras idénticas del checkpoint en altas nuevas. | Conserva la escritura inmediata después del POST remoto y evita repetirla tras validar la representación. La conciliación mantiene su checkpoint. |
| Bajo, confirmado | Disable duplicado al guardar un estado deshabilitado. | Evita el segundo PUT solo si la representación recién obtenida confirma disabled. Conserva logout, revalidación y GET final. |
| Bajo, confirmado | DELETE/POST de un rol ya idéntico. | Omite ambas mutaciones únicamente si rol efectivo único y asignación directa coinciden, incluido ID de la representación actual. Conserva verificaciones antes y después. |
| Hipótesis, sin medición actual | Latencia SQL, red, pool o Keycloak como causa dominante del incumplimiento integral. | No se atribuye causa ni ahorro físico sin medición. Las muestras históricas no son una línea base LAN actual. |

Se descartó eliminar las verificaciones remotas de movimientos (F08): su contrato rechaza username/rol remoto inconsistente antes de entregar registros. Se conservaron los campos del detalle (F26): no había evidencia completa de todos los clientes externos del endpoint ni un ahorro medido que justificara reducir el contrato. No se quitaron validaciones, lecturas frescas de autorización, credenciales, auditoría ni confirmaciones para ahorrar RPC.

También se descartaron cachés de autorización/roles, activación anticipada, éxito optimista, reintentos automáticos de mutaciones ambiguas, listado completo de Keycloak, índices sin EXPLAIN actual y cambios de pool/TLS. No hubo DDL, migraciones, nuevas dependencias, cambios de secretos ni servicios externos.

### Seguridad e integridad

JWT, capacidades, roles administrables, autoedición prohibida, identidad activa, PIN/bloqueo, tres lecturas frescas del actor en mutaciones y revalidación transaccional se conservan. Consultas nuevas parametrizadas; ningún valor de entrada se concatena en SQL.

El guard de provisión se integra mediante LEFT JOIN en el SELECT `FOR UPDATE` ya existente de `beginUpdate`; no agrega un viaje SQL a cada edición. Esa misma consulta proyecta el binding y los seis campos locales, evitando después el `findUnique` con relación. Es una reducción verificable de invocaciones ORM, sin conteo físico nuevo ni tiempo SQL atribuido. Se reutiliza `mapBinding` también en la inspección para conservar el shape. La relación de provisión se limita por issuer/username y usuario local, con la clave única `identity_provision_username` existente. Cuando la provisión sigue incompleta, PATCH responde 409 `IDENTITY_PROVISION_INCOMPLETE`, con mensaje público de conciliación mediante el feedback existente.

La distinción entre lectura de snapshot y lectura con bloqueo está documentada por [MySQL 8.4: niveles de aislamiento](https://dev.mysql.com/doc/refman/8.4/en/innodb-transaction-isolation-levels.html). El riesgo se infiere de mezclar ambos tipos de lectura en la transacción anterior; la prueba suministra deliberadamente dos versiones del registro. No se afirma haber consultado el aislamiento de una instalación operativa.

La conciliación que reutiliza un usuario local agrega un `SELECT ... FOR UPDATE` del objetivo antes de verificar su contenido. Es un costo de integridad deliberado, no representado en el benchmark que sustituye el repositorio. El plan y los locks físicos del JOIN deben comprobarse en MySQL aislado; no se afirma que un doble valide el motor.

Ni contraseñas, PIN, tokens ni datos empresariales se escriben en las evidencias. El journal continúa almacenando input/digest/revisión, nunca la contraseña temporal. Las mutaciones conservan el cierre del modal condicionado al resultado confirmado, el aviso parcial y la entrega de la credencial solo una vez.

## Cambios por archivo y consumidores

Rutas de servidor relativas a `capaServidor/`, de interfaz a `capaVista/`.

| Archivo / función | Efecto y consumidores |
| --- | --- |
| `src/modules/users/repo/keycloakIdentity.repo.js`: `complete`, `beginUpdate`, `mapBinding` | Consistencia del usuario previamente vinculado, locks, datos actuales del bloqueo sin relectura ORM y rechazo de edición de provisiones incompletas. `binding` reutiliza el mapeo conservando contrato. No cambia schema ni listados. |
| `src/modules/users/service/keycloakIdentityAdministration.service.js`: `execute`, `update` | Checkpoint único en alta, confirmación de commit ambiguo y disable final condicional. Conserva compensación y errores saneados. |
| `src/modules/users/service/keycloakManagement.service.js`: `replaceRole` | Evita reescritura equivalente; mantiene guard disabled y lectura efectiva final. Beneficia conciliación y compensación, además del flujo administrativo. |
| `src/modules/users/routes/keycloakIdentityPreparation.routes.js` | Mensaje específico y saneado para el nuevo conflicto 409. Resto de contratos/estados HTTP intactos. |
| `src/modules/users/pages/UserManagementPage.jsx`: `refreshAfterMutation` | Invalida por revisión local y recarga mediante el efecto con filtros/página vigentes. Una recarga por mutación; sin resumen adicional, optimismo o nueva UI. |
| `src/modules/users/service/userCreation.test.js` | Alta, checkpoint, resultado perdido, conciliación inalterada/alterada y dos preparaciones superpuestas. |
| `src/modules/users/service/userUpdate.test.js` | Dos ediciones superpuestas, guards de provisión, aceptación normal y respuesta HTTP 409. |
| `src/modules/users/service/usersPerformance.test.js` | No reescritura de rol equivalente, confirmación final obligatoria y desactivación sin PUT repetido. |
| `src/modules/users/pages/UserManagementPerformance.test.jsx` | Regresión de filtros durante PATCH y espera explícita del efecto que corrige la página. |
| `scripts/benchmarkUsersWorkflowsOpt03.mjs` | Amplía el harness existente con captura antes/después separada, n configurable, p95 empírico, conteo de repositorio/checkpoints y conciliación con rol ya asignado. Conserva modo `--reference-root`. |

Los servicios de administración solo se consumen directamente en este módulo dentro del servidor. No se modificaron Perfil, middleware, providers, Mensajes, notificaciones, autenticación, recuperación/PIN, estilos ni componentes compartidos. Sus regresiones seleccionadas y la suite React global se ejecutaron igualmente.

## Medición antes/después

Línea base capturada **antes de editar código productivo**; mismo Windows/Node v24.19.0, mismo harness, rol Soporte/capacidad administrativa, input ficticio, estado inicial por escenario y demora programada de 5 ms por I/O simulado. Cada muestra usa instancia fría nueva, incluido token/UUID. Los timers reales incluyen planificación del host: 5 ms programados no significan 5 ms observados por etapa.

Se utilizaron las clases reales de administración y transporte, con fetch, repositorio y PIN sustituidos. No se carga `.env`, no se abre red ni se llama MySQL o Keycloak real. Reloj desde invocar el servicio hasta consumir/verificar su resultado. El harness comprueba estado remoto/local esperado, rol, logout anterior al commit, número de credenciales y ausencia de contraseña en conciliación.

Evidencia: [antes](evidencia/gestion-usuarios-antes.json), [después](evidencia/gestion-usuarios-despues.json). Referencia antes: HEAD indicado; después: ese HEAD más estos cambios sin commit. **30 muestras por escenario y versión**. p50 es mediana; p95 es percentil empírico por rango más cercano, rango 29 de 30. Es descriptivo de esta muestra pequeña, sin garantía estadística de producción. Se incluye siempre el máximo observado.

Tiempos en ms. Cada fila tiene n=30 ANTES y n=30 DESPUÉS.

| Operación sintética | ANTES p50 / p95 / máximo | DESPUÉS p50 / p95 / máximo | RPC antes → después | Repo antes → después |
| --- | ---: | ---: | ---: | ---: |
| Inspección | 62,146 / 63,249 / 77,435 | 62,326 / 63,864 / 79,937 | 4 → 4 | 1 → 1 |
| Movimientos con inspección | 77,806 / 79,847 / 80,250 | 77,623 / 78,970 / 80,187 | 4 → 4 | 2 → 2 |
| Alta nueva | 374,558 / 377,350 / 377,925 | 358,976 / 361,647 / 362,016 | 17 → 17 | 9 → 8 |
| Conciliación sin rol asignado | 311,865 / 315,139 / 316,576 | 311,128 / 313,465 / 313,588 | 14 → 14 | 8 → 8 |
| Conciliación con rol ya asignado | 327,899 / 330,519 / 330,639 | 296,190 / 299,067 / 299,384 | 15 → 13 | 8 → 8 |
| Editar nombre | 233,692 / 236,382 / 236,586 | 234,226 / 236,187 / 238,414 | 10 → 10 | 5 → 5 |
| Cambiar rol | 296,226 / 299,219 / 299,899 | 296,158 / 301,075 / 320,761 | 16 → 16 | 5 → 5 |
| Desactivar | 218,032 / 220,371 / 221,465 | 202,662 / 204,281 / 204,650 | 9 → 8 | 5 → 5 |
| Guardar sin atributos cambiados | 218,701 / 220,672 / 222,591 | 218,835 / 222,741 / 224,350 | 9 → 9 | 5 → 5 |

RPC significa intercambios del fetch **simulado**, incluyendo POST token y GET del cliente de roles frío. “Repo” cuenta invocaciones del doble de repositorio e incluye lecturas del actor; **no cuenta sentencias SQL ni BEGIN/COMMIT**. El desglose por categoría RPC y todas las muestras están en los JSON. La eliminación de un checkpoint equivale por código a evitar un UPDATE, pero no se midió su latencia SQL física. Los guards transaccionales nuevos no se ejecutan dentro del doble.

No se capturaron tiempos por etapa SQL/Keycloak reales, bytes/filas físicos, tiempo HTTP del endpoint ni navegador/render. No se sumaron duraciones paralelas ni tiempos de pruebas para fabricar ese desglose. La variación de escenarios cuyo número de operaciones no cambia no se atribuye a optimización.

### Acciones integrales y meta de 1.000 ms

| Acción real | ANTES / DESPUÉS actual, n | SQL/HTTP/bytes actuales | Cumplimiento integral |
| --- | --- | --- | --- |
| Listado útil, filtros combinados y paginación | Sin medición comparable; n=0 | Sin captura física; un GET React por aplicación/cambio; página+COUNT locales por código | No medible en esta sesión |
| Resumen | Sin medición comparable; n=0 | Endpoint agregado conservado; cero solicitudes desde la página | No medible |
| Detalle y búsqueda por username | Sin medición comparable; n=0 | DTO conservado; bytes individuales sin medición comparable | No medible |
| Preparar/crear confirmado | Sin medición comparable integral; n=0 | SQL/PIN/Keycloak/red/navegador reales excluidos del harness | No medible |
| Editar atributos, rol, desactivar y rehabilitar | Sin medición comparable integral; n=0 | Ídem; conserva verificación de estado y commit | No medible |
| Conciliar confirmado | Sin medición comparable integral; n=0 | Ídem; el lock adicional del objetivo local no está cronometrado | No medible |
| Movimientos con autorización y Keycloak reales | Sin medición comparable integral; n=0 | Inspección remota conservada; página+COUNT locales | No medible |

Las nueve operaciones de **orquestación sintética** tienen máximos inferiores a 1.000 ms en ambas versiones. Eso solo cumple el alcance artificial medido. No se certifica ninguna operación integral LAN ni se declara aceptado el módulo contra sistemas reales.

Como antecedente explícito que **no cumple**, OPT-03 documentó GET listado con mediana 1.322,707 ms/máximo 1.328,391 ms y resumen 1.313,046/1.326,249 ms, diez muestras en otro entorno. Esos resultados siguen conservados y no se reemplazan por tiempos sintéticos actuales. La cadena de identidad→negocio permanecía secuencial; el costo de red/motor/pool no fue aislado y tampoco se puede asignar ahora. Pendiente medir con MySQL/Keycloak sintéticos reales en la topología LAN antes de elegir otra optimización de infraestructura o SQL.

## Matriz de validación

| Caso | Resultado y alcance |
| --- | --- |
| Baseline de suites existentes del módulo | 50/50 backend y 39/39 React antes de agregar pruebas/cambiar producción. |
| Pruebas de defecto antes del arreglo | Fallaban: respuesta perdida tras finish, checkpoint duplicado, seis variantes de usuario local alterado; React reproducía refresco con búsqueda anterior. |
| Alta exitosa y replay | PASS con PIN/hashing real y persistencia/Keycloak sustituidos; contraseña solo en primera respuesta, vínculo transaccional y cuenta habilitada después de complete. |
| Dos preparaciones superpuestas | PASS: una creación externa y una contraseña; segunda petición observa la misma operación running. Dos operaciones controladas, sin carga masiva. |
| PIN inválido/bloqueado, rol insuficiente, autoobjetivo y rol prohibido | PASS: sin escrituras de cuenta; suites del módulo, rutas y seguridad. |
| Duplicado/reintento | PASS para replay de la misma operación y guard de claim por revisión; duplicados físicos UNIQUE y carreras de MySQL/Keycloak pendientes de laboratorio. |
| Fallos crear/credencial/verificación/MySQL/habilitar/finalizar | PASS: resultado parcial, credencial no expuesta, compensación; fallo de disable registra resultado no confirmado. |
| Commit del journal confirmado tras perder respuesta | PASS: no deshabilita el alta ya confirmada ni emite una segunda credencial. |
| Conciliación de usuario local intacto/alterado | PASS: conserva binding/auditoría intactos; rechaza rol/estado/correo/RUT/nombre/apellido alterados; username limitado en el filtro. |
| Dos ediciones superpuestas y propiedad del lock | PASS: segunda edición rechazada antes de atributos remotos, primera confirma; UPDATE final conserva estado propietario y auditoría. |
| Fila bloqueada distinta del snapshot ORM | PASS: el estado Actualizando de la lectura con bloqueo impide otra edición aunque el doble ORM entregue una versión Activo anterior. La prueba fallaba antes de usar directamente la proyección bloqueada. |
| Editar cuenta con provisión incompleta | PASS: running/needs_reconciliation rechazados, con HTTP 409 específico; sin provisión o created permiten edición. |
| Edición, habilitar/deshabilitar y rollback | PASS con dobles: cinco campos, estados, logout, revalidación, compensación y bloqueo local si falla restauración. |
| Rol ya asignado | PASS: cero DELETE/POST y tres lecturas de roles; inconsistencia de la verificación final sigue fallando. Roles prohibidos directos/efectivos conservan rechazo. |
| Filtros, COUNT, departamento, orden y paginación | PASS: consultas parametrizadas, scope de issuer/roles, Activo/Vinculado, tamaños 10–50, última página válida y cancelación de respuestas viejas. Equivalencia física SQL actual pendiente; evidencia histórica preservada. |
| PATCH pendiente y cambio de filtros | PASS React: usa filtros vigentes y espera confirmación de escritura antes de cerrar. Mantiene advertencia de conciliación y una recarga tras crear. |
| Movimientos propios/ajenos/inconsistentes | PASS en fixtures: autoobjetivo prohibido, binding inconsistente no llega al repositorio, objetivo desvinculado conserva lectura según política, página/count y proyección de relaciones/nulls intactos. |
| JWT, revocación, Perfil, PIN/recuperación y Mensajes/notificaciones | PASS: suites seleccionadas usan JWT firmados, capacidades, ownership, bloqueo de PIN y revalidación. Sin entorno Keycloak real. |
| Crear → login real → cambiar contraseña → inspeccionar → editar rol → deshabilitar/prohibir → rehabilitar/conciliar → cotejo MySQL/Keycloak | **PENDIENTE**: daemon Docker no accesible; no hay laboratorio integrado verificado. No se sustituyó por una afirmación de aceptación física. |

### Comandos y resultados finales

Desde `capaServidor`:

```powershell
node --test src/modules/users/service/userCreation.test.js src/modules/users/service/userUpdate.test.js src/modules/users/service/usersPerformance.test.js test/userDepartmentFilters.test.js test/phase1Identity.test.js test/phase1Security.test.js test/profileSecurity.test.js src/modules/auth/service/pinRecovery.test.js src/modules/auth/service/pinRecoveryNavigation.test.js
```

**130/130 PASS**. Incluye las regresiones vecinas relevantes; no se afirma haber repetido todos los tests del backend.

Desde `capaVista`: `npm test -- --maxWorkers=2`: **495/495 PASS**, 61 archivos. El primer `npm test` sin límite dio 494/495 por timeout esperando el filtro de Kanban mientras seguía la vista lazy en carga; se registra el fallo y la repetición completa con dos workers aprobada, sin cambiar Kanban ni sus pruebas. Después de los últimos ajustes se repitió `npm test -- --run src/modules/users`: **40/40 PASS**.

`npm run build`: PASS, 587 módulos. ESLint directo sobre los dos JSX modificados: PASS. `npm run lint` global: **FAIL**, tres `no-unused-vars` en `src/modules/metrics/utils/productColors.test.jsx` (`screen`, `within`, `normalizeProductType`); los imports ya existen en HEAD y ese archivo no se modificó.

`node --check` sobre script de benchmark, repositorio, ambos servicios y router: PASS. `git diff --check`: PASS. No existe script de build/lint backend para ejecutar. Docker: `docker ps` falla por pipe `dockerDesktopLinuxEngine` inexistente. No se iniciaron servicios, desplegó, hizo push/merge ni se ejecutaron escrituras remotas o migraciones.

Para reproducir las mediciones, desde la raíz (antes debe ejecutarse sobre la versión base, después sobre el árbol modificado):

```powershell
node capaServidor/scripts/benchmarkUsersWorkflowsOpt03.mjs --variant=before --samples=30 --commit=887a9c056646f793ada969c23db657a2e284f42a --output=docs/optimización/evidencia/gestion-usuarios-antes.json
node capaServidor/scripts/benchmarkUsersWorkflowsOpt03.mjs --variant=after --samples=30 --commit=887a9c0-final-working-tree --output=docs/optimización/evidencia/gestion-usuarios-despues.json
```

## Reversión, riesgos y estado final

Cambios aplicados y comprobados a nivel de servicios, Express y consumidores React. Se reducen operaciones equivalentes y se corrigen las ventanas comprobadas; la aceptación contra MySQL/Keycloak reales y el objetivo integral de un segundo siguen pendientes.

La reversión consiste en retirar este diff de código y pruebas tras revisión, preservando trabajo ajeno y la evidencia documental. No requiere migración, restauración de datos ni reversión de configuración. Revertir las protecciones de conciliación reintroduce los fallos descritos: no se recomienda aislar solamente ese cambio para ganar tiempo.

Riesgos residuales y siguientes verificaciones:

1. Verificar plan, locks y concurrencia físicos del LEFT JOIN y de la reutilización local en un MySQL aislado; repetir las dos operaciones controladas sin datos empresariales. No se afirman propiedades del motor a partir de dobles.
2. Validar contra Keycloak aislado, versión/configuración reales y clientes calientes/fríos. Capturar SQL, RPC por tramo, bytes y confirmación visible en navegador con el mismo snapshot, rol y estado antes/después; no hay datos para certificar mejoras de red/CPU/pool.
3. Si también falla la lectura del journal tras un resultado ambiguo, se mantiene la vía de compensación/error: no se inventa éxito. Un error de DB después de un commit más una imposibilidad de confirmar puede requerir revisión administrativa. No se resuelve la atomicidad entre dos sistemas mediante un resultado optimista.
4. Si la respuesta HTTP completa del alta se pierde, el replay continúa sin revelar/regenerar contraseña. La recuperación operativa de esa credencial ya era una limitación; no se almacena el secreto para habilitar reentregas. El estado running abandonado tampoco se roba automáticamente.
5. Un usuario local alterado después de una provisión parcial queda rechazado para conciliación automática y exige revisión; no se sobrescriben datos ni se decide un nuevo rol comercial. Los endpoints reservados de credenciales/desvinculación continúan cerrados.
6. Pendientes ajenos a esta mejora: tres errores de lint de métricas y variabilidad temporal de la prueba lazy de navegación. No se atribuye a esta entrega el cierre de incidencias históricas de despliegue o configuración de recuperación de PIN.

No se borraron registros ni documentos históricos. La evidencia nueva solo contiene escenarios artificiales, tiempos y categorías/conteos de operaciones.

## Ampliación con pruebas reales en Aiven y Keycloak

Fecha: 30-10-2026, America/Santiago. Rama de trabajo **`optimizacion-final`**, sin commit ni push nuevos. La autorización posterior del usuario permitió crear y modificar cuentas ficticias en Aiven/Keycloak; reemplaza para esta etapa la restricción inicial de escrituras exclusivamente sintéticas. Se trabajó únicamente con esas cuentas; no se modificaron cuentas empresariales existentes, schemas, migraciones, secretos o despliegues.

### Entorno, método y límites de comparación

- MySQL **8.4.8**, base `mydb` en Aiven, aislamiento efectivo **REPEATABLE-READ**, TLS estricto con `TLS_AES_256_GCM_SHA384`.
- API habitual en `127.0.0.1:3000`, frontend en `127.0.0.1:5173`. Keycloak anuncia issuer `http://127.0.0.1:18080/realms/itecsa`; el listener 18080 pertenece a **ssh**, de modo que esta prueba incluye un reenvío a Keycloak remoto. **No representa la futura instalación LAN autónoma.**
- Node **v24.19.0**, pool diagnóstico 10, timeouts 8.000/15.000 ms, protocolo binario y caché de preparación 0, salvo experimentos explícitos con 16. No se cambió la configuración del cliente Prisma de la aplicación.
- Actor real con rol **Desarrollador**, firma/JWKS, issuer, audiencia, capacidades, identidad activa y PIN genuinos. Se usó Authorization Code con **PKCE S256**; el grant de contraseña fue rechazado por el cliente y no se habilitó. Contraseñas, PIN, códigos, cookies y tokens se mantuvieron en memoria, fuera de Git/evidencias.
- Se añadió [diagnoseUsersLive.mjs](../../capaServidor/scripts/diagnoseUsersLive.mjs): proceso loopback independiente, repositorio/servicios/router base extraídos del commit `887a9c056646f793ada969c23db657a2e284f42a`, comparados con el árbol modificado. El resto de dependencias es compartido. No se reemplazó la API en uso ni se hizo checkout/reset.
- El harness conserva middleware real de JWT, identidad, capacidades, cuota de desarrollo y auditoría de soporte. Las mutaciones exigen `--allow-aiven-test-writes`, nombres `prueba.optfinal.*` y comprobación del binding del objetivo. Las fallas controladas solo se aplican a esas cuentas. El transporte padre/hijo lleva respuestas por pipes privados en memoria; no se deben redirigir cuerpos de alta a logs.
- El reloj HTTP termina **después de consumir el cuerpo**. Las transacciones y la auditoría de negocio ya finalizaron; la auditoría global de soporte existente es asíncrona al `finish`. Se registra también `settledMs` esperando su escritura, sin sumar ese tiempo a la confirmación visible del endpoint.
- Los campos `sql` contienen tipo, tabla, huella del SQL sin parámetros, duración del adaptador y etapa. **No son tiempos puros del motor.** `sqlDataQueries` cuenta SELECT/INSERT/UPDATE/DELETE anteriores a la respuesta; `sqlTransactionEvents` separa los eventos transaccionales emitidos por Prisma. No cuentan paquetes PREPARE/EXECUTE/CLOSE ni garantizan que Prisma emita cada BEGIN físico.
- RPC cuenta el cliente **administrativo** de Keycloak. Las peticiones OIDC de login y la obtención de JWKS del middleware no se incluyen en ese contador, aunque su espera sí afecta al reloj HTTP cuando corresponde. No se inventó un conteo de esos intercambios no instrumentados.
- Duraciones de etapas padre/hija y SQL/RPC paralelos **no se suman como camino crítico**. La CPU corresponde al proceso diagnóstico durante la petición y su asentamiento, no al servidor MySQL ni a todo el equipo.

Evidencia saneada: [gestion-usuarios-real.json](evidencia/gestion-usuarios-real.json): **48 muestras HTTP instrumentadas**, 11 muestras de la API habitual, 14 comprobaciones funcionales agrupadas, planes, métricas del motor/driver y referencias de cinco cuentas ficticias. Incluye hashes SHA-256 del código productivo final. No contiene cuerpos con datos empresariales ni credenciales.

Las altas usan cuentas nuevas diferentes, con los mismos campos ficticios y condiciones funcionales, pero nombres/RUT únicos y sin restaurar un snapshot físico. Hay **una muestra por versión de alta**: la diferencia observada no es una estimación estadística estable. Para edición se usaron dos fixtures equivalentes, mismo actor/PIN, los mismos cambios alternados de nombre, rol y estado; tres pares con orden antes/después, antes/después y después/antes. El primer par pasa de Pendiente a Activo en ambos casos; los restantes parten de Activo. Se conserva la variación de red/Keycloak y el calentamiento.

**No hay p95 real:** n=1, 3 o 5 no se consideró suficiente; los JSON lo marcan null. Los máximos se muestran siempre. Las muestras sintéticas n=30 de la primera etapa siguen separadas.

### Mejoras adicionales implementadas al medir

Las trazas confirmaron que las escrituras recuperaban filas que nadie consumía y releían datos del journal ya determinados por una escritura condicional confirmada. Se aplicó en `keycloakIdentity.repo.js`:

| Función | Antes comprobado | Decisión y garantía conservada |
| --- | --- | --- |
| `claim` | INSERT del journal seguido de hidratación del mismo registro | Inserción de una fila con ID/revisión/payload conocidos y confirmación `count === 1`. En P2002 se conserva la lectura del journal existente y el conflicto de digest. No se usa `skipDuplicates`. |
| `acquire` | UPDATE condicional por revisión/estado y SELECT inmediato del journal | Tras confirmar una fila, devuelve la revisión exactamente adquirida y estado running. Un CAS perdido retorna null; no roba operaciones. |
| `complete` | Relectura del journal dentro del commit local | Retorna los campos de negocio conocidos tras escritura condicional, vínculo y auditoría; la promesa sigue esperando el commit. Para usuario nuevo solo selecciona su ID; para reutilizado selecciona exclusivamente los campos verificados, sin datos de PIN. |
| `finish` | UPDATE condicional y SELECT de la misma operación | Devuelve created únicamente al resolver la transacción. La confirmación posterior a un commit ambiguo sigue consultando el journal real. |
| `insertOne` privado | INSERT+SELECT de bindings/auditorías cuyos IDs generados no se utilizan | Reutiliza `createMany` para **una sola fila**, valida count=1 y mantiene restricciones/errores/rollback. No cambia el repositorio global de auditoría ni su contrato de retorno. |
| `beginUpdate` | UPDATE del marcador seguido de hidratación no consumida | `updateMany` condicionado por ID/estado leído con bloqueo; exige una fila. Conserva el propietario `Actualizando:*`, actor y rechazo de provisión incompleta. |
| `fail`, `finishUpdate` | Hidratación innecesaria de la auditoría insertada | Conservan la escritura auditada en la misma transacción, sin recuperar una fila no usada. Una inserción de auditoría no confirmada impide éxito. |

El uso de `createMany` y sus retornos de conteo está documentado por [Prisma v7](https://www.prisma.io/docs/orm/v7/reference/prisma-client-reference). No se suprimieron lecturas frescas del actor, validación del PIN, verificaciones remotas, compensaciones ni commits. Las fechas internas generadas por la DB no se rehidratan cuando no se consumen ni exponen en el resultado administrativo.

Se añadieron pruebas de CAS perdido, conflicto único/replay, inserción no confirmada, auditoría obligatoria y espera de commit/fallo de commit. La ejecución física confirmó que bindings, roles y auditoría siguen almacenados.

### ANTES / DESPUÉS reales y meta de un segundo

Tiempos en **ms**, versión base del commit indicado frente a implementación final. “SQL / tx” distingue sentencias de datos y eventos transaccionales anteriores a la respuesta; RPC incluye token técnico y UUID de cliente cuando están fríos.

| Acción | n antes / después | ANTES p50 / máximo | DESPUÉS p50 / máximo | SQL / tx antes → después | RPC antes → después | ≤1.000 ms |
| --- | ---: | ---: | ---: | --- | --- | --- |
| Alta confirmada | 1 / 1 | 15922,152 / 15922,152 | 12591,539 / 12591,539 | 22/4 → 15/3 | 17 → 17 | **No cumple** |
| Editar nombre, mismo recorrido administrativo | 3 / 3 | 10587,674 / 11242,883 | 8673,168 / 8842,799 | 15/3 → 10/3 | 10 → 10 | **No cumple** |
| Listado en comparación inicial | 1 / 1 | 1702,695 / 1702,695 | 1607,719 / 1607,719 | 3/0 → 3/0 | 0 → 0 | **No cumple; sin mejora atribuible del listado** |
| Resumen | 0 / 1 | Sin medición comparable | 1258,619 / 1258,619 | — → 2/0 | — → 0 | **No cumple** |
| Detalle individual | 0 / 1 | Sin medición comparable | 2380,178 / 2380,178 | — → 2/0 | — → 4 | **No cumple** |
| Búsqueda exacta por username | 0 / 1 | Sin medición comparable | 1960,994 / 1960,994 | — → 3/0 | — → 3 | **No cumple** |
| Movimientos con inspección | 0 / 1 | Sin medición comparable | 1966,870 / 1966,870 | — → 4/0 | — → 2 | **No cumple** |
| Cambiar rol | 0 / 1 | Sin medición comparable | 7195,624 / 7195,624 | — → 10/3 | — → 16 | **No cumple** |
| Desactivar | 0 / 1 | Sin medición comparable | 7922,758 / 7922,758 | — → 10/3 | — → 8 | **No cumple** |
| Rehabilitar | 0 / 1 | Sin medición comparable | 8378,099 / 8378,099 | — → 10/3 | — → 9 | **No cumple** |
| Conciliar hasta user_created | 0 / 1 | Sin medición comparable | 9652,322 / 9652,322 | — → 14/3 | — → 13 | **No cumple** |
| Replay idempotente del alta | 0 / 1 | Sin medición comparable | 5634,776 / 5634,776 | — → 5/1 | — → 0 | **No cumple** |

Reducción observada del alta: **20,92 %** en esas dos muestras. Reducción de la mediana de edición: **18,08 %**, n=3 por versión. No se promete repetir esos porcentajes con otro estado, red, carga o topología. La reducción de sentencias está verificada en las trazas: en alta se eliminaron siete consultas de datos y un evento transaccional; en edición, cinco consultas de datos.

No se ocultaron intentos intermedios: el primer cambio de alta, que solo evitaba un checkpoint, dio **16767,489 ms** (más lento que la muestra base pese a ejecutar menos SQL). Quitar tres relecturas del journal produjo una muestra de **14477,190 ms**; evitar hidrataciones no consumidas y acotar proyecciones produjo la muestra final de **12591,539 ms**. Son etapas diferentes conservadas con labels `create-current`, `create-final` y `create-optimized`, no tres muestras de una misma versión.

Desglose de etapas del alta, una muestra por versión; incluye esperas de transporte/driver y no debe interpretarse como CPU del motor:

| Etapa | Antes ms | Final ms |
| --- | ---: | ---: |
| Validación real del PIN | 933,788 | 1048,807 |
| Claim del journal | 1367,382 | 667,497 |
| Adquisición del journal | 1233,677 | 660,941 |
| Checkpoints | 664,687 y 580,931 | 660,141 |
| Persistencia local transaccional / binding / auditoría | 4068,763 | 3301,203 |
| Finalización durable | 1502,004 | 1096,084 |
| Suma de duraciones SQL de datos/tx capturadas antes de respuesta | 10762,79 | 8346,79 |
| Suma de duraciones RPC, con lecturas que pueden solaparse | 2093,94 | 1273,43 |
| CPU del proceso diagnóstico, incluyendo asentamiento de auditoría global | 829 | 937 |

No se suman las filas para reconstruir la duración: hay etapas contenidas unas en otras, lecturas paralelas, conexión/BEGIN/JWKS y otros intervalos. La captura fría incluye inicialización del cliente/pool; no se extrapola a un cliente caliente.

Control adicional contra **la API habitual**, sin el servidor de instrumentación:

| Lectura | n | HTTP ms y máximo | Bytes |
| --- | ---: | ---: | ---: |
| Listado | 1 | 1620,339 | 3572 |
| Resumen | 1 | 1241,947 | 87 |
| Movimientos de cuenta ficticia | 1 | 2034,603 | 46 |

Detalle y búsqueda exacta devolvieron el mismo DTO de **410 bytes**; movimientos estaba vacío y no representa un historial grande. Filtros combinados retornaron una fila/total 1; la página 2 quedó vacía con total 1. Una cadena semejante a inyección devolvió cero filas/total 0, sin error SQL ni ampliación del alcance.

La consulta del conector de navegador devolvió `The browser access host is unavailable`. No se instaló una extensión ni se sorteó la restricción de verificación de URL. **Tiempo clic → resultado visible en navegador: no medido.** Los tiempos HTTP reales superiores a un segundo ya impiden certificar el objetivo completo en este entorno, aunque el render fuera instantáneo.

### Causas comprobadas, RAM y opciones no adoptadas

**1. Consulta pequeña frente a recorrido remoto.** En conexión dedicada con los mismos predicados y parámetros, sin modificar el protocolo de la aplicación:

| Consulta | n | Tiempo completo dedicado ms | Tiempo del motor ms | Filas examinadas / enviadas |
| --- | ---: | --- | --- | --- |
| Página real Usuario/ExternalIdentity | 3 | 230,435; 219,309; 219,523 | 10,2363; 0,8540; 0,9411 | 20 / 10 |
| COUNT del mismo alcance | 3 | 219,143; 219,253; 218,946 | 0,7467; 0,9697; 0,7843 | 50 / 1 |

El motor se midió con `performance_schema.events_statements_history`, limitado al **hilo propio** y a un marcador exacto de cada consulta; no se extrajeron SQL ni parámetros de otros usuarios. Los resultados de negocio solo se contaron, no se guardaron. La diferencia prueba que **la ejecución del SELECT no consume los segundos observados de HTTP** para este conjunto pequeño; no exonera otras consultas, discos o cargas futuras.

El EXPLAIN del nuevo bloqueo usa `external_identity_subject`, `PRIMARY` e `identity_provision_username`, con acceso const/una fila en cada tabla. No hay evidencia actual que justifique agregar índices a ese recorrido.

**2. Preparación de sentencias y pool.** El código instalado del adaptador normaliza `prepareCacheLength` a 0 y usa `execute`. En una conexión dedicada, cinco muestras calientes por serie:

| Modo diagnóstico | p50 ms | Máximo ms | Com_stmt_prepare / execute / close observados |
| --- | ---: | ---: | --- |
| Texto, caché 0 | 219,021 | 219,462 | 0 / 0 / 0 |
| Binario, caché 0 | 438,041 | 438,193 | 10 / 5 / 5 |
| Texto, caché 16 | 219,521 | 219,867 | 0 / 0 / 0 |
| Binario, caché 16 | 219,418 | 220,012 | 0 / 5 / 0 |

Son contadores del servidor, **no una captura de paquetes**. No se convierten los 10 prepares observados en 10 viajes de red. El motor del SELECT de texto se observó en 0,3107/0,3149 ms; las muestras binarias no tuvieron un registro de motor correlacionado y se dejaron sin esa medición. El comportamiento PREPARE/EXECUTE/CLOSE y la caché LRU están descritos por [MariaDB Connector/Node.js](https://mariadb.com/docs/connectors/mariadb-connector-nodejs/connector-nodejs-promise-api) y sus [opciones](https://mariadb.com/docs/connectors/mariadb-connector-nodejs/node-js-connection-options).

Se contrastó después con el recorrido HTTP completo, mismo DTO verificado estrictamente, cinco lecturas por configuración:

| Listado, caché del pool diagnóstico | p50 ms | Máximo observado ms | SQL de datos |
| --- | ---: | ---: | ---: |
| 0, configuración actual | 1320,612 | 3124,026 | 3 |
| 16, experimento acotado | 1244,066 | 3328,184 | 3 |

Ambas series incluyen su primera petición fría. **Ninguna muestra de la serie con 16 quedó bajo un segundo**; su mínimo fue 1111,835 ms. También pasaron tres escrituras con 16 (8050,126–8462,143 ms), pero su cliente técnico se calentó de 10 a 8 RPC y no constituyen una comparación causal limpia con las otras ediciones.

Por ello **no se habilitó la caché global ni el protocolo de texto**, ni se desactivaron pings, controles de devolución o validación TLS. Se conservó el experimento reproducible `--prepare-cache=16`; falta estudiar variedad de SQL, uso real de cada conexión, presión de statements y carga representativa antes de aplicarlo a todos los consumidores. El ahorro dedicado es real; trasladarlo íntegramente al endpoint no está demostrado.

Una comprobación final de Prisma frío (`SELECT 1`, n=1) tomó **2061,393 ms**, incluyendo inicialización/conexión del cliente. No se compara ese valor con la consulta dedicada caliente de 219 ms ni se oculta dentro de una mediana caliente.

**3. Memoria: observaciones y lo que falta.** Aiven informó buffer pool de InnoDB de **32 MiB**, límite de 76 conexiones y `max_prepared_stmt_count=16382`. Buffer pool no equivale a RAM total del servidor. El equipo local tenía 16961523712 bytes de RAM utilizable; RAM libre 7885996032 al inicio y 8156131328 al final. La API habitual mostró working set **124694528 bytes**, memoria privada **127037440 bytes** y 12 hilos en una captura puntual.

No se observó una consulta de listado lenta dentro del motor, ni saturación de conexiones en las dos fotos globales: 13→20 conectadas y 2 ejecutándose, con límite 76. `Slow_queries` permaneció en 27. Esperas globales de filas pasaron 40→42 y tiempo acumulado 46566→47050 ms; esos contadores incluyen otros clientes y la prueba concurrente, no se atribuyen enteramente al módulo.

**Veredicto acotado:** el módulo tenía viajes SQL evitables, corregidos. El costo residual medido está dominado por esperas del recorrido remoto/driver y operaciones secuenciales necesarias; las lecturas de motor observadas fueron muy inferiores al tiempo completo. **No hay evidencia suficiente para culpar a una mala asignación de RAM**, ni para descartarla con más volumen/concurrencia. No se midieron RAM libre/CPU/swap del host Aiven, GC/picos de la API, paquetes o la futura LAN. No se aumentó memoria ni se alteraron parámetros de durabilidad (`innodb_flush_log_at_trx_commit=1`, `sync_binlog=1`).

### Comprobaciones reales de integridad y seguridad

| Caso real | Resultado |
| --- | --- |
| Alta confirmada | HTTP 201, Usuario/ExternalIdentity/journal enlazados, rol efectivo único y auditoría física; contraseña solo en la primera respuesta, mantenida en memoria. |
| Primer ingreso | Keycloak exigió cambiar la contraseña temporal; el flujo con PKCE completó token válido y `/api/auth/profile` respondió 200. Ese primer perfil tardó 3613,350 ms e incluyó activar Pendiente; no se presenta como optimización de Mi Perfil. |
| Rol insuficiente / movimientos ajenos | La cuenta ficticia sin administración recibió 403 tanto en listado administrativo como al pedir movimientos de otra cuenta. |
| Cambio de rol | PATCH 200; token con rol anterior rechazado con 403; nuevo login con el rol actualizado obtuvo perfil 200. |
| Deshabilitar y rehabilitar | Token existente recibió 403 y login nuevo fue denegado mientras estaba disabled; después de rehabilitar, login y perfil volvieron a 200. |
| Dos escrituras concurrentes | API habitual: una 200 en 8556,439 ms y otra 409 `IDENTITY_UPDATE_BUSY` en 5347,270 ms. Nombre esperado, rol, binding y journal físicos correctos. Solo dos operaciones, sin simulación de 40 usuarios. |
| Fallo controlado después del commit local y antes de activar | Provisión 202 needs_reconciliation en 12897,356 ms, cuenta externa disabled, binding/journal preservados, sin contraseña retornada y dos auditorías físicas. El fallo se inyectó **antes de enviar** el PUT de activación, no se provocó una caída real de Keycloak. |
| Conciliación de esa provisión | 202 con outcome user_created, journal created y vínculo correcto; cero nuevas credenciales devueltas/regeneradas, tres auditorías físicas y acceso externo habilitado al confirmar. |
| Fallo local controlado tras cambiar atributos remotos | 503 en 8923,293 ms; se inyectó antes de la transacción final. Compensación restauró el nombre anterior en ambos sistemas, estado/rol válidos y una auditoría reverted. No se simuló una avería del servidor DB. |
| Replay de alta | 201 con la misma operación; sin nueva contraseña ni RPC a Keycloak, conservando los cambios administrativos posteriores. |
| Payload distinto / rol privilegiado | 409 al reutilizar la operación con distinto payload; 403 al intentar asignar Soporte; cero RPC remotos en ambos casos. |
| Inspección / filtros / paginación | DTO de inspección y búsqueda exacta idéntico; autoinspección 403; movimientos autorizados 200. Página vacía conserva total filtrado y entrada semejante a SQL se trata como dato. |
| Estado al terminar | **Cinco cuentas deshabilitadas**, estado local Desvinculado, Keycloak enabled=false, journal created, vínculos/roles consistentes y auditorías persistidas. No fueron eliminadas, conforme a lo indicado por el usuario. |

Un intento diagnóstico usó un JWT vencido y recibió 401 en 394,319 ms, **sin SQL ni RPC administrativos**. Se renovó la sesión; se conserva separado y no se mezcla con los tiempos exitosos. PIN inválido/bloqueado, revocación durante PIN, respuesta perdida tras commit y fallo de commit se cubrieron con las pruebas de regresión; no se forzó un bloqueo del PIN del actor ni una caída real de Aiven.

Cuentas exclusivamente ficticias para posterior limpieza, todas con el sufijo `1793341553956`:

| Username | Estado final |
| --- | --- |
| `prueba.optfinal.antes.1793341553956` | Desvinculado / disabled |
| `prueba.optfinal.despues.1793341553956` | Desvinculado / disabled |
| `prueba.optfinal.final.1793341553956` | Desvinculado / disabled |
| `prueba.optfinal.optimizada.1793341553956` | Desvinculado / disabled |
| `prueba.optfinal.conciliacion.1793341553956` | Desvinculado / disabled |

Los IDs de operación/subject y resultados físicos están en el JSON, sin RUT, correo, PIN o contraseña. No se modificaron nombre, rol, contraseña ni PIN del actor suministrado; sus peticiones dejan la auditoría normal de soporte.

### Validación final y reproducción

- Backend completo disponible: desde `capaServidor`, `node --test test/*.test.js src/modules/auth/service/*.test.js src/modules/users/service/*.test.js`: **424/424 PASS**. Incluye usuarios, PIN/recuperación, autorización, Perfil, Mensajes, notificaciones, transacciones/driver y módulos vecinos.
- Frontend completo: desde `capaVista`, `npm test -- --maxWorkers=2`: **495/495 PASS**, 61 archivos. `npm run build`: **PASS**, 587 módulos.
- `npm run lint` global: **FAIL por los mismos tres imports previos sin uso en métricas**; no se alteró ese módulo. El lint de los JSX modificados está limpio.
- Sin cambios de esquema, migraciones, dependencias, `.env`, despliegue, pool global, TLS, parámetros de durabilidad ni historia Git. La auditoría obligatoria de usuario sigue siendo transaccional; no se adelantó éxito al commit.

Para repetir solo lecturas del diagnóstico, desde la raíz, sin credenciales en el comando:

```powershell
'{"action":"metadata"}' | node capaServidor/scripts/diagnoseUsersLive.mjs --allow-aiven-reads --reference=887a9c056646f793ada969c23db657a2e284f42a
@('{"action":"protocol"}','{"action":"engine-users"}') | node capaServidor/scripts/diagnoseUsersLive.mjs --allow-aiven-reads --reference=887a9c056646f793ada969c23db657a2e284f42a
```

`--reference` fija la base incluso después de nuevos commits. Los requests autenticados de comparación se suministran por stdin desde un proceso padre, con JWT/PIN en memoria. Las mutaciones requieren además `--allow-aiven-test-writes`; no se incluye una receta que guarde o imprima esos secretos. El script cierra conexiones/listener y elimina únicamente su directorio temporal de código tras verificar su ruta absoluta.

### Estado final y trabajo restante fundamentado

La implementación y las comprobaciones reales del módulo quedan realizadas en la rama indicada. **No se declara logrado el segundo** ni aceptada la futura LAN. La reversión de código conserva el procedimiento anterior y no exige migraciones; las cinco cuentas y la auditoría son datos reales de prueba y no se revierten borrando el diff.

La siguiente investigación debe reproducir el mismo recorrido con API/MySQL/Keycloak en la topología LAN prevista y capturar latencia entre servicios, política/calentamiento del pool, preparación de statements y recursos del host. Esa comparación permitirá separar cuánto desaparece al quitar el recorrido remoto y qué sigue requiriendo optimización. Las mediciones actuales no justifican aumentar RAM, debilitar el PIN, omitir confirmaciones, relajar durabilidad ni agregar índices arbitrarios.

Quedan sin certificar: tiempo visible en navegador, carga/volumen representativos de LAN, fallos reales de DB/red con respuesta de commit perdida, historiales grandes y escenarios heredados alterados fuera del flujo administrativo. La provisión running abandonada conserva revisión manual; la pérdida completa de una respuesta que contiene la contraseña inicial no habilita reentregas del secreto. La evidencia permite continuar esas decisiones sin confundir rendimiento sintético, motor SQL, transporte o una muestra pequeña con un SLO.

# OPT-03 — Rendimiento de Gestión de usuarios ITECSA

27 de octubre de 2026, America/Santiago. Base: `main`, commit `c0eef72` (Fase 1). El árbol estaba limpio al comenzar. No se realizaron commits, pushes, despliegues, migraciones ni escrituras sobre cuentas empresariales.

## A. Resumen

Se intervinieron los cuatro ámbitos: listado/resumen, creación, inspección/edición y movimientos. La Fase 1 permanece intacta: no se modificaron `UserRepository.findBySubject`, Mensajes, JWT, protocolo, pool ni TLS.

Resultados medidos sobre MySQL remoto: listado **1.276,985 → 662,488 ms**, binding **1.306,302 → 662,190 ms**, movimientos **1.982,238 → 665,516 ms**. Los GET de diagnóstico, con middleware real y autoridad JWT sintética, dieron **2.557,842 → 1.324,617 ms** para listado y **1.980,972 → 1.322,330 ms** para resumen.

**La meta de un segundo no está cumplida en los GET completos medidos.** Los repositorios calientes quedaron bajo el segundo en estas diez muestras; esto no certifica p95 ni el tiempo desde una acción real del usuario hasta su resultado visible.

La creación/conciliación conserva todos sus pasos; se acortaron esperas entre lecturas independientes. Edición evita PUT de atributos sin cambios. Se preservan tres lecturas frescas del actor durante las mutaciones, además del middleware. En frontend desapareció una recarga demostrada y se cancelan lecturas obsoletas, manteniendo las barreras contra respuestas tardías.

## B. Listado y resumen

| Operación | Problema anterior | Solución | Resultado |
|---|---|---|---|
| Página de usuarios | Hidratación separada del binding: 3 SELECT incluyendo count | JOIN parametrizado de nueve columnas para la página; count ORM paralelo | 2 SELECT; mismo DTO, total, orden y OFFSET |
| Resumen | Reconsulta inmediata del actor después de `requireActiveIdentity` | Contexto explícito con `req.currentUser` para lecturas | GET de 3 a 2 SELECT; se conserva el groupBy global |
| Listado HTTP | Actor redundante más relación adicional | Reutilización del actor y proyección de página | De 5 a 3 SELECT; mediana 48,21 % menor |
| Búsqueda/filtros | Solicitudes obsoletas continuaban y un timer inicial podía restablecer página 1 | AbortSignal y retorno temprano si el término normalizado no cambió | Se conserva debounce de 350 ms; sin retorno accidental de página |
| Creación desde otra página | Callback recargaba la página anterior y el efecto cargaba página 1 | Si cambia la página, el efecto hace la única carga de listado | Traza comprobada `[1,2,2,1] → [1,2,1]` |

Se conservan búsqueda parcial por nombre, apellido, correo, RUT y username, combinaciones de rol/estado, alias Activo/Vinculado, estados de actualización y páginas numeradas. No se introdujeron FULLTEXT, índices ni carga infinita. Los patrones `%`, `_`, barra invertida e intentos de inyección se compararon contra el ORM anterior.

Listado y resumen siguen iniciándose en paralelo y mostrando resultados de forma independiente. No se descarga una representación Keycloak por fila. El groupBy ya era compacto: su mediana pasó de 661,709 a 661,271 ms, variación que **no se atribuye a una optimización SQL**. La mejora del resumen está en eliminar el SELECT redundante del actor dentro de la petición.

## C. Creación y conciliación

Cambios aplicados:

- La verificación de credencial consulta simultáneamente la representación del usuario y los metadatos de credenciales; exige ambos: contraseña configurada y required action `UPDATE_PASSWORD`.
- Después de comprobar que la cuenta está deshabilitada, las lecturas de roles efectivos, directos y representación del rol se ejecutan en paralelo. DELETE, POST y verificación final mantienen su orden.
- La resolución del UUID del cliente comparte únicamente la promesa en curso. Evita peticiones duplicadas al iniciar esas lecturas concurrentes; un error limpia la promesa y permite un reintento posterior. El caché previo de UUID y el token técnico existente se conservan.
- La confirmación del alta invalida listado/resumen una vez, sin solicitar también la página anterior. La contraseña temporal sigue mostrándose antes de notificar al padre y se descarta al aceptarla.

Secuencia conservada: autorización y PIN; relectura del actor; claim durable e idempotente; adquisición de la operación; búsqueda exacta y acotada de username; creación deshabilitada; checkpoints; validación de propiedad de la provisión; asignación y verificación de rol; revalidación fresca del actor; credencial temporal y comprobación; persistencia local transaccional y auditoría; habilitación y verificación; finalización durable; respuesta confirmada. La conciliación no regenera ni vuelve a entregar la contraseña.

Se mantienen HTTP 202 y estados pendientes, revisión de payload, revisiones del journal, bloqueo de operaciones en curso, compensación y `needs_reconciliation` ante fallos. No se eliminaron checkpoints ni se añadieron reintentos automáticos ante POST de resultado incierto. No se cambió el hashing del PIN ni la generación de contraseñas.

En el benchmark sintético de servicios, la creación mantuvo **18 llamadas HTTP** y **3 lecturas de actor**, reduciendo la mediana **146,639 → 130,481 ms** por concurrencia de lecturas. La conciliación mantuvo **15 llamadas HTTP** y **3 lecturas de actor**, con **120,608 → 104,647 ms**. Son fixtures nuevos por muestra, con latencia artificial de 5 ms por I/O y PIN simulado; **no son tiempos reales de creación ni incluyen el hash real del PIN**.

No se modificó el formulario para microoptimizar cálculos pequeños sin evidencia. Se verificaron sus validaciones, bloqueo de doble envío, PIN y entrega restringida de credencial mediante las pruebas existentes.

## D. Inspección y edición

El binding de un objetivo conserva sus seis campos externos y seis campos del usuario, ahora obtenidos con un JOIN indexado y un SELECT. Se mantiene la clave completa provider/issuer/subject y el enlace por `user_id`; no se utiliza correo o username como sustituto de identidad.

`inspect` sigue autorizando al actor, prohibiendo autoedición y verificando rol administrable, estado de actualización, subject, ID local, username remoto y rol efectivo único. Tras validar el binding, `getUser` y `roles` se ejecutan en paralelo. La representación remota no se guarda entre peticiones. La apertura del editor admite cancelación al salir/cambiar el cliente de sesión y descarta resultados tardíos.

Edición conserva el bloqueo local `Actualizando:…`, deshabilitación remota, logout, persistencia, auditoría, comprobaciones posteriores y compensación. Se comparan nombre, apellido y correo con la representación remota de esta misma operación: solo se envían atributos cambiados y no se hace ese PUT si ninguno cambió. Se siguen verificando los tres valores después; no se omite PIN, logout ni auditoría por tratarse de un cambio nulo. RUT continúa editable solo en los contratos donde ya estaba permitido; no se agregaron campos nuevos al PATCH.

La autorización inicial de mutaciones siempre relee el actor. Las llamadas después del PIN y después de las esperas remotas también lo releen con `revalidate: true`. Las inspecciones posteriores a búsqueda remota por username o a un claim de preparación fuerzan igualmente revalidación, aun si existe `currentUser`.

El PATCH continúa devolviendo `{outcome, subject}`. Ese DTO no permite reconstruir de forma segura una fila filtrada y todos los contadores frente a cambios concurrentes. Por ello se conserva **una** invalidación paralela de listado/resumen después de la confirmación; no se inventan contadores ni se parchean datos incompletos. El editor se cierra después del PATCH confirmado, no antes.

## E. Movimientos

Se creó una proyección administrativa específica en `userMovements.repo.js`; el repositorio compartido de Perfil permanece sin cambios. El listado usa LEFT JOIN a pagos, etapas y subprocesos, todos enlazados por PK única de registro, evitando hidrataciones sucesivas. El count ORM conserva exactamente `buildRecordsWhere`; página y count siguen en paralelo como antes.

Se conservan ID, fecha, observación, orden `FECHA_HORA DESC, ID_REGISTRO DESC`, total, página y tamaño. Se mantiene la prioridad original del detalle: pago, etapa, subproceso, observación recortada o fallback. La existencia de una relación se distingue de un nombre nulo, por lo que se conservan «No informado/No informada». La búsqueda conserva prefijos, coincidencias parciales e identificador numérico seguro.

**No se eliminó la inspección remota del objetivo.** El historial sigue exigiendo binding consistente, rol permitido y username/rol efectivo coincidentes con Keycloak. Se mantiene el rechazo de autoobjetivo y de actualizaciones en curso. Un objetivo deshabilitado continúa siendo consultable cuando cumple la política administrativa previa. Las pruebas impiden llamar al repositorio de movimientos ante inconsistencias remotas.

Repositorio: **8 → 2 SELECT**, mediana **1.982,238 → 665,516 ms**. El endpoint completo de movimientos con Keycloak real es **No medido**. No se presenta el tiempo del repositorio como el del modal.

El modal conserva búsqueda por envío explícito, paginación, loading, errores, contenido y controles. Al cambiar consulta/usuario o cerrar, cancela su propia lectura y mantiene el guard contra respuestas tardías. Un lector con señal posee su solicitud: no aborta otra promesa de movimientos compartida por consumidores sin señal. El contrato opcional adicional sigue siendo compatible con Perfil; no se optimizó su backend en esta tarea.

## F. Rendimiento global y metodología

Referencia actual tomada antes de los cambios: `c0eef72`, no los tiempos anteriores a la Fase 1. Procesos temporales separados de la API activa, Node 22.23.4, Prisma/adapter 7.10.0, driver 3.5.4 y MySQL remoto 8.4.8 del entorno de Fase 1. No se actualizaron dependencias. Misma configuración TLS, pool de diagnóstico 10 y timeouts 8.000/15.000 ms. Consultas calientes tras warm-up; diez muestras y pausas de 250 ms fuera del reloj. No se comparó arranque frío ni producción.

| Operación | Antes (ms) | Después (ms) | Reducción | Muestras | Cumple 1 s |
|---|---:|---:|---:|---:|---|
| Listado, repositorio | 1.276,985 | 662,488 | 48,12 % | 10 + 10 | Solo etapa interna; diez muestras <1 s |
| Resumen, repositorio | 661,709 | 661,271 | No atribuible | 10 + 10 | Solo etapa interna; sin cambio SQL |
| Binding, repositorio | 1.306,302 | 662,190 | 49,31 % | 10 + 10 | Solo etapa interna |
| Movimientos, repositorio | 1.982,238 | 665,516 | 66,43 % | 10 + 10 | Solo etapa interna |
| GET listado, diagnóstico HTTP | 2.557,842 | 1.324,617 | 48,21 % | 10 + 10 | **No** |
| GET resumen, diagnóstico HTTP | 1.980,972 | 1.322,330 | 33,25 % | 10 + 10 | **No** |
| Inspección con Keycloak real | No medido | No medido | — | 0 | No evaluable |
| Alta/conciliación real completa | No medido | No medido | — | 0 | No evaluable |
| Edición/rol/estado reales completos | No medido | No medido | — | 0 | No evaluable |
| Movimientos HTTP con Keycloak real | No medido | No medido | — | 0 | No evaluable |

En el proceso posterior también se ejecutó el repositorio anterior: listado **1.321,392 ms**, movimientos **1.976,434 ms**. Refuerza que la diferencia no corresponde únicamente a dos momentos de la red. Rangos posteriores: listado **441,947–914,368 ms**, movimientos **657,796–673,901 ms**, GET listado **1.319,468–1.334,201 ms**, GET resumen **1.230,062–1.330,818 ms**.

Los GET usan los routers/controladores, middleware JWT, claims, identidad activa y capabilities reales, con una autoridad RS256/JWKS sintética en loopback y cuota en memoria de 120/minuto. No son sesiones empresariales de Keycloak ni la configuración productiva de cuota SQL. Se consume y compara el DTO completo: listado **3.285 bytes** y resumen **86 bytes**, idénticos antes/después. El reloj termina después de consumir el cuerpo. No incluye navegador/render ni el middleware global de auditoría de soporte de la API activa.

Mínimo, mediana, **media**, máximo, SELECT, SQL físico sin parámetros y muestras individuales están en [antes](OPT-03_RENDIMIENTO_antes.json), [después](OPT-03_RENDIMIENTO_despues.json) y [HTTP](OPT-03_RENDIMIENTO_http.json). No se calcula p95/p99 con diez muestras. No se certifica un SLO basándose en una mediana.

Benchmark sintético de orquestación, separado del entorno real:

| Escenario | Antes (ms) | Después (ms) | Muestras por versión |
|---|---:|---:|---:|
| Inspección | 31,511 | 21,099 | 10 |
| Movimientos con inspección | 36,471 | 26,229 | 10 |
| Creación nueva completa | 146,639 | 130,481 | 10 |
| Conciliación | 120,608 | 104,647 | 10 |
| Edición de nombre | 83,547 | 78,216 | 10 |
| Cambio de rol | 120,459 | 99,389 | 10 |
| Cambio de estado | 83,112 | 72,709 | 10 |
| Edición sin atributos cambiados | 83,114 | 72,768 | 10 |

Fuente: [workflows sintéticos](OPT-03_RENDIMIENTO_workflows_sinteticos.json). Cada muestra crea su fixture y cliente técnico desde cero. Se usan los servicios reales y HTTP/DB/PIN dobles con 5 ms por operación, sin sockets ni base real. Las reducciones demuestran menor camino secuencial y menos llamadas en los casos indicados; **no demuestran cumplir un segundo real** ni representan un alta idempotente reutilizada como si fuera nueva.

## G. SQL, equivalencia e índices

| Función / flujo | SELECT antes | SELECT después | Datos recuperados | Resultado |
|---|---:|---:|---|---|
| Página y count de usuarios | 3 | 2 | Nueve columnas de página; mismo count | Igual DTO |
| Resumen ORM | 1 | 1 | Agrupación global por estado | Igual resultado |
| Binding de objetivo | 2 | 1 | Mismos campos externos/locales necesarios | Igual estructura anidada |
| Historial administrativo y count | 8 | 2 | Nueve columnas de historial; count original | Igual ID, Date, detalle, total y página |
| GET listado medido | 5 | 3 | Identidad Fase 1 + consultas del módulo | Actor redundante eliminado |
| GET resumen medido | 3 | 2 | Identidad Fase 1 + groupBy | Actor redundante eliminado |

Estos conteos corresponden a todas las muestras de los fixtures instrumentados, no a cualquier relación vacía o cualquier rama de una mutación. No hay conteos físicos de SQL de creación/edición reales; los contadores de actor del benchmark sintético son invocaciones a un doble, no SELECT observados.

Se verificó igualdad estricta en **27 comparaciones reales acotadas**: trece escenarios de listado, once de historial, dos bindings y resumen. Incluyen búsquedas parciales, comodines, barra invertida, inyección como parámetro, estados, roles, combinación de filtros y páginas 2/500. Los tests adicionales comprueban Unicode, nulls, fechas y precedencia de relaciones. Se usa Prisma `sql/join` y tagged templates; ningún input se concatena como SQL y no se usa `$queryRawUnsafe`.

Metadatos reales y EXPLAIN de lectura están en el JSON posterior. Para historial, el motor usa `Registros_Usuario_FK`, estima **198 filas** y muestra `Using temporary; Using filesort`; las relaciones por registro usan sus PK, con una tabla de tres estados de pago mediante hash join. No se interpreta esa estimación como conteo exacto ni como tiempo de CPU. Se conservan los índices únicos del binding. No se agregó el índice compuesto de historial: no hubo un entorno aislado para demostrar beneficio e impacto en escrituras, y la mejora ya observada está en evitar viajes/hidrataciones. No se ejecutó EXPLAIN ANALYZE ni DDL.

## H. Keycloak

Conteos trazados por el fetcher del benchmark sintético, con cliente frío en cada muestra. Incluyen **un POST de token técnico y un GET de UUID de cliente**; no son conteos de llamadas del servidor productivo con cachés calientes.

| Operación | Llamadas anteriores | Llamadas nuevas | Dependencias conservadas | Resultado |
|---|---:|---:|---|---|
| Inspección | 4 | 4 | Actor/binding antes de lecturas | Usuario/roles concurrentes |
| Movimientos con inspección | 4 | 4 | Inspección remota obligatoria | Misma validación del objetivo |
| Creación | 18 | 18 | Cuenta deshabilitada, rol, credencial, MySQL, activar/verificar | Menor espera, sin omitir llamadas |
| Conciliación | 15 | 15 | Propiedad del journal, sin regenerar credencial | Menor espera |
| Editar nombre | 10 | 10 | Disable, logout, atributos, verificar y confirmar | Payload de atributos mínimo |
| Cambiar rol sin modificar atributos | 17 | 16 | Guard disabled, roles efectivos/directos, DELETE→POST→verificar | No PUT de atributos vacío |
| Cambiar estado sin modificar atributos | 10 | 9 | Disable/logout y verificación de habilitación final | Un PUT innecesario menos |
| Actualización sin atributos cambiados | 10 | 9 | PIN, locks, auditoría y verificaciones | No se convierte en éxito anticipado |

El token técnico ya tenía caché/flight y no se reimplementó. No se cachean roles, permisos activos, estados administrativos, inspecciones, PIN ni credenciales temporales. El UUID mantiene su ámbito de instancia/configuración existente; la promesa adicional se elimina al terminar o fallar.

El target elegido para la lectura Keycloak real produjo `KEYCLOAK_USER_NOT_FOUND`; no se cambiaron cuentas ni bindings para fabricar un benchmark exitoso. La consulta acotada de serverinfo produjo `KEYCLOAK_INVALID_RESPONSE` bajo el contrato de transporte existente, por lo que **la versión real de Keycloak no pudo verificarse**. No se infiere de la versión del SDK. Las pruebas de escritura y endpoints se hicieron con dobles, manteniendo métodos/rutas ya utilizados por la aplicación.

## I. Seguridad y consistencia

JWT, issuer, audience, subject, rol, capabilities, rate limiting y `requireActiveIdentity` no se modificaron. El router añade el actor de middleware al contexto interno; nunca toma esa identidad del body/query. Se valida subject coincidente, ID entero positivo, estado activo y rol. Los consumidores internos sin contexto siguen consultando al actor. No hay caché de autorización entre peticiones.

Mutaciones conservan PIN y revalidación posterior; los checks después de trabajo remoto fuerzan lectura fresca. Los tests revocan al actor durante PIN y durante Keycloak y comprueban rechazo y ausencia de confirmación exitosa. No se cambian cuotas, scrypt, intentos/bloqueos, transacciones, locks, auditoría, revisiones del journal ni compensaciones.

Las lecturas concurrentes se esperan antes de las escrituras dependientes. Un fallo no provoca reintentar automáticamente una mutación incierta. Los checkpoints y activación permanecen en secuencia; los resultados parciales siguen siendo parciales. Las pruebas existentes cubren fallos de creación, contraseña, verificación, MySQL, activación/finalización y compensación, además de entrega única de credencial y rechazo de PIN.

AbortController se usa únicamente para GET de listado, resumen, inspección y movimientos. Se conservan timeout general y guardas de sesión del cliente común. Cancelar un GET no garantiza cancelar un SELECT ya iniciado: se evita que su respuesta actualice otra consulta o sesión, sin afirmar trabajo SQL eliminado que no se midió. POST/PATCH no reciben esas señales ni se reintentan.

## J. Archivos creados/modificados

| Archivo | Cambio |
|---|---|
| `capaServidor/src/modules/users/repo/keycloakIdentity.repo.js` | Proyecciones de listado y binding; delegación de historial administrativo |
| `capaServidor/src/modules/users/repo/userMovements.repo.js` | Nuevo JOIN de historial, DTO y count equivalente |
| `capaServidor/src/modules/users/routes/keycloakIdentityPreparation.routes.js` | Contexto interno con actor de middleware |
| `capaServidor/src/modules/users/service/keycloakIdentityAdministration.service.js` | Reutilización segura, revalidaciones explícitas, lecturas concurrentes y atributos cambiados |
| `capaServidor/src/modules/users/service/keycloakManagement.service.js` | Lecturas independientes concurrentes y UUID single-flight |
| `capaVista/src/modules/users/api/adminUsersApi.js` | Opciones de cancelación para GET y aislamiento de lectores de movimientos |
| `capaVista/src/modules/users/components/UserMovementsModal.jsx` | Cancelación de lectura al cambiar/cerrar |
| `capaVista/src/modules/users/pages/UserManagementPage.jsx` | Cancelación, guardas, debounce y recarga única tras creación |
| `capaServidor/src/modules/users/service/usersPerformance.test.js` | Diez tests de SQL, autorización, PIN/rol, revocación y paralelismo |
| `capaVista/src/modules/users/pages/UserManagementPerformance.test.jsx` | Nueve tests de cargas, filtros, creación, edición, errores y cierre |
| `capaVista/src/modules/users/components/UserMovementsModal.test.jsx` | Tres tests de historial, cancelación y aislamiento de solicitudes |
| `capaServidor/scripts/benchmarkUsersOpt03.mjs` | Lecturas medidas, referencia, equivalencia y EXPLAIN |
| `capaServidor/scripts/usersHttpProbeOpt03.mjs` | GET administrativos en loopback con JWT sintético |
| `capaServidor/scripts/benchmarkUsersWorkflowsOpt03.mjs` | Comparación de servicios con dependencias sintéticas |
| `docs/OPT-03_RENDIMIENTO_antes.json` | Línea base actual post Fase 1 |
| `docs/OPT-03_RENDIMIENTO_despues.json` | Muestras, equivalencia e índices/plan |
| `docs/OPT-03_RENDIMIENTO_http.json` | Muestras HTTP y tamaños de DTO |
| `docs/OPT-03_RENDIMIENTO_workflows_sinteticos.json` | Tiempos y trazas de llamadas sintéticas |
| `docs/OPT-03_RESPONSIVE.json` | Geometría y resultados de los 17 escenarios de navegador |
| `docs/OPT-03_GESTION_USUARIOS_RENDIMIENTO.md` | Este informe |

No se eliminaron archivos de aplicación. Se reemplazó la consulta ORM del listado y la lectura relacional de binding; las consultas compartidas de Perfil se conservaron porque siguen teniendo consumidores. No se añadieron dependencias, componentes visuales ni cambios de CSS. Los archivos de Fase 1 se conservaron. Las copias temporales de diagnóstico se separaron de los archivos de la API activa.

## K. Pruebas y reproducción

| Comando / prueba | Resultado |
|---|---|
| Backend de Usuarios + pruebas Fase 1 antes | 55/55 |
| `node --test src/modules/users/service/*.test.js test/phase1*.test.js` | 65/65, incluyendo diez nuevas |
| `node --test` backend completo | 130/133; mismos tres fallos Windows previos |
| Tests nuevos frontend de página/modal | 12/12 |
| Suite completa frontend final | 169/171; dos fallos previos de texto |
| `npm.cmd run lint` frontend | Pasa |
| `npm.cmd run build` frontend | Pasa; 336 módulos |
| `npm.cmd run prisma:validate` | Pasa |
| `node --check` en nueve archivos JS/MJS backend nuevos/intervenidos | Pasa |
| `git diff --check` | Pasa |
| `node scripts/verify-page-layout.mjs users` | 17 escenarios de navegador; cero overflow |
| Test de recarga aplicado a copia de `c0eef72` | Falla con traza `[1,2,2,1]`; pasa en actual con `[1,2,1]` |

Se verificaron carga independiente de tabla/resumen, resumen fallido y reintento sin recargar tabla, búsquedas, estados, navegación rápida, creación desde otra página, confirmación de PATCH antes de refrescar, 401/403/red, cancelación y respuestas tardías, cierre/cambio de objetivo y paginación del historial. Permanecen las pruebas de formularios, PIN, credenciales, modales y sesión existentes. La revisión en Edge headless usa AppLayout y componentes reales con identidad/API sintéticas, entre 320 y 1920 px, variaciones de sidebar y zoom; no es una sesión empresarial real ni un benchmark de render con tablas masivas. La evidencia está en [responsive](OPT-03_RESPONSIVE.json). No se cambió diseño ni política de movimiento reducido.

Fallos previos, sin cambiar tests para ocultarlos: `mysqlDeployment.test.js` compara LF con archivo CRLF; `mysqlLabMigrationHistory.test.js` calcula hashes sensibles a CRLF; `mysqlLabAccounts.test.js` espera permisos POSIX no representados igual en Windows. Los dos de frontend pertenecen a `PageMigration.test.jsx`, que busca el aviso ausente «Puedes crear usuarios y editar sus datos». Estaban documentados en Fase 1; no se agregaron avisos cosméticos para hacerlos pasar.

Regresiones/incidencias detectadas y corregidas: la suite completa hizo visible el timer inicial de búsqueda que restablecía una navegación rápida; se corrigió el código y se añadió un test explícito. El primer diagnóstico posterior no pudo serializar metadatos BigInt de índices: esa captura se descartó y se repitió con serialización de metadatos, sin alterar tipos de aplicación. Los tests JSDOM necesitaron un doble de `dialog.showModal/close` y un tick adicional para ejecutar el efecto posterior al debounce; se mantuvieron las aserciones de comportamiento. Lint, tests pertinentes y comparaciones posteriores pasan.

Reproducción, desde `capaServidor`, en una configuración de desarrollo previamente autorizada, con TLS y sin imprimir `.env`:

```text
node scripts/benchmarkUsersOpt03.mjs --allow-development-reads
node scripts/benchmarkUsersOpt03.mjs --allow-development-reads --reference-root=/ruta/copia/c0eef72
node scripts/benchmarkUsersOpt03.mjs --allow-development-reads --reference-root=/ruta/copia/c0eef72 --http-only
node scripts/benchmarkUsersWorkflowsOpt03.mjs --reference-root=/ruta/copia/c0eef72
```

La copia de referencia necesita sus dependencias instaladas o enlazadas y las mismas fuentes del commit. Se usaron copias temporales extraídas de Git, sin checkout sobre el trabajo actual. Los scripts de lectura exigen `APP_ENV=development`; el de workflows no carga `.env` ni accede a red. No hay comando de typecheck de proyecto ni build de backend; no se inventa su ejecución.

## L. Limitaciones y decisiones descartadas

No se dispone de MySQL/Keycloak aislados con identidades restaurables para mutaciones reales. Se completaron las mejoras comprobables con tests/dobles, sin crear, editar, activar, desactivar o conciliar cuentas empresariales para medirlas. Se requieren esos entornos para medir creación/edición y su PIN real, compensación distribuida, concurrencia de administradores y cuotas SQL integradas.

No se crearon caches de perfiles/inspecciones ni permisos para evitar viajes. No se eliminó inspección remota de movimientos porque comprueba consistencia de username/rol y binding. No se quitaron checkpoints ni verificaciones posteriores a writes. No se cambió OFFSET, semántica de `contains`, global middleware, protocolo, caché de statements, pool, TLS ni Keycloak/realm. No se agregó un índice sin medición aislada de beneficio e impacto. El resumen ya estaba agregado; no se reescribió para aparentar una mejora inexistente.

Documentación consultada: [Prisma 7, relaciones y requisito Preview de relationJoins](https://www.prisma.io/docs/orm/v7/prisma-client/queries/relation-queries), [paginación numerada/OFFSET](https://www.prisma.io/docs/orm/v7/prisma-client/queries/pagination), [MySQL 8.4 EXPLAIN](https://dev.mysql.com/doc/refman/8.4/en/explain.html) y [Keycloak Admin REST](https://www.keycloak.org/docs-api/latest/rest-api/index.html). No se habilitaron previews. La documentación latest de Keycloak no se trata como prueba de versión del servidor; no se agregaron endpoints nuevos a las operaciones de negocio.

Los GET de diagnóstico aún ejecutan identidad y lectura de negocio en secuencia, aunque count/página son paralelos. Su mejor muestra sigue sobre el segundo. Las mediciones muestran el costo de esos viajes en esta topología remota; no separan CPU de Prisma, preparación, ping, red y ejecución del motor. No se atribuye toda la latencia a un componente sin trazas adicionales. Cercanía de API/MySQL y recursos de LAN deben medirse en la infraestructura final autorizada; no se movieron servicios ni datos.

## M. Conclusión

Los cuatro ámbitos quedan abordados. Listado, binding e historial reducen consultas y transporte; el resumen elimina autorización local redundante; creación, conciliación y edición reducen esperas entre lecturas; edición evita escrituras de atributos sin cambios; el frontend elimina una recarga demostrada y descarta/cancela lecturas obsoletas.

Las etapas internas medidas quedaron bajo el segundo en diez muestras, pero **los GET de listado/resumen no cumplen el objetivo**. No hay evidencia para declarar cumplidas creación, edición, movimientos HTTP ni p95 real. Keycloak y la topología remota siguen siendo dependencias externas; las cifras sintéticas se mantienen separadas.

El código queda preparado para revisión/integración con 22 pruebas nuevas aprobadas, contratos equivalentes en las lecturas comparadas y sin regresiones nuevas identificadas en las verificaciones ejecutadas. No representa aprobación productiva global: permanecen los fallos previos de los gates y la validación de mutaciones en infraestructura aislada. No se iniciaron optimizaciones de otros módulos.

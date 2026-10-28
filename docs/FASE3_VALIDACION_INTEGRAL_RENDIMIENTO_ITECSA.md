# Fase 3 — Validación integral y cierre de rendimiento de ITECSA

## A. Resumen ejecutivo

**Veredicto: ESTADO B — VALIDACIÓN CON LIMITACIONES.** El trabajo ejecutable queda cerrado para revisión e integración en desarrollo. No se certifican producción, E2E empresarial ni p95 ≤1.000 ms.

Se comprobaron Fase 1 y los nueve módulos existentes mediante suites completas, consultas reales de desarrollo con TLS, JWT/JWKS local firmados, pruebas de seguridad y concurrencia con dobles, recorridos compartidos sobre datos sintéticos y navegador real. Ocho OPT tienen implementación e informe anteriores; no existe una intervención OPT-06 identificable en código/commits/documentos. Su calendario existente se validó y corrigió en esta fase, sin inventar una optimización previa.

Se corrigieron cuatro defectos reproducidos: datos anteriores al cambiar de sesión en calendario, respuesta tardía que restituía una fecha antigua, reprogramación persistida sin su evento histórico si fallaba la auditoría y aceptación de fechas imposibles normalizadas por JavaScript. Se redujeron las lecturas del calendario de siete a una y se eliminó la hidratación completa descartada tras reprogramar. Se repararon los tres fallos históricos de Windows sin debilitar comprobaciones de permisos/hash, se corrigieron dependencias vulnerables del tooling y se incorporaron pruebas de regresión a las barreras de CI.

Resultado final: **385/385 pruebas backend, 325/325 frontend**, lint/build/Prisma aprobados y auditorías sin avisos en los alcances ejecutados. Las lecturas HTTP habituales siguen aproximadamente entre 1,24 y 1,28 s; bandeja, 1,93 s. El objetivo de un segundo no se declara alcanzado.

## B. Estado del repositorio

Fecha: 28-10-2026, zona America/Santiago. Rama `optimizacion`, referencia inicial `1e7bddd`, árbol inicialmente limpio. Se conservaron los commits locales `b71fd33` y `1e7bddd`; esta fase no creó commits, hizo push, fusionó ni desplegó.

Entorno: Windows/PowerShell, Node 24.19.0, React 19.2.6, Vite 8.3.5, Prisma Client/adapter declarados 7.10.0, mariadb 3.5.4. El CLI aislado pasa de Prisma 7.10.0 a **7.10.1**; se regeneró el cliente y se comprobaron compatibilidad y consultas. No se migró ninguna versión mayor ni se cambió el runtime de autenticación.

Se revisaron los informes reales `AUDITORIA_RENDIMIENTO_ITECSA.md`, `IMPLEMENTACION_RENDIMIENTO_FASE1_ITECSA.md` y OPT-01/02/03/04/05/07/08/09, sus evidencias y los commits. `6405c3d` solo es referencia histórica. Las mediciones de Fase 3 no se presentan como repetición exacta de aquellas campañas.

## C. Matriz de fases

| Fase/módulo | Integración comprobada | Funcionalidad y seguridad ejecutadas | Rendimiento actual | Estado final |
|---|---|---|---|---|
| Fase 1 | `c0eef72`; JOIN de identidad y actor request-local conservados | JWT, binding, estado, rol, capabilities, revocación/cambio de cuenta; suites phase1 | Una resolución local por HTTP protegido; spans en JSON | Validada con limitaciones |
| OPT-01 Kanban | `923f4fe`, informe existente | Tablero/detalle, transiciones, subprocesos/retrocesos, carga diaria, concurrencia/PIN en suites y fixtures | HTTP tablero 1.272 ms, 2 SELECT con identidad | Validada con limitaciones |
| OPT-02 Pagos | `755ce1e`, informe existente | Contadores, filtros, decisiones/revisión, conflicto/idempotencia, PIN, rollback; pago confirmado en recorrido compartido | HTTP 1.265 ms, 3 SELECT calientes con identidad | Validada con limitaciones |
| OPT-03 Usuarios | `e7c65e3`, informe de reimplementación | Listado/resumen/movimientos, creación/conciliación/rol/estado y permisos en suites; proveedor remoto simulado en escrituras | HTTP listado 1.276 ms, 3 SELECT | Validada con limitaciones |
| OPT-04 Registro | `d9e67ac`, informe existente | Creación real de servicio sobre modelo, snapshots, accesorios, eventos/avisos, rollback y duplicado concurrente | Lectura de duplicado 631 ms; creación HTTP empresarial no medida | Validada con limitaciones |
| OPT-05 Historial | `b71fd33`, informe existente | Timeline/cursores, tipos, actores, productos, redacción financiera, búsquedas/páginas; efectos compartidos de creación/pago/fecha | HTTP listado 1.258 ms, 2 SELECT | Validada con limitaciones |
| OPT-06 Calendario | No hay implementación/informe OPT-06 anteriores; existe el módulo operativo | Se corrigieron sesión, lecturas tardías, fechas y atomicidad; nueva lectura compartida probada con SQL real | Repositorio 7 → 1 SELECT; HTTP 2.519 → 1.279 ms | **OPT-06 previa: No integrada. Calendario actual: corregido y validado con limitaciones** |
| OPT-07 Reportes | `0be21bb` y `b71fd33` | Fórmulas, nulos, tiempos, CSV/hoja/HTML, períodos, respuestas obsoletas; resultados del pedido compartido | HTTP resumen 1.238 ms, 5 SELECT | Validada con limitaciones |
| OPT-08 Perfil | `1e7bddd` | Datos/actividad/acuse, aislamiento, PIN/recuperación y commit/replay mediante suites sintéticas | HTTP perfil 1.258 ms, movimientos 1.272 ms | Validada con limitaciones |
| OPT-09 Mensajes | `51a4d89` | Asignación por usuario, apertura/lectura, ocultar/limpiar, contador, polling, respuestas antiguas/toasts/sonido en suites | HTTP bandeja 1.928 ms; campana compacta 1.280 ms | Validada con limitaciones |

Las limitaciones de escrituras MySQL/Keycloak reales se aplican a toda la matriz. Que una suite pase con un proveedor simulado no certifica su configuración LAN ni el aislamiento físico del motor.

## D. Pruebas ejecutadas

| Suite/comprobación | Comando real | Baseline | Final | Regresiones |
|---|---|---|---|---|
| Backend completo | Desde capaServidor: `node --test --test-reporter=tap` | 378: 375 pasan, 3 fallan | **385/385**, sin skips | Ninguna pendiente en la suite |
| Frontend completo | Desde capaVista: `npm.cmd test -- --reporter=dot` | **318/318** | **325/325** | Ninguna pendiente |
| Reproducción calendario UI | Vitest `CalendarIntegration.test.jsx` | Dos fallos reproducidos | Cuatro casos pasan | Corregidas |
| Reproducción integridad calendario | Node `test/calendarIntegrity.test.js` | Dos fallos reproducidos | Seis casos pasan | Corregidas |
| Windows/checks de despliegue | Node: mysqlDeployment/mysqlLabAccounts/mysqlLabMigrationHistory | Tres fallos previos | 9/9 | Corregidos sin cambiar hashes esperados |
| Frontend lint | `npm.cmd run lint` | — | Pasa | Sin excepciones añadidas |
| Frontend build | `npm.cmd run build` | — | Pasa, Vite 710 ms | Sin cambio de CSS |
| Prisma | `npm.cmd run prisma:validate`, `npm.cmd run prisma:generate` | CLI anterior | Ambos pasan tras parche | Sin migraciones ejecutadas |
| Dependencias runtime | `npm.cmd audit --omit=dev --audit-level=high --json` en servidor/vista | Cero avisos | Cero avisos en esos alcances | Sin cambios runtime |
| Dependencias tooling | `npm.cmd audit --audit-level=high --json` en tooling/prisma | 3 high y 1 moderate por paquetes afectados | **Cero avisos** | Corregidas |
| Artefactos de datos | Git Bash: `bash scripts/verify-data-artifacts.sh` | — | Pasa | No se generaron dumps/PDF empresariales |
| Diff | `git diff --check` | — | Pasa | Avisos normales de checkout CRLF fuera de reglas LF |

Los totales Node incluyen módulos fixture descubiertos bajo `test`; el incremento bruto backend incluye seis pruebas nuevas y el módulo congelado de referencia. No se inventa una cobertura porcentual. No existe un comando independiente de typecheck/E2E empresarial configurado en los package.json revisados.

## E. Rendimiento global

Medianas de diez muestras calientes secuenciales por lectura HTTP, identidad actual en DB, mismo TLS/pool. Sin p95 fiable con esta campaña acotada. La columna «antes comparable» solo se completa para el cambio del calendario dentro de esta fase; no se calculan porcentajes contra campañas históricas con otro dataset/rol.

| Módulo | Operación | Antes comparable ms | Fase 3 ms | p95 | SELECT físicos observados | Objetivo 1 s |
|---|---|---:|---:|---|---:|---|
| Fase 1/OPT-01 | HTTP tablero | — | 1271,879 | No certificado | 2 | No |
| OPT-02 | HTTP workspace pagado/pendiente | — | 1265,001 | No certificado | 3 | No |
| OPT-03 | HTTP listado usuarios | — | 1275,965 | No certificado | 3 | No |
| OPT-04 | Repositorio existencia de Nota de Venta | — | 630,754 | No certificado | 1 | Sí, solo esta etapa |
| OPT-05 | HTTP listado historial | — | 1257,638 | No certificado | 2 | No |
| Calendario | HTTP mes, una página | 2518,884 | 1278,769 | No certificado | 8 → 2 | No |
| Calendario | Repositorio mes, pareado n=5 | 1679,609 | 622,340 | No certificado | 7 → 1 | Sí, etapa interna |
| Calendario | Repositorio sin fecha, pareado n=5 | 1894,000 | 633,062 | No certificado | 7 → 1 | Sí, etapa interna |
| Calendario | Repositorio búsqueda, pareado n=5 | 1892,986 | 633,221 | No certificado | 7 → 1 | Sí, etapa interna |
| OPT-07 | HTTP resumen de métricas | — | 1237,979 | No certificado | 5 | No |
| OPT-08 | HTTP perfil | — | 1258,037 | No certificado | 2 | No |
| OPT-08 | HTTP movimientos propios | — | 1271,833 | No certificado | 3 | No |
| OPT-09 | HTTP bandeja | — | 1928,476 | No certificado | 3 | No |
| OPT-09 | HTTP campana, view=bell, limit50 | — | 1279,938 | No certificado | 2 | No |

`FASE3_RENDIMIENTO_LECTURAS.json` conserva la campaña inicial, con errores de instrumentación de bandeja; su serie fallida no se usa como dato de rendimiento. Los resultados válidos de bandeja, campana compacta y calendario optimizado están en JSON separados. Cada archivo contiene mínimos, medias, medianas, máximos, muestras/errores, bytes, CPU/heap del proceso, SQL y spans cuando corresponden. No se sumaron medianas de procesos distintos.

## F. Rendimiento por capas

**SQL/repositorio:** el calendario reutiliza el paginado con CTE y una sola relación expansiva ya usado por Kanban. La variante calendario conserva pedidos terminales y sin estado, búsqueda parcial, producto, cursor/fecha, labels y todos los detalles. Se mantiene paginación por pedido, no por fila hija. Nueve variantes reales coinciden con el repositorio anterior; terminal/sin resultados tienen una muestra descriptiva, no una serie estadística. EXPLAIN se guarda; no se añadieron índices ni se ejecutó DDL.

**Servicio/HTTP:** las mediciones consolidadas atraviesan routers/controllers reales y JWT firmado con JWKS local. Cada GET vuelve a resolver un binding activo real y capabilities. `identityMs` y `middlewareMs` se instrumentan dentro de la misma petición; el middleware incluye identidad y cuota en memoria. Su tiempo está incluido en HTTP, no debe sumarse otra vez. Se observa aproximadamente un viaje de identidad y otro de consulta en varias lecturas.

**Operaciones sensibles:** la reprogramación ahora usa el límite transaccional existente y espera commit. El controlador pide un recibo interno y después el mismo DTO de calendario; ya no se recupera y descarta el pedido completo. El contrato completo del repositorio sigue por defecto. Se demuestra la eliminación de esa llamada con pruebas; no se atribuye una latencia real de escritura no medida.

**Navegador:** se montaron páginas/layout reales con APIs sintéticas en Edge. Se verificaron geometría, contenido/tablas poblados donde corresponde, foco, títulos largos, zoom y modales. Esto no mide red empresarial ni tiempo hasta persistir una escritura real.

**Operación completa:** no hay E2E con sesión empresarial, MySQL aislado y realm de pruebas. No se presenta ninguna suma SQL+HTTP+render como tiempo completo del usuario ni se certifica p95 de producción.

## G. Integración entre módulos

`validatePhase3Integration.mjs` usa un **mismo estado sintético compartido**, no nueve fixtures independientes de respuestas finales:

1. CreationService crea pedido, cliente, dos detalles, accesorio, etiquetas, registro inicial, avisos y asignaciones mediante el modelo transaccional de OPT-04.
2. Se exponen esas filas como CTEs en SELECT de MySQL y se ejecutan repositorios/servicios reales de Kanban, calendario, historial, métricas, actividad y mensajes. Coinciden ID/Nota de Venta, cantidades y relaciones.
3. El servicio real de pago confirma sobre un modelo serializado y sus filas persistidas se incorporan al estado compartido. Se comprueba el pago en historial con redacción financiera y el estado de Kanban, sin perder el resto de relaciones.
4. El servicio de reprogramación corregido cambia pedido/detalles y registra el evento en una misma transacción del modelo. Se comprueban nueva fecha y evento de calendario en las vistas y reportes del mismo pedido.

Evidencia: `FASE3_INTEGRACION_SINTETICA_SQL.json`, **33 SELECT/CTE, tres checkpoints, cero escrituras reales**. Las columnas enteras de CTE se normalizan a Number para representar el INT físico; esta adaptación solo existe en el harness.

Producción, completar/retroceder subprocesos, revisiones/cancelaciones y conciliación de identidad pasan sus suites reales de servicio con modelos/dobles existentes. **No se afirma que los flujos B/C/F completos hayan atravesado juntos un MySQL/Keycloak empresarial.** El flujo de aviso/asignación a campana se comprueba con SQL del estado compartido; apertura/marcado/ocultación y contador están cubiertos por las suites de Mensajes. Falta ejecutar A–G completos con sesiones y escrituras físicas aisladas.

## H. Seguridad

Se conservaron y ejecutaron pruebas de firma/issuer/audience/expiry, provider/subject, binding activo, cambios de rol, capabilities y privacidad por propietario. La reutilización de `req.currentUser` continúa siendo request-local y no una caché entre solicitudes. No se retira la revalidación posterior a PIN/operaciones administrativas remotas.

PIN: hashing/salt/cifrado, estado pendiente/acuse, intentos/bloqueo, rol y sesión se mantienen. Los archivos productivos de PinService, recuperación, navegación, rutas auth, middleware JWT y AuthProvider se compararon contra `1e7bddd` y permanecen idénticos. Se ejecutaron sus suites de fallos, cancelación, callback repetido, doble finish, espera de commit y rechazo de la credencial anterior. No se hizo reveal/rotación sobre una cuenta empresarial.

Historial conserva redacción en SQL/DTO del evento financiero, no solo ocultación en React. Pagos conserva permisos, PIN por petición, relectura bajo lock e idempotencia. Mensajes conserva asignación por usuario y prevención de datos de otra sesión. Reportes conserva protección de CSV/fórmulas y HTML en sus tests. No se cambiaron fórmulas ni se publicaron campos financieros nuevos en calendario: el mapper backend mantiene su DTO.

Se consultó el [aviso oficial de deepmerge-ts](https://github.com/RebeccaStevens/deepmerge-ts/security/advisories/GHSA-ggr8-5vv4-36mx). La dependencia afectada pertenecía al CLI aislado, no al runtime HTTP. Prisma CLI 7.10.1 incorpora deepmerge-ts 8.0.2; fast-uri se actualiza puntualmente a 3.1.9 dentro de su rango. No hubo actualización masiva ni migración de ORM.

## I. Integridad y concurrencia

La reproducción de calendario demostró que el update anidado de pedido/detalles podía confirmarse y fallar después `registros.create`. Se corrigió usando `OrderService.runInTransaction`, con el cliente transaccional del repositorio y sus timeouts existentes. El modelo prueba rollback de las dos fechas, espera hasta commit, errores, actor, ausencia de hidratación descartada y dos cambios concurrentes: una fecha final completa y ambos eventos, con la semántica existente de último commit. No se agregó una promesa de compare-and-swap inexistente.

Fechas ahora requieren YYYY-MM-DD y round-trip exacto de UTC antes de verificar día hábil: `2026-02-30` deja de convertirse silenciosamente en marzo. Fechas válidas mantienen día/mes, detalles y texto histórico.

El frontend ya no permite que una lectura iniciada antes del commit deshaga el resultado visual. Los overrides pertenecen exclusivamente a las lecturas que estaban pendientes al confirmarse la mutación; una lectura posterior vuelve a confiar en el servidor. No se crea una caché persistente de autorización ni se reintentan escrituras automáticamente. Cambiar de API/sesión desmonta el calendario y cancela sus lecturas; una confirmación tardía no actualiza la nueva cuenta ni emite su toast después del desmontaje.

Las suites existentes comprueban duplicados de Nota de Venta, rollback en cada fase de creación, confirmación/rechazo simultáneos, revisión financiera, transiciones/locks, progreso Lanyard y recuperación PIN de uso único. Son controles de flujo con modelos serializados; **el aislamiento/deadlock/rollback físico de MySQL sigue pendiente**, sin sustituirlo por una afirmación sobre mocks.

## J. Escalabilidad y recursos

El merge de mes/pendientes hacía búsquedas lineales repetidas con `.some`; se sustituyó por Set de IDs manteniendo orden y equivalencia entre IDs Number/string. En cinco batches calientes por tamaño:

| Filas de mes + pendientes | Antes ms | Después ms | Alcance |
|---|---:|---:|---|
| 100 + 100 | 0,145 | 0,011 | CPU JS sintética |
| 1.000 + 1.000 | 14,661 | 0,136 | CPU JS sintética |
| 5.000 + 5.000 | 258,401 | 0,432 | CPU JS sintética |

La prueba de carga de páginas recorre 300 pedidos y conserva todos los IDs; abortar detiene el recorrido y un cursor repetido falla en lugar de entrar en un bucle. No se presentó una primera página como calendario completo.

Polling virtual: 12 consultas/minuto por pestaña visible; tres pestañas, 36. No se introdujo líder compartido ni se cambió el intervalo de cinco segundos. La detección nominal agrega hasta cinco segundos más la latencia real de la petición; una pestaña oculta no ofrece esa latencia. No son mediciones de red por minuto ni saturación.

Las muestras HTTP registran CPU, delta de heap y event-loop delay del proceso diagnóstico. No son memoria pico, throughput, ocupación del pool ni CPU del servidor productivo. No se constató una fuga por esas muestras cortas ni se certificó su ausencia. Los overrides de calendario se liberan al resolver/cancelar cada lectura. Pool 10 y TLS no se alteraron. Volumen físico grande, conexión/espera bajo carga y múltiples procesos de recuperación requieren laboratorio.

## K. Frontend

325 pruebas cubren sesiones, providers, API client, lazy routes/loading, historial, pagos, reportes, mensajes, PIN y calendario. Se agregaron casos para cuenta nueva mientras una carga parcial termina, lectura tardía después de mutación, bandeja sin fecha tardía, lectura fresca posterior, señal propagada, cursor/paginación y completitud.

El navegador comprobó **187 combinaciones de viewport/sidebar en once pantallas** de los nueve módulos, además de zoom 200%, título largo, Tab/foco y modales. Se guardó `FASE3_RESPONSIVE.json`; se inspeccionó la captura móvil de calendario y se retiraron capturas/perfiles temporales. El scroll horizontal interno del calendario en móvil es el comportamiento existente, no se suprimieron días para cumplir geometría. No se modificó CSS, diseño, paleta ni reglas de producción.

No se ejecutó un lector de pantalla completo ni una certificación WCAG automatizada integral. Tampoco se trasladan resultados de render de campañas anteriores como si se hubieran vuelto a medir aquí.

## L. Infraestructura y CI

- MySQL de desarrollo respondió a SELECT/EXPLAIN con TLS estricto. No se ejecutaron DDL/DML ni se modificaron datos empresariales.
- Discovery y JWKS del Keycloak configurado respondieron **200**; el issuer del discovery coincide y JWKS contiene claves. Se verificó configuración local de recuperación. Son lecturas públicas: no certifican login, refresh, logout, gestión de usuarios ni recuperación empresarial.
- Docker CLI existe, pero no está disponible `docker_engine`. No se construyeron/arrancaron imágenes ni se probaron healthchecks/arranque/montajes/hot reload efectivos.
- `docker compose -f compose.yaml config --quiet` pasa. La configuración standalone se valida con `--no-env-resolution`; falta `.env.mysql.docker` para una instancia real. No se fabricó ese archivo ni se alteraron certificados/redes/servicios. El aviso de acceso al config global de Docker no se ocultó ni se sustituyó por un despliegue.
- CI conservó PR/dev/main y condiciones de publicación. Se añadieron tests frontend a los jobs Docker existentes y suites backend/frontend a security-ci. No se ejecutó un workflow remoto ni se publicaron imágenes. Las barreras locales pasan; falta la ejecución efectiva en Linux/GitHub Actions y el escaneo Docker/gitleaks.

## M. Mejoras y correcciones adicionales

| Problema | Evidencia | Cambio | Prueba | Resultado |
|---|---|---|---|---|
| Datos de calendario de la cuenta anterior | Test rojo con nueva API y bandeja parcial terminada | Scope por API, desmontaje y abort | Test de sesión + flags | Corregido |
| GET antiguo restaura fecha previa | Test rojo tras confirmar una nueva fecha | Overrides solo en lecturas pendientes | Mutación → respuesta vieja → lectura fresca | Corregido sin recarga completa |
| Fecha cambia sin registro si falla auditoría | Test rojo sobre repositorio/modelo real de servicio | Transacción común | Fallo, rollback, commit diferido, concurrencia | Corregido |
| Fecha imposible aceptada | Test rojo `2026-02-30` | Validación exacta + día hábil existente | Sin escrituras ante fechas inválidas | Corregido |
| Siete SELECT de calendario | Campaña consolidada + comparación pareada | Reutilizar proyección compartida | DTO/SQL real, nueve variantes | 7 → 1 SELECT |
| Grafo recuperado y descartado al reprogramar | Controller ignora retorno; test de contrato | Recibo interno explícito | Default completo preservado, sin hidratación en recibo | Llamada eliminada; sin cifra de escritura inventada |
| Merge cuadrático en calendario | Benchmark 5.000+5.000 | Set de IDs | Igualdad completa y cinco batches | 258,401 → 0,432 ms CPU |
| Vulnerabilidad en tooling | npm audit y aviso upstream | Prisma CLI 7.10.1, fast-uri 3.1.9 | Generate/validate/tests + audit | Cero avisos finales |
| Fallos históricos por SO | Baseline tres fallos | LF estable y test de chmod portable | Hashes y aserciones conservados | Backend completo verde |
| Frontend fuera de barreras CI | Workflows sin `npm test` frontend | Agregar tests a barreras existentes | Revisión de diff/triggers y suites locales | Configurado, ejecución remota pendiente |

## N. Alternativas descartadas

No se ajustaron scrypt, cuotas, pool ni TLS para aparentar un segundo. No se cacheó identidad entre peticiones, no se omitió verify ni se paralelizaron escrituras dependientes. No se cambiaron fórmulas/exportaciones, DTO públicos, cursor por OFFSET o reglas financieras. No se añadieron índices sin volumen y costo de INSERT medidos, Redis, WebSocket ni un store nuevo.

La bandeja conserva su transacción página/count. Fusionar esa lectura para eliminar otra espera es un candidato P2, no una mejora demostrada en esta fase: requiere probar snapshot/count/páginas vacías/filtros/planes y volumen. No se sustituyó una transacción por dos SELECT sin consistencia para bajar el tiempo. Tampoco se rehízo el módulo de calendario como una supuesta OPT-06 retroactiva.

## O. Fallos históricos, nuevos y de instrumentación

Los tres fallos iniciales de Windows se reproducían antes de esta fase. La comparación literal de Compose y los hashes de migraciones fallaban por CRLF de checkout: `.gitattributes` mantiene LF en esos archivos y scripts shell. **No hay cambios semánticos ni de contenido Git en SQL histórico**, y sus 16 hashes esperados siguen intactos y pasan; no se ejecutaron migraciones.

Windows no representa los bits owner/group de chmod igual que POSIX. El test ahora comprueba las llamadas create/chmod 0600 en todo SO, el bit writable disponible en Windows y el modo efectivo 0600 original en Linux. Se conserva la validación de socket, contraseñas parametrizadas, contenido y restricciones; no se elimina la prueba de permisos. Referencia: [documentación oficial de Node sobre permisos Windows](https://nodejs.org/api/fs.html).

Se adaptó una aserción de productionCompletion que inspeccionaba `findMany.where` para comprobar la nueva SQL sin exclusión de estados terminales, manteniendo y ampliando su propósito. No fue una regresión del producto.

La primera campaña de bandeja registró once HTTP 500 porque el observador rechazaba el comentario `-- Implicit COMMIT` del driver como si fuera una sentencia inesperada. Se identificó ERR_ASSERTION del harness, se corrigió el observador y se repitió: diez muestras válidas, sin cambiar el repositorio de Mensajes. Los errores iniciales permanecen en su JSON y no se incluyen en medianas válidas. La primera comparación de calendario coincidió parcialmente con otros probes; se repitió sin esos probes y solo se usa esa comparación final.

No quedan fallos nuevos conocidos en las suites ejecutadas. Eso no certifica recorridos/infraestructura que no pudieron ejecutarse.

## P. Archivos modificados y creados

Modificados con cambios de contenido:

- `.github/workflows/docker.yml`
- `.github/workflows/security-ci.yml`
- `capaServidor/src/modules/orders/controller/orders.controller.js`
- `capaServidor/src/modules/orders/repo/kanbanRead.repo.js`
- `capaServidor/src/modules/orders/repo/orderViewOperations.js`
- `capaServidor/src/modules/orders/repo/orderWriteOperations.js`
- `capaServidor/src/modules/orders/service/orderProduction.service.js`
- `capaServidor/test/mysqlLabAccounts.test.js`
- `capaServidor/test/productionCompletion.test.js`
- `capaVista/src/modules/productionCalendar/api/ordersCalendarApi.js`
- `capaVista/src/modules/productionCalendar/components/ProductionCalendarGrid.jsx`
- `capaVista/src/modules/productionCalendar/pages/ProductionCalendarPage.jsx`
- `tooling/prisma/package.json`
- `tooling/prisma/package-lock.json`

Creados:

- `.gitattributes`
- `capaServidor/scripts/fixtures/calendarTransactionFixture.mjs`
- `capaServidor/scripts/validatePhase3CalendarRead.mjs`
- `capaServidor/scripts/validatePhase3Environment.mjs`
- `capaServidor/scripts/validatePhase3Integration.mjs`
- `capaServidor/scripts/validatePhase3Reads.mjs`
- `capaServidor/test/calendarIntegrity.test.js`
- `capaServidor/test/fixtures/fase3/calendar.before.repo.js`
- `capaVista/src/modules/productionCalendar/api/calendarCompleteness.test.js`
- `capaVista/src/modules/productionCalendar/pages/CalendarIntegration.test.jsx`
- `capaVista/src/modules/productionCalendar/utils/calendarReads.js`
- `scripts/validate-phase3-synthetic.mjs`
- `scripts/verify-phase3-layout.mjs`
- `docs/FASE3_VALIDACION_INTEGRAL_RENDIMIENTO_ITECSA.md`
- `docs/FASE3_VALIDACION.json`
- `docs/FASE3_DEPENDENCIAS.json`
- `docs/FASE3_ENTORNO.json`
- `docs/FASE3_INTEGRACION_SINTETICA_SQL.json`
- `docs/FASE3_CALENDARIO_COMPARACION.json`
- `docs/FASE3_RENDIMIENTO_LECTURAS.json`
- `docs/FASE3_RENDIMIENTO_BANDEJA.json`
- `docs/FASE3_RENDIMIENTO_CAMPANA.json`
- `docs/FASE3_RENDIMIENTO_CALENDARIO_HTTP.json`
- `docs/FASE3_RESPONSIVE.json`
- `docs/FASE3_VOLUMEN_Y_POLLING.json`

Se normalizaron a LF, sin diff de contenido Git, las 16 `capaServidor/prisma/migrations/*/migration.sql`, `compose.mysql.yaml`, `deploy/40-runtime-config.sh`, `deploy/mysql/manage.sh` y `scripts/verify-data-artifacts.sh`. Git puede señalarlos por metadatos/checkout hasta refrescar/preparar el nuevo atributo; no se cambió el SQL ni se preparó contenido para commit.

## Q. Pendientes y reproducción

| Prioridad | Causa/evidencia | Impacto/estado | Acción y dependencia |
|---|---|---|---|
| P0 | Ningún defecto crítico conocido pendiente en el alcance ejecutado | No equivale a certificación global | Mantener barreras y validar laboratorio antes de producción |
| P1 | Sin MySQL/realm aislados; Docker engine ausente | Bloquea certificación física de A–G, locks, rollback, deadlocks, revocación y recuperación E2E | Provisionar entorno autorizado y ejecutar escrituras/concurrencia reales; no usar cuentas empresariales |
| P1 | Imágenes/healthchecks/CI remoto no ejecutados | Preparación productiva sin certificar | Build/smoke Linux, GitHub Actions y escaneo de secretos en entorno disponible |
| P2 | HTTP 1,24–1,28 s y bandeja 1,93 s; n limitado | Meta p95 de un segundo no cumplida/certificada | Medir red/servidor/pool y ampliar muestras sin cuotas/auditoría empresariales; evaluar count de bandeja sin perder snapshot |
| P2 | Volumen físico/índices no probado | Sin conclusión de capacidad o throughput | Dataset/restauración aislados, EXPLAIN/costo de escrituras y cargas moderadas |
| P2 | OPT-06 anterior ausente | No hay cierre histórico modular que pueda certificarse | Revisar los cambios de calendario de Fase 3 y decidir si completan el alcance OPT-06 requerido |
| P3 | A11Y integral y recursos prolongados fuera de campaña | Geometría/foco básico comprobados, no certificación AA ni ausencia de fugas | Lector de pantalla/axe y campañas prolongadas representativas |

Desde capaServidor, con `.env` de desarrollo y autorización de lectura:

```powershell
node --test --test-reporter=tap
npm.cmd run prisma:validate
npm.cmd run prisma:generate
node --env-file=.env scripts/validatePhase3Reads.mjs --allow-development-reads --samples=10
node --env-file=.env scripts/validatePhase3Reads.mjs --allow-development-reads --samples=10 --only=inbox --output=../docs/FASE3_RENDIMIENTO_BANDEJA.json
node --env-file=.env scripts/validatePhase3Reads.mjs --allow-development-reads --samples=10 --only=notifications --output=../docs/FASE3_RENDIMIENTO_CAMPANA.json
node --env-file=.env scripts/validatePhase3Reads.mjs --allow-development-reads --samples=10 --only=calendar --output=../docs/FASE3_RENDIMIENTO_CALENDARIO_HTTP.json
node --env-file=.env scripts/validatePhase3CalendarRead.mjs --allow-development-reads
node --env-file=.env scripts/validatePhase3Integration.mjs --allow-development-reads
node --env-file=.env scripts/validatePhase3Environment.mjs
```

Desde capaVista: `npm.cmd test -- --reporter=dot`, `npm.cmd run lint`, `npm.cmd run build`. Desde raíz: `node scripts/validate-phase3-synthetic.mjs`, `node scripts/verify-phase3-layout.mjs`, `bash scripts/verify-data-artifacts.sh`, `git diff --check`. Auditorías desde cada package según D. No ejecutar probes DB simultáneamente para comparar latencias. Los probes nunca deben transformarse en pruebas de escritura contra el negocio.

## R. Conclusión técnica

1. Las optimizaciones de Fase 1 y ocho OPT están presentes; no se inventó una OPT-06 previa.
2. Funcionan juntas en suites, HTTP de lectura y recorridos compartidos sintéticos/SQL ejecutados; falta E2E físico completo.
3. Se corrigieron las regresiones/problemas reproducibles detectados; las suites finales no tienen fallos.
4. Se conservaron identidad, roles, capabilities, PIN y privacidad en los controles ejecutados.
5. Se reforzó integridad de reprogramación; falta validar aislamiento físico bajo carga/concurrencia.
6. Se preservaron reglas válidas, estados, cantidades, relaciones, fechas y cálculos; las fechas imposibles se rechazan correctamente.
7. Se eliminaron seis SELECT de calendario y la hidratación descartada tras la escritura; permanecen las mejoras de identidad anteriores.
8. Las lecturas internas de calendario y duplicado medidas cumplen una mediana inferior a un segundo.
9. HTTP continúa por encima de un segundo; p95 y escrituras empresariales no están certificados.
10. Docker, laboratorio de escrituras/realm, red/pool/servidor y CI remoto limitan la certificación.
11. Se añadieron correcciones de calendario, proyección SQL/merge, parches de tooling y barreras CI.
12. Los pendientes están clasificados en Q; no se ocultan como un cierre productivo exitoso.
13. Está listo para revisión e integración en desarrollo con evidencia y limitaciones explícitas.
14. Está listo para **preparar** pruebas de aceptación en un laboratorio autorizado; no se declaran aprobadas.
15. Antes de producción faltan A–G E2E físicos, pruebas de sesiones/PIN/Keycloak reales de laboratorio, concurrencia MySQL, imágenes/smoke/healthchecks, CI y campaña representativa de rendimiento.

**ESTADO B — VALIDACIÓN CON LIMITACIONES.** Sin commit, push, merge ni despliegue en esta fase.

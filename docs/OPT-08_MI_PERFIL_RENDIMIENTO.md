# OPT-08 — Mi perfil, actividad personal y PIN

## A. Resumen ejecutivo

Implementación del 28-10-2026 sobre `optimizacion`, referencia `b71fd33`. El árbol estaba limpio al comenzar. Se conservaron OPT-01/02/03/04/05/07/09 y la revalidación visual de sesión cada 30 minutos. Se consultaron `AUDITORIA_RENDIMIENTO_ITECSA.md`, `IMPLEMENTACION_RENDIMIENTO_FASE1_ITECSA.md` y los informes modulares existentes; la auditoría de `6405c3d` es contexto histórico, no la línea base de esta comparación.

La actividad reciente pasa de siete SELECT a uno; movimientos propios, de ocho a dos en paralelo. La mediana de repositorio del historial baja de 1.963,333 a 660,718 ms. Por HTTP, con JWT firmado localmente y resolución actual de identidad en MySQL, baja de 2.626,737 a 1.303,458 ms. El objetivo de un segundo todavía no se cumple en ese recorrido completo.

Se limitaron las columnas de las lecturas de PIN y se separó su recepción en un componente que retira el secreto al abandonar el estado pendiente. Se evita el POST de revelación duplicado por el montaje descartado de StrictMode, sin guardar credenciales en una caché. Se conserva `acknowledge → verify`, el hash, las transacciones y toda la autorización de recuperación. Las pruebas de recuperación usan JWT/criptografía reales y dobles controlados; no se ejecutaron recuperaciones contra cuentas empresariales.

## B. Perfil

| Operación | Problema | Cambio | Resultado |
|---|---|---|---|
| PERF-030: datos y actividad | Cascada de relaciones de actividad | Una consulta con LEFT JOIN uno a uno | 7 → 1 SELECT de actividad; HTTP 8 → 2 |
| Datos personales | Identidad ya disponible | Se conserva `req.currentUser` | Ningún GET adicional a Keycloak |
| Cambio de cuenta/sesión | El componente se identificaba solo por subject | Clave por instancia de API de sesión y subject | Desmonta también al renovar la sesión de la misma cuenta |
| Respuestas tardías | Perfil ya tenía control subject/api/attempt | Se conserva y se prueba | Datos anteriores no reemplazan la cuenta actual |
| Reentrada/error | Dedupe de promesas pendientes existente | Se conserva y se prueba su limpieza | Nueva entrada/reintento obtiene datos nuevamente |
| Información privada | GET sin política explícita de almacenamiento | `Cache-Control: no-store` en perfil y movimientos | Incluye errores del handler |

Recorrido confirmado: AuthProvider verifica la sesión conforme al contrato actual; el GET atraviesa JWT, identidad local activa, cuota y capability; el handler toma `req.currentUser`, añade diez registros y retorna el mismo DTO. ProfileSummary utiliza AuthContext y no hace GET propio. No se agregó un editor de datos personales.

Se conservan nombre, apellido, correo, rol, RUT, estado y registros. `fechaRegistro` no está en el DTO actual: la UI mantiene «No informada». Los movimientos exponen `id`, `dateTime`, `detail`; no contienen actor adicional ni contexto de pedido que deba inventarse. La atribución continúa filtrada por el usuario que realizó el movimiento.

## C. Actividad reciente

Antes, Prisma recuperaba Registros y sus tres subtipos con sus estados en consultas separadas. Ahora una proyección obtiene identificador, timestamp, observación, presencia del subtipo y nombre de estado. Todas las uniones son opcionales y cada hijo tiene `id_registro` como PK: no se multiplican ni desaparecen registros generales.

Se conserva prioridad pago → etapa → subproceso → observación. Se distingue presencia de relación de nombre nulo; los textos «No informado/No informada», nombres vacíos y el `trim` de JavaScript mantienen el contrato. No se reemplazó ese trim por TRIM SQL, que no trata igual todos los espacios Unicode.

En la serie real, actividad reciente conserva exactamente 946 bytes de JSON público. No se atribuye una reducción de payload público: la mejora medida corresponde a viajes SQL. No se midieron bytes del protocolo MySQL ni CPU interna del motor.

## D. Movimientos

`UserRepository.listMovements` ejecuta ahora en paralelo:

1. SELECT de página con filtro de propietario, relaciones uno a uno, orden y OFFSET/LIMIT.
2. SELECT de COUNT con el mismo predicado. Sin búsqueda, omite los JOIN; con búsqueda, conserva las cuatro fuentes de coincidencia.

Antes: `findMany` relacional más `count`, ocho SELECT físicos en el escenario medido. Después: dos SELECT. No hay N+1 por fila, caché de totales ni cálculo del total a partir de la página visible.

La página 500 vacía mantiene su total; el count y la página siguen siendo lecturas independientes, como antes. No se introduce una promesa de snapshot entre ambas ante escrituras concurrentes. OFFSET conserva también su comportamiento frente a inserciones entre consultas; no se promete navegación inmutable.

EXPLAIN real: para el actor seleccionado, Registros usa `Registros_Usuario_FK`, estima 198 filas y muestra `Using temporary; Using filesort`. Las tablas hijas se relacionan por PK. Los índices observados son PRIMARY, Registros_Pedidos_FK, Registros_Usuario_FK e idx_records_order_cursor. Este último empieza por pedido y no equivale al candidato por usuario/fecha/ID.

Se evaluó `(id_usuario, FECHA_HORA DESC, ID_REGISTRO DESC)`, sin agregarlo: no hay prueba aislada de beneficio con volumen representativo ni del costo de INSERT. El filesort de esta muestra no explica por sí solo dos segundos. No se ejecutó DDL ni se cambiaron TLS/pool/esquema.

## E. Búsqueda y paginación

PERF-031/032/033 mantienen páginas de diez en la UI, páginas numeradas, total exacto, anterior/siguiente y submit explícito. Escribir no genera solicitudes. Se conservan límites del validador backend, búsqueda parcial, prefijos «Estado de pago/Etapa del pedido/Subproceso», ID numérico y orden `FECHA_HORA DESC, ID_REGISTRO DESC`.

Los valores se enlazan mediante `Prisma.sql`; la entrada no se concatena como SQL. LIKE conserva comodines `%`, `_`, barra inversa y collation existentes, verificados contra Prisma anterior. El filtro por propietario envuelve todas las alternativas de búsqueda.

El modal ya abortaba sus lecturas, pero el adaptador del perfil descartaba `options.signal`. Ahora la señal llega hasta `apiClient.get`, fuera del query string. Los flags activos del modal siguen descartando respuestas tardías aunque el transporte no pudiera detener el servidor. El perfil propio conserva `/auth/profile/movements`; el administrativo conserva su endpoint, inspección remota y repositorio optimizado de OPT-03, sin cambios.

## F. PIN pendiente — PERF-008

La lectura de revelación selecciona estado, aceptación y los tres componentes cifrados pendientes; ya no recupera hash/salt ni datos personales sin uso. Se mantienen identidad actual, capability MANAGE_PIN, estado activo, comprobación de aceptación y AES-256-GCM/HKDF.

`PendingPinModal` mantiene el secreto exclusivamente en estado local mientras está montado. El cambio de API/sesión desmonta el perfil; salir de pendiente desmonta la recepción. Una respuesta antigua no repuebla el nuevo componente. No se añaden copias, URLs, métricas, almacenamiento web ni cachés de PIN. Una microtarea permite descartar el primer efecto de StrictMode antes de iniciar el POST; no comparte ni conserva una promesa que contenga el secreto. Un error de revelación permite reintento explícito.

## G. Aceptación — PERF-009

La lectura previa de acknowledge selecciona cuatro campos necesarios. La escritura sigue confirmando aceptación y eliminando ciphertext/IV/tag. No se marca aceptado antes de la respuesta de persistencia. Se mantiene el guard de doble clic.

Después del 204 se retira el PIN y se ejecuta `refreshSession()`/GET verify. Si la lectura falla, «Continuar» reintenta la verificación, sin repetir un acuse confirmado dentro de ese componente. Un timeout del POST no provoca reintento automático ni actualización anticipada de permisos. El endpoint continúa siendo repetible para una aceptación ya persistida. Desmontar una escritura no se trata como rollback.

No se eliminó verify: el 204 no contiene rol, permisos ni una sesión verificada que permita sustituirlo con seguridad. `ensureProvisioned` utiliza ahora una proyección de cuatro campos y conserva la relectura después de provisionar.

## H. Recuperación — PERF-010 a PERF-013

| Etapa | Contrato revisado y probado |
|---|---|
| Start | Sesión original, capability, cuotas por cuenta/IP, capacidad máxima, TTL de cinco minutos; reemplazar una operación invalida la anterior |
| Keycloak | Login forzado, max_age=0, state, nonce y PKCE S256; cliente de recuperación separado |
| Resume | Origin, cookie HttpOnly/SameSite y estado; consumo antes de I/O; token renovado con firma/issuer/audience/azp/sub/sid válidos; restaura la cuenta original |
| Callback | Quita code/state de URL, consume contexto público de pestaña, resume antes de finish; dedupe por documento, sin nuevo finish al repetir callback |
| Finish | Verificación RS256 del ID token, nonce, auth_time/iat recientes, actor y sesión; claim síncrono impide doble finish |
| Rotación | Solo se reduce la proyección de prelectura a estado; hash y relectura bajo FOR UPDATE siguen intactos; autorización revalidada tras hashing; respuesta después de resolver la transacción |
| Cancel/expiración | Cancelar antes/durante verificación impide rotación; committing no se cancela a mitad de persistencia; operaciones consumidas/expiradas no se reutilizan |
| Regreso/errores | BFCache fuerza el puente protegido; fallo de restore cierra el flujo; fallo de finish no reintenta la rotación automáticamente |

Se preservan scrypt v2 `N=32768,r=8,p=3`, salt, fingerprints, claves, intentos, bloqueo de 15 minutos y aceptación obligatoria. No se eliminó la comparación con la credencial vigente bajo lock. Las pruebas controladas comprueban fallo de hash, fallo SQL con restauración del estado previo, espera hasta commit y competencia con cancel/replay. No sustituyen una prueba de aislamiento de MySQL real.

Hallazgo previo de OPT-03: faltaban callback/transport en aquel entorno. En esta ejecución, el `.env` local sí tiene callback y pasa `pinRecoveryConfiguration`; no tiene override de transporte. Esto no demuestra que el contenedor/realm empresarial tenga esa configuración ni que su red responda. Docker no estaba disponible. No se editaron `.env`, Compose, realm, infraestructura ni servicios activos. La recuperación completa con Keycloak empresarial sigue sin validación E2E en esta tarea.

## I. Rendimiento

Cinco muestras por serie, después de calentamiento en lecturas; mínimos, medias, medianas, máximos, errores, SELECT, driver y bytes en `OPT-08_RENDIMIENTO.json`. Comparación con copias congeladas de `b71fd33`; mismos filtros y DTO. TLS estricto y pool 10. No se calcula p95 fiable con n=5.

| Operación/capa | Antes ms | Después ms | Reducción aprox. | Muestras por versión | ¿Mediana ≤1 s? |
|---|---:|---:|---:|---:|---|
| Actividad reciente/repositorio | 1477,542 | 660,588 | 55,3% | 5 | Sí, etapa interna |
| Primera página/repositorio | 1963,333 | 660,718 | 66,3% | 5 | Sí, etapa interna |
| Búsqueda/repositorio | 1963,209 | 661,162 | 66,3% | 5 | Sí, etapa interna |
| Siguiente/repositorio | 1966,320 | 660,187 | 66,4% | 5 | Sí, etapa interna |
| Anterior/repositorio | 1959,664 | 660,675 | 66,3% | 5 | Sí, etapa interna |
| Página 500/repositorio | 1959,950 | 659,178 | 66,4% | 5 | Sí, etapa interna |
| Abrir perfil/HTTP | 2556,474 | 1239,666 | 51,5% | 5 | No |
| Abrir historial/HTTP | 2626,737 | 1303,458 | 50,4% | 5 | No |
| Buscar/HTTP | 2568,218 | 1318,175 | 48,7% | 5 | No |
| Siguiente/HTTP | 2565,253 | 1316,730 | 48,7% | 5 | No |
| Anterior/HTTP | 2567,079 | 1306,909 | 49,1% | 5 | No |
| Página 500/HTTP | 2568,146 | 1314,320 | 48,8% | 5 | No |

El actor del benchmark de repositorio es el de mayor actividad; HTTP usa un binding activo autorizado. Los payloads difieren entre esos escenarios, no entre versiones de cada escenario. No se resta una serie a otra para inventar el costo del middleware.

HTTP incluye router, controller, firma JWT local, identidad activa actual y capability; usa cuota en memoria y excluye login/refresh de Keycloak, navegador, auditoría global y escrituras de cuota SQL. No equivale al E2E empresarial. El driver medido incluye red/adapter/motor; no aísla CPU SQL ni tiempo exclusivo de middleware/identidad. Las dos lecturas de movimientos siguen paralelas. No se redujo hashing para alcanzar la meta.

`OPT-08_PIN_SINTETICO.json`: cinco muestras por operación, con criptografía real y proveedores/DB dobles; setup ejercita criptografía pero no hay calentamiento separado para cada función. Tiempos no representativos de SQL/red/Keycloak empresarial:

| Operación sintética | Antes ms | Después ms | Interpretación |
|---|---:|---:|---|
| Revelar | 0,278 | 0,127 | AES local; no es una lectura SQL real |
| Aceptar | 0,064 | 0,049 | Persistencia simulada; no incluye verify |
| Generar credencial | 219,312 | 217,121 | Mismo scrypt; sin mejora algorítmica atribuida |
| Start + limpieza cancel | 0,286 | 0,068 | Código de recuperación sin cambios; ruido/setup |
| Resume | 1,054 | 1,257 | JWT firmado local, transporte simulado |
| Finish | 439,763 | 439,579 | Hash nuevo más comparación con vigente; sin mejora significativa |
| Cancel | 0,030 | 0,018 | Mismo contrato en memoria; ruido |

El doble contiene 16 columnas de usuario: reveal recupera 16 → 5 y acknowledge 16 → 4. No son el conteo físico de columnas de producción ni una medida de bytes de su credencial.

Formateo: diez fechas, 0,914 → 0,039 ms; diez fechas con hora, 1,422 → 0,114 ms. Mil llamadas sintéticas: 120,522 → 3,661 ms y 138,394 → 5,162 ms. Se reutilizan dos Intl.DateTimeFormat de Santiago, manteniendo exactamente las cadenas y los cambios DST.

Render de desarrollo en navegador real, cinco muestras, datos sintéticos y módulos calientes: perfil 18,2 → 19,5 ms de mediana de actualDuration; modal 9,4 → 7,1 ms. No se declara mejora global de montaje del perfil: la variación es pequeña y no es E2E. Se evitó memoización/virtualización injustificada para diez filas.

## J. Consultas SQL

| Función/recorrido | SELECT antes | SELECT después | Cambio |
|---|---:|---:|---|
| listRecentRecords | 7 | 1 | Una proyección con JOIN |
| listMovements | 8 | 2 | Página y count independientes en paralelo |
| HTTP perfil, escenario medido | 8 | 2 | Incluye identidad vigente |
| HTTP movimientos, escenario medido | 9 | 3 | Incluye identidad vigente |
| findUser de PIN | 1 lectura lógica | 1 lectura lógica | Menos columnas; no se midieron SELECT físicos de PIN real |
| Relectura bajo lock/rotación | Sin cambio | Sin cambio | No se retira FOR UPDATE ni la autorización |
| Start/cancel y estado de recuperación | 0 de negocio | 0 de negocio | Memoria y cuotas existentes; cuota SQL global fuera del benchmark |

Las cifras relacionales dependen de la presencia de subtipos en la página; no se afirma que una página sin actividad siempre emitiera siete SELECT anteriormente.

## K. Seguridad

Se comprobaron JWT ausente/malformado/firma incorrecta, capability, vinculación inexistente, deshabilitación y cambio de rol. Cada GET válido resuelve identidad nuevamente. Entradas `userId`/`subject` no sustituyen el propietario del contexto. Paginación/búsquedas inválidas son rechazadas antes del repositorio. Las consultas usan parámetros y no interpolación de entradas como código.

Pruebas de PIN: pendiente/aceptado, revelación rechazada, acuse repetido, fallo de escritura, usuario deshabilitado, ausencia de secreto en almacenamiento, cambio de cuenta y nueva sesión del mismo subject. La suite existente conserva pruebas de bloqueo e intentos concurrentes con hash real. No se agregaron logs de secretos ni instrumentación de producción.

Recuperación: issuer/audience/azp/nonce/firma/tiempos, cuenta y sesión distintas, state alterado, expiración, uso único, cancel concurrente, doble finish, puente resume consumido una sola vez, cookies/Origin, fallos y espera de commit. Código productivo de recuperación, navegación, JWT, rutas, AuthProvider y callback permanece idéntico a `b71fd33` (ver validación).

## L. Equivalencia funcional

- Diecisiete comparaciones reales de DTO/consultas; las once variantes adicionales también comparan el repositorio administrativo existente. Incluyen prefijos, Unicode, número, comodines, barra inversa y tentativa de inyección.
- Fixture SQL SELECT/CTE: 53 registros, 43 de un propietario y diez de otro, timestamps repetidos, seis páginas, página vacía con total correcto, niños superpuestos, estados nulos y búsqueda por relaciones que no ganan la prioridad de visualización. No hubo DDL/DML.
- Comparación unitaria contra mapper congelado: 24 combinaciones de presencia de subtipos y nombres nulos/vacíos/Unicode.
- Fechas inválidas/nulas y ambos lados del cambio de hora de Santiago conservan formato. Roles, estados, mensajes y campos del perfil mantienen su contrato.
- El PIN permanece pendiente hasta acuse persistido; recuperar no lo acepta automáticamente. El verify posterior continúa determinando estado y autorización de sesión.

## M. Regresiones

`userMovements.repo.js` administrativo no cambia; las comprobaciones de inspección y permisos de Users siguen en sus suites. UserMovementsModal/Table y ProfileSummary se revisaron sin modificar su código. La señal se corrige únicamente en el adaptador de perfil y su API.

Las suites completas cubren Kanban, pagos, calendario, gestión de usuarios, historial, métricas y servicios compartidos de PIN. `validate`, cálculos de hashing, cuotas y lectura bajo lock permanecen intactos. No se reoptimizó ninguno de esos módulos.

Responsive: 40 escenarios antes y 40 después, siete anchos entre 320 y 1920, zoom 200%, perfil con textos largos, historial con diez movimientos y total 10.000, pendiente de PIN, recuperación y error. Se estabilizaron transiciones antes de inspeccionar geometría/capturar. Cero desbordes; main y diálogos caben. Se comprobó Tab y almacenamiento web sin el PIN sintético. Se inspeccionaron capturas móviles. No se cambió CSS, paleta ni estructura corporativa. Las pruebas son de geometría/foco básico, no una certificación completa con lector de pantalla.

## N. Pruebas y reproducción

| Validación | Antes | Después |
|---|---|---|
| Backend `node --test --test-reporter=tap` | 358: 355 pasan, 3 fallan | 378: 375 pasan, mismos 3 fallan |
| Frontend `npm.cmd test -- --reporter=dot` | 304/304 | 318/318 |
| Backend focalizado perfil/PIN/recuperación | — | 57/57 |
| ESLint | — | Pasa |
| Build Vite 8.3.5 | — | Pasa, 1,11 s |
| Prisma validate | — | Pasa |
| Diff check | — | Pasa |

Node también descubre módulos fixture bajo `test`; el incremento bruto backend incluye un módulo de referencia adicional, además de 19 pruebas nuevas con aserciones. Los fallos previos son los mismos por nombre: Compose/CRLF, bootstrap/permisos POSIX sobre Windows y hash de la cadena de migraciones sensible a CRLF. No se debilitaron sus expectativas para conseguir una suite verde.

Comandos desde capaServidor:

```powershell
node --test --test-reporter=tap
node --test test/profilePerformance.test.js test/profileSecurity.test.js src/modules/auth/service/pinRecovery.test.js src/modules/auth/service/pinRecoveryNavigation.test.js
npm.cmd run prisma:validate
node --env-file=.env scripts/benchmarkProfileOpt08.mjs --allow-development-reads
node --env-file=.env scripts/benchmarkProfileOpt08.mjs --allow-development-reads --http-only
node --env-file=.env scripts/benchmarkProfileOpt08.mjs --allow-development-reads --fixtures-only
node scripts/benchmarkProfilePinSyntheticOpt08.mjs
```

`--http-only` y `--fixtures-only` agregan resultados al JSON creado por la primera ejecución. El benchmark requiere APP_ENV=development y opt-in; solo hace SELECT/EXPLAIN/SHOW. No ejecuta PIN real, DDL ni escrituras de negocio.

Desde capaVista: `npm.cmd test -- --reporter=dot`, `npm.cmd run lint`, `npm.cmd run build`. Desde raíz:

```powershell
node scripts/benchmark-profile-formatting-opt08.mjs
node scripts/verify-profile-opt08.mjs --before
node scripts/verify-profile-opt08.mjs
git diff --check
```

El verificador visual usa Edge sin interfaz, localhost, fixtures sintéticos y `git show b71fd33` para la referencia. Sus perfiles/capturas temporales se retiraron después de guardar los JSON; no quedan procesos del harness ni instrumentación sensible.

Limitaciones: no hay Docker operativo ni realm/MySQL aislados para escrituras; no se ejecutaron recuperaciones empresariales, pruebas masivas, benchmark físico de decenas de miles de movimientos/índice ni medición de p95/SLO. El total 10.000 del navegador es un fixture visual, no volumen SQL. Los errores de infraestructura no se presentan como optimizaciones ni como flujos reales validados.

Documentación oficial consultada: [Prisma 7, SQL parametrizado y tipos](https://www.prisma.io/docs/orm/v7/prisma-client/using-raw-sql/raw-queries), [React, limpieza de efectos y StrictMode](https://react.dev/reference/react/useEffect), [MySQL 8.4, EXPLAIN](https://dev.mysql.com/doc/refman/8.4/en/explain.html), [OWASP, tratamiento de sesión](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html). Se aplica el contrato local; no se reemplaza OIDC ni la recuperación actual por un mecanismo genérico.

## O. Archivos

Modificados:

- `capaServidor/src/modules/auth/controller/auth.controller.js`
- `capaServidor/src/modules/auth/service/pin.service.js`
- `capaServidor/src/modules/auth/service/pinRecovery.test.js`
- `capaServidor/src/modules/users/repo/users.repo.js`
- `capaVista/src/modules/auth/api/authApi.js`
- `capaVista/src/modules/auth/pinRecoveryBrowser.test.js`
- `capaVista/src/modules/profile/pages/ProfilePage.jsx`
- `capaVista/src/modules/profile/pages/ProfilePage.test.jsx`
- `capaVista/src/modules/profile/utils/profileFormatters.js`

Creados:

- `capaServidor/src/modules/users/repo/movementsRead.repo.js`
- `capaServidor/scripts/benchmarkProfileOpt08.mjs`
- `capaServidor/scripts/benchmarkProfilePinSyntheticOpt08.mjs`
- `capaServidor/scripts/profileHttpProbeOpt08.mjs`
- `capaServidor/scripts/profileSqlFixtureProbeOpt08.mjs`
- `capaServidor/test/fixtures/opt08/users.before.repo.js`
- `capaServidor/test/fixtures/opt08/pin.before.service.js`
- `capaServidor/test/profilePerformance.test.js`
- `capaServidor/test/profileSecurity.test.js`
- `capaVista/src/modules/profile/components/PendingPinModal.jsx`
- `capaVista/src/modules/profile/components/PendingPinModal.test.jsx`
- `capaVista/src/modules/profile/utils/fixtures/profileFormatters.before.js`
- `capaVista/src/modules/profile/utils/profilePerformance.test.js`
- `scripts/benchmark-profile-formatting-opt08.mjs`
- `scripts/verify-profile-opt08.mjs`
- `docs/OPT-08_MI_PERFIL_RENDIMIENTO.md`
- `docs/OPT-08_RENDIMIENTO.json`
- `docs/OPT-08_PIN_SINTETICO.json`
- `docs/OPT-08_FORMATO_SINTETICO.json`
- `docs/OPT-08_RESPONSIVE_BEFORE.json`
- `docs/OPT-08_RESPONSIVE_AFTER.json`
- `docs/OPT-08_VALIDACION.json`

No se eliminaron archivos productivos. Las copias congeladas solo cambian imports relativos para ejecutarse desde fixtures.

## P. Alternativas descartadas

No se separó actividad del GET: duplicaría HTTP/middleware/identidad. No se cachearon perfil asentado, autorización ni secretos. No se agregó GET a Keycloak para los datos personales. No se sustituyó OFFSET por cursor ni LIKE por búsqueda exacta/FULLTEXT. No se fusionó count con una ventana que obligara a recuperar filas fuera de la página o alterara páginas vacías. No se añadió un índice sin prueba representativa.

No se eliminó verify después del acuse ni la lectura protegida después de hashing; no se paralelizó indebidamente resume/finish. No se ajustaron algoritmos/costos, pool, timeouts globales, TLS ni cuotas. No se reformaron providers, callback u OIDC. No se añadió virtualización para diez filas ni se cambió el diseño para aparentar mejora.

## Q. Conclusión

Abrir perfil mejora 51,5% en el HTTP medido y cargar actividad reciente 55,3% en repositorio. El historial mejora 50,4% por HTTP y 66,3% en repositorio. Se eliminan seis SELECT por cada operación medida; búsqueda y paginación tienen reducciones semejantes, conservando eventos, total, timestamps y aislamiento.

El PIN conserva protección, aceptación durable y autorización de sesión; la recuperación mantiene Keycloak, PKCE, autenticación reciente, uso único y commit antes de éxito. Las pruebas locales verifican esos contratos y las rutas, pero no certifican la configuración ni disponibilidad del Keycloak empresarial.

Las etapas de repositorio están bajo un segundo en estas medianas; las lecturas HTTP continúan aproximadamente en 1,24–1,32 s. Criptografía sintética conserva su costo, y no existe una medida E2E empresarial ni p95 suficiente para afirmar el objetivo global. La latencia de viajes a MySQL y la validación vigente siguen siendo relevantes; necesitan mediciones de infraestructura separadas.

El cambio queda listo para revisión e integración en desarrollo, con las limitaciones explícitas de entorno. No se realizaron commits, pushes ni despliegues en OPT-08.

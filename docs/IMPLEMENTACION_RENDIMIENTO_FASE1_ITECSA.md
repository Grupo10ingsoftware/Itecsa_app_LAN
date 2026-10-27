# Implementación de rendimiento ITECSA — Fase 1

Fecha: 27 de octubre de 2026 (America/Santiago). Rama inicial: `main`. Base: `6405c3d407e92d89b286953cc9271daa51a6ac25`.

## A. Resultado ejecutivo

Se implementaron dos optimizaciones compartidas: un JOIN parametrizado mediante Prisma para resolver identidad en **un SELECT en lugar de dos**, y la reutilización explícita de `req.currentUser` en las seis operaciones de Mensajes/Notificaciones. No se modificaron reglas de negocio, contratos HTTP, esquemas, dependencias ni interfaces.

En desarrollo con MySQL remoto, la mediana de identidad pasó de **1.309,149 a 659,466 ms**. El flujo interno de notificaciones pasó de **4.435,809 a 2.548,823 ms**, reduciendo sus SELECT de **8 a 5**. Una lectura HTTP mínima protegida de diagnóstico quedó en **660,565 ms** de mediana; notificaciones HTTP quedó en **2.562,677 ms**. **La meta de un segundo no está cumplida para notificaciones ni certificada para el conjunto de la aplicación.**

Pasan las **24 pruebas nuevas**. Lint, build del frontend y validación de Prisma pasan. Las suites completas mantienen fallos previos detallados en G; no se presentan como completamente aprobadas.

La auditoría existente fue la fuente técnica principal. HEAD coincide con su commit, sin archivos rastreados modificados al comenzar. `docs/AUDITORIA_RENDIMIENTO_ITECSA.md` ya estaba sin seguimiento y se conservó intacto. No se repitió el inventario global.

## B. Prisma, MySQL y conexiones

Versiones comprobadas en el contenedor de desarrollo durante esta intervención: Node **22.23.4**, Prisma Client **7.10.0**, adapter-mariadb **7.10.0**, mariadb **3.5.4**, MySQL **8.4.8**. Pruebas locales: Node **24.19.0** en Windows.

| Elemento | Antes y después | Decisión |
|---|---|---|
| Cliente | Singleton perezoso por proceso en `src/database/prisma.js` | Conservar; no hay clientes por petición |
| Pool de la aplicación | Uno, propiedad del adaptador, límite 10 | No se hallaron pools redundantes activos |
| Conexión / consulta | 8.000 / 15.000 ms por defecto; variables existentes | Sin cambios |
| TLS | CA existente, `rejectUnauthorized: true`, identidad del host seleccionado | Sin cambios |
| Protocolo | `execute`, binario, configuración predeterminada del adaptador | Sin cambios |
| Preparación | Adaptador normaliza `prepareCacheLength` a 0 | Sin cambios |
| Transacciones | Cliente transaccional existente; conexiones reservadas por el adaptador | Sin cambios |
| Apagado | Drenar HTTP, detener limpieza y llamar `disconnectPrismaClient` | Sin cambios |

Se inspeccionaron las implementaciones instaladas del adaptador y del driver. El adaptador dispone de `useTextProtocol`; el driver admite caché LRU de sentencias. El pool valida conexiones según su política existente. No se desactivaron pings, controles al devolver conexiones ni detección de fallos. No se atribuye una duración concreta a adquisición, ping o preparación: **No medido por separado**.

La comparación de `query` y `execute` se realizó con una conexión dedicada y el mismo TLS. La diferencia de `SELECT 1` se reproduce, pero no prueba equivalencia de todos los tipos, escrituras y errores. No había una imagen MySQL local ni un servidor aislado disponible para esa matriz de integración; no se descargaron imágenes ni se escribió en la base remota para completarla. Se conservaron protocolo y caché. No se alteraron `node_modules` ni APIs internas.

No se aumentó el pool. El `max_connections=76` del informe previo no se utilizó como un dato vigente para dimensionar nada. No se midió saturación remota ni se hicieron cambios de infraestructura. Los clientes temporales de diagnóstico y la conexión dedicada se cerraron al finalizar.

Referencias de las opciones contrastadas con el código instalado: [MariaDB: opciones de conexión](https://mariadb.com/docs/connectors/mariadb-connector-nodejs/node-js-connection-options), [MariaDB: API y pool](https://mariadb.com/docs/connectors/mariadb-connector-nodejs/connector-nodejs-promise-api), [Prisma: consultas parametrizadas](https://www.prisma.io/docs/orm/v6/prisma-client/using-raw-sql/raw-queries). La referencia de Prisma describe la API de tagged templates también comprobada en el cliente instalado; no se migró de versión.

## C. Consulta de identidad

Archivo: `capaServidor/src/modules/users/repo/users.repo.js`, método `findBySubject`.

Antes: `usuario.findFirst`, filtro relacional `identityUserWhere(subject)` y `USER_RESPONSE_SELECT`. En cada muestra con binding existente, Prisma produjo un SELECT de siete columnas del usuario, con JOIN para filtrar, y otro SELECT de cinco columnas de `ExternalIdentity` para hidratar la relación. El DTO descartaba parte de esos datos.

Después: `$queryRaw` tagged template con ocho columnas y aliases del mismo DTO:

```sql
SELECT u.id_usuario AS idUsuario, e.subject AS identitySubject,
       u.correo_usuario AS correoUsuario, u.rut_usuario AS rutUsuario,
       u.nombre_usuario AS nombreUsuario, u.apellido_usuario AS apellidoUsuario,
       u.rol_usuario AS rolUsuario, u.estado_usuario AS estadoUsuario
FROM ExternalIdentity e
INNER JOIN Usuario u ON u.id_usuario = e.user_id
WHERE e.provider = ? AND e.issuer = ? AND e.subject = ?
LIMIT 1
```

Los tres parámetros proceden del mismo `identityKey` existente; no se concatenan valores en SQL. El subject devuelto procede del binding leído, no del argumento. Un binding ausente o sin usuario asociado devuelve `null`; los errores conservan el mapeo del repositorio. No se agregó un índice: se conserva el unique `(provider, issuer, subject)` y la unión a la PK de Usuario.

Se mantienen los ocho campos necesarios para el contrato común. Perfil consume nombre, apellido, correo y RUT; identidad y otros consumidores usan identificador, subject, rol y estado. Reducir el DTO a los cuatro campos del middleware rompería Perfil. `USER_RESPONSE_SELECT` sigue disponible para el listado administrativo, que aún lo utiliza. Se eliminó únicamente el mapper privado que quedó sin consumidores.

El SQL físico completo anterior y posterior, sin parámetros, está en [las muestras posteriores](FASE1_RENDIMIENTO_despues.json), claves `sql.legacy` y `sql.current`; la captura previa está en [la línea base](FASE1_RENDIMIENTO_antes.json). El plan de lookup con índice único/PK ya fue observado en EX01 de la auditoría; **no se ejecutó un EXPLAIN nuevo ni se presenta ese plan previo como una medición nueva**.

Se verificó igualdad estricta entre DTO ORM y DTO JOIN en las diez muestras de identidad y en cinco bindings adicionales. También se verificaron ausencia de binding, subject con sintaxis de inyección e issuer diferente mediante lecturas reales acotadas. Resultado: [equivalencia](FASE1_RENDIMIENTO_equivalencia.json), cero errores. Las pruebas con dobles cubren además Unicode, nulls, tipos del identificador, estados y errores.

## D. Reutilización dentro de la petición

`requireActiveIdentity` conserva su orden y comportamiento: JWT validado y claims normalizados, binding local, activación inicial cuando corresponde y comprobación de rol/estado antes de entregar `req.currentUser`. No se añadió una segunda estructura al request.

El controlador de Mensajes pasa `{ currentUser: req.currentUser }` en un parámetro interno separado de body y query a `getInbox`, `getNotifications`, `getMessage`, `markAsRead`, `hideNotification` y `clearNotifications`. El servicio comprueba subject coincidente, ID entero positivo y estado activo antes de usarlo. Los campos `currentUser`, ID o subject enviados por el cliente no sustituyen ese argumento. Sin contexto HTTP, los consumidores internos conservan la resolución mediante repositorio y sus errores 401/404.

No existe almacenamiento global, AsyncLocalStorage ni caché de actores/permisos. El servicio no guarda el contexto en sus propiedades. Cada nueva petición vuelve a resolver el binding, el rol y el estado; las llamadas concurrentes entregan su propio actor como argumento. No se guarda el request después de responder.

Las búsquedas de asignación de mensaje conservan el par usuario/mensaje. Se mantienen los errores 404 y la idempotencia de leído/oculto. No cambiaron paginación, polling, transacción de inbox, listados ni conteos.

Revalidaciones conservadas: lectura posterior a activación inicial; `PinService.validate` con `FOR UPDATE`, intentos y bloqueo; autorización administrativa posterior al PIN y controles del workflow de Keycloak. Tampoco se eliminaron resoluciones de escritura en Producción/Pedidos, incluidas rutas con lecturas o esperas externas. El alta de pedidos ya reutilizaba `actorId`; no se reimplementó. Esas decisiones mantienen el alcance y evitan tratar controles de escritura como simples consultas redundantes.

## E. Comparación de rendimiento

Diez muestras calientes por serie, pausa de 250 ms fuera del tiempo medido; primera consulta separada. Mediana aritmética de los dos valores centrales, mínimo/máximo y muestras individuales preservados. No se calculan p95/p99 ni se extrapolan percentiles poblacionales.

| Operación | Antes (ms) | Después (ms) | Mejora | Muestras | Entorno |
|---|---:|---:|---|---|---|
| Prisma `SELECT 1`, primer acceso del cliente | 2.235,901 | 2.082,286 | No atribuible; una observación | 1 + 1 | Docker desarrollo, TLS remoto |
| Prisma `SELECT 1`, caliente | 660,683 | 657,217 | Configuración sin cambios; variación | 10 + 10 | Mismo perfil |
| Driver `query`, caliente | 189,412 | 220,070 | Sin cambio aplicado; variación desfavorable | 10 + 10 | Conexión dedicada, mismo TLS |
| Driver `execute`, caliente | 378,768 | 439,599 | Sin cambio aplicado; variación desfavorable | 10 + 10 | Conexión dedicada, caché 0 |
| `findBySubject` | 1.309,149 | 659,466 | 49,63 % | 10 + 10 | Función; misma topología y fixture |
| Middleware de identidad | 1.309,769 | 659,216 | 49,67 % | 10 + 10 | Función; claims de prueba ya normalizados |
| Middleware + servicio de notificaciones | 4.435,809 | 2.548,823 | 42,54 % | 10 + 10 | Funciones; mismas lecturas y resultado |
| GET protegido mínimo de diagnóstico | 1.246,492 | 660,565 | 47,01 % | 10 + 10 | Loopback, JWT/JWKS sintéticos, SQL real |
| GET notificaciones de diagnóstico | 4.467,092 | 2.562,677 | 42,63 % | 10 + 10 | Loopback, JWT/JWKS sintéticos, SQL real |
| Adquisición de conexión / espera de pool | No medido | No medido | No determinada | — | Sin temporizador separado |
| HTTP productivo / cuota SQL real | No medido | No medido | No determinada | — | Fuera del entorno disponible |

Además de la captura previa a modificar el código, el diagnóstico posterior ejecutó la consulta ORM anterior y el JOIN en el mismo proceso: **1.315,604 frente a 659,466 ms**. El flujo anterior de notificaciones en ese proceso dio **4.446,443 ms**, frente a **2.548,823 ms**. Esto permite comprobar que la mejora no depende exclusivamente de comparar dos momentos de la red.

Rangos observados del JOIN: **570,769–665,622 ms**; GET mínimo optimizado: **574,599–914,139 ms**; GET notificaciones optimizado: **2.538,416–2.632,953 ms**. El mejor tiempo de este último sigue sobre un segundo.

La primera consulta de Prisma incluye inicialización del cliente/adaptador/pool; no equivale a un reinicio del motor ni de todas las cachés de red. Los primeros accesos HTTP se separan de las series calientes, pero utilizan un pool ya utilizado para preparar el fixture. No se mezclan como mediciones de arranque frío de la base.

El diagnóstico HTTP valida RS256, normaliza claims, resuelve identidad, consume una cuota en memoria de 120/minuto y exige capability antes del controlador. Se consumió el cuerpo completo con `fetch`. La autoridad sintética y los listeners viven en loopback y no autentican contra Keycloak empresarial. La respuesta de diagnóstico es `{ok:true}`: los resultados reales se comparan dentro del proceso y nunca se publican. Por ello mide HTTP y consultas de esa ruta de prueba, **no el payload final ni la sesión productiva de `/api/messages`**. La cuota SQL productiva no se sustituyó en la aplicación.

Evidencia: [antes](FASE1_RENDIMIENTO_antes.json), [después y referencia ORM](FASE1_RENDIMIENTO_despues.json), [HTTP de notificaciones](FASE1_RENDIMIENTO_http.json), [HTTP mínimo](FASE1_RENDIMIENTO_http_identidad.json). En las capturas de driver, `selects:0` significa que el contador de eventos de Prisma no está conectado a la conexión dedicada; **no significa cero consultas SQL del driver**. No se usa ese contador para atribuir consultas físicas al driver.

## F. Reducción de consultas

| Función / flujo medido | SELECT anteriores | SELECT posteriores | Motivo |
|---|---:|---:|---|
| `findBySubject`, binding existente | 2 | 1 | JOIN y proyección del DTO sin hidratación separada |
| Middleware de identidad, usuario activo | 2 | 1 | Utiliza el repositorio optimizado |
| Identidad dentro del flujo HTTP de notificaciones | 4 | 1 | Dos resoluciones de dos SELECT pasan a una de un SELECT |
| Flujo de notificaciones completo del fixture | 8 | 5 | Cuatro SELECT de negocio se mantienen |

Conteos instrumentados en todas las muestras de las respectivas series. No se generaliza el conteo del fixture a cualquier usuario con otras relaciones o a todas las operaciones de Mensajes. Los seis métodos reutilizan actor según las pruebas; solo notificaciones tiene conteo SQL real antes/después del flujo completo.

## G. Validación y límites

| Comprobación | Resultado |
|---|---|
| `node --test test/phase1*.test.js` | **24/24 pasan** |
| Suite backend antes de implementar, Windows | 96/99; tres fallos previos |
| `node --test`, backend final Windows | 120/123; los mismos tres fallos previos |
| Backend final, copia temporal Linux / Node 22 | 121/123; dos fallos de formato también presentes en los archivos originales |
| `npm.cmd test -- --reporter=dot`, frontend | 157/159; dos fallos en textos esperados de Gestión de usuarios |
| `npm.cmd run lint`, frontend | Pasa |
| `npm.cmd run build`, frontend | Pasa; 336 módulos transformados |
| `npm.cmd run prisma:validate`, backend | Pasa |
| `node --check`, siete archivos JS/MJS nuevos o intervenidos | Pasa |
| `git diff --check` | Pasa |

Los nuevos tests cubren parámetros de identidad e inyección; usuario ausente, deshabilitado, cambiando de rol y binding inconsistente; activación inicial y revocación durante su revalidación; concurrencia entre usuarios y solicitudes del mismo usuario; cambio de cuenta, ausencia de token y revocación local entre peticiones; firma, issuer, audience, expiración, cliente y capabilities con JWT reales de prueba; ownership e intento de inyectar actor en body/query; cuotas concurrentes, aislamiento y 429; persistencia de contadores mediante un doble SQL serializado; PIN correcto, incorrecto, pendiente de aceptación, bloqueo e intentos concurrentes usando el hash real y dobles de base; uso del cliente transaccional, commit, rollback, liberación y recuperación de errores con el adaptador instalado y un doble de pool.

Se ejecutaron smoke tests sobre los routers reales de Usuarios, Perfil, Kanban, detalles de producción, Pagos, Historial, Métricas, Calendario, Ventas, carga diaria, Privacidad e Incidentes, con servicios/controladores de prueba. Comprueban sus barreras de autenticación/autorización y la entrega del actor; no certifican escrituras de negocio reales. Mensajes y Notificaciones se ejercitaron también con su controlador/servicio real y repositorios de prueba. La suite frontend incluye sesiones, cliente HTTP, perfil, mensajes, vistas y modales PIN.

Fallos previos conservados, sin debilitar aserciones:

1. `mysqlDeployment.test.js`: espera un fragmento con LF en `compose.mysql.yaml`, cuyos bytes contienen CRLF; también falla en la copia del commit original extraída en Linux.
2. `mysqlLabMigrationHistory.test.js`: checksum de `0_init` difiere por CRLF. Normalizar únicamente en memoria a LF produce exactamente el hash esperado `34c502aa…803ce5`; no se editaron migraciones.
3. `mysqlLabAccounts.test.js`: permisos POSIX 0600 frente a 0666 informados por Windows. En Linux pasa.
4. Dos casos de `PageMigration.test.jsx` buscan el texto «Puedes crear usuarios y editar sus datos», ausente en la vista actual. No se modificó ningún archivo frontend; esas pruebas no dependen del backend cambiado.

No hay scripts de lint/typecheck/build de backend ni script de typecheck del frontend. Se validaron sintaxis JS y esquema; no se inventa una verificación de tipos inexistente.

No se hicieron intentos PIN sobre cuentas reales, escrituras SQL remotas, pruebas de saturación, cortes de conexiones empresariales ni autenticaciones reales de usuarios. Las transacciones de cuota/PIN y fallos de red se probaron con dobles; no equivalen a ensayos con MySQL aislado real. No se ejecutó una matriz global de tipos/escrituras porque el protocolo y su conversión no cambiaron. La equivalencia real se limitó a los campos de identidad y resultados de notificaciones.

Logout y recuperación/cambio de sesión se cubren mediante pruebas existentes y sintéticas. **No medido:** invalidación remota de sesiones Keycloak reales ni comportamiento de un token ya emitido tras logout del proveedor. Se conservó el mecanismo existente; no se añadió introspección ni se cambió su política de revocación.

## H. Archivos de esta intervención

| Archivo | Motivo |
|---|---|
| `capaServidor/src/modules/users/repo/users.repo.js` | JOIN parametrizado de identidad; eliminación del mapper sin consumidores |
| `capaServidor/src/modules/messages/controller/message.controller.js` | Entregar el actor del request en las seis llamadas internas |
| `capaServidor/src/modules/messages/service/message.service.js` | Reutilizar y validar el actor recibido; conservar fallback interno |
| `capaServidor/scripts/benchmarkPhase1.mjs` | Diagnóstico opt-in, acotado, SELECT-only, mediciones y equivalencia |
| `capaServidor/test/phase1Identity.test.js` | Contrato de identidad y reutilización aislada |
| `capaServidor/test/phase1Security.test.js` | JWT, routers consumidores, ownership, cuotas y PIN |
| `capaServidor/test/phase1Connections.test.js` | Adaptador/pool y transacciones mediante dobles |
| `docs/FASE1_RENDIMIENTO_antes.json` | Muestras previas y SQL físico sin parámetros |
| `docs/FASE1_RENDIMIENTO_despues.json` | Muestras posteriores y comparación con ORM anterior |
| `docs/FASE1_RENDIMIENTO_http.json` | Muestras HTTP del flujo de notificaciones |
| `docs/FASE1_RENDIMIENTO_http_identidad.json` | Muestras HTTP de lectura mínima protegida |
| `docs/FASE1_RENDIMIENTO_equivalencia.json` | Resultado de equivalencia real acotada |
| `docs/IMPLEMENTACION_RENDIMIENTO_FASE1_ITECSA.md` | Este informe |

El archivo de auditoría previamente sin seguimiento no forma parte de los cambios de esta intervención. No se realizaron commits, push, despliegues ni migraciones. Las ejecuciones de código optimizado en Docker utilizaron copias temporales, separadas de los archivos de la API activa. No se reinició el servidor.

Para reproducir el diagnóstico, cargar en un proceso separado la configuración de desarrollo ya autorizada, con la CA existente, y ejecutar desde `capaServidor`:

```text
node scripts/benchmarkPhase1.mjs --allow-development-reads
node scripts/benchmarkPhase1.mjs --allow-development-reads --http-only
node scripts/benchmarkPhase1.mjs --allow-development-reads --identity-http-only
node scripts/benchmarkPhase1.mjs --allow-development-reads --verify-only
node --test test/phase1*.test.js
```

El script exige `APP_ENV=development`. Requiere un binding activo del issuer configurado, resuelto en memoria sin imprimir identificadores. No carga credenciales nuevas ni selecciona otro destino. No debe usarse para justificar mediciones productivas. Los nombres históricos `httpLegacyWarm`/`httpCurrentWarm` de la captura HTTP corresponden a `httpNotificationsLegacyWarm`/`httpNotificationsCurrentWarm` en la versión final del diagnóstico.

## I. Alternativas no conservadas o no aplicadas

- Protocolo de texto: se compararon `query` y `execute` para la consulta mínima; no se aplicó globalmente por falta de matriz representativa de tipos, transacciones y escrituras aisladas.
- Caché de preparación: opción inspeccionada y soportada; no aplicada ni presentada como mejora medida. No hay datos sobre variedad real de statements, presión del servidor y equivalencia de escrituras en un entorno aislado.
- Aumentar conexiones o reducir validación: sin evidencia de un problema de capacidad/adquisición que lo justifique. Se conservan las comprobaciones del pool.
- Activar estrategias relacionales/previews globales: se prefirió un JOIN puntual mediante la API pública de Prisma, ya comprobado, sin regenerar el contrato del cliente ni modificar el esquema.
- Caché global de identidad: excluida por aislamiento y revocación. La reutilización termina con la llamada de la misma petición.
- HTTP frontend, serialización y logger: no hay evidencia nueva de un costo relevante que justifique cambios. Se conservan timeout, cancelación, renovación y barreras de sesión existentes.

No se dejó ninguna optimización que hubiera mostrado un cambio de valores o una regresión. Los fallos corregidos durante el desarrollo de los tests fueron errores de los dobles: posición del parámetro de expiración SQL y selección de roles por capability; se corrigieron los fixtures, sin cambiar políticas ni debilitar aserciones.

## J. Dependencias de infraestructura y objetivo pendiente

Las mediciones mínimas muestran costos fuera del motor SQL: en la serie posterior, `query` dedicado da 220 ms, `execute` 440 ms y Prisma/pool 657 ms de mediana. Son mecanismos con trabajo diferente; no permiten atribuir toda la diferencia exclusivamente a la red, Prisma, pings o preparación. La muestra aislada de 0,249 ms del motor de la auditoría no se usa como una distribución representativa nueva.

Para notificaciones, el resultado optimizado conserva cinco SELECT: uno de identidad y cuatro del negocio del fixture. Esa es la carga compartida/por módulo que queda demostrada; no se cronometró cada viaje por separado. El mejor HTTP medido fue 2.538,416 ms. No se puede prometer ≤1.000 ms con estos resultados.

Queda pendiente un entorno MySQL aislado con datos sintéticos para comparar caché/protocolo, escrituras y tipos completos; y una medición sobre la LAN final con API, MySQL y Keycloak en la topología autorizada, incluyendo cuotas SQL. Evaluar proximidad de la base y transporte puede reducir el costo de múltiples viajes; su beneficio exacto es **No medido**. No se movieron datos, certificados ni servicios empresariales, ni se modificaron firewall o recursos.

## K. Preparación para la segunda fase

Los cambios compartidos quedan implementados, con equivalencia medida, 24 pruebas focalizadas aprobadas y sin nuevos fallos identificados en las suites ejecutadas. El beneficio se mantiene al comparar el flujo ORM anterior en el mismo proceso de diagnóstico.

Esto proporciona una base verificable para decidir la Fase 2. No representa una aprobación productiva global: permanecen los fallos previos de las suites, las verificaciones de infraestructura real y el objetivo incumplido de notificaciones. No se comenzaron optimizaciones particulares de Kanban, Pagos, Usuarios, calendario, métricas ni vistas. La reducción adicional de los cuatro SELECT de notificaciones y otros trabajos específicos corresponde a esa segunda fase.

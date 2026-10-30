# Optimización global de conexiones ITECSA

30-10-2026, America/Santiago. Rama `optimizacion-final`, HEAD `554734f6c5aef2fdc075c0cd76e79ed14be0413d`, sin commit, push, merge ni despliegue. Se preservó el trabajo previo de Cobranzas y la auditoría transversal. Evidencia nueva: `evidencia/optimizacion-conexiones-20261030/`.

## Resultado

Se conservaron tres cambios compartidos: caché acotada de preparación, validación de conexiones ajustada a su reutilización y escritura de auditoría HTTP sin recuperar un registro que el consumidor descarta. **No se cachean resultados ni decisiones de autorización.** El cliente Prisma y su pool siguen siendo únicos por proceso; no se cambiaron repositorios de dominio, dependencias, esquema, Keycloak ni frontend.

En las series reales comparables, las medianas HTTP pasan de **1311 a 454 ms en Usuarios**, **1333 a 448 ms en Cobranzas** y **1319 a 428 ms en Perfil**. Son reducciones observadas de mediana de **65,4%, 66,4% y 67,5%**, respectivamente, no garantías de futuras cargas. Las 60 respuestas finales fueron 200 y sus máximos quedaron por debajo de 1 s en ese escenario serial, con cinco peticiones de calentamiento por ruta.

**No se certifica un máximo global de un segundo.** Después de pausas y una prueba de recuperación hubo respuestas de 1,1–1,24 s; con dos solicitudes concurrentes el máximo fue 1,50 s. Se confirmó además un límite anterior que permanece: `DB_QUERY_TIMEOUT_MS` se aplica como watchdog de socket de 15 s y puede cerrar sesiones saludables pero inactivas, perdiendo su caché. Se explica por qué no se desactivó ese control sin un sustituto seguro.

## Resumen de hallazgos y cambios

Tiempos en ms, medianas salvo indicación. Las filas describen límites distintos y no deben sumarse.

| Hallazgo | Causa | Cambio conservado | Antes | Después | Resultado |
| --- | --- | --- | ---: | ---: | --- |
| Preparación repetida | El adaptador normaliza a 0 solo cuando no se declara valor; `execute` prepara cada vez | LRU explícita de 32 por conexión, protocolo binario intacto | 396 PREPARE / 396 EXECUTE en sesiones finales observadas | 88 / 396 con solo caché | Reutilización confirmada por contadores propios y objetos preparados vivos |
| Validación costosa con cupo libre | FIFO de idle + umbral 500 ms provocan ping frecuente; presupuesto 250 ms próximo al RTT | Umbral 5000 ms y ping 1000 ms, conservando `isValid`, validación tras idle y manejo de errores | Adquisición SELECT 1: 218,257 | 0,022 en configuración final caliente | No se aumentó el pool ni se deshabilitó salud |
| Recorrido Prisma mínimo | Ping + PREPARE + EXECUTE secuenciales sobre MySQL remoto | Configuración central compartida | SELECT 1: 655,638 | 219,024 | Reducción del recorrido, sin cambiar SQL ni conversiones |
| Dos fases HTTP autenticadas | Identidad fresca y después dominio, con el mismo costo de conexión/protocolo | Mejorar ambas fases, manteniendo el orden de seguridad | Usuarios: 1311,423 | 453,813 | Misma identidad/capacidad y 3 SELECT por petición |
| Auditoría posterior ocupa sesión | `.create` abre transacción, inserta, hidrata y confirma; el middleware ignora el retorno | Opt-in `returnRecord:false`, `createMany` de una fila con confirmación `count===1` | Ocupación hasta último comando, Usuarios: 1312,885 | 220,298 | Se conservan eventos, campos, errores y finalización; no hay éxito anticipado de negocio |
| JWT/JWKS ya reutilizados | Verificación local y caché de claves existentes | Sin cambios | Verificación caliente rápida en auditoría | 20 verificaciones finales, 1 GET JWKS acumulado | No existe justificación para debilitar o reemplazar el mecanismo |
| Sesiones perdidas tras pausa | Watchdog de socket de 15 s también opera sin comando activo | No desactivarlo; límite documentado y probado | Configuración previa ya tenía 15000 ms | Sigue 15000 ms | Reparación alternativa descartada por incompatibilidad/riesgo de perder timeout de operaciones |

Los contadores de preparación son de sesiones propias supervivientes al final, no contadores globales ni captura de paquetes. En la fase de solo caché hubo un timeout de ping; no se supone que los contadores de una sesión descartada sigan disponibles.

## Cambios de código y garantías

### 1. Configuración central de Prisma y del driver

Archivo: `capaServidor/src/database/prisma.js`, `readPrismaConfiguration` y `getPrismaClient`.

Se suministra explícitamente `prepareCacheLength=32` a `PrismaMariaDb`. El código instalado de adaptador 7.10.0 **respeta valores definidos**; no fue necesario crear un pool externo ni modificar `node_modules`. MariaDB 3.5.4 implementa la LRU por base/SQL y libera preparados expulsados cuando deja de utilizarlos. Se comprobó el valor efectivo, el protocolo binario y la retención en MySQL.

El límite por defecto representa hasta 320 entradas LRU en las 10 conexiones del proceso, más preparados transitoriamente en uso; no es una caché de filas ni un límite global del servidor. En la fase final principal se observaron **74 preparados retenidos** entre las 10 sesiones. En una sesión de ensayo se ejecutaron 40 formas diferentes y después se volvió a la consulta inicial: siguió funcionando, con **32 preparados propios** observados. La prueba fuerza evicción real, no un doble del driver.

La validación se omite solo si la sesión se utilizó recientemente, durante una ventana acotada de 5 s. El driver sigue comprobando `isValid` en cada adquisición. Al superar esa antigüedad se ejecuta ping con presupuesto 1 s. No se reintentan escrituras ambiguas ni se modifica la política de devolución/rollback del driver. El umbral es **por conexión**, no por actividad global de la aplicación.

Compromiso explícito: la ventana aumenta de 0,5 a 5 s, y un corte silencioso dentro de ella puede detectarse al ejecutar SQL en vez de con un ping previo. Sigue acotado por el watchdog existente; las conexiones ya marcadas inválidas se descartan de inmediato. Un ping sin respuesta puede esperar hasta 1 s frente a los 250 ms anteriores. No se declara un nuevo límite absoluto de latencia ni se presenta la prueba de destrucción local como reproducción de todos los fallos de red posibles.

Opciones nuevas, validadas como enteros y sin imprimir sus valores en errores:

| Variable | Default | Valores admitidos |
| --- | ---: | --- |
| `DB_PREPARE_CACHE_LENGTH` | 32 | 0–256; 0 permite volver al comportamiento sin caché |
| `DB_POOL_VALIDATION_DELAY_MS` | 5000 | 0–30000; 0 valida en cada adquisición |
| `DB_POOL_PING_TIMEOUT_MS` | 1000 | 100 hasta `DB_CONNECT_TIMEOUT_MS` efectivo |

Se mantienen: `connectionLimit=10`, mínimo idle efectivo 10, `acquireTimeout=10000`, timeout de establecimiento 8000, watchdog de socket 15000, TLS obligatorio con CA y verificación del host, aislamiento y durabilidad. No se editó `.env`. `readPrismaConfiguration(env)` se exporta para probar la validación con entorno explícito; la API sigue llamándolo con su entorno real.

La [documentación del pool](https://mariadb.com/docs/connectors/mariadb-connector-nodejs/connector-nodejs-promise-api) y las [opciones de conexión](https://mariadb.com/docs/connectors/mariadb-connector-nodejs/node-js-connection-options) apoyan la semántica; los valores efectivos se verificaron en el código instalado y el objeto del pool vivo.

### 2. Auditoría sin hidratación innecesaria

Archivos: `src/modules/security/repo/securityAudit.repo.js` y `src/middlewares/supportAudit.js`.

`SecurityAuditRepository.record` mantiene por defecto el contrato anterior: devuelve la fila creada. Los consumidores de incidentes, monitor de notas de venta y transacciones de creación de pedidos **no cambian**. Solo `supportAudit` solicita `{ returnRecord:false }`, porque únicamente necesita confirmación y tratamiento del error.

La proyección de campos y el saneamiento son los mismos. En ese modo se inserta exactamente una fila, sin `skipDuplicates`, y se exige `count===1`. No se usa una cola nueva, ni se cambia el momento del listener `finish`, ni se omiten errores: la promesa resuelve al confirmar la escritura; rechazos de Prisma se propagan a la captura y logger existentes. Un resultado que no confirme una fila genera `AUDIT_WRITE_NOT_CONFIRMED`. Se conserva la inyección de un cliente transaccional.

En las trazas finales de los 60 GET, la auditoría posterior emite **un INSERT por petición**. Ya no se observan su BEGIN/SELECT de hidratación/COMMIT explícitos; el INSERT se confirma mediante autocommit MySQL y su respuesta. La comparación no elimina durabilidad: elimina una transacción multisentencia que solo servía para devolver la fila insertada.

Una lectura posterior limitada a los UUID de las 60 solicitudes comprobó **60 eventos y exactamente uno por solicitud**. Dos regresiones físicas adicionales insertaron un evento ficticio exclusivamente dentro de una transacción que se revierte deliberadamente, una con retorno y otra sin él: cada una vio una fila dentro de su transacción y **cero filas persistidas después de rollback**. No se modificaron registros empresariales, cuentas ni PIN.

### 3. Autenticación y Keycloak

No se modificaron JWT, firma/issuer/audience, normalización de claims, capacidades, lectura fresca de identidad, activación/revocación, PIN ni compensaciones. La identidad se sigue consultando antes del servicio de dominio; no se paraleliza con operaciones que dependen de su autorización.

La lectura de identidad de Usuarios pasó de mediana **657,898 a 219,930 ms**. El middleware completo pasó de **658,346 a 220,363 ms**. El ahorro está en el mismo acceso SQL compartido; no se omite la comprobación. La política de cuota development sigue en memoria, como antes.

El cliente administrativo Keycloak mantiene sus cachés de token/UUID y promesas en vuelo. En la comprobación real final, una nueva caché JWKS produjo un GET y 20 verificaciones posteriores mantuvieron el acumulado en uno. Hubo 20 GET administrativos de representación de rol, sin modificar cuentas. No había un defecto demostrado que justificara intervenir aquí.

## Método y comparabilidad

Se consultaron la auditoría transversal, su índice/JSON pertinentes, los antecedentes de Usuarios/Cobranzas y los consumidores compartidos. No se repitió el inventario completo ni se construyó una API sustituta.

Entorno: Node **v24.19.0**, Express **5.2.1**, Prisma Client/adaptador **7.10.0**, MariaDB **3.5.4**, MySQL Aiven, Keycloak real mediante el forwarding SSH existente. Rama/HEAD iguales; destinos y opciones se leen del proceso, no de un harness con configuración presumida. Las lecturas usan el actor autorizado existente `desarrollador.prueba`, sin alterar su cuenta.

Se midieron cuatro etapas, sin pruebas de rendimiento simultáneas:

| Etapa / carpeta | Cambio frente a la anterior | PID API observado |
| --- | --- | ---: |
| `before/` | Ninguno; línea base actual | 25844 |
| `cache/` | Solo caché de preparación | 37400 |
| `pool/` | Validación/reutilización de sesiones | 30820 |
| `audit/` | Solo modo de auditoría sin retorno | 38400 |
| `final/` | Misma implementación que `audit/`; seguridad y escenarios adicionales | 38400 |

Las tres recargas fueron las normales de nodemon al aplicar cambios de código. No se detuvieron Vite ni el túnel, ni se alteró infraestructura.

Por etapa: 5 peticiones de calentamiento por ruta y luego **20 peticiones completas** de Usuarios, Cobranzas y Perfil. SQL mínimo: primera observación separada y 20 ejecuciones; diez pares SQL simultáneos. Se mantuvieron actor, rutas, filtros y algoritmo del instrumento. Cada petición serial espera a que la auditoría posterior libere conexiones antes de comenzar la siguiente, por lo que se separan tiempo HTTP y tiempo de ocupación posterior. Esto controla el solapamiento; la prueba adicional concurrente sí permite auditoría y lecturas simultáneas.

Reloj monotónico `performance.now`. HTTP se mide desde el cliente Node hasta consumir todo el cuerpo, a través del listener Express habitual; no incluye renderizado del navegador. `finish` del servidor se registra aparte. No se suman consultas paralelas ni medianas de etapas contenidas. p95 es rango más cercano, 19 de 20: descriptivo e inestable con esta muestra pequeña.

La primera petición de cada proceso se conserva en `first-profile.json`; incluye efectos de inicialización, negociación y compilación y **no se mezcla con caliente**. Cambiar código requiere un proceso nuevo; el pool se completa en segundo plano y una forma SQL puede prepararse por primera vez en otra sesión aun después de cinco warmups. Los máximos incluyen esos aciertos/fallos reales de LRU y la variación de transporte; no se descartaron valores lentos.

La correlación de eventos del driver con sentencias cacheadas resultó incompleta en partes de `cache/` y `pool/`: un contexto AsyncLocalStorage anterior podía prevalecer sobre la ventana serial actual. Se corrigió únicamente el observador para la fase `audit/`, priorizando la ventana explícita; esa fase vuelve a observar 3 SQL por Usuarios/Cobranzas y 2 por Perfil en cada petición. **Un cero de eventos en las fases intermedias no significa cero consultas.** Sus tiempos HTTP, identidad, opciones vivas y contadores de sesión siguen siendo observaciones válidas; no se usan las trazas incompletas para atribuir tiempo a CPU o inferir consultas evitadas.

La ejecución de SQL dentro del motor no se atribuye al reloj del driver. La auditoría previa ya tenía un COUNT de texto con motor correlacionado; las consultas binarias no daban SQL_TEXT exacto fiable en history. Aquí no se cambiaron esos SQL ni se inventa un tiempo nuevo de motor para HTTP. La evidencia principal de mejora son las rutas reales y el cambio observable de protocolo/preparación.

## Resultados HTTP y evolución

### Antes y resultado conservado

Cada fila tiene n=20 antes y n=20 después; 20/20 respuestas 200 en cada lado.

| Ruta real | Antes mediana / p95 / máximo ms | Después mediana / p95 / máximo ms | Reducción observada de mediana |
| --- | ---: | ---: | ---: |
| `/api/admin/identity/users?page=1&perPage=10` | 1311,423 / 1339,461 / 1345,763 | **453,813 / 771,794 / 889,524** | 65,4% |
| `/api/orders/payments?status=Pendiente&page=1&limit=10` | 1333,110 / 1342,575 / 1342,712 | **447,937 / 680,259 / 680,384** | 66,4% |
| `/api/auth/profile` | 1318,887 / 1339,130 / 1343,010 | **428,367 / 679,256 / 897,809** | 67,5% |

Estas cifras nuevas sustituyen como línea de comparación a las históricas de otro ensayo; no se mezclan muestras entre informes. Los cuerpos se consumieron y descartaron; se guardaron duración, estado, bytes, formas SQL por hash e IDs técnicos de solicitud, no datos empresariales ni credenciales.

### Separación de cambios

Medianas HTTP en ms; todas las etapas tienen n=20 por ruta. Los JSON mantienen también p95, máximos e individuos.

| Etapa | SELECT 1 completo | Usuarios HTTP | Cobranzas HTTP | Perfil HTTP |
| --- | ---: | ---: | ---: | ---: |
| Antes | 655,638 | 1311,423 | 1333,110 | 1318,887 |
| Solo caché | 383,564 | 898,550 | 897,556 | 884,655 |
| Caché + política de pool | 213,992 | 586,966 | 516,969 | **969,280** |
| Más auditoría sin hidratación | 219,024 | 453,813 | 447,937 | 428,367 |

La política de pool aislada **no dio una mejora uniforme de Perfil**: se conserva ese resultado desfavorable. Sus sesiones continuaron superando 5 s sin utilizarse debido a la rotación entre diez conexiones y el trabajo posterior de auditoría; hubo pings y variación de transporte. No se atribuye toda esa diferencia al parámetro. La interacción se resuelve mejor con la auditoría más corta: cambia la antigüedad con que se vuelve a tomar una sesión. Por eso el efecto conjunto no es una suma de ahorros independientes.

En SELECT 1, antes: adquisición mediana **218,257 ms**, driver binario **437,162 ms**, 20 pings. Después: adquisición **0,022 ms**, driver **218,678 ms**, cero pings en esa serie. Son intervalos de la misma instrumentación, con preparación contenida dentro del driver; no se suman sus p95.

En Usuarios, antes 60 adquisiciones de primer plano dan mediana **218,433 ms**; después, **0,017 ms**. Binario observado: **438,121 → 219,642 ms**. El control de identidad sigue teniendo una ejecución de SELECT por cada petición, y página/COUNT mantienen su paralelismo.

### Ocupación posterior por auditoría

Límite común: desde adquisición efectiva hasta el último comando observado de la auditoría de Usuarios. La liberación ordinaria posterior es inmediata en el driver; no se presenta como CPU pura ni se suma a HTTP.

| Etapa | n | Mediana / p95 / máximo ms |
| --- | ---: | ---: |
| Antes | 20 | 1312,885 / 1323,721 / 1323,989 |
| Solo caché | 20 | 858,457 / 1152,366 / 1317,760 |
| Con política de pool | 20 | 879,756 / 1320,374 / 1700,396 |
| Con auditoría sin hidratación | 20 | **220,298 / 443,888 / 445,497** |

La confirmación del pago, creación de un usuario u otra escritura de dominio no se adelantó. El listener de soporte ya era posterior a HTTP y sigue siéndolo. Los consumidores transaccionales de `record` conservan el retorno anterior; el nuevo modo se probó también con cliente transaccional y rollback físico.

## Frío, inactividad, concurrencia y recuperación

Evidencia: `final/real-safety.json`, `final/idle-concurrency-audit.json`, `final/socket-idle.json` y `final/audit-rollback.json`.

- **Datos reales del driver, valores sintéticos solo en SELECT**: 20 ejecuciones variando parámetros verificaron entero negativo, decimal exacto de alta precisión, BigInt mayor que MAX_SAFE_INTEGER, DATETIME con milisegundos, null/no-null y Unicode/texto parecido a SQL. No se almacenaron esos valores ni se incorporaron a lógica de negocio.
- **Transacciones**: rollback de lectura propagó el error original y permitió reutilizar la conexión. Se completó otra transacción de lecturas con 40 formas SQL y commit; solo ese ensayo largo usa timeout diagnóstico 60 s, sin cambiar los defaults de la aplicación.
- **Evicción**: la consulta inicial siguió funcionando después de expulsar preparados; MySQL mostró 32 preparados en el hilo propio de esa sesión.
- **Recuperación**: se destruyó solo una conexión reservada exclusivamente por el diagnóstico, sin trabajo de negocio pendiente. Las siguientes 20 lecturas Prisma fueron correctas y el pool repuso conexiones. No se mataron sesiones ajenas ni se agregó reintento de escrituras.
- **Tras pausas**: tres observaciones separadas de Perfil, no una cohorte caliente: pausa 1 s → 875,945 ms; pausa 6 s → 1244,299 ms; otra pausa 6 s → 1104,686 ms. Las dos de 6 s contienen pings de primer plano, con respuestas correctas y sin `ER_PING_TIMEOUT`. n=3, sin p95. Las sesiones habían pasado por evicción/recuperación, por lo que tampoco se usa esta serie como prueba aislada del efecto exclusivo de esperar seis segundos.
- **HTTP concurrente**: 20 GET de Cobranzas, concurrencia máxima 2, todos 200: mediana **656,041 ms**, p95 **1103,475 ms**, máximo **1497,813 ms**. Máximo observado de conexiones activas 5 y cola 0. Los eventos del driver se agregan por ventana concurrente, no se atribuyen artificialmente a una solicitud individual. No es prueba de estrés ni certifica capacidad para cargas mayores.

### Límite confirmado del watchdog de socket

La prueba de inactividad refrescó las sesiones mediante lecturas de metadatos propias y después **no envió SQL durante 20 s**. Comenzó con 10 idle; terminó con 8, con ocho establecimientos de conexión observados durante la ventana. Se capturó directamente un `ER_SOCKET_TIMEOUT` a **15011,086 ms**, **sin comando activo**. El conteo de timeouts no es exhaustivo: algunos listeners ya se habían enlazado antes de instalar el observador. No se confunde ese cierre con saturación o timeout del motor.

El origen está en `readPrismaConfiguration`, que aplica `DB_QUERY_TIMEOUT_MS` a `socketTimeout`, y en el driver instalado: el watchdog se arma sobre el socket y `socketTimeoutReached` termina la conexión sin distinguir si hay comando activo. Al recrearse la sesión, se pierde su caché de preparación y vuelve a pagarse autenticación TCP/TLS.

Se evaluaron y descartaron:

1. **Poner socketTimeout=0**: elimina la protección vigente durante consultas/comunicaciones bloqueadas. No se conserva.
2. **Sustituirlo por queryTimeout/timeout del conector**: el código instalado implementa ese mecanismo mediante funciones específicas de MariaDB y rechaza MySQL. No es sustituto compatible aquí.
3. **Aumentar solo el socketTimeout**: pospone el cierre idle a costa de ampliar la espera permitida de operaciones; no separa las dos necesidades.
4. **Tocar internals o envolver toda adquisición, ejecución, transacción y cancelación**: exige un nuevo contrato de timeout y destrucción de sesiones, incluido commit ambiguo. No se introduce un gestor adicional ni un parche a node_modules para obtener una cifra favorable.

Por seguridad se conserva el watchdog actual. Una solución futura requiere un mecanismo soportado que distinga timeout de operación e inactividad, con pruebas de escrituras ambiguas/cancelación. Esta limitación impide prometer latencia caliente después de cualquier pausa, pero no invalida la reducción medida bajo uso continuado.

## Alternativas descartadas y alcance conservado

| Alternativa | Decisión y motivo |
| --- | --- |
| Texto global en el adaptador | No aplicado. La caché binaria demuestra mejora y conserva los mismos caminos de conversión y parametrización; no es necesario añadir otra variable de compatibilidad. |
| Pool externo, LIFO propio o pool más grande | No aplicado. No hubo cola por falta de cupos en las pruebas; implicaría más propiedad/ciclo de vida sin resolver una saturación demostrada. |
| Deshabilitar pings o `noControlAfterUse=true` | Rechazado: conservar salud, rollback y recuperación tiene prioridad. |
| Caché de identidad/rol/revocación, eliminar PIN o paralelizar antes de autorizar | Rechazado: debilitaría las garantías. El ahorro se obtiene acelerando los SQL que siguen ejecutándose. |
| Cambiar toda auditoría a retorno vacío | Rechazado: preservamos el contrato de los otros consumidores. Solo el middleware que descarta la fila opta por confirmación. |
| Cambiar Keycloak/JWKS | Sin problema demostrado en el mecanismo compartido; se conserva y comprueba. |
| Eager connect o peticiones de mantenimiento para aparentar frío rápido | No aplicado. Desplazaría el costo a startup o añadiría tráfico periódico y no soluciona la separación de timeouts. Se muestran las primeras peticiones y las pausas reales. |

No hubo cambios de aislamiento, durabilidad, transacciones de negocio, API, datos de empresa, correo, Docker, LAN, infraestructura o despliegues. No se hicieron escrituras HTTP de pago/usuario con cuentas reales: su seguridad funcional está cubierta por las suites y los flujos existentes se conservaron.

## Validación

| Comprobación | Resultado |
| --- | --- |
| Backend completo: `node --test test/*.test.js src/modules/auth/service/*.test.js src/modules/users/service/*.test.js` | **433/433 PASS**, incluidas 6 pruebas nuevas. La primera ejecución restringida falló por EACCES en HTTP local; se repitió fuera del sandbox y pasó. Ambos logs se conservan. |
| Frontend completo: `npm test -- --maxWorkers=2` | **503/503 PASS**, 61 archivos |
| Frontend: `npm run build` | **PASS** |
| ESLint de los archivos backend modificados y diagnósticos, con reglas recomendadas y globals Node | **PASS** |
| Syntax checks y `git diff --check` | **PASS** |
| Lint global frontend | **FAIL previo**, tres imports sin uso (`screen`, `within`, `normalizeProductType`) en `productColors.test.jsx`; archivo sin modificar y ya documentado antes de esta tarea |
| Tipos/parametrización, LRU, commit/rollback y recuperación en MySQL real desde el Prisma de la API | **PASS**, evidencia final |
| Auditoría real de los 60 GET finales | **PASS**, exactamente un evento persistido por request ID |
| Dos escrituras ficticias de auditoría, solo dentro de rollback | **PASS**, cero eventos persistidos al finalizar |

Las suites incluyen listados/filtros/paginación, Usuarios/roles/activación y desactivación, creación/edición/conciliación, confirmación y rechazo de pagos, PIN/bloqueo, JWT/capacidades, errores, transacciones y concurrencia. Esas pruebas funcionales usan sus dobles/fixtures existentes; no se presentan como medición física de nuevas escrituras de negocio.

El control de navegador consultado devuelve **“Local browser use is disabled in Work settings”**. No se certifica clic→render ni revisión visual nueva de pantallas. Se probaron las rutas reales, el contrato de perfil y toda la suite React; no se sustituyó el backend por una aplicación simplificada.

## Archivos y consumidores

| Archivo nuevo/modificado en esta fase | Consumidores / comprobación |
| --- | --- |
| `capaServidor/src/database/prisma.js` | Todos los repositorios que comparten `getPrismaClient`; validación de opciones, TLS, pruebas existentes y rutas reales por etapa |
| `capaServidor/src/modules/security/repo/securityAudit.repo.js` | Conserva retorno predeterminado y cliente transaccional; nuevo modo de confirmación probado con errores y rollback físico |
| `capaServidor/src/middlewares/supportAudit.js` | Auditoría HTTP de Soporte/Desarrollador y administración antigua; evento/momento/logger conservados |
| `capaServidor/test/globalConnections.test.js` | 6 pruebas enfocadas: configuración, rollback de política, contrato de auditoría, metadata, errores sin retry y middleware finish |
| `capaServidor/scripts/optimizeConnections.*` | Herramientas opt-in para repetir mediciones y verificaciones; no se importan durante npm run dev ni quedan activas |
| `capaServidor/scripts/auditConnections.mjs` | Extensión diagnóstica mínima: acepta contexto opcional de carpeta de evidencia para repetir la verificación de UUID sin apuntar a la ejecución anterior |
| Este informe y `evidencia/optimizacion-conexiones-20261030/` | Evidencia saneada nueva, sin sobrescribir auditoría o informes anteriores |

Los archivos previos de Cobranzas, sus scripts, sus pruebas y el frontend permanecen fuera del diff de esta implementación. No se agregaron dependencias.

## Reproducción y reversión

La carpeta de evidencia separa `before`, `cache`, `pool`, `audit` y `final`. Cada una conserva muestras individuales, primeras peticiones/warmup, configuración efectiva y proceso. `summary.json` deriva estadísticas mediante `node capaServidor/scripts/optimizeConnections.summarize.mjs`. Los JSON originales no se sustituyen por tablas.

Para repetir, verificar PID/cwd/listener actuales, guardar datos bajo otra carpeta nueva de evidencia y usar el runner opt-in `optimizeConnections.mjs ETAPA PID --evidence-root=docs/optimización/evidencia/NOMBRE_NUEVO`. El runner rechaza una etapa existente antes de medir, valida que el inspector corresponde al PID/cwd esperados, utiliza la API real y cierra observadores/inspector en finally. El login reutiliza solo las credenciales del mensaje anterior específicamente autorizado, mediante `ITECSA_AUTHORIZED_CREDENTIAL_HISTORY`; no se ponen contraseñas/tokens en argumentos o evidencia. Nunca usar ese mecanismo como autenticación del producto.

Los escenarios `final` requieren los IDs de la fase `audit` para verificar los eventos. Los helpers de inactividad y rollback se invocan mediante el controlador diagnóstico con el Prisma del proceso existente. Los timeouts largos pertenecen solo al ensayo de evicción, no a la configuración del backend. No ejecutar ensayos de red simultáneamente con tests/build si se quieren comparar latencias.

Reversión selectiva, **sin ejecutarla en esta entrega**:

1. Conexiones: establecer explícitamente `DB_PREPARE_CACHE_LENGTH=0`, `DB_POOL_VALIDATION_DELAY_MS=500`, `DB_POOL_PING_TIMEOUT_MS=250` y recargar el proceso por el mecanismo habitual. Restaura las tres políticas anteriores sin tocar seguridad ni datos. Para reversión de código completa, retirar esas opciones de `readPrismaConfiguration` revisando antes cambios posteriores en el archivo.
2. Auditoría: retirar únicamente `{returnRecord:false}` de `supportAudit`; el contrato por defecto sigue usando `.create` y recupera la fila. No borrar eventos ni revertir datos.
3. Repetir tests y smoke HTTP. No usar reset/restore global sobre el árbol: contiene cambios previos ajenos.

## Estado final

Se conservaron los tres cambios con beneficio demostrado y las protecciones originales. La auditoría y observadores de medición son mecanismos diferentes: la auditoría funcional permanece; los wrappers, tokens diagnósticos y el inspector se retiran. El código final sigue ejecutándose bajo npm run dev, con Vite y el túnel existentes. No hay commits ni despliegue.

[validation.json](evidencia/optimizacion-conexiones-20261030/validation.json) conserva versiones de código/hashes, comprobaciones y saneamiento. [restoration.json](evidencia/optimizacion-conexiones-20261030/final/restoration.json) confirma ausencia de globals diagnósticos y restauración de métodos de middleware/driver; [services.json](evidencia/optimizacion-conexiones-20261030/final/services.json) confirma API **38400**, Vite **14596**, SSH **16620** y puerto inspector cerrado. [smoke.json](evidencia/optimizacion-conexiones-20261030/final/smoke.json) verifica liveness/Vite 200, las tres rutas sin JWT 401 y JWT inválido 401. Los 14 hashes observados de fuentes ajenas a los cambios de esta fase permanecen iguales a la línea base. El árbol mantiene también los cambios previos sin integrarlos ni revertirlos.

Permanecen el transporte remoto, el costo frío de TCP/TLS y preparados, la pérdida de sesiones por el watchdog de socket tras inactividad y los límites estadísticos/concurrencia descritos. El objetivo de un segundo se alcanza en las 60 lecturas seriales medidas del escenario final, **no como promesa para todos los endpoints, actores, escrituras, pausas o cargas**.

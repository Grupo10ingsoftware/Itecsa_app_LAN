# Matriz de pruebas acumuladas

## Integración posterior en el desarrollo habitual: estado vigente

Por instrucción expresa del equipo, se retiraron los laboratorios y no se repitieron suites funcionales ni se crearon más copias. La configuración se aplicó a `itecsa-web` y `itecsa-backend-admin` existentes y se reconstruyeron los dos servicios habituales de Compose. Frontend `127.0.0.1:5173`, liveness API `127.0.0.1:3000` y discovery Keycloak `127.0.0.1:18080` respondieron HTTP 200. El adaptador administrativo del backend habitual pudo consultar el realm real: tres usuarios previos, cero usuarios sintéticos. Aiven conserva TLS, tiene dos tablas nuevas de identidad, tres vínculos explícitos y cero operaciones de preparación de prueba. Docker conserva únicamente los dos contenedores habituales, sin volúmenes de laboratorio. Son comprobaciones de arranque/configuración; no una nueva regresión funcional completa. Detalle vigente en [15](15_EVIDENCIA_INTEGRACION_FASE_06_5.md). Los resultados siguientes describen la validación histórica anterior al retiro del laboratorio.

## Actualización 06.5: Ubuntu real

Evidencia y reproducción: [15](15_EVIDENCIA_INTEGRACION_FASE_06_5.md). Las secciones siguientes conservan los resultados históricos de cada fase; no se suman las regresiones repetidas como pruebas diferentes.

| Conjunto ejecutado sobre las fuentes 06.5 | Resultado |
|---|---|
| Backend completo en imagen con Prisma generado | 1.134 contabilizadas: 1.130 aprobadas, cuatro omitidas, cero fallos; incluye la nueva prueba de transporte administrativo |
| Adaptador administrativo focal | Nueve aprobadas, incluidas restricciones del origen Docker exclusivo de test |
| Frontend unitario y SSR | 51 node:test aprobadas; comprobaciones SSR previas conservadas, incluidas 411 de navegación y 251 de identidad |
| Regresión Docker 00–06 | 72 iniciales, dos tras reiniciar el IdP de laboratorio, tres físicas MySQL; aprobadas |
| Brave contra Ubuntu | Nueve logins reales con PKCE, claims exactos, 81 decisiones API y 81 guards de rutas; PIN, producción, fecha y pago persistidos; seis preparaciones departamentales |
| Soporte visible contra Ubuntu | Formulario real creó séptima cuenta pendiente/deshabilitada; destinos privilegiados rechazados |
| Sesión Brave contra Ubuntu | Recarga, cambio de usuario, renovación automática y verify del nuevo access token; terminación detectada al renovar; cero refresh indefinidos |
| Respaldo Ubuntu | Archivo integral consistente y recuperación real del realm en copia aislada; originales preservados |
| Lint y build frontend | Aprobados; 565 módulos; salida solo en contenedor temporal |
| Seguridad de sincronización | Seis pruebas Python aprobadas, incluidas escritura atómica del diario y ausencia del cliente compartido sin mutación |
| Browser de regresión previo | Negocio 29+29, producción 70+70 y navegación 243+243; authSession/métricas/paymentPin aprobados; su API es sintética |
| Persistencia local después de reiniciar los tres servicios propios | Nueve bindings/PIN y siete preparaciones, auditoría productiva, pago y fecha conservados |

Una ejecución inicial del backend local Windows falló por el cliente Prisma local sin generar. Se conservó ese resultado como impedimento del entorno y se ejecutó la suite completa en la imagen correcta; no se modificaron expectativas de negocio para ocultarlo. El primer verificador de terminación de sesión también falló por esperar una revocación inmediata de un JWT recién emitido; el caso final comprueba el siguiente refresh real y conserva los tiempos globales del realm.

Fecha de actualización: **25-10-2026**. Las secciones iniciales conservan la evidencia histórica 00–01 sobre `34dfd7c09f876285c1ea84d9020a44a1414ba468`. Las actualizaciones posteriores registran lo ensayado en cada fase; 05 parte de `e74a9142a8fc4dda00bf8c14bce07bf4f1557ad3`. Reproducción: [08](08_EVIDENCIA_FASES_00_01.md), [10](10_EVIDENCIA_Y_CONFIGURACION_FASE_02.md), [13](13_EVIDENCIA_Y_VERIFICACION_FASE_05.md). Matriz: [07](07_DECISIONES_APROBADAS.md).

## Ejecuciones conservadas

Los conteos node:test incluyen subtests y el nodo de prueba padre. No se suman de nuevo las 236 pruebas focales a la suite backend, que ya las incluye. Las comprobaciones SSR no son el mismo conjunto que las 51 pruebas node:test del frontend.

| ID | Momento / conjunto | Comando de trabajo dentro del entorno seguro | Resultado real |
|---|---|---|---|
| B00-API | Antes de cambios | Backend: npm test -- --test-concurrency=4 | 864 contabilizadas, 861 aprobadas, 3 omitidas, 0 fallos |
| B00-WEB | Antes de cambios | Frontend: npm test | SSR aprobado (incluye 89 verificaciones de rutas/permisos) + 51 node:test aprobadas |
| B00-LINT | Antes de cambios | Frontend: npm run lint | Exit 0 |
| B00-BUILD-T | Antes de cambios, entorno test | Frontend: npm run build -- --outDir /tmp/itecsa-build | Exit 0, 566 módulos; warning chunk >500 kB; no se usa como evidencia definitiva de producción |
| B00-BUILD-P | Antes de cambios, entorno production | Mismo build con NODE_ENV/APP_ENV=production | Exit 0, 559 módulos; sin warning chunk grande |
| P01-RED | Test escrito antes de añadir política | node --test capaServidor/test/keycloakAuthorization.test.js | Exit 1 esperado, módulo nuevo todavía ausente; evidencia previa conservada |
| P01-UNIT | Tras implementar | Mismo comando focal | 236 aprobadas, 0 fallos, 0 omitidas |
| P01-API | Tras implementar | Backend: npm test -- --test-concurrency=4 | 1100 contabilizadas, 1097 aprobadas, 3 omitidas, 0 fallos |
| P01-WEB | Tras implementar | Frontend: npm test | SSR y 51 node:test aprobadas; sin diferencia funcional observada |
| P01-LINT | Tras implementar | Frontend: npm run lint | Exit 0 |
| P01-BUILD | Tras implementar, entorno production | Frontend: npm run build -- --outDir /tmp/itecsa-build | Exit 0, 559 módulos; salida temporal advertida |
| P01-SCRIPTS | Cierre, fuentes originales sin modificar | node --test scripts/check-docs.test.mjs scripts/deploy-northflank.test.mjs | 24 aprobadas; dobles de despliegue, sin llamadas reales |
| P01-SYNTAX | Cierre | node --check por fuente backend/shared | 134 archivos, 0 fallos |
| P01-HASH | Cierre | SHA-256 de 571 archivos de la línea base | 570 iguales; solo authorization.js modificado; ningún ausente |
| P01-DOCS | Cierre | node scripts/check-docs.mjs; git diff --check | Enlaces locales válidos en 68 archivos; diff sin errores |

La corrección entre B00-BUILD-T y B00-BUILD-P fue de las variables de la invocación; no se cambió Vite, React ni el código de producto. Ninguna prueba fallida de integración real se reemplazó por un mock. No hubo regresiones nuevas dentro de las suites ejecutadas.

## Casos de la política nueva

| ID | Condición verificada | Resultado y límite |
|---|---|---|
| K01 | Nueve roles exactos, 25 identificadores compartidos y claim estable | Aprobado; catálogo sin duplicar identificadores |
| K02 | 9 × 25 decisiones con expectativa literal | 225 subtests aprobados; 99 concesiones / 126 denegaciones |
| K03 | Permiso local y permiso JWT obligatorios | Aprobado en cada celda, con token excesivo, mínimo, vacío y sin la capacidad |
| K04 | Siete roles funcionales preservan negocio | Aprobado; única diferencia permitida: retirar manage:users de AP/AV/AC |
| K05 | Desarrollador = antiguo técnico menos manage:users | Aprobado, exactamente 24; sin reducción adicional |
| K06 | Nuevo Soporte | Aprobado, solo 5; sin pedidos, capacidad, calendario, pagos, producción ni métricas |
| K07 | Rol nulo, desconocido, mal formado o ausente | Aprobado; incluye nombres de propiedades heredadas y arrays mal formados |
| K08 | Múltiples roles aplicativos | Aprobado para las 81 parejas, incluidas repetidas; sin unión de privilegios |
| K09 | Permisos JWT desconocidos/administrativos y formato inválido | Aprobado; no amplían la matriz local |
| K10 | Token anterior con manage:users | Aprobado para AP/AV/AC/operarios/G/D bajo política nueva |
| K11 | Asignación ordinaria | Aprobado; solo Soporte hacia seis roles departamentales, ninguna de las 81 parejas habilita destinos G/D/S |
| K12 | Catálogos inmutables | Aprobado; intentos de modificar permisos, roles y destinos fallan |
| K13 | Frontera de activación | Aprobado; legacy conserva ocho roles, Soporte 25, administradores manage:users y normalizador previo; Desarrollador no se activa |
| K14 | Correspondencia antigua Soporte → Desarrollador | Metadato explícito verificado; ninguna identidad real migrada; no equivale a ensayar una migración |

K01–K14 agrupan aserciones: no se presentan como 14 pruebas adicionales independientes. La suite tiene 11 pruebas padre y 225 subtests. La expiración/firma del JWT, revocación real, fallos de DB/IdP y concurrencia del SDK pertenecen a otras fronteras: esta política no valida ni intercambia tokens.

## Regresión transversal ejecutada

| Área | Evidencia existente vuelta a ejecutar | Límite |
|---|---|---|
| Auth0 y contratos | auth0.rbac, adminUsers.routes, renamedRoles, requireAdministrador, rbac.authorization | Auth0 conservado; proveedor simulado |
| Keycloak piloto y sesiones | keycloakClaims, runtimeConfig y keycloakSession | Normalización/selección/sesiones con dobles; no realm real ni navegador corporativo |
| Identidad local | requireActiveIdentity.roleSync, userLifecycle/transiciones/repositorios | Estados, desactivación, rol distinto, compare-and-set con dobles |
| PIN | Suite completa existente de PIN, bloqueo/concurrencia/actor y errores | Criptografía y contratos probados; entrega Resend real no ejecutada |
| Pedidos/producción | Rutas y servicios de órdenes, estados/transiciones, subprocesos, cancelación, capacidad/carga, etiquetas | Repositorios y HTTP local de pruebas |
| Ventas/cobranzas | Creación, pagos, reevaluación, notas, actores, concurrencia y DTOs | Sin consulta a Manager o MySQL empresarial |
| Calendario/historial/métricas | Rutas, DTOs, filtros, fechas y reglas de lectura | No se prueba físicamente integridad histórica de una migración inexistente |
| Mensajes/usuarios | Propiedad, notificaciones, movimientos, cuotas, accesibilidad y errores | Sin UI browser integral ni canales externos |
| Infraestructura | Tests unitarios scripts, lint, build y sintaxis | No es un despliegue, smoke de imagen production ni restauración |

## Pendientes explícitos

| ID | Prueba / condición | Estado y requisito |
|---|---|---|
| R01 | MySQL serializa cuotas persistentes concurrentes | Omitida por flag; exige MySQL desechable aislado y secretos sintéticos |
| R02 | MySQL revierte auditoría junto con negocio | Omitida por flag; misma dependencia |
| R03 | Flujos físicos de regresiones MySQL | Omitida por flag; requiere target estricto itecsa_physical_test, fixtures y base vacía |
| R04 | Roles/defaults/composites/mappers reales y access token | No ejecutada; versión/realm de laboratorio y autorización fase 02 |
| R05 | Firma, issuer, audience, azp, tipo/expiración, JWKS y revocación reales | No ejecutada; integración fase 02 con identidades sintéticas |
| R06 | Browser auth/payments/metrics, puestos LAN | No ejecutada; navegador/servidores aislados; no basta SSR |
| R07 | Incidente refresh_token=undefined tras login | Abierto; repetir navegador/SDK real, refresco concurrente, Brave/cookies, origen y callback; sin asumir causa universal |
| R08 | Smoke de imágenes production, restore, instalación fría y offline total | No ejecutada; infraestructura y fases futuras |
| R09 | Aiven, Resend/PIN, fuente Manager y otros servicios externos | Condicionantes separados; no acreditados offline |
| R10 | T01–T34 de la auditoría original | Siguen siendo especificaciones de aceptación; ver documento 03; no se declaran 34 pruebas reales aprobadas |

No se habilitaron flags de integración contra infraestructura real ni se desactivaron controles para superar resultados. No hay una migración de esquema que ensayar en 00–01. La revisión humana sigue pendiente; no se continuará a fase 02 sin autorización.
+
## Actualización de fase 02 sobre 66a75c0

El equipo autorizó avanzar a 02. Las tablas anteriores conservan los resultados históricos; esta sección registra la ejecución nueva. Evidencia y procedimientos: [10](10_EVIDENCIA_Y_CONFIGURACION_FASE_02.md).

| ID | Comprobación ejecutada | Resultado final |
|---|---|---|
| P02-CORE | JWT/JWKS locales, configuración estricta, normalización y política HTTP | 12 pruebas padre nuevas aprobadas; incluyen 225 decisiones, firmas/algoritmos/expiración/issuer/audience/cliente/tipo, JWKS caído y errores de DB |
| P02-LOCAL | Estado, rol y sujeto local, sin conciliación Auth0 | Aprobado con dobles y con MySQL real de laboratorio; token anterior denegado tras cambio/desactivación/desvinculación |
| P02-SERVICES | Producción, corrección de pagos e histórico con política seleccionada | Aprobado; Desarrollador conserva acceso, Soporte no gana negocio y se conserva actor PIN/local |
| P02-AUDIT | Técnico renombrado mantiene auditoría reforzada | Aprobado para Desarrollador/Soporte Keycloak y Soporte Auth0 |
| P02-API | Suite completa backend sin conexiones externas | 1113 contabilizadas: 1109 aprobadas, 4 omitidas, 0 fallos |
| P02-WEB | Script frontend completo | 51 node:test aprobadas, SSR previo aprobado y 251 verificaciones nuevas de contrato/proveedor/sesión |
| P02-QUALITY | Lint/build producción y sintaxis | Exit 0; 562 módulos Vite; 145 fuentes backend/shared/scripts sin error |
| P02-SCRIPTS | Scripts originales y generador de realm derivado | 25 aprobadas, 0 fallos |
| P02-REAL | Keycloak 26.8.1 y MySQL 8.4.13 en red interna efímera | 16 aprobadas: padre + 15 subtests; nueve roles, 225 decisiones, PKCE, ID token, roles antiguos/múltiples, permisos excesivos, sujetos concurrentes, estado local, refresh y code replay |
| P02-RESTART | Reinicio del Keycloak efímero e ingreso Code+PKCE nuevo | 2 aprobadas, 0 fallos |
| P02-IMAGE | Suite normal en imagen sin fixtures de laboratorio | La integración opt-in se omite correctamente sin importar herramientas ausentes |

Las 12 pruebas nuevas forman parte de las 1109 aprobadas; no se vuelven a sumar. Una de ellas comprueba que Keycloak no hereda por nombre la excepción técnica de PIN. La integración real se omite en la suite sin red y se ejecuta explícitamente por separado. Las 16+2 contabilizaciones reales incluyen padres, no equivalen a 18 escenarios de negocio independientes. El ensayo HTTP del login real no es una prueba de navegador Brave o de todo el frontend.

Fallos anteriores conservados: primer laboratorio sin basic/sub y refresh después de code replay; segundo fixture con id_auth0=NULL incompatible con el schema; tests de servicios con propiedad de error equivocada. Se corrigieron configuración/fixtures/secuencia y se repitieron los casos y la regresión. No se relajó el control de sujeto, el esquema ni las denegaciones.

Estado actualizado de pendientes: R04 probado para los roles/composites/mappers del laboratorio 26.8.1, pendiente realm empresarial; R05 cubierto con JWT locales y tokens reales para contrato/ID token/estado/sujetos, pendiente despliegue corporativo completo; R07 conserva el incidente refresh_token=undefined en Brave. R01–R03, R06, R08–R10 mantienen sus límites originales. Ningún éxito de laboratorio acredita migración de personas ni operación integral offline.

## Actualización de fase 03 sobre 9bb41e9

El equipo pidió commit de 02 y avance a 03. Las secciones anteriores se conservan como evidencia histórica; este apartado registra los resultados nuevos. Procedimiento completo y matriz esperado/observado: [11](11_EVIDENCIA_Y_VERIFICACION_FASE_03.md).

| ID | Comprobación ejecutada | Resultado final |
|---|---|---|
| P03-NAV | Menús, guards SSR, inicio, retornos internos y etiquetas de nueve roles | 411 verificaciones nuevas aprobadas, incluidos ocho menús Auth0 de referencia; fixture de aceptación independiente de la política ejecutable |
| P03-BROWSER | Router, componentes y CSS reales en Brave/Chromium 156 | 243 comprobaciones a 1440×1000 y 243 a 390×844; 144 decisiones de URL directa por tamaño; cero errores de navegador |
| P03-SESSION | Expiración y cambio de rol en cada uno de los nueve roles, en ambos tamaños | Aprobado; retira vistas y enlaces anteriores y ofrece inicio propio. Contextos/API sintéticos en navegador |
| P03-HTTP | Routers de diez endpoints de vistas y siete administrativos | 90 decisiones de vistas + 63 administrativas; 180 rechazos adicionales por expiración/ausencia de permisos en vistas; 11 rechazos administrativos adicionales. Sin ejecutar controladores denegados |
| P03-REAL | Regresión con Keycloak 26.8.1, MySQL 8.4.13 y PKCE reales | 16 aprobadas iniciales, 2 tras reinicio; se añaden 90 decisiones en routers de vistas, 63 administrativas y nueve cambios de rol local que rechazan el token previo |
| P03-API | Suite backend completa sin red | 1115 contabilizadas: 1111 aprobadas, 4 omitidas, 0 fallos |
| P03-WEB | Suite frontend completa | 51 node:test y SSR previos aprobados, incluidas 251 verificaciones de identidad de 02 y 411 de navegación |
| P03-BROWSER-REG | Fixtures de sesión/SDK, métricas y PIN | Tres aprobados en navegador real. SDK contra servidor de tokens sintético; no acredita resolución del incidente empresarial |
| P03-QUALITY | ESLint y build producción | Exit 0; 564 módulos, chunk principal 499,03 kB; 146 fuentes/scripts y dos tests backend sin errores de sintaxis; sin cambios de paquetes/lockfiles |
| P03-SCRIPTS | Scripts originales y realm fixture | 25 aprobadas; sin llamadas a servicios externos |

Los dos tests padre HTTP nuevos están incluidos en las 1111 aprobadas. Las 90+63 decisiones reales se agregaron dentro de los nueve subtests de roles existentes del laboratorio, por lo que no aumentan artificialmente el total 16. No se suman verificaciones SSR, comprobaciones DOM y tests node como si fueran la misma unidad.

R06 tiene ahora evidencia browser de laboratorio en escritorio/móvil y los tres fixtures originales; permanece pendiente la aceptación en puestos LAN con frontend, API y realm empresariales configurados conjuntamente. R07 continúa abierto. R01–R03, R08–R10 mantienen sus límites. No se modificaron las pruebas Auth0 de referencia ni los algoritmos de PIN para obtener estos resultados.

## Actualización de fase 04 sobre 5941404

El equipo pidió commit de 03 y avance a 04. Las evidencias anteriores permanecen históricas; la reproducción completa está en [12](12_EVIDENCIA_Y_VERIFICACION_FASE_04.md).

| ID | Verificación nueva / acumulada | Resultado |
|---|---|---|
| P04-IDENTITY | Destinatario de revisión tomado del responsable persistido, separado del actor | Tres tests nuevos aprobados; el test original conserva su expectativa y adapta únicamente el doble de lectura |
| P04-REAL | 18 operaciones × nueve roles, controllers/services/repositories reales | 162 decisiones: 73 permitidas y 89 denegadas; persistencia, actor, dueño, etiquetas, fechas y mensajes comprobados |
| P04-NEGATIVE | PIN ausente/ajeno, pago pendiente, salto de etapa, subproceso incorrecto, retroceso sin anterior y fecha inhábil | Rechazos sin cambios productivos ni registros de negocio; el PIN incorrecto sí conserva su contador de seguridad |
| P04-CONCURRENCY | Dos actores completan/retroceden o mueven a entrega simultáneamente | Una transición y un registro; una notificación de entrega; perdedor 409 o respuesta idempotente según operación |
| P04-LANYARD | Repetición antes de 100%, carga del día, concurrencia y cantidad excesiva | Un avance por detalle/día; actor local; no suma dos veces ni acepta superar la cantidad |
| P04-TRANSACTION | Error insertando notificación en revisión y en listo para entrega | SQL revierte etapa, registros y mensajes en ambos casos |
| P04-PHYSICAL | R03 original y R01/R02 originales sin modificar | 1 + 2 aprobadas en un segundo MySQL efímero; sin publicar 33307 en el host |
| P04-BROWSER | Kanban real y calendario, permisos/acciones/PIN/drop/paginación | 70 checks a 1440×1000 y 70 a 390×844; nueve roles; cero errores JS |
| P04-REG-BROWSER | Navegación 03 y fixtures originales de sesión/métricas/PIN | 243 + 243 checks y tres fixtures PASS |
| P04-API | Suite backend sin red | 1119 contabilizadas: 1115 aprobadas, 4 omitidas por aislamiento, 0 fallos |
| P04-WEB | Suite frontend completa | 51 node:test y SSR anteriores, incluidos 411 checks de navegación y 251 de identidad: aprobados |
| P04-REAL-TAP | Integración real acumulada | 40 aprobadas iniciales, 2 tras reinicio; los 40 incluyen padres y los 23 subtests productivos |
| P04-QUALITY | Scripts, lint, build y sintaxis | 25 tests de scripts; lint/build exit 0; 564 módulos y chunk 499,03 kB; 147 fuentes/scripts y cuatro tests/helpers sin error de sintaxis |

Las cuatro integraciones omitidas del script general tienen ahora ejecución separada aprobada: identidad Keycloak y las tres físicas MySQL. No se activan simultáneamente sobre una base compartida. R01–R03 quedan cubiertas en laboratorio, pendiente validación del entorno de destino; no se reescriben sus resultados históricos de 00–03. R07, R08–R10 y aceptación empresarial mantienen sus límites.

El primer laboratorio productivo detectó realmente la pérdida del destinatario de revisión (0 mensajes frente a 1 esperado). El test unitario nuevo reprodujo el defecto antes de corregirlo. Otra pasada general encontró el doble antiguo de repositorio incompleto; se adaptó a la lectura real conservando la misma expectativa. El primer arranque físico falló por negociación RSA de MySQL, corregido únicamente en la preparación del laboratorio. Estos fallos no se presentan como éxitos retrospectivos.

## Actualización de fase 05 sobre e74a914

La instrucción «ya ahora seguimos con la fase 5» autoriza esta ejecución. Procedimiento, archivos, fallos previos y límites: [13](13_EVIDENCIA_Y_VERIFICACION_FASE_05.md). Las cifras previas conservan su contexto histórico.

| ID | Verificación nueva / acumulada | Resultado |
|---|---|---|
| P05-ROLES | 15 operaciones × nueve roles con JWT, PIN y SQL reales | 135 decisiones: 69 permitidas, 66 denegadas; incluye ventas, pagos, historial, métricas, mensajes, verify y debug PIN denegado |
| P05-SALES | Fuente sintética aislada, actor, destinatarios, reevaluación, duplicados y concurrencia | Actor autenticado, responsable original; carrera con cliente nuevo y existente devuelve 201/409 y un pedido; fallo de mensaje revierte creación |
| P05-PAYMENTS | Pago ordinario y revisión por capacidad, PIN y concurrencia | AC/OC/D operan pendiente; solo AC/D revisan resuelto; PIN ausente 400/ajeno 403; un registro concurrente; rollback de pago/auditoría ante fallo de mensaje |
| P05-HISTORY | Restricciones financieras, actor, dos páginas y cursor inválido | Solo Cobranzas/D recibe observaciones financieras; original no se reasigna; cursor siguiente sin repetir evento; inválido 400 |
| P05-METRICS | Agregado SQL conocido y validación de fechas | AP/G/D: 17 unidades en rango aislado; fecha imposible 400; otros roles 403 |
| P05-MESSAGES | Propiedad, lectura, ocultación de notificación ajena y limpieza de propias | Operaciones ajenas 404; Soporte conserva sus mensajes; destinatarios automáticos AP/AC comprobados contra filas locales |
| P05-CONTACT | Verify local, privacidad e incidentes | Correo local validado KC; Auth0 conserva claim. Canal apagado 503 y contacto ajeno 400. Con entrega externa doblada: SQL real, deduplicación y actor local |
| P05-NEGATIVE | Ausencia/token inválido y fuente indisponible | 401/401; Ventas 503 y Soporte 403 sin nuevos pedidos |
| P05-UNIT | Conflictos por índice/modelo, error desconocido y correo por proveedor | Cuatro pruebas focales nuevas aprobadas; las dos de conflicto fallaron antes de corregir producción |
| P05-API | Suite completa backend sin red | 1124 contabilizadas: 1120 aprobadas, 4 omitidas, 0 fallos |
| P05-REAL | Integración inicial acumulada + reinicio + físicas originales | 58 aprobadas iniciales, 2 tras reinicio y 1 + 2 físicas. Los 58 incluyen padres y 17 subtests de negocio de 05 |
| P05-WEB | Suite frontend y SSR | 51 node:test; 411 checks de navegación y 251 de identidad, junto al SSR previo: aprobados |
| P05-BROWSER | Pagos por nueve roles, cambio de sujeto y contacto del formulario | 29 checks a 1440×1000 y 29 a 390×844; respuesta pendiente de sujeto anterior no contamina el nuevo; cero errores JS |
| P05-REG-BROWSER | Producción, navegación y tres fixtures originales | 70 + 70 y 243 + 243 checks; authSession, metrics y paymentPin PASS |
| P05-QUALITY | Scripts, lint, build y sintaxis | 25 pruebas de scripts; lint/build exit 0; 564 módulos, chunk 499,08 kB; 148 fuentes/scripts y cuatro tests/helpers sin errores |

Las cuatro integraciones omitidas en la suite sin red se ejecutaron separadamente y pasaron. No se suman TAP, decisiones HTTP y checks DOM/SSR como una unidad única. El backend cuenta además el nuevo módulo fixture como entrada TAP sin assertions propias: el cambio de 1119 a 1124 no significa cinco pruebas focales nuevas.

Fallos previos: revelación de PIN ya acusado rechazada correctamente; se reutilizó el PIN legítimo en memoria sin resetearlo. Se corrigieron expectativas de destinatarios adicionales válidos y del 400 por PIN ausente. Se completó una prop del fixture y se retiró un import sin uso. El navegador reprodujo mensajes del sujeto anterior antes del arreglo del encabezado. La carrera real de cliente devolvió 500 por P2002 del índice RUT; se corrigió a 409. La documentación distingue estos errores de preparación de los defectos de producto.

R01–R03 conservan cobertura física de laboratorio; R04–R06 conservan límites del destino real. R07 sigue abierto; R08–R10 y aceptación offline/empresarial siguen pendientes. En privacidad/incidentes se dobla exclusivamente la entrega externa: no se acredita Resend operativo sin Internet. La fase 06 no se inicia automáticamente.

## Actualización de fase 06 sobre 9e44010

El usuario pidió commit de 05 y avance a 06. Se creó 9e44010 desde el árbol revisado y se ejecutó exclusivamente la base administrativa, conservando las evidencias anteriores. Procedimiento, contratos y limitaciones: [14](14_EVIDENCIA_Y_VERIFICACION_FASE_06.md).

| ID | Verificación | Resultado |
|---|---|---|
| P06-ADAPTER | Configuración separada, token de servicio concurrente/expiración, exact search, límites, traversal, errores y mutaciones sin replay | Ocho pruebas focales aprobadas; incluye deadline HTTP real sobre cuerpo bloqueado y errores sanitizados |
| P06-MIGRATION | Schema de 9e44010 con actor histórico/PIN/registro, seguido de migración SQL real | PK/FK, sub, correo, hash y salt preservados; correo nullable conserva unicidad y vínculo nuevo compara issuer/sub/username binarios |
| P06-ROLES | Nueve actores, seis destinos ordinarios y privilegios | Solo Soporte prepara con capacidad efectiva/PIN/estado local; G/D/S no asignables; proveedor ajeno, falta de capacidad, PIN ajeno y autoobjetivo denegados |
| P06-HTTP | Fábrica futura con JWT/PIN/servicios y SQL reales | Lectura y preparación idempotente por nueve roles: solo S autorizado; sin token/malformado 401, actor inyectado 400. La fábrica no se monta en la aplicación |
| P06-PERSISTENCE | Preparación, username repetido, concurrencia entre servicios y payload cambiado | Un POST/un vínculo, digest/CAS persistidos; no adopta cuentas existentes. Pendiente + disabled; fullyProvisioned=false |
| P06-PARTIAL | Respuesta perdida después de 201 real y error SQL después de insertar Usuario | Diario needs_reconciliation; IdP deshabilitado. Nuevo servicio concilia marcador/sub y completa sin repetir creación; SQL revierte usuario si falla vínculo |
| P06-UNKNOWN | POST sin resultado, proceso interrumpido, diario caído, actor revocado o sujeto vinculado a otra fila durante saga | Sin creación repetida ni robo de running; sin diario no escribe IdP; revocación/cambio de PK impide completar. La confirmación SQL bloquea/comprueba actor. Interrupciones sin propietario confirmado requieren revisión operativa |
| P06-PROVIDER | Token administrativo insuficiente, usuario inexistente, rol inválido, destino privilegiado, atributos/estado/roles y logout | Denegaciones reales; cambio/retirada de roles solo deshabilitado; refresh real rechazado después de logout; sin realm-admin ni credencial administrativa en JWT Soporte |
| P06-API | Suite backend completa sin red externa | 1133 contabilizadas: **1129 aprobadas, 4 omitidas, 0 fallos** |
| P06-REAL | Integración acumulada + reinicio + físicas | **72 aprobadas iniciales**, incluidos padres y 13 subtests de 06; **2 tras reinicio, 1 + 2 físicas** |
| P06-WEB | Frontend completo y calidad | 51 node:test, SSR previo y checks 411/251 aprobados; lint/build exit 0, 564 módulos, chunk 499,08 kB |
| P06-BROWSER | Negocio/producción/navegación y fixtures previos | 29 + 29, 70 + 70, 243 + 243; authSession/metrics/paymentPin PASS; cero errores JS |
| P06-SCRIPTS | Generadores y scripts acumulados; sintaxis | 26 pruebas aprobadas; 156 fuentes/scripts y tres tests/helpers nuevos/modificados sin errores |

Las cuatro integraciones omitidas por aislamiento se ejecutaron por separado satisfactoriamente. Los ocho tests focales están incluidos en las 1129 aprobadas; Node cuenta el nuevo fixture como entrada TAP adicional. Los conteos de decisiones HTTP, DOM/SSR y padres TAP mantienen unidades diferentes.

Fallos anteriores: dos arranques agotaron readiness porque el JSON de User Profile incluía un enum DISABLED no aceptado en 26.8.1; se omitió para mantener atributos no declarados deshabilitados. La primera pasada con DDL aplicado cargó el cliente Prisma anterior mediante imports previos; se movió la generación a bootstrap separado. Un fixture de interrupción tenía digest no canónico y se corrigió sin relajar la comparación. Se sustituyó Full Scope Allowed por mappings explícitos del cliente de servicio. La pasada final vuelve a ejecutar todo sin fallos.

Las primitivas administrativas del adaptador son backend privilegiado; sus permisos realm-management no se conceden a Soporte humano. La saga de 06 no establece contraseñas, habilita cuentas ni publica la gestión como completa. R07, infraestructura/offline, aceptación empresarial, retención y recuperación operativa de running interrumpido siguen pendientes. 07 exige autorización expresa; no se reactiva la integración Ubuntu cancelada.

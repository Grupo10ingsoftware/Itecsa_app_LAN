# Matriz de pruebas acumuladas

Fecha: **24-10-2026**. Las secciones iniciales conservan la evidencia histórica 00–01 sobre `34dfd7c09f876285c1ea84d9020a44a1414ba468`. La actualización 02 al final parte de `66a75c07e70004f4f83fa015ffe7ab828aa9e9f6` y actualiza los pendientes que sí fueron ensayados. Reproducción: [08](08_EVIDENCIA_FASES_00_01.md), [10](10_EVIDENCIA_Y_CONFIGURACION_FASE_02.md). Matriz: [07](07_DECISIONES_APROBADAS.md).

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

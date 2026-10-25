# Decisiones aprobadas y límites de implementación

Fecha: **24-10-2026**. Fuente de aprobación: nuevo encargo «Plan maestro de migración modular de Auth0 a Keycloak» y autorización posterior de avance. Base de auditoría `34dfd7c09f876285c1ea84d9020a44a1414ba468`; fase 02 sobre `66a75c07e70004f4f83fa015ffe7ab828aa9e9f6`. Estas decisiones actualizan las alternativas de la auditoría [02](02_RBAC_ACTUAL_Y_PROPUESTO.md), sin modificar ese documento histórico.

## Registro

| ID | Decisión expresa / aplicación concreta | Estado |
|---|---|---|
| D01 | Nueve roles: siete funcionales actuales, Desarrollador y nuevo Soporte | Aprobada; política aislada implementada |
| D02 | Antiguo Soporte técnico → Desarrollador con exactamente sus 24 capacidades restantes tras retirar `manage:users` | Aprobada; sin migrar personas o registros |
| D03 | AP/AV/AC pierden únicamente `manage:users`; sus restantes permisos y los de los otros cuatro roles funcionales se conservan | Aprobada; aplicada en la nueva política aislada |
| D04 | Nuevo Soporte gestiona cuentas, sin capacidades comerciales, incluidas lecturas de pedidos/capacidad | Aprobada; cinco capacidades concretas en la tabla siguiente |
| D05 | Gerencia, Desarrollador y Soporte requieren política específica para creación/modificación/asignación | Camino ordinario cerrado; no se inventó aprobador |
| D06 | No autoasignación ni elevación propia | Catálogo de destinos ordinarios excluye el rol Soporte; validación de sujetos e identidades pendiente de integración administrativa |
| D07 | Conservar Auth0, SDK, servicios, adaptadores, templates, pruebas y documentación | Conservados; sin eliminación ni fallback nuevo |
| D08 | Alcance inicial: fases 00 y 01, política aislada y sin identidades reales | Entregadas; commit local 66a75c0 solicitado por el equipo |
| D09 | El equipo indicó «pasamos a la siguiente fase» después del commit | Fase 02 autorizada; 03 y posteriores siguen sin autorización |
| D10 | El equipo pidió «hace un commit y sigue con la siguiente fase» tras 02 | Commit local 9bb41e9 creado; fase 03 autorizada e implementada. Fase 04 y posteriores pendientes de autorización |
| D11 | El equipo pidió «commit y siguiente fase» tras 03 | Commit local 5941404 creado; fase 04 autorizada. Fase 05 y posteriores pendientes de autorización |

La selección concreta de Soporte utiliza la autorización expresa para conservar perfil y mensajes propios cuando sean necesarios. `manage:own-pin` mantiene el PIN propio independiente, requerido por los contratos de operaciones sensibles; no crea un permiso de administración del PIN ajeno ni un restablecimiento de contraseña. `manage:users` representa la capacidad administrativa existente; no acredita que estén implementadas las futuras credenciales temporales, recuperación o consulta de auditoría. No se añadieron capacidades ficticias para funciones que aún no existen.

## Matriz aprobada para la política nueva

AP/AV/AC = administradores Producción/Ventas/Cobranzas; OP/OV/OC = sus operarios; G = Gerencia; D = Desarrollador; S = **nuevo** Soporte. ✓ permite únicamente si el token también contiene la capacidad y se cumplen los controles de identidad/estado/operación; — deniega incluso con un JWT excesivo.

| Capacidad | AP | AV | AC | OP | OV | OC | G | D | S |
|---|---|---|---|---|---|---|---|---|---|
| read:own-profile | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| manage:own-pin | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| read:orders | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| read:production-capacity | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| read:own-messages | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| update:own-messages | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| manage:users | — | — | — | — | — | — | — | — | ✓ |
| read:sales-notes | — | ✓ | — | — | ✓ | — | — | ✓ | — |
| create:orders | — | ✓ | — | — | ✓ | — | — | ✓ | — |
| reevaluate:orders | — | ✓ | — | — | ✓ | — | — | ✓ | — |
| read:payments | — | — | ✓ | — | — | ✓ | — | ✓ | — |
| update:payment-status | — | — | ✓ | — | — | ✓ | — | ✓ | — |
| revise:payment-status | — | — | ✓ | — | — | — | — | ✓ | — |
| move:orders | ✓ | — | — | ✓ | — | — | — | ✓ | — |
| start:production | ✓ | — | — | — | — | — | — | ✓ | — |
| update:production-subprocesses | ✓ | — | — | ✓ | — | — | — | ✓ | — |
| rollback:production-subprocesses | ✓ | — | — | — | — | — | — | ✓ | — |
| manage:production-capacity | ✓ | — | — | — | — | — | — | ✓ | — |
| manage:production-load | ✓ | — | — | — | — | — | — | ✓ | — |
| manage:order-tags | ✓ | — | — | — | — | — | — | ✓ | — |
| review:orders | ✓ | — | — | — | — | — | — | ✓ | — |
| cancel:orders | ✓ | — | — | — | — | — | — | ✓ | — |
| read:production-calendar | ✓ | ✓ | — | — | ✓ | — | — | ✓ | — |
| update:order-delivery-date | ✓ | — | — | — | — | — | — | ✓ | — |
| view:metrics | ✓ | — | — | — | — | — | ✓ | ✓ | — |
| **Total** | **18** | **10** | **9** | **8** | **10** | **8** | **7** | **24** | **5** |

La matriz se presentó al equipo antes de modificar el código. En pruebas, una expectativa literal e independiente verifica sus 225 celdas: 99 concesiones y 126 denegaciones. Las tablas documentales son evidencia revisable; la política ejecutable se obtiene únicamente de `shared/keycloakAuthorization.js`, derivada de `shared/authorization.js`. No hay un segundo catálogo manual de identificadores de capacidades ni algoritmos de negocio copiados.

## Asignación ordinaria y sujetos

Solo nuevo Soporte tiene `manage:users`. Los destinos ordinarios posibles son AP, AV, AC, OP, OV y OC. Gerencia, Desarrollador y Soporte no aparecen como destinos gestionables por ningún actor. Los otros ocho roles devuelven una lista vacía.

`canManageUser(actorRole, targetRole)` comprueba **alcance por rol**, no la autorización completa de una operación. La integración administrativa futura debe validar sujeto del actor frente al destino, capacidad efectiva, rol previo y solicitado del destino, estado local, PIN y auditoría. Un cambio de rol de una cuenta Gerencia a un rol ordinario tampoco puede eludir el cierre verificando solo el nuevo valor. En esta fase no existen rutas nuevas que permitan tales operaciones.

## Correspondencia pendiente y datos conservados

| Superficie | Comprobación actual | Acción futura |
|---|---|---|
| Valor Soporte en catálogo antiguo, tokens, normalizador, configs y fixtures | Sigue significando el rol técnico antiguo en la ejecución activa | Resolver sujetos explícitamente antes de activar la nueva frontera |
| Desarrollador | Nuevo valor solo en política y pruebas aisladas | Provisionar/migrar únicamente en laboratorio y con aprobación |
| Usuarios locales (`rol_usuario`, `id_auth0`) | No se editaron ni consultaron filas reales | Inventario controlado, correspondencia issuer/sub y rol coherente en fase autorizada |
| Históricos y actor (`id_usuario`, registros y relaciones) | Código/esquema preservados; sin escrituras | Mantener PK y referencias, ensayar preservación histórica |
| Realm roles, defaults, composites y mappers | No se consultó ni modificó el realm real | Verificar roles efectivos; nunca convertir el nombre Soporte ambiguo de forma automática |
| Mocks, fixtures, generador RBAC y documentos Auth0 | Se conservan los ocho roles originales | Mantenerlos como referencia; no regenerar artefactos Auth0 con la nueva matriz |

Permanecen pendientes: autorización de cuentas privilegiadas y bootstrap, formato de username, política de datos históricos/base nueva, identidad externa estable, parámetros de infraestructura, entrega de credenciales, políticas de sesión/recuperación/retención y mínimos del futuro servicio administrativo. Ninguno se resolvió por defecto.

## Aplicación técnica en fase 02

La matriz funcional anterior no cambia. La implementación selecciona su política desde el proveedor autenticado; los roles Keycloak nuevos se leen exclusivamente de un cliente de roles explícito (`KEYCLOAK_ROLE_CLIENT_ID`), distinto de la SPA. Un rol de realm llamado Soporte no establece esa asignación. La configuración empresarial y la correspondencia por sujeto siguen pendientes: esta es una decisión técnica de integración, no una aprobación para migrar personas ni conceder roles privilegiados.

En laboratorio se utilizó `itecsa-api-v1` para los nueve roles y `itecsa-capabilities-v1` para las 25 capacidades. Los composites y mappers se generan de la matriz canónica y la API vuelve a intersectar los permisos emitidos con el rol local. No se hizo un hardcoded grant universal, un mapper de atributos editables por trabajadores ni una sustitución global de nombres. Los detalles, límites y reversión están en [10](10_EVIDENCIA_Y_CONFIGURACION_FASE_02.md).

## Aplicación técnica en fase 03

D09 conserva el alcance de su momento; D10 registra la autorización posterior. La matriz de 25 capacidades permanece intacta. Menús y guards utilizan los permisos efectivos de la política seleccionada. Soporte inicia en `/admin/usuarios`, con acceso a sus mensajes y perfil; los otros ocho roles inician en Kanban cuando poseen `read:orders`. La pantalla de Soporte anuncia que la administración aún no está disponible. Su entrada no habilita servicios, credenciales ni operaciones de 06–07.

El gate administrativo ahora se evalúa **después** de autenticar y autorizar: sin sesión válida, 401; sin `manage:users`, 403; nuevo Soporte autorizado, 503 mientras el servicio no esté implementado. No se modificaron destinos asignables, excepciones privilegiadas ni reglas/PIN de negocio. Evidencia y comprobación por los nueve roles: [11](11_EVIDENCIA_Y_VERIFICACION_FASE_03.md).

## Aplicación técnica en fase 04

D11 actualiza la autorización después de D10; la matriz de 25 capacidades no cambia. Se verificaron 18 operaciones productivas para los nueve roles con tokens Keycloak, PIN y persistencia reales de laboratorio. Los siete roles funcionales conservan su acceso productivo; Desarrollador conserva el acceso del técnico antiguo y nuevo Soporte queda fuera del negocio.

La única corrección de código productivo resuelve el destinatario de la notificación de revisión desde `Pedidos.id_usuario` dentro de la transacción existente. El DTO público lo omitía y el mensaje no se creaba. Se conserva el actor autenticado, el responsable original, la matriz, las transiciones y el PIN. Es una corrección compartida por Auth0 y Keycloak, no una concesión nueva de permisos. Evidencia, fallos previos y límites: [12](12_EVIDENCIA_Y_VERIFICACION_FASE_04.md).

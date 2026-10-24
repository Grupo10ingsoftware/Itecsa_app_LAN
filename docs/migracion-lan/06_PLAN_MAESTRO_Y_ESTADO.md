# Plan maestro y estado de la migración modular

Fecha: **24-10-2026**. Repositorio empresarial: `D:\Universidad\Ing software II\Itecsa_app_LAN`; rama `POC/KEYCLOAK`; base `34dfd7c09f876285c1ea84d9020a44a1414ba468`.

Este documento registra la ejecución del nuevo plan autorizado por el equipo. Los documentos [01](01_AUTH0_INVENTARIO_EXHAUSTIVO.md), [02](02_RBAC_ACTUAL_Y_PROPUESTO.md), [03](03_AUTH0_VS_KEYCLOAK.md), [04](04_GUIA_CONFIGURACION_KEYCLOAK.md) y [05](05_PLAN_INICIAL_MIGRACION_IDENTIDAD.md) se conservan íntegros como auditoría y propuesta histórica. Sus siete etapas y alternativas pendientes no reemplazan el orden 00–10 del nuevo encargo. Las decisiones posteriores expresas están en [07](07_DECISIONES_APROBADAS.md).

## Alcance y estado

Solo están autorizadas las fases **00 y 01**. No hubo commits, pushes, despliegues, migraciones de datos ni cambios de servicios, dependencias o configuración real de Keycloak. La terminación técnica permite revisión; **no equivale a aprobación humana ni autoriza avanzar**.

| Fase | Objetivo | Estado y condición de avance |
|---|---|---|
| 00 | Protección del repositorio y línea base | Completada técnicamente; evidencia disponible, pendiente revisión. Suites seguras pasan; pruebas físicas identificadas como pendientes |
| 01 | Matriz de nueve roles y 25 capacidades | Implementada y probada de forma aislada; pendiente revisión. No activada sobre los usuarios existentes |
| 02 | Autorización y contrato de identidad Keycloak | No iniciada; exige autorización expresa y laboratorio aislado |
| 03 | Vistas, navegación y acceso funcional | No iniciada |
| 04 | Kanban, pedidos, producción y calendario | No iniciada |
| 05 | Ventas, cobranzas, historial, métricas, PIN y mensajes | No iniciada |
| 06 | Servicios administrativos Keycloak y persistencia | No iniciada |
| 07 | Creación de cuentas y credenciales iniciales | No iniciada |
| 08 | Estabilización y regresión acumulada | No iniciada |
| 09 | Login definitivo, primer ingreso, perfil y recuperación | No iniciada |
| 10 | Aceptación integral y preparación de retirada de Auth0 | No iniciada; la eliminación de Auth0 requiere otra autorización |

Los títulos abreviados de 03–05 describen su ámbito; el encargo del equipo conserva el detalle normativo de cada fase. La evidencia ejecutada está en [08](08_EVIDENCIA_FASES_00_01.md) y la acumulación de pruebas en [09](09_MATRIZ_PRUEBAS_ACUMULADAS.md).

## Frontera implementada

`shared/authorization.js` conserva la política activa de ocho roles. `shared/keycloakAuthorization.js` deriva de ella los cambios aprobados, reutiliza los 25 identificadores de capacidades y los predicados comunes. Su único consumidor externo actual es la nueva suite de pruebas: no lo importan providers, middleware activo, routers, servicios, guards ni navegación.

La matriz candidata distingue Desarrollador (24 capacidades) de nuevo Soporte (5). Los tres administradores departamentales pierden únicamente `manage:users` en esa matriz. En el flujo activo anterior todavía conservan sus permisos: retirarlos allí ahora dejaría incompleta la integración. **No se presenta la revocación como desplegada.** La fase 02 deberá integrar coherentemente backend, claims y consumidores; las fases siguientes verificarán vistas y reglas adicionales.

El metadato de correspondencia Soporte antiguo → Desarrollador exige resolver las identidades explícitamente. No transforma tokens, usuarios, filas históricas ni nombres guardados. Importar la política nueva no realiza migraciones.

## Condiciones para solicitar la fase 02

1. Revisión y autorización expresa del equipo sobre esta entrega.
2. Confirmar versión y digest reales del servidor Keycloak, separado de `keycloak-js` 26.2.4; preparar realm y MySQL de laboratorio con datos sintéticos y secretos propios.
3. Definir la correspondencia verificable entre los antiguos sujetos Soporte y Desarrollador; resolver la colisión del nombre Soporte antes de activar la política. No basta reemplazar texto o reutilizar el rol sin distinguir personas.
4. Acordar issuer, audience, client ID, JWKS, HTTPS/DNS y mappers de laboratorio, sin modificar el realm empresarial.
5. Preparar casos de firma, expiración, cliente/emisor equivocado, varios roles, permisos excesivos, usuario local inactivo, rol local distinto, sesiones concurrentes y tokens anteriores.
6. Mantener cerradas las asignaciones de Gerencia, Desarrollador y Soporte hasta política privilegiada aprobada. Los controles de sujeto/estado/PIN siguen siendo obligatorios.

El incidente de navegador `refresh_token=undefined` sigue abierto para las fases de sesión correspondientes. Las pruebas con dobles del SDK no acreditan su resolución real. Tampoco se declara operación integral offline: Aiven/MySQL externo, Resend/PIN, fuente Manager, canales corporativos, certificados y suministros offline mantienen condicionantes propios.

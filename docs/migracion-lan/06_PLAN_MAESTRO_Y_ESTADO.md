# Plan maestro y estado de la migración modular

Fecha: **24-10-2026**. Repositorio empresarial: `D:\Universidad\Ing software II\Itecsa_app_LAN`; rama `POC/KEYCLOAK`; base de auditoría `34dfd7c09f876285c1ea84d9020a44a1414ba468`; base de fase 02 `66a75c07e70004f4f83fa015ffe7ab828aa9e9f6`.

Este documento registra la ejecución del nuevo plan autorizado por el equipo. Los documentos [01](01_AUTH0_INVENTARIO_EXHAUSTIVO.md), [02](02_RBAC_ACTUAL_Y_PROPUESTO.md), [03](03_AUTH0_VS_KEYCLOAK.md), [04](04_GUIA_CONFIGURACION_KEYCLOAK.md) y [05](05_PLAN_INICIAL_MIGRACION_IDENTIDAD.md) se conservan íntegros como auditoría y propuesta histórica. Sus siete etapas y alternativas pendientes no reemplazan el orden 00–10 del nuevo encargo. Las decisiones posteriores expresas están en [07](07_DECISIONES_APROBADAS.md).

## Alcance y estado

El equipo autorizó inicialmente 00–01, pidió su commit local (`66a75c07e70004f4f83fa015ffe7ab828aa9e9f6`) y después indicó «pasamos a la siguiente fase», autorizando **02**. La fase 02 parte de ese commit limpio. No hay autorización para 03 o posteriores. No hubo pushes, despliegues, migraciones empresariales ni cambios del realm real; las únicas escrituras de pruebas fueron en un laboratorio desechable. Terminar técnicamente una fase no autoriza la siguiente.

| Fase | Objetivo | Estado y condición de avance |
|---|---|---|
| 00 | Protección del repositorio y línea base | Entregada; avance a 02 autorizado por el equipo. Evidencia histórica conservada |
| 01 | Matriz de nueve roles y 25 capacidades | Entregada y versionada en 66a75c0; avance a 02 autorizado |
| 02 | Autorización y contrato de identidad Keycloak | Implementada y verificada con Keycloak/MySQL reales de laboratorio; pendiente revisión y configuración empresarial. Sin migrar sujetos reales |
| 03 | Vistas, navegación y acceso funcional | No iniciada |
| 04 | Kanban, pedidos, producción y calendario | No iniciada |
| 05 | Ventas, cobranzas, historial, métricas, PIN y mensajes | No iniciada |
| 06 | Servicios administrativos Keycloak y persistencia | No iniciada |
| 07 | Creación de cuentas y credenciales iniciales | No iniciada |
| 08 | Estabilización y regresión acumulada | No iniciada |
| 09 | Login definitivo, primer ingreso, perfil y recuperación | No iniciada |
| 10 | Aceptación integral y preparación de retirada de Auth0 | No iniciada; la eliminación de Auth0 requiere otra autorización |

Los títulos abreviados de 03–05 describen su ámbito; el encargo del equipo conserva el detalle normativo de cada fase. Evidencia histórica 00–01: [08](08_EVIDENCIA_FASES_00_01.md). Evidencia y configuración 02: [10](10_EVIDENCIA_Y_CONFIGURACION_FASE_02.md). Pruebas acumuladas: [09](09_MATRIZ_PRUEBAS_ACUMULADAS.md).

## Frontera implementada

`shared/authorization.js` conserva la referencia Auth0 de ocho roles. `shared/keycloakAuthorization.js` deriva de ella los cambios aprobados y reutiliza los 25 identificadores de capacidades. La fase 02 añade `shared/identityAuthorization.js` para seleccionar la política desde el proveedor autenticado del servidor/contexto de identidad. Auth0 conserva su matriz; Keycloak utiliza la nueva, sin fallback entre proveedores.

La matriz distingue Desarrollador (24 capacidades) de nuevo Soporte (5). AP/AV/AC pierden únicamente `manage:users` en modo Keycloak. El backend exige ahora `KEYCLOAK_ROLE_CLIENT_ID` y un único rol de ese cliente en `resource_access`; los tokens antiguos con solo roles de realm no se aceptan. La respuesta `/auth/verify` identifica proveedor y versión de política, que el frontend comprueba. **El cambio de código no se ha desplegado ni configurado sobre los contenedores/usuarios empresariales existentes.** Las vistas, menús y filtros explícitos por rol siguen reservados a la fase 03.

El metadato Soporte antiguo → Desarrollador sigue exigiendo resolver identidades explícitamente. El namespace nuevo evita reinterpretar el antiguo rol de realm como nuevo Soporte. No se transformaron usuarios o históricos. Solo se vincularon sujetos sintéticos a filas de una base efímera durante las pruebas.

## Condiciones que siguen pendientes para activar el entorno empresarial

1. Revisar la entrega 02 y autorizar por separado cambios de configuración/datos empresariales.
2. Confirmar versión/digest reales del servidor empresarial, separado de `keycloak-js` 26.2.4. El laboratorio ya verificó Keycloak 26.8.1 y MySQL 8.4.13; esto no demuestra la versión empresarial.
3. Definir la correspondencia verificable entre los antiguos sujetos Soporte y Desarrollador; resolver la colisión del nombre Soporte antes de activar la política. No basta reemplazar texto o reutilizar el rol sin distinguir personas.
4. Acordar issuer, audience, client ID, nuevo cliente de roles, JWKS y HTTPS/DNS empresariales. Reproducir allí la configuración revisada sin importar fixtures de laboratorio.
5. Las pruebas de firma, expiración, cliente/emisor equivocado, roles/permisos, estado local, concurrencia y tokens antiguos ya tienen evidencia en 02. Queda la validación del despliegue real y navegadores corporativos.
6. Mantener cerradas las asignaciones de Gerencia, Desarrollador y Soporte hasta política privilegiada aprobada. Los controles de sujeto/estado/PIN siguen siendo obligatorios.

El incidente de navegador `refresh_token=undefined` sigue abierto para las fases de sesión correspondientes. Las pruebas con dobles del SDK no acreditan su resolución real. Tampoco se declara operación integral offline: Aiven/MySQL externo, Resend/PIN, fuente Manager, canales corporativos, certificados y suministros offline mantienen condicionantes propios.

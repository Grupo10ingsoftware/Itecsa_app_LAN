# Plan maestro y estado de la migración modular

Fecha de actualización: **25-10-2026**. Repositorio empresarial: `D:\Universidad\Ing software II\Itecsa_app_LAN`; rama `POC/KEYCLOAK`; base de auditoría `34dfd7c09f876285c1ea84d9020a44a1414ba468`; base de fase 02 `66a75c07e70004f4f83fa015ffe7ab828aa9e9f6`; base de fase 05 `e74a9142a8fc4dda00bf8c14bce07bf4f1557ad3`; base de fase 06 `9e440102c3c94d12e4a5263c5a8b72df6bd41c4e`.

Este documento registra la ejecución del nuevo plan autorizado por el equipo. Los documentos [01](01_AUTH0_INVENTARIO_EXHAUSTIVO.md), [02](02_RBAC_ACTUAL_Y_PROPUESTO.md), [03](03_AUTH0_VS_KEYCLOAK.md), [04](04_GUIA_CONFIGURACION_KEYCLOAK.md) y [05](05_PLAN_INICIAL_MIGRACION_IDENTIDAD.md) se conservan íntegros como auditoría y propuesta histórica. Sus siete etapas y alternativas pendientes no reemplazan el orden 00–10 del nuevo encargo. Las decisiones posteriores expresas están en [07](07_DECISIONES_APROBADAS.md).

## Alcance y estado

El equipo autorizó inicialmente 00–01 y después el avance secuencial mediante instrucciones expresas. Los commits locales son 66a75c0 (00–01), 9bb41e9 (02), 5941404 (03), e74a914 (04) y 9e44010 (05). La petición actual «hace un commit y parte con la siguiente fase» autorizó el último commit y el avance exclusivo a **06**, desde árbol limpio. No autoriza 07 ni la integración Ubuntu descartada. Durante 05–06 no hubo pushes, despliegues, migraciones empresariales ni cambios del realm real; las únicas escrituras de datos de pruebas fueron en laboratorios desechables. Terminar técnicamente una fase no autoriza la siguiente. El historial de autorizaciones se conserva en [07](07_DECISIONES_APROBADAS.md).

| Fase | Objetivo | Estado y condición de avance |
|---|---|---|
| 00 | Protección del repositorio y línea base | Entregada; avance a 02 autorizado por el equipo. Evidencia histórica conservada |
| 01 | Matriz de nueve roles y 25 capacidades | Entregada y versionada en 66a75c0; avance a 02 autorizado |
| 02 | Autorización y contrato de identidad Keycloak | Entregada y versionada en 9bb41e9; verificada con Keycloak/MySQL reales de laboratorio; configuración empresarial pendiente |
| 03 | Vistas, navegación y acceso funcional | Entregada y versionada en 5941404; regresión escritorio/móvil aprobada |
| 04 | Kanban, pedidos, producción y calendario | Versionada en e74a914; regresión real de identidad/PIN/SQL y navegador conservada |
| 05 | Ventas, cobranzas, historial, métricas, PIN y mensajes | Versionada en 9e44010 por petición expresa; regresión de 135 decisiones por nueve roles y escenarios SQL/browser conservada |
| 06 | Servicios administrativos Keycloak y persistencia | Implementada y verificada en laboratorio: adaptador independiente, preparación deshabilitada, registro persistente y conciliación. Migración aditiva ensayada desde esquema 9e44010; rutas futuras verificadas sin montarlas en la aplicación. Cambios locales revisables; integración empresarial pendiente |
| 07 | Creación de cuentas y credenciales iniciales | No iniciada |
| 08 | Estabilización y regresión acumulada | No iniciada |
| 09 | Login definitivo, primer ingreso, perfil y recuperación | No iniciada |
| 10 | Aceptación integral y preparación de retirada de Auth0 | No iniciada; la eliminación de Auth0 requiere otra autorización |

Los títulos abreviados de 03–05 describen su ámbito; el encargo del equipo conserva el detalle normativo de cada fase. Evidencia histórica 00–01: [08](08_EVIDENCIA_FASES_00_01.md). Evidencia y configuración 02: [10](10_EVIDENCIA_Y_CONFIGURACION_FASE_02.md). Evidencia, matriz de vistas e instrucciones 03: [11](11_EVIDENCIA_Y_VERIFICACION_FASE_03.md). Pruebas acumuladas: [09](09_MATRIZ_PRUEBAS_ACUMULADAS.md).

La evidencia y guía de 04 están en [12](12_EVIDENCIA_Y_VERIFICACION_FASE_04.md). Las tres regresiones físicas MySQL anteriormente pendientes se ejecutaron satisfactoriamente en un segundo MySQL efímero, conservando intactos sus tests y guardas originales. Los documentos 08/10/11 conservan los resultados históricos de sus fases, incluidas las omisiones de aquel momento.

La evidencia de 05 está en [13](13_EVIDENCIA_Y_VERIFICACION_FASE_05.md): alcance por módulo, cambios justificados, fallos previos, matriz de operaciones, comandos reproducibles y límites. La regresión acumulada pasa sin cambiar la matriz, los algoritmos PIN, la fuente Manager o los datos empresariales. La configuración reproducible del realm sigue siendo la del laboratorio de 02; no es un reconciliador listo para aplicar sobre usuarios existentes de Ubuntu. Su integración exige una tarea expresa, respaldo recuperable y revisión de diferencias y sujetos antes del corte.

La petición posterior **«hace un commit y parte con la siguiente fase»** autoriza el commit local 9e44010 de 05 y el avance exclusivo a **06** desde árbol limpio. Actualiza el alcance histórico del párrafo inicial; no autoriza 07, un commit automático de 06, push, despliegue o reanudación de la integración Ubuntu descartada. La evidencia y procedimiento de 06 están en [14](14_EVIDENCIA_Y_VERIFICACION_FASE_06.md).

06 añade un adaptador administrativo propio de Keycloak y una saga persistente para preparar identidades ordinarias deshabilitadas, sin contraseñas ni PIN almacenados en el diario. ExternalIdentity separa issuer/sub/username de la PK local; IdentityProvisionOperation controla unicidad, ejecución y conciliación. La migración permite correo nulo y conserva id_usuario, id_auth0, PIN e históricos. **Solo se ejecutó sobre MySQL desechable**, no sobre datos empresariales. La fábrica de rutas nueva se prueba con middleware real en laboratorio y no se monta en la aplicación; la gestión pública Keycloak conserva 503 hasta que el flujo posterior esté completo y revisado.

## Frontera implementada

`shared/authorization.js` conserva la referencia Auth0 de ocho roles. `shared/keycloakAuthorization.js` deriva de ella los cambios aprobados y reutiliza los 25 identificadores de capacidades. La fase 02 añade `shared/identityAuthorization.js` para seleccionar la política desde el proveedor autenticado del servidor/contexto de identidad. Auth0 conserva su matriz; Keycloak utiliza la nueva, sin fallback entre proveedores.

La matriz distingue Desarrollador (24 capacidades) de nuevo Soporte (5). AP/AV/AC pierden únicamente `manage:users` en modo Keycloak. El backend exige ahora `KEYCLOAK_ROLE_CLIENT_ID` y un único rol de ese cliente en `resource_access`; los tokens antiguos con solo roles de realm no se aceptan. La respuesta `/auth/verify` identifica proveedor y versión de política, que el frontend comprueba. **El cambio de código no se ha desplegado ni configurado sobre los contenedores/usuarios empresariales existentes.** La fase 03 adapta los menús, rutas e inicio a esa política: Soporte entra en su espacio de gestión, Desarrollador conserva métricas y las demás vistas de sus capacidades, y los administradores departamentales no acceden a Usuarios. 06 prepara el adaptador backend; la gestión pública permanece cerrada hasta completar y revisar la provisión de 07. Su pantalla no simula operaciones disponibles.

El metadato Soporte antiguo → Desarrollador sigue exigiendo resolver identidades explícitamente. El namespace nuevo evita reinterpretar el antiguo rol de realm como nuevo Soporte. No se transformaron usuarios o históricos. Solo se vincularon sujetos sintéticos a filas de una base efímera durante las pruebas.

## Condiciones que siguen pendientes para activar el entorno empresarial

1. Revisar la entrega 02 y autorizar por separado cambios de configuración/datos empresariales.
2. Confirmar versión/digest reales del servidor empresarial, separado de `keycloak-js` 26.2.4. El laboratorio ya verificó Keycloak 26.8.1 y MySQL 8.4.13; esto no demuestra la versión empresarial.
3. Definir la correspondencia verificable entre los antiguos sujetos Soporte y Desarrollador; resolver la colisión del nombre Soporte antes de activar la política. No basta reemplazar texto o reutilizar el rol sin distinguir personas.
4. Acordar issuer, audience, client ID, nuevo cliente de roles, JWKS y HTTPS/DNS empresariales. Reproducir allí la configuración revisada sin importar fixtures de laboratorio.
5. Las pruebas de firma, expiración, cliente/emisor equivocado, roles/permisos, estado local, concurrencia y tokens antiguos ya tienen evidencia en 02. Queda la validación del despliegue real y navegadores corporativos.
6. Mantener cerradas las asignaciones de Gerencia, Desarrollador y Soporte hasta política privilegiada aprobada. Los controles de sujeto/estado/PIN siguen siendo obligatorios.

El incidente de navegador `refresh_token=undefined` sigue abierto para las fases de sesión correspondientes. Las pruebas con dobles del SDK no acreditan su resolución real. Tampoco se declara operación integral offline: Aiven/MySQL externo, Resend/PIN, fuente Manager, canales corporativos, certificados y suministros offline mantienen condicionantes propios.

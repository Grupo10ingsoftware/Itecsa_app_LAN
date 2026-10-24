# Plan inicial ejecutivo de migración de identidad LAN

Revisión **24-10-2026**. Base empresarial `34dfd7c09f876285c1ea84d9020a44a1414ba468`, rama `POC/KEYCLOAK`. **Propuesta para revisión; ninguna etapa funcional ejecutada.**

## Objetivo, alcance y exclusiones

Sustituir Auth0 por identidad Keycloak accesible íntegramente en LAN, con username, password temporal y cambio obligatorio, recuperación supervisada sin correo y cambio personal desde perfil. Conservar React/Express/Prisma/MySQL, datos y contratos de negocio, roles aprobados, actor, PIN, transacciones, mensajes e históricos.

Esta fase entrega solo cinco documentos: [inventario](01_AUTH0_INVENTARIO_EXHAUSTIVO.md), [RBAC](02_RBAC_ACTUAL_Y_PROPUESTO.md), [equivalencias](03_AUTH0_VS_KEYCLOAK.md), [guía](04_GUIA_CONFIGURACION_KEYCLOAK.md) y este plan. No incluye cambios de código/BD/Git/servicios, instalación, cuentas reales, despliegues, commits o pushes. El universitario queda intacto.

## Hechos y dependencias

- Copia empresarial independiente y con remoto propio: commit raíz `21ac28f` contiene los mismos 552 blobs/rutas que el universitario `88bcb97`. El HEAD empresarial tiene piloto Keycloak, no una migración integral.
- Ocho roles y 25 capacidades verificadas; Soporte actual tiene todas. Gestión de usuarios y recuperación siguen implementadas con Auth0 y devuelven 503 con Keycloak.
- Username no existe en el schema local; correo sigue obligatorio en BD/backend pese a UI parcialmente preparada. Endpoint de contraseña temporal falta.
- El piloto depende de túnel y BD externa según su guía. Sustituir Auth0 no resuelve Aiven, Resend/PIN, otros canales externos, fuente NV, PKI o suministro offline.
- Contraseñas temporales no se guardarán en MySQL, logs, mensajes o caché persistente. El expediente de recuperación será independiente del aviso.

## Siete etapas futuras

| Etapa | Trabajo y áreas afectadas | Condición de salida / reversión |
| --- | --- | --- |
| 1. Aislamiento y base | Verificar repositorios/destinos; conservar SHA base; aprobar políticas de datos, roles y entrega | Acta de decisiones y separación de secretos/BD. No alterar universitario; no modificar remotos sin autorización |
| 2. Infraestructura y realm | Laboratorio Ubuntu, versión/digest IdP, BD, DNS/CA/NTP, HTTPS, SPA y cuenta de servicio | Parámetros y mínimos verificables; laboratorio reproducible y respaldo, sin usar credenciales productivas |
| 3. Autenticación y autorización | Completar provider, sesiones, JWT/claims, matriz nueve roles aprobada, guards y backend | Login/refresh/logout/recarga y denegaciones; tokens antiguos no amplían permisos. Reversión a versión local compatible |
| 4. Administración y credenciales | Adaptador Admin REST, username/email, provisión y fallos parciales, revelado temporal, primer Soporte | Alta/cambio/baja/reset trazables, sin secreto persistido ni reintento ciego. Operaciones inciertas conciliables |
| 5. Recuperación y perfil | Expedientes, cuotas, asignación/concurrencia, avisos Soporte, cambio nativo de password y política sesiones | Recuperación sin correo ni sesión previa; aviso no controla expediente; entrega y reautenticación verificadas |
| 6. Identidades y datos | Ensayar escenario nuevo o histórico, correspondencia emisor/sub, PKs y PIN, catálogos y backups coordinados | Sin FKs/actores reasignados, cuentas duplicadas o pérdida de llaves. Origen conservado y corte de escrituras acordado |
| 7. Aceptación offline y corte | Matriz multirrol/fallos, instalación fría, reinicios, restore, capturas sin Internet y despliegue autorizado | Evidencia aprobada, rollback offline completo y operación responsable. Retirar Auth0 solo después de equivalencia |

Áreas principales: providers/hooks/guards y usuarios/perfil/recuperación frontend; middleware JWT/identidad/capacidades, administración/auth/mensajes/auditoría backend; catálogo compartido, esquema de identidades/expedientes, configuración runtime/despliegue y suites. El inventario contiene las rutas y líneas: este plan no duplica una lista gigante de cambios.

## Riesgos, decisiones y aceptación

Prioridad alta: pérdida de identidad histórica; concesiones heredadas del Soporte técnico; provisión distribuida incompleta; password cambiado con respuesta perdida; reset concurrente; credenciales expuestas; JWT antiguo aún válido; dependencia cloud residual y restauración sin claves.

Decisiones pendientes: versión/digest real IdP; dominios/CA/topología; username/canonización; alternativa D1/D2/D3 de Desarrollador; alcance y roles asignables por nuevo Soporte; privilegios mínimos administrativos; bootstrap/última cuenta/emergencia; base nueva o preservación; estructura de identidades; entrega/verificación de credenciales; sesiones, cuotas y retención; RPO/RTO. No se seleccionan silenciosamente.

Criterios de aceptación: login/primer cambio/perfil/reset/admin operan en LAN sin email externo; backend conserva intersección rol/permisos y estado local; administradores departamentales pierden solo gestión de cuentas; nuevo Soporte no modifica negocio; PIN e históricos conservan actor e integridad; no secretos persistidos ni dos resets simultáneos; fallos parciales conciliables; instalación fría, reinicios, rotación y restauración funcionan sin Internet en servidor y puesto. Las pruebas T01–T34 de 03 **están preparadas como especificación, no ejecutadas**.

**Primera tarea técnica recomendada tras revisión:** formalizar decisiones de la etapa 1 y preparar un laboratorio de identidad aislado con versiones/destinos aprobados y datos sintéticos. Dentro de él, validar primero Code+PKCE, contrato JWT/rol/permisos y renovación/cierre concurrentes del piloto antes de desarrollar administración. No empezar borrando Auth0 ni ejecutando migraciones sobre la base existente. Volver a Auth0 con Internet no constituye rollback aceptable de producción LAN aislada.

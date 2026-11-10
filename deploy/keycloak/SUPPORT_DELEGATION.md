# Delegación de roles especiales al Soporte inicial (#45)

Estado: diseño para revisión; **la delegación todavía no está implementada ni activada**. El trabajo se detuvo porque la revisión automática de herramientas rechazó modificar el código de autorización, incluso en la rama aislada para PR. Este documento no cambia permisos, datos, imágenes ni configuración de Keycloak.

## Comportamiento solicitado

El Soporte creado por `first-user` debe poder sustituir el rol de una cuenta ya creada en ITECSA por `Gerencia` o `Soporte`, desde la consola del realm `itecsa`. Crear otro Soporte no debe delegarle automáticamente esa facultad. El formulario y la API ordinarios mantienen sus roles actuales.

La identidad inicial debe fijarse por su UUID de Keycloak, comprobando antes su binding local con el mismo issuer, subject y usuario. El nombre visible y pertenecer al rol Soporte por sí solos no son autorización suficiente.

## Matriz propuesta

| Actor | Acción | Resultado requerido |
|---|---|---|
| Soporte inicial fijado, todavía con rol Soporte | Consultar usuarios y el cliente `itecsa-api-v1` | Permitido |
| Soporte inicial | Quitar el rol de negocio anterior y asignar un rol ordinario, Gerencia o Soporte a otra cuenta | Permitido |
| Soporte inicial | Cambiar sus propios roles o roles de cuentas técnicas | Denegado |
| Soporte inicial | Asignar Desarrollador, roles de `realm-management`, roles de otro cliente o composites | Denegado |
| Soporte inicial | Crear/borrar usuarios en Keycloak, cambiar contraseñas, impersonar, modificar clientes, grupos, realm o políticas | Denegado |
| Otro Soporte, Desarrollador u otros roles de negocio | Administrar roles desde la consola/API administrativa de Keycloak | Denegado |
| Operador de despliegue | Instalar y comprobar la configuración delegada | Conserva su función administrativa existente |

Los únicos roles administrativos directos propuestos son `query-users` y `query-clients`. La autorización de lectura y asignación se configura mediante FGAP v2. No se asignan `realm-admin`, `manage-users`, `view-users` ni `manage-clients` al Soporte inicial.

## Contrato que debe implementar el PR funcional

1. Política por UUID inicial más política que exija conservar Soporte. Ambas condiciones deben cumplirse.
2. Permisos `Users: view/map-roles`, con una prohibición específica de `map-roles` sobre el propio actor y las cuentas técnicas.
3. `Roles: map-role` limitado a los ocho roles de negocio, excluido Desarrollador. Incluir roles ordinarios permite retirar el rol anterior; no conceder `Clients: map-roles`, que ampliaría el alcance a todos los roles del cliente.
4. `Clients: view` exclusivamente sobre `itecsa-api-v1`; los roles de consulta solo permiten entrar y buscar.
5. Validación de privilegios directos e heredados del actor antes de configurar. Rechazar políticas ajenas o incompatibles; no sobrescribirlas automáticamente.
6. Instalación idempotente después de confirmar el binding del Soporte inicial. Para instalaciones existentes, procedimiento explícito del operador que compruebe el usuario antes de fijar el UUID. Una vez fijado, nunca cambiarlo por coincidencia de nombre.
7. Comprobación de solo lectura en `keycloak-configure`/verificación, sin duplicar políticas ni conceder privilegios adicionales. La configuración parcial debe poder reanudarse sin borrar una cuenta cuyo binding ya fue confirmado.
8. Eventos administrativos habilitados sin guardar representaciones que puedan incluir credenciales. Mantener la auditoría existente de conciliación de rol local.

## Procedimiento de uso previsto

Cuando el PR funcional esté instalado y verificado:

1. Crear primero la cuenta mediante Gestión de usuarios de ITECSA.
2. Entrar como Soporte inicial en `https://<origen>/admin/itecsa/console/`.
3. Abrir **Users → usuario → Role mapping** y comprobar el nombre de usuario.
4. Quitar el rol anterior del cliente `itecsa-api-v1`. Asignar exactamente uno: **Gerencia** o **Soporte**.
5. Pedir al usuario que cierre su sesión y vuelva a entrar en ITECSA.

La aplicación ya rechaza tokens sin un rol reconocido o con varios roles de negocio. La conciliación existente confirma el mapping actual de Keycloak antes de actualizar el rol local y conserva el mismo binding. Una cuenta creada solamente en Keycloak no obtiene acceso a ITECSA sin su binding local.

Esto no constituye revocación instantánea de tokens ya emitidos: la sesión anterior puede conservar su acceso hasta la caducidad del token. El cliente web tiene un access token de cinco minutos. No debe prometerse bloqueo inmediato durante el cambio; hace falta probar explícitamente ese límite y documentar el procedimiento de cierre de sesión.

## Evidencia disponible y pruebas pendientes

Se consultó la documentación oficial correspondiente a **Keycloak 26.8.1** y se ejecutó un prototipo en un contenedor temporal, separado del despliegue ITECSA. Una política por UUID y otra por Soporte permitieron consultar una cuenta con `access.mapRoles=true`, manteniendo `manage`, `resetPassword`, `impersonate` y `manageGroupMembership` en `false`. El endpoint de roles disponibles solo mostró los roles autorizados. La consulta general de clientes devolvió 403 sin `query-clients`, por lo que la consola necesita ese rol de consulta además del permiso de lectura del cliente concreto.

El prototipo no certifica el flujo completo. Antes de fusionar un PR funcional faltan las pruebas de la matriz mediante POST/DELETE reales, navegación en la consola, denegación del otro Soporte, autoasignación y cuentas técnicas, instalación y repetición sin escrituras, rechazo de drift, renovación de sesión, estados con cero/dos roles, cuenta sin binding y conciliación MySQL con auditoría. También debe comprobarse la conducta de tokens anteriores al cambio.

Referencias primarias de la versión utilizada:

- [FGAP v2, recursos, scopes, políticas y precedencia](https://github.com/keycloak/keycloak/blob/26.8.1/docs/documentation/server_admin/topics/admin-console-permissions/fine-grain-v2.adoc).
- [Cliente Admin API: mappings de roles por usuario](https://github.com/keycloak/keycloak/blob/26.8.1/js/libs/keycloak-admin-client/README.md).

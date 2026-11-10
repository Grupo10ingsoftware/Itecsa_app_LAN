# Asignar Gerencia y Soporte desde Keycloak (#45)

Todos los usuarios con el rol **Soporte** pueden sustituir roles de negocio desde la consola del realm `itecsa`, incluidos los Soporte existentes y los que se creen después. No se modifica el formulario ni la API de alta ordinaria de ITECSA.

## Uso

1. Crear primero la cuenta mediante **Gestión de usuarios** de ITECSA, con un rol ordinario.
2. Entrar con la cuenta Soporte en `https://<origen>/admin/itecsa/console/`.
3. Abrir **Users → usuario → Role mapping** y comprobar el nombre de usuario.
4. Quitar el rol anterior del cliente `itecsa-api-v1`. En **Assign role**, filtrar por ese cliente y asignar exactamente uno: **Gerencia** o **Soporte**.
5. Pedir al usuario que cierre su sesión y vuelva a entrar en ITECSA. La aplicación confirma el mapping actual y concilia el rol local conservando el mismo binding y su auditoría.

`Gerencia` es el nombre técnico del rol de gerente. No crear un rol distinto llamado `Gerente`. No modificar roles de cuentas técnicas ni usar la consola para crear cuentas de aplicación: una cuenta que solo exista en Keycloak no tiene binding local y no puede acceder a ITECSA.

La aplicación rechaza tokens nuevos sin un rol de negocio o con varios. El token anterior puede conservar su acceso hasta caducar: el cliente web tiene una duración de cinco minutos. El cambio desde consola no promete revocación instantánea. No quitar Soporte a la última cuenta que desempeñe esa función; la API de Keycloak no impone esa regla operativa. Si un usuario se quita su propio Soporte, pierde la delegación al renovar la sesión.

## Instalación y actualización

Las instalaciones nuevas configuran los permisos durante el bootstrap; `first-user` hereda la delegación al recibir Soporte. Para un despliegue existente, después de actualizar las imágenes y el checkout al commit que incorpora este cambio:

```bash
bash deploy/mysql/manage.sh keycloak-configure --env-file deploy/mysql.env
```

El comando usa el operador administrativo de despliegue, valida la configuración, aplica lo pendiente y comprueba el resultado. No migra MySQL ni cambia bindings o contraseñas. Repetirlo con una configuración correcta no escribe ni duplica políticas. Los Soporte deben volver a iniciar sesión en la consola para recibir los permisos nuevos.

`verify` comprueba el mismo contrato en modo de solo lectura. Una política incompatible, un composite administrativo amplio o una autorización ajena al contrato se rechazan para revisión por el operador; no se sobrescriben. La lista protegida cubre las cuentas técnicas existentes al configurar. Si se agregan o retiran clients con service account fuera del despliegue, revisar también esa lista y el contrato antes de volver a operar.

## Alcance de la delegación

| Actor | Acción | Resultado |
|---|---|---|
| Cualquier Soporte | Consultar usuarios y el cliente `itecsa-api-v1` | Permitido |
| Cualquier Soporte | Quitar/asignar los seis roles ordinarios, Gerencia o Soporte | Permitido |
| Cualquier Soporte | Asignar Desarrollador, roles de `realm-management` o permisos directos de otros clients | Denegado |
| Cualquier Soporte | Cambiar roles de cuentas técnicas protegidas | Denegado |
| Cualquier Soporte | Crear/borrar usuarios en Keycloak, cambiar contraseñas, impersonar o cerrar sesiones ajenas | Denegado |
| Cualquier Soporte | Modificar clientes, composites, grupos, realm o políticas FGAP | Denegado |
| Gerencia, Desarrollador y roles ordinarios sin Soporte | Usar esta delegación en la consola/API administrativa | Denegado |
| Operador de despliegue | Configurar y verificar la delegación | Conserva su función administrativa existente |

Soporte incorpora únicamente `query-users` y `query-clients` como composites administrativos, para navegar y buscar en la consola. No recibe `realm-admin`, `manage-users`, `view-users`, `manage-clients`, `reset-password` ni impersonación. Los permisos efectivos de edición se limitan con **FGAP v2**: `Users: map-roles`, `Roles: map-role` para los ocho roles autorizados y `Clients: view` para el cliente de negocio. Una denegación específica protege las cuentas técnicas.

Los tokens del cliente web mantienen el rol de negocio y sus permisos existentes. No incorporan los roles administrativos de consulta a `permissions` ni a `resource_access`. La comprobación de acceso en ITECSA sigue requiriendo un usuario local activo, vinculado al mismo issuer y subject.

Los eventos administrativos quedan habilitados sin almacenar representaciones que puedan contener credenciales. La conciliación local conserva la auditoría `identity.role_sync` del cambio de rol. Los operadores siguen siendo responsables de no otorgar roles administrativos amplios directamente a usuarios o grupos: esos roles pueden evitar la evaluación FGAP.

## Verificación reproducible

```bash
node --test deploy/keycloak/profile-contract.test.mjs
node --test deploy/keycloak/support-delegation.integration.test.mjs
```

La segunda prueba necesita Docker y crea un Keycloak 26.8.1 desechable, con nombre, puerto y credenciales aleatorios; no acepta credenciales ni origen del despliegue existente y elimina su contenedor al terminar. Verifica Soporte existente/nuevo/promovido, sustitución real de roles, rechazo de escalada técnica y Desarrollador, restricciones de API, separación de claims, estados con cero o varios roles, pérdida de delegación al retirar Soporte, idempotencia y detección de drift. La navegación visual y la conciliación MySQL deben verificarse adicionalmente en el despliegue de revisión.

Referencias primarias:

- [FGAP v2 en Keycloak 26.8.1](https://github.com/keycloak/keycloak/blob/26.8.1/docs/documentation/server_admin/topics/admin-console-permissions/fine-grain-v2.adoc).
- [Admin API: mappings de roles por usuario](https://github.com/keycloak/keycloak/blob/26.8.1/js/libs/keycloak-admin-client/README.md).

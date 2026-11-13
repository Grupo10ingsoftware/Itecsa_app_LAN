# Administración de usuarios

La gestión de usuarios corresponde a **Administrador Produccion**,
**Administrador Ventas** y **Administrador Cobranzas**. Los tres tienen las
mismas funciones: listado, búsqueda, filtros, movimientos, creación, edición,
cambios de rol y estado, y conciliación de altas. Las mutaciones conservan la
validación del PIN personal, el estado vigente del administrador y la auditoría.
Desarrollador conserva su acceso previo en la aplicación.

**Soporte queda deshabilitado**, sin eliminar cuentas, roles ni vínculos
históricos. La aplicación rechaza también sus tokens anteriores al cambio.
La configuración de Keycloak deshabilita sus cuentas y cierra sus sesiones.
Las instalaciones nuevas crean un Administrador de Producción como primer usuario.

## Instalaciones existentes

Actualizar el checkout. Antes de ejecutar update o un backup con los scripts
nuevos, aplicar la configuración con el entorno habitual del despliegue:

~~~sh
bash deploy/mysql/manage.sh keycloak-configure
bash deploy/mysql/manage.sh verify
~~~

Para otro archivo de entorno, añadir --env-file ruta/al/archivo.env a ambos
comandos. Después de desplegar las imágenes actualizadas de la aplicación,
los administradores deben cerrar sesión y volver a ingresar para recibir
manage:users en el token.

No se recrea el realm ni las cuentas. La configuración agrega únicamente
manage:users a las composiciones anteriores de los tres administradores,
migra la delegación anterior, retira los roles de consulta de Soporte y
deshabilita sus cuentas. Las repeticiones son idempotentes; verify detecta
cambios pendientes sin aplicarlos. Las composiciones o políticas ajenas al
contrato requieren revisión.

## Consola de Keycloak

Los tres administradores pueden ingresar a /admin/itecsa/console/, buscar
usuarios y sustituir los seis roles ordinarios o Gerencia del cliente
itecsa-api-v1. Debe quedar exactamente un rol de negocio por cuenta.
Soporte y Desarrollador no se pueden asignar mediante esta delegación.

La consola permite consultar y asignar roles. La creación, edición de datos
y cambios de estado se realizan desde la aplicación. La delegación excluye
administrar cuentas técnicas, otorgar permisos directos, modificar clientes
o políticas, restablecer contraseñas e impersonar usuarios.
Los operarios, Gerencia, Desarrollador y Soporte carecen de esta delegación.

La migración suspende FGAP mientras sustituye las políticas anteriores de
autorización y protección de cuentas técnicas. Verifica el grafo persistido
antes de reactivarlo. Si se interrumpe, puede retomarse con keycloak-configure.

## Validación

~~~sh
node --test capaServidor/test/userAdministrationAccess.test.js deploy/keycloak/user-administration.test.mjs
node --test deploy/keycloak/profile-contract.test.mjs
node --test deploy/keycloak/support-delegation.integration.test.mjs
~~~

La última prueba requiere Docker y crea un Keycloak desechable. Comprueba los
tres administradores, los roles ordinarios, Soporte deshabilitado, las
restricciones técnicas y la migración de políticas anteriores.

# Creación de usuarios con credencial temporal

El formulario conserva Nombre, Apellido, nombre de acceso automático, correo, RUT y rol. Solicita el PIN del operador mediante el modal de Cobranzas. La autorización definitiva utiliza el mismo `PinService.validate` del backend; el navegador no valida ni conserva el PIN.

El backend crea la cuenta deshabilitada, asigna el rol, genera una contraseña criptográfica de 16 caracteres y llama a `reset-password` con `temporary: true`. Comprueba la existencia de la credencial y la acción `UPDATE_PASSWORD`, persiste el usuario y su vínculo en una transacción MySQL, habilita la cuenta y confirma la operación. El primer acceso conserva la activación local existente desde el estado `Pendiente`.

La contraseña solamente aparece en la respuesta que completa el alta. No se escribe en el diario de operaciones, MySQL ni almacenamiento del navegador. Las respuestas administrativas usan `Cache-Control: no-store`. El modal permite visualizar y copiar la contraseña; Aceptar limpia el estado y notifica a la página únicamente el resultado sin contraseña. Copiar escribe en el portapapeles por solicitud del operador.

## Errores y conciliación

Ante un resultado parcial se intenta deshabilitar la cuenta y se mantiene el diario existente en `needs_reconciliation`, con un código de error sin secretos. Si Keycloak no permite confirmar la deshabilitación, queda registrado `IDENTITY_DISABLE_UNCONFIRMED` para revisión. No se borra una cuenta ajena ni se reintenta automáticamente una mutación con resultado incierto.

La conciliación utiliza el identificador de operación y el vínculo existente para evitar duplicados. Nunca recupera ni vuelve a generar la contraseña inicial. Si la credencial no quedó confirmada, se debe establecer una nueva credencial temporal mediante Keycloak antes de conciliar. Si se pierde la respuesta exitosa o se cierra la página, la contraseña original no puede recuperarse desde ITECSA.

## Migración y ejecución

Aplicar la migración `202610250002_initial_user_credentials` antes de ejecutar el backend actualizado. Añade `Usuario.id_keycloak` y completa los registros existentes desde `ExternalIdentity`, conservando esa relación como fuente de identidad del sistema. No almacena credenciales.

Desde `capaServidor`, revisar el estado de migraciones con `npm run prisma:migrate:status`. Usar el procedimiento habitual de despliegue de migraciones; `migrate deploy` ejecuta todas las pendientes, no solamente esta. Después ejecutar `npm run prisma:generate` y reiniciar el backend.

La cuenta administrativa de Keycloak debe poder crear usuarios, asignar roles, establecer contraseñas, consultar credenciales y habilitar/deshabilitar cuentas. Sus secretos permanecen en el backend.

## Comprobaciones

- `capaServidor`: `npm run test:users` ejecuta pruebas con dobles de Keycloak/MySQL y el validador real de PIN, además de solicitudes HTTP contra Express local.
- `capaVista`: `npm test` ejecuta pruebas DOM de creación, errores de PIN, entrega y limpieza de la contraseña y regresión del modal de pagos.
- `capaVista`: `npm run lint` y `npm run build`.
- `capaServidor`: `npm run prisma:validate` y `npm run prisma:generate`.

Estas pruebas no sustituyen la aplicación de la migración ni una prueba de alta e inicio de sesión contra Keycloak y MySQL reales.

## Archivos del cambio

| Archivos | Cambio |
| --- | --- |
| `capaVista/src/modules/users/components/UserCreateForm.jsx` | Solicitud de PIN en modal, entrega de contraseña y limpieza al aceptar. |
| `capaVista/src/modules/payments/components/PaymentCredentialsModal.jsx` | Parámetros opcionales para reutilizar el modal; conserva reglas y valores predeterminados de pagos. |
| `TemporaryPasswordModal.jsx`, `UserCreateModal.jsx`, `UserCreateForm.module.css` | Entrega inicial con visualizar/copiar, foco, bloqueo del modal padre y estilos existentes. |
| `capaVista/src/modules/users/pages/UserManagementPage.jsx` | Cierre y actualización después de aceptar la credencial. |
| `capaServidor/src/modules/users/service/generarContrasena.js` | Generador criptográfico solicitado. |
| `keycloakIdentityAdministration.service.js`, `keycloakManagement.service.js` | Credencial temporal, confirmación, habilitación y compensación de errores. |
| `capaServidor/src/modules/users/repo/keycloakIdentity.repo.js` | Persistencia transaccional, vínculo `id_keycloak` y conciliación sin duplicar usuarios. |
| `capaServidor/src/modules/users/routes/keycloakIdentityPreparation.routes.js` | Respuesta de creación y prohibición de caché. |
| `capaServidor/prisma/schema.prisma`, `202610250002_initial_user_credentials/migration.sql` | Columna de identidad y migración desde los vínculos existentes. |
| `userCreation.test.js`, `UserCreateForm.test.jsx`, `capaVista/vitest.config.js` | Pruebas de backend, HTTP, interfaz y regresión de pagos. |
| Ambos `package.json` y `capaVista/package-lock.json` | Comandos y dependencias de pruebas; actualizaciones compatibles de herramientas de desarrollo. |

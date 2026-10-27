# Sistema de modales de PIN

Base inspeccionada: mysqlLAN, 6f0787f. Referencia: Nuevo modal PIN.pdf (32 páginas). Sin cambios de API, esquema, permisos o Keycloak.

## Inventario previo y condiciones conservadas

| ID | Consumidor actual | Condición original que se conserva |
| --- | --- | --- |
| P4 | PaymentDeconfirmationModal | A. Autoriza desconfirmación con PIN personal; callback del panel y permisos administrativos existentes. Sin apertura accesible: no habilitar. |
| P6 | DeliveryChangeCredentialsModal | A. Cambio de fecha previamente confirmado; entrega `{pin}` a calendario. |
| P9 | UserUnlinkConfirmModal | No existe en esta revisión. No recrear ni habilitar desvinculación. |
| P1 | SubprocessAuthModal | B. Completar: comentario opcional sin límite UI previo. Retroceder: obligatorio, backend máximo 2000. Conserva selección de ítem/subproceso y callbacks. |
| P2 | MoveToProductionModal | B. Traslado, comentario opcional sin máximo explícito previo. Callback `{pin, comment}`. |
| P3 | CancelProductionModal | B. Cancelación administrativa, observación obligatoria, 2000 caracteres. |
| P5 | PaymentCredentialsModal | A en primera confirmación pendiente; B al cambiar decisión previa, motivo obligatorio, 2000. |
| P7 | UserCreateForm/UserCreateModal | Alta/reconciliación valida datos y roles antes del PIN. A, luego entrega de contraseña temporal, sin cierre anticipado. |
| P8 | UserEditModal | Edición con datos adicionales y PIN, propio rol protegido. Consumidor actual readOnly: no habilitar edición. |
| P10 | TemporaryPasswordModal | Actualmente entrega contraseña inicial, permite visualizar/copiar y exige aceptación. No es autorización PIN. |
| P11 | ProfilePage entrega | PIN generado por backend pendiente de aceptación; visible una vez, aceptación obligatoria. No convertir en ingreso de PIN. |
| P12 | ProfilePage recuperación | Modal de transición a Keycloak en misma pestaña; conserva Code+PKCE y sesión original. No introducir credenciales locales. |

## Bitácora incremental

Infraestructura: presentación compartida, PIN numérico de seis dígitos, observación configurable, errores, carga, guardia síncrona, descarte de respuestas visuales al desmontar y reinicio por actor/operación. Foco reutiliza el hook existente.

- P4: migrado sin activar apertura. Pruebas compartidas y Kanban: 11/11.
- P6: migrado, limpieza por cierre/cambio de fecha y retirada de log de excepci?n; CSS credentialsLabel sin consumidores eliminado. Pruebas calendario + base: 8/8.
- P9: ausente; no se agrega funcionalidad.
- P1: migrado; PIN/comentario salen del estado del panel. Completar opcional y retroceso obligatorio comprobados (7/7 con Kanban).
- P2: migrado; comentario opcional y reapertura vac?a comprobados (3/3).
- P3: migrado, observaci?n obligatoria/2000 y payload verificados; Kanban 9/9. CSS operatorModal retirado salvo operatorModalError, a?n usado por correcciones.
- P5: A/B din?mico, payload y motivo 2000 conservados. Error del servidor ahora dentro del modal. Pruebas pagos/alta/base 14/14. Se corrigi? restauraci?n de capas al sustituir modales.
- P7: alta usa directamente el sistema PIN, desacoplada de Pagos. Pruebas de validaci?n, entrega, conciliaci?n y errores: 8/8.
- P8: campos y permisos conservados con marco/campo PIN compartidos; limpia tambi?n errores de datos antes de enviar. Pruebas: 5/5.
- P10: entrega especial con marco compartido, conserva visualizar/copiar/aceptar obligatorio. Pruebas de alta/entrega: 8/8. Retirados estilos credentials de Pagos y entrega de Usuarios sin consumidores.

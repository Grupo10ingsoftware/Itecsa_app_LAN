# Revalidación visual de sesión cada 30 minutos

La renovación normal del token llamaba a `publish`, incrementaba siempre `verificationKey` y hacía que AuthProvider/ProtectedRoute sustituyeran la página por el estado de verificación. Al montar de nuevo la vista se perdían sus estados locales, incluido el formulario.

Ahora esa clave se mantiene durante las renovaciones ordinarias de la misma autorización. La revalidación periódica que remonta la vista se agenda a **30 minutos**. El temporizador sigue el plazo de la última comprobación y se limpia al desmontar el proveedor, también durante el replay de StrictMode. No usa `location.reload()`.

La renovación de tokens conserva `updateToken(30)` y `onTokenExpired`; no se extiende la vida de los tokens ni se modifica Keycloak. Se mantienen invalidación inmediata por fallo/expiración, logout, cambio de identidad y verificación inmediata al restaurar la página desde el historial del navegador. Cambiar roles, permisos o contexto de autorización en el token también incrementa inmediatamente la clave. Las variaciones normales de timestamps/ID del token y del orden de roles no remontan la página.

No cambia el backend: cada solicitud sigue pasando por sus controles de autenticación, identidad activa y autorización. El intervalo de notificaciones permanece como estaba; este cambio corresponde al reinicio visual de la página que indicó el usuario.

Se añadieron nueve pruebas que cubren el límite de 30 minutos, el temporizador sin peticiones API, cancelación del temporizador, cambios de autorización, restauración desde historial y un formulario real bajo AuthProvider/ProtectedRoute. Este conserva su elemento y texto en renovaciones ordinarias, se desmonta al vencer el plazo y se oculta de inmediato ante una sesión inválida o una autorización diferente.

Validación final: 285/285 pruebas frontend, ESLint y build aprobados. Los cambios pendientes de OPT-04 se conservan. Sin commit ni push.

```powershell
# capaVista
npm.cmd test -- src/app/providers/keycloakSession.test.js src/app/providers/sessionRevalidation.test.jsx --maxWorkers=2
npm.cmd test -- --maxWorkers=2
npm.cmd run lint
npm.cmd run build
```

Referencia contrastada con el SDK instalado: [adaptador JavaScript de Keycloak](https://www.keycloak.org/securing-apps/javascript-adapter). La expiración del token y la revalidación visual son procesos diferentes. No se cambiaron PIN, recuperación ni sus contratos.

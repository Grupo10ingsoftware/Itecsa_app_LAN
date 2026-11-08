# ITECSA · Vista

Aplicación React 19 para la operación de pedidos, producción, pagos y usuarios.
Usa Vite 8, React Router 7, Bootstrap 5, CSS Modules y Keycloak. La identidad y
las operaciones de negocio se validan en la API; ocultar una acción en la vista
no sustituye la autorización del servidor.

## 1. Dependencias del repositorio

Conservar la estructura completa. La vista importa permisos, catálogos, reglas
y estilos de `../shared/`. Su compilación local sincroniza el indicador de carga
con el tema Keycloak mediante `../scripts/sync-loading-theme.mjs`; necesita
también `../deploy/keycloak/themes/`.

Para el despliegue integrado, requisitos de infraestructura, certificados,
respaldos y operación, consultar el [README del servidor](../capaServidor/README.md).

## 2. Instalación y desarrollo

Usar Node.js 22.12 o posterior compatible con los lockfiles y npm. Desde la raíz:

```bash
npm ci --prefix capaVista
```

Preparar `capaVista/.env` a partir de `env.example` si no existe. Mantener los
valores públicos alineados con el Keycloak y la API de desarrollo:

| Variable | Descripción |
| --- | --- |
| `VITE_AUTH_PROVIDER` | `keycloak`, proveedor admitido. |
| `VITE_KEYCLOAK_URL` | URL de Keycloak accesible desde el navegador. |
| `VITE_KEYCLOAK_REALM` | Realm; el stack integrado utiliza `itecsa`. |
| `VITE_KEYCLOAK_CLIENT_ID` | Cliente público SPA; `itecsa-web` en el stack integrado. |
| `VITE_KEYCLOAK_AUDIENCE` | Audiencia del recurso API; distinta del cliente SPA. |
| `VITE_API_BASE_URL` | URL pública de la API, incluyendo `/api`. |
| `VITE_ENABLE_DEMO_ROUTES` | Flag de compilación/desarrollo; mantener `false` en la entrega. |

Todos los valores `VITE_*` se incorporan al navegador. No incluir contraseñas,
PIN, tokens o secretos de cliente. Reiniciar Vite al cambiar `.env`.

```bash
cd capaVista
npm run dev
```

Abrir `http://127.0.0.1:5173/kanban`. El puerto es fijo; `localhost:5173`
redirige a `127.0.0.1`. El plugin `dev/localAccess.js` controla el origen local
y se utiliza también en preview. No usar direcciones internas de contenedores
como URLs del navegador. El comando inicia únicamente la vista: la API y
Keycloak deben estar disponibles por separado.

El acceso desde otros equipos de la LAN requiere el origen HTTPS aprobado y un
certificado confiable para PKCE. HTTP mediante una IP LAN no es un contexto
seguro para el flujo de autenticación.

## 3. Comandos

Desde `capaVista/`:

| Comando | Resultado |
| --- | --- |
| `npm run dev` | Servidor de desarrollo con recarga. |
| `npm run lint` | ESLint sobre las fuentes. |
| `npm run build` | Sincroniza CSS de carga con Keycloak y genera `dist/`. |
| `npm run preview` | Sirve la compilación local en `127.0.0.1:5173`. |

`preview` permite revisar el resultado compilado; la entrega productiva usa
Nginx. No hay un comando independiente de typecheck en este proyecto JavaScript.
Las pruebas y su configuración se retiraron de las fuentes de entrega y están
conservadas en el respaldo local de la limpieza del 8 de noviembre de 2026.

## 4. Estructura

| Ruta | Contenido |
| --- | --- |
| `src/app/` | Router, proveedores de identidad, sesión y estructura de aplicación. |
| `src/modules/` | Pantallas y lógica de cada módulo. |
| `src/services/api/` | Cliente HTTP y tratamiento centralizado de peticiones. |
| `src/config/` | Rutas, permisos, navegación y configuración pública. |
| `src/hooks/` | Hooks compartidos de interacción y datos. |
| `src/shared/` | Layout, filtros, tablas, paginación, PIN y notificaciones Toast. |
| `src/styles/` | Estilos y variables corporativas. |
| `public/runtime-config.js` | Punto de entrada de configuración pública del despliegue. |
| `dev/localAccess.js` | Restricciones de origen para desarrollo y preview. |

Los módulos visibles dependen de las capacidades de la identidad autenticada:

- `/kanban`: tablero y acciones de producción.
- `/ordenes/nuevo`: registro de pedidos desde notas de venta.
- `/pagos`: confirmación de pagos.
- `/calendario-produccion`: programación y calendario.
- `/historial-pedidos` y su detalle: consulta de historial.
- `/mensajes` y su detalle: notificaciones.
- `/metricas`: reportes y estadísticas.
- `/admin/usuarios`: gestión de usuarios.
- `/perfil`: datos propios y PIN.
- `/documentos`, `/solicitudes`, `/reportar-incidente`: información y canales
  sujetos a la configuración disponible.

`/login` delega la autenticación en Keycloak. La recuperación supervisada de
contraseña y el callback `/auth/pin-recovery/callback` forman parte de los flujos
de acceso; conservar sus rutas registradas en Keycloak.

## 5. Sesión y PIN

El cliente `itecsa-web` usa Authorization Code con PKCE S256 mediante
`keycloak-js`. Los tokens se mantienen en memoria y se renuevan mediante el SDK.
La API verifica identidad activa y permisos antes de habilitar el acceso.
El cierre de sesión utiliza Keycloak y devuelve al punto de entrada.

La recuperación de PIN utiliza un cliente público separado,
`itecsa-pin-recovery`, y reautenticación en la misma pestaña. El servidor controla
estado, nonce, PKCE y la operación temporal, y valida la identidad antes de rotar
el PIN. El navegador recibe el resultado mediante el flujo existente del perfil
y debe confirmar la entrega. No se elige un PIN manualmente ni se envía la
contraseña a React. Conservar las confirmaciones por PIN y los permisos de cada
acción de negocio.

## 6. Configuración y despliegue productivo

La imagen web se construye desde la raíz, usando `capaVista/Dockerfile` y su
target `production`. Nginx sirve el resultado y el entrypoint
`deploy/40-runtime-config.sh` genera `window.__ITECSA_CONFIG__` antes de iniciar.
El stack `compose.mysql.yaml` proporciona la configuración pública. Esta tiene
prioridad sobre los valores `VITE_*` incorporados al build:

| Campo de ejecución | Equivalente de compilación |
| --- | --- |
| `authProvider` | `VITE_AUTH_PROVIDER` |
| `keycloakUrl` | `VITE_KEYCLOAK_URL` |
| `keycloakRealm` | `VITE_KEYCLOAK_REALM` |
| `keycloakClientId` | `VITE_KEYCLOAK_CLIENT_ID` |
| `keycloakAudience` | `VITE_KEYCLOAK_AUDIENCE` |
| `apiBaseUrl` | `VITE_API_BASE_URL` |

Cambiar estos campos de ejecución requiere recrear el servicio con su nueva
configuración; no recompilar la SPA. El flag de demo es de compilación y no
forma parte de esa configuración Nginx. El build Docker ejecuta Vite directamente
porque los temas Keycloak se empaquetan en su propia imagen.

En el stack integrado, web y API comparten `PUBLIC_ORIGIN`; el proxy publica
HTTPS. El build Docker escribe `version.json`, utilizado por el healthcheck.
Para actualizar, usar `deploy/mysql/manage.sh update` según el README del
servidor y mantener la misma revisión entre las imágenes.

La pantalla de login procede de `deploy/keycloak/themes/itecsa/`, no de una
página React. Una modificación del tema exige actualizar la imagen Keycloak o
el tema de la instalación externa según corresponda; reconstruir solo la web
no actualiza las pantallas de autenticación.

## 7. Convenciones y verificación

Reutilizar componentes compartidos, variables de `src/styles/`, CSS Modules,
Toast, diálogos y flujos de PIN. Mantener accesibilidad por teclado, foco visible,
nombres accesibles y adaptación a escritorio, tablet y móvil. Las operaciones
deben conservar sus estados de carga, error, vacío y deshabilitado.

Después de modificar las fuentes ejecutar lint y build. Para la aceptación en
la LAN comprobar también login/logout, renovación, permisos por rol, primer
acceso, PIN, recuperación, navegación directa y recarga de rutas. Revisar
Kanban y sus acciones, registro, pagos, historial, calendario, mensajes, informes
y usuarios con datos autorizados del entorno. La compilación no acredita por
sí sola el funcionamiento del servidor, de Manager ni la confianza de la CA.

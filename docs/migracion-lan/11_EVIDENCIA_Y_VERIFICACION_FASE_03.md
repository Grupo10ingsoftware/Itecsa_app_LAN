# Fase 03: vistas, navegación y verificación

Fecha local: **24-10-2026**. Rama empresarial `POC/KEYCLOAK`. Base limpia: **`9bb41e9bb93e50e730a6ad7b873dfd8c68dd9498`**, commit de fase 02 creado por petición expresa del equipo, sin push. La ejecución termina en fase 03; no se inició 04. Estado: **implementada y aprobable en laboratorio**, pendiente revisión humana, commit de estos cambios y aceptación empresarial. No se declara un despliegue realizado.

## Resultado y frontera

Soporte entra a `/admin/usuarios` con perfil y mensajes propios, sin permisos de pedidos, pagos, calendario o métricas. Su pantalla informa que la administración de cuentas aún no está habilitada. No consulta usuarios, inventa conteos ni ofrece operaciones que siguen pendientes de 06–07. Desarrollador dispone de las vistas de sus 24 capacidades, incluidas métricas, y no tiene Usuarios. AP/AV/AC pierden únicamente la entrada administrativa que retiró la matriz aprobada. Los restantes permisos funcionales se conservan según [07](07_DECISIONES_APROBADAS.md); no se modifica esa matriz.

El callback conserva un retorno interno como estado de `/`; `ProtectedRoute` espera la identidad verificada y el inicio resuelve si puede abrirse ese destino. Login autenticado y rutas desconocidas conducen al inicio permitido. Un retorno prohibido o externo no concede una vista. «Acceso denegado» permanece estable ante una prohibición legítima, con botón hacia el inicio propio; un reintento utiliza la nueva identidad que devuelve el backend. Cancelar Solicitudes/Incidentes vuelve al inicio propio. El PIN pendiente continúa llevando a Perfil.

El servidor sigue siendo la autoridad. Los siete endpoints administrativos autentican y autorizan antes de devolver indisponibilidad Keycloak: **401** sin sesión válida, **403** sin capacidad, **503** para nuevo Soporte autorizado. Ninguno entra al servicio Auth0 o valida/escribe PIN en esa rama cerrada.

## Archivos y símbolos

Rutas relativas a la raíz empresarial; los archivos 01–05 y la evidencia 08/10 permanecen históricos.

| Archivo / grupo | Símbolo o cambio concreto |
|---|---|
| `capaVista/src/config/navigationAccess.js` (nuevo) | `ROUTE_ACCESS`, `homeForIdentity`, `resolvePostLoginPath`: reutilizan menú/capacidades canónicas y política por proveedor, incluyendo alias y detalles |
| `capaVista/src/config/routes.js` | Retira listas de roles antiguas redundantes de Usuarios/Métricas; la capacidad efectiva ya limita el rol |
| `capaVista/src/app/router.jsx` | `HomeRedirect`, `UsersEntry`, `UnknownRouteRedirect`; conserva lazy loading y guards de módulos |
| `capaVista/src/app/providers/AppProviders.jsx` | `handleRedirectCallback`: guarda destino interno y espera verificación en la raíz; no cambia SDK ni protocolo |
| `capaVista/src/modules/auth/pages/{LoginPage,AccessDeniedPage}.jsx` | Retorno autorizado, inicio propio, denegación estable y reintento con identidad actualizada; sin rediseñar login |
| `capaVista/src/modules/users/pages/SupportHomePage.jsx` (nuevo) | Entrada protegida de Soporte con disponibilidad real y enlaces a perfil/mensajes |
| `capaVista/src/config/roles.js`, `shared/components/data/RoleBadge.jsx` | Etiqueta reconocida según proveedor, incluido Desarrollador; catálogo Auth0 preservado |
| `capaVista/src/modules/profile/{components/ProfileSummary,pages/ProfilePage}.jsx` | Pasa proveedor a etiqueta; oculta debug de PIN en Keycloak, cerrado ya por backend en 02 |
| `capaVista/src/modules/privacy/components/DataRequestForm.jsx`, `modules/security/components/IncidentReportForm.jsx` | Cancelar vuelve a `/`, que selecciona inicio autorizado |
| `capaVista/src/shared/components/layout/{AppLayout,Topbar}.jsx` | Relación accesible del botón móvil con sidebar y estado expandido; conserva estilos responsive |
| `capaVista/src/shared/components/navigation/NavigationMenu.jsx` | Retira ocultación global de Usuarios Keycloak; filtra por capacidad efectiva |
| `capaServidor/src/modules/users/routes/adminUsers.routes.js` | `requireAvailableAdministration` después de autenticación/capacidad y antes de PIN/controladores |
| `capaServidor/test/keycloak.navigation.test.js` (nuevo) | Dos escenarios HTTP con routers/middleware reales, identidad y controladores sintéticos |
| `capaServidor/test/keycloak.real.integration.test.js` | Amplía laboratorio existente con routers de vistas/administración y cambios locales de cada rol |
| `capaVista/test/navigation.{expected.js,cases.jsx,browser.html,browser.jsx}` (nuevos) | Expectativa literal, SSR y navegador con router/componentes/CSS reales |
| `capaVista/test/{run.mjs,authSession.browser.jsx}` | Ejecuta SSR nuevo; fixture de sesión incorpora prueba de proveedor/política exigida en 02 y nueve roles |
| `scripts/keycloak-phase03-browser.mjs` (nuevo) | Vite desechable y navegador headless con perfil propio; CDP fija ambos tamaños y ejecuta cinco pasadas |
| `docs/migracion-lan/{06,07,09}` y este `11` | Estado, autorización, matriz acumulada, evidencia e instrucciones |

No hay cambios de dependencias, lockfiles, esquema Prisma, SQL, Dockerfiles/Compose, workflows, `.env`, servicios de negocio o persistencia empresarial. `shared/authorization.js`, `shared/keycloakAuthorization.js` e `identityAuthorization.js` se reutilizan íntegros. Se conserva `auth0Management.service.js`, SDK Auth0, Actions/templates y pruebas Auth0. Los archivos comunes de navegación adaptados conservan su rama Auth0; no se afirma que todos los archivos comunes sean idénticos.

## Matriz de vistas: esperado / observado

AP/AV/AC: administradores de Producción/Ventas/Cobranzas; OP/OV/OC: sus operarios; G: Gerencia; D: Desarrollador; S: **nuevo** Soporte. `P/P`: permitido esperado y permitido observado. `D/D`: denegado esperado y denegado observado, redirección estable a `/access-denied`. Todas las celdas se observaron con router real en **ambos tamaños**; requieren identidad verificada, capacidad efectiva y PIN activo. Aquí «permitido» acredita entrada a la vista, no éxito de sus operaciones de negocio.

| Ruta | AP | AV | AC | OP | OV | OC | G | D | S |
|---|---|---|---|---|---|---|---|---|---|
| `/kanban` | P/P | P/P | P/P | P/P | P/P | P/P | P/P | P/P | D/D |
| `/pagos` | D/D | D/D | P/P | D/D | D/D | P/P | D/D | P/P | D/D |
| `/ordenes/nuevo` | D/D | P/P | D/D | D/D | P/P | D/D | D/D | P/P | D/D |
| `/historial-pedidos` | P/P | P/P | P/P | P/P | P/P | P/P | P/P | P/P | D/D |
| `/historial-pedidos/17` | P/P | P/P | P/P | P/P | P/P | P/P | P/P | P/P | D/D |
| `/calendario-produccion` | P/P | P/P | D/D | D/D | P/P | D/D | D/D | P/P | D/D |
| `/metricas` | P/P | D/D | D/D | D/D | D/D | D/D | P/P | P/P | D/D |
| `/admin/usuarios` | D/D | D/D | D/D | D/D | D/D | D/D | D/D | D/D | P/P |
| `/admin/usuarios/nuevo` → Usuarios | D/D | D/D | D/D | D/D | D/D | D/D | D/D | D/D | P/P |
| `/admin` → Usuarios | D/D | D/D | D/D | D/D | D/D | D/D | D/D | D/D | P/P |
| `/perfil` | P/P | P/P | P/P | P/P | P/P | P/P | P/P | P/P | P/P |
| `/mensajes` | P/P | P/P | P/P | P/P | P/P | P/P | P/P | P/P | P/P |
| `/mensajes/42` | P/P | P/P | P/P | P/P | P/P | P/P | P/P | P/P | P/P |
| `/documentos` | P/P | P/P | P/P | P/P | P/P | P/P | P/P | P/P | P/P |
| `/solicitudes` | P/P | P/P | P/P | P/P | P/P | P/P | P/P | P/P | P/P |
| `/reportar-incidente` | P/P | P/P | P/P | P/P | P/P | P/P | P/P | P/P | P/P |

Los alias administrativos llevan a la misma entrada, no habilitan un formulario de alta Keycloak. Documentos/Solicitudes/Incidentes siguen disponibles a cualquier sesión válida, según el diseño previo. Perfil y mensajes exigen su permiso propio. Los enlaces de menú visibles son exactamente las siete rutas principales permitidas de esta matriz; no hay enlaces de detalle. La barra superior mantiene perfil y mensajes propios para los nueve roles.

| Rol | Inicio esperado / observado | Escritorio / móvil | Expiración y cambio de rol |
|---|---|---|---|
| AP | `/kanban` / `/kanban` | Pasa / pasa | Pasa en ambos tamaños |
| AV | `/kanban` / `/kanban` | Pasa / pasa | Pasa en ambos tamaños |
| AC | `/kanban` / `/kanban` | Pasa / pasa | Pasa en ambos tamaños |
| OP | `/kanban` / `/kanban` | Pasa / pasa | Pasa en ambos tamaños |
| OV | `/kanban` / `/kanban` | Pasa / pasa | Pasa en ambos tamaños |
| OC | `/kanban` / `/kanban` | Pasa / pasa | Pasa en ambos tamaños |
| G | `/kanban` / `/kanban` | Pasa / pasa | Pasa en ambos tamaños |
| D | `/kanban` / `/kanban` | Pasa / pasa | Pasa en ambos tamaños |
| S | `/admin/usuarios` / `/admin/usuarios` | Pasa / pasa | Pasa en ambos tamaños |

El browser inyecta contextos de identidad verificada para aislar navegación; la prueba de sesión separada monta `AuthProvider` real. Los paths de la matriz se abren directamente en `MemoryRouter`, sin depender de enlaces del menú; esto no acredita una recarga completa con SSO empresarial para cada URL. Al cambiar rol se retira una vista previamente permitida, se muestra denegación y se comprueba el inicio del nuevo rol. En MySQL real se cambia cada rol local conservando su JWT anterior: `/verify` devuelve 403; el fixture se restaura en `finally`. La expiración de UI/routers se inyecta como sesión inválida; firma/expiración de JWT se cubren además en la regresión 02 con firmas locales. No se esperó la expiración de nueve sesiones del realm real.

## Matriz HTTP y efectos

| Endpoint real | Roles con acceso esperado y observado | Resultado |
|---|---|---|
| GET `/orders/kanban` | Todos salvo S | 204 con controlador sintético; restantes 403 |
| GET `/orders/calendar-summary` | AP, AV, OV, D | Igual |
| GET `/orders/payments` | AC, OC, D | Igual |
| GET `/orders/sales-notes/NV1` | AV, OV, D | Igual |
| GET `/history/orders`, `/history/orders/17` | Todos salvo S | Igual |
| GET `/metrics/summary`, `/metrics/production-performance` | AP, G, D | Igual |
| GET `/messages`, `/messages/42` | Los nueve | 204 con controlador sintético |
| Siete operaciones de `/admin/users` | Solo S tiene capacidad | S: 503 sin ejecutar servicio; otros ocho: 403 |

Las operaciones administrativas son GET listado, GET summary, GET movimientos, POST alta, POST password-setup-email, PATCH usuario y PATCH estado. Se ejecutan 63 decisiones por rol; no hay escrituras de negocio. Diez endpoints de vistas generan 90 decisiones, más 180 rechazos por permisos vacíos/sesión expirada, con contadores que confirman que los rechazos no invocan controladores. Administración comprueba además 401 anónimo, nueve sesiones expiradas 401 y Soporte sin capacidad 403: 11 adicionales. Los claims excesivos de la prueba HTTP no amplían el rol.

El laboratorio real repite las 90+63 decisiones con tokens firmados por Keycloak, JWT/JWKS reales e identidad/estado en MySQL efímero. Los controladores de negocio de esas vistas son dobles que responden 204; **no** se declara probada la consulta SQL o transacción de cada módulo. La prueba original de 225 capacidades, PKCE, refresh, roles antiguos/múltiples, concurrencia y reinicio se mantiene.

## Resultados finales y fallos conservados

| Verificación | Resultado |
|---|---|
| Backend completo seguro | **1115 contabilizadas; 1111 aprobadas, 4 omitidas, 0 fallos** |
| Frontend completo | 51 node:test, SSR previo, 251 verificaciones de 02 y **411 nuevas** de navegación aprobadas, incluidos ocho menús Auth0 de referencia |
| Navegador Brave, CDP Chrome/156.0.8078.48 | **243** comprobaciones a 1440×1000; **243** a 390×844; 144 URLs por tamaño, sin errores JS |
| Regresiones browser originales | Sesión/adapter, métricas y PIN: PASS |
| Keycloak 26.8.1 + MySQL 8.4.13 | 16 aprobadas iniciales y 2 tras reinicio; sin omisiones |
| Scripts unitarios | 25 aprobadas |
| ESLint / build producción | Exit 0 / exit 0; Vite 8.0.16, 564 módulos; chunk principal 499,03 kB |
| Sintaxis y documentos | 146 fuentes/scripts y dos tests backend sin errores; enlaces locales válidos en 70 documentos; diff sin errores |
| Integridad contra base limpia | 587 hashes: 21 archivos previstos modificados, 566 intactos; nueve archivos nuevos de 03; sin cambios de esquema, dependencias, políticas compartidas o evidencia histórica 01–05/08/10 |
| Limpieza Docker | Sin contenedores de 02/03 ni redes del laboratorio; API/web preexistentes siguen en ejecución |

La comprobación final del repositorio universitario conserva HEAD `88bcb972c29e34a9d92cc15fb584fc4211af265f` y únicamente su auditoría maestra previamente no versionada. El índice empresarial está vacío y HEAD sigue siendo `9bb41e9`; no se preparó un commit automático de 03.

Las cuatro omitidas son las tres suites físicas MySQL anteriores y la integración Keycloak opt-in que sí se ejecutó separadamente. Las 16+2 contabilizaciones reales incluyen padres; los nuevos checks están dentro de los nueve subtests existentes. No son 18 escenarios de negocio nuevos. El build solo avisó que su salida temporal estaba fuera de la raíz; Prisma mantuvo su advertencia previa de detección OpenSSL y completó DDL/consultas.

| Ensayo | Fallo o discrepancia | Corrección y evidencia |
|---|---|---|
| Pruebas iniciales antes de implementar | Helper de navegación ausente; router administrativo dejaba alcanzar el doble de servicio para identidad Keycloak inyectada | Implementar navegación y gate por identidad autenticada después de autorización. Ambos tests pasan |
| Revisión estática de UI | Kanban fijo, lista antigua excluía D de métricas, etiqueta de D desconocida, Soporte Keycloak oculto | Inicio por capacidad, retirar filtros redundantes, etiqueta por proveedor y entrada protegida de Soporte |
| Harness de navegador inicial | Pestaña CDP aún ausente y comprobaciones sobre una transición anterior | Crear pestaña explícitamente; esperar nueva key de ubicación y estado visible final |
| Fixtures de formularios/logout | 503 sintético ocultaba Solicitudes; el test no confirmaba el modal existente de logout | Configuración sintética de canales y confirmación del modal. No alterar los componentes para eludir el flujo |
| Fixture previo de sesión | Referencia de ocho roles y respuestas sin evidencia de proveedor/política exigida en 02 | Actualizar únicamente los datos de prueba Keycloak a su contrato real; se mantienen los rechazos y referencia Auth0 |
| ESLint durante desarrollo | Regex con controles y observación de estado en render | Validación explícita de caracteres y observación del harness en efecto; lint final sin advertencias |

El incidente original `refresh_token=undefined` continúa **abierto para el entorno del usuario**. El adapter real sí genera Code+PKCE/callback/refresh frente a un servidor sintético en su fixture, y Keycloak real acepta refresh en el laboratorio HTTP. Son evidencias separadas: no prueban que el navegador, adapter, API y realm empresariales funcionen juntos ni identifican por sí solas la causa original.

## Verificación paso a paso

### 1. Revisar el commit y los cambios nuevos

Desde PowerShell en la raíz empresarial:

```powershell
git log -2 --oneline
git show --stat 9bb41e9
git status --short
git diff --check
```

Debe verse el commit 02 `9bb41e9` y los cambios 03 todavía locales, sin commit automático adicional. No hay push ni cambios universitarios. La matriz de roles completa sigue en [07](07_DECISIONES_APROBADAS.md).

### 2. Repetir el navegador sin tocar la aplicación actual

Requiere Docker Desktop, Node local con WebSocket (comprobado 24.19.0), un Chromium/Brave/Edge y la imagen web local fijada a digest en [10](10_EVIDENCIA_Y_CONFIGURACION_FASE_02.md). El script no instala paquetes ni descarga imágenes; falla si falta el requisito. El digest local identifica exactamente el artefacto usado en este equipo, no es una imagen publicada portable.

```powershell
node scripts/keycloak-phase03-browser.mjs --run
```

Detecta Brave en LocalAppData o Edge en Program Files. Para otro ejecutable se puede definir `ITECSA_BROWSER_BIN` con su ruta completa en esa consola. Crea un Vite de laboratorio con fuentes/test/shared de solo lectura y `envDir:false`, puerto aleatorio publicado únicamente en `127.0.0.1`, perfil headless propio y cinco pasadas. No utiliza los puertos actuales 3000/5173. El perfil y contenedor propios se eliminan al finalizar. No abre una ventana visible ni usa cookies/sesiones personales.

Salida esperada:

```text
navigation 1440x1000: PASS {"checks":243,...,"directUrls":144,"api":"synthetic","errors":0}
navigation 390x844: PASS {"checks":243,...,"directUrls":144,"api":"synthetic","errors":0}
authSession 1440x1000: PASS {}
metrics 1440x1000: PASS {}
paymentPin 1440x1000: PASS {}
```

Se comprueba abrir/cerrar menú móvil al navegar, contraer/expandir escritorio, enlaces superiores, 16 URLs por cada rol, destinos de login/ruta desconocida, denegaciones estables, expiración y cambio de rol para cada rol, PIN pendiente, cancelación de formularios y logout confirmado. Los datos de negocio responden errores sintéticos controlados; la prueba no ejecuta ventas/pagos reales.

### 3. Repetir identidad y autorización con Keycloak/MySQL reales de laboratorio

Se reutilizan imágenes/digests y contrato de [10](10_EVIDENCIA_Y_CONFIGURACION_FASE_02.md):

```powershell
node scripts/keycloak-phase02-lab.mjs --run
```

Su nombre conserva la procedencia de 02; ejecuta el test de integración ampliado de 03. Esperar 16 aprobadas en initial, 2 en restart y `Laboratorio completo`. Usa red interna, sin puertos publicados, MySQL tmpfs, realm y cuentas exclusivamente sintéticos. No importa el fixture sobre el realm real. No ejecutar los flags de integración manualmente dentro de los contenedores empresariales.

### 4. Repetir regresión completa y calidad

Usar los comandos de contenedores aislados y montajes de solo lectura de [10](10_EVIDENCIA_Y_CONFIGURACION_FASE_02.md), que ya apuntan al código actual. En ellos ejecutar:

```text
# Contenedor API aislado, flags externos en false:
npm test -- --test-concurrency=4
node --test test/keycloak.navigation.test.js

# Contenedor web aislado, sin .env:
npm test
npm run lint
npm run build -- --outDir /tmp/itecsa-phase03-build
```

Para el build fijar NODE_ENV=production en ese contenedor temporal. No usar `docker compose exec api npm test`, porque heredaría la configuración real. La suite focal HTTP ya forma parte de la suite completa; no se suma de nuevo al total.

Desde la raíz, las comprobaciones de scripts/documentos no acceden a infraestructura:

```powershell
node --test scripts/check-docs.test.mjs scripts/deploy-northflank.test.mjs scripts/keycloak-phase02-realm.test.mjs
node scripts/check-docs.mjs
git diff --check
```

### 5. Revisar manualmente una instalación de pruebas ya configurada

Esta fase no modifica ni arranca el entorno empresarial. Para una aceptación manual conjunta primero se necesita una instalación de pruebas con frontend/API de este árbol, contrato de realm de 02 revisado, correspondencia de sujetos y nueve cuentas sintéticas. Debe distinguirse el rol de cliente nuevo del antiguo Soporte de realm. No se ofrecen credenciales empresariales ni se presupone que las existentes tengan los roles nuevos.

1. Iniciar sesión con cada rol y comparar su menú, inicio y URL directa con la matriz anterior.
2. Para Soporte comprobar `/` y login con `from=/kanban`: termina en Usuarios; Kanban/Métricas por URL directa muestran acceso denegado estable; «Ir a mi inicio» vuelve a Usuarios. Perfil y mensajes se mantienen disponibles.
3. Para Desarrollador abrir Métricas y las vistas de negocio; Usuarios y sus alias deben denegarse. Repetir Usuarios con AP/AV/AC: menú ausente y URL denegada.
4. En móvil abrir el menú, navegar y comprobar que se cierra. En escritorio contraer/expandir y volver a navegar.
5. Invalidar o cambiar el rol **solo de una cuenta sintética** en ese laboratorio y renovar/verificar la sesión: no debe conservar la vista ni los permisos anteriores. Comprobar logout y el destino de sesión expirada.
6. En Red, una llamada administrativa con identidad válida sin capacidad debe devolver 403; Soporte 503 por servicio pendiente. No invocar endpoints mutantes sobre datos reales. No copiar tokens ni contraseñas a informes.

## Fuentes oficiales y versiones

Se consultaron exclusivamente fuentes oficiales para los mecanismos utilizados. [Keycloak JavaScript adapter](https://www.keycloak.org/securing-apps/javascript-adapter) documenta Code Flow, callbacks, `updateToken` y tokens en memoria; [Auth0: validar access tokens](https://auth0.com/docs/secure/tokens/access-tokens/validate-access-tokens) distingue validación de la API y permisos. Esta fase conserva esos límites: mostrar/ocultar UI no sustituye autorización del servidor.

Para matching y navegación se contrastaron [React Router v7: matchPath](https://reactrouter.com/7.18.4/api/utils/matchPath) y [Navigate](https://reactrouter.com/7.18.4/api/components/Navigate). La documentación v7 accesible corresponde a 7.18.4; no se afirma que sea idéntica al paquete instalado. La web latest ya indica 8.5.0. **Declarado** `react-router-dom ^7.15.1`; **resuelto e instalado en imagen de pruebas** 7.18.2, comprobado con lockfile y `npm ls`. Las pruebas ejecutan esa instalación sin actualizarla. React 19.2.6, Auth0 React 2.17.0, keycloak-js 26.2.4 y Vite 8.0.16 se confirmaron en la imagen. Versión del servidor de laboratorio: Keycloak 26.8.1; versión desplegada empresarial: no acreditada.

## Pendientes, reversión y entrega

Sigue pendiente configurar/desplegar la instalación empresarial y validar el incidente de refresh allí, los tres ensayos físicos MySQL originales, aceptación conjunta en puestos LAN, configuración DNS/HTTPS/CA, bootstrap/roles privilegiados, usernames, preservación de datos y futuros servicios administrativos/credenciales/recuperación. Cambiar Auth0 no acredita funcionamiento integral sin Internet: Aiven, Resend/PIN, fuente Manager y canales externos mantienen sus condicionantes. La simulación responsive no reemplaza probar navegadores móviles físicos.

La reversión de 03 consiste en conservar una copia de sus cambios revisables y restaurar únicamente los archivos de esta fase desde `9bb41e9`, tras confirmar que no hay trabajo ajeno. No ejecutar `reset --hard`, `clean` ni revertir 02 por defecto. Si 03 se versiona después, revertir ese commit específico mediante revisión. No hay cambios de datos/realm/esquema de 03 que deshacer. El orquestador elimina únicamente recursos etiquetados propios; no toca servicios preexistentes.

La entrega responde los 13 puntos del encargo: 00/01 conservadas y verificadas en regresión; matriz final sin cambios en 07; cambios y correcciones en este informe; comandos/resultados y fallos anteriores registrados; Auth0 preservado; componentes Keycloak reutilizados; configuración manual 02 sin ejecutar; riesgos anteriores explícitos; **para iniciar 04 se requiere revisión y autorización expresa**. Esta fase no concede acceso empresarial ni aprueba decisiones pendientes por inferencia.

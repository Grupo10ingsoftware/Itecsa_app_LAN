# Usuarios y auditoría del Keycloak Ubuntu real

Fecha: 25-10-2026. Repositorio `Itecsa_app_LAN`, rama `POC/KEYCLOAK`, base `ad41e54`, con modificaciones locales anteriores conservadas. Este informe se añade sin sobrescribir los informes históricos. No hay commit, push, despliegue definitivo ni avance a fase 07.

**Alcance vigente:** la aclaración posterior del equipo reemplaza la petición inicial de MySQL aislado. Las nueve cuentas están en el Keycloak Ubuntu existente y sus identidades locales en **Aiven `mydb` existente**. No se creó otro MySQL, otro Keycloak, una copia de Aiven ni datos comerciales sintéticos. Las regresiones unitarias se distinguen de las comprobaciones reales.

## 1. Instancia y respaldo comprobados antes de crear cuentas

SSH se realizó a `itecsaadmin@10.20.30.10` mediante `pivotadmin@100.105.202.35`. `kc.sh --version` devolvió **Keycloak 26.8.1**, Java 21.0.12.1. Instalación: `/home/itecsaadmin/servicios/keycloak-26.8.1`, almacenamiento H2 existente. Se reutilizó el túnel local 18080 hacia Ubuntu 8080; no se inició un Keycloak Docker.

Antes de crear las cuentas se leyó el manifest del respaldo frío anterior, se comprobaron `consistent=true` y `recoveryVerified=true` y se volvió a calcular el SHA-256 de `installation.tar`: `17569d34f43183a35fc44493bd70e47c749463224df72b280c78c8e432407292`. Ubicación: `/home/itecsaadmin/respaldos-keycloak/fase065-20261025T062510Z`. La recuperación corresponde al ejercicio anterior documentado en 06.5; en esta tarea se comprobó su archivo/manifest/checksum, sin restaurar otra copia ni parar Keycloak.

El respaldo es anterior a las últimas configuraciones y a estas nueve cuentas: no se presenta como una copia actualizada posterior a esta tarea. La copia restaurada anterior sigue retirada.

## 2. Nueve cuentas solicitadas

Se usan los nombres técnicos sin tildes del catálogo canónico. No se fabricaron correos. Todas tienen `enabled=true`, estado local `Activo`, un único rol directo del cliente `itecsa-api-v1`, el marcador administrativo de procedencia y un vínculo por UUID. No reciben roles internos de `realm-management`.

| Username | Rol técnico | PK Aiven | UUID Keycloak | Capacidades esperadas |
|---|---|---:|---|---:|
| admin.produccion.prueba | Administrador Produccion | 27 | 1c5bd836-21a9-4762-b334-f6ac15c4b2a2 | 18 |
| admin.ventas.prueba | Administrador Ventas | 28 | 312c03d1-33da-4d2b-a16e-fb59c24d4bbe | 10 |
| admin.cobranzas.prueba | Administrador Cobranzas | 29 | b682699d-776e-4ac9-be50-31e3fb2d3058 | 9 |
| operario.produccion.prueba | Operario Produccion | 30 | 8880719b-9e4d-488a-8aee-4c9b311b4277 | 8 |
| operario.ventas.prueba | Operario Ventas | 31 | 880839c2-197e-47a5-8a6a-1559a150ad61 | 10 |
| operario.cobranzas.prueba | Operario Cobranzas | 32 | 5b215496-4133-4315-848e-2cd4cfa3e37b | 8 |
| gerencia.prueba | Gerencia | 33 | d66bc9e0-4193-434d-9369-5637eb5a2b8b | 7 |
| desarrollador.prueba | Desarrollador | 34 | bdfb0228-7e0c-49a3-b07d-0c5effa001f7 | 24 |
| soporte.prueba | Soporte | 35 | 525d52a7-256a-400c-a530-96aa40ca9510 | 5 |

La primera vinculación SQL agotó el timeout de la transacción y se revirtió. Se repitió con una transacción de 120 segundos, sin recrear cuentas Keycloak ni adoptar usuarios existentes. Los saltos de autoincremento no acreditan duplicados: el resultado confirmado son estas nueve filas/vínculos nuevos.

## 3. Usuarios anteriores y procedencia

Se encontraron **tres** usuarios humanos previos, no dos. Se conservaron `prueba.producción` (`4a32aa57-6639-4a32-aa61-8eb6f5c45008`, habilitado), `itecsa-a3722bc7-e82e-46d6-8019-2fde8389c57b` (`ae9d71cb-77f1-4c8f-989c-a606be9e7742`, deshabilitado) e `itecsa-c897ab47-a9da-4941-ba77-f920403d4fdf` (`852ea39b-009a-4ece-919f-2d73d6c068e0`, deshabilitado).

Durante esta tarea no se escriben sus perfiles, passwords, estados ni role mappings. Se comparan sus representaciones y mappings antes/después. Sus asignaciones canónicas ya se habían modificado en la tarea anterior de integración, según [15](15_EVIDENCIA_INTEGRACION_FASE_06_5.md); no se oculta esa diferencia histórica.

Antes de cada alta se busca el username exacto. Una colisión sin el marcador privado de esta ejecución se rechaza; no se sobrescribe. En una repetición se reconoce exclusivamente el UUID/marcador ya registrado por este procedimiento, sin resetear contraseñas ni crear otra fila. MySQL comprueba UUID, issuer, username, rol y PK dentro de una transacción. No hay conciliación por nombre o correo.

## 4. Entrega privada de credenciales

Archivo local, fuera del repositorio y de carpetas sincronizadas:

`C:\Users\overminne\AppData\Local\ITECSA\verificacion-ubuntu\credenciales.json`

Se creó primero el directorio con herencia de permisos desactivada y acceso exclusivo `OVERMINE\overminne`; después se generaron las credenciales. Cada contraseña utiliza 24 bytes aleatorios más un prefijo que incluye mayúsculas, minúsculas, dígito y símbolo. No se comparte una contraseña entre cuentas.

El operador puede abrir el archivo con el Bloc de notas desde el Explorador. Cada entrada contiene `username`, `role` y `password`; las cuentas que ya aceptaron su PIN tienen también `pin`, guardado únicamente allí. `verificationPassword` y `passwordChangePlanned`, si aparecen durante una ejecución interrumpida, son datos del diario privado de cambio, no contraseñas para copiar al informe. El procedimiento reconcilia ese estado antes de entregar las credenciales finales. No publicar el archivo ni adjuntarlo a incidencias.

Las cuentas nacieron con password temporal y `UPDATE_PASSWORD`. El cambio se realizó en el formulario de **Keycloak**, no en un flujo ITECSA de fase 09. Después de comprobarlas se volvió a exigir `UPDATE_PASSWORD` únicamente en estas nueve cuentas, sin resetear la contraseña ya verificada. El archivo privado contiene la contraseña actual correcta y el PIN de cada cuenta; ya no contiene cambios pendientes ni `verificationPassword`. Al iniciar manualmente deberán elegir su nueva contraseña. No se declara implementada la fase 09 por utilizar una acción estándar del proveedor.

## 5. Relación con MySQL y contrato actual de identidad

Se conserva la base real `itecsabddev-itecsabd.l.aivencloud.com:17305/mydb`, TLS `required` y CA existente. Solo se insertan las nueve identidades solicitadas: `Usuario.id_auth0=UUID Keycloak` para compatibilidad con los consumidores actuales, la columna existente `id_keycloak=el mismo UUID`, y `ExternalIdentity(provider=keycloak, issuer, subject, username, user_id)`.

No se modifican pedidos, pagos, clientes, históricos, estados productivos ni usuarios históricos Auth0 para vincular estas cuentas. `id_usuario` sigue siendo la PK que mantiene las relaciones históricas. La preparación, entrega y aceptación del PIN se realiza únicamente sobre las cuentas nuevas propias.

**Límite:** `ExternalIdentity` no es todavía el resolver universal de todos los consumidores. Parte del código sigue buscando por `id_auth0`. Estos nueve vínculos satisfacen ese contrato actual; no demuestran una migración automática de las filas `auth0|...` ni de los usuarios previos cuyo `id_auth0` sea nulo.

## 6. Matriz aprobada de vistas y permisos

AP/AV/AC: administradores Producción/Ventas/Cobranzas. OP/OV/OC: sus operarios. G: Gerencia. D: Desarrollador. S: nuevo Soporte. La matriz procede de `shared/keycloakAuthorization.js`, sin ampliar permisos para validar accesos.

| Vista o función | AP | AV | AC | OP | OV | OC | G | D | S |
|---|---|---|---|---|---|---|---|---|---|
| Kanban, historial y lectura de capacidad | Sí | Sí | Sí | Sí | Sí | Sí | Sí | Sí | No |
| Registrar órdenes / notas de venta | No | Sí | No | No | Sí | No | No | Sí | No |
| Cobranza / confirmar pago | No | No | Sí | No | No | Sí | No | Sí | No |
| Revisar estado de pago | No | No | Sí | No | No | No | No | Sí | No |
| Calendario | Sí | Sí | No | No | Sí | No | No | Sí | No |
| Métricas | Sí | No | No | No | No | No | Sí | Sí | No |
| Iniciar producción, capacidad y carga | Sí | No | No | No | No | No | No | Sí | No |
| Mover producción / completar subprocesos | Sí | No | No | Sí | No | No | No | Sí | No |
| Revertir subprocesos / etiquetas / revisión | Sí | No | No | No | No | No | No | Sí | No |
| Administración de identidad de fase 06 | No | No | No | No | No | No | No | No | Sí |
| Perfil, PIN y mensajes propios | Sí | Sí | Sí | Sí | Sí | Sí | Sí | Sí | Sí |

La capacidad de mover órdenes no elimina las restricciones de transición/estado dentro del servicio. Las lecturas comunes de pedidos/capacidad están aprobadas para ocho roles; no equivalen a administrar otro departamento. Soporte tiene exactamente `read:own-profile`, `manage:own-pin`, `read:own-messages`, `update:own-messages`, `manage:users`. Desarrollador tiene 24 capacidades y no recibe `manage:users`.

## 7. Método de comprobación real por cuenta

`scripts/keycloak-ubuntu-browser.mjs` abre Brave real con un perfil vacío para no alterar las sesiones del navegador habitual. Esto es separación de sesiones del navegador, no otra aplicación, base o Keycloak. No se clona el perfil del operador ni se desactiva la seguridad del navegador.

Las credenciales solo se leen en memoria desde el archivo privado. Se utiliza el formulario real de Keycloak, Authorization Code y PKCE, y el formulario de cambio obligatorio. La respuesta firmada pasa por el middleware JWT real y el usuario local de Aiven. Se comprueban issuer, audience, azp, sub, rol único, lista exacta de capacidades, ausencia de roles administrativos internos, `/auth/verify`, landing, menús, rutas, recarga y logout.

Las lecturas HTTP incluyen Kanban, calendario, pagos, historial, métricas con fechas válidas, capacidad, carga, mensajes y notificaciones. Se espera 200 cuando el rol tiene la capacidad y 403 cuando no la tiene. También se consulta la inspección de identidad de fase 06: Soporte 200; los demás 403.

Para conservar los datos reales, no se cambian pedidos, pagos ni avances productivos como ensayo. Sus mutaciones se comprueban con las regresiones existentes y se distinguen de la evidencia real de lectura/autenticación. Ninguna operación con mock se cuenta como escritura real sobre Aiven.

## 8. Servicios administrativos de fase 06

El servidor habitual monta `/api/admin/identity` con `IDENTITY_PREPARATION_ENABLED=true`. Endpoints existentes: `GET /identities/by-username/:username`, `GET /identities/:subject`, `POST /identities/prepare`, `POST /operations/:id/reconcile`. Exigen JWT, rol/capacidad y estado local; las mutaciones exigen PIN propio. Los destinos ordinarios son seis roles departamentales; G/D/S no son destinos del formulario ordinario.

Preparar significa crear una cuenta deshabilitada, con estado local Pendiente, sin credenciales, diario y conciliación. No significa activar una cuenta ni entregar una contraseña. Las nueve cuentas de esta tarea se habilitan mediante administración explícita solicitada, no mediante un flujo de fase 07 que no existe.

Los endpoints heredados `/api/admin/users...` y recuperación de password continúan devolviendo 503 en Keycloak por su gate. Esa limitación no se presenta como una gestión de usuarios completa. No se han eliminado los adaptadores ni el código Auth0.

## 9. Inventario observado del realm real

Realm `itecsa`, ID `5270f115-6a8d-4c1b-b193-b89a495bb2f2`, habilitado. SSL requerido `external`; registro público, recuperación por email, login por email y edición global de username desactivados. Access token: 300 segundos; SSO idle: 1800 segundos. `passwordPolicy` no tiene política explícita. No se endurece globalmente en esta tarea para no alterar el flujo de compañeros.

Realm Roles observados: `Gerencia`, `Administrador Ventas`, `Operario Ventas`, `Soporte`, `Administrador Cobranzas`, `Operario Cobranzas`, `Operario produccion`, `Administrador Produccion`, `default-roles-itecsa`, `offline_access`, `uma_authorization`. El `Operario produccion` histórico no se confunde con el rol canónico `Operario Produccion` del cliente nuevo. No se crean ni renombran esos realm roles. Grupos observados: **ninguno**.

Clientes observados: `account`, `account-console`, `admin-cli`, `broker`, `itecsa-api`, `itecsa-api-v1`, `itecsa-backend-admin`, `itecsa-web`, `realm-management`, `security-admin-console`: diez clientes. Los clientes temporales 06.5 ya se retiraron en la tarea anterior.

Hay 15 client scopes existentes: `AuthnContextClassRef`, `role_list`, `saml_organization`, `web-origins`, `offline_access`, `address`, `roles`, `service_account`, `email`, `microprofile-jwt`, `organization`, `profile`, `acr`, `basic`, `phone`. No se atribuye su creación a esta tarea. La SPA usa solo `basic` por defecto, sin opcionales, y sus mappers explícitos; el cliente técnico usa `roles`, sin opcionales.

## 10. Clientes, composites y protocol mappers

| Recurso | Estado real / atribución |
|---|---|
| `itecsa-api` | Preexistente con las 25 capacidades atómicas; se reutiliza. Su configuración heredada incluye `/*` y Full Scope Allowed; no se cambia en esta tarea. No es la SPA habilitada para login |
| `itecsa-api-v1` | Añadido por la integración anterior; nueve roles y nueve composites, cada uno con las capacidades exactas de su rol en `itecsa-api`. Bearer-only, sin Code/password grant ni service account |
| `itecsa-web` | Cliente preexistente modificado por la integración anterior. Público, Code + PKCE S256; sin implicit/password grant, sin service account, Full Scope Allowed=false |
| `itecsa-backend-admin` | Cliente preexistente reutilizado; confidencial, client credentials, sin login interactivo ni password grant. Full Scope Allowed=false. Grants y scope mappings administrativos explícitos, sin realm-admin |
| Clientes internos Keycloak | Se conservan; no se atribuyen a nuestro desarrollo |

Mappers de la SPA aplicados en la integración anterior y observados realmente:

| Nombre | Tipo | Fuente / resultado |
|---|---|---|
| Application roles | `oidc-usermodel-client-role-mapper` | `itecsa-api-v1` → `resource_access.itecsa-api-v1.roles`, multivalor String, access token |
| ITECSA permissions | `oidc-usermodel-client-role-mapper` | `itecsa-api` → `permissions`, multivalor String, access token |
| API audience | `oidc-audience-mapper` | Audience personalizada `https://api.itecsa.local`, access token |

No se incluyen esos claims en ID token/userinfo. Los scope mappings explícitos de la SPA contienen nueve roles canónicos y 25 capacidades. El backend exige cliente esperado, un único rol reconocido y vuelve a intersectar los permisos con la matriz.

El cliente técnico tiene cuatro grants directos: `query-users`, `view-users`, `manage-users`, `view-clients`. No deben confundirse con cuatro permisos efectivos aislados: `view-users` es composite de `query-groups` y `query-users`; `view-clients` incluye `query-clients`. Se observaron esas inclusiones internas realmente, sin `realm-admin`. Su secreto permanece en el `.env` backend, no se entrega al navegador ni a trabajadores. Es un poder administrativo del servidor distinto de la capacidad humana `manage:users`.

## 11. Qué cambió en repositorio, Docker y Ubuntu

**A. Repositorio:** las fases 00–06 añadieron política canónica, selección de proveedor, JWT/claims, navegación por capacidades, adaptador administrativo, preparación/conciliación y persistencia. La integración anterior montó la preparación en el servidor habitual y conectó los `.env` reales. Esta tarea añade procedimientos de altas idempotentes, inventario y comprobación Brave. El ensayo de URLs/CORS localhost se revirtió tras la decisión del operador: el estado final vuelve a 127, con el iframe original. La opción alternativa preparada y su test se retiraron. El código Auth0 sigue conservado y la aplicación real selecciona Keycloak.

**B. Docker histórico:** los fixtures anteriores creaban realm/clientes/cuentas y MySQL desechables. No eran una configuración automática del servidor Ubuntu. Aquellos contenedores, base clonada, usuarios `p065-*` y clientes de integración ya se retiraron. Las imágenes disponibles en caché no son servidores Keycloak/MySQL en ejecución.

**C. Ubuntu anterior, según el registro de ejecución:** se creó `itecsa-api-v1` y sus nueve composites; se añadió el marcador `itecsa_provision_id`; se configuraron mappers/scopes de la SPA y permisos del cliente técnico existente; se cambiaron URLs al origen 127; se asociaron los tres UUID previamente presentes en MySQL a sus roles canónicos. Hubo clientes/cuentas sintéticos que luego se eliminaron. No se reinstaló Keycloak ni se sustituyó el realm/H2.

**C. Ubuntu en esta tarea:** se crean únicamente las nueve cuentas solicitadas, sus contraseñas individuales temporales y sus role mappings. Se probaron Redirect URIs, Web Origins y postlogout de `itecsa-web` con los dos orígenes locales explícitos y, al cierre, se restauró exclusivamente 127 por decisión expresa del operador. No se cambian issuer, claves de firma, políticas globales, contraseñas ajenas o usuarios históricos. Los bindings nuevos se escriben en Aiven, no dentro de Keycloak.

**D. Pendiente:** creación/activación/entrega de credenciales desde ITECSA, recuperación y perfil definitivos, migración explícita de las personas Auth0, resolver general de identidad y definición de HTTPS/DNS compartido LAN. No queda pendiente la decisión de hostname: el operador eligió 127 con iframe. Localhost no se presenta como una dirección de login verificada.

Los admin events y user events del realm están desactivados. Por tanto, no existe una auditoría administrativa del proveedor que permita atribuir retrospectivamente todo cambio. La atribución anterior se basa en los comandos y documentos de esta sesión; la procedencia de ajustes preexistentes no demostrados queda **sin autoría confirmable**. El inventario actual no basta para atribuirlos al agente.

## 12. Reproducibilidad e idempotencia

`keycloak-ubuntu-contract.mjs` contiene el contrato canónico sin importar fixtures. `keycloak-ubuntu-configure.mjs --apply` exige clientes existentes, verifica la matriz y actualiza configuración; no importa un realm ni reemplaza usuarios. Es específico de este servidor y conserva supuestos explícitos sobre tres UUID anteriores. No es un instalador genérico ni un reconciliador de personas Auth0.

`keycloak-ubuntu-users.mjs create <directorio-privado>` crea únicamente usernames libres o reconoce cuentas propias por marcador/UUID. No vuelve a configurar una contraseña existente. Es idempotente en altas y vínculos en ejecuciones secuenciales; no ejecutar dos procesos que escriban el mismo diario privado simultáneamente. Las mutaciones HTTP no se reintentan automáticamente tras una respuesta perdida. Ante un conflicto de procedencia o resultado ambiguo se detiene. `audit` solo consulta; `canonical` restaura el origen 127 elegido; `arm` requiere cambio obligatorio exclusivamente en las nueve cuentas propias. Antes de leer/escribir credenciales, los procedimientos rechazan una ruta dentro del repositorio y comprueban propietario, ACL protegida y ausencia de permisos de lectura de otros usuarios.

Las lecturas del inventario son observaciones secuenciales, no una transacción global del realm compartido. Los archivos privados no se guardan en Git y no se publican como evidencia sin sanitizar. El subcomando de cierre es `canonical`, que restaura únicamente `http://127.0.0.1:5173`; no queda un comando que active el ensayo localhost.

## 13. Por qué se cambió localhost y qué ocurre ahora

`localhost` y `127.0.0.1` son ambos loopback y ambos usan HTTP en este entorno. Docker/Vite pueden servir ambos. El cambio anterior fue una decisión de configuración para que el hostname del frontend coincidiera con el del Keycloak público del túnel; no añadió HTTPS ni cifrado.

Para el navegador son **orígenes distintos**: almacenamiento de la aplicación separado, CORS/Redirect URIs distintos y tratamiento diferente de las cookies del iframe Keycloak. En la prueba de esta tarea se reprodujo el fallo desde localhost, mientras 127 permitió autenticación real. El SDK instalado comprueba `refreshToken`, espera la respuesta del iframe y luego intenta renovar; el iframe puede limpiar los tokens durante esa espera. Esa secuencia explica que el guard inicial no impida un `refresh_token=undefined` posterior. No se extrapola esa observación a todos los equipos.

Durante la investigación se ajustaron `compose.yaml`, ejemplos `.env`, `.env` reales, CORS del servidor y las URLs de `itecsa-web` para los dos orígenes locales. **Después el operador eligió «Conservar 127.0.0.1 y mantener el iframe».** Se revirtieron los ajustes diagnósticos de localhost: Redirect URIs final `http://127.0.0.1:5173/*`, Web Origin final `http://127.0.0.1:5173`, postlogout final `http://127.0.0.1:5173/*`. CORS y API base vuelven a 127. No se usa un wildcard global de SPA ni se cambia el issuer.

La [documentación oficial del adaptador](https://www.keycloak.org/securing-apps/javascript-adapter) explica la dependencia del iframe de cookies de terceros y el mecanismo alternativo basado en tokens/renovación cuando no está disponible. Ese mecanismo conserva validación de tokens, pero cambia el tiempo de detección de logout remoto. Se consultó al equipo por su restricción expresa de no desactivar controles. Eligió mantener el iframe: **no se activó la alternativa**, y se retiró incluso la opción de configuración preparada. El código final conserva `checkLoginIframe: true`.

La configuración de clientes es persistente en H2 y la de la aplicación en Compose/.env; reiniciar Docker no la reconfigura. El túnel debe mantenerse activo por separado. El acceso desde otro equipo de la LAN requiere una dirección del servidor y su configuración HTTPS/DNS/orígenes; su propio localhost apunta a ese otro equipo.

## 14. Pruebas ejecutadas y categorías

| Conjunto | Resultado / categoría |
|---|---|
| Backend, archivos `test/*.test.js`, Node del contenedor habitual | 1126 contabilizadas: **1122 aprobadas, 4 omitidas, 0 fallos**. Regresiones con dobles; no se cuentan como operaciones reales de negocio |
| Backend focal de la imagen final | **11 aprobadas**, proxy/servidor/administración; sin cambios en datos comerciales |
| Frontend existente | **51 aprobadas**, más assertions SSR del runner; fixtures, no login real. La pasada de 52 pertenecía al ensayo alternativo luego retirado |
| Opción de sesión preparada y descartada | Se probó de forma focal antes de consultar; no se activó. Código/opción/test retirados después de la decisión del operador; no se cuenta como una función entregada |
| Localhost, intento real con iframe | Falló el primer login después del cambio de contraseña; se observó refresh inválido. No se declara aprobado |
| Brave + Ubuntu + Aiven, alternativa 127 | Resultados individuales de cierre a continuación |
| Keycloak temporal / MySQL aislado | **No ejecutados ni creados en esta tarea** |

Los primeros intentos de regresión heredaban `AUTH_PROVIDER=keycloak` y retención del contenedor, mientras ciertos fixtures prueban Auth0/limpieza deshabilitada. También se descubrió que `npm test` dentro de la imagen intenta ejecutar helpers `.mjs` independientes que importan archivos de scripts no incluidos en la imagen. Se corrigió la invocación del runner, seleccionando los archivos de pruebas y sus opciones de referencia; no se abrió el gate Keycloak ni se cambió negocio. El intento desde Windows tampoco se usa como evidencia aprobada: su `@prisma/client` local no exporta `Prisma`, fallando antes de los asserts esperados de arranque. Se propone alinear/generar ese cliente local con las dependencias vigentes y el Node del proyecto antes de usar ese runner; no se alteraron dependencias para ocultar el problema. La suite final válida es la del contenedor y los 11 tests focales posteriores.

Las cuatro integraciones omitidas conservan sus guardas y no se fuerzan contra datos reales. Las evidencias históricas de 06.5 se mantienen como históricas, no se vuelven a contar como pruebas nuevas de Aiven.

## 15. Problemas pendientes y autorización

- Decisión resuelta: 127 como dirección principal y sesión con iframe. Recuperar localhost bajo las restricciones actuales no se declara logrado; no se activa el mecanismo alternativo.
- La política global de contraseñas está vacía; las nueve credenciales generadas son robustas, pero no se atribuye esa fortaleza a una política global inexistente. Una política corporativa nueva afecta al equipo y requiere acordarla.
- Las rutas administrativas heredadas y recuperación de password siguen limitadas; fase 07 no está implementada.
- No se cambian pedidos/pagos/avances reales para demostrar mutaciones. Si se necesitan ensayos de efectos sobre registros concretos, deben identificarse esos registros y el cambio deseado; no se improvisan fixtures comerciales.
- La identidad histórica Auth0 y los sujetos Keycloak con `id_auth0` nulo requieren el trabajo de resolución/migración previsto. No se conceden roles por similitud de nombre.
- H2/start-dev y túnel manual siguen siendo el entorno de desarrollo actual. Cambiar almacenamiento, instalar servicios o introducir HTTPS/DNS compartido queda fuera de este ajuste.
- Aiven, Resend/PIN, Manager y canales corporativos siguen teniendo dependencias externas. No se declara operación offline ni entrega de correos real por estas pruebas.

## 16. Comprobación manual por el equipo

1. Mantener abierto el túnel del puerto 18080 hacia el Keycloak Ubuntu existente. Iniciar la aplicación habitual con `docker compose up -d api web`; no hace falta otro Compose ni otra base.
2. Abrir el archivo privado de credenciales localmente. Elegir un username de la tabla y su `password` actual; no copiar valores al chat ni al repositorio.
3. Abrir la URL que figura en el resultado final de cierre. Verificar que el login corresponde al realm `itecsa`, cliente `itecsa-web`, en Ubuntu por el túnel.
4. Si Keycloak pide cambio obligatorio, elegir una contraseña propia robusta y conservarla de forma privada. El password que aparece en el archivo dejará de servir después de ese cambio manual.
5. La primera entrega de PIN puede redirigir a `/perfil`. Guardar el PIN y aceptar su recepción; después usar el inicio previsto para el rol. No resetear PIN de compañeros para repetir la prueba.
6. Probar los menús de la matriz, una ruta permitida y otra denegada; recargar. Para OP: Kanban sí, Usuarios no. Para AC: pagos sí, producción administrativa no. Para G: métricas sí. Para D: negocio según sus 24 capacidades, Usuarios no. Para S: administración de identidad, perfil y mensajes; Kanban no.
7. En Soporte comprobar el formulario de preparación y sus seis roles ordinarios. No esperar activación/entrega de password de fase 07 ni la gestión heredada completa. No repetir un alta de un username que ya existe.
8. Cerrar sesión usando el botón y su confirmación. Debe volver a `/login?logged_out=1`. Los resultados reales por cuenta, URL final y cualquier excepción se agregan en el cierre de este informe.

## Resultado de cierre

**URL elegida y comprobada: http://127.0.0.1:5173/**. API: `http://127.0.0.1:3000/api`. Keycloak: `http://127.0.0.1:18080/realms/itecsa`. Iframe activado, issuer intacto, sin desactivar firma, PKCE, roles, PIN ni controles del navegador. No utilizar `localhost:5173` para el login de este entorno.

La serie real principal en Brave se ejecutó entre **15:09:58 y 15:24:49 UTC** del 25-10-2026, contra Ubuntu/Aiven actuales. Después se verificaron de forma focal AP y Soporte sobre la imagen revisada, manteniendo el iframe.

| Cuenta | `/auth/verify` | Claims exactos | Inicio tras aceptar PIN | Recarga | Logout |
|---|---|---|---|---|---|
| admin.produccion.prueba | 200 | Rol único, 18 capacidades | `/kanban` | Aprobada | Aprobado |
| admin.ventas.prueba | 200 | Rol único, 10 capacidades | `/kanban` | Aprobada | Aprobado |
| admin.cobranzas.prueba | 200 | Rol único, 9 capacidades | `/kanban` | Aprobada | Aprobado |
| operario.produccion.prueba | 200 | Rol único, 8 capacidades | `/kanban` | Aprobada | Aprobado |
| operario.ventas.prueba | 200 | Rol único, 10 capacidades | `/kanban` | Aprobada | Aprobado |
| operario.cobranzas.prueba | 200 | Rol único, 8 capacidades | `/kanban` | Aprobada | Aprobado |
| gerencia.prueba | 200 | Rol único, 7 capacidades | `/kanban` | Aprobada | Aprobado |
| desarrollador.prueba | 200 | Rol único, 24 capacidades | `/kanban` | Aprobada | Aprobado |
| soporte.prueba | 200 | Rol único, 5 capacidades | `/admin/usuarios` | Aprobada | Aprobado |

Resultados reales:

- **81 lecturas HTTP de negocio:** 60 respuestas 200 y 21 respuestas 403, exactamente según la matriz; ninguna discrepancia.
- **9 inspecciones administrativas:** Soporte 200, los otros ocho roles 403. No se declara probado un alta desde ITECSA mediante la creación administrativa explícita de las nueve cuentas.
- **81 navegaciones directas:** 48 rutas permitidas y 33 rutas no autorizadas redirigidas al inicio permitido del rol. El primer verificador esperaba `/access-denied` también después de reinicializar todo el documento; por eso guardó `pass=false` para esas 33 redirecciones. La observación fue una denegación efectiva, no una ampliación de permisos. Se preserva el resultado original. La comprobación adicional de navegación interna SPA para AP y Soporte comprobó explícitamente `/access-denied`: **18 decisiones correctas**, sin cambiar guards ni reglas.
- Menús observados de los nueve roles concordantes con la matriz. Los checks focales de menú de AP y Soporte dieron `menuMatchesPolicy=true`.
- Nueve entregas/aceptaciones de PIN propio; nueve intentos posteriores de revelarlo devolvieron **409**, conservando la protección tras aceptación. Los PIN solo permanecen en el archivo privado.
- **Cero** requests con `refresh_token=undefined` y cero errores de token en la serie 127. No se declara una nueva prueba real de expiración prolongada, revocación administrativa o envío de correo por estos resultados.
- En el cierre se comprobó que las nueve contraseñas actuales están reconciliadas, los nueve PIN están entregados y las nueve cuentas vuelven a requerir `UPDATE_PASSWORD`. No se hizo otro login después de preparar ese cambio obligatorio para el operador.

Configuración efectiva final, sin secretos:

| Clave / recurso | Valor |
|---|---|
| `AUTH_PROVIDER`, `APP_ENV`, `NODE_ENV` | `keycloak`, `development`, `development` |
| `KEYCLOAK_ISSUER` | `http://127.0.0.1:18080/realms/itecsa` |
| `KEYCLOAK_AUDIENCE` | `https://api.itecsa.local` |
| `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_ROLE_CLIENT_ID` | `itecsa-web`, `itecsa-api-v1` |
| JWKS / transporte administrativo | `host.docker.internal:18080`, conservando issuer público |
| `KEYCLOAK_ADMIN_CLIENT_ID` | `itecsa-backend-admin`; secreto no expuesto |
| `FRONTEND_ORIGIN` | `http://127.0.0.1:5173` |
| `VITE_API_BASE_URL` | `http://127.0.0.1:3000/api` |
| `VITE_KEYCLOAK_URL`, realm, client | `http://127.0.0.1:18080`, `itecsa`, `itecsa-web` |
| Preparación backend/frontend | `IDENTITY_PREPARATION_ENABLED=true`, `VITE_IDENTITY_PREPARATION=true` |
| SPA Redirect URI / Web Origin / postlogout | `http://127.0.0.1:5173/*`, `http://127.0.0.1:5173`, `http://127.0.0.1:5173/*` |
| Base | Aiven `mydb`, TLS `required`, CA existente |

El inventario final contiene **12 usuarios humanos: los tres previos y nueve nuevos**, diez clientes y cero grupos. El cliente técnico mantiene sus cuatro grants directos y composites internos de consulta. No se crearon volúmenes o contenedores MySQL/Keycloak: Docker conserva solamente `itecsa_app_lan-api-1` y `itecsa_app_lan-web-1`.

Después de recrear ambos servicios con la configuración elegida se volvió a comprobar: frontend, API y discovery respondieron **200**; el backend consultó Ubuntu con el cliente técnico real; Aiven conservó TLS, **28 usuarios locales, 12 vínculos externos y cero operaciones de preparación**. Las nueve cuentas siguieron exigiendo cambio obligatorio. El archivo servido conserva `checkLoginIframe: true`, sin opción alternativa, y la API base final es 127. No se reinició el daemon Docker, Ubuntu ni Keycloak. Se eliminó el perfil Brave usado para las comprobaciones; el navegador habitual no se alteró y las credenciales/evidencias privadas se conservaron. La suite frontend de la imagen final volvió a aprobar **51 pruebas**.

Evidencia privada no secreta de configuración/resultados: `inventario-anterior.json`, `inventario-actual.json`, `preservacion.json`, `vinculos.json`, `brave-127.json`, los dos informes focales y los logs de regresión, en el mismo directorio privado. `credenciales.json` es el único de esos archivos que debe utilizarse para obtener passwords/PIN; no debe publicarse con los demás.

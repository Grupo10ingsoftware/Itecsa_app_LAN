# Identidad Keycloak: alcance y pendientes

Estado del código al 25-10-2026. La aplicación admite únicamente Keycloak. Este documento distingue lo conectado de los flujos que faltan; no habilita operaciones administrativas adicionales.

## Arranque reproducible de desarrollo

El acceso del navegador es **http://127.0.0.1:5173/kanban**, tanto con Node local como con Docker Desktop. Vite anuncia ese enlace, mantiene el puerto 5173 y redirige `localhost:5173` antes de cargar la aplicación. No se usan las IP internas de contenedores como enlaces de acceso. Si el puerto está ocupado, Vite termina con error en lugar de pasar a 5174 y romper los redirects registrados.

Cada desarrollador necesita sus dependencias locales, los `.env` privados autorizados, el certificado CA indicado por `DB_SSL_CA_PATH` y acceso al mismo Keycloak mediante el túnel local 127.0.0.1:18080. No se incluyen secretos en Git ni se copian cuentas o bases de datos. El cliente `itecsa-web` debe conservar redirects y logout `http://127.0.0.1:5173/*`, web origin `http://127.0.0.1:5173` y PKCE S256. El contrato reproducible está en `scripts/keycloak-ubuntu-contract.mjs`; no ejecutar el configurador para un simple arranque.

Con acceso de red y SSH autorizado al pivote, mantener esta terminal abierta (autenticarse por el mecanismo privado asignado, sin guardar contraseñas en comandos):

```powershell
ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -L 127.0.0.1:18080:10.20.30.10:8080 pivotadmin@100.105.202.35
```

No abrir otro túnel si 18080 ya está ocupado por el correcto. Comprobar `http://127.0.0.1:18080/realms/itecsa/.well-known/openid-configuration`: debe responder y declarar ese mismo origen y realm en issuer. El comando no crea usuarios ni modifica el servidor Ubuntu.

Preparación inicial para Node, desde la raíz (Node 22.12+ o 24 LTS y npm, según los requisitos de las herramientas instaladas):

```powershell
npm ci --prefix tooling/prisma
npm ci --prefix capaServidor
npm ci --prefix capaVista
```

Si faltan los `.env`, partir de `capaServidor/env.example` y `capaVista/env.example` y completar los datos privados con el responsable. No sobrescribir archivos existentes ni generar un PIN_SECRET nuevo al usar la misma base. Mantener issuer y JWKS locales en 127.0.0.1; no colocar `host.docker.internal` en las URLs del navegador ni en la configuración local de Node. Compose selecciona ese transporte únicamente dentro de la API Docker.

Con el túnel accesible, abrir dos terminales desde la raíz:

```powershell
# Terminal 1
cd capaServidor
npm run dev
```

```powershell
# Terminal 2
cd capaVista
npm run dev
```

`npm run dev` del servidor genera Prisma Client antes de iniciar nodemon; no aplica migraciones ni consulta MySQL. Nodemon vigila las mismas fuentes, shared, fixtures y .env en ambos modos. Reiniciar Vite si cambia su .env. La API solo informa arranque después del evento listening; si 3000 está ocupado informa `EADDRINUSE`, sin anunciar un inicio correcto. La configuración privada de DB, PIN y cliente técnico sigue siendo necesaria para las funciones correspondientes.

Alternativa con Docker Desktop, desde la raíz y con los procesos Node locales detenidos:

```powershell
docker compose up --build --watch
```

Compose publica web y API solo en loopback. Vite escucha 0.0.0.0 dentro del contenedor para que la publicación funcione; esa dirección no es la URL que se abre. No ejecutar ambos modos simultáneamente: comparten 5173 y 3000. Para pasar de Docker a Node, detener los servicios con `docker compose stop api web`; no borrar volúmenes ni la base. Al cambiar schema o dependencias, reconstruir la imagen.

Comprobación manual: ambos modos deben anunciar el mismo enlace; abrir `http://localhost:5173/kanban` debe terminar en `http://127.0.0.1:5173/kanban` antes del login; `http://127.0.0.1:3000/api/health/live` debe responder 200. Después comprobar ingreso, recarga y logout con la cuenta propia. La salud pública no consulta MySQL ni acredita el funcionamiento de los flujos administrativos pendientes.

Verificado en este ajuste: lint y build, generación e importación del cliente Prisma local, schema válido, arranque Node y Docker, preview, puerto ocupado, redirección con ruta y query, rechazo de IP interna como enlace de acceso, CORS limitado al origen acordado, rutas protegidas sin token y conexión WebSocket de HMR en ambos modos. Se contrastaron los `.env` privados sin imprimir secretos y el contrato reproducible. Desde la API Docker se comprobó salud y descarga de claves públicas por host.docker.internal, conservando el issuer 127.0.0.1. Se comprobó conexión TLS a MySQL con SELECT 1 y presencia de vínculos Keycloak mediante un conteo, sin devolver datos personales. Esto no revisa individualmente todos los vínculos. No se inició sesión con una cuenta real ni se ejecutaron escrituras de negocio en esta comprobación. La imagen de desarrollo incluye OpenSSL y certificados del sistema para la detección de plataforma de Prisma CLI.

Este esquema permite a cada desarrollador ejecutar su copia en su propio equipo con el mismo origen local. Para que varios equipos abran una única instancia por LAN hace falta un origen HTTPS/DNS compartido y registrarlo coherentemente en SPA, API y Keycloak. No basta con exponer Vite por HTTP en una IP LAN; no se desactivan PKCE ni el iframe de sesión.

## Alcance conectado

- SPA pública con Authorization Code, PKCE S256, tokens en memoria, iframe de sesión, renovación, recarga y logout.
- API con firma RS256, issuer y audience exactos, cliente autorizado, un rol aplicativo y capacidades intersectadas con la matriz canónica.
- Nueve roles y 25 capacidades, conservados sin nuevas concesiones: Desarrollador mantiene 25 y Soporte cinco. Los seis roles departamentales son los únicos destinos ordinarios.
- Perfil y movimientos propios, PIN, negocio y notificaciones conservan las claves locales y sus controles.
- Consulta, resumen, inspección, movimientos, preparación deshabilitada y conciliación de cuentas bajo `/api/admin/identity`, con habilitación explícita, estado, rol y PIN del actor.

## Identidad persistente y compatibilidad

La resolución de usuarios utiliza exclusivamente `ExternalIdentity`: proveedor, issuer, subject y la relación con `Usuario.id_usuario`. No se adopta una cuenta por nombre o correo. La PK local de usuarios, los pedidos, registros, mensajes, hashes y datos de PIN se conservan.

Las columnas antiguas que puedan permanecer físicamente en una base existente quedan fuera del modelo y de las consultas actuales. No se ejecutó DDL, backfill, eliminación de personas ni rotación de secretos para retirarlas. Una cuenta sin vínculo explícito válido debe ser conciliada antes de entrar; no se recrea automáticamente.

Antes de usar el cambio en un entorno, comprobar que cada cuenta Keycloak habilitada tenga su vínculo correcto y que exista la migración de preparación de identidad. Generar de nuevo Prisma Client desde el schema vigente e incorporar las fuentes actualizadas a las imágenes. Una imagen previa no cambia al editar el repositorio. El retiro del SDK de la SPA exige instalar las dependencias del lockfile actual al reconstruir.

El bloqueo de PIN y la confirmación de preparación releen el vínculo y el usuario en la misma transacción. El rol y el estado del actor se revalidan antes de confirmar la escritura administrativa. Las identidades preparadas continúan deshabilitadas, Pendiente y sin credenciales.

## Funciones pendientes

| Función | Estado actual | Trabajo requerido y aceptación |
| --- | --- | --- |
| Alta completa y credenciales iniciales | Solo preparación; `fullyProvisioned=false` | Contraseña temporal segura, cambio obligatorio, activación coordinada y entrega controlada. No guardar passwords en diario, mensajes ni logs. Resolver respuestas perdidas sin repetir altas a ciegas. |
| Edición de cuenta y cambio de rol | UI restringida; primitivas del adaptador no son un workflow completo | Validar sujeto del actor, rol previo/nuevo, alcance, PIN, estado, auditoría y conflictos entre operadores. Conciliar fallos parciales entre IdP y SQL. |
| Baja y reactivación | Sin operación pública completa | Definir orden de bloqueo local/IdP, cierre de sesiones, tratamiento de tokens anteriores y PIN, preservando históricos y resultados ambiguos. |
| Restablecimiento administrativo | No disponible | Incorporar el contrato de credencial temporal y la verificación de identidad antes de entregar el secreto. No confundir preparación con recuperación. |
| Recuperación supervisada sin sesión | Pantalla informativa; endpoint devuelve 503 | Expediente persistente independiente de mensajes, respuesta pública uniforme, deduplicación, asignación y exclusión entre operadores, validación de identidad y entrega controlada. |
| Cambio personal de contraseña desde perfil | Perfil consulta datos y gestiona PIN | Integrar acción nativa con reautenticación, cancelación y retorno seguro. Un reset administrativo no reemplaza el cambio personal. |
| Conciliación de operaciones nuevas | Diario actual cubre preparación | Extender contratos a edición, estado y credenciales. Resolver operativamente `running` interrumpido sin robar ejecuciones ni adoptar cuentas por coincidencia. |
| Cuentas privilegiadas y bootstrap | G/D/S excluidos del alta ordinaria | Definir aprobadores, creación/recuperación y último operador disponible. Mantener prohibida la autoelevación. |
| Personas históricas sin vínculo | No se autentican por similitud de datos | Correspondencia explícita de identidad, revisión de rol y conservación de PK/PIN/auditoría. No reasignar historia a una persona diferente. |

Estas tareas corresponden a provisión, estabilización, perfil/recuperación y aceptación de las fases 07–10. Las rutas reservadas `/api/admin/users` permanecen cerradas con 503 después de autenticar y autorizar. Las funciones nuevas no se presentan como implementadas por tener un modal o una primitiva administrativa.

## Esquema, migraciones y controles de entrega

Se retiró del schema y del SQL inicial el identificador sustituido por la relación externa. Dos migraciones históricas de normalización conservan sus sentencias, con comentarios retirados. Esto cambia los checksums de esos archivos: una base que ya los registró requiere revisar y reconciliar su historial antes de cualquier migración. No editar la tabla de migraciones ni aceptar un nuevo baseline automáticamente.

La base compartida de desarrollo tenía historial previo sin reconciliar y una migración aditiva de preparación registrada. Este cambio no certifica un baseline completo. No ejecutar `db push`, `migrate reset` o `migrate deploy` a ciegas: un diff podría proponer retirar columnas no modeladas. La conservación o retirada física de columnas e identidades históricas requiere una tarea de datos separada.

Se retiraron excepciones del scanner ligadas a rutas eliminadas. El escaneo de historial mantiene su alcance; revisar los posibles falsos positivos históricos de identificadores públicos sin introducir exclusiones generales ni ocultar secretos.

## Aceptación pendiente de entorno

La compilación y las comprobaciones con dobles no sustituyen aceptación de usuarios vinculados, PIN bajo concurrencia MySQL, preparación y revocación en el entorno autorizado. No se recrean laboratorios ni se modifica Aiven o el realm para comprobar este retiro.

Comprobaciones del retiro: lint y build de la SPA; validación del schema y generación de un cliente Prisma en salida temporal; comparación exacta de nueve roles y 225 decisiones de permisos; JWT firmados localmente con casos de firma, expiración, issuer, audience, cliente y roles incorrectos; resolución por vínculo, bloqueo de PIN y revalidación del actor; contratos de sesión, preparación y consultas de movimientos de la SPA. Fueron verificaciones locales con dobles y endpoints locales temporales, sin usuarios ni base de datos adicionales. En esa comprobación inicial no se añadieron suites ni se sustituyeron las fuentes activas. La posterior unificación del arranque utiliza los mismos servicios de desarrollo existentes, con sus imágenes reconstruidas; no crea un laboratorio de datos.

Mantener el origen local 127 y el iframe elegidos. Faltan aceptación prolongada en varios navegadores/pestañas, tratamiento de refresh concurrente y logout remoto, HTTPS/DNS/CA/NTP compartidos y operación productiva. H2/start-dev y el túnel siguen siendo condiciones de desarrollo; no una recomendación de producción.

La política corporativa de contraseñas, eventos del IdP, custodia, recuperación administrativa y respaldo actualizado con RPO/RTO siguen pendientes. El respaldo frío histórico es anterior a cambios actuales. Aiven, Resend, la fuente de notas de venta y canales corporativos tienen dependencias externas: cambiar identidad no acredita funcionamiento offline.

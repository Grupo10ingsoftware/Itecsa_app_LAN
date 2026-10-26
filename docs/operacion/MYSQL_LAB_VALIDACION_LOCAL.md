# Validación local de MySQL 8.4 en Docker

Fecha de ejecución: 2026-10-25. Esta validación utilizó únicamente recursos
locales del laboratorio. No se abrió una conexión a Aiven ni se modificaron sus
credenciales.

## Entorno y aislamiento

- Pop!_OS 24.04 LTS, Docker Desktop 4.92.0, Engine 29.8.0 y Compose 5.5.1.
- MySQL 8.4.13 para `linux/amd64`, fijado por el digest declarado en el Compose.
- Volúmenes exclusivos `itecsa-mysql-lab_mysql_data` y
  `itecsa-mysql-lab_mysql_socket`.
- Red interna `itecsa-mysql-lab-private`. El override host agrega la red bridge
  dedicada `itecsa-mysql-lab-host`, necesaria para que Docker Desktop materialice
  el binding `127.0.0.1:33307`. El Compose base continúa sin publicar puertos.
- Los contenedores detenidos de los Compose existentes no fueron modificados.

Las credenciales, CA, certificado, clave y perfiles completados se generaron en
rutas ignoradas por Git. La CA privada se conserva en
`deploy/mysql-lab/private/` y no se monta en MySQL. El certificado del servidor
incluye `DNS:mysql`, `DNS:itecsa-mysql-lab` e `IP:127.0.0.1`.

## Resultados físicos

### MySQL, TLS y cuentas

- El contenedor inició saludable con MySQL 8.4.13 y
  `require_secure_transport=ON`.
- Las cuentas API y migradora negociaron TLS con una CA verificada.
- Una conexión TCP sin TLS fue rechazada.
- `localhost` fue rechazado porque no forma parte del SAN; `127.0.0.1` y
  `mysql` fueron aceptados en sus perfiles respectivos.
- El bootstrap se ejecutó dos veces, sin red TCP, mediante el socket Unix.
- La cuenta API conserva `SELECT`, `INSERT`, `UPDATE` y `DELETE`; una prueba de
  DDL fue denegada.
- La cuenta migradora pudo crear y eliminar una tabla temporal de comprobación
  dentro de `itecsa_lab`.
- `deploy/mysql-lab/state/instance.env` registró el UUID, hostname y puerto con
  modo `0600`.

### Migraciones, seed y esquema

- Las 15 migraciones históricas se aplicaron consecutivamente sobre la base
  vacía, sin reparar ni modificar su historial.
- `_prisma_migrations` contiene las 15 entradas finalizadas, ninguna revertida,
  y sus checksums SHA-256 coinciden con los 15 archivos SQL del repositorio.
- Una segunda ejecución informó `No pending migrations to apply`.
- El primer seed creó 24 filas de catálogo; las ejecuciones posteriores crearon
  0. Los catálogos, capacidades y seis relaciones producto-subproceso coinciden
  con las definiciones versionadas. No se crearon usuarios, clientes ni pedidos.
- La comparación `prisma migrate diff` encontró una deriva única pendiente:
  `Usuario.id_auth0` queda `NOT NULL` al reconstruir desde las migraciones, pero
  `schema.prisma` lo declara nullable. El esquema real documentado de Aiven ya
  admite valores nulos y el cambio a nullable fue intencional durante la
  integración Keycloak, mientras que la migración aditiva de esa fase no alteró
  esta columna. La corrección mantenible propuesta es una migración nueva que
  haga `id_auth0 VARCHAR(128) NULL`, sin editar las 15 migraciones históricas.
  No se creó ni aplicó esa migración durante esta ejecución.

### API y flujos físicos

- La API inició desde el computador con `.env.mysql-lab.host`.
- `/api/health/live` respondió 200 y `/internal/ready` respondió 200 con la base
  MySQL local.
- La prueba de seguridad MySQL confirmó serialización de cuotas concurrentes y
  rollback atómico del evento de auditoría.
- El flujo de nota 24226 se ejecutó dentro de una transacción forzada a rollback:
  su línea Yoyo quedó asociada al tipo `Yoyo` con
  `id_estado_subproceso = NULL`. Los conteos de usuarios, clientes, pedidos y
  detalles permanecieron iguales antes y después.
- Los endpoints autenticados con Keycloak no se probaron porque no había un
  Keycloak local disponible. Esto no afectó las comprobaciones MySQL.

### Persistencia

Se capturaron el UUID, el número de migraciones y los conteos de catálogos. Tras
`docker compose stop mysql` y `docker compose start --wait mysql`, todos
permanecieron idénticos. El reinicio no ejecutó bootstrap, migraciones ni seed.

## Correcciones de integración aplicadas

1. El override host agrega una bridge dedicada porque Docker Desktop no publica
   un puerto de un contenedor conectado exclusivamente a una red `internal`.
2. El conector MariaDB valida explícitamente el host seleccionado durante el
   upgrade TLS; Node asumía `localhost` al actualizar un socket existente.
3. `app.js` respeta `DOTENV_PATH` para impedir que el `.env` predeterminado
   complete `DATABASE_URL` con otro destino después de seleccionar el perfil.
4. Las imágenes de API incluyen OpenSSL y certificados del sistema para que
   Prisma detecte correctamente su ABI dentro de `node:22-bookworm-slim`.
5. Se añadieron `mysql-lab:verify` y `mysql-lab:physical-check` para repetir las
   comprobaciones sin imprimir secretos.

## Validaciones automatizadas

- Suite Node: 1154 aprobadas, 0 fallidas y 4 omitidas.
- Integración MySQL de seguridad: 2 aprobadas.
- Pruebas específicas de conexión, bootstrap, inicializador, historial y seed:
  5 archivos aprobados.
- `prisma validate` y `prisma generate`: correctos sin variables de base.
- Compose MySQL base, host, tools y API: sintaxis válida.
- Build Docker de `db-init`: correcto y sin advertencias de detección OpenSSL
  después de la corrección.

## Estado y siguiente decisión

Al cerrar la validación, la API y MySQL quedaron detenidos. Los volúmenes, las
dos redes, los certificados, el archivo de identidad y los perfiles locales se
conservaron para continuar sin reinicializar la base.

El laboratorio demuestra arranque, TLS, privilegios, reconstrucción de las 15
migraciones, seed idempotente, conexión de API, flujo Yoyo y persistencia. La
equivalencia exacta entre esquema físico y Prisma requiere resolver la
nulabilidad de `Usuario.id_auth0`. Hasta aprobar y validar una migración aditiva
para esa columna, el laboratorio no debe declararse completamente listo para un
despliegue en la VM.

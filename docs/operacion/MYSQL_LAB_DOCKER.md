# MySQL aislado para laboratorio

`compose.mysql.lab.yaml` prepara un servidor MySQL independiente de los Compose
de desarrollo y produccion. Usa MySQL 8.4.13 fijado por el digest ya utilizado
en el laboratorio de identidad del repositorio. El volumen Docker
`itecsa-mysql-lab_mysql_data` conserva `/var/lib/mysql`; la red bridge interna
`itecsa-mysql-lab-private` no publica el puerto 3306 en el host ni en la LAN.
No iniciar este servicio como parte de los Compose existentes.

## Preparacion antes del primer arranque

1. Copiar `deploy/mysql-lab.env.example` a `deploy/mysql-lab.env` y sustituir
   ambos marcadores por contrasenas diferentes, generadas para el laboratorio.
   Restringir la lectura del archivo local a sus custodios. No agregarlo a Git.
2. Crear `deploy/mysql-lab/certs/` fuera de Git con `ca.pem`,
   `server-cert.pem` y `server-key.pem`. El certificado del servidor debe estar
   firmado por esa CA y tener SAN DNS para `mysql` y SAN IP para `127.0.0.1`.
   Ambos nombres se usaran en perfiles distintos de la API. Mantener la clave privada legible solo por
   el usuario de MySQL dentro del contenedor y sus custodios en el host. No
   reutilizar la CA ni las credenciales de Aiven.
3. Confirmar la arquitectura de la maquina y que la imagen fijada esta
   disponible localmente o puede descargarse antes de entrar en una LAN sin
   acceso al registro. Confirmar espacio persistente y procedimiento de copia
   de seguridad antes de guardar datos que importe conservar.

La configuracion montada en `/etc/mysql-lab.cnf` exige TLS. El contenedor no
arrancara correctamente si faltan los certificados o MySQL no puede leer la
clave. El healthcheck comprueba que MySQL acepta conexiones TCP con una CA
verificada; no demuestra que existan las tablas ni los catalogos de la
aplicacion. La red es interna: para tareas de administracion posteriores se
necesitara un contenedor conectado a ella, sin abrir el puerto al host.

## Validacion estatica y uso posterior

Desde la raiz del repositorio, validar el Compose sin iniciar servicios:

```bash
docker compose --env-file deploy/mysql-lab.env.example -f compose.mysql.lab.yaml config --quiet
```

La plantilla permite validar la sintaxis, pero sus marcadores no son
contrasenas utilizables. Antes del arranque, repetir la validacion con
`deploy/mysql-lab.env`; `config --quiet` evita mostrar los valores resueltos.
Despues, y solo cuando se apruebe el arranque del laboratorio, usar:

```bash
docker compose --env-file deploy/mysql-lab.env -f compose.mysql.lab.yaml up -d --wait --pull never
docker compose --env-file deploy/mysql-lab.env -f compose.mysql.lab.yaml ps
```

No ejecutar `down --volumes` ni `docker volume rm` si hay datos que conservar.
La imagen oficial aplica `MYSQL_ROOT_PASSWORD`, `MYSQL_DATABASE`, `MYSQL_USER`
y `MYSQL_PASSWORD` **solo al inicializar un directorio de datos vacio**. Cambiar
el archivo de entorno mas tarde no rota contrasenas ni crea otra base o usuario.
El usuario de aplicacion creado por la imagen tiene permisos sobre la base
indicada. `root` se limita a conexiones locales dentro del contenedor; mantener
separada su credencial administrativa.

Para una entrega sin red, preparar la imagen en una maquina conectada que
coincida con la arquitectura del destino y conservar el digest de este Compose.
Etiquetar esa imagen como `itecsa-mysql-lab:8.4.13`, exportar **esa etiqueta**
con `docker image save`, guardar un checksum del archivo y verificarlo antes de
`docker image load` en el destino. En el archivo local `deploy/mysql-lab.env`
definir `MYSQL_IMAGE=itecsa-mysql-lab:8.4.13` para que Compose utilice la
etiqueta cargada; comprobar que corresponde al digest registrado. Los comandos
anteriores usan `--pull never` para no depender del registro. La validacion
estatica no comprueba disponibilidad de la imagen ni permisos de certificados.

## Conexion futura de la aplicacion

La API y Prisma CLI comparten una validacion estatica del destino. Los perfiles
del laboratorio son completos e independientes de `capaServidor/.env`:

| Ejecucion | Plantilla para copiar | Direccion MySQL | CA de la API |
| --- | --- | --- | --- |
| Computador | `capaServidor/env.mysql-lab.host.example` a `capaServidor/.env.mysql-lab.host` | `127.0.0.1:33307` | Ruta absoluta al `ca.pem` del laboratorio |
| Contenedor API | `capaServidor/env.mysql-lab.docker.example` a `capaServidor/.env.mysql-lab.docker` | `mysql:3306` | `/run/secrets/mysql-lab-ca.pem` |

Sustituir todos los marcadores, incluidos los secretos no relacionados con MySQL.
El archivo Docker recibe la CA mediante `compose.api.mysql.lab.yaml`; no copiar
la clave privada del servidor a la API. La cuenta de Prisma CLI puede diferir
de la cuenta de la API, pero su URL debe señalar el mismo host, puerto y base.
Ambas rutas TLS deben usar la misma CA y `sslaccept=strict`. En el computador,
codificar usuario, clave y ruta absoluta de la CA al escribir `DATABASE_URL`,
especialmente si la ruta contiene espacios.

La configuracion base de MySQL sigue sin publicar puertos. Solo para pruebas
desde el computador, el override `compose.mysql.lab.host.yaml` publicara 3306
en `127.0.0.1:33307` cuando se incluya expresamente como segundo archivo:

```bash
docker compose --env-file deploy/mysql-lab.env -f compose.mysql.lab.yaml -f compose.mysql.lab.host.yaml config --quiet
```

El puerto puede ajustarse con `MYSQL_HOST_PORT`; entonces cambiar tambien
`DB_PORT` y `DATABASE_URL` del perfil host. Para seleccionar ese perfil desde
`capaServidor`, usar
`DB_TARGET=mysql-lab-host DOTENV_PATH=.env.mysql-lab.host npm run dev` o
anteponer ambas variables a un comando Prisma CLI. `DB_TARGET` obliga a usar
la direccion local incluso si el shell contiene variables antiguas. Si el
archivo seleccionado falta o no se puede leer, la API y la CLI fallan antes
de utilizar una conexion. El `.env` actual de Aiven permanece como perfil
predeterminado cuando no se selecciona otro archivo.

Para ejecutar despues la API en Docker, `compose.api.mysql.lab.yaml` usa el
perfil Docker indicado por `LAB_API_ENV_FILE=./capaServidor/.env.mysql-lab.docker`,
monta la CA y se conecta a la red externa `itecsa-mysql-lab-private`. Su red
Compose predeterminada permite acceder a las demas dependencias de la API.
Validar ese Compose con `config --quiet` antes de usarlo. No ejecutar la CLI
Prisma del computador con el perfil Docker: el host `mysql` y su ruta de CA
solo existen dentro de la red y del contenedor.

```bash
LAB_API_ENV_FILE=./capaServidor/env.mysql-lab.docker.example docker compose -f compose.api.mysql.lab.yaml config --quiet
```

La plantilla permite esta comprobacion estatica; para un arranque posterior,
seleccionar el archivo local `.env.mysql-lab.docker` ya completado.

Estos archivos no crean tablas ni catalogos y no ejecutan migraciones. La
conexion fisica, los certificados reales y los permisos de una eventual cuenta
CLI distinta se validaran en la siguiente tarea.

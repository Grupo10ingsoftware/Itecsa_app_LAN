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

## Perfiles de aplicacion e inicializacion

La API y el inicializador usan archivos distintos. La API solo recibe la cuenta
`itecsa_app`; las plantillas `*.init.example` agregan la cuenta
`itecsa_migrator` y la confirmacion explicita de la base. El inicializador
construye `DATABASE_URL` con la API `URL`, por lo que las contrasenas pueden
contener comillas, barras, Unicode y saltos de linea sin interpolacion manual.

| Uso | Computador | Docker |
| --- | --- | --- |
| API | `capaServidor/env.mysql-lab.host.example` | `capaServidor/env.mysql-lab.docker.example` |
| Inicializador | `capaServidor/env.mysql-lab.host.init.example` | `capaServidor/env.mysql-lab.docker.init.example` |
| MySQL | `127.0.0.1:33307` | `mysql:3306` |
| CA | ruta absoluta local | `/run/secrets/mysql-lab-ca.pem` |

Copiar cada plantilla que se vaya a usar a un archivo `.env.mysql-lab.*`,
reemplazar sus marcadores y limitar sus permisos. Todos esos archivos locales
estan ignorados por Git. La API no debe recibir `DB_MIGRATION_PASSWORD` ni
`DATABASE_URL`. El certificado de servidor debe validar el nombre usado por el
perfil: IP SAN `127.0.0.1` y DNS SAN `mysql`.

La configuracion base de MySQL sigue sin publicar puertos. Solo para pruebas
desde el computador, el override `compose.mysql.lab.host.yaml` publicara 3306
en `127.0.0.1:33307` cuando se incluya expresamente como segundo archivo:

```bash
docker compose --env-file deploy/mysql-lab.env -f compose.mysql.lab.yaml -f compose.mysql.lab.host.yaml config --quiet
```

El puerto puede ajustarse con `MYSQL_HOST_PORT`; entonces cambiar tambien
`DB_PORT` del perfil host. Para seleccionar ese perfil desde
`capaServidor`, usar
`DB_TARGET=mysql-lab-host DOTENV_PATH=.env.mysql-lab.host npm run dev` o
seleccionar el archivo equivalente del inicializador cuando corresponda.
`DB_TARGET` obliga a usar la direccion local incluso si el shell contiene
variables antiguas. Si el archivo seleccionado falta o no se puede leer, el
proceso falla antes de utilizar una conexion. El `.env` actual de Aiven
permanece intacto y sigue siendo el perfil predeterminado de desarrollo.

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

## Historial y catalogos iniciales

El historial provisional contiene 16 migraciones tras integrar el trabajo de
Keycloak. La reconciliacion
`20260901000000_reconcile_pre_september_schema` incluye una guarda que exige
una reconstruccion vacia antes de transformar las tablas legadas. El
inicializador rechaza una base con tablas de aplicacion y sin
`_prisma_migrations`, y tambien rechaza migraciones fallidas o revertidas. La
cadena anterior de 15 migraciones fue validada fisicamente; la cadena provisional
actual debe validarse nuevamente desde una base vacia antes del despliegue LAN.

El seed toma sus valores de las constantes que ya consume la aplicacion y de
las relaciones cubiertas por la regresion integral. Prepara:

- estados de pago y etapas del pedido;
- productos Yoyo, Lanyard y Tarjeta;
- etiquetas Urgencia y Prioridad por contrato;
- subprocesos Impresion, Corte y Empaquetado;
- relaciones de Tarjeta y Lanyard con esos tres subprocesos;
- capacidad Lanyard de 1200.

Las capacidades de Tarjeta y Yoyo se escriben como `NULL`. Yoyo no recibe una
relacion de subprocesos no versionada; la validacion informa que una linea nueva
conservara `id_estado_subproceso = null`. El seed se ejecuta en una transaccion:
crea filas ausentes, acepta coincidencias exactas, permite catalogos ajenos y
aborta antes de escribir cuando un identificador o identidad esperada entra en
conflicto. Una segunda ejecucion exacta no crea filas.

## Secuencia controlada para la tarea de puesta en marcha

Esta secuencia queda documentada para una ejecucion posterior. Ningun paso se
incorpora al arranque de la API.

1. Levantar MySQL y esperar su healthcheck con el Compose del laboratorio.
2. Ejecutar de forma explicita el servicio manual `account-bootstrap` mediante
   `docker compose ... --profile tools run --rm account-bootstrap`. El servicio
   no tiene red y comparte solamente el volumen del socket Unix con MySQL.
3. El bootstrap comprueba por socket `DATABASE()`, hostname fijo,
   `@@server_uuid`, MySQL 8.4 y `require_secure_transport`. Luego deja
   `itecsa_app` con `SELECT`, `INSERT`, `UPDATE`, `DELETE`, y
   `itecsa_migrator` con privilegios sobre `itecsa_lab.*`. Las contrasenas se
   pasan al conector como parametros; no habilitar historial de cliente ni
   logging de consultas durante esta operacion.
4. El bootstrap guarda `deploy/mysql-lab/state/instance.env`, ignorado por Git,
   con el UUID, hostname y puerto interno del volumen. Conservarlo junto al
   volumen; si cambia el UUID, investigar y rechazar la inicializacion.
5. Ejecutar explicitamente `npm run mysql-lab:init` con el perfil host, o el
   servicio manual `db-init` con el perfil Docker. Antes de Prisma, el proceso
   abre una conexion TLS de solo lectura con la cuenta API y compara UUID,
   hostname, base, puerto interno, usuario efectivo, version, transporte seguro
   y ausencia de indicadores de Aiven. La CA valida tambien el nombre local del
   certificado.
6. Solo tras esas comprobaciones se ejecutan, en orden, `prisma migrate deploy`,
   `prisma db seed` y la validacion de catalogos. La URL de migracion solo existe
   en el entorno del proceso hijo; el seed y la comprobacion usan la cuenta API.

Los comandos previstos, despues de aprobar la validacion fisica, son:

```bash
mkdir -p deploy/mysql-lab/state
chmod 700 deploy/mysql-lab/state
docker compose --env-file deploy/mysql-lab.env --profile tools -f compose.mysql.lab.yaml run --rm account-bootstrap
```

Para inicializar desde el computador, con el override de puerto ya activo:

```bash
cd capaServidor
DOTENV_PATH=.env.mysql-lab.host.init npm run mysql-lab:init
```

Para inicializar desde Docker:

```bash
LAB_API_ENV_FILE=./capaServidor/.env.mysql-lab.docker \
LAB_INIT_ENV_FILE=./capaServidor/.env.mysql-lab.docker.init \
docker compose --profile tools -f compose.api.mysql.lab.yaml run --rm db-init
```

El inicializador no contiene `migrate reset`, `db push`, borrado de tablas,
bases ni volumenes. Repetirlo aplica solo migraciones pendientes, vuelve a
ejecutar el seed idempotente y valida los catalogos. El bootstrap de cuentas
tambien admite repeticion para rotar las dos contrasenas del laboratorio. Una
configuracion rotulada como laboratorio se rechaza si el destino efectivo no
coincide con la identidad registrada.

## Pendientes de validacion fisica

La siguiente validacion fisica debe ejecutar las 16 migraciones provisionales en una instancia MySQL
8.4 vacia, comparar el esquema fisico con Prisma, comprobar las sentencias de
cuentas y sus privilegios, ejecutar el seed dos veces, validar UUID y TLS, y
probar fisicamente el comportamiento de pedidos Yoyo. Hasta completar esas
pruebas no se considera validada la inicializacion real.

La primera ejecucion local y sus resultados se registran en
`docs/operacion/MYSQL_LAB_VALIDACION_LOCAL.md`.

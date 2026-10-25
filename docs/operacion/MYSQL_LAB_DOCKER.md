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
   firmado por esa CA y tener un SAN DNS para `mysql`, nombre que usara un
   contenedor conectado a la red. Mantener la clave privada legible solo por
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

Una tarea posterior podra unir el servicio API a la red Docker externa
`itecsa-mysql-lab-private` y configurar su `DB_HOST=mysql`, `DB_PORT=3306`,
`DB_SSL_MODE=required`, `DB_SSL_CA_PATH` con la CA de este laboratorio,
`DB_NAME` y credenciales propias. La CLI Prisma usa `DATABASE_URL` por separado:
antes de cualquier inicializacion habra que verificar que ambas configuraciones
apuntan a la misma instancia. Este Compose no une la API, no cambia Aiven, no
crea tablas ni catalogos y no ejecuta migraciones.

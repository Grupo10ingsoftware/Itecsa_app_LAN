# Administradores iniciales del despliegue

`bash deploy/mysql/manage.sh install` crea las tres cuentas después de preparar
MySQL, Keycloak, sus roles, el cliente administrativo y el acceso HTTPS:

| Usuario | Nombre | Apellido | Rol |
| --- | --- | --- | --- |
| `ad.produccion` | Administrador | Producción | Administrador Produccion |
| `ad.cobranzas` | Administrador | Cobranzas | Administrador Cobranzas |
| `ad.ventas` | Administrador | Ventas | Administrador Ventas |

La contraseña inicial de las tres es **`Admin12345.`**, incluido el punto final.
Es temporal: cada cuenta debe reemplazarla en Keycloak en su primer acceso.
Si no se ha informado un correo, Keycloak puede solicitar completar el perfil
con un correo real durante ese primer ingreso. Después continúa el flujo habitual
de entrega y confirmación del PIN personal.
No se crea una cuenta de Soporte. El operador técnico de Keycloak es una cuenta
separada y conserva la configuración de despliegue existente.

## Configuración

Usar `deploy/mysql.env.example` como base del archivo privado `deploy/mysql.env`.
Los grupos `INITIAL_ADMIN_PRODUCTION_*`, `INITIAL_ADMIN_COLLECTIONS_*` e
`INITIAL_ADMIN_SALES_*` contienen usuario, nombre, apellido y contraseña temporal.
Los valores anteriores son también los predeterminados si esos campos están vacíos.
Los campos `EMAIL` y `RUT` son opcionales: vacíos se guardan como datos sin informar,
sin inventar correos ni identificadores. Si se proporcionan, deben ser válidos y
distintos para las tres cuentas.

Las contraseñas técnicas de MySQL y del operador mantienen sus requisitos
anteriores; la clave temporal de estas cuentas cumple la política de negocio
de Keycloak y se sustituye obligatoriamente en el primer ingreso.

## Instalación y recuperación

```bash
bash deploy/mysql/manage.sh check
bash deploy/mysql/manage.sh install
bash deploy/mysql/manage.sh verify
```

No hay que ejecutar un `first-user` adicional. El servicio de herramientas
`keycloak-initial-admins` lo ejecuta el instalador, no el arranque habitual de
los contenedores. `docker compose up`, `start`, `update` y un reinicio conservan
las cuentas y contraseñas vigentes.

Si el alta se interrumpe, corregir la causa y ejecutar:

```bash
bash deploy/mysql/manage.sh resume
```

Conservar la configuración original mientras el alta esté pendiente. El recibo
`/run/mysql-state/initial-administrators.json`, en el volumen `mysql_state`,
guarda identificadores y un resumen criptográfico de la configuración. No
contiene contraseñas, PINs ni tokens. Los marcadores persistidos antes del POST
permiten recuperar una respuesta perdida sin crear otra cuenta ni cambiar su clave.
Las tres cuentas se preparan deshabilitadas y se activan una vez que existen los
tres vínculos locales. Si la activación queda a medias, `resume` completa lo pendiente.

Con el alta completada, `initial-admins` y su alias `first-user` terminan sin
modificar usuarios, roles, estados ni contraseñas. Se pueden retirar las variables
de contraseñas temporales del archivo privado. No eliminar el recibo ni los volúmenes
para intentar repetir el alta.

## Evaluación de la entrega

1. Instalar en un proyecto Docker nuevo, con volúmenes propios.
2. Confirmar en Keycloak las tres cuentas, cada una con su único rol y la acción
   obligatoria `UPDATE_PASSWORD`. Verificar en MySQL tres usuarios y tres vínculos.
3. Ingresar con cada cuenta y `Admin12345.`, cambiar la contraseña y confirmar el PIN.
4. Verificar gestión de usuarios con los tres departamentos.
5. Reiniciar los contenedores y comprobar que no aparecen cuentas duplicadas y
   que funcionan las nuevas contraseñas; la contraseña temporal ya no debe servir.
6. Ensayar una interrupción durante el alta en otro proyecto desechable y retomar
   con `resume`, conservando usuarios y vínculos únicos.

Los tests automatizados cubren creación, errores de red, resultados ambiguos,
fallos al guardar el recibo, confirmación de roles, vínculos y activación, además
del orden del instalador y su comportamiento ante un fallo:

```bash
node --test capaServidor/test/initialAdministrators.test.js deploy/mysql/initial-administrators.test.mjs
```

## Instalaciones existentes

El alta automática corresponde a instalaciones nuevas. Una instalación anterior
con usuarios no se convierte mediante `install` ni mediante `initial-admins` sin
recibo: se rechaza antes de crear cuentas. Los administradores activos pueden
dar de alta las cuentas que falten desde la aplicación. Si el único acceso era
Soporte, se necesita una recuperación administrativa revisada para ese despliegue,
conservando sus identidades y datos. No borrar la base para forzar este procedimiento.

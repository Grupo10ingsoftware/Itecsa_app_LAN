# Cambio de contraseña del administrador permanente de Keycloak

El administrador permanente se configura como `KEYCLOAK_OPERATOR_USERNAME` en el archivo privado de despliegue. La contraseña de ese archivo también se usa en `manage.sh verify`, `start` y `update`. Después de cambiarla en Keycloak hay que sincronizar la configuración privada antes de ejecutar esas operaciones. Esta herramienta no cambia la contraseña en Keycloak ni guarda secretos en Git.

1. Entrar a la consola administrativa de Keycloak con el administrador permanente. Seleccionar el realm `master`, abrir **Users**, buscar el usuario indicado por `KEYCLOAK_OPERATOR_USERNAME` y usar **Credentials → Reset password**. Desactivar **Temporary** y guardar. Elegir una contraseña de al menos 20 caracteres; por el formato literal de `deploy.env`, no debe contener simultáneamente comilla simple y comilla doble.
2. En la terminal de la VM, ejecutar el script incluido en la misma versión del código desplegado, como el usuario dueño de los archivos privados. Ajustar la ruta de la versión si cambia:

   ```bash
   python3 /home/cloud/itecsa-main-6d5a289/deploy/keycloak/sync-operator-password.py \
     --env-file /home/cloud/itecsa-config/deploy.env \
     --admin-file /home/cloud/itecsa-config/keycloak-admin.json
   ```

   La herramienta pide la nueva contraseña sin mostrarla. Comprueba que Keycloak la acepta, actualiza los dos archivos privados y ejecuta `manage.sh verify`. El resultado correcto termina con `OPERATOR_CONFIGURATION_SYNCHRONIZED` y `DEPLOYMENT_VERIFY_OK`. No introducir la contraseña como argumento ni pegarla en el chat.

   En la VM de entrega actual, `/home/cloud/itecsa-config/sync-operator-password.py` es un acceso rápido que ejecuta este mismo script con esas rutas privadas ya configuradas.
3. Si termina con `NEW_PASSWORD_NOT_ACCEPTED_BY_KEYCLOAK`, los archivos siguen intactos: comprobar usuario, realm, cambio guardado y que **Temporary** esté desactivado. Si aparece `DEPLOYMENT_VERIFY_FAILED`, la sincronización ya ocurrió; revisar `/home/cloud/itecsa-config/operator-rotation-verify.log` y resolver el error antes de `start` o `update`. Ese log es privado.

Los archivos de configuración y las copias privadas anteriores conservan la contraseña antigua. Después de verificar la rotación, actualizar o reemplazar cualquier copia que vaya a entregarse al cliente; no publicar esas copias ni el log en el repositorio. Si el cliente cambia el usuario administrador además de su contraseña, este procedimiento no basta: también hay que revisar `KEYCLOAK_OPERATOR_USERNAME`, los roles y la configuración del despliegue.

## Regresión

```bash
python3 deploy/keycloak/sync_operator_password_test.py
```

La prueba comprueba que se rechazan contraseñas no representables, que una contraseña no aceptada no toca los archivos, y que la verificación puede adquirir el bloqueo de despliegue después de la sincronización.

# Comprobación previa de actualizaciones MySQL

`bash deploy/mysql/manage.sh update` comprueba la identidad de la base, su historial Prisma y el contrato de catálogos **antes** de preparar los archivos de runtime, detener la API o revocar escrituras. Usa la imagen de herramientas de la versión destino y la cuenta API por TLS, dentro de una transacción de solo lectura. La lectura termina con `ROLLBACK`; no ejecuta seed, migraciones ni reparaciones.

Se aceptan migraciones pendientes si el estado inspeccionado es compatible. Esta comprobación no exige que el esquema ya coincida con la versión destino: esa es una verificación posterior. No sustituye una revisión de las migraciones ni garantiza que todos los cambios DDL vayan a terminar correctamente.

## Resultado y límites

- **Rechazo previo:** el comando termina con error antes del mantenimiento. No detiene ni arranca servicios, no cambia grants ni modifica los datos o archivos de runtime. Las imágenes pueden haberse descargado o construido y se adquiere el bloqueo local de operaciones. El diagnóstico identifica versión destino, versión esperada del catálogo, última migración y conflictos/faltantes por tabla e ID cuando corresponde. Corregir la causa o preparar una transición revisada antes de repetir.
- **Estado previo ya detenido o en mantenimiento:** rechazar no recupera servicios ni concede permisos. Se conserva ese estado para diagnóstico.
- **Fallo después de comenzar el mantenimiento:** se conserva el cierre seguro existente; la API permanece detenida y el script intenta mantener las escrituras bloqueadas. No usar `start` ni conceder permisos a ciegas para ocultar una migración fallida.

El inicializador repite la comprobación de historial y catálogo inmediatamente antes de `migrate deploy`, después de bloquear escrituras. Esa segunda lectura es necesaria porque la comprobación anticipada no bloquea a otros clientes. La verificación final de checksums, esquema, catálogos y grants también se conserva.

No usar `db-verify` como sustituto de la comprobación previa: exige todas las migraciones y el esquema final, por lo que rechazaría actualizaciones legítimas con migraciones pendientes. El modo interno es `node scripts/mysqlDeploy.mjs --check`, ejecutado por `manage.sh` dentro de `db-deploy`; omitir `--check` ejecuta el despliegue, por lo que no es equivalente.

## Catálogo heredado y transición

El contrato actual es `BUSINESS_CATALOG_VERSION=1`: Lanyard=1, Tarjeta=2, Yoyo=3, estado final Terminado y flujos completos. El catálogo histórico revisado intercambiaba los IDs de producto y usaba Entregado, entre otras diferencias. Cambiar nombres o IDs directamente puede reinterpretar pedidos, subprocesos y auditoría; un seed no es una conversión de datos.

Para este despliegue se confirmó que **no hay datos históricos que migrar**. La ruta admitida es la instalación actual desde cero con el catálogo versionado, seguida de las actualizaciones compatibles. No hace falta inventar una migración histórica para este caso, y esta corrección no borra datos ni volúmenes.

Si aparece una instalación existente con catálogo incompatible:

1. Mantener su versión operativa y conservar base, volúmenes, imágenes, configuración y respaldos. No ejecutar cambios de IDs, truncados, `migrate reset` ni eliminar volúmenes.
2. Inventariar las versiones y filas reales, relaciones de pedidos/detalles, historial de subprocesos, usuarios/identidades y auditoría. La ausencia de pedidos por sí sola no demuestra que no haya referencias importantes.
3. Si hay datos que preservar, diseñar y revisar una migración específica con correspondencias semánticas y comprobación de claves foráneas, conteos y auditoría. Ensayarla sobre una copia recuperable y preparar un plan de vuelta a la versión anterior antes del corte. **No existe una conversión automática soportada de ese catálogo en este cambio.**
4. Si se confirma que no existe información que transferir, planificar explícitamente una instalación separada con el contrato actual, conservando la anterior hasta validar el reemplazo. No reutilizar ni sobrescribir el volumen incompatible como atajo.

## Regresión

```bash
node --test capaServidor/test/mysqlUpdatePreflight.test.js
node --test deploy/mysql/backup.test.mjs
```

Cubren catálogo histórico, catálogo actual, discrepancias parciales, historial inválido, lectura sin escrituras, migraciones pendientes, orden de operaciones y fallo posterior de migración. Complementar con comprobación real en el Docker de prueba, disponibilidad y una escritura funcional después del rechazo anticipado y del update compatible.

Referencias: [transacciones MySQL 8.4](https://dev.mysql.com/doc/refman/8.4/en/commit.html) y [migraciones de producción Prisma 7](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/development-and-production).

## Fecha operativa de producción

La carga diaria usa el día calendario de `America/Santiago`, tanto al consultar
como al guardar. No depende de `TZ` del host o contenedor ni de un offset fijo.
Una operación de guardado conserva el día que seleccionó al comenzar, incluso
si termina después de medianoche. Las fechas explícitas `YYYY-MM-DD` mantienen
su significado de fecha calendario. Esta corrección no modifica ni migra
registros existentes; los datos de prueba previos conservan su fecha original.

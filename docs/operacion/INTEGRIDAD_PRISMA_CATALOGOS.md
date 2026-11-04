# Integridad de Prisma, catálogos y producción

## Alcance

Rama `fix/integridad-prisma-catalogos`, creada desde `main` (`312e28b`).
Solo instalación nueva en Docker: no importa datos de Aiven ni convierte instalaciones anteriores.
No se fusiona en `main` ni se despliega al cliente.

## Contrato funcional v1

`shared/businessCatalog.js` centraliza versión, IDs, nombres de estados, productos,
flujos y valor inicial de capacidad. `mysqlLabCatalog.js` materializa los catálogos.

| Producto | ID | Subprocesos, en orden |
|---|---:|---|
| Lanyard | 1 | 1 Impresion → 2 Sublimacion → 3 Corte → 4 Costura → 5 Empaquetado |
| Tarjeta | 2 | 6 Revision info → 7 Orden info → 8 Carga info → 9 Confeccion → 5 Empaquetado |
| Yoyo | 3 | 10 Ensamblado → 5 Empaquetado |

Siete estados de pedido, diez subprocesos y doce relaciones. El estado final es
`Terminado`, ID 5, orden Kanban 4. Se conservan los demás estados y estructuras,
incluidos origen de líneas, `PrivacySubmission` y `fecha_real_termino`.

El catálogo distingue invariantes de configuración: Lanyard comienza con capacidad
1200; solo ese producto permite editarla, entre 1 y 10000. El seed conserva el valor
guardado. Repetirlo no duplica filas. Un catálogo incompatible se rechaza; el
preflight del instalador lo comprueba antes de aplicar migraciones. La validación
rechaza faltantes, productos adicionales, relaciones incorrectas y órdenes incorrectos.
Las etiquetas adicionales creadas por los flujos de negocio siguen permitidas.

## Migración nueva

`202611030001_catalog_identity_integrity` se agrega a las 16 migraciones existentes,
cuyos archivos y checksums se conservan.

- `Usuario.id_keycloak`: obligatorio y único; cotejamiento `utf8mb4_bin` compatible
  con `ExternalIdentity.subject`.
- FK compuesta `ExternalIdentity(user_id, subject)` a
  `Usuario(id_usuario, id_keycloak)`, con índices únicos correspondientes.
- `Estado_Pedido.orden_kanban`: obligatorio y único.
- `Producto_Subproceso.orden_flujo`: obligatorio y único por producto.

La FK impide identidades discordantes. La creación conjunta de usuario y vínculo
sigue siendo responsabilidad de la transacción de alta y del primer usuario.
La autenticación exige un vínculo válido y el repositorio rechaza subjects vacíos.

## Comportamiento

- Creación y reevaluación validan el flujo completo antes de persistir detalles.
- El motor recorre las relaciones de subprocesos guardadas en la base.
- Cierre, exclusión de pedidos terminales, retención y consultas de métricas usan
  IDs canónicos. Una etapa ausente genera `INVALID_ORDER_CATALOG` (500).
- Se mantienen pago confirmado, programación válida, permisos, PIN y avance
  completo de Lanyard. El ciclo de Lanyard se repite antes de empaquetar mientras
  su porcentaje sea menor que 100.
- La consulta de carga lee la capacidad guardada. El registro de carga vuelve a
  leerla dentro de su transacción y la guarda como referencia del nuevo avance.
  Editar capacidad no recalcula registros históricos. El porcentaje de avance
  sigue siendo unidades acumuladas / unidades solicitadas.
- El indicador histórico de vendedores conserva su regla: carga mayor que 900.
- La pantalla Kanban permite editar la capacidad de Lanyard con el permiso
  existente `manage:production-capacity`; no incorpora rutas nuevas.
- Se preserva la conciliación de rol desde Keycloak. Un token antiguo no puede
  revertir la conciliación: se contrasta con el rol actual si difiere del local.
  Esto no cambia la política existente de vencimiento de tokens.

## Instalación nueva

Usar `deploy/mysql.env.example`, `capaServidor/env.example` y `capaVista/env.example`
para preparar archivos locales; asignar un `COMPOSE_PROJECT_NAME`, directorios de
certificados e imágenes distintos de instalaciones existentes. No reutilizar sus
volúmenes. Configurar certificado HTTPS válido para el origen y confianza del
navegador; MySQL y API verifican sus CA específicas.

```bash
bash deploy/mysql/manage.sh check --env-file /ruta/al/deploy.env
bash deploy/mysql/manage.sh install --env-file /ruta/al/deploy.env
bash deploy/mysql/manage.sh first-user --env-file /ruta/al/deploy.env
bash deploy/mysql/manage.sh verify --env-file /ruta/al/deploy.env
```

El modo producción admite `SALES_NOTE_SOURCE=unavailable`; las notas sintéticas
requieren un entorno de pruebas explícito. Este cambio no implementa la fuente
externa de notas de venta.

## Comprobaciones reproducibles

- `npm --prefix capaServidor run prisma:validate`
- Pruebas `capaServidor/test/*.test.js` y pruebas de altas/actualizaciones en
  `capaServidor/src/modules/users/service/`.
- `npm --prefix capaVista run lint`, `npm --prefix capaVista run build` y
  `npm --prefix capaVista test`.
- `scripts/verifyCatalogIntegrity.mjs`: restricciones reales, seed repetido,
  capacidad 1500, catálogos incompletos, pedidos individuales y mixtos, bloqueos,
  cierre único y métricas. Revierte sus pedidos y usuarios sintéticos; conserva
  capacidad 1500 para comprobar persistencia.
- `scripts/verifyProductionConcurrency.mjs`: transacciones concurrentes reales de
  avance, retroceso, empaquetado y ambos cierres. Conserva un pedido sintético en
  el laboratorio para consultar su auditoría.

Los dos scripts físicos solo funcionan con proyecto `itecsa-integrity-*` y
`INTEGRITY_CHECK_CONFIRM=DB_NAME`. Usar el servicio `db-verify` para heredar red,
CA e identidad del volumen. El segundo requiere un usuario Soporte ya vinculado.
Nunca ejecutarlos sobre una instalación del cliente.

## Evidencia de esta ejecución

Laboratorio: `itecsa-integrity-20261103`. Los contenedores y volúmenes anteriores
permanecieron intactos. No se modificó Aiven. No se instaló una CA en el sistema.

| Comprobación | Resultado |
|---|---|
| Instalación limpia MySQL 8.4, 17 migraciones y checksums | Pasa |
| Diferencia Prisma vs MySQL | Ninguna |
| Restricciones de identidad y órdenes | Pasa en MySQL real |
| Seed repetido y capacidad 1500 tras reinicio | Pasa |
| API de capacidad: edición exclusiva de Lanyard | Pasa con usuario real |
| Historial, calendario y exclusión del Kanban activo | Pasa por HTTP autenticado |
| Flujos 5/5/2 y pedido mixto hasta Terminado | Pasa en MySQL real |
| Pago, programación, paso incorrecto, Lanyard incompleto | Bloqueos comprobados |
| Avance, retroceso y cierre concurrentes | Una transición válida por operación |
| Primer Soporte, contraseña temporal, primer acceso y PIN | Pasa con Keycloak real por OAuth PKCE y HTTP |
| Alta normal y prohibición de alta privilegiada | Pasa con Keycloak y API reales |
| Gerencia, Soporte y Desarrollador asignados en Keycloak | Pasa; rol conciliado y token anterior rechazado |
| Backend: 434 pruebas en 35 archivos | Pasa |
| Frontend: 534 pruebas completas y 34 dirigidas, incluidas 2 nuevas | Pasa |
| Lint y build frontend | Pasa |
| Navegador integrado | Pendiente: `ERR_CERT_AUTHORITY_INVALID` |

La prueba visual completa requiere confiar en la CA local del laboratorio. Se
solicitó autorización para instalarla temporalmente y retirarla al terminar,
respetando la petición previa de no conservar certificados en el equipo. Las
pruebas HTTP verifican TLS con esa CA explícita; no sustituyen la aceptación visual.
Por esta comprobación pendiente, todavía no se declara listo para despliegue.

Resumen verificable: [evidencias/integridad-20261103.json](evidencias/integridad-20261103.json).

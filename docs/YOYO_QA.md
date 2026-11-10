# Validación del flujo Yoyo — issue #47

La auditoría no había demostrado una regresión de Yoyo. Esta tarea incorpora
pruebas del comportamiento vigente; no modifica el catálogo, los permisos ni el
motor productivo. La integración real con Manager permanece fuera de alcance.

## Escenario esperado

Un pedido sintético con una línea Yoyo debe conservar el producto **Yoyo**, su
cantidad y la referencia a la nota de venta. El tipo productivo es 3 y su flujo
es **Ensamblado (10) → Empaquetado (5)**: el orden de ejecución viene de
`orden_flujo`, no del valor numérico del ID del subproceso.

Al crear el pedido comienza en Confirmación de Pago, con Ensamblado pendiente y
sin programación productiva automática. Para entrar a producción necesita pago
confirmado, programación y un actor autorizado. En producción puede completar
Ensamblado y después Empaquetado. Al completar ambos puede pasar a Listo para
Entrega; Yoyo no requiere porcentaje de avance Lanyard. El API sigue exigiendo
los permisos y el actor validado por PIN para las operaciones correspondientes.

La prueba de despliegue utiliza la nota sintética `ITG-47-20261109-YOYO`, creada
mediante el servicio transaccional existente e identificada como prueba. No
habilita rutas demo ni reemplaza la fuente Manager de la instalación.

## Regresiones automatizadas

Ejecutar desde la raíz:

```sh
node --test capaServidor/test/yoyoFlow.test.js capaVista/test/yoyoContract.test.mjs
```

Las 18 pruebas ejecutan las funciones reales de negocio, mapeo y frontend con
un doble de almacenamiento en memoria. Cubren:

- Normalización de la subfamilia Yoyo, separación de accesorios no productivos y
  rechazo de cantidades inválidas.
- Catálogo MySQL inconsistente (proceso faltante, orden invertido o producto con
  ID incorrecto): la creación falla de forma explícita.
- Creación mediante el servicio y el contexto productivo: ID de producto,
  proceso inicial, cantidad, snapshot de la línea y auditoría de importación.
- Secuencia completa 10 → 5, bloqueo de saltos y procesos ajenos, rechazo fuera
  de producción o con pago pendiente, actor ausente y solicitudes repetidas.
- Barrera de actualización condicional: un conflicto no duplica la auditoría.
- Retroceso al proceso anterior y reapertura de Empaquetado completado.
- Finalización sólo después de completar ambos procesos, sin exigir avance
  Lanyard; un Yoyo terminado no evita validar el Lanyard de un pedido mixto.
  Un operario de producción puede finalizar y uno de ventas no.
- DTO backend → serialización JSON → parser y normalización frontend: nombres,
  cantidad y secuencia de procesos, filtro Yoyo y habilitación de entrega.

Estas pruebas no simulan autenticación JWT/PIN, aislamiento real de transacciones
ni renderizan el navegador. Esos controles se contrastan en el despliegue real.
La integración continua ejecuta ambas suites.

## Procedimiento para el despliegue real

1. Registrar revisión e image ID de `api` y `web` en `compose.mysql.yaml`.
2. Confirmar la nota de prueba, cantidad, detalle y etapa mediante el API.
3. Entrar con un rol autorizado de producción, abrir el pedido en Kanban y
   verificar producto, cantidad, Ensamblado y Empaquetado en su orden correcto.
4. Completar Ensamblado con el PIN personal mediante el navegador. Volver a
   consultar: Ensamblado debe aparecer completado y Empaquetado pendiente.
5. Completar Empaquetado y finalizar producción si ese es el escenario elegido.
   Cerrar/reabrir el detalle y consultar el API para comprobar persistencia.
6. Abrir el pedido con un rol que sólo pueda consultar; las acciones de producción
   no deben estar habilitadas. Los intentos API no autorizados deben rechazarse.
7. Registrar sólo número sintético, IDs de prueba, estado/procesos, rol, revisión,
   image IDs y resultados. No incluir tokens, PIN, contraseñas ni datos reales.

## Evidencia del despliegue

Resultado: **no se reprodujo una regresión de Yoyo** en el escenario ejecutado.

- Verificación final: `2026-11-10T02:37:20Z` (9 de noviembre, 23:37 en Santiago).
- Despliegue real de prueba: `compose.mysql.yaml`, servicios saludables, HTTPS
  con la CA de prueba instalada; no se utilizó la conexión externa con Manager.
- Revisión: `f9958c7f901813a3fc28810f1bf258c81ecba9ea`.
- Imagen API: `itecsa-api:integridad-f9958c7f9018`;
  ID `sha256:d9d7910a0c32ceb2bb64e6c3877337d44178dcdc9fe822ff5a9b1c29cc85215e`.
- Imagen web: `itecsa-web:integridad-f9958c7f9018`;
  ID `sha256:30bca3df8e104a0241c84d50fea6d045a654e23fdc7db77d7e90bfd2e4ff1d5b`.
- Nota sintética: `ITG-47-20261109-YOYO`, pedido **5**, detalle **5**, cantidad
  **25**, fecha programada **2026-11-11**.

| Paso real | Resultado observado |
|---|---|
| Preparación por servicio transaccional y API con actor/PIN | Pedido creado; pago confirmado, fecha asignada y entrada a producción aceptadas. |
| Abrir detalle con Administrador de Producción | Producto Yoyo, cantidad 25; Ensamblado en curso y Empaquetado bloqueado por secuencia. |
| Completar Ensamblado (10) por navegador y PIN | Ensamblado completado; Empaquetado pasa a estar en curso. |
| Completar Empaquetado (5) por navegador y PIN | Ambos procesos completados; aparece la acción Finalizar producción. |
| Confirmar Finalizar producción por navegador y PIN | La tarjeta pasa a Listo para Entrega, etapa general 3. |
| Relectura HTTPS desde otra sesión, rol Desarrollador | `GET /orders/5/kanban-detail` devuelve 200: Yoyo/25, procesos 10 y 5 con `status: done`, etapa 3. |
| Consultar carga operativa | `GET /production-load/today` devuelve 200 y excluye el detalle Yoyo de la carga diaria de Lanyard. |

La evidencia privada de esa ejecución se conserva en
`tmp/integridad-20261109/issue47-fixtures.json`, `issue47-after.json`,
`issue47-browser-complete.png`, `issue47-browser-after.png` y
`issue47-browser-after.txt`. No se incorporan al repositorio credenciales ni
capturas con datos de cuentas; la tabla anterior es la evidencia curada.

Los casos de catálogo incorrecto, roles no autorizados, conflictos y reintentos
están cubiertos por pruebas automatizadas. El recorrido real descrito verifica
producción hasta Listo para Entrega; no afirma validar la fuente Manager real,
pruebas de carga ni todas las combinaciones posibles de pedidos mixtos.

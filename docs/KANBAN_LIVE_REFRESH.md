# Actualización del Kanban entre sesiones

El tablero consulta cambios automáticamente mientras la página está visible y
hay conexión. El intervalo `VITE_KANBAN_REFRESH_MS` se configura en
`deploy/mysql.env` para Compose o como variable Vite en desarrollo. Acepta
enteros de 10000 a 300000 milisegundos; valores ausentes o inválidos usan 30000.
La configuración pública de Nginx se genera al iniciar el contenedor, sin
recompilar el frontend. Después de cambiarla, recrear `web` y recargar la página.

El intervalo empieza **después** de terminar la lectura. Una petición lenta no
se solapa con la siguiente. Las fallas conservan la última vista y muestran un
aviso persistente, con reintentos exponenciales y jitter hasta cinco minutos.
401/403 o sesión inválida detienen el lector hasta establecer otra sesión.
Ocultar la pestaña o perder conexión cancela lecturas; al volver se realiza una
sola actualización si la vista está vencida o se canceló una lectura. Cambiar filtros o identidad elimina el lector anterior.

## Paginación e interacción

La primera consulta conserva el límite de 100 pedidos y «Cargar más» agrega
bloques de 50. Cada refresco recorre desde el primer bloque hasta alcanzar el ID
más antiguo ya cargado, empleando los nuevos cursores. La vista se publica de una
vez al completar la ventana; una falla intermedia no borra pedidos no visitados.
Las altas se incorporan y las bajas/cancelaciones desaparecen de la ventana
consultada, incluidas las páginas posteriores a la primera.

La API actual no entrega una instantánea transaccional entre páginas. Si otra
sesión modifica datos durante el recorrido, la siguiente consulta converge.
Se limita cada recorrido a las páginas previamente cargadas más 20 bloques de
margen. Ante cambios masivos o cursores repetidos se conserva la vista anterior
y aparece el aviso de reintento, en lugar de eliminar tarjetas sin evidencia.

El refresco no activa el indicador inicial, ni desmonta las columnas ni limpia
expansiones. Los resúmenes conservan referencias cuando no cambian. Arrastre,
validación previa, modal de confirmación y escrituras suspenden las lecturas;
se desechan respuestas anteriores y se consulta después de liberar la última
operación. El detalle abierto conserva su DTO completo y sus formularios: no se
reemplaza con el resumen. Para consultar cambios externos del detalle se cierra
y vuelve a abrir. Los permisos y las transiciones siempre se validan en la API.

Cada refresco completo del tablero solicita también la carga operativa mediante
el coordinador existente, que preserva borradores y detecta conflictos. Cambios
locales de carga invalidan la ventana cargada sin reiniciar la paginación.

## Verificación y dimensionamiento

`node --test capaVista/test/kanbanLiveRefresh.test.mjs` cubre varias páginas,
altas/bajas/cambios, fallas parciales, lecturas tardías, escrituras concurrentes,
arrastre/cancelación, filtros/sesiones, conexión, reintentos y límites del intervalo.
La integración continua ejecuta esta suite además de las regresiones de carga.

Prueba funcional con dos sesiones autorizadas:

1. En A, abrir Kanban, cargar al menos 200 pedidos, expandir/contraer tarjetas y
   mantener un detalle con un borrador. En B, crear un pedido y cambiar/cancelar
   otros de la segunda o tercera página mediante los flujos normales.
2. Esperar un ciclo completo en A: aparecen las altas, se actualizan etapas y
   carga, desaparecen las bajas. El detalle y su borrador permanecen intactos;
   al cerrarlo y abrirlo se consulta el detalle actual.
3. Mantener un arrastre o confirmación mientras vence el intervalo; el tablero
   no debe cambiar debajo del puntero ni revertir la etapa después del PATCH.
4. Cambiar filtros, ocultar/mostrar la pestaña, cortar/restaurar conexión y
   cerrar/iniciar sesión durante una consulta. No deben reaparecer datos del
   filtro o identidad anterior, ni peticiones periódicas en segundo plano.

El costo aproximado por sesión activa es `(P + 1)` consultas por ciclo, con `P`
páginas de resumen y una de carga; la consulta inicial agrega estados del Kanban.
Treinta segundos es un valor inicial configurable, no un objetivo de rendimiento
certificado. Antes de reducirlo medir latencia p95, bytes, sesiones simultáneas y
uso del pool MySQL en el despliegue representativo. No se consulta un detalle por
tarjeta ni se realiza polling desde pestañas ocultas.

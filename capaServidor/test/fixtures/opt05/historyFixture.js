import { Prisma } from '@prisma/client';

export const header = {id_pedido:1,numero_nota_venta:'SYN-1',fecha_creacion:new Date('2024-09-01'),fecha_estimada_termino:new Date('2024-09-10'),nombre_cliente:'Cliente ñ',razon_social:'Razón social',id_usuario:1,nombre_usuario:'Ana',apellido_usuario:'Sintética',nombre_etapa:'En producción',nombre_estado_pago:'Pendiente'};
export const tracked = [1,2].map(id=>({id_detalle_pedido:id,cantidad:id===1?901:null,fecha_estimada_termino:new Date('2024-09-10'),fecha_real_termino:id===1?new Date('2024-09-09'):null,nombre_producto:id===1?'Lanyard':null,nombre_estado:id===1?'Corte':null}));
export const untracked = [{id_item_sin_seguimiento:1,producto:'Accesorio ñ',cantidad:3}];
export const labels = [{nombre_etiqueta:'Alta'},{nombre_etiqueta:'Urgente'},{nombre_etiqueta:'Urgente'}];
export const children = [...tracked.map(row=>({kind:0,...row})),...untracked.map(row=>({kind:1,...row})),...labels.map(row=>({kind:2,...row}))];
export function eventRows(count=10) {
 return Array.from({length:count},(_,i)=>{
  const id=count-i,kind=id%6,at=new Date(1725768000000+Math.floor(id/5)*1000);
  return {ID_REGISTRO:id,FECHA_HORA:at,id_usuario_visible:1,nombre_usuario_visible:'Ana',apellido_usuario_visible:'Sintética',
   observacion_visible:kind===2?'Avance Lanyard: 40% (4/10 producidos) | Corrección.':kind===3?'Fecha de termino definida para 10-09-2024':kind===4?'Cancelación / retroceso':null,
   stage_record_id:kind===0?id:null,stage_entered_at:kind===0?at:null,stage_exited_at:kind===0?new Date(at.getTime()+500):null,stage_name:kind===0?'Producción':null,
   payment_record_id:kind===1?id:null,payment_observation:kind===1?'Privado OPT05':null,previous_payment_status:kind===1?'Pendiente':null,next_payment_status:kind===1?'Pagado':null,
   subprocess_record_id:kind===2?id:null,subprocess_entered_at:kind===2?at:null,subprocess_exited_at:kind===2?new Date(at.getTime()+1000):null,subprocess_name:kind===2?'Corte':null,product_name:kind===2?'Lanyard':null};
 });
}

// All fixture tables are CTEs inside SELECT, never persistent business rows.
const sources=({newer=false,changedStatus=false}={})=>Prisma.sql`WITH
Pedidos AS (
 SELECT 1 AS id_pedido,'SYN_ñ%' AS numero_nota_venta,CAST('2024-09-01' AS DATE) AS fecha_creacion,CAST('2024-09-10' AS DATE) AS fecha_estimada_termino,1 AS id_usuario,1 AS id_cliente,${changedStatus?3:1} AS id_estado_pedido,2 AS id_estado_pago
 UNION ALL SELECT 2,'ABC-2',CAST('2024-09-08' AS DATE),NULL,NULL,2,2,1
 UNION ALL SELECT 3,'No cliente',CAST('2024-10-01' AS DATE),NULL,NULL,NULL,NULL,NULL
 UNION ALL SELECT 4,'SYN-4',NULL,NULL,NULL,1,3,1
 UNION ALL SELECT 5,'SYN-new',CAST('2024-10-02' AS DATE),NULL,NULL,NULL,NULL,NULL WHERE ${newer?1:0}=1
),Cliente AS (SELECT 1 AS id_cliente,'Cliente Ána' AS nombre_cliente,'Razón Social ñ' AS razon_social UNION ALL SELECT 2,NULL,NULL),
Usuario AS (SELECT 1 AS id_usuario,'Ana' AS nombre_usuario,'Sintética' AS apellido_usuario),
Estado_Pedido AS (SELECT 1 AS id_estado_pedido,'Confirmación de Pago' AS nombre_etapa,1 AS orden_kanban UNION ALL SELECT 2,'En producción',2 UNION ALL SELECT 3,'Cancelado',NULL),
Estado_Pago AS (SELECT 1 AS id_estado_pago,'Pendiente' AS nombre_estado_pago UNION ALL SELECT 2,'Pagado'),
Tipo_Producto AS (SELECT 1 AS id_tipo_producto,'Lanyard' AS nombre_producto),
Estado_Subprocesos AS (SELECT 1 AS id_estado_subproceso,'Corte' AS nombre_estado),
Detalle_pedido AS (
 SELECT 1 AS id_detalle_pedido,1 AS id_pedido,901 AS cantidad,CAST('2024-09-10' AS DATE) AS fecha_estimada_termino,CAST('2024-09-09' AS DATE) AS fecha_real_termino,1 AS id_tipo_producto,1 AS id_estado_subproceso
 UNION ALL SELECT 2,1,NULL,CAST('2024-09-11' AS DATE),NULL,NULL,NULL
),Pedido_Item_Sin_Seguimiento AS (SELECT 1 AS id_item_sin_seguimiento,1 AS id_pedido,'Accesorio ñ' AS producto,3 AS cantidad),
etiqueta AS (SELECT 1 AS id_etiqueta,'Alta' AS nombre_etiqueta UNION ALL SELECT 2,'Urgente'),
Pedido_Etiqueta AS (SELECT 1 AS id_pedido,1 AS id_etiqueta UNION ALL SELECT 1,2 UNION ALL SELECT 1,2),
Registros AS (
 SELECT 1 AS ID_REGISTRO,1 AS id_pedido,1 AS id_usuario,CAST('2024-09-08 04:00:00' AS DATETIME) AS FECHA_HORA,'Pedido registrado desde Nota de Venta.' AS observacion
 UNION ALL SELECT 2,1,1,CAST('2024-09-08 04:00:00' AS DATETIME),'Referencia privada OPT05 $123'
 UNION ALL SELECT 3,1,1,CAST('2024-09-08 04:00:00' AS DATETIME),'Avance Lanyard: 40% (4/10 producidos) | Corrección.'
 UNION ALL SELECT 4,1,1,CAST('2024-09-08 04:00:00' AS DATETIME),'Fecha de termino definida para 10-09-2024'
 UNION ALL SELECT 5,1,1,CAST('2024-09-08 04:00:00' AS DATETIME),'Cancelación / retroceso / corrección'
 UNION ALL SELECT 6,1,99,CAST('2024-09-08 04:00:00' AS DATETIME),NULL
 UNION ALL SELECT 7,1,1,CAST('2024-09-08 04:00:00' AS DATETIME),'Cambio de etapa'
 UNION ALL SELECT 8,1,1,CAST('2024-09-08 04:00:01' AS DATETIME),'Nuevo evento' WHERE ${newer?1:0}=1
),Registro_Etapas AS (
 SELECT 1 AS id_registro,1 AS id_estado_pedido,CAST('2024-09-08 04:00:00' AS DATETIME) AS fecha_hora_entrada,CAST('2024-09-08 04:00:01' AS DATETIME) AS fecha_hora_salida
 UNION ALL SELECT 7,2,CAST('2024-09-08 04:00:00' AS DATETIME),CAST('2024-09-08 04:00:00' AS DATETIME)
),Registro_Pago AS (SELECT 2 AS id_registro,'Monto privado OPT05' AS observacion,1 AS id_estado_pago_anterior,2 AS id_estado_pago_nuevo),
registro_subprocesos AS (SELECT 3 AS id_registro,1 AS id_detalle_pedido,1 AS id_estado_subproceso,CAST('2024-09-08 04:00:00' AS DATETIME) AS fecha_hora_entrada,CAST('2024-09-08 04:00:01' AS DATETIME) AS fecha_hora_salida)`;

export function fixtureSqlClient(db, options) {
 const tables=sources(options);
 return {
  $queryRaw:query=>db.$queryRaw(Prisma.sql`${tables} ${query}`),
  $queryRawUnsafe:(query,...values)=>{
   // Static frozen query, converted to bound Sql fragments; no input interpolation.
   const body=Prisma.sql(query.split('?'),...values);
   return db.$queryRaw(Prisma.sql`${tables} ${body}`);
  },
 };
}

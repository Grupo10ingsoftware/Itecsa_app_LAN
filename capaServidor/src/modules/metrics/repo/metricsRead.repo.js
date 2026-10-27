import { Prisma } from '@prisma/client';
import { ORDER_STATUS } from '../../../config/status.js';

// Keep individual rows and JS rounding: SQL collation/grouping and date arithmetic
// need not have the same semantics as the public metrics calculations.
export const productionQuery = ({ start, end }) => Prisma.sql`
 SELECT d.cantidad, t.nombre_producto FROM Detalle_pedido d
 LEFT JOIN Tipo_Producto t ON t.id_tipo_producto=d.id_tipo_producto
 WHERE d.fecha_real_termino>=${start} AND d.fecha_real_termino<${end}
 ORDER BY d.id_detalle_pedido`;

export const stagesQuery = ({ start, end }) => Prisma.sql`
 SELECT r.fecha_hora_entrada, r.fecha_hora_salida, e.nombre_etapa
 FROM Registro_Etapas r LEFT JOIN Estado_Pedido e ON e.id_estado_pedido=r.id_estado_pedido
 WHERE r.fecha_hora_entrada>=${start} AND r.fecha_hora_entrada<${end}
 AND r.fecha_hora_salida IS NOT NULL ORDER BY r.id_registro`;

export const subprocessesQuery = ({ start, end }) => Prisma.sql`
 SELECT r.fecha_hora_entrada, r.fecha_hora_salida, e.nombre_estado, t.nombre_producto
 FROM registro_subprocesos r
 LEFT JOIN Estado_Subprocesos e ON e.id_estado_subproceso=r.id_estado_subproceso
 LEFT JOIN Detalle_pedido d ON d.id_detalle_pedido=r.id_detalle_pedido
 LEFT JOIN Tipo_Producto t ON t.id_tipo_producto=d.id_tipo_producto
 WHERE r.fecha_hora_entrada>=${start} AND r.fecha_hora_entrada<${end}
 AND r.fecha_hora_salida IS NOT NULL ORDER BY r.id_registro`;

export const performanceQuery = ({ start, end }) => Prisma.sql`
 SELECT p.fecha_estimada_termino,
 (SELECT e.fecha_hora_entrada FROM Registros r
 JOIN Registro_Etapas e ON e.id_registro=r.ID_REGISTRO
 JOIN Estado_Pedido s ON s.id_estado_pedido=e.id_estado_pedido
 WHERE r.id_pedido=p.id_pedido AND s.nombre_etapa=${ORDER_STATUS.LISTO_ENTREGA}
 AND e.fecha_hora_entrada IS NOT NULL
 ORDER BY e.fecha_hora_entrada DESC, r.ID_REGISTRO DESC LIMIT 1) AS readyAt
 FROM Pedidos p WHERE EXISTS (SELECT 1 FROM Registros r
 JOIN Registro_Etapas e ON e.id_registro=r.ID_REGISTRO
 JOIN Estado_Pedido s ON s.id_estado_pedido=e.id_estado_pedido
 WHERE r.id_pedido=p.id_pedido AND s.nombre_etapa=${ORDER_STATUS.LISTO_ENTREGA}
 AND e.fecha_hora_entrada>=${start} AND e.fecha_hora_entrada<${new Date(end.getTime()+86400000)})
 ORDER BY p.id_pedido`;

export async function readReportOrders(client, { start, end }) {
 // Disjoint rows avoid both detail x event fan-out and unbounded IN parameters.
 // One statement retains every detail and matching event, including null dates.
 const rows=await client.$queryRaw(Prisma.sql`
 WITH selected_orders AS (SELECT id_pedido,numero_nota_venta,fecha_creacion,fecha_estimada_termino,id_usuario
 FROM Pedidos WHERE fecha_creacion>=${start} AND fecha_creacion<${end})
 SELECT 0 AS kind,p.id_pedido,p.numero_nota_venta,p.fecha_creacion,p.fecha_estimada_termino,
 u.nombre_usuario,u.apellido_usuario,u.id_usuario AS relatedUser,
 NULL AS cantidad,NULL AS fecha_real_termino,NULL AS nombre_producto,
 NULL AS fecha_hora_entrada,NULL AS nombre_etapa,p.fecha_creacion AS sortDate,p.id_pedido AS sortId
 FROM selected_orders p LEFT JOIN Usuario u ON u.id_usuario=p.id_usuario
 UNION ALL
 SELECT 1,d.id_pedido,NULL,NULL,d.fecha_estimada_termino,NULL,NULL,NULL,
 d.cantidad,d.fecha_real_termino,t.nombre_producto,NULL,NULL,NULL,d.id_detalle_pedido
 FROM selected_orders p JOIN Detalle_pedido d ON d.id_pedido=p.id_pedido
 LEFT JOIN Tipo_Producto t ON t.id_tipo_producto=d.id_tipo_producto
 UNION ALL
 SELECT 2,r.id_pedido,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 e.fecha_hora_entrada,s.nombre_etapa,r.FECHA_HORA,r.ID_REGISTRO
 FROM selected_orders p JOIN Registros r ON r.id_pedido=p.id_pedido
 JOIN Registro_Etapas e ON e.id_registro=r.ID_REGISTRO
 JOIN Estado_Pedido s ON s.id_estado_pedido=e.id_estado_pedido
 WHERE s.nombre_etapa=${ORDER_STATUS.LISTO_ENTREGA}
 ORDER BY kind,sortDate,sortId`);
 const orders=rows.filter(r=>Number(r.kind)===0);
 const byId=new Map(orders.map(o=>[o.id_pedido,{
  id_pedido:o.id_pedido,numero_nota_venta:o.numero_nota_venta,fecha_creacion:o.fecha_creacion,
  fecha_estimada_termino:o.fecha_estimada_termino,
  Usuario:o.relatedUser==null?null:{nombre_usuario:o.nombre_usuario,apellido_usuario:o.apellido_usuario},
  Detalle_pedido:[],Registros:[],
 }]));
 for(const d of rows)if(Number(d.kind)===1)byId.get(d.id_pedido).Detalle_pedido.push({cantidad:d.cantidad,fecha_estimada_termino:d.fecha_estimada_termino,fecha_real_termino:d.fecha_real_termino,Tipo_Producto:d.nombre_producto==null?null:{nombre_producto:d.nombre_producto}});
 for(const e of rows)if(Number(e.kind)===2)byId.get(e.id_pedido).Registros.push({FECHA_HORA:e.sortDate,Registro_Etapas:{fecha_hora_entrada:e.fecha_hora_entrada,Estado_Pedido:{nombre_etapa:e.nombre_etapa}}});
 return [...byId.values()];
}

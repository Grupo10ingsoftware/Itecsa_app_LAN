import { Prisma } from '@prisma/client';

export const period = { from: '2024-09-01', to: '2024-09-30' };
export const range = { start: new Date('2024-09-01'), end: new Date('2024-10-01') };

// CTEs shadow physical tables only inside this read-only statement. No DDL/DML.
// General_ci deliberately admits near names that JS equality must reject.
const sources = Prisma.sql`
WITH Pedidos AS (
 SELECT 1 AS id_pedido,'SYN-1' AS numero_nota_venta,CAST('2024-09-01' AS DATE) AS fecha_creacion,
 CAST('2024-09-10' AS DATE) AS fecha_estimada_termino,1 AS id_usuario
 UNION ALL SELECT 2,'SYN-2',CAST('2024-09-01' AS DATE),NULL,NULL
 UNION ALL SELECT 3,'SYN-3',CAST('2024-09-01' AS DATE),NULL,1
 UNION ALL SELECT 4,'SYN-4',CAST('2024-09-01' AS DATE),CAST('2024-09-10' AS DATE),1
 UNION ALL SELECT 5,'SYN-5',CAST('2024-09-01' AS DATE),NULL,1
),Usuario AS (SELECT 1 AS id_usuario,'Sintético' AS nombre_usuario,'ñ' AS apellido_usuario),
Detalle_pedido AS (
 SELECT 1 AS id_detalle_pedido,1 AS id_pedido,901 AS cantidad,CAST('2024-09-10' AS DATE) AS fecha_estimada_termino,
 CAST('2024-09-09' AS DATE) AS fecha_real_termino,1 AS id_tipo_producto
 UNION ALL SELECT 2,1,3,CAST('2024-09-11' AS DATE),NULL,2
),Tipo_Producto AS (SELECT 1 AS id_tipo_producto,'Lanyard' AS nombre_producto UNION ALL SELECT 2,'lanyard'),
Estado_Pedido AS (
 SELECT 1 AS id_estado_pedido,_utf8mb4'Listo para entrega' COLLATE utf8mb4_general_ci AS nombre_etapa
 UNION ALL SELECT 2,_utf8mb4'listo para entrega' COLLATE utf8mb4_general_ci
 UNION ALL SELECT 3,_utf8mb4'Listo para entrega ' COLLATE utf8mb4_general_ci
 UNION ALL SELECT 4,_utf8mb4'Lísto para entrega' COLLATE utf8mb4_general_ci
),Registros AS (
 SELECT 1 AS ID_REGISTRO,1 AS id_pedido,CAST('2024-09-01 01:00:00' AS DATETIME) AS FECHA_HORA
 UNION ALL SELECT 2,1,CAST('2024-09-01 02:00:00' AS DATETIME)
 UNION ALL SELECT 3,1,CAST('2024-09-01 03:00:00' AS DATETIME)
 UNION ALL SELECT 4,1,CAST('2024-09-02 00:00:00' AS DATETIME)
 UNION ALL SELECT 6,2,CAST('2024-09-02 00:00:00' AS DATETIME)
 UNION ALL SELECT 5,2,CAST('2024-09-02 00:00:00' AS DATETIME)
 UNION ALL SELECT 7,3,CAST('2024-09-02 00:00:00' AS DATETIME)
 UNION ALL SELECT 8,4,CAST('2024-09-02 00:00:00' AS DATETIME)
 UNION ALL SELECT 9,4,CAST('2024-09-03 00:00:00' AS DATETIME)
),Registro_Etapas AS (
 SELECT 1 AS id_registro,2 AS id_estado_pedido,CAST('2024-09-01 01:00:00' AS DATETIME) AS fecha_hora_entrada
 UNION ALL SELECT 2,3,CAST('2024-09-01 02:00:00' AS DATETIME)
 UNION ALL SELECT 3,1,NULL
 UNION ALL SELECT 4,1,CAST('2024-09-02 00:00:00' AS DATETIME)
 UNION ALL SELECT 5,1,CAST('2024-09-02 00:00:00' AS DATETIME)
 UNION ALL SELECT 6,1,CAST('2024-09-03 00:00:00' AS DATETIME)
 UNION ALL SELECT 7,4,CAST('2024-09-02 00:00:00' AS DATETIME)
 UNION ALL SELECT 8,1,CAST('2024-09-10 00:00:00' AS DATETIME)
 UNION ALL SELECT 9,1,CAST('2024-09-03 00:00:00' AS DATETIME)
)`;

export function withReportFixture(query) {
 const [first, ...rest] = query.strings;
 if (!/^\s*WITH selected_orders\b/.test(first)) throw Error('Unexpected report query');
 const body = Prisma.sql([first.replace(/^\s*WITH /, ''), ...rest], ...query.values);
 return Prisma.sql`${sources}, ${body}`;
}

export function volumeFixture(orderCount, readyPerOrder) {
 const rows = [], reducedRows = [];
 for (let id = 1; id <= orderCount; id++) {
  const order = { kind: 0, id_pedido: id, numero_nota_venta: `SYN-${id}`, fecha_creacion: new Date('2024-09-01'),
   fecha_estimada_termino: new Date('2024-09-10'), relatedUser: 1, nombre_usuario: `Sintético ${id % 30}`, apellido_usuario: 'ñ' };
  rows.push(order); reducedRows.push(order);
  for (let detail = 0; detail < 2; detail++) {
   const row = { kind: 1, id_pedido: id, cantidad: id % 13, nombre_producto: detail ? 'Lanyard' : 'lanyard',
    fecha_estimada_termino: new Date('2024-09-10'), fecha_real_termino: id % 4 ? new Date('2024-09-09') : null };
   rows.push(row); reducedRows.push(row);
  }
  for (let event = 0; event < readyPerOrder; event++) {
   const row = { kind: 2, id_pedido: id, sortDate: new Date(1725235200000 + event * 1000),
    fecha_hora_entrada: event === 0 && id % 3 === 0 ? null : new Date(1725235200000 + event * 1000), nombre_etapa: 'Listo para entrega' };
   rows.push(row); if (event === 0) reducedRows.push(row);
  }
 }
 // Match the statement's disjoint order; input construction is outside timing.
 const compare = (a,b) => a.kind-b.kind || (a.sortDate??a.fecha_creacion??0)-(b.sortDate??b.fecha_creacion??0) || a.id_pedido-b.id_pedido;
 rows.sort(compare); reducedRows.sort(compare);
 return { rows, reducedRows };
}

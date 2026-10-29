import { Prisma } from '@prisma/client';

function orderConditions({status,search,dateRange,cursor}) {
    const filters = [];
    if (cursor) filters.push(Prisma.sql`p.id_pedido < ${cursor.id}`);
    if (status) filters.push(Prisma.sql`ep.nombre_etapa = ${status}`);
    if (search) {
        const pattern = `%${search}%`;
        filters.push(Prisma.sql`(p.numero_nota_venta LIKE ${pattern} OR c.nombre_cliente LIKE ${pattern} OR c.razon_social LIKE ${pattern})`);
    }
    if (dateRange?.start) filters.push(Prisma.sql`p.fecha_creacion >= ${dateRange.start}`);
    if (dateRange?.end) filters.push(Prisma.sql`p.fecha_creacion < ${dateRange.end}`);
    return filters.length ? Prisma.sql`WHERE ${Prisma.join(filters,' AND ')}` : Prisma.empty;
}

export function orderListQuery({status,search,dateRange,cursor,limit,page}) {
    return Prisma.sql`
        SELECT p.id_pedido,p.numero_nota_venta,p.fecha_creacion,
               c.id_cliente AS relatedClient,c.nombre_cliente,c.razon_social,
               ep.id_estado_pedido,ep.nombre_etapa,ep.orden_kanban
        FROM Pedidos p
        LEFT JOIN Cliente c ON c.id_cliente=p.id_cliente
        LEFT JOIN Estado_Pedido ep ON ep.id_estado_pedido=p.id_estado_pedido
        ${orderConditions({status,search,dateRange,cursor})}
        ORDER BY p.id_pedido DESC LIMIT ${limit+1}
        ${page ? Prisma.sql`OFFSET ${(page-1)*limit}` : Prisma.empty}`;
}

export function orderCountQuery({status,search,dateRange}) {
    return Prisma.sql`SELECT COUNT(*) AS total
        FROM Pedidos p
        LEFT JOIN Cliente c ON c.id_cliente=p.id_cliente
        LEFT JOIN Estado_Pedido ep ON ep.id_estado_pedido=p.id_estado_pedido
        ${orderConditions({status,search,dateRange})}`;
}

export const orderHeaderQuery = id => Prisma.sql`
    SELECT p.id_pedido,p.numero_nota_venta,p.fecha_creacion,p.fecha_estimada_termino,
           c.nombre_cliente,c.razon_social,u.id_usuario,u.nombre_usuario,u.apellido_usuario,
           ep.nombre_etapa,epa.nombre_estado_pago
    FROM Pedidos p
    LEFT JOIN Cliente c ON c.id_cliente=p.id_cliente
    LEFT JOIN Usuario u ON u.id_usuario=p.id_usuario
    LEFT JOIN Estado_Pedido ep ON ep.id_estado_pedido=p.id_estado_pedido
    LEFT JOIN Estado_Pago epa ON epa.id_estado_pago=p.id_estado_pago
    WHERE p.id_pedido=${id} LIMIT 1`;

// Disjoint rows retain every child without multiplying products by labels.
// Header and this read remain parallel, alongside the independent event read.
export const orderChildrenQuery = id => Prisma.sql`
    SELECT 0 AS kind,d.id_detalle_pedido,NULL AS id_item_sin_seguimiento,
           d.cantidad,d.fecha_estimada_termino,d.fecha_real_termino,
           tp.nombre_producto,es.nombre_estado,NULL AS producto,NULL AS nombre_etiqueta
    FROM Detalle_pedido d
    LEFT JOIN Tipo_Producto tp ON tp.id_tipo_producto=d.id_tipo_producto
    LEFT JOIN Estado_Subprocesos es ON es.id_estado_subproceso=d.id_estado_subproceso
    WHERE d.id_pedido=${id}
    UNION ALL
    SELECT 1,NULL,id_item_sin_seguimiento,cantidad,NULL,NULL,NULL,NULL,producto,NULL
    FROM Pedido_Item_Sin_Seguimiento WHERE id_pedido=${id}
    UNION ALL
    SELECT 2,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,e.nombre_etiqueta
    FROM Pedido_Etiqueta pe INNER JOIN etiqueta e ON e.id_etiqueta=pe.id_etiqueta
    WHERE pe.id_pedido=${id}
    ORDER BY kind,id_detalle_pedido,id_item_sin_seguimiento,nombre_etiqueta`;

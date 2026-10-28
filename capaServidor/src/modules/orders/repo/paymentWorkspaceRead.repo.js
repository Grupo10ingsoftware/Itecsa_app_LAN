import { Prisma } from '@prisma/client';

// Counts cover search/date, never selected status or cursor. Keep both queries
// independent so the page and its summary still use one concurrent SQL wave.
function conditions({ search, from, to }) {
  const where = [Prisma.sql`1=1`];
  if (search) {
    const pattern = `%${search}%`;
    where.push(Prisma.sql`(p.numero_nota_venta LIKE ${pattern} OR c.nombre_cliente LIKE ${pattern}
      OR c.razon_social LIKE ${pattern} OR c.rut_cliente LIKE ${pattern})`);
  }
  if (from) where.push(Prisma.sql`p.fecha_creacion >= ${from}`);
  if (to) where.push(Prisma.sql`p.fecha_creacion < ${to}`);
  return where;
}

export async function readPaymentPage(client, filters) {
  const where = conditions(filters);
  if (filters.cursor) where.push(Prisma.sql`p.id_pedido < ${filters.cursor.id}`);
  if (filters.status) where.push(Prisma.sql`s.nombre_estado_pago = ${filters.status}`);
  return client.$queryRaw(Prisma.sql`SELECT p.id_pedido, p.numero_nota_venta, p.fecha_creacion,
    p.id_estado_pago, c.nombre_cliente, c.razon_social, c.rut_cliente, s.nombre_estado_pago AS estado_pago
    FROM Pedidos p LEFT JOIN Cliente c ON c.id_cliente=p.id_cliente
    LEFT JOIN Estado_Pago s ON s.id_estado_pago=p.id_estado_pago
    WHERE ${Prisma.join(where, ' AND ')} ORDER BY p.id_pedido DESC LIMIT ${filters.limit + 1}`);
}

export async function readPaymentCounts(client, filters) {
  const rows = await client.$queryRaw(Prisma.sql`SELECT
    COALESCE(SUM(s.nombre_estado_pago = 'Pendiente'), 0) AS pending,
    COALESCE(SUM(s.nombre_estado_pago = 'Rechazado'), 0) AS rejected,
    COALESCE(SUM(s.nombre_estado_pago = 'Confirmado'), 0) AS confirmed
    FROM Pedidos p LEFT JOIN Cliente c ON c.id_cliente=p.id_cliente
    JOIN Estado_Pago s ON s.id_estado_pago=p.id_estado_pago
    WHERE ${Prisma.join(conditions(filters), ' AND ')}`);
  // Compare status names inside MySQL, preserving the COUNT filters' collation.
  const row = rows[0];
  return { pending: Number(row?.pending ?? 0), rejected: Number(row?.rejected ?? 0), confirmed: Number(row?.confirmed ?? 0) };
}

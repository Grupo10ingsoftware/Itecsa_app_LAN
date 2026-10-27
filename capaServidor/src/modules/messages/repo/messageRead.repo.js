import { Prisma } from '@prisma/client';

const columns = Prisma.raw('m.id_mensaje, m.contenido, m.fecha_publicacion, m.Asunto, m.id_pedido, mu.`leido?` AS leido, mu.`oculto?` AS oculto, p.id_pedido AS relatedId, p.numero_nota_venta, p.fecha_creacion, p.fecha_estimada_termino');
const joins = Prisma.raw('FROM MENSAJE_USUARIO mu JOIN Mensaje m ON m.id_mensaje=mu.id_mensaje LEFT JOIN Pedidos p ON p.id_pedido=m.id_pedido');
export function mapJoinedMessage(row) {
  if (!row) return null;
  return { id_mensaje: row.id_mensaje, contenido: row.contenido, fecha_publicacion: row.fecha_publicacion,
    Asunto: row.Asunto, id_pedido: row.id_pedido, leido: Boolean(Number(row.leido)), oculto: Boolean(Number(row.oculto)),
    pedido: row.relatedId == null ? null : { id_pedido: row.relatedId, numero_nota_venta: row.numero_nota_venta,
      fecha_creacion: row.fecha_creacion, fecha_estimada_termino: row.fecha_estimada_termino } };
}
export function inboxQuery({ userId, status, sort, from, to, page, perPage }) {
  const conditions = [Prisma.sql`mu.id_usuario=${Number(userId)}`];
  if (status === 'read') conditions.push(Prisma.raw('mu.`leido?`=1'));
  if (status === 'unread') conditions.push(Prisma.raw('mu.`leido?`=0'));
  if (from) conditions.push(Prisma.sql`m.fecha_publicacion>=${from}`);
  if (to) conditions.push(Prisma.sql`m.fecha_publicacion<=${to}`);
  const direction = Prisma.raw(sort === 'oldest' ? 'ASC' : 'DESC');
  return Prisma.sql`SELECT ${columns} ${joins} WHERE ${Prisma.join(conditions, ' AND ')}
    ORDER BY m.fecha_publicacion ${direction}, mu.id_mensaje ${direction} LIMIT ${perPage} OFFSET ${(page - 1) * perPage}`;
}
export function detailQuery(userId, messageId) {
  return Prisma.sql`SELECT ${columns} ${joins} WHERE mu.id_usuario=${Number(userId)} AND mu.id_mensaje=${Number(messageId)} LIMIT 1`;
}
export function notificationsQuery(userId, limit, withCount = false) {
  const page = Prisma.sql`SELECT ${columns} ${joins} WHERE mu.id_usuario=${Number(userId)}
    AND ${Prisma.raw('mu.`leido?`=0 AND mu.`oculto?`=0')}
    ORDER BY m.fecha_publicacion DESC, mu.id_mensaje DESC LIMIT ${limit}`;
  if (!withCount) return page;
  // A single statement provides an exact global count even when the page is empty.
  return Prisma.sql`SELECT page.*, totals.unreadCount FROM
    (SELECT COUNT(*) AS unreadCount FROM MENSAJE_USUARIO WHERE id_usuario=${Number(userId)}
      AND ${Prisma.raw('`leido?`=0 AND `oculto?`=0')}) totals
    LEFT JOIN (${page}) page ON TRUE ORDER BY page.fecha_publicacion DESC, page.id_mensaje DESC`;
}

import { readProductFlow } from './productFlow.js';
import { AppError } from '../../../errors/AppError.js';
import { Prisma } from '@prisma/client';
import { ROLES } from '../../../config/roles.js';
import { snapshotData, supportsOrderSnapshots } from './orderSnapshotSchema.js';

export async function getCreationProductContextOperation(repository, name) {
  const productType = await repository.client.tipo_Producto.findFirst({ where: { nombre_producto: name } });
  if (!productType) throw new AppError(500, 'Configuracion inconsistente: tipo de producto ausente.', 'INVALID_PRODUCT_FLOW');
  const steps = await readProductFlow(repository.client, productType.id_tipo_producto);
  return { productType, firstSubprocess: steps[0] };
}

function assertCount(result, expected) {
  if (result.count !== expected) throw new AppError(500, 'No se pudo completar el pedido.');
  return result;
}

export async function createCreationDetailsOperation(repository, orderId, details) {
  if (!orderId) throw new AppError(400, 'El ID del pedido es obligatorio');
  for (const detail of details) {
    if (!detail.id_tipo_producto || detail.cantidad === undefined) {
      throw new AppError(400, 'Faltan datos obligatorios del detalle');
    }
  }
  if (!details.length) return { count: 0 };
  const supported = await supportsOrderSnapshots(repository.client);
  const data = details.map(detail => snapshotData({
    linea_origen: detail.linea_origen ?? null,
    codigo_origen: detail.codigo_origen ?? null,
    producto_origen: detail.producto_origen ?? null,
    familia_origen: detail.familia_origen ?? null,
    subfamilia_origen: detail.subfamilia_origen ?? null,
    id_pedido: Number(orderId), id_tipo_producto: Number(detail.id_tipo_producto),
    cantidad: detail.cantidad, fecha_estimada_termino: detail.fecha_estimada_termino ?? null,
    fecha_real_termino: detail.fecha_real_termino ?? null,
    id_estado_subproceso: detail.id_estado_subproceso ?? null,
  }, supported));
  // No skipDuplicates: every source line, even repeated, must persist or fail.
  // No generated IDs are inferred; the creation receipt does not require them.
  return assertCount(await repository.client.detalle_pedido.createMany({ data }), data.length);
}

export async function createCreationAccessoriesOperation(repository, orderId, items) {
  if (!items.length) return { count: 0 };
  const data = items.map(item => ({
    id_pedido: Number(orderId), codigo: item.codigo ?? null, producto: item.producto,
    cantidad: item.cantidad ?? null, subfamilia: item.subfamilia ?? null,
  }));
  return assertCount(await repository.client.pedido_Item_Sin_Seguimiento.createMany({ data }), data.length);
}

export const creationRecipientsQuery = () => Prisma.sql`
  SELECT id_usuario, rol_usuario=${ROLES.ADMIN_COBRANZAS} AS collections,
    rol_usuario=${ROLES.ADMINISTRADOR} AS production
  FROM Usuario WHERE rol_usuario IN (${ROLES.ADMIN_COBRANZAS},${ROLES.ADMINISTRADOR})
    AND NOT (estado_usuario=${'Desvinculado'})`;

export async function notifyCreatedOrderOperation(repository, { orderId, numeroNota }) {
  const groups = [
    { flag: 'collections', subject: 'Nuevo pedido pendiente de confirmación de pago', content: `Se registró el pedido ${numeroNota}. Está pendiente de confirmación de pago.` },
    { flag: 'production', subject: 'Pedido pendiente de programacion', content: `Se registro el pedido ${numeroNota}. Debe asignarse una fecha habil en el calendario de produccion.` },
  ];
  // Evaluate role equality in MySQL, preserving its collation and NULL behavior.
  const users = await repository.client.$queryRaw(creationRecipientsQuery());
  const assignments = [];
  for (const group of groups) {
    const recipients = users.filter(user => Boolean(Number(user[group.flag])));
    if (!recipients.length) continue;
    const message = await repository.client.mensaje.create({ data: {
      id_pedido: Number(orderId), fecha_publicacion: new Date(), Asunto: group.subject, contenido: group.content,
    } });
    for (const user of recipients) assignments.push({ id_usuario: user.id_usuario, id_mensaje: message.id_mensaje, leido_: false, oculto_: false });
  }
  if (assignments.length) await repository.client.mENSAJE_USUARIO.createMany({ data: assignments, skipDuplicates: true });
}

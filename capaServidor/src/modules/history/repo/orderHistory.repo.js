import getPrismaClient from "../../../database/prisma.js";
import { orderListQuery, orderHeaderQuery, orderChildrenQuery } from './historyRead.repo.js';

const CALENDARIZATION_DESCRIPTION_PREFIX = "Fecha de termino definida para ";

const EVENT_TYPE_SQL = Object.freeze({
    all: "",
    stage: "AND re.id_registro IS NOT NULL",
    payment: "AND rp.id_registro IS NOT NULL",
    subprocess: "AND rs.id_registro IS NOT NULL",
    calendar: "AND re.id_registro IS NULL AND rp.id_registro IS NULL AND rs.id_registro IS NULL AND r.observacion LIKE ?",
    general: "AND re.id_registro IS NULL AND rp.id_registro IS NULL AND rs.id_registro IS NULL AND (r.observacion IS NULL OR r.observacion NOT LIKE ?)",
});

function nullableNumber(value) {
    return value === null || value === undefined ? null : Number(value);
}

function mapOrderHeader(row, trackedItems, untrackedItems, labels) {
    if (!row) return null;
    return {
        id_pedido: Number(row.id_pedido),
        numero_nota_venta: row.numero_nota_venta,
        fecha_creacion: row.fecha_creacion,
        fecha_estimada_termino: row.fecha_estimada_termino,
        Cliente: row.nombre_cliente === null && row.razon_social === null ? null : {
            nombre_cliente: row.nombre_cliente,
            razon_social: row.razon_social,
        },
        Usuario: row.id_usuario === null ? null : {
            id_usuario: Number(row.id_usuario),
            nombre_usuario: row.nombre_usuario,
            apellido_usuario: row.apellido_usuario,
        },
        Estado_Pedido: row.nombre_etapa === null ? null : { nombre_etapa: row.nombre_etapa },
        Estado_Pago: row.nombre_estado_pago === null ? null : { nombre_estado_pago: row.nombre_estado_pago },
        Detalle_pedido: trackedItems.map((item) => ({
            id_detalle_pedido: Number(item.id_detalle_pedido),
            cantidad: nullableNumber(item.cantidad),
            fecha_estimada_termino: item.fecha_estimada_termino,
            fecha_real_termino: item.fecha_real_termino,
            Tipo_Producto: item.nombre_producto === null ? null : { nombre_producto: item.nombre_producto },
            Estado_Subprocesos: item.nombre_estado === null ? null : { nombre_estado: item.nombre_estado },
        })),
        Pedido_Item_Sin_Seguimiento: untrackedItems.map((item) => ({
            id_item_sin_seguimiento: Number(item.id_item_sin_seguimiento),
            producto: item.producto,
            cantidad: nullableNumber(item.cantidad),
        })),
        Pedido_Etiqueta: labels.map((item) => ({
            etiqueta: { nombre_etiqueta: item.nombre_etiqueta },
        })),
    };
}

function mapEventRow(row) {
    return {
        ID_REGISTRO: Number(row.ID_REGISTRO),
        FECHA_HORA: row.FECHA_HORA,
        id_usuario: nullableNumber(row.id_usuario_visible),
        observacion: row.observacion_visible,
        Usuario: row.id_usuario_visible === null ? null : {
            nombre_usuario: row.nombre_usuario_visible,
            apellido_usuario: row.apellido_usuario_visible,
        },
        Registro_Etapas: row.stage_record_id === null ? null : {
            fecha_hora_entrada: row.stage_entered_at,
            fecha_hora_salida: row.stage_exited_at,
            Estado_Pedido: row.stage_name === null ? null : { nombre_etapa: row.stage_name },
        },
        Registro_Pago: row.payment_record_id === null ? null : {
            observacion: row.payment_observation,
            Estado_Pago_Registro_Pago_id_estado_pago_anteriorToEstado_Pago:
                row.previous_payment_status === null ? null : { nombre_estado_pago: row.previous_payment_status },
            Estado_Pago_Registro_Pago_id_estado_pago_nuevoToEstado_Pago:
                row.next_payment_status === null ? null : { nombre_estado_pago: row.next_payment_status },
        },
        registro_subprocesos: row.subprocess_record_id === null ? null : {
            fecha_hora_entrada: row.subprocess_entered_at,
            fecha_hora_salida: row.subprocess_exited_at,
            Estado_Subprocesos: row.subprocess_name === null ? null : { nombre_estado: row.subprocess_name },
            Detalle_pedido: row.product_name === null ? null : {
                Tipo_Producto: { nombre_producto: row.product_name },
            },
        },
    };
}

export default class OrderHistoryRepository {
    constructor({ prisma } = {}) {
        this.prisma = prisma;
    }

    get client() {
        if (!this.prisma) this.prisma = getPrismaClient();
        return this.prisma;
    }

    async list({ status, search, dateRange, cursor, limit }) {
        const rows = await this.client.$queryRaw(orderListQuery({ status, search, dateRange, cursor, limit }));
        return rows.map(row => ({
            id_pedido: Number(row.id_pedido),
            numero_nota_venta: row.numero_nota_venta,
            fecha_creacion: row.fecha_creacion,
            Cliente: row.relatedClient == null ? null : { nombre_cliente: row.nombre_cliente, razon_social: row.razon_social },
            Estado_Pedido: row.id_estado_pedido == null ? null : {
                id_estado_pedido: Number(row.id_estado_pedido), nombre_etapa: row.nombre_etapa, orden_kanban: row.orden_kanban,
            },
        }));
    }

    async getById(orderId) {
        const id = Number(orderId);
        const [headers, children] = await Promise.all([
            this.client.$queryRaw(orderHeaderQuery(id)),
            this.client.$queryRaw(orderChildrenQuery(id)),
        ]);
        const trackedItems = [], untrackedItems = [], labels = [];
        for (const item of children) {
            if (Number(item.kind) === 0) trackedItems.push(item);
            else if (Number(item.kind) === 1) untrackedItems.push(item);
            else labels.push(item);
        }
        return mapOrderHeader(headers[0], trackedItems, untrackedItems, labels);
    }

    async listEvents({ orderId, type, cursor, limit, includePaymentDetails = false }) {
        if (!Object.hasOwn(EVENT_TYPE_SQL, type)) {
            throw new TypeError("Tipo de evento de historial desconocido.");
        }
        const typeSql = EVENT_TYPE_SQL[type];
        const cursorSql = cursor
            ? "AND (r.FECHA_HORA < ? OR (r.FECHA_HORA = ? AND r.ID_REGISTRO < ?))"
            : "";
        const query = `
            SELECT r.ID_REGISTRO, r.FECHA_HORA,
                   CASE WHEN rp.id_registro IS NOT NULL AND ? = 0 THEN NULL ELSE r.id_usuario END AS id_usuario_visible,
                   CASE WHEN rp.id_registro IS NOT NULL AND ? = 0 THEN NULL ELSE r.observacion END AS observacion_visible,
                   CASE WHEN rp.id_registro IS NOT NULL AND ? = 0 THEN NULL ELSE u.nombre_usuario END AS nombre_usuario_visible,
                   CASE WHEN rp.id_registro IS NOT NULL AND ? = 0 THEN NULL ELSE u.apellido_usuario END AS apellido_usuario_visible,
                   re.id_registro AS stage_record_id, re.fecha_hora_entrada AS stage_entered_at,
                   re.fecha_hora_salida AS stage_exited_at, stage.nombre_etapa AS stage_name,
                   rp.id_registro AS payment_record_id,
                   CASE WHEN ? = 1 THEN rp.observacion ELSE NULL END AS payment_observation,
                   previous_payment.nombre_estado_pago AS previous_payment_status,
                   next_payment.nombre_estado_pago AS next_payment_status,
                   rs.id_registro AS subprocess_record_id,
                   rs.fecha_hora_entrada AS subprocess_entered_at,
                   rs.fecha_hora_salida AS subprocess_exited_at,
                   subprocess.nombre_estado AS subprocess_name,
                   product.nombre_producto AS product_name
            FROM Registros r
            LEFT JOIN Usuario u ON u.id_usuario = r.id_usuario
            LEFT JOIN Registro_Etapas re ON re.id_registro = r.ID_REGISTRO
            LEFT JOIN Estado_Pedido stage ON stage.id_estado_pedido = re.id_estado_pedido
            LEFT JOIN Registro_Pago rp ON rp.id_registro = r.ID_REGISTRO
            LEFT JOIN Estado_Pago previous_payment ON previous_payment.id_estado_pago = rp.id_estado_pago_anterior
            LEFT JOIN Estado_Pago next_payment ON next_payment.id_estado_pago = rp.id_estado_pago_nuevo
            LEFT JOIN registro_subprocesos rs ON rs.id_registro = r.ID_REGISTRO
            LEFT JOIN Estado_Subprocesos subprocess ON subprocess.id_estado_subproceso = rs.id_estado_subproceso
            LEFT JOIN Detalle_pedido detail ON detail.id_detalle_pedido = rs.id_detalle_pedido
            LEFT JOIN Tipo_Producto product ON product.id_tipo_producto = detail.id_tipo_producto
            WHERE r.id_pedido = ?
            ${typeSql}
            ${cursorSql}
            ORDER BY r.FECHA_HORA DESC, r.ID_REGISTRO DESC
            LIMIT ?
        `;
        const paymentFlag = includePaymentDetails ? 1 : 0;
        const parameters = [paymentFlag, paymentFlag, paymentFlag, paymentFlag, paymentFlag, Number(orderId)];
        if (type === "calendar" || type === "general") {
            parameters.push(`${CALENDARIZATION_DESCRIPTION_PREFIX}%`);
        }
        if (cursor) parameters.push(cursor.occurredAt, cursor.occurredAt, cursor.id);
        parameters.push(limit + 1);
        const rows = await this.client.$queryRawUnsafe(query, ...parameters);
        return rows.map(mapEventRow);
    }
}

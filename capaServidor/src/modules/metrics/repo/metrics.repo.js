import getPrismaClient from "../../../database/prisma.js";
import { productionQuery, stagesQuery, subprocessesQuery, performanceQuery, readReportOrders } from "./metricsRead.repo.js";

export default class MetricsRepository {
    constructor({ prisma } = {}) {
        this.prisma = prisma;
    }

    get client() {
        if (!this.prisma) this.prisma = getPrismaClient();
        return this.prisma;
    }

    async performanceOrders({ start, end }) {
        const rows = await this.client.$queryRaw(performanceQuery({ start, end }));
        return rows.map(row => ({ fecha_estimada_termino: row.fecha_estimada_termino,
            Registros: [{ Registro_Etapas: { fecha_hora_entrada: row.readyAt } }] }));
    }
    async production({ start, end }) {
        const details = await this.client.$queryRaw(productionQuery({ start, end }));

        return details.reduce((totals, detail) => {
            const productType = detail.nombre_producto;
            if (!productType) return totals;

            totals[productType] = (totals[productType] ?? 0) + Number(detail.cantidad ?? 0);
            return totals;
        }, {});
    }

    async dwellTime({ start, end }) {
        const [stages, subprocesses] = await Promise.all([
            this.client.$queryRaw(stagesQuery({ start, end })),
            this.client.$queryRaw(subprocessesQuery({ start, end })),
        ]);
        return {
            stages: this.averageDurations(stages, (item) => item.nombre_etapa),
            subprocesses: this.averageDurations(
                subprocesses,
                (item) => item.nombre_estado,
                (item) => item.nombre_producto,
            ),
        };
    }

    async reportOrders({ start, end }) {
        return readReportOrders(this.client, { start, end });
    }
    averageDurations(items, getName, getProductType = () => null) {
        const grouped = items.reduce((result, item) => {
            const name = getName(item);
            const productType = getProductType(item);
            if (!name || !item.fecha_hora_entrada || !item.fecha_hora_salida) return result;

            const groupKey = `${name}::${productType ?? ""}`;

            const seconds = Math.max(0, Math.round(
                (new Date(item.fecha_hora_salida) - new Date(item.fecha_hora_entrada)) / 1000,
            ));
            const current = result[groupKey] ?? { name, productType, totalSeconds: 0, sampleSize: 0 };
            result[groupKey] = {
                name: current.name,
                productType: current.productType,
                totalSeconds: current.totalSeconds + seconds,
                sampleSize: current.sampleSize + 1,
            };
            return result;
        }, {});

        return Object.values(grouped).map((value) => ({
            name: value.name,
            productType: value.productType,
            averageSeconds: Math.round(value.totalSeconds / value.sampleSize),
            sampleSize: value.sampleSize,
        }));
    }
}

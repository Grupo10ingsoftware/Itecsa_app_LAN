import { PRODUCT_ID, isValidLanyardCapacity } from "../../../../../shared/businessCatalog.js";
import getPrismaClient from "../../../database/prisma.js";

export default class ProductionCapacityRepository {
  constructor({ prisma } = {}) { this.prisma = prisma; }
  get client() { if (!this.prisma) this.prisma = getPrismaClient(); return this.prisma; }
  list() {
    return this.client.tipo_Producto.findMany({
      where: { id_tipo_producto: PRODUCT_ID.LANYARD },
      select: { id_tipo_producto: true, nombre_producto: true, capacidad_diaria: true },
      orderBy: { nombre_producto: "asc" },
    });
  }
  async updateMany(capacities) {
    if (capacities.length !== 1 || capacities[0].id !== PRODUCT_ID.LANYARD || !isValidLanyardCapacity(capacities[0].capacity)) throw new Error("Solo se permite editar la capacidad de Lanyard.");
    await this.client.$transaction(capacities.map(({ id, capacity }) =>
      this.client.tipo_Producto.update({ where: { id_tipo_producto: id }, data: { capacidad_diaria: capacity } })));
    return this.list();
  }
}

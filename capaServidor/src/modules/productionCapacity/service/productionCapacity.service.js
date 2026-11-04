import { PRODUCT_ID, isValidLanyardCapacity } from "../../../../../shared/businessCatalog.js";
import { AppError } from "../../../errors/AppError.js";
import ProductionCapacityRepository from "../repo/productionCapacity.repo.js";

const map = (item) => {
  if (!isValidLanyardCapacity(item.capacidad_diaria)) throw new AppError(500, "Configuracion inconsistente: capacidad de Lanyard invalida.", "INVALID_PRODUCTION_CAPACITY");
  return { id: item.id_tipo_producto, productType: item.nombre_producto, capacity: item.capacidad_diaria };
};

export default class ProductionCapacityService {
  constructor({ repo } = {}) { this.repo = repo ?? new ProductionCapacityRepository(); }
  async list() { return (await this.repo.list()).map(map); }
  async update(capacities) {
    if (!Array.isArray(capacities) || capacities.length === 0) {
      const error = new AppError(400, "Debe ingresar capacidades productivas."); throw error;
    }
    const values = capacities.map(({ id, capacity }) => ({ id: Number(id), capacity: Number(capacity) }));
    if (values.length !== 1 || values.some(({ id, capacity }) => id !== PRODUCT_ID.LANYARD || !isValidLanyardCapacity(capacity))) {
      const error = new AppError(400, "La capacidad de Lanyard debe ser un entero entre 1 y 10000."); throw error;
    }
    return (await this.repo.updateMany(values)).map(map);
  }
}

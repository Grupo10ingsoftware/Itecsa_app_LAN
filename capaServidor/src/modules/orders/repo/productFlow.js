import { PRODUCT_FLOW } from '../../../../../shared/businessCatalog.js';
import { AppError } from '../../../errors/AppError.js';

// Validate configuration while retaining the dynamic engine that traverses these rows.
export function assertProductFlow(productId, steps) {
  const expected = PRODUCT_FLOW[productId];
  if (!expected || !Array.isArray(steps) || steps.length !== expected.length ||
      steps.some((step, index) => step.id_estado_subproceso !== expected[index] || step.orden_flujo !== index + 1)) {
    throw new AppError(500, 'Configuracion inconsistente: flujo de producto incompleto o incompatible.', 'INVALID_PRODUCT_FLOW');
  }
  return steps;
}
export async function readProductFlow(client, productId) {
  const steps = await client.producto_Subproceso.findMany({
    where: { id_tipo_producto: Number(productId) }, orderBy: { orden_flujo: 'asc' },
  });
  return assertProductFlow(Number(productId), steps);
}

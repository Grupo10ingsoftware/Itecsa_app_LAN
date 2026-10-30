import { AppError } from '../../../errors/AppError.js';

// These identifiers map to signed MySQL INT columns, not arbitrary JS numbers.
export function paymentId(value) {
  const id = Number(value);
  if (!['string', 'number'].includes(typeof value) || !Number.isInteger(id) || id <= 0 || id > 2147483647) {
    throw new AppError(400, 'El ID de pago o pedido no es valido');
  }
  return id;
}

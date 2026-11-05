import sql from "mssql";
import { AppError } from "../../../errors/AppError.js";
import { getManagerPool, readManagerLookbackDays } from "../../../database/managerConnection.js";
import {
  normalizeSalesNote,
  normalizeSalesNoteNumber,
  resolveProductType,
  validatedRepositoryDTO,
} from "../service/salesNoteSource.service.js";

const LOOKUP_PROCEDURE = "manager.usp_BuscarNotaVentaActual";
const DETAIL_PROCEDURE = "manager.usp_ObtenerNotaVentaProduccion";

function sourceUnavailable(cause) {
  const error = new Error("La fuente de Notas de Venta no esta disponible.", { cause });
  error.statusCode = 503;
  error.code = "SALES_NOTE_SOURCE_UNAVAILABLE";
  return error;
}

function sourceContractInvalid() {
  const error = new Error("La fuente de Notas de Venta no cumple el contrato autorizado.");
  error.statusCode = 502;
  error.code = "SALES_NOTE_SOURCE_CONTRACT_INVALID";
  return error;
}

function positiveBigIntText(value) {
  const normalized = String(value ?? "").trim();
  return /^\d+$/.test(normalized) && BigInt(normalized) > 0n ? normalized : null;
}

function nullableText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function buildSourceRecord(rows, requestedNumber, numReg) {
  if (!Array.isArray(rows) || rows.length === 0) throw sourceContractInvalid();

  const lineIds = new Set();
  const items = rows.map((row) => {
    const rowNumReg = positiveBigIntText(row.NUMREG);
    const rowNumber = normalizeSalesNoteNumber(String(row.NUMNOTA ?? ""));
    const lineId = positiveBigIntText(row.SEQNVDET);
    if (rowNumReg !== numReg || rowNumber !== requestedNumber || !lineId || lineIds.has(lineId)) {
      throw sourceContractInvalid();
    }
    lineIds.add(lineId);

    const item = {
      codigo: nullableText(row.CODIGO),
      producto: nullableText(row.PRODUCTO),
      cantidad: Number(row.CANTIDAD),
      familia: nullableText(row.FAMILIA),
      subfamilia: nullableText(row.SUBFAMILIA),
    };
    return { ...item, importable: Boolean(resolveProductType(item)) };
  });

  const first = rows[0];
  return {
    numeroNota: requestedNumber,
    // NOTV_DB.FECHA identifica la produccion actual; no es una fecha de entrega.
    fechaEntregaTentativaOrigen: null,
    cliente: {
      rut: nullableText(first.RUT),
      nombre: nullableText(first.CLIENTE),
    },
    origen: {
      usuarioManager: nullableText(first.USUARIO_MANAGER),
      tipoNotaVenta: null,
    },
    observaciones: nullableText(first.OBSERVACIONES),
    items,
  };
}

export default class ManagerSalesNoteRepository {
  constructor({
    poolProvider = getManagerPool,
    lookbackDays,
    env = process.env,
    types = sql,
  } = {}) {
    this.poolProvider = poolProvider;
    this.lookbackDays = lookbackDays ?? readManagerLookbackDays(env);
    this.types = types;
  }

  async getByNumber(numeroNota) {
    const normalizedNumber = normalizeSalesNoteNumber(numeroNota);
    const numberValue = positiveBigIntText(normalizedNumber);
    if (!numberValue) {
      throw new AppError(400, "El numero de Nota de Venta no es valido.");
    }

    try {
      const pool = await this.poolProvider();
      const lookup = await pool.request()
        .input("NumeroNota", this.types.BigInt, numberValue)
        .input("DiasAtras", this.types.Int, this.lookbackDays)
        .execute(LOOKUP_PROCEDURE);
      const candidates = lookup?.recordset ?? [];

      if (candidates.length === 0) {
        throw new AppError(404, "Nota de Venta no encontrada.");
      }
      if (candidates.length > 1) {
        throw new AppError(409, "La Nota de Venta tiene mas de una produccion vigente.", "SALES_NOTE_AMBIGUOUS");
      }

      const numReg = positiveBigIntText(candidates[0]?.NUMREG);
      if (!numReg) throw sourceContractInvalid();

      const detail = await pool.request()
        .input("NumReg", this.types.BigInt, numReg)
        .execute(DETAIL_PROCEDURE);
      const record = buildSourceRecord(detail?.recordset, normalizedNumber, numReg);
      return validatedRepositoryDTO(normalizeSalesNote(record));
    } catch (error) {
      if (error instanceof AppError || error?.code === "SALES_NOTE_SOURCE_CONTRACT_INVALID") throw error;
      throw sourceUnavailable(error);
    }
  }
}

export { DETAIL_PROCEDURE, LOOKUP_PROCEDURE, buildSourceRecord };

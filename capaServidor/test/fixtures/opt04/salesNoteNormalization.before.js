// Frozen normalization from 0be21bb, test/benchmark reference only.
export const PRODUCT_TYPE = Object.freeze({
  YOYO: "Yoyo",
  LANYARD: "Lanyard",
  TARJETA: "Tarjeta",
});

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSalesNoteNumber(value) {
  return normalizeText(value).replace(/^NV-\d{4}-/i, "");
}

function normalizeClient(client = {}) {
  return {
    rut: client.rut ?? client.RUT ?? null,
    nombre: client.nombre ?? client.CLIENTE ?? null,
  };
}

function resolveProductType(item = {}) {
  const family = normalizeText(item.familia).toUpperCase();
  const subfamily = normalizeText(item.subfamilia).toUpperCase();

  if (subfamily === "YOYO") return PRODUCT_TYPE.YOYO;
  if (family === "LANYARD" && subfamily === "LANYARD") return PRODUCT_TYPE.LANYARD;
  if (family === "TARJETAS" && subfamily === "TARJETAS") return PRODUCT_TYPE.TARJETA;

  return null;
}

function normalizeProductionItem(item = {}) {
  return {
    codigo: item.codigo ?? null,
    producto: item.producto ?? null,
    cantidad: item.cantidad ?? null,
    familia: item.familia ?? null,
    subfamilia: item.subfamilia ?? null,
    tipoProducto: resolveProductType(item),
  };
}

function normalizeUntrackedItem(item = {}) {
  return {
    codigo: item.codigo ?? null,
    producto: item.producto ?? null,
    cantidad: item.cantidad ?? null,
    subfamilia: item.subfamilia ?? null,
    motivo: item.motivoNoImportable ?? item.motivo ?? "Producto fuera del alcance actual del sistema",
  };
}

function normalizeSalesNote(record) {
  const items = Array.isArray(record.items) ? record.items : [];
  const productionItems = items
    .filter((item) => item.importable === true && resolveProductType(item))
    .map(normalizeProductionItem);
  const untrackedItems = items
    .filter((item) => item.importable !== true || !resolveProductType(item))
    .map(normalizeUntrackedItem);

  return {
    numeroNota: String(record.numeroNota),
    fechaEntregaTentativaOrigen: record.fechaEntregaTentativaOrigen ?? null,
    cliente: normalizeClient(record.cliente),
    origen: {
      usuarioManager: record.origen?.usuarioManager ?? record.usuarioOrigenManager ?? null,
      tipoNotaVenta: record.origen?.tipoNotaVenta ?? record.tipoNotaVentaOrigen ?? null,
    },
    observaciones: record.observaciones ?? null,
    items: productionItems,
    itemsSinSeguimientoProductivo: untrackedItems,
  };
}


export {normalizeSalesNote};

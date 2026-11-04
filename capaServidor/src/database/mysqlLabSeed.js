import { isValidLanyardCapacity, PRODUCT_ID } from "../../../shared/businessCatalog.js";
import { MYSQL_LAB_CATALOG, MYSQL_LAB_CATALOG_DIAGNOSTICS } from "./mysqlLabCatalog.js";

const definitions = [
  { client: "estado_Pago", rows: MYSQL_LAB_CATALOG.paymentStatuses, id: ["id_estado_pago"], identities: [["nombre_estado_pago"]] },
  { client: "estado_Pedido", rows: MYSQL_LAB_CATALOG.orderStatuses, id: ["id_estado_pedido"], identities: [["nombre_etapa"], ["orden_kanban"]] },
  { client: "tipo_Producto", rows: MYSQL_LAB_CATALOG.productTypes, id: ["id_tipo_producto"], identities: [["nombre_producto"]] },
  { client: "etiqueta", rows: MYSQL_LAB_CATALOG.labels, id: ["id_etiqueta"], identities: [["nombre_etiqueta"]] },
  { client: "estado_Subprocesos", rows: MYSQL_LAB_CATALOG.subprocesses, id: ["id_estado_subproceso"], identities: [["nombre_estado"]] },
  { client: "producto_Subproceso", rows: MYSQL_LAB_CATALOG.productSubprocesses, id: ["id_tipo_producto", "id_estado_subproceso"], identities: [] },
];

function sameFields(left, right, fields) {
  return fields.every((field) => Object.is(left?.[field] ?? null, right?.[field] ?? null));
}

function rowLabel(definition, row) {
  return definition.id.map((field) => `${field}=${row[field]}`).join(",");
}

export async function planMysqlLabCatalog(client) {
  const creates = [];
  const conflicts = [];

  for (const definition of definitions) {
    const existing = await client[definition.client].findMany();
    if (definition.client !== "etiqueta") {
      for (const row of existing) {
        if (!definition.rows.some((expected) => sameFields(row, expected, definition.id))) {
          conflicts.push(`${definition.client} inesperado (${rowLabel(definition, row)})`);
        }
      }
    }
    for (const expected of definition.rows) {
      const matches = existing.filter((row) => sameFields(row, expected, definition.id) ||
        definition.identities.some((fields) => sameFields(row, expected, fields)));
      if (matches.length === 0) {
        creates.push({ client: definition.client, data: { ...expected } });
        continue;
      }
      const invariantFields = Object.keys(expected).filter((field) => field !== "capacidad_diaria");
      const invalidCapacity = definition.client === "tipo_Producto"
        && expected.id_tipo_producto === PRODUCT_ID.LANYARD
        && !isValidLanyardCapacity(matches[0]?.capacidad_diaria);
      if (matches.length !== 1 || invalidCapacity || !sameFields(matches[0], expected, invariantFields)) {
        conflicts.push(`${definition.client}(${rowLabel(definition, expected)})`);
      }
    }
  }

  return { creates, conflicts, diagnostics: [...MYSQL_LAB_CATALOG_DIAGNOSTICS] };
}

export async function seedMysqlLabCatalog(prisma) {
  return prisma.$transaction(async (client) => {
    const plan = await planMysqlLabCatalog(client);
    if (plan.conflicts.length) {
      throw new Error(`Catalogos MySQL incompatibles: ${plan.conflicts.join(", ")}.`);
    }
    for (const entry of plan.creates) {
      await client[entry.client].create({ data: entry.data });
    }
    return { created: plan.creates.length, diagnostics: plan.diagnostics };
  });
}

export async function validateMysqlLabCatalog(prisma) {
  const plan = await planMysqlLabCatalog(prisma);
  return {
    valid: plan.creates.length === 0 && plan.conflicts.length === 0,
    missing: plan.creates.map(({ client, data }) => ({ client, data })),
    conflicts: plan.conflicts,
    diagnostics: plan.diagnostics,
  };
}

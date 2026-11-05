import test from "node:test";
import assert from "node:assert/strict";
import ManagerSalesNoteRepository, {
  DETAIL_PROCEDURE,
  LOOKUP_PROCEDURE,
} from "../src/modules/orders/repo/managerSalesNote.repo.js";
import { createSalesNoteSource } from "../src/modules/orders/service/salesNoteSourceFactory.js";

const types = { BigInt: Symbol("BigInt"), Int: Symbol("Int") };

function poolWith(recordsets) {
  const calls = [];
  return {
    calls,
    request() {
      const inputs = [];
      return {
        input(name, type, value) {
          inputs.push({ name, type, value });
          return this;
        },
        async execute(procedure) {
          calls.push({ procedure, inputs });
          return { recordset: recordsets[procedure] ?? [] };
        },
      };
    },
  };
}

function detailRow(extra = {}) {
  return {
    NUMREG: "1014237",
    NUMNOTA: "44902",
    FECHA_NOTA: new Date("2026-10-30T00:00:00Z"),
    USUARIO_MANAGER: "DAC",
    OBSERVACIONES: "Pedido de prueba",
    RUT: "77125642-2",
    CLIENTE: "Cliente de prueba",
    SEQNVDET: "152515",
    CODIGO: "LAN-01",
    PRODUCTO: "Lanyard corporativo",
    CANTIDAD: 100,
    FAMILIA: "LANYARD",
    SUBFAMILIA: "LANYARD",
    ...extra,
  };
}

test("Manager source resolves NUMREG first and maps productive details without FECHENTR", async () => {
  const pool = poolWith({
    [LOOKUP_PROCEDURE]: [{ NUMREG: "1014237", NUMNOTA: "44902", FECHA_NOTA: new Date() }],
    [DETAIL_PROCEDURE]: [detailRow()],
  });
  const repository = new ManagerSalesNoteRepository({
    poolProvider: async () => pool,
    lookbackDays: 5,
    types,
  });

  const note = await repository.getByNumber("NV-2026-44902");
  assert.equal(note.numeroNota, "44902");
  assert.equal(note.fechaEntregaTentativaOrigen, null);
  assert.deepEqual(note.cliente, { rut: "77125642-2", nombre: "Cliente de prueba" });
  assert.equal(note.items.length, 1);
  assert.equal(note.items[0].tipoProducto, "Lanyard");
  assert.equal(note.items[0].cantidad, 100);
  assert.equal(note.itemsSinSeguimientoProductivo.length, 0);
  assert.deepEqual(pool.calls.map((call) => call.procedure), [LOOKUP_PROCEDURE, DETAIL_PROCEDURE]);
  assert.deepEqual(pool.calls[0].inputs.map(({ name, value }) => [name, value]), [
    ["NumeroNota", "44902"],
    ["DiasAtras", 5],
  ]);
  assert.deepEqual(pool.calls[1].inputs.map(({ name, value }) => [name, value]), [["NumReg", "1014237"]]);
});

test("Manager source returns safe not-found and ambiguity errors before the detail call", async () => {
  for (const [candidates, statusCode, code] of [
    [[], 404, "NOT_FOUND"],
    [[{ NUMREG: "1" }, { NUMREG: "2" }], 409, "SALES_NOTE_AMBIGUOUS"],
  ]) {
    const pool = poolWith({ [LOOKUP_PROCEDURE]: candidates });
    const repository = new ManagerSalesNoteRepository({ poolProvider: async () => pool, lookbackDays: 5, types });
    await assert.rejects(repository.getByNumber("44902"), { statusCode, code });
    assert.equal(pool.calls.length, 1);
  }
});

test("Manager source hides driver failures behind the existing unavailable contract", async () => {
  const repository = new ManagerSalesNoteRepository({
    poolProvider: async () => { throw new Error("server=private;password=private"); },
    lookbackDays: 5,
    types,
  });
  await assert.rejects(repository.getByNumber("44902"), (error) =>
    error.statusCode === 503 && error.code === "SALES_NOTE_SOURCE_UNAVAILABLE" &&
    !error.message.includes("private"));
});

test("Sales-note factory switches explicitly between fixture, Manager and unavailable", () => {
  const manager = { getByNumber() {} };
  assert.equal(createSalesNoteSource({ env: { SALES_NOTE_SOURCE: "manager" }, managerRepository: manager }), manager);
  assert.equal(createSalesNoteSource({ env: { NODE_ENV: "test", SALES_NOTE_SOURCE: "fixture" } }).constructor.name,
    "FixtureSalesNoteRepository");
  assert.equal(createSalesNoteSource({ env: { NODE_ENV: "production", SALES_NOTE_SOURCE: "unavailable" } }).constructor.name,
    "UnavailableExternalSalesNoteRepository");
  assert.throws(() => createSalesNoteSource({ env: { SALES_NOTE_SOURCE: "typo" } }),
    /SALES_NOTE_SOURCE no es valido/);
});

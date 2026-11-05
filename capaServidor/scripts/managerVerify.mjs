import { config as loadEnvironment } from "dotenv";
import { disconnectManagerPool } from "../src/database/managerConnection.js";
import ManagerSalesNoteRepository from "../src/modules/orders/repo/managerSalesNote.repo.js";

loadEnvironment(process.env.DOTENV_PATH
  ? { path: process.env.DOTENV_PATH, override: true }
  : undefined);

const numeroNota = String(process.argv[2] ?? "").trim();
if (!numeroNota) {
  console.error("Uso: npm run manager:verify -- <numero-nota>");
  process.exitCode = 1;
} else {
  try {
    const note = await new ManagerSalesNoteRepository().getByNumber(numeroNota);
    console.log(JSON.stringify({
      numeroNota: note.numeroNota,
      itemsProductivos: note.items.length,
      itemsSinSeguimiento: note.itemsSinSeguimientoProductivo.length,
      tiposProducto: [...new Set(note.items.map((item) => item.tipoProducto))],
    }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      code: error?.code ?? "MANAGER_VERIFY_FAILED",
      status: error?.statusCode ?? 500,
      message: error?.message ?? "No fue posible verificar Manager.",
    }));
    process.exitCode = 1;
  } finally {
    await disconnectManagerPool().catch(() => {});
  }
}

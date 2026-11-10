import { AppError } from "../../../errors/AppError.js";
import ProductionLoadRepository from "../repo/productionLoad.repo.js";
import { UserRepository } from "../../users/repo/users.repo.js";

import { normalizeProductionDate } from "./productionDate.js";

function normalizeEntries(entries) {
  if (!Array.isArray(entries)) {
    const error = new AppError(400, "Debe enviar una lista de cargas por detalle.");
    throw error;
  }

  return entries.map((entry) => {
    const detailId = Number(entry?.detailId ?? entry?.id_detalle_pedido);
    const quantity = Number(entry?.quantity ?? entry?.cantidad_dia);
    if (!Number.isInteger(detailId) || detailId <= 0) {
      const error = new AppError(400, "Cada carga debe incluir un detalle valido.");
      throw error;
    }
    if (!Number.isInteger(quantity) || quantity < 0) {
      const error = new AppError(400, "La cantidad diaria debe ser un entero mayor o igual a cero.");
      throw error;
    }
    return {
      detailId,
      quantity,
      observation: typeof entry?.observation === "string" ? entry.observation : entry?.observacion,
    };
  });
}

function summarize(details, capacity) {
  const lanyardsInProduction = details.reduce((total, detail) => total + Number(detail.dailyQuantity ?? 0), 0);
  const percentage = capacity > 0 ? Math.round((lanyardsInProduction / capacity) * 100) : 0;

  return {
    capacity,
    lanyardsInProduction,
    percentage,
  };
}

export default class ProductionLoadService {
  constructor({ repo, userRepo, now = () => new Date() } = {}) {
    this.now = now;
    this.repo = repo ?? new ProductionLoadRepository();
    this.userRepo = userRepo ?? new UserRepository();
  }

  async getDailyLoad({ date } = {}) {
    const dateKey = normalizeProductionDate(date, this.now);
    const capacity = await this.repo.getCapacity();
    const details = await this.repo.listLanyardDetails(dateKey);

    return {
      date: dateKey,
      ...summarize(details, capacity),
      details,
    };
  }

  async saveDailyLoad({ date, entries, identitySubject } = {}) {
    const dateKey = normalizeProductionDate(date, this.now);
    const normalizedEntries = normalizeEntries(entries);
    const user = await this.userRepo.findBySubject(identitySubject);

    if (!user?.idUsuario) {
      const error = new AppError(403, "No existe un usuario interno vinculado a la sesion.");
      throw error;
    }

    await this.repo.updateDailyLoads({
      dateKey,
      entries: normalizedEntries,
      userId: user.idUsuario,
    });

    return this.getDailyLoad({ date: dateKey });
  }
}

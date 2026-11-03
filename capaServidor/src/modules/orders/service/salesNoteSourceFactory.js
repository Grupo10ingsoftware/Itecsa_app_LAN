import {
  FixtureSalesNoteRepository,
  UnavailableExternalSalesNoteRepository,
} from "./salesNoteSource.service.js";
import ManagerSalesNoteRepository from "../repo/managerSalesNote.repo.js";

export function createSalesNoteSource({ env = process.env, managerRepository } = {}) {
  const source = env.SALES_NOTE_SOURCE ?? "unavailable";

  if (source === "fixture") {
    return new FixtureSalesNoteRepository({
      fixtureEnabled: () => (env.NODE_ENV === "development" || env.NODE_ENV === "test") &&
        env.SALES_NOTE_SOURCE === "fixture",
    });
  }
  if (source === "manager") {
    return managerRepository ?? new ManagerSalesNoteRepository({ env });
  }
  if (source === "unavailable") return new UnavailableExternalSalesNoteRepository();
  throw new Error("SALES_NOTE_SOURCE no es valido.");
}

export default createSalesNoteSource;

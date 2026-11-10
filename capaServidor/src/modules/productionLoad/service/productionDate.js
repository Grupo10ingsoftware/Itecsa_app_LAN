import { AppError } from "../../../errors/AppError.js";

export const PRODUCTION_TIME_ZONE = "America/Santiago";
const businessDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: PRODUCTION_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
});

// Production days follow Santiago, independently of the host/container TZ.
// Keep explicit date-only values as calendar dates, without timezone conversion.
export function normalizeProductionDate(value, now = () => new Date()) {
  if (value === undefined || value === null || value === "") {
    const parts = Object.fromEntries(businessDate.formatToParts(now()).map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }
  const text = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new AppError(400, "La fecha debe tener formato YYYY-MM-DD.");
  }
  const [year, month, day] = text.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new AppError(400, "La fecha no es valida.");
  }
  return text;
}

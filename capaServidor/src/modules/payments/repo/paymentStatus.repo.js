import getPrismaClient from "../../../database/prisma.js";

const PAYMENT_STATUS_CACHE_TTL_MS = 5 * 60 * 1000;

class PaymentStatusRepo {
  constructor({ prisma, cacheTtlMs = PAYMENT_STATUS_CACHE_TTL_MS } = {}) {
    this.prisma = prisma;
    this.cacheTtlMs = cacheTtlMs;
    this.cache = null;
    this.pending = null;
  }

  get client() {
    if (!this.prisma) {
      this.prisma = getPrismaClient();
    }

    return this.prisma;
  }

  async get(id) {
    const statusId = Number(id);

    if (
      this.cache &&
      Date.now() - this.cache.createdAt < this.cacheTtlMs
    ) {
      return this.cache.byId.get(statusId) ?? null;
    }

    return this.client.estado_Pago.findUnique({
      where: { id_estado_pago: statusId },
    });
  }

  async getAll() {
    if (
      this.cache &&
      Date.now() - this.cache.createdAt < this.cacheTtlMs
    ) {
      return this.cache.statuses;
    }

    if (this.pending) return this.pending;
    this.pending = this.loadAll();
    try { return await this.pending; }
    finally { this.pending = null; }
  }

  async loadAll() {
    const statuses = await this.client.estado_Pago.findMany({
      orderBy: { id_estado_pago: "asc" },
    });

    this.cache = {
      byId: new Map(
        statuses.map((status) => [Number(status.id_estado_pago), status]),
      ),
      createdAt: Date.now(),
      statuses,
    };

    return statuses;
  }
}

export default PaymentStatusRepo;

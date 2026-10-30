import { AppError } from "../../../errors/AppError.js";
import PaymentStatusRepo from "../repo/paymentStatus.repo.js";
import { paymentId } from './paymentId.js';

class PaymentStatusService {
    constructor({ repo } = {}) {
        this.repo = repo ?? new PaymentStatusRepo();
    }

    async getPaymentStatus(id) {
        const paymentStatus = await this.repo.get(paymentId(id));

        if (!paymentStatus) {
            const error = new AppError(404, "No se encontro el estado de pago solicitado");
            throw error;
        }

        return paymentStatus;
    }

    async getPaymentStatuses() {
        return this.repo.getAll();
    }
}

export default PaymentStatusService;

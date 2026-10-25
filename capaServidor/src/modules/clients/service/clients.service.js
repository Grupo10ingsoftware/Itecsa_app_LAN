import { AppError } from "../../../errors/AppError.js";
import ClientRepo from "../repo/clients.repo.js";
import { isUniqueConstraint } from '../../../database/uniqueConstraint.js';

class ClientService {
  constructor({ repo } = {}) {
    this.repo = repo ?? new ClientRepo();
  }

  async createClient(data) {
    try {
      const { rut_cliente, nombre_cliente, razon_social, estado_cliente } =
        data;

      return await this.repo.create({
        rut_cliente,
        nombre_cliente,
        razon_social,
        estado_cliente,
      });
    } catch (error) {
      throw new Error(
        "Error al crear nuevo cliente - Capa Servicio",
        error.msg,
      );
    }
  }

  async findOrCreateClient(data) {
    const { rut_cliente, nombre_cliente, razon_social, estado_cliente } = data;

    if (!rut_cliente) {
      const error = new AppError(400, "El RUT del cliente es obligatorio");
      throw error;
    }

    const existingClient = await this.repo.getByRut(rut_cliente);

    if (existingClient) return existingClient;

    try {
      return await this.repo.create({
        rut_cliente, nombre_cliente, razon_social,
        estado_cliente: estado_cliente ?? "ACTIVO",
      });
    } catch (error) {
      if (isUniqueConstraint(error, { model: 'Cliente', index: 'rut_cliente_UNIQUE', field: 'rut_cliente' })) {
        // The enclosing transaction rolls back; retry resolves the committed client.
        throw new AppError(409, "El cliente se registro simultaneamente. Actualiza e intenta nuevamente.", 'CLIENT_CREATE_CONFLICT');
      }
      throw error;
    }
  }
  async getClient(id) {
    const client = await this.repo.get(id);
    if (!client) throw new Error("No se encontró el estado de pago solicitado");
    return client;
  }

  async getClientByRut(rutCliente) {
    if (!rutCliente) {
      const error = new AppError(400, "El RUT del cliente es obligatorio");
      throw error;
    }

    const client = await this.repo.getByRut(rutCliente);

    if (!client) {
      const error = new AppError(404, "Cliente no encontrado");
      throw error;
    }

    return client;
  }
}

export default ClientService;

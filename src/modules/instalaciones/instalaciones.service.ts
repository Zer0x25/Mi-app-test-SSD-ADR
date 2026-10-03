import {
  CrearInstalacionInput,
  CrearInstalacionInputSchema,
  InstalacionResponse,
  AsignarOperadorInput,
  AsignarOperadorInputSchema,
  AsignacionResponse,
  InstalacionNotFoundError,
  InstalacionNombreDuplicadoError,
  InstalacionInactivaError,
  AsignacionDuplicadaError,
} from "./instalaciones.schema.js";

export interface InstalacionEntity {
  id: string;
  nombre: string;
  ubicacion: string;
  activa: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AsignacionEntity {
  id: string;
  instalacionId: string;
  usuarioId: string;
  createdAt: Date;
}

export interface IInstalacionesRepository {
  findById(id: string): Promise<InstalacionEntity | null>;
  findByNombre(nombre: string): Promise<InstalacionEntity | null>;
  create(data: Omit<InstalacionEntity, "id" | "createdAt" | "updatedAt">): Promise<InstalacionEntity>;
  update(id: string, data: Partial<InstalacionEntity>): Promise<InstalacionEntity>;
  findAsignacion(instalacionId: string, usuarioId: string): Promise<AsignacionEntity | null>;
  createAsignacion(instalacionId: string, usuarioId: string): Promise<AsignacionEntity>;
  listInstalacionesByOperador(usuarioId: string): Promise<InstalacionEntity[]>;
}

export class InstalacionesService {
  constructor(private readonly repository: IInstalacionesRepository) {}

  async crearInstalacion(rawInput: CrearInstalacionInput): Promise<InstalacionResponse> {
    const input = CrearInstalacionInputSchema.parse(rawInput);

    const existente = await this.repository.findByNombre(input.nombre);
    if (existente) {
      throw new InstalacionNombreDuplicadoError(input.nombre);
    }

    const instalacion = await this.repository.create({
      nombre: input.nombre.trim(),
      ubicacion: input.ubicacion.trim(),
      activa: true,
    });

    return instalacion;
  }

  async obtenerPorId(id: string): Promise<InstalacionResponse> {
    const instalacion = await this.repository.findById(id);
    if (!instalacion) {
      throw new InstalacionNotFoundError(id);
    }
    return instalacion;
  }

  async desactivarInstalacion(id: string): Promise<InstalacionResponse> {
    await this.obtenerPorId(id);
    return await this.repository.update(id, { activa: false });
  }

  async asignarOperador(rawInput: AsignarOperadorInput): Promise<AsignacionResponse> {
    const input = AsignarOperadorInputSchema.parse(rawInput);

    const instalacion = await this.obtenerPorId(input.instalacionId);
    if (!instalacion.activa) {
      throw new InstalacionInactivaError(input.instalacionId);
    }

    const asignacionExistente = await this.repository.findAsignacion(
      input.instalacionId,
      input.usuarioId
    );
    if (asignacionExistente) {
      throw new AsignacionDuplicadaError(input.instalacionId, input.usuarioId);
    }

    return await this.repository.createAsignacion(input.instalacionId, input.usuarioId);
  }

  async listarInstalacionesDeOperador(usuarioId: string): Promise<InstalacionResponse[]> {
    return await this.repository.listInstalacionesByOperador(usuarioId);
  }
}

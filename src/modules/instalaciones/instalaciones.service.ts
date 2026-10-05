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
  direccion?: string;
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
  deleteAsignacion(instalacionId: string, usuarioId: string): Promise<boolean>;
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

    const ubic = (input.ubicacion || input.direccion || "").trim();
    if (!ubic || ubic.length < 3) {
      throw new Error("La ubicación o dirección debe tener al menos 3 caracteres");
    }

    const instalacion = await this.repository.create({
      nombre: input.nombre.trim(),
      ubicacion: ubic,
      activa: true,
    });

    return {
      ...instalacion,
      direccion: instalacion.ubicacion,
    };
  }

  async obtenerPorId(id: string): Promise<InstalacionResponse> {
    const instalacion = await this.repository.findById(id);
    if (!instalacion) {
      throw new InstalacionNotFoundError(id);
    }
    return {
      ...instalacion,
      direccion: instalacion.ubicacion,
    };
  }

  async desactivarInstalacion(id: string): Promise<InstalacionResponse> {
    await this.obtenerPorId(id);
    const updated = await this.repository.update(id, { activa: false });
    return {
      ...updated,
      direccion: updated.ubicacion,
    };
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

  async desasignarOperador(instalacionId: string, usuarioId: string): Promise<void> {
    await this.obtenerPorId(instalacionId);
    await this.repository.deleteAsignacion(instalacionId, usuarioId);
  }

  async listarInstalacionesDeOperador(usuarioId: string): Promise<InstalacionResponse[]> {
    const list = await this.repository.listInstalacionesByOperador(usuarioId);
    return list.map((i) => ({
      ...i,
      direccion: i.ubicacion,
    }));
  }
}

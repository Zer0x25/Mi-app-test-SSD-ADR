import {
  CrearInstalacionInput,
  CrearInstalacionInputSchema,
  EditarInstalacionInput,
  EditarInstalacionInputSchema,
  InstalacionResponse,
  AsignarOperadorInput,
  AsignarOperadorInputSchema,
  AsignacionResponse,
  InstalacionNotFoundError,
  InstalacionNombreDuplicadoError,
  InstalacionCodigoDuplicadoError,
  InstalacionInactivaError,
  AsignacionDuplicadaError,
  PeriodoGraciaExpiradoError,
  EliminacionFisicaProhibidaError,
  InstalacionConMedidoresNoEliminableError,
  InstalacionTieneMedidoresActivosError,
} from "./instalaciones.schema.js";
import { TipoAccionAuditoria } from "../auditoria/auditoria.schema.js";

const DIAS_GRACIA = 30;
const GRACE_PERIOD_MS = DIAS_GRACIA * 24 * 60 * 60 * 1000;

export function calcularPeriodoGracia(createdAt: Date): {
  enPeriodoGracia: boolean;
  diasRestantesGracia: number;
} {
  const diffMs = Date.now() - createdAt.getTime();
  const enPeriodoGracia = diffMs <= GRACE_PERIOD_MS;
  const diasRestantesGracia = enPeriodoGracia
    ? Math.max(0, Math.ceil((createdAt.getTime() + GRACE_PERIOD_MS - Date.now()) / (24 * 60 * 60 * 1000)))
    : 0;
  return { enPeriodoGracia, diasRestantesGracia };
}

export interface InstalacionEntity {
  id: string;
  codigo?: string | null;
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
  findByCodigo?(codigo: string): Promise<InstalacionEntity | null>;
  countMedidores?(instalacionId: string): Promise<number>;
  countMedidoresActivos?(instalacionId: string): Promise<number>;
  create(data: Omit<InstalacionEntity, "id" | "createdAt" | "updatedAt">): Promise<InstalacionEntity>;
  update(id: string, data: Partial<InstalacionEntity>): Promise<InstalacionEntity>;
  deleteFisico?(id: string): Promise<boolean>;
  listAll?(filtros?: { estado?: "activas" | "archivadas" | "todas"; allowedIds?: string[] }): Promise<InstalacionEntity[]>;
  findAsignacion(instalacionId: string, usuarioId: string): Promise<AsignacionEntity | null>;
  createAsignacion(instalacionId: string, usuarioId: string): Promise<AsignacionEntity>;
  deleteAsignacion(instalacionId: string, usuarioId: string): Promise<boolean>;
  listInstalacionesByOperador(usuarioId: string): Promise<InstalacionEntity[]>;
}

export interface IInstalacionesAuditoriaLogger {
  registrarEvento(input: {
    usuarioId?: string | null;
    accion: TipoAccionAuditoria;
    entidad: string;
    entidadId: string;
    detalles?: Record<string, unknown> | null;
    ip?: string | null;
  }): Promise<unknown>;
}

export class InstalacionesService {
  constructor(
    private readonly repository: IInstalacionesRepository,
    private readonly auditoriaLogger?: IInstalacionesAuditoriaLogger
  ) {}

  private mapResponse(instalacion: InstalacionEntity): InstalacionResponse {
    const { enPeriodoGracia, diasRestantesGracia } = calcularPeriodoGracia(instalacion.createdAt);
    return {
      ...instalacion,
      direccion: instalacion.ubicacion,
      enPeriodoGracia,
      diasRestantesGracia,
    };
  }

  async crearInstalacion(rawInput: CrearInstalacionInput): Promise<InstalacionResponse> {
    const input = CrearInstalacionInputSchema.parse(rawInput);

    const existente = await this.repository.findByNombre(input.nombre);
    if (existente) {
      throw new InstalacionNombreDuplicadoError(input.nombre);
    }

    if (input.codigo && this.repository.findByCodigo) {
      const existenteCodigo = await this.repository.findByCodigo(input.codigo);
      if (existenteCodigo) {
        throw new InstalacionCodigoDuplicadoError(input.codigo);
      }
    }

    const ubic = (input.ubicacion || input.direccion || "").trim();
    if (!ubic || ubic.length < 3) {
      throw new Error("La ubicación o dirección debe tener al menos 3 caracteres");
    }

    const instalacion = await this.repository.create({
      codigo: input.codigo ? input.codigo.trim() : null,
      nombre: input.nombre.trim(),
      ubicacion: ubic,
      activa: true,
    });

    return this.mapResponse(instalacion);
  }

  async obtenerPorId(id: string): Promise<InstalacionResponse> {
    const instalacion = await this.repository.findById(id);
    if (!instalacion) {
      throw new InstalacionNotFoundError(id);
    }
    return this.mapResponse(instalacion);
  }

  async editarInstalacion(
    id: string,
    rawInput: EditarInstalacionInput,
    context?: { usuarioId?: string; ip?: string }
  ): Promise<InstalacionResponse> {
    const input = EditarInstalacionInputSchema.parse(rawInput);
    const actual = await this.repository.findById(id);
    if (!actual) {
      throw new InstalacionNotFoundError(id);
    }

    const { enPeriodoGracia } = calcularPeriodoGracia(actual.createdAt);

    // Verificación de código
    if (input.codigo !== undefined && input.codigo !== actual.codigo) {
      if (!enPeriodoGracia) {
        throw new PeriodoGraciaExpiradoError("instalación", id);
      }
      if (this.repository.findByCodigo) {
        const dup = await this.repository.findByCodigo(input.codigo);
        if (dup && dup.id !== id) {
          throw new InstalacionCodigoDuplicadoError(input.codigo);
        }
      }
    }

    // Verificación de nombre
    if (input.nombre !== undefined && input.nombre !== actual.nombre) {
      const dupNombre = await this.repository.findByNombre(input.nombre);
      if (dupNombre && dupNombre.id !== id) {
        throw new InstalacionNombreDuplicadoError(input.nombre);
      }
    }

    const ubic = input.ubicacion || input.direccion;

    const updated = await this.repository.update(id, {
      ...(input.nombre !== undefined && { nombre: input.nombre.trim() }),
      ...(input.codigo !== undefined && { codigo: input.codigo.trim() }),
      ...(ubic !== undefined && { ubicacion: ubic.trim() }),
      ...(input.activa !== undefined && { activa: input.activa }),
    });

    if (this.auditoriaLogger) {
      await this.auditoriaLogger.registrarEvento({
        usuarioId: context?.usuarioId,
        accion: "INSTALACION_EDITADA",
        entidad: "Instalacion",
        entidadId: id,
        detalles: {
          antes: { nombre: actual.nombre, codigo: actual.codigo, ubicacion: actual.ubicacion },
          despues: { nombre: updated.nombre, codigo: updated.codigo, ubicacion: updated.ubicacion },
        },
        ip: context?.ip,
      });
    }

    return this.mapResponse(updated);
  }

  async archivarInstalacion(
    id: string,
    context?: { usuarioId?: string; ip?: string }
  ): Promise<InstalacionResponse> {
    const actual = await this.repository.findById(id);
    if (!actual) {
      throw new InstalacionNotFoundError(id);
    }

    if (this.repository.countMedidoresActivos) {
      const activosCount = await this.repository.countMedidoresActivos(id);
      if (activosCount > 0) {
        throw new InstalacionTieneMedidoresActivosError(id, activosCount);
      }
    }

    const updated = await this.repository.update(id, { activa: false });

    if (this.auditoriaLogger) {
      await this.auditoriaLogger.registrarEvento({
        usuarioId: context?.usuarioId,
        accion: "INSTALACION_ARCHIVADA",
        entidad: "Instalacion",
        entidadId: id,
        detalles: { nombre: actual.nombre, codigo: actual.codigo },
        ip: context?.ip,
      });
    }

    return this.mapResponse(updated);
  }

  async restaurarInstalacion(
    id: string,
    context?: { usuarioId?: string; ip?: string }
  ): Promise<InstalacionResponse> {
    const actual = await this.repository.findById(id);
    if (!actual) {
      throw new InstalacionNotFoundError(id);
    }

    const updated = await this.repository.update(id, { activa: true });

    if (this.auditoriaLogger) {
      await this.auditoriaLogger.registrarEvento({
        usuarioId: context?.usuarioId,
        accion: "INSTALACION_RESTAURADA",
        entidad: "Instalacion",
        entidadId: id,
        detalles: { nombre: actual.nombre, codigo: actual.codigo },
        ip: context?.ip,
      });
    }

    return this.mapResponse(updated);
  }

  async desactivarInstalacion(id: string): Promise<InstalacionResponse> {
    return this.archivarInstalacion(id);
  }

  async eliminarInstalacionFisica(
    id: string,
    context?: { usuarioId?: string; ip?: string }
  ): Promise<boolean> {
    const actual = await this.repository.findById(id);
    if (!actual) {
      throw new InstalacionNotFoundError(id);
    }

    const { enPeriodoGracia } = calcularPeriodoGracia(actual.createdAt);
    if (!enPeriodoGracia) {
      throw new EliminacionFisicaProhibidaError("instalación", id);
    }

    if (this.repository.countMedidores) {
      const medidoresCount = await this.repository.countMedidores(id);
      if (medidoresCount > 0) {
        throw new InstalacionConMedidoresNoEliminableError(id, medidoresCount);
      }
    }

    if (this.auditoriaLogger) {
      await this.auditoriaLogger.registrarEvento({
        usuarioId: context?.usuarioId,
        accion: "INSTALACION_ELIMINADA_GRACIA",
        entidad: "Instalacion",
        entidadId: id,
        detalles: {
          snapshot: {
            id: actual.id,
            nombre: actual.nombre,
            codigo: actual.codigo,
            ubicacion: actual.ubicacion,
            createdAt: actual.createdAt,
          },
        },
        ip: context?.ip,
      });
    }

    if (this.repository.deleteFisico) {
      return await this.repository.deleteFisico(id);
    }
    return true;
  }

  async listarInstalaciones(
    filtros?: { estado?: "activas" | "archivadas" | "todas"; allowedIds?: string[] }
  ): Promise<InstalacionResponse[]> {
    if (this.repository.listAll) {
      const list = await this.repository.listAll(filtros);
      return list.map((i) => this.mapResponse(i));
    }
    return [];
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
    return list.map((i) => this.mapResponse(i));
  }
}

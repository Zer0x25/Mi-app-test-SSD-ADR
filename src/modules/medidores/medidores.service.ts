import {
  CrearTipoMedidorInput,
  CrearTipoMedidorInputSchema,
  TipoMedidorResponse,
  CrearMedidorInput,
  CrearMedidorInputSchema,
  EditarMedidorInput,
  EditarMedidorInputSchema,
  MedidorResponse,
  TipoMedidorNombreDuplicadoError,
  TipoMedidorNotFoundError,
  TipoMedidorInactivoError,
  MedidorNotFoundError,
  MedidorCodigoDuplicadoError,
  PeriodoGraciaExpiradoError,
  EliminacionFisicaProhibidaError,
  MedidorConLecturasNoEliminableError,
  RecursoMedidor,
  UnidadMedida,
  TipoMedicion,
} from "./medidores.schema.js";
import { TipoAccionAuditoria } from "../auditoria/auditoria.schema.js";
import { calcularPeriodoGracia } from "../instalaciones/instalaciones.service.js";

export interface TipoMedidorEntity {
  id: string;
  nombre: string;
  recurso: RecursoMedidor;
  unidad: UnidadMedida;
  unidadMedida?: string;
  tipoMedicion: TipoMedicion;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface MedidorEntity {
  id: string;
  instalacionId: string;
  tipoMedidorId: string;
  codigo: string;
  numeroSerie?: string | null;
  ubicacionInterna: string;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
  tipoMedidor?: TipoMedidorEntity;
  ultimaLectura?: {
    valor: number;
    timestamp: Date;
    fechaLectura?: Date;
    fecha?: Date;
  } | null;
}

export interface IMedidoresRepository {
  findTipoById(id: string): Promise<TipoMedidorEntity | null>;
  findTipoByNombre(nombre: string): Promise<TipoMedidorEntity | null>;
  createTipo(
    data: Omit<TipoMedidorEntity, "id" | "createdAt" | "updatedAt">
  ): Promise<TipoMedidorEntity>;
  listTiposActivos(): Promise<TipoMedidorEntity[]>;

  findMedidorById(id: string): Promise<MedidorEntity | null>;
  findMedidorByCodigo(codigo: string): Promise<MedidorEntity | null>;
  countLecturas?(medidorId: string): Promise<number>;
  createMedidor(
    data: Omit<MedidorEntity, "id" | "createdAt" | "updatedAt">
  ): Promise<MedidorEntity>;
  updateMedidor(id: string, data: Partial<MedidorEntity>): Promise<MedidorEntity>;
  deleteMedidorFisico?(id: string): Promise<boolean>;
  listMedidoresByInstalacion(instalacionId: string, estado?: "activos" | "archivados" | "todos"): Promise<MedidorEntity[]>;
  listMedidores(instalacionIds?: string[], estado?: "activos" | "archivados" | "todos"): Promise<MedidorEntity[]>;
}

export interface IInstalacionesVerificationService {
  verifyInstalacionActiva(id: string): Promise<void>;
}

export interface IMedidoresAuditoriaLogger {
  registrarEvento(input: {
    usuarioId?: string | null;
    accion: TipoAccionAuditoria;
    entidad: string;
    entidadId: string;
    detalles?: Record<string, unknown> | null;
    ip?: string | null;
  }): Promise<unknown>;
}

export class MedidoresService {
  constructor(
    private readonly repository: IMedidoresRepository,
    private readonly instalacionesService: IInstalacionesVerificationService,
    private readonly auditoriaLogger?: IMedidoresAuditoriaLogger
  ) {}

  async crearTipoMedidor(rawInput: CrearTipoMedidorInput): Promise<TipoMedidorResponse> {
    const input = CrearTipoMedidorInputSchema.parse(rawInput);

    const existente = await this.repository.findTipoByNombre(input.nombre);
    if (existente) {
      throw new TipoMedidorNombreDuplicadoError(input.nombre);
    }

    const unidad = (input.unidad || input.unidadMedida) as UnidadMedida;
    if (!unidad) {
      throw new Error("Debe especificar la unidad de medida");
    }

    const tipo = await this.repository.createTipo({
      nombre: input.nombre.trim(),
      recurso: input.recurso,
      unidad,
      tipoMedicion: input.tipoMedicion,
      activo: true,
    });

    return {
      ...tipo,
      unidadMedida: tipo.unidad,
    };
  }

  async listarTiposMedidor(): Promise<TipoMedidorResponse[]> {
    const list = await this.repository.listTiposActivos();
    return list.map((tipo) => ({
      ...tipo,
      unidadMedida: tipo.unidad,
    }));
  }

  async crearMedidor(rawInput: CrearMedidorInput): Promise<MedidorResponse> {
    const input = CrearMedidorInputSchema.parse(rawInput);

    // 1. Verificar existencia y estado activo de la instalación
    await this.instalacionesService.verifyInstalacionActiva(input.instalacionId);

    // 2. Verificar existencia y estado activo del tipo de medidor
    const tipo = await this.repository.findTipoById(input.tipoMedidorId);
    if (!tipo) {
      throw new TipoMedidorNotFoundError(input.tipoMedidorId);
    }
    if (!tipo.activo) {
      throw new TipoMedidorInactivoError(input.tipoMedidorId);
    }

    // 3. Verificar unicidad de código
    const existente = await this.repository.findMedidorByCodigo(input.codigo);
    if (existente) {
      throw new MedidorCodigoDuplicadoError(input.codigo);
    }

    // 4. Crear el medidor
    const creado = await this.repository.createMedidor({
      instalacionId: input.instalacionId,
      tipoMedidorId: input.tipoMedidorId,
      codigo: input.codigo.trim(),
      numeroSerie: input.numeroSerie ? input.numeroSerie.trim() : null,
      ubicacionInterna: input.ubicacionInterna.trim(),
      activo: true,
    });

    return this.mapResponse({
      ...creado,
      tipoMedidor: {
        ...tipo,
        unidadMedida: tipo.unidad,
      },
    });
  }

  private mapResponse(m: MedidorEntity): MedidorResponse {
    const { enPeriodoGracia, diasRestantesGracia } = calcularPeriodoGracia(m.createdAt);
    return {
      ...m,
      enPeriodoGracia,
      diasRestantesGracia,
      tipoMedidor: m.tipoMedidor
        ? {
            ...m.tipoMedidor,
            unidadMedida: m.tipoMedidor.unidad,
          }
        : undefined,
      ultimaLectura: m.ultimaLectura
        ? {
            ...m.ultimaLectura,
            fechaLectura: m.ultimaLectura.timestamp,
            fecha: m.ultimaLectura.timestamp,
          }
        : null,
    };
  }

  async obtenerMedidorPorId(id: string): Promise<MedidorResponse> {
    const medidor = await this.repository.findMedidorById(id);
    if (!medidor) {
      throw new MedidorNotFoundError(id);
    }

    if (!medidor.tipoMedidor) {
      const tipo = await this.repository.findTipoById(medidor.tipoMedidorId);
      if (tipo) {
        medidor.tipoMedidor = {
          ...tipo,
          unidadMedida: tipo.unidad,
        };
      }
    } else {
      medidor.tipoMedidor = {
        ...medidor.tipoMedidor,
        unidadMedida: medidor.tipoMedidor.unidad,
      };
    }

    return this.mapResponse(medidor);
  }

  async editarMedidor(
    id: string,
    rawInput: EditarMedidorInput,
    context?: { usuarioId?: string; ip?: string }
  ): Promise<MedidorResponse> {
    const input = EditarMedidorInputSchema.parse(rawInput);
    const actual = await this.repository.findMedidorById(id);
    if (!actual) {
      throw new MedidorNotFoundError(id);
    }

    const { enPeriodoGracia } = calcularPeriodoGracia(actual.createdAt);

    if (input.codigo !== undefined && input.codigo !== actual.codigo) {
      if (!enPeriodoGracia) {
        throw new PeriodoGraciaExpiradoError("medidor", id);
      }
      const dup = await this.repository.findMedidorByCodigo(input.codigo);
      if (dup && dup.id !== id) {
        throw new MedidorCodigoDuplicadoError(input.codigo);
      }
    }

    const updated = await this.repository.updateMedidor(id, {
      ...(input.codigo !== undefined && { codigo: input.codigo.trim() }),
      ...(input.numeroSerie !== undefined && { numeroSerie: input.numeroSerie }),
      ...(input.ubicacionInterna !== undefined && { ubicacionInterna: input.ubicacionInterna.trim() }),
      ...(input.activo !== undefined && { activo: input.activo }),
    });

    if (this.auditoriaLogger) {
      await this.auditoriaLogger.registrarEvento({
        usuarioId: context?.usuarioId,
        accion: "MEDIDOR_EDITADO",
        entidad: "Medidor",
        entidadId: id,
        detalles: {
          antes: { codigo: actual.codigo, ubicacion: actual.ubicacionInterna, serie: actual.numeroSerie },
          despues: { codigo: updated.codigo, ubicacion: updated.ubicacionInterna, serie: updated.numeroSerie },
        },
        ip: context?.ip,
      });
    }

    return this.mapResponse({
      ...updated,
      tipoMedidor: actual.tipoMedidor,
      ultimaLectura: actual.ultimaLectura,
    });
  }

  async archivarMedidor(
    id: string,
    context?: { usuarioId?: string; ip?: string }
  ): Promise<MedidorResponse> {
    const actual = await this.repository.findMedidorById(id);
    if (!actual) {
      throw new MedidorNotFoundError(id);
    }

    const updated = await this.repository.updateMedidor(id, { activo: false });

    if (this.auditoriaLogger) {
      await this.auditoriaLogger.registrarEvento({
        usuarioId: context?.usuarioId,
        accion: "MEDIDOR_ARCHIVADO",
        entidad: "Medidor",
        entidadId: id,
        detalles: { codigo: actual.codigo },
        ip: context?.ip,
      });
    }

    return this.mapResponse({
      ...updated,
      tipoMedidor: actual.tipoMedidor,
      ultimaLectura: actual.ultimaLectura,
    });
  }

  async restaurarMedidor(
    id: string,
    context?: { usuarioId?: string; ip?: string }
  ): Promise<MedidorResponse> {
    const actual = await this.repository.findMedidorById(id);
    if (!actual) {
      throw new MedidorNotFoundError(id);
    }

    const updated = await this.repository.updateMedidor(id, { activo: true });

    if (this.auditoriaLogger) {
      await this.auditoriaLogger.registrarEvento({
        usuarioId: context?.usuarioId,
        accion: "MEDIDOR_RESTAURADO",
        entidad: "Medidor",
        entidadId: id,
        detalles: { codigo: actual.codigo },
        ip: context?.ip,
      });
    }

    return this.mapResponse({
      ...updated,
      tipoMedidor: actual.tipoMedidor,
      ultimaLectura: actual.ultimaLectura,
    });
  }

  async desactivarMedidor(id: string): Promise<MedidorResponse> {
    return this.archivarMedidor(id);
  }

  async eliminarMedidorFisico(
    id: string,
    context?: { usuarioId?: string; ip?: string }
  ): Promise<boolean> {
    const actual = await this.repository.findMedidorById(id);
    if (!actual) {
      throw new MedidorNotFoundError(id);
    }

    const { enPeriodoGracia } = calcularPeriodoGracia(actual.createdAt);
    if (!enPeriodoGracia) {
      throw new EliminacionFisicaProhibidaError("medidor", id);
    }

    if (this.repository.countLecturas) {
      const lecturasCount = await this.repository.countLecturas(id);
      if (lecturasCount > 0) {
        throw new MedidorConLecturasNoEliminableError(id, lecturasCount);
      }
    }

    if (this.auditoriaLogger) {
      await this.auditoriaLogger.registrarEvento({
        usuarioId: context?.usuarioId,
        accion: "MEDIDOR_ELIMINADO_GRACIA",
        entidad: "Medidor",
        entidadId: id,
        detalles: {
          snapshot: {
            id: actual.id,
            codigo: actual.codigo,
            numeroSerie: actual.numeroSerie,
            ubicacionInterna: actual.ubicacionInterna,
            instalacionId: actual.instalacionId,
            createdAt: actual.createdAt,
          },
        },
        ip: context?.ip,
      });
    }

    if (this.repository.deleteMedidorFisico) {
      return await this.repository.deleteMedidorFisico(id);
    }
    return true;
  }

  async listarMedidoresPorInstalacion(
    instalacionId: string,
    estado?: "activos" | "archivados" | "todos"
  ): Promise<MedidorResponse[]> {
    const list = await this.repository.listMedidoresByInstalacion(instalacionId, estado);
    return list.map((m) => this.mapResponse(m));
  }

  async listarMedidores(
    instalacionIds?: string[],
    estado?: "activos" | "archivados" | "todos"
  ): Promise<MedidorResponse[]> {
    const list = await this.repository.listMedidores(instalacionIds, estado);
    return list.map((m) => this.mapResponse(m));
  }
}

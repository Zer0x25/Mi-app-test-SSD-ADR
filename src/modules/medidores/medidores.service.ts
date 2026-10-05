import {
  CrearTipoMedidorInput,
  CrearTipoMedidorInputSchema,
  TipoMedidorResponse,
  CrearMedidorInput,
  CrearMedidorInputSchema,
  MedidorResponse,
  TipoMedidorNombreDuplicadoError,
  TipoMedidorNotFoundError,
  TipoMedidorInactivoError,
  MedidorNotFoundError,
  MedidorCodigoDuplicadoError,
  RecursoMedidor,
  UnidadMedida,
  TipoMedicion,
} from "./medidores.schema.js";

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
  createMedidor(
    data: Omit<MedidorEntity, "id" | "createdAt" | "updatedAt">
  ): Promise<MedidorEntity>;
  updateMedidor(id: string, data: Partial<MedidorEntity>): Promise<MedidorEntity>;
  listMedidoresByInstalacion(instalacionId: string): Promise<MedidorEntity[]>;
}

export interface IInstalacionesVerificationService {
  verifyInstalacionActiva(id: string): Promise<void>;
}

export class MedidoresService {
  constructor(
    private readonly repository: IMedidoresRepository,
    private readonly instalacionesService: IInstalacionesVerificationService
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

    return {
      ...creado,
      tipoMedidor: {
        ...tipo,
        unidadMedida: tipo.unidad,
      },
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

    if (medidor.ultimaLectura) {
      medidor.ultimaLectura = {
        ...medidor.ultimaLectura,
        fechaLectura: medidor.ultimaLectura.timestamp,
        fecha: medidor.ultimaLectura.timestamp,
      };
    }

    return medidor;
  }

  async desactivarMedidor(id: string): Promise<MedidorResponse> {
    await this.obtenerMedidorPorId(id);
    return await this.repository.updateMedidor(id, { activo: false });
  }

  async listarMedidoresPorInstalacion(instalacionId: string): Promise<MedidorResponse[]> {
    const list = await this.repository.listMedidoresByInstalacion(instalacionId);
    return list.map((m) => ({
      ...m,
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
    }));
  }
}
